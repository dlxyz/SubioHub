package service

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/tidwall/gjson"
)

type DomesticProviderAdapter interface {
	PrepareChatCompletionsBody(cfg *domesticProviderRuntimeConfig, body []byte) ([]byte, error)
	PrepareEmbeddingsBody(cfg *domesticProviderRuntimeConfig, body []byte) ([]byte, error)
	PrepareRerankBody(cfg *domesticProviderRuntimeConfig, body []byte) ([]byte, error)
	ApplyRequestHeaders(req *http.Request, cfg *domesticProviderRuntimeConfig, stream bool)
	ExtractBusinessError(body []byte) *domesticProviderBusinessError
}

type domesticProviderBusinessError struct {
	StatusCode int
	Code       string
	Message    string
}

func newDomesticProviderAdapter(providerType string) DomesticProviderAdapter {
	switch normalizeProviderType(providerType) {
	case ProviderTypeQwen:
		return qwenDomesticProviderAdapter{}
	case ProviderTypeKimi:
		return kimiDomesticProviderAdapter{}
	case ProviderTypeZhipu:
		return zhipuDomesticProviderAdapter{}
	case ProviderTypeDoubao:
		return doubaoDomesticProviderAdapter{}
	case ProviderTypeMiniMax:
		return minimaxDomesticProviderAdapter{}
	default:
		return noopDomesticProviderAdapter{}
	}
}

type noopDomesticProviderAdapter struct{}

func (noopDomesticProviderAdapter) PrepareChatCompletionsBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return body, nil
}

func (noopDomesticProviderAdapter) PrepareEmbeddingsBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return body, nil
}

func (noopDomesticProviderAdapter) PrepareRerankBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return body, nil
}

func (noopDomesticProviderAdapter) ApplyRequestHeaders(_ *http.Request, _ *domesticProviderRuntimeConfig, _ bool) {
}

func (noopDomesticProviderAdapter) ExtractBusinessError(_ []byte) *domesticProviderBusinessError {
	return nil
}

type qwenDomesticProviderAdapter struct{}

func (qwenDomesticProviderAdapter) PrepareChatCompletionsBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}

	stream := false
	if value, ok := payload["stream"].(bool); ok {
		stream = value
	}
	if stream && hasProviderTools(payload["tools"]) {
		// DashScope tool calling is more reliable in buffered mode.
		payload["stream"] = false
		delete(payload, "stream_options")
		stream = false
	}

	// Qwen/DashScope compatible mode prefers provider-specific thinking flags.
	// Keep the request conservative by defaulting non-streaming calls to
	// enable_thinking=false and mapping OpenAI's reasoning_effort to a simple
	// stream-time toggle when possible.
	if _, exists := payload["enable_thinking"]; !exists {
		switch strings.ToLower(strings.TrimSpace(extractJSONString(payload["reasoning_effort"]))) {
		case "none":
			payload["enable_thinking"] = false
		case "low", "medium", "high", "xhigh":
			if stream {
				payload["enable_thinking"] = true
			} else {
				payload["enable_thinking"] = false
			}
		default:
			if !stream {
				payload["enable_thinking"] = false
			}
		}
	}
	delete(payload, "reasoning_effort")

	return json.Marshal(payload)
}

func (qwenDomesticProviderAdapter) PrepareEmbeddingsBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return prepareEmbeddingsJSONBody(body, func(payload map[string]any) {
		deleteProviderPayloadKeys(payload,
			"messages", "stream", "stream_options", "tools", "tool_choice",
			"reasoning_effort", "enable_thinking", "thinking", "max_tokens",
			"max_completion_tokens", "temperature", "top_p", "n",
			"presence_penalty", "frequency_penalty")
		if value, ok := extractJSONNumber(payload["dimensions"]); ok && value <= 0 {
			delete(payload, "dimensions")
		}
		if strings.TrimSpace(extractJSONString(payload["encoding_format"])) == "" {
			delete(payload, "encoding_format")
		}
	})
}

func (qwenDomesticProviderAdapter) PrepareRerankBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return prepareRerankJSONBody(body, func(payload map[string]any) {
		deleteProviderPayloadKeys(payload,
			"messages", "stream", "stream_options", "tools", "tool_choice",
			"reasoning_effort", "enable_thinking", "thinking", "input")
		if value, ok := extractJSONNumber(payload["top_n"]); ok && value <= 0 {
			delete(payload, "top_n")
		}
		deleteProviderPayloadKeys(payload, "max_chunk_per_doc", "overlap_tokens")
	})
}

