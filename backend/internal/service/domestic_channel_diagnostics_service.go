package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/dlxyz/SubioHub/internal/pkg/apicompat"
	"github.com/tidwall/gjson"
)

type DomesticResponsesTestResult struct {
	Success         bool   `json:"success"`
	StatusCode      int    `json:"status_code"`
	Message         string `json:"message"`
	RequestID       string `json:"request_id,omitempty"`
	UpstreamModel   string `json:"upstream_model,omitempty"`
	ResponsePreview string `json:"response_preview,omitempty"`
	DurationMs      int64  `json:"duration_ms"`
}

type DomesticMessagesTestResult struct {
	Success         bool   `json:"success"`
	StatusCode      int    `json:"status_code"`
	Message         string `json:"message"`
	RequestID       string `json:"request_id,omitempty"`
	UpstreamModel   string `json:"upstream_model,omitempty"`
	ResponsePreview string `json:"response_preview,omitempty"`
	DurationMs      int64  `json:"duration_ms"`
}

type DomesticModelsFetchResult struct {
	Success          bool                           `json:"success"`
	StatusCode       int                            `json:"status_code"`
	Message          string                         `json:"message"`
	RequestID        string                         `json:"request_id,omitempty"`
	Models           []string                       `json:"models,omitempty"`
	CapabilityModels map[string][]string            `json:"capability_models,omitempty"`
	ModelCatalog     []DomesticFetchedModelMetadata `json:"model_catalog,omitempty"`
	ResponsePreview  string                         `json:"response_preview,omitempty"`
	DurationMs       int64                          `json:"duration_ms"`
}

type DomesticFetchedModelMetadata struct {
	ID           string   `json:"id,omitempty"`
	Name         string   `json:"name,omitempty"`
	Version      string   `json:"version,omitempty"`
	Domain       string   `json:"domain,omitempty"`
	TaskType     string   `json:"task_type,omitempty"`
	Status       string   `json:"status,omitempty"`
	Capabilities []string `json:"capabilities,omitempty"`
}

type DomesticEmbeddingsTestResult struct {
	Success         bool   `json:"success"`
	StatusCode      int    `json:"status_code"`
	Message         string `json:"message"`
	RequestID       string `json:"request_id,omitempty"`
	UpstreamModel   string `json:"upstream_model,omitempty"`
	ResponsePreview string `json:"response_preview,omitempty"`
	DurationMs      int64  `json:"duration_ms"`
}

type DomesticRerankTestResult struct {
	Success         bool   `json:"success"`
	StatusCode      int    `json:"status_code"`
	Message         string `json:"message"`
	RequestID       string `json:"request_id,omitempty"`
	UpstreamModel   string `json:"upstream_model,omitempty"`
	ResponsePreview string `json:"response_preview,omitempty"`
	DurationMs      int64  `json:"duration_ms"`
}

func (s *DomesticChannelExecutionService) TestResponses(
	ctx context.Context,
	providerType string,
	providerConfig map[string]any,
	testModel string,
) (*DomesticResponsesTestResult, error) {
	if s == nil || s.httpUpstream == nil {
		return nil, errors.New("domestic channel executor unavailable")
	}

	providerType = normalizeProviderType(providerType)
	cfg, err := parseDomesticProviderRuntimeConfig(providerType, providerConfig)
	if err != nil {
		return nil, err
	}
	adapter := newDomesticProviderAdapter(providerType)

	testModel = strings.TrimSpace(testModel)
	if testModel == "" {
		testModel = defaultDomesticTestModel(providerType)
	}
	if testModel == "" {
		return nil, errors.New("test_model is required")
	}

	inputRaw, err := json.Marshal([]map[string]any{
		{
			"role":    "user",
			"content": "ping",
		},
	})
	if err != nil {
		return nil, err
	}
	maxTokens := 16
	responsesReq := &apicompat.ResponsesRequest{
		Model:           testModel,
		Input:           inputRaw,
		MaxOutputTokens: &maxTokens,
		Stream:          false,
	}
	chatReq, err := apicompat.ResponsesToChatCompletionsRequest(responsesReq)
	if err != nil {
		return nil, err
	}
	chatBody, err := json.Marshal(chatReq)
	if err != nil {
		return nil, err
	}
	chatBody, err = adapter.PrepareChatCompletionsBody(cfg, chatBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, buildDomesticChatCompletionsURL(cfg), strings.NewReader(string(chatBody)))
	if err != nil {
		return nil, err
	}
	applyDomesticRequestHeaders(req, cfg, false)
	adapter.ApplyRequestHeaders(req, cfg, false)

	startTime := time.Now()
	resp, err := s.httpUpstream.Do(req, "", 0, 0)
	if err != nil {
		return &DomesticResponsesTestResult{
			Success:    false,
			StatusCode: http.StatusBadGateway,
			Message:    "Upstream request failed: " + err.Error(),
			DurationMs: time.Since(startTime).Milliseconds(),
		}, nil
	}
	defer func() { _ = resp.Body.Close() }()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<10))
	bodyText := strings.TrimSpace(string(body))
	result := &DomesticResponsesTestResult{
		Success:         resp.StatusCode >= 200 && resp.StatusCode < 300,
		StatusCode:      resp.StatusCode,
		RequestID:       strings.TrimSpace(resp.Header.Get("x-request-id")),
		UpstreamModel:   strings.TrimSpace(gjson.GetBytes(body, "model").String()),
		ResponsePreview: bodyText,
		DurationMs:      time.Since(startTime).Milliseconds(),
	}
	if result.RequestID == "" {
		result.RequestID = strings.TrimSpace(gjson.GetBytes(body, "id").String())
	}
	if businessErr := adapter.ExtractBusinessError(body); businessErr != nil {
		result.Success = false
		result.StatusCode = businessErr.StatusCode
		result.Message = businessErr.Message
		return result, nil
	}

	if !result.Success {
		statusCode, _, message := normalizeResponsesUpstreamError(resp.StatusCode, providerType, body)
		result.StatusCode = statusCode
		result.Message = strings.TrimSpace(message)
		if result.Message == "" {
			result.Message = "Upstream request failed"
		}
		return result, nil
	}

	var chatResp apicompat.ChatCompletionsResponse
	if err := json.Unmarshal(body, &chatResp); err != nil {
		result.Success = false
		result.StatusCode = http.StatusBadGateway
		result.Message = "Failed to decode upstream response"
		return result, nil
	}
	responsesResp := apicompat.ChatCompletionsToResponsesResponse(&chatResp)
	preview, err := json.MarshalIndent(responsesResp, "", "  ")
	if err != nil {
		return nil, err
	}
	result.ResponsePreview = string(preview)
	if result.UpstreamModel == "" && chatResp.Model != "" {
		result.UpstreamModel = chatResp.Model
	}
	result.Message = "Responses chain test succeeded"
	if result.UpstreamModel != "" {
		result.Message = "Responses chain test succeeded with model: " + result.UpstreamModel
	}
	return result, nil
}

