package service

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/tidwall/gjson"
)

// DomesticProviderAdapter is the shared transport/adapter contract every provider
// implements regardless of modality. Request headers and business error extraction
// are cross-cutting concerns that apply to chat, embeddings, rerank and images alike.
type DomesticProviderAdapter interface {
	ApplyRequestHeaders(req *http.Request, cfg *domesticProviderRuntimeConfig, stream bool)
	ExtractBusinessError(body []byte) *domesticProviderBusinessError
}

// DomesticChatAdapter adds chat-completions protocol adaptation on top of the base
// adapter. Providers that do not implement it are assumed not to support chat.
type DomesticChatAdapter interface {
	DomesticProviderAdapter
	PrepareChatCompletionsBody(cfg *domesticProviderRuntimeConfig, body []byte) ([]byte, error)
}

// DomesticEmbeddingAdapter adds embeddings protocol adaptation on top of the base
// adapter. Providers that do not implement it are assumed not to support embeddings.
type DomesticEmbeddingAdapter interface {
	DomesticProviderAdapter
	PrepareEmbeddingsBody(cfg *domesticProviderRuntimeConfig, body []byte) ([]byte, error)
}

// DomesticRerankAdapter adds rerank protocol adaptation on top of the base adapter.
// Providers that do not implement it are assumed not to support rerank.
type DomesticRerankAdapter interface {
	DomesticProviderAdapter
	PrepareRerankBody(cfg *domesticProviderRuntimeConfig, body []byte) ([]byte, error)
}

// DomesticImageAdapter adds OpenAI-compatible /v1/images/generations adaptation on
// top of the base adapter. PrepareImagesBody adapts the inbound OpenAI image request
// to the provider; NormalizeImagesResponse adapts the upstream image response back
// to OpenAI format. Providers that do not implement it are assumed not to support
// image generation.
type DomesticImageAdapter interface {
	DomesticProviderAdapter
	PrepareImagesBody(cfg *domesticProviderRuntimeConfig, body []byte) ([]byte, error)
	NormalizeImagesResponse(body []byte) ([]byte, error)
}

// DomesticImageEditAdapter adds OpenAI-compatible /v1/images/edits adaptation on
// top of the base adapter. PrepareImagesEditsBody adapts the inbound OpenAI image
// edit request (already normalized to JSON by the handler, with image/mask stored
// as data URLs) to the provider. Providers that do not implement it fall back to
// PrepareImagesBody, which is correct for OpenAI-compatible upstreams that accept
// the edit payload as-is.
type DomesticImageEditAdapter interface {
	DomesticProviderAdapter
	PrepareImagesEditsBody(cfg *domesticProviderRuntimeConfig, body []byte) ([]byte, error)
}

// DomesticAudioSpeechAdapter adds OpenAI-compatible /v1/audio/speech adaptation on
// top of the base adapter. PrepareAudioSpeechBody adapts the inbound OpenAI TTS
// request to the provider; NormalizeAudioSpeechResponse converts the upstream TTS
// response into binary audio plus its content type. Providers that do not implement
// it are assumed not to support text-to-speech.
type DomesticAudioSpeechAdapter interface {
	DomesticProviderAdapter
	PrepareAudioSpeechBody(cfg *domesticProviderRuntimeConfig, body []byte) ([]byte, error)
	NormalizeAudioSpeechResponse(body []byte, responseFormat string) (audioData []byte, contentType string, err error)
}

// DomesticAudioTranscriptionAdapter adds OpenAI-compatible /v1/audio/transcriptions
// adaptation on top of the base adapter. BuildAudioTranscriptionRequest rebuilds the
// inbound multipart/form-data upload as the provider's upstream multipart request,
// returning the resulting body reader and its Content-Type.
type DomesticAudioTranscriptionAdapter interface {
	DomesticProviderAdapter
	BuildAudioTranscriptionRequest(form *multipart.Form, cfg *domesticProviderRuntimeConfig, upstreamModel string) (contentType string, body io.Reader, err error)
}

// DomesticVideoAdapter adds OpenAI-compatible /v1/video/generations adaptation on
// top of the base adapter. Providers that do not implement it are assumed not to
// support video generation. The submit → poll → retrieve orchestration lives in
// the execution service; the adapter owns the provider-specific URLs, payload
// conversion and response parsing so other vendors can be added without touching
// the poll loop.
type DomesticVideoAdapter interface {
	DomesticProviderAdapter
	PrepareVideoGenerationBody(cfg *domesticProviderRuntimeConfig, body []byte) ([]byte, error)
	VideoSubmitURL(cfg *domesticProviderRuntimeConfig, body []byte) string
	VideoQueryURL(cfg *domesticProviderRuntimeConfig, taskID string, body []byte) string
	VideoRetrieveURL(cfg *domesticProviderRuntimeConfig, ref string) string
	ParseVideoSubmitResponse(body []byte) (taskID string, err error)
	// ParseVideoPollResponse returns a normalized status (one of the
	// domesticVideoStatus* constants) plus a reference used to resolve the final
	// download URL: a file_id for providers that need a separate retrieve call,
	// or the final URL for providers that inline it in the poll response.
	ParseVideoPollResponse(body []byte) (status string, ref string, err error)
	ParseVideoRetrieveResponse(body []byte) (downloadURL string, err error)
	NormalizeVideoGenerationResponse(requestedModel, taskID, downloadURL string) ([]byte, error)
	// VideoUsesSeparateRetrieve reports whether the poll result only carries a
	// file_id that needs an extra retrieve call (e.g. MiniMax). Providers that
	// inline the video URL in the poll response return false (e.g. Kling).
	VideoUsesSeparateRetrieve() bool
}

// DomesticVideoPollAdapter 为需要非默认 GET 轮询的厂商提供定制能力（例如即梦
// Jimeng 需要 POST + 请求体 + SigV4 签名）。未实现该接口的厂商沿用 GET 无 body 轮询。
type DomesticVideoPollAdapter interface {
	VideoQueryMethod() string
	VideoQueryBody(taskID string, submitBody []byte) []byte
}

const (
	domesticVideoStatusSucceeded  = "succeeded"
	domesticVideoStatusFailed     = "failed"
	domesticVideoStatusProcessing = "processing"
)

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
	case ProviderTypeKling:
		return klingDomesticProviderAdapter{}
	case ProviderTypeAliWan:
		return aliWanDomesticProviderAdapter{}
	case ProviderTypeJimeng:
		return jimengDomesticProviderAdapter{}
	case ProviderTypeVidu:
		return viduDomesticProviderAdapter{}
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

func (noopDomesticProviderAdapter) PrepareImagesBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return body, nil
}

func (noopDomesticProviderAdapter) NormalizeImagesResponse(body []byte) ([]byte, error) {
	return body, nil
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

func (qwenDomesticProviderAdapter) PrepareImagesBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}

	model := strings.TrimSpace(extractJSONString(payload["model"]))
	prompt := strings.TrimSpace(extractJSONString(payload["prompt"]))
	responseFormat := strings.TrimSpace(extractJSONString(payload["response_format"]))

	aliReq := map[string]any{
		"model": model,
	}
	if responseFormat != "" {
		aliReq["response_format"] = responseFormat
	}
	if parameters := qwenBuildImageParameters(payload); len(parameters) > 0 {
		aliReq["parameters"] = parameters
	}

	input := qwenExtractImageInput(payload)
	if input == nil {
		if isQwenSyncImageModel(model) {
			input = map[string]any{
				"messages": []map[string]any{{
					"role":    "user",
					"content": []map[string]any{{"text": prompt}},
				}},
			}
		} else {
			input = map[string]any{
				"prompt": prompt,
			}
		}
	}
	aliReq["input"] = input

	return json.Marshal(aliReq)
}