func (qwenDomesticProviderAdapter) ApplyRequestHeaders(req *http.Request, _ *domesticProviderRuntimeConfig, stream bool) {
	if req == nil || !stream {
		return
	}
	// Migrated from new-api Ali adaptor: DashScope streaming needs this header.
	req.Header.Set("X-DashScope-SSE", "enable")
}

func (qwenDomesticProviderAdapter) ExtractBusinessError(_ []byte) *domesticProviderBusinessError {
	return nil
}

type kimiDomesticProviderAdapter struct{}

func (kimiDomesticProviderAdapter) PrepareChatCompletionsBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}

	normalizeKimiMessages(payload["messages"])
	thinking := ensureJSONObject(payload, "thinking")
	reasoningEffort := strings.ToLower(strings.TrimSpace(extractJSONString(payload["reasoning_effort"])))

	switch reasoningEffort {
	case "none":
		thinking["type"] = "disabled"
	case "low", "medium", "high", "xhigh":
		if extractJSONString(thinking["type"]) == "" {
			thinking["type"] = "enabled"
		}
	}
	delete(payload, "reasoning_effort")

	if kimiHasHistoricalReasoningContent(payload["messages"]) {
		if extractJSONString(thinking["type"]) == "" {
			thinking["type"] = "enabled"
		}
		thinking["keep"] = "all"
	}
	if len(thinking) == 0 {
		delete(payload, "thinking")
	}

	return json.Marshal(payload)
}

func (kimiDomesticProviderAdapter) PrepareEmbeddingsBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return prepareEmbeddingsJSONBody(body, func(payload map[string]any) {
		sanitizeOpenAICompatibleEmbeddingsPayload(payload)
	})
}

func (kimiDomesticProviderAdapter) PrepareRerankBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return prepareRerankJSONBody(body, func(payload map[string]any) {
		sanitizeOpenAICompatibleRerankPayload(payload)
	})
}

func (kimiDomesticProviderAdapter) ApplyRequestHeaders(_ *http.Request, _ *domesticProviderRuntimeConfig, _ bool) {
}

func (kimiDomesticProviderAdapter) ExtractBusinessError(_ []byte) *domesticProviderBusinessError {
	return nil
}

type zhipuDomesticProviderAdapter struct{}

func (zhipuDomesticProviderAdapter) PrepareChatCompletionsBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}

	// Migrated from new-api zhipu adaptor behavior: top_p should stay below 1.
	if value, ok := extractJSONNumber(payload["top_p"]); ok && value >= 1 {
		payload["top_p"] = 0.99
	}

	return json.Marshal(payload)
}

func (zhipuDomesticProviderAdapter) PrepareEmbeddingsBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return prepareEmbeddingsJSONBody(body, func(payload map[string]any) {
		sanitizeOpenAICompatibleEmbeddingsPayload(payload)
	})
}

func (zhipuDomesticProviderAdapter) PrepareRerankBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return prepareRerankJSONBody(body, func(payload map[string]any) {
		sanitizeOpenAICompatibleRerankPayload(payload)
	})
}

func (zhipuDomesticProviderAdapter) ApplyRequestHeaders(_ *http.Request, _ *domesticProviderRuntimeConfig, _ bool) {
}

func (zhipuDomesticProviderAdapter) ExtractBusinessError(_ []byte) *domesticProviderBusinessError {
	return nil
}

type minimaxDomesticProviderAdapter struct{}

func (minimaxDomesticProviderAdapter) PrepareChatCompletionsBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}

	// MiniMax legacy and OpenAI-compatible chat endpoints both prefer
	// max_completion_tokens and reject temperature/top_p values <= 0.
	if _, exists := payload["max_completion_tokens"]; !exists {
		if maxTokens, ok := payload["max_tokens"]; ok {
			payload["max_completion_tokens"] = maxTokens
		}
	}
	if value, ok := extractJSONNumber(payload["temperature"]); ok && value <= 0 {
		delete(payload, "temperature")
	}
	if value, ok := extractJSONNumber(payload["top_p"]); ok && value <= 0 {
		delete(payload, "top_p")
	}
	if value, ok := extractJSONNumber(payload["n"]); ok && value != 1 {
		payload["n"] = 1
	}

	return json.Marshal(payload)
}