func (s *DomesticChannelExecutionService) TestMessages(
	ctx context.Context,
	providerType string,
	providerConfig map[string]any,
	testModel string,
) (*DomesticMessagesTestResult, error) {
	if s == nil || s.httpUpstream == nil {
		return nil, errors.New("domestic channel executor unavailable")
	}

	providerType = normalizeProviderType(providerType)
	cfg, err := parseDomesticProviderRuntimeConfig(providerType, providerConfig)
	if err != nil {
		return nil, err
	}
	adapter := newDomesticProviderAdapter(providerType)

	testModel = strings.TrimSpace(testModel)
	if testModel == "" {
		testModel = defaultDomesticTestModel(providerType)
	}
	if testModel == "" {
		return nil, errors.New("test_model is required")
	}

	anthropicReq := &apicompat.AnthropicRequest{
		Model:     testModel,
		MaxTokens: 32,
		Messages: []apicompat.AnthropicMessage{
			{
				Role:    "user",
				Content: json.RawMessage(`"reply with pong only"`),
			},
		},
		Stream: false,
	}
	responsesReq, err := apicompat.AnthropicToResponses(anthropicReq)
	if err != nil {
		return nil, err
	}
	chatReq, err := apicompat.ResponsesToChatCompletionsRequest(responsesReq)
	if err != nil {
		return nil, err
	}
	chatBody, err := json.Marshal(chatReq)
	if err != nil {
		return nil, err
	}
	chatBody, err = adapter.PrepareChatCompletionsBody(cfg, chatBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, buildDomesticChatCompletionsURL(cfg), strings.NewReader(string(chatBody)))
	if err != nil {
		return nil, err
	}
	applyDomesticRequestHeaders(req, cfg, false)
	adapter.ApplyRequestHeaders(req, cfg, false)

	startTime := time.Now()
	resp, err := s.httpUpstream.Do(req, "", 0, 0)
	if err != nil {
		return &DomesticMessagesTestResult{
			Success:    false,
			StatusCode: http.StatusBadGateway,
			Message:    "Upstream request failed: " + err.Error(),
			DurationMs: time.Since(startTime).Milliseconds(),
		}, nil
	}
	defer func() { _ = resp.Body.Close() }()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<10))
	bodyText := strings.TrimSpace(string(body))
	result := &DomesticMessagesTestResult{
		Success:         resp.StatusCode >= 200 && resp.StatusCode < 300,
		StatusCode:      resp.StatusCode,
		RequestID:       strings.TrimSpace(resp.Header.Get("x-request-id")),
		UpstreamModel:   strings.TrimSpace(gjson.GetBytes(body, "model").String()),
		ResponsePreview: bodyText,
		DurationMs:      time.Since(startTime).Milliseconds(),
	}
	if result.RequestID == "" {
		result.RequestID = strings.TrimSpace(gjson.GetBytes(body, "id").String())
	}
	if businessErr := adapter.ExtractBusinessError(body); businessErr != nil {
		result.Success = false
		result.StatusCode = businessErr.StatusCode
		result.Message = businessErr.Message
		return result, nil
	}
	if !result.Success {
		statusCode, _, message := normalizeAnthropicUpstreamError(resp.StatusCode, providerType, body)
		result.StatusCode = statusCode
		result.Message = strings.TrimSpace(message)
		if result.Message == "" {
			result.Message = "Messages chain test failed"
		}
		return result, nil
	}

	var chatResp apicompat.ChatCompletionsResponse
	if err := json.Unmarshal(body, &chatResp); err != nil {
		result.Success = false
		result.StatusCode = http.StatusBadGateway
		result.Message = "Failed to decode upstream response"
		return result, nil
	}
	responsesResp := apicompat.ChatCompletionsToResponsesResponse(&chatResp)
	if responsesResp == nil {
		result.Success = false
		result.StatusCode = http.StatusBadGateway
		result.Message = "Failed to convert chat response to responses"
		return result, nil
	}
	anthropicResp := apicompat.ResponsesToAnthropic(responsesResp, anthropicReq.Model)
	if anthropicResp == nil {
		result.Success = false
		result.StatusCode = http.StatusBadGateway
		result.Message = "Failed to convert responses to messages"
		return result, nil
	}
	preview, err := json.MarshalIndent(anthropicResp, "", "  ")
	if err != nil {
		return nil, err
	}
	result.ResponsePreview = string(preview)
	if result.UpstreamModel == "" && chatResp.Model != "" {
		result.UpstreamModel = chatResp.Model
	}
	result.Message = "Messages chain test succeeded"
	if result.UpstreamModel != "" {
		result.Message = "Messages chain test succeeded with model: " + result.UpstreamModel
	}
	return result, nil
}