func qwenBuildImageParameters(payload map[string]any) map[string]any {
	if extra, ok := payload["extra"].(map[string]any); ok {
		if parameters, ok := extra["parameters"].(map[string]any); ok && len(parameters) > 0 {
			return parameters
		}
	}

	parameters := map[string]any{}
	if size := strings.TrimSpace(extractJSONString(payload["size"])); size != "" {
		parameters["size"] = strings.ReplaceAll(size, "x", "*")
	}
	n := 1
	if value, ok := extractJSONNumber(payload["n"]); ok && value > 0 {
		n = int(value)
	}
	parameters["n"] = n
	if watermark, ok := payload["watermark"]; ok {
		parameters["watermark"] = watermark
	}
	return parameters
}

func qwenExtractImageInput(payload map[string]any) any {
	extra, ok := payload["extra"].(map[string]any)
	if !ok {
		return nil
	}
	if input, ok := extra["input"]; ok && input != nil {
		return input
	}
	return nil
}

func (qwenDomesticProviderAdapter) NormalizeImagesResponse(body []byte) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}

	var aliResp struct {
		Output struct {
			Results []struct {
				URL      string `json:"url"`
				B64Image string `json:"b64_image"`
			} `json:"results"`
			Choices []struct {
				Message struct {
					Content []struct {
						Image string `json:"image"`
						Text  string `json:"text"`
					} `json:"content"`
				} `json:"message"`
			} `json:"choices"`
		} `json:"output"`
	}
	if err := json.Unmarshal(body, &aliResp); err != nil {
		return nil, err
	}

	data := make([]map[string]any, 0)
	if len(aliResp.Output.Results) > 0 {
		for _, result := range aliResp.Output.Results {
			entry := map[string]any{}
			if url := strings.TrimSpace(result.URL); url != "" {
				entry["url"] = url
			}
			if b64 := strings.TrimSpace(result.B64Image); b64 != "" {
				entry["b64_json"] = b64
			}
			if len(entry) > 0 {
				data = append(data, entry)
			}
		}
	} else {
		for _, choice := range aliResp.Output.Choices {
			entry := map[string]any{}
			revisedPrompt := ""
			for _, content := range choice.Message.Content {
				if image := strings.TrimSpace(content.Image); image != "" {
					if strings.HasPrefix(image, "http") {
						entry["url"] = image
					} else {
						entry["b64_json"] = image
					}
				}
				if text := strings.TrimSpace(content.Text); text != "" {
					revisedPrompt = text
				}
			}
			if revisedPrompt != "" {
				entry["revised_prompt"] = revisedPrompt
			}
			if len(entry) > 0 {
				data = append(data, entry)
			}
		}
	}

	return json.Marshal(map[string]any{
		"created": time.Now().Unix(),
		"data":    data,
	})
}

// PrepareImagesEditsBody adapts an OpenAI /v1/images/edits payload into DashScope's
// image-edit request. The handler has already flattened multipart image/mask parts
// into data URLs on the top-level "image" field. Sync models (qwen-image-edit*) use
// the multimodal-generation input.messages shape; async wan models use input.images
// + input.prompt, mirroring new-api's oaiFormEdit2AliImageEdit / oaiFormEdit2WanxImageEdit.
func (qwenDomesticProviderAdapter) PrepareImagesEditsBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}

	model := strings.TrimSpace(extractJSONString(payload["model"]))
	prompt := strings.TrimSpace(extractJSONString(payload["prompt"]))
	image := firstQwenEditImage(payload["image"])

	aliReq := map[string]any{
		"model": model,
	}
	if responseFormat := strings.TrimSpace(extractJSONString(payload["response_format"])); responseFormat != "" {
		aliReq["response_format"] = responseFormat
	}
	if parameters := qwenBuildImageParameters(payload); len(parameters) > 0 {
		aliReq["parameters"] = parameters
	}

	var input map[string]any
	if isQwenSyncImageModel(model) {
		content := make([]map[string]any, 0, 2)
		if image != "" {
			content = append(content, map[string]any{"image": image})
		}
		if prompt != "" {
			content = append(content, map[string]any{"text": prompt})
		}
		input = map[string]any{
			"messages": []map[string]any{{
				"role":    "user",
				"content": content,
			}},
		}
	} else {
		input = map[string]any{
			"prompt": prompt,
		}
		if image != "" {
			input["images"] = []string{image}
		}
	}
	aliReq["input"] = input

	return json.Marshal(aliReq)
}

// firstQwenEditImage extracts the first image reference from an edits payload,
// tolerating both a single string data URL and an array of image entries.
func firstQwenEditImage(value any) string {
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
				return strings.TrimSpace(s)
			}
		}
	}
	return ""
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

func (kimiDomesticProviderAdapter) PrepareImagesBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return body, nil
}

func (kimiDomesticProviderAdapter) NormalizeImagesResponse(body []byte) ([]byte, error) {
	return body, nil
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

func (zhipuDomesticProviderAdapter) PrepareImagesBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return body, nil
}