func (minimaxDomesticProviderAdapter) PrepareEmbeddingsBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return prepareEmbeddingsJSONBody(body, func(payload map[string]any) {
		sanitizeOpenAICompatibleEmbeddingsPayload(payload)
		deleteProviderPayloadKeys(payload, "dimensions", "encoding_format")
		minimaxNormalizeEmbeddingsPayload(payload)
	})
}

func (minimaxDomesticProviderAdapter) PrepareRerankBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return prepareRerankJSONBody(body, func(payload map[string]any) {
		sanitizeOpenAICompatibleRerankPayload(payload)
	})
}

func (minimaxDomesticProviderAdapter) ApplyRequestHeaders(_ *http.Request, _ *domesticProviderRuntimeConfig, _ bool) {
}

func (minimaxDomesticProviderAdapter) ExtractBusinessError(body []byte) *domesticProviderBusinessError {
	codeRaw := strings.TrimSpace(gjson.GetBytes(body, "base_resp.status_code").String())
	if codeRaw == "" || codeRaw == "0" {
		return nil
	}

	message := strings.TrimSpace(extractDomesticUpstreamErrorMessage(ProviderTypeMiniMax, body))
	if message == "" {
		message = "Upstream request failed"
	}
	statusCode := mapMiniMaxBusinessStatusCode(codeRaw, message)
	if mapped := matchDomesticProviderError(ProviderTypeMiniMax, statusCode, codeRaw, codeRaw, message); mapped != nil {
		return mapped
	}
	return &domesticProviderBusinessError{
		StatusCode: statusCode,
		Code:       normalizeResponsesErrorCode(statusCode, codeRaw, codeRaw, message),
		Message:    message,
	}
}

type doubaoDomesticProviderAdapter struct{}

func (doubaoDomesticProviderAdapter) PrepareChatCompletionsBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return body, nil
}

func (doubaoDomesticProviderAdapter) PrepareEmbeddingsBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return prepareEmbeddingsJSONBody(body, func(payload map[string]any) {
		sanitizeOpenAICompatibleEmbeddingsPayload(payload)
		doubaoNormalizeEmbeddingsPayload(payload)
	})
}

func (doubaoDomesticProviderAdapter) PrepareRerankBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return prepareRerankJSONBody(body, func(payload map[string]any) {
		sanitizeOpenAICompatibleRerankPayload(payload)
	})
}

func (doubaoDomesticProviderAdapter) ApplyRequestHeaders(_ *http.Request, _ *domesticProviderRuntimeConfig, _ bool) {
}

func (doubaoDomesticProviderAdapter) ExtractBusinessError(_ []byte) *domesticProviderBusinessError {
	return nil
}

func doubaoNormalizeEmbeddingsPayload(payload map[string]any) {
	if payload == nil {
		return
	}
	if !isDoubaoMultimodalEmbeddingsModel(extractJSONString(payload["model"])) {
		return
	}
	payload["input"] = doubaoNormalizeMultimodalEmbeddingInput(payload["input"])
}

func isDoubaoMultimodalEmbeddingsModel(model string) bool {
	model = strings.ToLower(strings.TrimSpace(model))
	return strings.HasPrefix(model, "doubao-embedding-vision")
}

func doubaoNormalizeMultimodalEmbeddingInput(input any) any {
	switch value := input.(type) {
	case string:
		text := strings.TrimSpace(value)
		if text == "" {
			return []any{}
		}
		return []map[string]any{{"type": "text", "text": text}}
	case []any:
		items := make([]any, 0, len(value))
		for _, item := range value {
			items = append(items, doubaoNormalizeMultimodalEmbeddingItem(item))
		}
		return items
	default:
		return input
	}
}

func doubaoNormalizeMultimodalEmbeddingItem(item any) any {
	switch value := item.(type) {
	case string:
		return map[string]any{"type": "text", "text": value}
	case map[string]any:
		itemType := strings.ToLower(strings.TrimSpace(extractJSONString(value["type"])))
		switch itemType {
		case "", "text", "input_text":
			if text := strings.TrimSpace(extractJSONString(value["text"])); text != "" {
				return map[string]any{"type": "text", "text": text}
			}
		case "image_url", "input_image":
			if imageURL := doubaoNormalizeMediaURL(value["image_url"], value["url"]); imageURL != nil {
				return map[string]any{"type": "image_url", "image_url": imageURL}
			}
		case "video_url", "input_video":
			if videoURL := doubaoNormalizeMediaURL(value["video_url"], value["url"]); videoURL != nil {
				return map[string]any{"type": "video_url", "video_url": videoURL}
			}
		}
	}
	return item
}