func (s *DomesticChannelExecutionService) FetchAvailableModels(
	ctx context.Context,
	providerType string,
	providerConfig map[string]any,
) (*DomesticModelsFetchResult, error) {
	if s == nil || s.httpUpstream == nil {
		return nil, errors.New("domestic channel executor unavailable")
	}

	providerType = normalizeProviderType(providerType)
	cfg, err := parseDomesticProviderRuntimeConfig(providerType, providerConfig)
	if err != nil {
		return nil, err
	}
	adapter := newDomesticProviderAdapter(providerType)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, buildDomesticModelsURL(cfg, providerType), nil)
	if err != nil {
		return nil, err
	}
	applyDomesticRequestHeaders(req, cfg, false)
	adapter.ApplyRequestHeaders(req, cfg, false)

	startTime := time.Now()
	resp, err := s.httpUpstream.Do(req, "", 0, 0)
	if err != nil {
		return &DomesticModelsFetchResult{
			Success:    false,
			StatusCode: http.StatusBadGateway,
			Message:    "Upstream request failed: " + err.Error(),
			DurationMs: time.Since(startTime).Milliseconds(),
		}, nil
	}
	defer func() { _ = resp.Body.Close() }()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	bodyText := strings.TrimSpace(string(body))
	result := &DomesticModelsFetchResult{
		Success:         resp.StatusCode >= 200 && resp.StatusCode < 300,
		StatusCode:      resp.StatusCode,
		RequestID:       strings.TrimSpace(resp.Header.Get("x-request-id")),
		ResponsePreview: bodyText,
		DurationMs:      time.Since(startTime).Milliseconds(),
	}
	if result.RequestID == "" {
		result.RequestID = strings.TrimSpace(gjson.GetBytes(body, "request_id").String())
	}
	if businessErr := adapter.ExtractBusinessError(body); businessErr != nil {
		result.Success = false
		result.StatusCode = businessErr.StatusCode
		result.Message = businessErr.Message
		return result, nil
	}
	if !result.Success {
		statusCode, _, message := normalizeResponsesUpstreamError(resp.StatusCode, providerType, body)
		result.StatusCode = statusCode
		result.Message = strings.TrimSpace(message)
		if result.Message == "" {
			result.Message = "Fetch models failed"
		}
		return result, nil
	}

	modelCatalog := extractDomesticModelCatalog(providerType, body)
	models := extractDomesticModelsFromCatalog(modelCatalog)
	if len(models) == 0 {
		models = fallbackDomesticKnownModels(providerType)
		modelCatalog = buildFallbackDomesticModelCatalog(providerType, models)
	}
	result.Models = models
	result.ModelCatalog = modelCatalog
	result.CapabilityModels = buildDomesticCapabilityModelMap(modelCatalog, providerType)
	result.Message = fmt.Sprintf("Fetched %d models", len(models))
	previewPayload := map[string]any{
		"models":            models,
		"capability_models": result.CapabilityModels,
	}
	if len(modelCatalog) > 0 {
		previewPayload["model_catalog"] = modelCatalog
	}
	preview, err := json.MarshalIndent(previewPayload, "", "  ")
	if err == nil {
		result.ResponsePreview = string(preview)
	}
	return result, nil
}