func (zhipuDomesticProviderAdapter) NormalizeImagesResponse(body []byte) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}

	var zhipuResp struct {
		Created *int64 `json:"created"`
		Data    []struct {
			URL      string `json:"url"`
			ImageURL string `json:"image_url"`
			B64JSON  string `json:"b64_json"`
			B64Image string `json:"b64_image"`
		} `json:"data"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &zhipuResp); err != nil {
		return nil, err
	}
	if zhipuResp.Error != nil && strings.TrimSpace(zhipuResp.Error.Message) != "" {
		return nil, fmt.Errorf("%s", strings.TrimSpace(zhipuResp.Error.Message))
	}

	created := time.Now().Unix()
	if zhipuResp.Created != nil && *zhipuResp.Created != 0 {
		created = *zhipuResp.Created
	}

	data := make([]map[string]any, 0, len(zhipuResp.Data))
	for _, item := range zhipuResp.Data {
		url := strings.TrimSpace(item.URL)
		if url == "" {
			url = strings.TrimSpace(item.ImageURL)
		}
		b64 := strings.TrimSpace(item.B64JSON)
		if b64 == "" {
			b64 = strings.TrimSpace(item.B64Image)
		}

		entry := map[string]any{}
		if url != "" {
			entry["url"] = url
		} else if b64 != "" {
			entry["b64_json"] = b64
		} else {
			continue
		}
		data = append(data, entry)
	}

	return json.Marshal(map[string]any{
		"created": created,
		"data":    data,
	})
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

func (minimaxDomesticProviderAdapter) PrepareImagesBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}

	model := strings.TrimSpace(extractJSONString(payload["model"]))
	if model == "" {
		model = "image-01"
	}

	n := 1
	if value, ok := extractJSONNumber(payload["n"]); ok && value > 0 {
		n = int(value)
	}

	minimaxPayload := map[string]any{
		"model":           model,
		"prompt":          payload["prompt"],
		"response_format": normalizeMiniMaxImageResponseFormat(extractJSONString(payload["response_format"])),
		"n":               n,
	}

	aspectRatio := strings.TrimSpace(extractJSONString(payload["aspect_ratio"]))
	if aspectRatio == "" {
		aspectRatio = minimaxImageAspectRatio(extractJSONString(payload["size"]))
	}
	if aspectRatio != "" {
		minimaxPayload["aspect_ratio"] = aspectRatio
	}
	if watermark, ok := payload["watermark"]; ok {
		minimaxPayload["aigc_watermark"] = watermark
	}
	if promptOptimizer, ok := payload["prompt_optimizer"]; ok {
		minimaxPayload["prompt_optimizer"] = promptOptimizer
	}

	return json.Marshal(minimaxPayload)
}

func (minimaxDomesticProviderAdapter) NormalizeImagesResponse(body []byte) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}

	var minimaxResp struct {
		Data struct {
			ImageURLs   []string `json:"image_urls"`
			ImageBase64 []string `json:"image_base64"`
		} `json:"data"`
		Metadata map[string]any `json:"metadata"`
	}
	if err := json.Unmarshal(body, &minimaxResp); err != nil {
		return nil, err
	}

	data := make([]map[string]any, 0, len(minimaxResp.Data.ImageURLs)+len(minimaxResp.Data.ImageBase64))
	for _, u := range minimaxResp.Data.ImageURLs {
		data = append(data, map[string]any{"url": u})
	}
	for _, b64 := range minimaxResp.Data.ImageBase64 {
		data = append(data, map[string]any{"b64_json": b64})
	}

	openAIResp := map[string]any{
		"created": time.Now().Unix(),
		"data":    data,
	}
	if len(minimaxResp.Metadata) > 0 {
		openAIResp["metadata"] = minimaxResp.Metadata
	}

	return json.Marshal(openAIResp)
}

func (minimaxDomesticProviderAdapter) PrepareAudioSpeechBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}

	model := strings.TrimSpace(extractJSONString(payload["model"]))
	if model == "" {
		model = "speech-01-turbo"
	}

	voice := strings.TrimSpace(extractJSONString(payload["voice"]))
	speed := 1.0
	if value, ok := extractJSONNumber(payload["speed"]); ok {
		speed = value
	}
	format := strings.TrimSpace(extractJSONString(payload["response_format"]))
	if format == "" {
		format = "mp3"
	}

	minimaxPayload := map[string]any{
		"model": model,
		"text":  payload["input"],
		"voice_setting": map[string]any{
			"voice_id": voice,
			"speed":    speed,
		},
		"audio_setting": map[string]any{
			"format": format,
		},
		"output_format": "hex",
	}

	return json.Marshal(minimaxPayload)
}

func (minimaxDomesticProviderAdapter) NormalizeAudioSpeechResponse(body []byte, responseFormat string) ([]byte, string, error) {
	var minimaxResp struct {
		Data struct {
			Audio  string `json:"audio"`
			Status int    `json:"status"`
		} `json:"data"`
		BaseResp struct {
			StatusCode int64  `json:"status_code"`
			StatusMsg  string `json:"status_msg"`
		} `json:"base_resp"`
	}
	if err := json.Unmarshal(body, &minimaxResp); err != nil {
		return nil, "", err
	}
	if minimaxResp.BaseResp.StatusCode != 0 {
		message := strings.TrimSpace(minimaxResp.BaseResp.StatusMsg)
		if message == "" {
			message = "MiniMax TTS request failed"
		}
		return nil, "", fmt.Errorf("minimax tts error: %d - %s", minimaxResp.BaseResp.StatusCode, message)
	}
	if minimaxResp.Data.Audio == "" {
		return nil, "", fmt.Errorf("minimax tts returned no audio data")
	}

	audioData, err := hex.DecodeString(minimaxResp.Data.Audio)
	if err != nil {
		return nil, "", fmt.Errorf("failed to decode minimax tts audio: %w", err)
	}

	return audioData, minimaxAudioContentType(responseFormat), nil
}

func minimaxAudioContentType(responseFormat string) string {
	switch strings.ToLower(strings.TrimSpace(responseFormat)) {
	case "wav":
		return "audio/wav"
	case "flac":
		return "audio/flac"
	case "aac":
		return "audio/aac"
	case "pcm":
		return "audio/pcm"
	default:
		return "audio/mpeg"
	}
}

func (minimaxDomesticProviderAdapter) BuildAudioTranscriptionRequest(form *multipart.Form, _ *domesticProviderRuntimeConfig, upstreamModel string) (string, io.Reader, error) {
	if form == nil {
		return "", nil, fmt.Errorf("multipart form is required")
	}
	fileHeaders := form.File["file"]
	if len(fileHeaders) == 0 {
		return "", nil, fmt.Errorf("file is required")
	}
	fileHeader := fileHeaders[0]
	file, err := fileHeader.Open()
	if err != nil {
		return "", nil, err
	}
	defer func() { _ = file.Close() }()

	if upstreamModel == "" {
		if values := form.Value["model"]; len(values) > 0 {
			upstreamModel = values[0]
		}
	}

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	if err := writer.WriteField("model", upstreamModel); err != nil {
		return "", nil, err
	}
	for key, values := range form.Value {
		if key == "model" {
			continue
		}
		for _, value := range values {
			if err := writer.WriteField(key, value); err != nil {
				return "", nil, err
			}
		}
	}
	part, err := writer.CreateFormFile("file", fileHeader.Filename)
	if err != nil {
		return "", nil, err
	}
	if _, err := io.Copy(part, file); err != nil {
		return "", nil, err
	}
	if err := writer.Close(); err != nil {
		return "", nil, err
	}
	return writer.FormDataContentType(), &buf, nil
}

func (minimaxDomesticProviderAdapter) PrepareVideoGenerationBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}

	model := strings.TrimSpace(extractJSONString(payload["model"]))
	if model == "" {
		model = "MiniMax-Hailuo-2.3"
	}

	req := map[string]any{
		"model":  model,
		"prompt": payload["prompt"],
	}
	for _, field := range []string{
		"duration", "resolution", "callback_url",
		"first_frame_image", "last_frame_image", "subject_reference",
		"prompt_optimizer", "fast_pretreatment", "aigc_watermark",
	} {
		if value, exists := payload[field]; exists && value != nil {
			req[field] = value
		}
	}
	return json.Marshal(req)
}

func (minimaxDomesticProviderAdapter) VideoSubmitURL(cfg *domesticProviderRuntimeConfig, _ []byte) string {
	return buildDomesticRequestURL(cfg.BaseURL, "/v1/video_generation")
}

func (minimaxDomesticProviderAdapter) VideoQueryURL(cfg *domesticProviderRuntimeConfig, taskID string, _ []byte) string {
	return buildDomesticRequestURL(cfg.BaseURL, "/v1/query/video_generation") + "?task_id=" + url.QueryEscape(taskID)
}

func (minimaxDomesticProviderAdapter) VideoRetrieveURL(cfg *domesticProviderRuntimeConfig, ref string) string {
	return buildDomesticRequestURL(cfg.BaseURL, "/v1/files/retrieve") + "?file_id=" + url.QueryEscape(ref)
}

func (minimaxDomesticProviderAdapter) VideoUsesSeparateRetrieve() bool { return true }

func (minimaxDomesticProviderAdapter) ParseVideoSubmitResponse(body []byte) (string, error) {
	taskID := strings.TrimSpace(gjson.GetBytes(body, "task_id").String())
	if taskID == "" {
		taskID = strings.TrimSpace(gjson.GetBytes(body, "data.task_id").String())
	}
	if taskID == "" {
		return "", fmt.Errorf("minimax video submit did not return task_id")
	}
	return taskID, nil
}

func (minimaxDomesticProviderAdapter) ParseVideoPollResponse(body []byte) (string, string, error) {
	status := strings.TrimSpace(gjson.GetBytes(body, "status").String())
	fileID := strings.TrimSpace(gjson.GetBytes(body, "file_id").String())
	if status == "" {
		status = strings.TrimSpace(gjson.GetBytes(body, "data.status").String())
	}
	if fileID == "" {
		fileID = strings.TrimSpace(gjson.GetBytes(body, "data.file_id").String())
	}
	if status == "" {
		return "", "", fmt.Errorf("minimax video poll response missing status")
	}
	switch status {
	case "Success":
		return domesticVideoStatusSucceeded, fileID, nil
	case "Fail":
		return domesticVideoStatusFailed, fileID, nil
	default:
		return domesticVideoStatusProcessing, fileID, nil
	}
}

func (minimaxDomesticProviderAdapter) ParseVideoRetrieveResponse(body []byte) (string, error) {
	downloadURL := strings.TrimSpace(gjson.GetBytes(body, "file.download_url").String())
	if downloadURL == "" {
		downloadURL = strings.TrimSpace(gjson.GetBytes(body, "download_url").String())
	}
	if downloadURL == "" {
		return "", fmt.Errorf("minimax video retrieve response missing download_url")
	}
	return downloadURL, nil
}

func (minimaxDomesticProviderAdapter) NormalizeVideoGenerationResponse(requestedModel, taskID, downloadURL string) ([]byte, error) {
	return normalizeDomesticVideoResponse(requestedModel, taskID, downloadURL)
}

func normalizeDomesticVideoResponse(requestedModel, taskID, downloadURL string) ([]byte, error) {
	now := time.Now().Unix()
	resp := map[string]any{
		"id":           taskID,
		"task_id":      taskID,
		"object":       "video",
		"model":        requestedModel,
		"status":       "completed",
		"progress":     100,
		"created_at":   now,
		"completed_at": now,
		"metadata": map[string]any{
			"url": downloadURL,
		},
	}
	return json.Marshal(resp)
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

func (doubaoDomesticProviderAdapter) PrepareImagesBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	return body, nil
}

func (doubaoDomesticProviderAdapter) NormalizeImagesResponse(body []byte) ([]byte, error) {
	return body, nil
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

func normalizeMiniMaxImageResponseFormat(responseFormat string) string {
	switch strings.ToLower(strings.TrimSpace(responseFormat)) {
	case "", "url":
		return "url"
	case "b64_json", "base64":
		return "base64"
	default:
		return responseFormat
	}
}

func minimaxImageAspectRatio(size string) string {
	switch strings.ToLower(strings.TrimSpace(size)) {
	case "1024x1024":
		return "1:1"
	case "1792x1024":
		return "16:9"
	case "1024x1792":
		return "9:16"
	case "1536x1024", "1248x832":
		return "3:2"
	case "1024x1536", "832x1248":
		return "2:3"
	case "1152x864":
		return "4:3"
	case "864x1152":
		return "3:4"
	case "1344x576":
		return "21:9"
	}

	width, height, ok := minimaxParseImageSize(size)
	if !ok {
		return ""
	}
	ratio := minimaxReduceAspectRatio(width, height)
	switch ratio {
	case "1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9":
		return ratio
	default:
		return ""
	}
}

func minimaxParseImageSize(size string) (int, int, bool) {
	parts := strings.Split(size, "x")
	if len(parts) != 2 {
		return 0, 0, false
	}
	width, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, 0, false
	}
	height, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, 0, false
	}
	if width <= 0 || height <= 0 {
		return 0, 0, false
	}
	return width, height, true
}

func minimaxReduceAspectRatio(width, height int) string {
	divisor := minimaxGCD(width, height)
	return fmt.Sprintf("%d:%d", width/divisor, height/divisor)
}

func minimaxGCD(a, b int) int {
	for b != 0 {
		a, b = b, a%b
	}
	if a == 0 {
		return 1
	}
	return a
}

// klingDomesticProviderAdapter implements DomesticVideoAdapter for Kuaishou
// Kling (可灵). Kling authenticates with a JWT derived from an
// "access_key|secret_key" pair and exposes a two-step task protocol (submit →
// poll), with the video URL returned inline in the poll response.
type klingDomesticProviderAdapter struct{}

func (klingDomesticProviderAdapter) ApplyRequestHeaders(req *http.Request, cfg *domesticProviderRuntimeConfig, _ bool) {
	token, err := klingCreateJWT(cfg.APIKey)
	if err == nil {
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("User-Agent", "kling-sdk/1.0")
	}
}

func (klingDomesticProviderAdapter) ExtractBusinessError(body []byte) *domesticProviderBusinessError {
	codeRaw := strings.TrimSpace(gjson.GetBytes(body, "code").String())
	if codeRaw == "" || codeRaw == "0" {
		return nil
	}
	message := strings.TrimSpace(gjson.GetBytes(body, "message").String())
	if message == "" {
		message = "Kling request failed"
	}
	return &domesticProviderBusinessError{
		StatusCode: http.StatusBadRequest,
		Code:       codeRaw,
		Message:    message,
	}
}

func (klingDomesticProviderAdapter) PrepareVideoGenerationBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}

	model := strings.TrimSpace(extractJSONString(payload["model"]))
	if model == "" {
		model = "kling-v1"
	}
	mode := strings.TrimSpace(extractJSONString(payload["mode"]))
	if mode == "" {
		mode = "std"
	}
	duration := klingVideoDuration(payload["duration"])
	if duration == "" {
		duration = "5"
	}
	aspectRatio := strings.TrimSpace(extractJSONString(payload["aspect_ratio"]))
	if aspectRatio == "" {
		aspectRatio = klingAspectRatio(extractJSONString(payload["size"]))
	}
	if aspectRatio == "" {
		aspectRatio = "16:9"
	}

	req := map[string]any{
		"prompt":       payload["prompt"],
		"model":        model,
		"model_name":   model,
		"mode":         mode,
		"duration":     duration,
		"aspect_ratio": aspectRatio,
		"cfg_scale":    0.5,
	}
	for _, field := range []string{
		"image", "image_tail", "negative_prompt",
		"callback_url", "camera_control", "external_task_id",
	} {
		if value, exists := payload[field]; exists && value != nil {
			req[field] = value
		}
	}
	return json.Marshal(req)
}

func (klingDomesticProviderAdapter) VideoSubmitURL(cfg *domesticProviderRuntimeConfig, body []byte) string {
	return buildDomesticRequestURL(cfg.BaseURL, klingVideoPath(body))
}

func (klingDomesticProviderAdapter) VideoQueryURL(cfg *domesticProviderRuntimeConfig, taskID string, body []byte) string {
	return buildDomesticRequestURL(cfg.BaseURL, klingVideoPath(body)+"/"+url.PathEscape(taskID))
}

func (klingDomesticProviderAdapter) VideoRetrieveURL(_ *domesticProviderRuntimeConfig, _ string) string {
	return ""
}

func (klingDomesticProviderAdapter) VideoUsesSeparateRetrieve() bool { return false }

func (klingDomesticProviderAdapter) ParseVideoSubmitResponse(body []byte) (string, error) {
	taskID := strings.TrimSpace(gjson.GetBytes(body, "task_id").String())
	if taskID == "" {
		taskID = strings.TrimSpace(gjson.GetBytes(body, "data.task_id").String())
	}
	if taskID == "" {
		return "", fmt.Errorf("kling video submit did not return task_id")
	}
	return taskID, nil
}

func (klingDomesticProviderAdapter) ParseVideoPollResponse(body []byte) (string, string, error) {
	status := strings.TrimSpace(gjson.GetBytes(body, "data.task_status").String())
	if status == "" {
		status = strings.TrimSpace(gjson.GetBytes(body, "task_status").String())
	}
	if status == "" {
		return "", "", fmt.Errorf("kling video poll response missing task_status")
	}

	ref := strings.TrimSpace(gjson.GetBytes(body, "data.task_result.videos.0.url").String())
	if ref == "" {
		ref = strings.TrimSpace(gjson.GetBytes(body, "task_result.videos.0.url").String())
	}

	switch status {
	case "succeed":
		return domesticVideoStatusSucceeded, ref, nil
	case "failed":
		return domesticVideoStatusFailed, ref, nil
	default: // submitted, processing
		return domesticVideoStatusProcessing, ref, nil
	}
}

func (klingDomesticProviderAdapter) ParseVideoRetrieveResponse([]byte) (string, error) {
	return "", fmt.Errorf("kling does not use a separate retrieve step")
}

func (klingDomesticProviderAdapter) NormalizeVideoGenerationResponse(requestedModel, taskID, downloadURL string) ([]byte, error) {
	return normalizeDomesticVideoResponse(requestedModel, taskID, downloadURL)
}

func klingCreateJWT(apiKey string) (string, error) {
	parts := strings.Split(apiKey, "|")
	if len(parts) != 2 {
		return "", fmt.Errorf("kling api_key must be in access_key|secret_key format")
	}
	accessKey := strings.TrimSpace(parts[0])
	secretKey := strings.TrimSpace(parts[1])
	if accessKey == "" || secretKey == "" {
		return "", fmt.Errorf("kling api_key must be in access_key|secret_key format")
	}
	now := time.Now().Unix()
	claims := jwt.MapClaims{
		"iss": accessKey,
		"exp": now + 1800,
		"nbf": now - 5,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	token.Header["typ"] = "JWT"
	return token.SignedString([]byte(secretKey))
}

func klingVideoPath(body []byte) string {
	if gjson.GetBytes(body, "image").Exists() || gjson.GetBytes(body, "image_tail").Exists() {
		return "/v1/videos/image2video"
	}
	return "/v1/videos/text2video"
}

func klingVideoDuration(value any) string {
	if s := strings.TrimSpace(extractJSONString(value)); s != "" {
		return s
	}
	switch v := value.(type) {
	case float64:
		return strconv.Itoa(int(v))
	}
	return ""
}

func klingAspectRatio(size string) string {
	switch strings.ToLower(strings.TrimSpace(size)) {
	case "1024x1024", "512x512":
		return "1:1"
	case "1280x720", "1920x1080":
		return "16:9"
	case "720x1280", "1080x1920":
		return "9:16"
	default:
		return ""
	}
}

// aliWanDomesticProviderAdapter implements DomesticVideoAdapter for Alibaba
// Cloud Model Studio (DashScope) 通义万相 (Wan) video generation. It follows
// the native DashScope async task protocol: submit with X-DashScope-Async, then
// poll GET /api/v1/tasks/{task_id} until the video_url is available.
type aliWanDomesticProviderAdapter struct{}

func (aliWanDomesticProviderAdapter) ApplyRequestHeaders(req *http.Request, _ *domesticProviderRuntimeConfig, _ bool) {
	if req == nil {
		return
	}
	// DashScope async video synthesis requires this header on the submit call only.
	if req.Method == http.MethodPost && strings.HasSuffix(req.URL.Path, "/video-synthesis") {
		req.Header.Set("X-DashScope-Async", "enable")
	}
}

func (aliWanDomesticProviderAdapter) ExtractBusinessError(body []byte) *domesticProviderBusinessError {
	code := strings.TrimSpace(gjson.GetBytes(body, "code").String())
	if code == "" {
		code = strings.TrimSpace(gjson.GetBytes(body, "output.code").String())
	}
	if code == "" {
		return nil
	}
	message := strings.TrimSpace(gjson.GetBytes(body, "message").String())
	if message == "" {
		message = strings.TrimSpace(gjson.GetBytes(body, "output.message").String())
	}
	if message == "" {
		message = "Ali Wan request failed"
	}
	return &domesticProviderBusinessError{
		StatusCode: http.StatusBadRequest,
		Code:       code,
		Message:    message,
	}
}

func (aliWanDomesticProviderAdapter) PrepareVideoGenerationBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}

	model := strings.TrimSpace(extractJSONString(payload["model"]))
	if model == "" {
		model = "wan2.1-t2v-turbo"
	}

	input := map[string]any{}
	if prompt := strings.TrimSpace(extractJSONString(payload["prompt"])); prompt != "" {
		input["prompt"] = prompt
	}
	for _, key := range []string{"image", "image_url", "img_url"} {
		if value, ok := payload[key]; ok && value != nil {
			input["img_url"] = value
			break
		}
	}
	for _, key := range []string{"first_frame_url", "last_frame_url", "audio_url", "negative_prompt", "template"} {
		if value, ok := payload[key]; ok && value != nil {
			input[key] = value
		}
	}

	parameters := map[string]any{}
	if resolution := strings.TrimSpace(extractJSONString(payload["resolution"])); resolution != "" {
		parameters["resolution"] = aliWanResolution(resolution)
	}
	if size := strings.TrimSpace(extractJSONString(payload["size"])); size != "" {
		parameters["size"] = strings.ReplaceAll(size, "x", "*")
	}
	if duration, ok := extractJSONNumber(payload["duration"]); ok && duration > 0 {
		parameters["duration"] = int(duration)
	}
	if seed, ok := extractJSONNumber(payload["seed"]); ok {
		parameters["seed"] = int(seed)
	}
	if watermark, ok := payload["watermark"].(bool); ok {
		parameters["watermark"] = watermark
	}
	if promptExtend, ok := payload["prompt_extend"].(bool); ok {
		parameters["prompt_extend"] = promptExtend
	} else if promptExtend, ok := payload["prompt_optimizer"].(bool); ok {
		parameters["prompt_extend"] = promptExtend
	}
	if audio, ok := payload["audio"].(bool); ok {
		parameters["audio"] = audio
	}

	req := map[string]any{
		"model": model,
		"input": input,
	}
	if len(parameters) > 0 {
		req["parameters"] = parameters
	}
	return json.Marshal(req)
}

func (aliWanDomesticProviderAdapter) VideoSubmitURL(cfg *domesticProviderRuntimeConfig, _ []byte) string {
	return buildDomesticRequestURL(cfg.BaseURL, "/api/v1/services/aigc/video-generation/video-synthesis")
}

func (aliWanDomesticProviderAdapter) VideoQueryURL(cfg *domesticProviderRuntimeConfig, taskID string, _ []byte) string {
	return buildDomesticRequestURL(cfg.BaseURL, "/api/v1/tasks/"+url.PathEscape(taskID))
}

func (aliWanDomesticProviderAdapter) VideoRetrieveURL(_ *domesticProviderRuntimeConfig, _ string) string {
	return ""
}

func (aliWanDomesticProviderAdapter) VideoUsesSeparateRetrieve() bool { return false }

func (aliWanDomesticProviderAdapter) ParseVideoSubmitResponse(body []byte) (string, error) {
	taskID := strings.TrimSpace(gjson.GetBytes(body, "output.task_id").String())
	if taskID == "" {
		taskID = strings.TrimSpace(gjson.GetBytes(body, "task_id").String())
	}
	if taskID == "" {
		return "", fmt.Errorf("ali wan video submit did not return task_id")
	}
	return taskID, nil
}

func (aliWanDomesticProviderAdapter) ParseVideoPollResponse(body []byte) (string, string, error) {
	status := strings.TrimSpace(gjson.GetBytes(body, "output.task_status").String())
	if status == "" {
		status = strings.TrimSpace(gjson.GetBytes(body, "task_status").String())
	}
	if status == "" {
		return "", "", fmt.Errorf("ali wan video poll response missing task_status")
	}

	ref := strings.TrimSpace(gjson.GetBytes(body, "output.video_url").String())
	if ref == "" {
		ref = strings.TrimSpace(gjson.GetBytes(body, "video_url").String())
	}

	switch status {
	case "SUCCEEDED":
		return domesticVideoStatusSucceeded, ref, nil
	case "FAILED", "CANCELED", "UNKNOWN":
		return domesticVideoStatusFailed, ref, nil
	default: // PENDING, RUNNING
		return domesticVideoStatusProcessing, ref, nil
	}
}

func (aliWanDomesticProviderAdapter) ParseVideoRetrieveResponse([]byte) (string, error) {
	return "", fmt.Errorf("ali wan does not use a separate retrieve step")
}

func (aliWanDomesticProviderAdapter) NormalizeVideoGenerationResponse(requestedModel, taskID, downloadURL string) ([]byte, error) {
	return normalizeDomesticVideoResponse(requestedModel, taskID, downloadURL)
}

func aliWanResolution(resolution string) string {
	resolution = strings.ToUpper(strings.TrimSpace(resolution))
	if resolution == "" {
		return resolution
	}
	if !strings.HasSuffix(resolution, "P") {
		resolution += "P"
	}
	return resolution
}

// jimengDomesticProviderAdapter implements DomesticVideoAdapter for ByteDance
// Volcano 即梦 (Jimeng) video generation. Jimeng authenticates with an
// "access_key|secret_key" pair via HMAC-SHA256 SigV4 signing and polls through a
// POST request carrying a JSON body, unlike the GET-based polling used by the
// other vendors.
type jimengDomesticProviderAdapter struct{}

func (jimengDomesticProviderAdapter) ApplyRequestHeaders(req *http.Request, cfg *domesticProviderRuntimeConfig, _ bool) {
	if req == nil || cfg == nil {
		return
	}
	parts := strings.Split(cfg.APIKey, "|")
	if len(parts) != 2 {
		return
	}
	accessKey := strings.TrimSpace(parts[0])
	secretKey := strings.TrimSpace(parts[1])
	if accessKey == "" || secretKey == "" {
		return
	}
	_ = jimengSignRequest(req, accessKey, secretKey)
}

func (jimengDomesticProviderAdapter) ExtractBusinessError(body []byte) *domesticProviderBusinessError {
	code := gjson.GetBytes(body, "code").Int()
	if code == 0 || code == 10000 {
		return nil
	}
	message := strings.TrimSpace(gjson.GetBytes(body, "message").String())
	if message == "" {
		message = "Jimeng request failed"
	}
	return &domesticProviderBusinessError{
		StatusCode: http.StatusBadRequest,
		Code:       strconv.FormatInt(code, 10),
		Message:    message,
	}
}

func (jimengDomesticProviderAdapter) PrepareVideoGenerationBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}

	reqKey := strings.TrimSpace(extractJSONString(payload["model"]))
	if reqKey == "" {
		reqKey = "jimeng_vgfm_t2v_l20"
	}
	prompt := strings.TrimSpace(extractJSONString(payload["prompt"]))

	var images []string
	for _, key := range []string{"image", "image_url", "image_urls", "images"} {
		if value, ok := payload[key]; ok && value != nil {
			images = jimengImageStrings(value)
			if len(images) > 0 {
				break
			}
		}
	}

	reqKey = jimengNormalizeReqKey(reqKey, len(images))

	frames := 121
	if duration, ok := extractJSONNumber(payload["duration"]); ok && int(duration) == 10 {
		frames = 241
	}

	seed := int64(0)
	if value, ok := extractJSONNumber(payload["seed"]); ok {
		seed = int64(value)
	}

	aspectRatio := strings.TrimSpace(extractJSONString(payload["aspect_ratio"]))
	if aspectRatio == "" {
		aspectRatio = jimengAspectRatio(extractJSONString(payload["size"]))
	}

	req := map[string]any{
		"req_key":      reqKey,
		"prompt":       prompt,
		"seed":         seed,
		"aspect_ratio": aspectRatio,
		"frames":       frames,
	}
	if len(images) > 0 {
		if strings.HasPrefix(images[0], "http") {
			req["image_urls"] = images
		} else {
			req["binary_data_base64"] = images
		}
	}
	return json.Marshal(req)
}

func (jimengDomesticProviderAdapter) VideoSubmitURL(cfg *domesticProviderRuntimeConfig, _ []byte) string {
	return buildDomesticRequestURL(cfg.BaseURL, "/") + "?Action=CVSync2AsyncSubmitTask&Version=2022-08-31"
}

func (jimengDomesticProviderAdapter) VideoQueryURL(cfg *domesticProviderRuntimeConfig, _ string, _ []byte) string {
	return buildDomesticRequestURL(cfg.BaseURL, "/") + "?Action=CVSync2AsyncGetResult&Version=2022-08-31"
}

func (jimengDomesticProviderAdapter) VideoRetrieveURL(_ *domesticProviderRuntimeConfig, _ string) string {
	return ""
}

func (jimengDomesticProviderAdapter) VideoUsesSeparateRetrieve() bool { return false }

func (jimengDomesticProviderAdapter) VideoQueryMethod() string { return http.MethodPost }

func (jimengDomesticProviderAdapter) VideoQueryBody(taskID string, submitBody []byte) []byte {
	reqKey := strings.TrimSpace(gjson.GetBytes(submitBody, "req_key").String())
	if reqKey == "" {
		reqKey = "jimeng_vgfm_t2v_l20"
	}
	body, _ := json.Marshal(map[string]any{
		"req_key": reqKey,
		"task_id": taskID,
	})
	return body
}

func (jimengDomesticProviderAdapter) ParseVideoSubmitResponse(body []byte) (string, error) {
	taskID := strings.TrimSpace(gjson.GetBytes(body, "data.task_id").String())
	if taskID == "" {
		taskID = strings.TrimSpace(gjson.GetBytes(body, "task_id").String())
	}
	if taskID == "" {
		return "", fmt.Errorf("jimeng video submit did not return task_id")
	}
	return taskID, nil
}

func (jimengDomesticProviderAdapter) ParseVideoPollResponse(body []byte) (string, string, error) {
	status := strings.TrimSpace(gjson.GetBytes(body, "data.status").String())
	if status == "" {
		status = strings.TrimSpace(gjson.GetBytes(body, "status").String())
	}
	if status == "" {
		return "", "", fmt.Errorf("jimeng video poll response missing status")
	}

	ref := strings.TrimSpace(gjson.GetBytes(body, "data.video_url").String())
	if ref == "" {
		ref = strings.TrimSpace(gjson.GetBytes(body, "video_url").String())
	}

	switch status {
	case "done":
		return domesticVideoStatusSucceeded, ref, nil
	case "failed", "cancelled", "canceled", "timeout":
		return domesticVideoStatusFailed, ref, nil
	default: // in_queue, processing
		return domesticVideoStatusProcessing, ref, nil
	}
}

func (jimengDomesticProviderAdapter) ParseVideoRetrieveResponse([]byte) (string, error) {
	return "", fmt.Errorf("jimeng does not use a separate retrieve step")
}

func (jimengDomesticProviderAdapter) NormalizeVideoGenerationResponse(requestedModel, taskID, downloadURL string) ([]byte, error) {
	return normalizeDomesticVideoResponse(requestedModel, taskID, downloadURL)
}

func jimengNormalizeReqKey(reqKey string, imageLen int) string {
	if !strings.Contains(reqKey, "jimeng_v30") {
		return reqKey
	}
	if reqKey == "jimeng_v30_pro" {
		return "jimeng_ti2v_v30_pro"
	}
	if imageLen > 1 {
		return strings.TrimSuffix(strings.Replace(reqKey, "jimeng_v30", "jimeng_i2v_first_tail_v30", 1), "p")
	}
	if imageLen == 1 {
		return strings.TrimSuffix(strings.Replace(reqKey, "jimeng_v30", "jimeng_i2v_first_v30", 1), "p")
	}
	return strings.Replace(reqKey, "jimeng_v30", "jimeng_t2v_v30", 1)
}

func jimengImageStrings(value any) []string {
	switch v := value.(type) {
	case string:
		if strings.TrimSpace(v) == "" {
			return nil
		}
		return []string{v}
	case []string:
		out := make([]string, 0, len(v))
		for _, s := range v {
			if strings.TrimSpace(s) != "" {
				out = append(out, s)
			}
		}
		return out
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s := strings.TrimSpace(extractJSONString(item)); s != "" {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

func jimengAspectRatio(size string) string {
	switch strings.ToLower(strings.TrimSpace(size)) {
	case "1024x1024", "512x512":
		return "1:1"
	case "1280x720", "1920x1080":
		return "16:9"
	case "720x1280", "1080x1920":
		return "9:16"
	default:
		return "16:9"
	}
}

func jimengSignRequest(req *http.Request, accessKey, secretKey string) error {
	var bodyBytes []byte
	if req.Body != nil {
		var err error
		bodyBytes, err = io.ReadAll(req.Body)
		if err != nil {
			return err
		}
		_ = req.Body.Close()
		req.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	}

	payloadHash := sha256.Sum256(bodyBytes)
	hexPayloadHash := hex.EncodeToString(payloadHash[:])

	t := time.Now().UTC()
	xDate := t.Format("20060102T150405Z")
	shortDate := t.Format("20060102")

	req.Header.Set("Host", req.URL.Host)
	req.Header.Set("X-Date", xDate)
	req.Header.Set("X-Content-Sha256", hexPayloadHash)

	queryParams := req.URL.Query()
	sortedKeys := make([]string, 0, len(queryParams))
	for k := range queryParams {
		sortedKeys = append(sortedKeys, k)
	}
	sort.Strings(sortedKeys)
	var queryParts []string
	for _, k := range sortedKeys {
		values := queryParams[k]
		sort.Strings(values)
		for _, v := range values {
			queryParts = append(queryParts, url.QueryEscape(k)+"="+url.QueryEscape(v))
		}
	}
	canonicalQueryString := strings.Join(queryParts, "&")

	headersToSign := map[string]string{
		"host":             req.URL.Host,
		"x-date":           xDate,
		"x-content-sha256": hexPayloadHash,
	}
	if ct := req.Header.Get("Content-Type"); ct != "" {
		headersToSign["content-type"] = ct
	}

	signedHeaderKeys := make([]string, 0, len(headersToSign))
	for k := range headersToSign {
		signedHeaderKeys = append(signedHeaderKeys, k)
	}
	sort.Strings(signedHeaderKeys)

	var canonicalHeaders strings.Builder
	for _, k := range signedHeaderKeys {
		canonicalHeaders.WriteString(k)
		canonicalHeaders.WriteString(":")
		canonicalHeaders.WriteString(strings.TrimSpace(headersToSign[k]))
		canonicalHeaders.WriteString("\n")
	}
	signedHeaders := strings.Join(signedHeaderKeys, ";")

	canonicalRequest := fmt.Sprintf("%s\n%s\n%s\n%s\n%s\n%s",
		req.Method,
		req.URL.Path,
		canonicalQueryString,
		canonicalHeaders.String(),
		signedHeaders,
		hexPayloadHash,
	)

	hashedCanonicalRequest := sha256.Sum256([]byte(canonicalRequest))
	hexHashedCanonicalRequest := hex.EncodeToString(hashedCanonicalRequest[:])

	region := "cn-north-1"
	serviceName := "cv"
	credentialScope := fmt.Sprintf("%s/%s/%s/request", shortDate, region, serviceName)
	stringToSign := fmt.Sprintf("HMAC-SHA256\n%s\n%s\n%s", xDate, credentialScope, hexHashedCanonicalRequest)

	kDate := jimengHMACSHA256([]byte(secretKey), []byte(shortDate))
	kRegion := jimengHMACSHA256(kDate, []byte(region))
	kService := jimengHMACSHA256(kRegion, []byte(serviceName))
	kSigning := jimengHMACSHA256(kService, []byte("request"))
	signature := hex.EncodeToString(jimengHMACSHA256(kSigning, []byte(stringToSign)))

	authorization := fmt.Sprintf("HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		accessKey,
		credentialScope,
		signedHeaders,
		signature,
	)
	req.Header.Set("Authorization", authorization)
	return nil
}

func jimengHMACSHA256(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	_, _ = h.Write(data)
	return h.Sum(nil)
}

// viduDomesticProviderAdapter implements DomesticVideoAdapter for Vidu. Vidu
// authenticates with an "Authorization: Token {key}" header and uses a two-step
// inline protocol: submit to /ent/v2/{action} (text2video / img2video /
// start-end2video / reference2video chosen by image count), then poll
// GET /ent/v2/tasks/{task_id}/creations until creations[0].url is available.
type viduDomesticProviderAdapter struct{}

func (viduDomesticProviderAdapter) ApplyRequestHeaders(req *http.Request, cfg *domesticProviderRuntimeConfig, _ bool) {
	if req == nil || cfg == nil {
		return
	}
	key := strings.TrimSpace(cfg.APIKey)
	if key == "" {
		return
	}
	req.Header.Set("Authorization", "Token "+key)
}

func (viduDomesticProviderAdapter) ExtractBusinessError(body []byte) *domesticProviderBusinessError {
	state := strings.TrimSpace(gjson.GetBytes(body, "state").String())
	if state == "failed" {
		code := strings.TrimSpace(gjson.GetBytes(body, "err_code").String())
		if code == "" {
			code = strings.TrimSpace(gjson.GetBytes(body, "code").String())
		}
		message := strings.TrimSpace(gjson.GetBytes(body, "message").String())
		if message == "" {
			message = code
		}
		if message == "" {
			message = "Vidu task failed"
		}
		return &domesticProviderBusinessError{
			StatusCode: http.StatusBadRequest,
			Code:       code,
			Message:    message,
		}
	}

	// HTTP-level error payload (e.g. invalid token).
	code := strings.TrimSpace(gjson.GetBytes(body, "code").String())
	if code == "" {
		return nil
	}
	message := strings.TrimSpace(gjson.GetBytes(body, "message").String())
	if message == "" {
		message = "Vidu request failed"
	}
	return &domesticProviderBusinessError{
		StatusCode: http.StatusBadRequest,
		Code:       code,
		Message:    message,
	}
}

func (viduDomesticProviderAdapter) PrepareVideoGenerationBody(_ *domesticProviderRuntimeConfig, body []byte) ([]byte, error) {
	if len(body) == 0 {
		return body, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}

	model := strings.TrimSpace(extractJSONString(payload["model"]))
	if model == "" {
		model = "viduq1"
	}
	prompt := strings.TrimSpace(extractJSONString(payload["prompt"]))

	var images []string
	for _, key := range []string{"images", "image", "image_url", "image_urls"} {
		if value, ok := payload[key]; ok && value != nil {
			images = viduImageStrings(value)
			if len(images) > 0 {
				break
			}
		}
	}

	duration := 5
	if value, ok := extractJSONNumber(payload["duration"]); ok && int(value) > 0 {
		duration = int(value)
	}

	resolution := strings.TrimSpace(extractJSONString(payload["resolution"]))
	if resolution == "" {
		resolution = strings.TrimSpace(extractJSONString(payload["size"]))
	}
	resolution = viduResolution(resolution)

	seed := 0
	if value, ok := extractJSONNumber(payload["seed"]); ok {
		seed = int(value)
	}

	movementAmplitude := strings.TrimSpace(extractJSONString(payload["movement_amplitude"]))
	if movementAmplitude == "" {
		movementAmplitude = "auto"
	}

	bgm := false
	if value, ok := payload["bgm"].(bool); ok {
		bgm = value
	}

	req := map[string]any{
		"model":              model,
		"prompt":             prompt,
		"duration":           duration,
		"resolution":         resolution,
		"movement_amplitude": movementAmplitude,
		"bgm":                bgm,
		"seed":               seed,
	}
	if len(images) > 0 {
		req["images"] = images
	}
	if payloadStr := strings.TrimSpace(extractJSONString(payload["payload"])); payloadStr != "" {
		req["payload"] = payloadStr
	}
	return json.Marshal(req)
}

func (viduDomesticProviderAdapter) VideoSubmitURL(cfg *domesticProviderRuntimeConfig, body []byte) string {
	return buildDomesticRequestURL(cfg.BaseURL, "/ent/v2"+viduVideoPath(body))
}

func (viduDomesticProviderAdapter) VideoQueryURL(cfg *domesticProviderRuntimeConfig, taskID string, _ []byte) string {
	return buildDomesticRequestURL(cfg.BaseURL, "/ent/v2/tasks/"+url.PathEscape(taskID)+"/creations")
}

func (viduDomesticProviderAdapter) VideoRetrieveURL(_ *domesticProviderRuntimeConfig, _ string) string {
	return ""
}

func (viduDomesticProviderAdapter) VideoUsesSeparateRetrieve() bool { return false }

func (viduDomesticProviderAdapter) ParseVideoSubmitResponse(body []byte) (string, error) {
	taskID := strings.TrimSpace(gjson.GetBytes(body, "task_id").String())
	if taskID == "" {
		taskID = strings.TrimSpace(gjson.GetBytes(body, "data.task_id").String())
	}
	if taskID == "" {
		return "", fmt.Errorf("vidu video submit did not return task_id")
	}
	return taskID, nil
}

func (viduDomesticProviderAdapter) ParseVideoPollResponse(body []byte) (string, string, error) {
	state := strings.TrimSpace(gjson.GetBytes(body, "state").String())
	if state == "" {
		state = strings.TrimSpace(gjson.GetBytes(body, "data.state").String())
	}
	if state == "" {
		return "", "", fmt.Errorf("vidu video poll response missing state")
	}

	ref := ""
	if creations := gjson.GetBytes(body, "creations").Array(); len(creations) > 0 {
		ref = strings.TrimSpace(creations[0].Get("url").String())
	}

	switch state {
	case "success":
		return domesticVideoStatusSucceeded, ref, nil
	case "failed":
		return domesticVideoStatusFailed, ref, nil
	default: // created, queueing, processing
		return domesticVideoStatusProcessing, ref, nil
	}
}

func (viduDomesticProviderAdapter) ParseVideoRetrieveResponse([]byte) (string, error) {
	return "", fmt.Errorf("vidu does not use a separate retrieve step")
}

func (viduDomesticProviderAdapter) NormalizeVideoGenerationResponse(requestedModel, taskID, downloadURL string) ([]byte, error) {
	return normalizeDomesticVideoResponse(requestedModel, taskID, downloadURL)
}

func viduVideoPath(body []byte) string {
	count := len(gjson.GetBytes(body, "images").Array())
	switch {
	case count == 1:
		return "/img2video"
	case count == 2:
		return "/start-end2video"
	case count > 2:
		return "/reference2video"
	default:
		return "/text2video"
	}
}

func viduImageStrings(value any) []string {
	switch v := value.(type) {
	case string:
		if strings.TrimSpace(v) == "" {
			return nil
		}
		return []string{v}
	case []string:
		out := make([]string, 0, len(v))
		for _, s := range v {
			if strings.TrimSpace(s) != "" {
				out = append(out, s)
			}
		}
		return out
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s := strings.TrimSpace(extractJSONString(item)); s != "" {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

func viduResolution(resolution string) string {
	switch strings.ToLower(strings.TrimSpace(resolution)) {
	case "1920x1080", "1080", "1080p":
		return "1080p"
	case "1280x720", "720", "720p":
		return "720p"
	case "960x540", "540", "540p":
		return "540p"
	default:
		return strings.ToLower(strings.TrimSpace(resolution))
	}
}