func doubaoNormalizeMediaURL(primary any, fallback any) map[string]any {
	switch value := primary.(type) {
	case string:
		if strings.TrimSpace(value) != "" {
			return map[string]any{"url": value}
		}
	case map[string]any:
		if url := strings.TrimSpace(extractJSONString(value["url"])); url != "" {
			return map[string]any{"url": url}
		}
	}
	if value, ok := fallback.(string); ok && strings.TrimSpace(value) != "" {
		return map[string]any{"url": value}
	}
	return nil
}

func extractJSONNumber(value any) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, true
	case json.Number:
		number, err := v.Float64()
		if err != nil {
			return 0, false
		}
		return number, true
	default:
		return 0, false
	}
}

func extractJSONString(value any) string {
	switch v := value.(type) {
	case string:
		return v
	default:
		return ""
	}
}

func hasProviderTools(value any) bool {
	switch v := value.(type) {
	case []any:
		return len(v) > 0
	case []map[string]any:
		return len(v) > 0
	default:
		return false
	}
}

func prepareEmbeddingsJSONBody(body []byte, mutate func(payload map[string]any)) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	if mutate != nil {
		mutate(payload)
	}
	return json.Marshal(payload)
}

func prepareRerankJSONBody(body []byte, mutate func(payload map[string]any)) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	if mutate != nil {
		mutate(payload)
	}
	return json.Marshal(payload)
}

func deleteProviderPayloadKeys(payload map[string]any, keys ...string) {
	if payload == nil {
		return
	}
	for _, key := range keys {
		delete(payload, key)
	}
}

func sanitizeOpenAICompatibleEmbeddingsPayload(payload map[string]any) {
	deleteProviderPayloadKeys(payload,
		"messages", "stream", "stream_options", "tools", "tool_choice",
		"reasoning_effort", "enable_thinking", "thinking", "max_tokens",
		"max_completion_tokens", "temperature", "top_p", "n",
		"presence_penalty", "frequency_penalty")
	if value, ok := extractJSONNumber(payload["dimensions"]); ok && value <= 0 {
		delete(payload, "dimensions")
	}
	if strings.TrimSpace(extractJSONString(payload["encoding_format"])) == "" {
		delete(payload, "encoding_format")
	}
}

func sanitizeOpenAICompatibleRerankPayload(payload map[string]any) {
	deleteProviderPayloadKeys(payload,
		"messages", "stream", "stream_options", "tools", "tool_choice",
		"reasoning_effort", "enable_thinking", "thinking", "input",
		"max_tokens", "max_completion_tokens", "temperature", "top_p",
		"presence_penalty", "frequency_penalty")
	if value, ok := extractJSONNumber(payload["top_n"]); ok && value <= 0 {
		delete(payload, "top_n")
	}
}

func ensureJSONObject(payload map[string]any, key string) map[string]any {
	if payload == nil {
		return map[string]any{}
	}
	if existing, ok := payload[key].(map[string]any); ok {
		return existing
	}
	obj := map[string]any{}
	payload[key] = obj
	return obj
}

func normalizeKimiMessages(value any) {
	messages, ok := value.([]any)
	if !ok {
		return
	}
	for _, item := range messages {
		message, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if strings.EqualFold(extractJSONString(message["role"]), "developer") {
			message["role"] = "system"
		}
	}
}

func kimiHasHistoricalReasoningContent(value any) bool {
	messages, ok := value.([]any)
	if !ok {
		return false
	}
	for _, item := range messages {
		message, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if strings.EqualFold(extractJSONString(message["role"]), "assistant") &&
			strings.TrimSpace(extractJSONString(message["reasoning_content"])) != "" {
			return true
		}
	}
	return false
}

func minimaxNormalizeEmbeddingsPayload(payload map[string]any) {
	if payload == nil {
		return
	}

	texts, ok := minimaxEmbeddingTextsFromValue(payload["texts"])
	if !ok {
		texts, ok = minimaxEmbeddingTextsFromValue(payload["input"])
	}
	if ok {
		payload["texts"] = texts
	}
	delete(payload, "input")

	if strings.TrimSpace(extractJSONString(payload["type"])) == "" {
		// Real MiniMax embeddings expect an explicit target usage type.
		payload["type"] = "db"
	}
}