func (s *DomesticChannelExecutionService) TestEmbeddings(
	ctx context.Context,
	providerType string,
	providerConfig map[string]any,
	testModel string,
) (*DomesticEmbeddingsTestResult, error) {
	if s == nil || s.httpUpstream == nil {
		return nil, errors.New("domestic channel executor unavailable")
	}

	providerType = normalizeProviderType(providerType)
	cfg, err := parseDomesticProviderRuntimeConfig(providerType, providerConfig)
	if err != nil {
		return nil, err
	}
	adapter := newDomesticProviderAdapter(providerType)

	testModel = strings.TrimSpace(testModel)
	if testModel == "" {
		testModel = defaultDomesticEmbeddingsModel(providerType)
	}
	if testModel == "" {
		return nil, missingDomesticCapabilityTestModelError(providerType, "embeddings")
	}

	requestBody, err := json.Marshal(map[string]any{
		"model": testModel,
		"input": "ping",
	})
	if err != nil {
		return nil, err
	}
	requestBody, err = adapter.PrepareEmbeddingsBody(cfg, requestBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, buildDomesticEmbeddingsURLForModel(cfg, providerType, testModel), strings.NewReader(string(requestBody)))
	if err != nil {
		return nil, err
	}
	applyDomesticRequestHeaders(req, cfg, false)
	adapter.ApplyRequestHeaders(req, cfg, false)

	startTime := time.Now()
	resp, err := s.httpUpstream.Do(req, "", 0, 0)
	if err != nil {
		return &DomesticEmbeddingsTestResult{
			Success:    false,
			StatusCode: http.StatusBadGateway,
			Message:    "Upstream request failed: " + err.Error(),
			DurationMs: time.Since(startTime).Milliseconds(),
		}, nil
	}
	defer func() { _ = resp.Body.Close() }()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<10))
	bodyText := strings.TrimSpace(string(body))
	result := &DomesticEmbeddingsTestResult{
		Success:         resp.StatusCode >= 200 && resp.StatusCode < 300,
		StatusCode:      resp.StatusCode,
		RequestID:       strings.TrimSpace(resp.Header.Get("x-request-id")),
		UpstreamModel:   strings.TrimSpace(gjson.GetBytes(body, "model").String()),
		ResponsePreview: bodyText,
		DurationMs:      time.Since(startTime).Milliseconds(),
	}
	if result.RequestID == "" {
		result.RequestID = strings.TrimSpace(gjson.GetBytes(body, "request_id").String())
	}
	if result.UpstreamModel == "" {
		result.UpstreamModel = testModel
	}
	if businessErr := adapter.ExtractBusinessError(body); businessErr != nil {
		result.Success = false
		result.StatusCode = businessErr.StatusCode
		result.Message = businessErr.Message
		return result, nil
	}
	if !result.Success {
		statusCode, _, message := normalizeResponsesUpstreamError(resp.StatusCode, providerType, body)
		result.StatusCode = statusCode
		result.Message = strings.TrimSpace(message)
		if result.Message == "" {
			result.Message = "Embeddings request failed"
		}
		return result, nil
	}
	body, err = normalizeDomesticEmbeddingsResponse(providerType, body, result.UpstreamModel)
	if err != nil {
		result.Success = false
		result.StatusCode = http.StatusBadGateway
		result.Message = "Failed to normalize upstream embeddings response"
		return result, nil
	}
	result.ResponsePreview = strings.TrimSpace(string(body))

	result.Message = "Embeddings test succeeded"
	if count := len(gjson.GetBytes(body, "data").Array()); count > 0 {
		result.Message = fmt.Sprintf("Embeddings test succeeded with %d vector item(s)", count)
	}
	return result, nil
}

func (s *DomesticChannelExecutionService) TestRerank(
	ctx context.Context,
	providerType string,
	providerConfig map[string]any,
	testModel string,
) (*DomesticRerankTestResult, error) {
	if s == nil || s.httpUpstream == nil {
		return nil, errors.New("domestic channel executor unavailable")
	}

	providerType = normalizeProviderType(providerType)
	cfg, err := parseDomesticProviderRuntimeConfig(providerType, providerConfig)
	if err != nil {
		return nil, err
	}
	adapter := newDomesticProviderAdapter(providerType)

	testModel = strings.TrimSpace(testModel)
	if testModel == "" {
		testModel = defaultDomesticRerankModel(providerType)
	}
	if testModel == "" {
		return nil, missingDomesticCapabilityTestModelError(providerType, "rerank")
	}

	requestBody, err := json.Marshal(map[string]any{
		"model":     testModel,
		"query":     "ping",
		"documents": []string{"pong", "hello", "ping result"},
		"top_n":     2,
	})
	if err != nil {
		return nil, err
	}
	requestBody, err = adapter.PrepareRerankBody(cfg, requestBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, buildDomesticRerankURL(cfg, providerType), strings.NewReader(string(requestBody)))
	if err != nil {
		return nil, err
	}
	applyDomesticRequestHeaders(req, cfg, false)
	adapter.ApplyRequestHeaders(req, cfg, false)

	startTime := time.Now()
	resp, err := s.httpUpstream.Do(req, "", 0, 0)
	if err != nil {
		return &DomesticRerankTestResult{
			Success:    false,
			StatusCode: http.StatusBadGateway,
			Message:    "Upstream request failed: " + err.Error(),
			DurationMs: time.Since(startTime).Milliseconds(),
		}, nil
	}
	defer func() { _ = resp.Body.Close() }()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<10))
	bodyText := strings.TrimSpace(string(body))
	result := &DomesticRerankTestResult{
		Success:         resp.StatusCode >= 200 && resp.StatusCode < 300,
		StatusCode:      resp.StatusCode,
		RequestID:       strings.TrimSpace(resp.Header.Get("x-request-id")),
		UpstreamModel:   strings.TrimSpace(gjson.GetBytes(body, "model").String()),
		ResponsePreview: bodyText,
		DurationMs:      time.Since(startTime).Milliseconds(),
	}
	if result.RequestID == "" {
		result.RequestID = strings.TrimSpace(gjson.GetBytes(body, "request_id").String())
	}
	if result.UpstreamModel == "" {
		result.UpstreamModel = testModel
	}
	if businessErr := adapter.ExtractBusinessError(body); businessErr != nil {
		result.Success = false
		result.StatusCode = businessErr.StatusCode
		result.Message = businessErr.Message
		return result, nil
	}
	if !result.Success {
		statusCode, _, message := normalizeResponsesUpstreamError(resp.StatusCode, providerType, body)
		result.StatusCode = statusCode
		result.Message = strings.TrimSpace(message)
		if result.Message == "" {
			result.Message = "Rerank request failed"
		}
		return result, nil
	}

	result.Message = "Rerank test succeeded"
	if count := len(gjson.GetBytes(body, "results").Array()); count > 0 {
		result.Message = fmt.Sprintf("Rerank test succeeded with %d ranked item(s)", count)
	}
	return result, nil
}