func minimaxEmbeddingTextsFromValue(value any) ([]string, bool) {
	switch v := value.(type) {
	case nil:
		return nil, false
	case string:
		return []string{v}, true
	case []string:
		return append([]string(nil), v...), true
	case []any:
		texts := make([]string, 0, len(v))
		for _, item := range v {
			texts = append(texts, stringifyEmbeddingInputValue(item))
		}
		return texts, true
	default:
		return []string{stringifyEmbeddingInputValue(v)}, true
	}
}

func stringifyEmbeddingInputValue(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return v
	case json.Number:
		return v.String()
	case float64:
		return fmt.Sprintf("%v", v)
	case bool:
		return fmt.Sprintf("%t", v)
	default:
		body, err := json.Marshal(v)
		if err != nil {
			return fmt.Sprintf("%v", v)
		}
		return string(body)
	}
}

func mapMiniMaxBusinessStatusCode(codeRaw, message string) int {
	code := strings.TrimSpace(codeRaw)
	messageLower := strings.ToLower(strings.TrimSpace(message))

	switch code {
	case "1002", "1008", "1041", "2045", "2056":
		return 429
	case "1004", "2049":
		return 401
	case "2042":
		return 403
	case "1000", "1001", "1024", "1033":
		return 502
	case "1026", "1027", "1039", "1042", "1043", "1044", "2013", "20132", "2037", "2038", "2039", "2048":
		return 400
	}

	switch {
	case strings.Contains(messageLower, "api key"), strings.Contains(messageLower, "token"), strings.Contains(messageLower, "unauthorized"):
		return 401
	case strings.Contains(messageLower, "quota"), strings.Contains(messageLower, "rate limit"), strings.Contains(messageLower, "too many"):
		return 429
	case strings.Contains(messageLower, "permission"), strings.Contains(messageLower, "forbidden"):
		return 403
	case strings.Contains(messageLower, "invalid"), strings.Contains(messageLower, "parameter"), strings.Contains(messageLower, "参数"):
		return 400
	case strings.HasPrefix(code, "2"):
		return 400
	default:
		return 502
	}
}

func matchDomesticProviderError(providerType string, statusCode int, codeRaw, errTypeRaw, message string) *domesticProviderBusinessError {
	normalizedStatus := statusCode
	if normalizedStatus <= 0 {
		normalizedStatus = http.StatusBadGateway
	}
	code := normalizeProviderErrorToken(codeRaw)
	errType := normalizeProviderErrorToken(errTypeRaw)
	messageLower := normalizeProviderErrorToken(message)

	switch normalizeProviderType(providerType) {
	case ProviderTypeQwen:
		return matchDomesticProviderErrorByRules(normalizedStatus, code, errType, messageLower, []domesticProviderErrorRule{
			{HTTPStatus: http.StatusUnauthorized, Code: "authentication_error", Tokens: []string{"invalidapikey", "invalid_api_key", "accessdenied", "access_denied", "unauthorized", "signature", "tokenexpired"}},
			{HTTPStatus: http.StatusForbidden, Code: "permission_error", Tokens: []string{"forbidden", "permissiondenied", "permission_denied", "nopermission"}},
			{HTTPStatus: http.StatusTooManyRequests, Code: "rate_limit_error", Tokens: []string{"throttling", "quota", "limitrequest", "limit_requests", "arrearage", "insufficient_quota"}},
			{HTTPStatus: http.StatusNotFound, Code: "not_found_error", Tokens: []string{"modelnotfound", "model_not_found", "notfound"}},
			{HTTPStatus: http.StatusBadRequest, Code: "invalid_request_error", Tokens: []string{"invalidparameter", "invalid_parameter", "parametererror", "unsupportedoperation", "unsupported_operation", "badrequest"}},
		})
	case ProviderTypeZhipu:
		return matchDomesticProviderErrorByRules(normalizedStatus, code, errType, messageLower, []domesticProviderErrorRule{
			{HTTPStatus: http.StatusUnauthorized, Code: "authentication_error", Tokens: []string{"signature_error", "signatureerror", "invalid_api_key", "invalidapikey", "tokenexpired", "autherror"}},
			{HTTPStatus: http.StatusForbidden, Code: "permission_error", Tokens: []string{"forbidden", "permissiondenied", "permission_denied"}},
			{HTTPStatus: http.StatusTooManyRequests, Code: "rate_limit_error", Tokens: []string{"rate_limit", "ratelimit", "quota", "free_resource_exhausted"}},
			{HTTPStatus: http.StatusNotFound, Code: "not_found_error", Tokens: []string{"model_not_found", "modelnotfound", "resource_not_found"}},
			{HTTPStatus: http.StatusBadRequest, Code: "invalid_request_error", Tokens: []string{"invalid_parameter", "invalidparameter", "invalid_request", "parameter_error", "paramerror"}},
		})
	case ProviderTypeKimi:
		return matchDomesticProviderErrorByRules(normalizedStatus, code, errType, messageLower, []domesticProviderErrorRule{
			{HTTPStatus: http.StatusUnauthorized, Code: "authentication_error", Tokens: []string{"invalid_api_key", "invalidapikey", "api_key_not_found", "unauthorized", "authentication_error"}},
			{HTTPStatus: http.StatusForbidden, Code: "permission_error", Tokens: []string{"forbidden", "permission_denied", "permissiondenied"}},
			{HTTPStatus: http.StatusTooManyRequests, Code: "rate_limit_error", Tokens: []string{"rate_limit", "ratelimit", "quota", "insufficient_quota", "balance_not_enough"}},
			{HTTPStatus: http.StatusNotFound, Code: "not_found_error", Tokens: []string{"model_not_found", "modelnotfound"}},
			{HTTPStatus: http.StatusBadRequest, Code: "invalid_request_error", Tokens: []string{"invalid_request", "bad_request", "context_length_exceeded", "unsupported"}},
		})
	case ProviderTypeDoubao:
		return matchDomesticProviderErrorByRules(normalizedStatus, code, errType, messageLower, []domesticProviderErrorRule{
			{HTTPStatus: http.StatusUnauthorized, Code: "authentication_error", Tokens: []string{"invalid_api_key", "invalidapikey", "invalid_authentication", "unauthorized", "authfailed", "signature"}},
			{HTTPStatus: http.StatusForbidden, Code: "permission_error", Tokens: []string{"forbidden", "permission_denied", "permissiondenied"}},
			{HTTPStatus: http.StatusTooManyRequests, Code: "rate_limit_error", Tokens: []string{"throttling", "ratequota", "flow_limit", "quota", "arrearage", "bill_overdue"}},
			{HTTPStatus: http.StatusNotFound, Code: "not_found_error", Tokens: []string{"model_not_found", "modelnotfound", "resource_not_found", "endpoint_not_found"}},
			{HTTPStatus: http.StatusBadRequest, Code: "invalid_request_error", Tokens: []string{"invalid_parameter", "invalidparameter", "validationexception", "bad_request", "unsupported"}},
		})
	case ProviderTypeMiniMax:
		return matchDomesticProviderErrorByRules(normalizedStatus, code, errType, messageLower, []domesticProviderErrorRule{
			{HTTPStatus: http.StatusUnauthorized, Code: "authentication_error", Tokens: []string{"1004", "2049"}},
			{HTTPStatus: http.StatusTooManyRequests, Code: "rate_limit_error", Tokens: []string{"1002", "1008", "1041", "2045", "2056"}},
			{HTTPStatus: http.StatusBadRequest, Code: "invalid_request_error", Tokens: []string{"1026", "1027", "1039", "1042", "1043", "1044", "2013", "20132", "2037", "2038", "2039", "2048"}},
		})
	default:
		return nil
	}
}

type domesticProviderErrorRule struct {
	HTTPStatus int
	Code       string
	Tokens     []string
}

func matchDomesticProviderErrorByRules(statusCode int, codeRaw, errTypeRaw, message string, rules []domesticProviderErrorRule) *domesticProviderBusinessError {
	_ = statusCode
	for _, rule := range rules {
		for _, token := range rule.Tokens {
			if containsProviderErrorToken(codeRaw, token) || containsProviderErrorToken(errTypeRaw, token) || containsProviderErrorToken(message, token) {
				return &domesticProviderBusinessError{
					StatusCode: rule.HTTPStatus,
					Code:       rule.Code,
					Message:    message,
				}
			}
		}
	}
	return nil
}

func normalizeProviderErrorToken(text string) string {
	return strings.ToLower(strings.TrimSpace(text))
}

func containsProviderErrorToken(text, token string) bool {
	return strings.Contains(text, strings.ToLower(strings.TrimSpace(token)))
}