func applyDomesticRequestHeaders(req *http.Request, cfg *domesticProviderRuntimeConfig, stream bool) {
	if req == nil || cfg == nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if stream {
		req.Header.Set("Accept", "text/event-stream")
	}
	if cfg.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	}
	for key, value := range cfg.Headers {
		if strings.TrimSpace(key) == "" || strings.TrimSpace(value) == "" {
			continue
		}
		req.Header.Set(key, value)
	}
}

func buildDomesticModelsURL(cfg *domesticProviderRuntimeConfig, providerType string) string {
	endpointPath := strings.TrimSpace(cfg.EndpointPath)
	modelsPath := defaultDomesticModelsPath(endpointPath, providerType)
	return buildDomesticRequestURL(cfg.BaseURL, modelsPath)
}

func defaultDomesticModelsPath(endpointPath string, providerType string) string {
	trimmed := strings.TrimSpace(endpointPath)
	switch {
	case strings.HasSuffix(trimmed, "/chat/completions"):
		return strings.TrimSuffix(trimmed, "/chat/completions") + "/models"
	case strings.HasSuffix(trimmed, "/v1/chat/completions"):
		return strings.TrimSuffix(trimmed, "/chat/completions") + "/models"
	}

	switch normalizeProviderType(providerType) {
	case ProviderTypeDoubao, ProviderTypeZhipu:
		return "/models"
	default:
		return "/v1/models"
	}
}

func buildDomesticEmbeddingsURLForModel(cfg *domesticProviderRuntimeConfig, providerType string, model string) string {
	endpointPath := defaultDomesticEmbeddingsPath(strings.TrimSpace(cfg.EndpointPath), providerType)
	if shouldUseDoubaoMultimodalEmbeddingsEndpoint(providerType, strings.TrimSpace(cfg.EndpointPath), model) {
		endpointPath = "/embeddings/multimodal"
	}
	return buildDomesticRequestURL(cfg.BaseURL, endpointPath)
}

func shouldUseDoubaoMultimodalEmbeddingsEndpoint(providerType string, endpointPath string, model string) bool {
	if normalizeProviderType(providerType) != ProviderTypeDoubao {
		return false
	}
	if isDomesticEmbeddingsEndpointPath(strings.TrimSpace(endpointPath)) {
		return false
	}
	return isDoubaoMultimodalEmbeddingsModel(model)
}

func buildDomesticRerankURL(cfg *domesticProviderRuntimeConfig, providerType string) string {
	endpointPath := defaultDomesticRerankPath(strings.TrimSpace(cfg.EndpointPath), providerType)
	baseURL := strings.TrimSpace(cfg.BaseURL)
	if normalizeProviderType(providerType) == ProviderTypeQwen {
		baseURL, endpointPath = normalizeQwenCompatibleRerankTarget(baseURL, strings.TrimSpace(cfg.EndpointPath), endpointPath)
	}
	return buildDomesticRequestURL(baseURL, endpointPath)
}

func defaultDomesticEmbeddingsPath(endpointPath string, providerType string) string {
	trimmed := strings.TrimSpace(endpointPath)
	switch {
	case isDomesticEmbeddingsEndpointPath(trimmed):
		return trimmed
	case strings.HasSuffix(trimmed, "/chat/completions"):
		return strings.TrimSuffix(trimmed, "/chat/completions") + "/embeddings"
	case strings.HasSuffix(trimmed, "/v1/chat/completions"):
		return strings.TrimSuffix(trimmed, "/chat/completions") + "/embeddings"
	}

	switch normalizeProviderType(providerType) {
	case ProviderTypeDoubao, ProviderTypeZhipu:
		return "/embeddings"
	default:
		return "/v1/embeddings"
	}
}

func defaultDomesticRerankPath(endpointPath string, providerType string) string {
	trimmed := strings.TrimSpace(endpointPath)
	switch {
	case isDomesticRerankEndpointPath(trimmed):
		return trimmed
	case strings.HasSuffix(trimmed, "/chat/completions"):
		if normalizeProviderType(providerType) == ProviderTypeQwen {
			return strings.TrimSuffix(trimmed, "/chat/completions") + "/reranks"
		}
		return strings.TrimSuffix(trimmed, "/chat/completions") + "/rerank"
	case strings.HasSuffix(trimmed, "/v1/chat/completions"):
		if normalizeProviderType(providerType) == ProviderTypeQwen {
			return strings.TrimSuffix(trimmed, "/chat/completions") + "/reranks"
		}
		return strings.TrimSuffix(trimmed, "/chat/completions") + "/rerank"
	}

	switch normalizeProviderType(providerType) {
	case ProviderTypeQwen:
		return "/reranks"
	case ProviderTypeDoubao, ProviderTypeZhipu:
		return "/rerank"
	default:
		return "/v1/rerank"
	}
}

func normalizeQwenCompatibleRerankTarget(baseURL string, configuredPath string, resolvedPath string) (string, string) {
	configuredPath = strings.TrimSpace(configuredPath)
	resolvedPath = strings.TrimSpace(resolvedPath)

	switch configuredPath {
	case "", "/v1/rerank", "/rerank", "/v1/reranks", "/reranks":
		return defaultQwenCompatibleRerankBaseURL(baseURL), "/reranks"
	}
	if strings.HasSuffix(configuredPath, "/chat/completions") || strings.HasSuffix(configuredPath, "/v1/chat/completions") {
		return defaultQwenCompatibleRerankBaseURL(baseURL), "/reranks"
	}
	return baseURL, resolvedPath
}

func defaultQwenCompatibleRerankBaseURL(baseURL string) string {
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		return "https://dashscope.aliyuncs.com/compatible-api/v1"
	}
	if strings.Contains(baseURL, "/compatible-api/v1") {
		return baseURL
	}
	if strings.Contains(baseURL, "/compatible-mode") {
		return strings.Replace(baseURL, "/compatible-mode", "/compatible-api/v1", 1)
	}
	if strings.Contains(baseURL, "/compatible-api") {
		return strings.Replace(baseURL, "/compatible-api", "/compatible-api/v1", 1)
	}
	return buildDomesticRequestURL(baseURL, "/compatible-api/v1")
}

func isDomesticEmbeddingsEndpointPath(endpointPath string) bool {
	trimmed := strings.ToLower(strings.TrimSpace(endpointPath))
	return trimmed != "" && strings.Contains(trimmed, "/embedding")
}

func isDomesticRerankEndpointPath(endpointPath string) bool {
	trimmed := strings.ToLower(strings.TrimSpace(endpointPath))
	return trimmed != "" && strings.Contains(trimmed, "/rerank")
}

func defaultDomesticEmbeddingsModel(providerType string) string {
	switch normalizeProviderType(providerType) {
	case ProviderTypeQwen:
		return "text-embedding-v1"
	case ProviderTypeDoubao:
		return "doubao-embedding-vision-251215"
	case ProviderTypeZhipu:
		return "embedding-3"
	default:
		return ""
	}
}

func defaultDomesticRerankModel(providerType string) string {
	switch normalizeProviderType(providerType) {
	case ProviderTypeQwen:
		return "qwen3-rerank"
	case ProviderTypeZhipu:
		return "rerank"
	default:
		return ""
	}
}

func missingDomesticCapabilityTestModelError(providerType string, capability string) error {
	providerType = normalizeProviderType(providerType)
	capability = strings.TrimSpace(strings.ToLower(capability))
	if capability == "" {
		return errors.New("test_model is required")
	}
	if providerType == ProviderTypeDoubao && capability == "rerank" {
		return errors.New("test_model is required for rerank on provider doubao; no verified public Doubao rerank model is visible in current Ark models list, please fill a custom model if your account has one")
	}
	if providerType == ProviderTypeMiniMax && capability == "rerank" {
		return errors.New("test_model is required for rerank on provider minimax; no verified public MiniMax rerank model or endpoint yet")
	}

	knownModels := knownDomesticCapabilityModels(providerType, capability)
	if len(knownModels) == 0 {
		if providerType == "" {
			return fmt.Errorf("test_model is required for %s", capability)
		}
		return fmt.Errorf("test_model is required for %s on provider %s", capability, providerType)
	}
	if providerType == "" {
		return fmt.Errorf("test_model is required for %s; known models: %s", capability, strings.Join(knownModels, ", "))
	}
	return fmt.Errorf("test_model is required for %s on provider %s; known models: %s", capability, providerType, strings.Join(knownModels, ", "))
}

func knownDomesticCapabilityModels(providerType string, capability string) []string {
	providerType = normalizeProviderType(providerType)
	capability = strings.TrimSpace(strings.ToLower(capability))

	defaultModel := ""
	switch capability {
	case "embeddings":
		defaultModel = defaultDomesticEmbeddingsModel(providerType)
	case "rerank":
		defaultModel = defaultDomesticRerankModel(providerType)
	}

	allKnown := uniqueDomesticModelList([]string{defaultModel}, fallbackDomesticKnownModels(providerType))
	if len(allKnown) == 0 {
		return nil
	}

	filtered := make([]string, 0, len(allKnown))
	for _, model := range allKnown {
		lowerModel := strings.ToLower(strings.TrimSpace(model))
		switch capability {
		case "embeddings":
			if strings.Contains(lowerModel, "embedding") ||
				(providerType == ProviderTypeMiniMax && strings.HasPrefix(lowerModel, "embo-")) {
				filtered = append(filtered, model)
			}
		case "rerank":
			if strings.Contains(lowerModel, "rerank") {
				filtered = append(filtered, model)
			}
		}
	}
	if len(filtered) > 0 {
		return filtered
	}
	if (providerType == ProviderTypeMiniMax || providerType == ProviderTypeDoubao) && capability == "rerank" {
		return nil
	}
	return allKnown
}

func uniqueDomesticModelList(items ...[]string) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0)
	for _, list := range items {
		for _, item := range list {
			model := strings.TrimSpace(item)
			if model == "" {
				continue
			}
			if _, ok := seen[model]; ok {
				continue
			}
			seen[model] = struct{}{}
			out = append(out, model)
		}
	}
	sort.Strings(out)
	return out
}

func fallbackDomesticKnownModels(providerType string) []string {
	var models []string
	switch normalizeProviderType(providerType) {
	case ProviderTypeQwen:
		models = []string{"qwen-turbo", "qwen-plus", "qwen-max", "qwen-max-longcontext", "qwq-32b", "qwen3-235b-a22b", "text-embedding-v1", "qwen3-rerank"}
	case ProviderTypeKimi:
		models = []string{"kimi-k2.6", "kimi-k2.5", "kimi-k2-0905-preview", "kimi-k2-turbo-preview", "kimi-k2-thinking", "kimi-k2-thinking-turbo"}
	case ProviderTypeZhipu:
		models = []string{"glm-4-flash", "glm-4-plus", "glm-4.6", "glm-4.6v", "glm-4.7", "glm-4.7-flash", "glm-5", "embedding-3", "embedding-2", "rerank"}
	case ProviderTypeMiniMax:
		models = []string{"MiniMax-M2.5", "MiniMax-M2.5-highspeed", "MiniMax-M2.7", "MiniMax-M2.7-highspeed", "embo-01"}
	case ProviderTypeDoubao:
		models = []string{
			"doubao-seed-2-0-pro-260215",
			"doubao-seed-1-8-251228",
			"Doubao-pro-128k",
			"Doubao-lite-128k",
			"doubao-seed-1-6-thinking-250715",
			"doubao-embedding-vision-251215",
			"doubao-embedding",
		}
	}
	out := append([]string(nil), models...)
	sort.Strings(out)
	return out
}

func extractDomesticModelCatalog(providerType string, body []byte) []DomesticFetchedModelMetadata {
	catalog := make([]DomesticFetchedModelMetadata, 0)
	seen := make(map[string]struct{})
	appendModel := func(item gjson.Result) {
		switch item.Type {
		case gjson.String:
			modelID := strings.TrimSpace(item.String())
			if modelID == "" {
				return
			}
			key := "id:" + modelID
			if _, ok := seen[key]; ok {
				return
			}
			seen[key] = struct{}{}
			catalog = append(catalog, DomesticFetchedModelMetadata{
				ID:           modelID,
				Name:         modelID,
				Capabilities: inferDomesticModelCapabilities(providerType, modelID, "", "", ""),
			})
			return
		case gjson.JSON:
			modelID := strings.TrimSpace(firstNonEmpty(
				item.Get("id").String(),
				item.Get("model").String(),
				item.Get("name").String(),
			))
			name := strings.TrimSpace(firstNonEmpty(
				item.Get("name").String(),
				item.Get("model").String(),
				item.Get("id").String(),
			))
			if modelID == "" && name == "" {
				return
			}
			version := strings.TrimSpace(item.Get("version").String())
			domain := strings.TrimSpace(item.Get("domain").String())
			taskType := strings.TrimSpace(item.Get("task_type").String())
			status := strings.TrimSpace(firstNonEmpty(item.Get("status").String(), item.Get("state").String()))
			key := strings.ToLower(strings.TrimSpace(firstNonEmpty(modelID, name)))
			if key == "" {
				return
			}
			if _, ok := seen[key]; ok {
				return
			}
			seen[key] = struct{}{}
			catalog = append(catalog, DomesticFetchedModelMetadata{
				ID:           modelID,
				Name:         name,
				Version:      version,
				Domain:       domain,
				TaskType:     taskType,
				Status:       status,
				Capabilities: inferDomesticModelCapabilities(providerType, modelID, name, domain, taskType),
			})
		}
	}

	data := gjson.GetBytes(body, "data")
	if data.Exists() && data.IsArray() {
		for _, item := range data.Array() {
			appendModel(item)
		}
	}
	models := gjson.GetBytes(body, "models")
	if models.Exists() && models.IsArray() {
		for _, item := range models.Array() {
			appendModel(item)
		}
	}

	sort.Slice(catalog, func(i, j int) bool {
		left := strings.ToLower(strings.TrimSpace(firstNonEmpty(catalog[i].ID, catalog[i].Name)))
		right := strings.ToLower(strings.TrimSpace(firstNonEmpty(catalog[j].ID, catalog[j].Name)))
		return left < right
	})
	return catalog
}

func extractDomesticModelsFromCatalog(catalog []DomesticFetchedModelMetadata) []string {
	out := make([]string, 0, len(catalog))
	for _, item := range catalog {
		model := strings.TrimSpace(firstNonEmpty(item.ID, item.Name))
		if model != "" {
			out = append(out, model)
		}
	}
	return out
}

func buildFallbackDomesticModelCatalog(providerType string, models []string) []DomesticFetchedModelMetadata {
	catalog := make([]DomesticFetchedModelMetadata, 0, len(models))
	for _, model := range models {
		model = strings.TrimSpace(model)
		if model == "" {
			continue
		}
		catalog = append(catalog, DomesticFetchedModelMetadata{
			ID:           model,
			Name:         model,
			Capabilities: inferDomesticModelCapabilities(providerType, model, model, "", ""),
		})
	}
	return catalog
}

func buildDomesticCapabilityModelMap(catalog []DomesticFetchedModelMetadata, providerType string) map[string][]string {
	capabilityModels := map[string][]string{
		"chat":       {},
		"embeddings": {},
		"rerank":     {},
	}
	seen := map[string]map[string]struct{}{
		"chat":       {},
		"embeddings": {},
		"rerank":     {},
	}
	for _, item := range catalog {
		model := strings.TrimSpace(firstNonEmpty(item.ID, item.Name))
		if model == "" {
			continue
		}
		for _, capability := range item.Capabilities {
			capability = strings.TrimSpace(strings.ToLower(capability))
			if _, ok := capabilityModels[capability]; !ok {
				continue
			}
			if _, ok := seen[capability][model]; ok {
				continue
			}
			seen[capability][model] = struct{}{}
			capabilityModels[capability] = append(capabilityModels[capability], model)
		}
	}
	for capability := range capabilityModels {
		if len(capabilityModels[capability]) > 0 {
			sort.Strings(capabilityModels[capability])
		}
		if len(capabilityModels[capability]) == 0 {
			delete(capabilityModels, capability)
		}
	}
	if len(capabilityModels) == 0 {
		return nil
	}
	return capabilityModels
}

func inferDomesticModelCapabilities(providerType string, modelID string, name string, domain string, taskType string) []string {
	parts := []string{
		strings.ToLower(strings.TrimSpace(modelID)),
		strings.ToLower(strings.TrimSpace(name)),
		strings.ToLower(strings.TrimSpace(domain)),
		strings.ToLower(strings.TrimSpace(taskType)),
	}
	joined := strings.Join(parts, " ")
	capabilities := make([]string, 0, 3)
	appendCapability := func(capability string) {
		for _, existing := range capabilities {
			if existing == capability {
				return
			}
		}
		capabilities = append(capabilities, capability)
	}

	if strings.Contains(joined, "embedding") || strings.HasPrefix(strings.TrimSpace(strings.ToLower(modelID)), "embo-") {
		appendCapability("embeddings")
	}
	if strings.Contains(joined, "rerank") || strings.Contains(joined, "retrieval") {
		appendCapability("rerank")
	}
	if len(capabilities) == 0 && couldBeDomesticChatModel(providerType, joined) {
		appendCapability("chat")
	}
	if len(capabilities) == 1 && capabilities[0] != "chat" && couldBeDomesticChatModel(providerType, joined) &&
		!strings.Contains(joined, "embedding") && !strings.Contains(joined, "rerank") && !strings.Contains(joined, "retrieval") {
		appendCapability("chat")
	}
	sort.Strings(capabilities)
	return capabilities
}

func couldBeDomesticChatModel(providerType string, joined string) bool {
	if strings.Contains(joined, "textgeneration") ||
		strings.Contains(joined, "chat") ||
		strings.Contains(joined, "llm") ||
		strings.Contains(joined, "vlm") ||
		strings.Contains(joined, "visualquestionanswering") {
		return true
	}
	switch normalizeProviderType(providerType) {
	case ProviderTypeDeepSeek:
		return strings.Contains(joined, "deepseek")
	case ProviderTypeQwen:
		return strings.Contains(joined, "qwen") || strings.Contains(joined, "qwq")
	case ProviderTypeDoubao:
		return strings.Contains(joined, "doubao") && !strings.Contains(joined, "embedding") && !strings.Contains(joined, "rerank")
	case ProviderTypeZhipu:
		return strings.Contains(joined, "glm") && !strings.Contains(joined, "embedding") && !strings.Contains(joined, "rerank")
	case ProviderTypeKimi:
		return strings.Contains(joined, "kimi")
	case ProviderTypeMiniMax:
		return strings.Contains(joined, "minimax") && !strings.Contains(joined, "embedding") && !strings.Contains(joined, "rerank")
	default:
		return false
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
