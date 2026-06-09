package service

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/dlxyz/SubioHub/internal/pkg/apicompat"
	"github.com/dlxyz/SubioHub/internal/util/responseheaders"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"golang.org/x/sync/singleflight"
)

var ErrDomesticResponseWritten = errors.New("domestic response already written")

type DomesticChannelExecutionService struct {
	channelService *ChannelService
	accountRepo    AccountRepository
	httpUpstream   HTTPUpstream
	accountSF      singleflight.Group
}

type DomesticConnectionTestResult struct {
	Success         bool   `json:"success"`
	StatusCode      int    `json:"status_code"`
	Message         string `json:"message"`
	RequestID       string `json:"request_id,omitempty"`
	UpstreamModel   string `json:"upstream_model,omitempty"`
	ResponsePreview string `json:"response_preview,omitempty"`
	DurationMs      int64  `json:"duration_ms"`
}

type domesticProviderRuntimeConfig struct {
	BaseURL      string
	APIKey       string
	EndpointPath string
	Headers      map[string]string
}

func NewDomesticChannelExecutionService(channelService *ChannelService, accountRepo AccountRepository, httpUpstream HTTPUpstream) *DomesticChannelExecutionService {
	return &DomesticChannelExecutionService{
		channelService: channelService,
		accountRepo:    accountRepo,
		httpUpstream:   httpUpstream,
	}
}

func (s *DomesticChannelExecutionService) GetDomesticChannelForGroup(ctx context.Context, groupID *int64) (*Channel, error) {
	if groupID == nil || s == nil || s.channelService == nil {
		return nil, nil
	}
	ch, err := s.channelService.GetChannelForGroup(ctx, *groupID)
	if err != nil || ch == nil {
		return ch, err
	}
	if normalizeProviderType(ch.ProviderType) == ProviderTypeStandard {
		return nil, nil
	}
	return ch, nil
}

func (s *DomesticChannelExecutionService) ForwardOpenAIChatCompletions(
	ctx context.Context,
	c *gin.Context,
	channel *Channel,
	body []byte,
	requestedModel string,
) (*OpenAIForwardResult, error) {
	if s == nil || s.httpUpstream == nil {
		writeChatCompletionsError(c, http.StatusServiceUnavailable, "api_error", "Domestic channel executor unavailable")
		return nil, ErrDomesticResponseWritten
	}
	if channel == nil {
		writeChatCompletionsError(c, http.StatusBadRequest, "invalid_request_error", "Domestic channel not configured")
		return nil, ErrDomesticResponseWritten
	}

	providerType := normalizeProviderType(channel.ProviderType)
	cfg, err := parseDomesticProviderRuntimeConfig(providerType, channel.ProviderConfig)
	if err != nil {
		writeChatCompletionsError(c, http.StatusBadRequest, "invalid_request_error", err.Error())
		return nil, ErrDomesticResponseWritten
	}
	adapter := newDomesticProviderAdapter(providerType)
	body, err = adapter.PrepareChatCompletionsBody(cfg, body)
	if err != nil {
		writeChatCompletionsError(c, http.StatusBadRequest, "invalid_request_error", "Failed to normalize upstream request")
		return nil, ErrDomesticResponseWritten
	}

	stream := gjson.GetBytes(body, "stream").Bool()
	upstreamModel := strings.TrimSpace(gjson.GetBytes(body, "model").String())
	if upstreamModel == "" {
		upstreamModel = requestedModel
	}
	req, err := s.buildDomesticJSONRequest(ctx, c, adapter, cfg, buildDomesticChatCompletionsURL(cfg), body, stream)
	if err != nil {
		writeChatCompletionsError(c, http.StatusBadGateway, "upstream_error", "Failed to create upstream request")
		return nil, ErrDomesticResponseWritten
	}

	startTime := time.Now()
	resp, err := s.httpUpstream.Do(req, "", 0, 0)
	if err != nil {
		writeChatCompletionsError(c, http.StatusBadGateway, "upstream_error", "Upstream request failed")
		return nil, ErrDomesticResponseWritten
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
		responseheaders.WriteFilteredHeaders(c.Writer.Header(), resp.Header, nil)
		if len(respBody) == 0 {
			writeChatCompletionsError(c, http.StatusBadGateway, "upstream_error", "Upstream request failed")
			return nil, ErrDomesticResponseWritten
		}
		c.Data(resp.StatusCode, strings.TrimSpace(resp.Header.Get("Content-Type")), respBody)
		return nil, ErrDomesticResponseWritten
	}

	if stream {
		return s.forwardDomesticChatCompletionsStream(c, resp, requestedModel, upstreamModel, startTime, adapter)
	}
	return s.forwardDomesticChatCompletionsBuffered(c, resp, requestedModel, upstreamModel, startTime, adapter)
}

func (s *DomesticChannelExecutionService) ForwardOpenAIEmbeddings(
	ctx context.Context,
	c *gin.Context,
	channel *Channel,
	body []byte,
	requestedModel string,
) (*OpenAIForwardResult, error) {
	if s == nil || s.httpUpstream == nil {
		writeChatCompletionsError(c, http.StatusServiceUnavailable, "api_error", "Domestic channel executor unavailable")
		return nil, ErrDomesticResponseWritten
	}
	if channel == nil {
		writeChatCompletionsError(c, http.StatusBadRequest, "invalid_request_error", "Domestic channel not configured")
		return nil, ErrDomesticResponseWritten
	}

	providerType := normalizeProviderType(channel.ProviderType)
	cfg, err := parseDomesticProviderRuntimeConfig(providerType, channel.ProviderConfig)
	if err != nil {
		writeChatCompletionsError(c, http.StatusBadRequest, "invalid_request_error", err.Error())
		return nil, ErrDomesticResponseWritten
	}
	adapter := newDomesticProviderAdapter(providerType)
	body, err = adapter.PrepareEmbeddingsBody(cfg, body)
	if err != nil {
		writeChatCompletionsError(c, http.StatusBadRequest, "invalid_request_error", "Failed to normalize upstream request")
		return nil, ErrDomesticResponseWritten
	}
	upstreamModel := strings.TrimSpace(gjson.GetBytes(body, "model").String())
	if upstreamModel == "" {
		upstreamModel = requestedModel
	}

	req, err := s.buildDomesticJSONRequest(ctx, c, adapter, cfg, buildDomesticEmbeddingsURLForModel(cfg, providerType, upstreamModel), body, false)
	if err != nil {
		writeChatCompletionsError(c, http.StatusBadGateway, "upstream_error", "Failed to create upstream request")
		return nil, ErrDomesticResponseWritten
	}

	startTime := time.Now()
	resp, err := s.httpUpstream.Do(req, "", 0, 0)
	if err != nil {
		writeChatCompletionsError(c, http.StatusBadGateway, "upstream_error", "Upstream request failed")
		return nil, ErrDomesticResponseWritten
	}
	defer func() { _ = resp.Body.Close() }()

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		writeChatCompletionsError(c, http.StatusBadGateway, "upstream_error", "Failed to read upstream response")
		return nil, ErrDomesticResponseWritten
	}
	if businessErr := adapter.ExtractBusinessError(bodyBytes); businessErr != nil {
		writeChatCompletionsError(c, businessErr.StatusCode, businessErr.Code, businessErr.Message)
		return nil, ErrDomesticResponseWritten
	}
	if resp.StatusCode >= 400 {
		statusCode, code, message := normalizeResponsesUpstreamError(resp.StatusCode, providerType, bodyBytes)
		writeChatCompletionsError(c, statusCode, code, message)
		return nil, ErrDomesticResponseWritten
	}
	bodyBytes, err = normalizeDomesticEmbeddingsResponse(providerType, bodyBytes, upstreamModel)
	if err != nil {
		writeChatCompletionsError(c, http.StatusBadGateway, "upstream_error", "Failed to normalize upstream embeddings response")
		return nil, ErrDomesticResponseWritten
	}

	responseheaders.WriteFilteredHeaders(c.Writer.Header(), resp.Header, nil)
	c.Data(resp.StatusCode, strings.TrimSpace(resp.Header.Get("Content-Type")), bodyBytes)

	result := &OpenAIForwardResult{
		RequestID:     strings.TrimSpace(resp.Header.Get("x-request-id")),
		Model:         requestedModel,
		UpstreamModel: upstreamModel,
		Stream:        false,
		Duration:      time.Since(startTime),
	}
	if model := strings.TrimSpace(gjson.GetBytes(bodyBytes, "model").String()); model != "" {
		result.UpstreamModel = model
	}
	if requestID := strings.TrimSpace(gjson.GetBytes(bodyBytes, "request_id").String()); requestID != "" && result.RequestID == "" {
		result.RequestID = requestID
	}
	if result.RequestID == "" {
		result.RequestID = strings.TrimSpace(gjson.GetBytes(bodyBytes, "id").String())
	}

	inputTokens := int(gjson.GetBytes(bodyBytes, "usage.prompt_tokens").Int())
	totalTokens := int(gjson.GetBytes(bodyBytes, "usage.total_tokens").Int())
	if inputTokens == 0 && totalTokens > 0 {
		inputTokens = totalTokens
	}
	result.Usage = OpenAIUsage{
		InputTokens:  inputTokens,
		OutputTokens: 0,
	}
	return result, nil
}

func (s *DomesticChannelExecutionService) ForwardOpenAIRerank(
	ctx context.Context,
	c *gin.Context,
	channel *Channel,
	body []byte,
	requestedModel string,
) (*OpenAIForwardResult, error) {
	if s == nil || s.httpUpstream == nil {
		writeChatCompletionsError(c, http.StatusServiceUnavailable, "api_error", "Domestic channel executor unavailable")
		return nil, ErrDomesticResponseWritten
	}
	if channel == nil {
		writeChatCompletionsError(c, http.StatusBadRequest, "invalid_request_error", "Domestic channel not configured")
		return nil, ErrDomesticResponseWritten
	}

	providerType := normalizeProviderType(channel.ProviderType)
	cfg, err := parseDomesticProviderRuntimeConfig(providerType, channel.ProviderConfig)
	if err != nil {
		writeChatCompletionsError(c, http.StatusBadRequest, "invalid_request_error", err.Error())
		return nil, ErrDomesticResponseWritten
	}
	adapter := newDomesticProviderAdapter(providerType)
	body, err = adapter.PrepareRerankBody(cfg, body)
	if err != nil {
		writeChatCompletionsError(c, http.StatusBadRequest, "invalid_request_error", "Failed to normalize upstream request")
		return nil, ErrDomesticResponseWritten
	}
	upstreamModel := strings.TrimSpace(gjson.GetBytes(body, "model").String())
	if upstreamModel == "" {
		upstreamModel = requestedModel
	}

	req, err := s.buildDomesticJSONRequest(ctx, c, adapter, cfg, buildDomesticRerankURL(cfg, providerType), body, false)
	if err != nil {
		writeChatCompletionsError(c, http.StatusBadGateway, "upstream_error", "Failed to create upstream request")
		return nil, ErrDomesticResponseWritten
	}

	startTime := time.Now()
	resp, err := s.httpUpstream.Do(req, "", 0, 0)
	if err != nil {
		writeChatCompletionsError(c, http.StatusBadGateway, "upstream_error", "Upstream request failed")
		return nil, ErrDomesticResponseWritten
	}
	defer func() { _ = resp.Body.Close() }()

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		writeChatCompletionsError(c, http.StatusBadGateway, "upstream_error", "Failed to read upstream response")
		return nil, ErrDomesticResponseWritten
	}
	if businessErr := adapter.ExtractBusinessError(bodyBytes); businessErr != nil {
		writeChatCompletionsError(c, businessErr.StatusCode, businessErr.Code, businessErr.Message)
		return nil, ErrDomesticResponseWritten
	}
	if resp.StatusCode >= 400 {
		statusCode, code, message := normalizeResponsesUpstreamError(resp.StatusCode, providerType, bodyBytes)
		writeChatCompletionsError(c, statusCode, code, message)
		return nil, ErrDomesticResponseWritten
	}

	responseheaders.WriteFilteredHeaders(c.Writer.Header(), resp.Header, nil)
	c.Data(resp.StatusCode, strings.TrimSpace(resp.Header.Get("Content-Type")), bodyBytes)

	result := &OpenAIForwardResult{
		RequestID:     strings.TrimSpace(resp.Header.Get("x-request-id")),
		Model:         requestedModel,
		UpstreamModel: upstreamModel,
		Stream:        false,
		Duration:      time.Since(startTime),
	}
	if model := strings.TrimSpace(gjson.GetBytes(bodyBytes, "model").String()); model != "" {
		result.UpstreamModel = model
	}
	if requestID := strings.TrimSpace(gjson.GetBytes(bodyBytes, "request_id").String()); requestID != "" && result.RequestID == "" {
		result.RequestID = requestID
	}
	if result.RequestID == "" {
		result.RequestID = strings.TrimSpace(gjson.GetBytes(bodyBytes, "id").String())
	}

	inputTokens := int(gjson.GetBytes(bodyBytes, "usage.prompt_tokens").Int())
	totalTokens := int(gjson.GetBytes(bodyBytes, "usage.total_tokens").Int())
	if inputTokens == 0 && totalTokens > 0 {
		inputTokens = totalTokens
	}
	result.Usage = OpenAIUsage{
		InputTokens:  inputTokens,
		OutputTokens: 0,
	}
	return result, nil
}

func (s *DomesticChannelExecutionService) ForwardOpenAIResponses(
	ctx context.Context,
	c *gin.Context,
	channel *Channel,
	body []byte,
	requestedModel string,
) (*OpenAIForwardResult, error) {
	if s == nil || s.httpUpstream == nil {
		writeResponsesError(c, http.StatusServiceUnavailable, "api_error", "Domestic channel executor unavailable")
		return nil, ErrDomesticResponseWritten
	}
	if channel == nil {
		writeResponsesError(c, http.StatusBadRequest, "invalid_request_error", "Domestic channel not configured")
		return nil, ErrDomesticResponseWritten
	}

	providerType := normalizeProviderType(channel.ProviderType)
	cfg, err := parseDomesticProviderRuntimeConfig(providerType, channel.ProviderConfig)
	if err != nil {
		writeResponsesError(c, http.StatusBadRequest, "invalid_request_error", err.Error())
		return nil, ErrDomesticResponseWritten
	}
	adapter := newDomesticProviderAdapter(providerType)

	var responsesReq apicompat.ResponsesRequest
	if err := json.Unmarshal(body, &responsesReq); err != nil {
		writeResponsesError(c, http.StatusBadRequest, "invalid_request_error", "Failed to parse responses request")
		return nil, ErrDomesticResponseWritten
	}
	chatReq, err := apicompat.ResponsesToChatCompletionsRequest(&responsesReq)
	if err != nil {
		writeResponsesError(c, http.StatusBadRequest, "invalid_request_error", err.Error())
		return nil, ErrDomesticResponseWritten
	}
	chatBody, err := json.Marshal(chatReq)
	if err != nil {
		writeResponsesError(c, http.StatusBadGateway, "api_error", "Failed to encode upstream request")
		return nil, ErrDomesticResponseWritten
	}
	chatBody, err = adapter.PrepareChatCompletionsBody(cfg, chatBody)
	if err != nil {
		writeResponsesError(c, http.StatusBadRequest, "invalid_request_error", "Failed to normalize upstream request")
		return nil, ErrDomesticResponseWritten
	}
	effectiveStream := gjson.GetBytes(chatBody, "stream").Bool()

	upstreamModel := strings.TrimSpace(chatReq.Model)
	if upstreamModel == "" {
		upstreamModel = requestedModel
	}
	req, err := s.buildDomesticJSONRequest(ctx, c, adapter, cfg, buildDomesticChatCompletionsURL(cfg), chatBody, effectiveStream)
	if err != nil {
		writeResponsesError(c, http.StatusBadGateway, "upstream_error", "Failed to create upstream request")
		return nil, ErrDomesticResponseWritten
	}

	startTime := time.Now()
	resp, err := s.httpUpstream.Do(req, "", 0, 0)
	if err != nil {
		writeResponsesError(c, http.StatusBadGateway, "upstream_error", "Upstream request failed")
		return nil, ErrDomesticResponseWritten
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
		statusCode, code, message := normalizeResponsesUpstreamError(resp.StatusCode, providerType, respBody)
		writeResponsesError(c, statusCode, code, message)
		return nil, ErrDomesticResponseWritten
	}

	if effectiveStream {
		return s.forwardDomesticResponsesStream(c, resp, requestedModel, upstreamModel, startTime, adapter)
	}
	return s.forwardDomesticResponsesBuffered(c, resp, requestedModel, upstreamModel, startTime, adapter)
}

func (s *DomesticChannelExecutionService) ForwardAnthropicMessages(
	ctx context.Context,
	c *gin.Context,
	channel *Channel,
	body []byte,
	requestedModel string,
) (*OpenAIForwardResult, error) {
	if s == nil || s.httpUpstream == nil {
		writeAnthropicError(c, http.StatusServiceUnavailable, "api_error", "Domestic channel executor unavailable")
		return nil, ErrDomesticResponseWritten
	}
	if channel == nil {
		writeAnthropicError(c, http.StatusBadRequest, "invalid_request_error", "Domestic channel not configured")
		return nil, ErrDomesticResponseWritten
	}

	providerType := normalizeProviderType(channel.ProviderType)
	cfg, err := parseDomesticProviderRuntimeConfig(providerType, channel.ProviderConfig)
	if err != nil {
		writeAnthropicError(c, http.StatusBadRequest, "invalid_request_error", err.Error())
		return nil, ErrDomesticResponseWritten
	}
	adapter := newDomesticProviderAdapter(providerType)

	var anthropicReq apicompat.AnthropicRequest
	if err := json.Unmarshal(body, &anthropicReq); err != nil {
		writeAnthropicError(c, http.StatusBadRequest, "invalid_request_error", "Failed to parse messages request")
		return nil, ErrDomesticResponseWritten
	}

	responsesReq, err := apicompat.AnthropicToResponses(&anthropicReq)
	if err != nil {
		writeAnthropicError(c, http.StatusBadRequest, "invalid_request_error", err.Error())
		return nil, ErrDomesticResponseWritten
	}

	chatReq, err := apicompat.ResponsesToChatCompletionsRequest(responsesReq)
	if err != nil {
		writeAnthropicError(c, http.StatusBadRequest, "invalid_request_error", err.Error())
		return nil, ErrDomesticResponseWritten
	}
	chatBody, err := json.Marshal(chatReq)
	if err != nil {
		writeAnthropicError(c, http.StatusBadGateway, "api_error", "Failed to encode upstream request")
		return nil, ErrDomesticResponseWritten
	}
	chatBody, err = adapter.PrepareChatCompletionsBody(cfg, chatBody)
	if err != nil {
		writeAnthropicError(c, http.StatusBadRequest, "invalid_request_error", "Failed to normalize upstream request")
		return nil, ErrDomesticResponseWritten
	}
	effectiveStream := gjson.GetBytes(chatBody, "stream").Bool()

	upstreamModel := strings.TrimSpace(chatReq.Model)
	if upstreamModel == "" {
		upstreamModel = requestedModel
	}
	req, err := s.buildDomesticJSONRequest(ctx, c, adapter, cfg, buildDomesticChatCompletionsURL(cfg), chatBody, effectiveStream)
	if err != nil {
		writeAnthropicError(c, http.StatusBadGateway, "api_error", "Failed to create upstream request")
		return nil, ErrDomesticResponseWritten
	}

	startTime := time.Now()
	resp, err := s.httpUpstream.Do(req, "", 0, 0)
	if err != nil {
		writeAnthropicError(c, http.StatusBadGateway, "api_error", "Upstream request failed")
		return nil, ErrDomesticResponseWritten
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
		statusCode, errType, message := normalizeAnthropicUpstreamError(resp.StatusCode, providerType, respBody)
		writeAnthropicError(c, statusCode, errType, message)
		return nil, ErrDomesticResponseWritten
	}

	if effectiveStream {
		return s.forwardDomesticAnthropicMessagesStream(c, resp, requestedModel, upstreamModel, startTime, adapter)
	}
	return s.forwardDomesticAnthropicMessagesBuffered(c, resp, requestedModel, upstreamModel, startTime, adapter)
}

func (s *DomesticChannelExecutionService) EnsureUsageAccountForChannel(ctx context.Context, channel *Channel) (*Account, error) {
	if s == nil || s.accountRepo == nil || channel == nil {
		return nil, nil
	}
	key := fmt.Sprintf("domestic-usage-account:%d", channel.ID)
	value, err, _ := s.accountSF.Do(key, func() (any, error) {
		if account := s.findDomesticUsageAccount(ctx, channel.ID); account != nil {
			return account, nil
		}
		account := &Account{
			Name:        buildDomesticUsageAccountName(channel),
			Platform:    PlatformOpenAI,
			Type:        AccountTypeOAuth,
			Credentials: map[string]any{},
			Extra: map[string]any{
				"domestic_virtual":       true,
				"domestic_channel_id":    channel.ID,
				"domestic_provider_type": normalizeProviderType(channel.ProviderType),
			},
			Concurrency: 1,
			Priority:    9999,
			Status:      StatusDisabled,
			Schedulable: false,
		}
		if err := s.accountRepo.Create(ctx, account); err != nil {
			if existing := s.findDomesticUsageAccount(ctx, channel.ID); existing != nil {
				return existing, nil
			}
			return nil, err
		}
		return account, nil
	})
	if err != nil || value == nil {
		return nil, err
	}
	account, _ := value.(*Account)
	return account, nil
}

func (s *DomesticChannelExecutionService) TestConnection(
	ctx context.Context,
	providerType string,
	providerConfig map[string]any,
	testModel string,
) (*DomesticConnectionTestResult, error) {
	if s == nil || s.httpUpstream == nil {
		return nil, errors.New("domestic channel executor unavailable")
	}

	cfg, err := parseDomesticProviderRuntimeConfig(normalizeProviderType(providerType), providerConfig)
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

	temperature := 0.0
	if normalizeProviderType(providerType) == ProviderTypeKimi {
		// Kimi's current chat models reject diagnostic probes with temperature=0.
		temperature = 1
	}

	requestBody, err := json.Marshal(map[string]any{
		"model":       testModel,
		"messages":    []map[string]string{{"role": "user", "content": "ping"}},
		"max_tokens":  1,
		"temperature": temperature,
		"stream":      false,
	})
	if err != nil {
		return nil, err
	}
	requestBody, err = adapter.PrepareChatCompletionsBody(cfg, requestBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, buildDomesticChatCompletionsURL(cfg), bytes.NewReader(requestBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if cfg.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	}
	for key, value := range cfg.Headers {
		if strings.TrimSpace(key) == "" || strings.TrimSpace(value) == "" {
			continue
		}
		req.Header.Set(key, value)
	}
	adapter.ApplyRequestHeaders(req, cfg, false)

	startTime := time.Now()
	resp, err := s.httpUpstream.Do(req, "", 0, 0)
	if err != nil {
		return &DomesticConnectionTestResult{
			Success:    false,
			StatusCode: http.StatusBadGateway,
			Message:    "Upstream request failed: " + err.Error(),
			DurationMs: time.Since(startTime).Milliseconds(),
		}, nil
	}
	defer func() { _ = resp.Body.Close() }()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<10))
	bodyText := strings.TrimSpace(string(body))
	result := &DomesticConnectionTestResult{
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
	if result.UpstreamModel == "" {
		result.UpstreamModel = testModel
	}
	if businessErr := adapter.ExtractBusinessError(body); businessErr != nil {
		result.Success = false
		result.StatusCode = businessErr.StatusCode
		result.Message = businessErr.Message
		return result, nil
	}
	if result.Success {
		result.Message = "Connection test succeeded"
		if result.UpstreamModel != "" {
			result.Message = "Connection test succeeded with model: " + result.UpstreamModel
		}
		return result, nil
	}

	message := extractUpstreamErrorMessage(body)
	if strings.TrimSpace(message) == "" {
		message = bodyText
	}
	if strings.TrimSpace(message) == "" {
		message = "Upstream request failed"
	}
	result.Message = message
	return result, nil
}

func parseDomesticProviderRuntimeConfig(providerType string, raw map[string]any) (*domesticProviderRuntimeConfig, error) {
	cfg := &domesticProviderRuntimeConfig{
		Headers: map[string]string{},
	}
	if raw != nil {
		cfg.BaseURL = extractString(raw["base_url"])
		cfg.APIKey = extractString(raw["api_key"])
		cfg.EndpointPath = extractString(raw["endpoint_path"])
		if headers, ok := raw["headers"].(map[string]any); ok {
			for key, value := range headers {
				if text := extractString(value); text != "" {
					cfg.Headers[key] = text
				}
			}
		}
	}
	switch providerType {
	case ProviderTypeDeepSeek:
		if cfg.BaseURL == "" {
			cfg.BaseURL = "https://api.deepseek.com"
		}
		if cfg.EndpointPath == "" {
			cfg.EndpointPath = "/v1/chat/completions"
		}
	case ProviderTypeQwen:
		if cfg.BaseURL == "" {
			cfg.BaseURL = "https://dashscope.aliyuncs.com/compatible-mode"
		}
		if cfg.EndpointPath == "" {
			cfg.EndpointPath = "/v1/chat/completions"
		}
	case ProviderTypeDoubao:
		if cfg.BaseURL == "" {
			cfg.BaseURL = "https://ark.cn-beijing.volces.com/api/v3"
		}
		if cfg.EndpointPath == "" {
			cfg.EndpointPath = "/chat/completions"
		}
	case ProviderTypeZhipu:
		if cfg.BaseURL == "" {
			cfg.BaseURL = "https://open.bigmodel.cn/api/paas/v4"
		}
		if cfg.EndpointPath == "" {
			cfg.EndpointPath = "/chat/completions"
		}
	case ProviderTypeKimi:
		if cfg.BaseURL == "" {
			cfg.BaseURL = "https://api.moonshot.cn"
		}
		if cfg.EndpointPath == "" {
			cfg.EndpointPath = "/v1/chat/completions"
		}
	case ProviderTypeMiniMax:
		if cfg.BaseURL == "" {
			cfg.BaseURL = "https://api.minimaxi.com"
		}
		if cfg.EndpointPath == "" {
			cfg.EndpointPath = "/v1/text/chatcompletion_v2"
		}
	case ProviderTypeOpenAICompatDomestic, ProviderTypeCustomDomestic:
	default:
		return nil, fmt.Errorf("unsupported domestic provider type: %s", providerType)
	}
	if cfg.BaseURL == "" {
		return nil, errors.New("provider_config.base_url is required")
	}
	if cfg.APIKey == "" {
		return nil, errors.New("provider_config.api_key is required")
	}
	return cfg, nil
}

func buildDomesticChatCompletionsURL(cfg *domesticProviderRuntimeConfig) string {
	endpointPath := strings.TrimSpace(cfg.EndpointPath)
	if endpointPath == "" {
		endpointPath = "/v1/chat/completions"
	}
	return buildDomesticRequestURL(cfg.BaseURL, endpointPath)
}

func buildDomesticRequestURL(baseURL string, endpointPath string) string {
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		return ""
	}

	endpointPath = "/" + strings.TrimLeft(strings.TrimSpace(endpointPath), "/")
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return strings.TrimRight(baseURL, "/") + endpointPath
	}

	basePath := strings.TrimRight(strings.TrimSpace(parsed.Path), "/")
	switch {
	case basePath == "":
		parsed.Path = endpointPath
	case endpointPath == basePath || strings.HasPrefix(endpointPath, basePath+"/"):
		// Avoid duplicating shared prefixes like `/v1` when users configure
		// provider docs-style base URLs such as `https://api.moonshot.ai/v1`.
		parsed.Path = endpointPath
	default:
		parsed.Path = basePath + endpointPath
	}
	return parsed.String()
}

func (s *DomesticChannelExecutionService) buildDomesticJSONRequest(
	ctx context.Context,
	c *gin.Context,
	adapter DomesticProviderAdapter,
	cfg *domesticProviderRuntimeConfig,
	requestURL string,
	body []byte,
	stream bool,
) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if stream {
		req.Header.Set("Accept", "text/event-stream")
	}
	if ua := strings.TrimSpace(c.Request.Header.Get("User-Agent")); ua != "" {
		req.Header.Set("User-Agent", ua)
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
	if adapter != nil {
		adapter.ApplyRequestHeaders(req, cfg, stream)
	}
	return req, nil
}

func (s *DomesticChannelExecutionService) forwardDomesticChatCompletionsBuffered(
	c *gin.Context,
	resp *http.Response,
	requestedModel string,
	upstreamModel string,
	startTime time.Time,
	adapter DomesticProviderAdapter,
) (*OpenAIForwardResult, error) {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		writeChatCompletionsError(c, http.StatusBadGateway, "upstream_error", "Failed to read upstream response")
		return nil, ErrDomesticResponseWritten
	}
	if businessErr := adapter.ExtractBusinessError(body); businessErr != nil {
		writeChatCompletionsError(c, businessErr.StatusCode, businessErr.Code, businessErr.Message)
		return nil, ErrDomesticResponseWritten
	}

	responseheaders.WriteFilteredHeaders(c.Writer.Header(), resp.Header, nil)
	c.Data(resp.StatusCode, strings.TrimSpace(resp.Header.Get("Content-Type")), body)

	result := &OpenAIForwardResult{
		RequestID:     strings.TrimSpace(resp.Header.Get("x-request-id")),
		Model:         requestedModel,
		UpstreamModel: upstreamModel,
		Stream:        false,
		Duration:      time.Since(startTime),
	}
	if model := strings.TrimSpace(gjson.GetBytes(body, "model").String()); model != "" {
		result.UpstreamModel = model
	}
	if requestID := strings.TrimSpace(gjson.GetBytes(body, "id").String()); requestID != "" && result.RequestID == "" {
		result.RequestID = requestID
	}
	result.Usage = OpenAIUsage{
		InputTokens:              int(gjson.GetBytes(body, "usage.prompt_tokens").Int()),
		OutputTokens:             int(gjson.GetBytes(body, "usage.completion_tokens").Int()),
		CacheCreationInputTokens: int(gjson.GetBytes(body, "usage.prompt_cache_write_tokens").Int()),
		CacheReadInputTokens:     int(gjson.GetBytes(body, "usage.prompt_cache_hit_tokens").Int()),
	}
	return result, nil
}

func (s *DomesticChannelExecutionService) forwardDomesticResponsesBuffered(
	c *gin.Context,
	resp *http.Response,
	requestedModel string,
	upstreamModel string,
	startTime time.Time,
	adapter DomesticProviderAdapter,
) (*OpenAIForwardResult, error) {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		writeResponsesError(c, http.StatusBadGateway, "upstream_error", "Failed to read upstream response")
		return nil, ErrDomesticResponseWritten
	}
	if businessErr := adapter.ExtractBusinessError(body); businessErr != nil {
		writeResponsesError(c, businessErr.StatusCode, businessErr.Code, businessErr.Message)
		return nil, ErrDomesticResponseWritten
	}

	var chatResp apicompat.ChatCompletionsResponse
	if err := json.Unmarshal(body, &chatResp); err != nil {
		writeResponsesError(c, http.StatusBadGateway, "upstream_error", "Failed to parse upstream response")
		return nil, ErrDomesticResponseWritten
	}
	responsesResp := apicompat.ChatCompletionsToResponsesResponse(&chatResp)
	if responsesResp == nil {
		writeResponsesError(c, http.StatusBadGateway, "upstream_error", "Failed to convert upstream response")
		return nil, ErrDomesticResponseWritten
	}

	responseheaders.WriteFilteredHeaders(c.Writer.Header(), resp.Header, nil)
	c.JSON(http.StatusOK, responsesResp)

	result := &OpenAIForwardResult{
		RequestID:     strings.TrimSpace(resp.Header.Get("x-request-id")),
		Model:         requestedModel,
		UpstreamModel: upstreamModel,
		Stream:        false,
		Duration:      time.Since(startTime),
	}
	if chatResp.Model != "" {
		result.UpstreamModel = chatResp.Model
	}
	if result.RequestID == "" {
		result.RequestID = strings.TrimSpace(chatResp.ID)
	}
	if chatResp.Usage != nil {
		result.Usage = OpenAIUsage{
			InputTokens:          chatResp.Usage.PromptTokens,
			OutputTokens:         chatResp.Usage.CompletionTokens,
			CacheReadInputTokens: 0,
		}
		if chatResp.Usage.PromptTokensDetails != nil {
			result.Usage.CacheReadInputTokens = chatResp.Usage.PromptTokensDetails.CachedTokens
		}
	}
	return result, nil
}

func (s *DomesticChannelExecutionService) forwardDomesticAnthropicMessagesBuffered(
	c *gin.Context,
	resp *http.Response,
	requestedModel string,
	upstreamModel string,
	startTime time.Time,
	adapter DomesticProviderAdapter,
) (*OpenAIForwardResult, error) {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		writeAnthropicError(c, http.StatusBadGateway, "api_error", "Failed to read upstream response")
		return nil, ErrDomesticResponseWritten
	}
	if businessErr := adapter.ExtractBusinessError(body); businessErr != nil {
		writeAnthropicError(c, businessErr.StatusCode, businessErr.Code, businessErr.Message)
		return nil, ErrDomesticResponseWritten
	}

	var chatResp apicompat.ChatCompletionsResponse
	if err := json.Unmarshal(body, &chatResp); err != nil {
		writeAnthropicError(c, http.StatusBadGateway, "api_error", "Failed to parse upstream response")
		return nil, ErrDomesticResponseWritten
	}
	responsesResp := apicompat.ChatCompletionsToResponsesResponse(&chatResp)
	if responsesResp == nil {
		writeAnthropicError(c, http.StatusBadGateway, "api_error", "Failed to convert upstream response")
		return nil, ErrDomesticResponseWritten
	}
	anthropicResp := apicompat.ResponsesToAnthropic(responsesResp, requestedModel)
	if anthropicResp == nil {
		writeAnthropicError(c, http.StatusBadGateway, "api_error", "Failed to convert upstream response")
		return nil, ErrDomesticResponseWritten
	}

	responseheaders.WriteFilteredHeaders(c.Writer.Header(), resp.Header, nil)
	c.JSON(http.StatusOK, anthropicResp)

	result := &OpenAIForwardResult{
		RequestID:     strings.TrimSpace(resp.Header.Get("x-request-id")),
		Model:         requestedModel,
		UpstreamModel: upstreamModel,
		Stream:        false,
		Duration:      time.Since(startTime),
		Usage: OpenAIUsage{
			InputTokens:              anthropicResp.Usage.InputTokens,
			OutputTokens:             anthropicResp.Usage.OutputTokens,
			CacheCreationInputTokens: anthropicResp.Usage.CacheCreationInputTokens,
			CacheReadInputTokens:     anthropicResp.Usage.CacheReadInputTokens,
		},
	}
	if chatResp.Model != "" {
		result.UpstreamModel = chatResp.Model
	}
	if result.RequestID == "" {
		result.RequestID = strings.TrimSpace(chatResp.ID)
	}
	return result, nil
}

func (s *DomesticChannelExecutionService) forwardDomesticChatCompletionsStream(
	c *gin.Context,
	resp *http.Response,
	requestedModel string,
	upstreamModel string,
	startTime time.Time,
	adapter DomesticProviderAdapter,
) (*OpenAIForwardResult, error) {
	responseheaders.WriteFilteredHeaders(c.Writer.Header(), resp.Header, nil)
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	c.Writer.WriteHeader(http.StatusOK)

	flusher, _ := c.Writer.(http.Flusher)
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	result := &OpenAIForwardResult{
		RequestID:     strings.TrimSpace(resp.Header.Get("x-request-id")),
		Model:         requestedModel,
		UpstreamModel: upstreamModel,
		Stream:        true,
		Duration:      time.Since(startTime),
	}

	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data: ") {
			payload := strings.TrimSpace(strings.TrimPrefix(line, "data: "))
			if payload != "" && payload != "[DONE]" && gjson.Valid(payload) {
				if businessErr := adapter.ExtractBusinessError([]byte(payload)); businessErr != nil {
					_ = writeChatCompletionsStreamErrorEvent(c, flusher, businessErr.Code, businessErr.Message)
					return nil, ErrDomesticResponseWritten
				}
			}
		}
		if _, err := c.Writer.Write([]byte(line + "\n")); err != nil {
			return nil, ErrDomesticResponseWritten
		}
		if flusher != nil {
			flusher.Flush()
		}
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data: "))
		if payload == "" || payload == "[DONE]" || !gjson.Valid(payload) {
			continue
		}
		if requestID := strings.TrimSpace(gjson.Get(payload, "id").String()); requestID != "" && result.RequestID == "" {
			result.RequestID = requestID
		}
		if model := strings.TrimSpace(gjson.Get(payload, "model").String()); model != "" {
			result.UpstreamModel = model
		}
		if firstToken := result.FirstTokenMs; firstToken == nil {
			ms := int(time.Since(startTime).Milliseconds())
			result.FirstTokenMs = &ms
		}
		if usage := gjson.Get(payload, "usage"); usage.Exists() {
			result.Usage = OpenAIUsage{
				InputTokens:              int(usage.Get("prompt_tokens").Int()),
				OutputTokens:             int(usage.Get("completion_tokens").Int()),
				CacheCreationInputTokens: int(usage.Get("prompt_cache_write_tokens").Int()),
				CacheReadInputTokens:     int(usage.Get("prompt_cache_hit_tokens").Int()),
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	result.Duration = time.Since(startTime)
	return result, nil
}

func (s *DomesticChannelExecutionService) forwardDomesticResponsesStream(
	c *gin.Context,
	resp *http.Response,
	requestedModel string,
	upstreamModel string,
	startTime time.Time,
	adapter DomesticProviderAdapter,
) (*OpenAIForwardResult, error) {
	responseheaders.WriteFilteredHeaders(c.Writer.Header(), resp.Header, nil)
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	c.Writer.WriteHeader(http.StatusOK)

	flusher, _ := c.Writer.(http.Flusher)
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	state := apicompat.NewChatCompletionsToResponsesState()
	state.Model = requestedModel

	result := &OpenAIForwardResult{
		RequestID:     strings.TrimSpace(resp.Header.Get("x-request-id")),
		Model:         requestedModel,
		UpstreamModel: upstreamModel,
		Stream:        true,
		Duration:      time.Since(startTime),
	}

	writeEvents := func(events []apicompat.ResponsesStreamEvent) error {
		for _, event := range events {
			sse, err := apicompat.ResponsesEventToSSE(event)
			if err != nil {
				return err
			}
			if _, err := fmt.Fprint(c.Writer, sse); err != nil {
				return err
			}
			if event.Response != nil && event.Response.Usage != nil {
				result.Usage = OpenAIUsage{
					InputTokens:          event.Response.Usage.InputTokens,
					OutputTokens:         event.Response.Usage.OutputTokens,
					CacheReadInputTokens: 0,
				}
				if event.Response.Usage.InputTokensDetails != nil {
					result.Usage.CacheReadInputTokens = event.Response.Usage.InputTokensDetails.CachedTokens
				}
			}
		}
		if flusher != nil && len(events) > 0 {
			flusher.Flush()
		}
		return nil
	}

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data: "))
		if payload == "" || payload == "[DONE]" {
			continue
		}
		if businessErr := adapter.ExtractBusinessError([]byte(payload)); businessErr != nil {
			_ = writeResponsesStreamErrorEvent(c, flusher, businessErr.Code, businessErr.Message)
			return nil, ErrDomesticResponseWritten
		}
		if !gjson.Valid(payload) {
			_ = writeResponsesStreamErrorEvent(c, flusher, "server_error", "Failed to parse upstream stream chunk")
			return nil, ErrDomesticResponseWritten
		}

		var chunk apicompat.ChatCompletionsChunk
		if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
			_ = writeResponsesStreamErrorEvent(c, flusher, "server_error", "Failed to decode upstream stream chunk")
			return nil, ErrDomesticResponseWritten
		}
		if result.RequestID == "" {
			result.RequestID = strings.TrimSpace(chunk.ID)
		}
		if chunk.Model != "" {
			result.UpstreamModel = chunk.Model
		}
		if result.FirstTokenMs == nil {
			ms := int(time.Since(startTime).Milliseconds())
			result.FirstTokenMs = &ms
		}
		if err := writeEvents(apicompat.ChatChunkToResponsesEvents(&chunk, state)); err != nil {
			return nil, ErrDomesticResponseWritten
		}
	}
	if err := scanner.Err(); err != nil {
		_ = writeResponsesStreamErrorEvent(c, flusher, "server_error", "Failed to read upstream stream")
		return nil, ErrDomesticResponseWritten
	}
	if err := writeEvents(apicompat.FinalizeChatResponsesStream(state)); err != nil {
		return nil, ErrDomesticResponseWritten
	}
	result.Duration = time.Since(startTime)
	return result, nil
}

func (s *DomesticChannelExecutionService) forwardDomesticAnthropicMessagesStream(
	c *gin.Context,
	resp *http.Response,
	requestedModel string,
	upstreamModel string,
	startTime time.Time,
	adapter DomesticProviderAdapter,
) (*OpenAIForwardResult, error) {
	responseheaders.WriteFilteredHeaders(c.Writer.Header(), resp.Header, nil)
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	c.Writer.WriteHeader(http.StatusOK)

	flusher, _ := c.Writer.(http.Flusher)
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	responsesState := apicompat.NewChatCompletionsToResponsesState()
	responsesState.Model = requestedModel
	anthropicState := apicompat.NewResponsesEventToAnthropicState()
	anthropicState.Model = requestedModel

	result := &OpenAIForwardResult{
		RequestID:     strings.TrimSpace(resp.Header.Get("x-request-id")),
		Model:         requestedModel,
		UpstreamModel: upstreamModel,
		Stream:        true,
		Duration:      time.Since(startTime),
	}

	writeAnthropicEvents := func(events []apicompat.AnthropicStreamEvent) error {
		for _, event := range events {
			sse, err := apicompat.ResponsesAnthropicEventToSSE(event)
			if err != nil {
				return err
			}
			if _, err := fmt.Fprint(c.Writer, sse); err != nil {
				return err
			}
		}
		if flusher != nil && len(events) > 0 {
			flusher.Flush()
		}
		return nil
	}

	writeResponsesAsAnthropic := func(events []apicompat.ResponsesStreamEvent) error {
		for _, event := range events {
			if event.Response != nil && event.Response.Usage != nil {
				result.Usage = OpenAIUsage{
					InputTokens:          event.Response.Usage.InputTokens,
					OutputTokens:         event.Response.Usage.OutputTokens,
					CacheReadInputTokens: 0,
				}
				if event.Response.Usage.InputTokensDetails != nil {
					result.Usage.CacheReadInputTokens = event.Response.Usage.InputTokensDetails.CachedTokens
				}
			}
			if err := writeAnthropicEvents(apicompat.ResponsesEventToAnthropicEvents(&event, anthropicState)); err != nil {
				return err
			}
		}
		return nil
	}

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data: "))
		if payload == "" || payload == "[DONE]" {
			continue
		}
		if businessErr := adapter.ExtractBusinessError([]byte(payload)); businessErr != nil {
			_ = writeAnthropicStreamErrorEvent(c, flusher, businessErr.Code, businessErr.Message)
			return nil, ErrDomesticResponseWritten
		}
		if !gjson.Valid(payload) {
			_ = writeAnthropicStreamErrorEvent(c, flusher, "api_error", "Failed to parse upstream stream chunk")
			return nil, ErrDomesticResponseWritten
		}

		var chunk apicompat.ChatCompletionsChunk
		if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
			_ = writeAnthropicStreamErrorEvent(c, flusher, "api_error", "Failed to decode upstream stream chunk")
			return nil, ErrDomesticResponseWritten
		}
		if result.RequestID == "" {
			result.RequestID = strings.TrimSpace(chunk.ID)
		}
		if chunk.Model != "" {
			result.UpstreamModel = chunk.Model
		}
		if result.FirstTokenMs == nil {
			ms := int(time.Since(startTime).Milliseconds())
			result.FirstTokenMs = &ms
		}
		if err := writeResponsesAsAnthropic(apicompat.ChatChunkToResponsesEvents(&chunk, responsesState)); err != nil {
			return nil, ErrDomesticResponseWritten
		}
	}
	if err := scanner.Err(); err != nil {
		_ = writeAnthropicStreamErrorEvent(c, flusher, "api_error", "Failed to read upstream stream")
		return nil, ErrDomesticResponseWritten
	}
	if err := writeResponsesAsAnthropic(apicompat.FinalizeChatResponsesStream(responsesState)); err != nil {
		return nil, ErrDomesticResponseWritten
	}
	if err := writeAnthropicEvents(apicompat.FinalizeResponsesAnthropicStream(anthropicState)); err != nil {
		return nil, ErrDomesticResponseWritten
	}
	result.Duration = time.Since(startTime)
	return result, nil
}

func extractString(value any) string {
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case json.Number:
		return strings.TrimSpace(v.String())
	case float64:
		return strings.TrimSpace(fmt.Sprintf("%v", v))
	default:
		return ""
	}
}

func normalizeResponsesUpstreamError(statusCode int, providerType string, body []byte) (int, string, string) {
	message := strings.TrimSpace(extractDomesticUpstreamErrorMessage(providerType, body))
	if message == "" {
		message = "Upstream request failed"
	}

	codeRaw := extractDomesticUpstreamErrorCode(providerType, body)
	errTypeRaw := extractDomesticUpstreamErrorType(providerType, body)

	normalizedStatus := mapUpstreamStatusCode(statusCode)
	if statusCode > 0 && statusCode < 500 {
		if mapped := openAIWSErrorHTTPStatusFromRaw(codeRaw, errTypeRaw); mapped != http.StatusBadGateway {
			normalizedStatus = mapped
		}
	}
	if matched := matchDomesticProviderError(providerType, normalizedStatus, codeRaw, errTypeRaw, message); matched != nil {
		return matched.StatusCode, matched.Code, message
	}

	return normalizedStatus, normalizeResponsesErrorCode(normalizedStatus, codeRaw, errTypeRaw, message), message
}

func normalizeAnthropicUpstreamError(statusCode int, providerType string, body []byte) (int, string, string) {
	message := strings.TrimSpace(extractDomesticUpstreamErrorMessage(providerType, body))
	if message == "" {
		message = "Upstream request failed"
	}

	codeRaw := strings.ToLower(extractDomesticUpstreamErrorCode(providerType, body))
	errTypeRaw := strings.ToLower(extractDomesticUpstreamErrorType(providerType, body))
	messageLower := strings.ToLower(message)
	normalizedStatus := mapUpstreamStatusCode(statusCode)
	if matched := matchDomesticProviderError(providerType, normalizedStatus, codeRaw, errTypeRaw, message); matched != nil {
		return matched.StatusCode, matched.Code, message
	}

	switch {
	case normalizedStatus == http.StatusUnauthorized || isDomesticAuthenticationError(codeRaw, errTypeRaw, messageLower):
		return normalizedStatus, "authentication_error", message
	case normalizedStatus == http.StatusForbidden || isDomesticPermissionError(codeRaw, errTypeRaw, messageLower):
		return normalizedStatus, "permission_error", message
	case normalizedStatus == http.StatusTooManyRequests || isDomesticRateLimitError(codeRaw, errTypeRaw, messageLower):
		return normalizedStatus, "rate_limit_error", message
	case normalizedStatus == http.StatusNotFound || isDomesticNotFoundError(codeRaw, errTypeRaw, messageLower):
		return normalizedStatus, "not_found_error", message
	case normalizedStatus >= 400 && normalizedStatus < 500 || isDomesticInvalidRequestError(codeRaw, errTypeRaw, messageLower):
		return normalizedStatus, "invalid_request_error", message
	default:
		return normalizedStatus, "api_error", message
	}
}

func normalizeResponsesErrorCode(statusCode int, codeRaw, errTypeRaw, message string) string {
	code := strings.ToLower(strings.TrimSpace(codeRaw))
	errType := strings.ToLower(strings.TrimSpace(errTypeRaw))
	messageLower := strings.ToLower(strings.TrimSpace(message))

	switch {
	case statusCode == http.StatusUnauthorized || isDomesticAuthenticationError(code, errType, messageLower):
		return "authentication_error"
	case statusCode == http.StatusForbidden || isDomesticPermissionError(code, errType, messageLower):
		return "permission_error"
	case statusCode == http.StatusTooManyRequests || isOpenAIWSRateLimitError(codeRaw, errTypeRaw, "") || isDomesticRateLimitError(code, errType, messageLower):
		return "rate_limit_error"
	case statusCode == http.StatusNotFound || isDomesticNotFoundError(code, errType, messageLower):
		return "not_found_error"
	case statusCode >= 500:
		return "server_error"
	case statusCode >= 400 || isDomesticInvalidRequestError(code, errType, messageLower):
		return "invalid_request_error"
	default:
		return "server_error"
	}
}

func normalizeDomesticEmbeddingsResponse(providerType string, body []byte, fallbackModel string) ([]byte, error) {
	switch normalizeProviderType(providerType) {
	case ProviderTypeDoubao:
		return normalizeDoubaoEmbeddingsResponse(body, fallbackModel)
	case ProviderTypeMiniMax:
		return normalizeMiniMaxEmbeddingsResponse(body, fallbackModel)
	default:
		return body, nil
	}
}

func normalizeDoubaoEmbeddingsResponse(body []byte, fallbackModel string) ([]byte, error) {
	dataNode := gjson.GetBytes(body, "data")
	if !dataNode.Exists() || dataNode.IsArray() {
		return body, nil
	}
	embeddingNode := gjson.GetBytes(body, "data.embedding")
	if !embeddingNode.Exists() || !embeddingNode.IsArray() {
		return body, nil
	}

	values := embeddingNode.Array()
	embedding := make([]float64, 0, len(values))
	for _, value := range values {
		embedding = append(embedding, value.Float())
	}

	normalized := map[string]any{
		"object": "list",
		"data": []map[string]any{{
			"object":    "embedding",
			"index":     0,
			"embedding": embedding,
		}},
	}
	model := strings.TrimSpace(gjson.GetBytes(body, "model").String())
	if model == "" {
		model = strings.TrimSpace(fallbackModel)
	}
	if model != "" {
		normalized["model"] = model
	}
	if usage := gjson.GetBytes(body, "usage"); usage.Exists() {
		var usagePayload any
		if err := json.Unmarshal([]byte(usage.Raw), &usagePayload); err == nil {
			normalized["usage"] = usagePayload
		}
	}
	if requestID := strings.TrimSpace(gjson.GetBytes(body, "request_id").String()); requestID != "" {
		normalized["request_id"] = requestID
	}
	if id := strings.TrimSpace(gjson.GetBytes(body, "id").String()); id != "" {
		normalized["id"] = id
	}
	return json.Marshal(normalized)
}

func normalizeMiniMaxEmbeddingsResponse(body []byte, fallbackModel string) ([]byte, error) {
	vectors := gjson.GetBytes(body, "vectors")
	if !vectors.Exists() || !vectors.IsArray() {
		return body, nil
	}

	data := make([]map[string]any, 0, len(vectors.Array()))
	for index, vector := range vectors.Array() {
		dimensions := vector.Array()
		embedding := make([]float64, 0, len(dimensions))
		for _, item := range dimensions {
			embedding = append(embedding, item.Float())
		}
		data = append(data, map[string]any{
			"object":    "embedding",
			"index":     index,
			"embedding": embedding,
		})
	}

	model := strings.TrimSpace(gjson.GetBytes(body, "model").String())
	if model == "" {
		model = strings.TrimSpace(fallbackModel)
	}
	normalized := map[string]any{
		"object": "list",
		"data":   data,
	}
	if model != "" {
		normalized["model"] = model
	}
	if totalTokens := int(gjson.GetBytes(body, "total_tokens").Int()); totalTokens > 0 {
		normalized["usage"] = map[string]any{
			"prompt_tokens": totalTokens,
			"total_tokens":  totalTokens,
		}
	}
	if requestID := strings.TrimSpace(gjson.GetBytes(body, "request_id").String()); requestID != "" {
		normalized["request_id"] = requestID
	}
	if id := strings.TrimSpace(gjson.GetBytes(body, "id").String()); id != "" {
		normalized["id"] = id
	}
	return json.Marshal(normalized)
}

func extractDomesticUpstreamErrorMessage(providerType string, body []byte) string {
	candidates := []string{
		extractUpstreamErrorMessage(body),
		gjson.GetBytes(body, "message").String(),
		gjson.GetBytes(body, "msg").String(),
		gjson.GetBytes(body, "error_msg").String(),
		gjson.GetBytes(body, "detail").String(),
		gjson.GetBytes(body, "base_resp.status_msg").String(),
		gjson.GetBytes(body, "base_resp.status_message").String(),
	}
	switch normalizeProviderType(providerType) {
	case ProviderTypeZhipu:
		candidates = append([]string{gjson.GetBytes(body, "msg").String()}, candidates...)
	case ProviderTypeMiniMax:
		candidates = append([]string{gjson.GetBytes(body, "base_resp.status_msg").String()}, candidates...)
	}
	for _, candidate := range candidates {
		if text := strings.TrimSpace(candidate); text != "" {
			return text
		}
	}
	return ""
}

func extractDomesticUpstreamErrorCode(providerType string, body []byte) string {
	candidates := []string{
		gjson.GetBytes(body, "error.code").String(),
		gjson.GetBytes(body, "code").String(),
		gjson.GetBytes(body, "base_resp.status_code").String(),
	}
	switch normalizeProviderType(providerType) {
	case ProviderTypeMiniMax:
		candidates = append([]string{gjson.GetBytes(body, "base_resp.status_code").String()}, candidates...)
	case ProviderTypeZhipu:
		candidates = append([]string{gjson.GetBytes(body, "code").String()}, candidates...)
	}
	for _, candidate := range candidates {
		if text := strings.TrimSpace(candidate); text != "" {
			return text
		}
	}
	return ""
}

func extractDomesticUpstreamErrorType(providerType string, body []byte) string {
	candidates := []string{
		gjson.GetBytes(body, "error.type").String(),
		gjson.GetBytes(body, "type").String(),
	}
	switch normalizeProviderType(providerType) {
	case ProviderTypeMiniMax:
		if code := strings.TrimSpace(gjson.GetBytes(body, "base_resp.status_code").String()); code != "" {
			candidates = append(candidates, code)
		}
	}
	for _, candidate := range candidates {
		if text := strings.TrimSpace(candidate); text != "" {
			return text
		}
	}
	return ""
}

func isDomesticAuthenticationError(code, errType, message string) bool {
	return strings.Contains(errType, "authentication") ||
		strings.Contains(code, "invalid_api_key") ||
		strings.Contains(code, "invalidapikey") ||
		strings.Contains(code, "unauthorized") ||
		strings.Contains(code, "signature") ||
		strings.Contains(message, "api key") ||
		strings.Contains(message, "api-key") ||
		strings.Contains(message, "token is invalid") ||
		strings.Contains(message, "signature") ||
		strings.Contains(message, "unauthorized")
}

func isDomesticPermissionError(code, errType, message string) bool {
	return strings.Contains(errType, "permission") ||
		strings.Contains(code, "forbidden") ||
		strings.Contains(code, "permission") ||
		strings.Contains(message, "permission") ||
		strings.Contains(message, "forbidden")
}

func isDomesticRateLimitError(code, errType, message string) bool {
	return strings.Contains(errType, "rate_limit") ||
		strings.Contains(code, "rate_limit") ||
		strings.Contains(code, "quota") ||
		strings.Contains(code, "throttl") ||
		strings.Contains(message, "rate limit") ||
		strings.Contains(message, "too many requests") ||
		strings.Contains(message, "quota") ||
		strings.Contains(message, "throttl")
}

func isDomesticNotFoundError(code, errType, message string) bool {
	return strings.Contains(errType, "not_found") ||
		strings.Contains(code, "not_found") ||
		strings.Contains(code, "model_not_found") ||
		strings.Contains(message, "not found") ||
		strings.Contains(message, "no such model")
}

func isDomesticInvalidRequestError(code, errType, message string) bool {
	return strings.Contains(errType, "invalid_request") ||
		strings.Contains(code, "invalid_request") ||
		strings.Contains(code, "bad_request") ||
		strings.Contains(message, "invalid request") ||
		strings.Contains(message, "bad request") ||
		strings.Contains(message, "unsupported") ||
		strings.Contains(message, "参数") ||
		strings.Contains(message, "参数错误")
}

func defaultDomesticTestModel(providerType string) string {
	switch normalizeProviderType(providerType) {
	case ProviderTypeDeepSeek:
		return "deepseek-chat"
	case ProviderTypeQwen:
		return "qwen-plus"
	case ProviderTypeDoubao:
		return "doubao-seed-2-0-pro-260215"
	case ProviderTypeZhipu:
		return "glm-4-flash"
	case ProviderTypeKimi:
		return "kimi-k2.6"
	case ProviderTypeMiniMax:
		return "MiniMax-M2.7"
	default:
		return ""
	}
}

func writeResponsesStreamErrorEvent(c *gin.Context, flusher http.Flusher, code, message string) error {
	payload, err := json.Marshal(gin.H{
		"type": "error",
		"error": gin.H{
			"code":    code,
			"message": message,
		},
	})
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(c.Writer, "event: error\ndata: %s\n\n", payload); err != nil {
		return err
	}
	if flusher != nil {
		flusher.Flush()
	}
	return nil
}

func writeChatCompletionsStreamErrorEvent(c *gin.Context, flusher http.Flusher, errType, message string) error {
	payload, err := json.Marshal(gin.H{
		"error": gin.H{
			"type":    errType,
			"message": message,
		},
	})
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(c.Writer, "data: %s\n\n", payload); err != nil {
		return err
	}
	if flusher != nil {
		flusher.Flush()
	}
	return nil
}

func writeAnthropicStreamErrorEvent(c *gin.Context, flusher http.Flusher, errType, message string) error {
	payload, err := json.Marshal(gin.H{
		"type": "error",
		"error": gin.H{
			"type":    errType,
			"message": message,
		},
	})
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(c.Writer, "event: error\ndata: %s\n\n", payload); err != nil {
		return err
	}
	if flusher != nil {
		flusher.Flush()
	}
	return nil
}

func (s *DomesticChannelExecutionService) findDomesticUsageAccount(ctx context.Context, channelID int64) *Account {
	if s == nil || s.accountRepo == nil || channelID <= 0 {
		return nil
	}
	accounts, err := s.accountRepo.FindByExtraField(ctx, "domestic_channel_id", channelID)
	if err != nil {
		return nil
	}
	for i := range accounts {
		account := accounts[i]
		if extractBool(account.Extra["domestic_virtual"]) {
			cp := account
			return &cp
		}
	}
	return nil
}

func buildDomesticUsageAccountName(channel *Channel) string {
	if channel == nil {
		return "[domestic] usage"
	}
	providerType := normalizeProviderType(channel.ProviderType)
	if providerType == "" {
		providerType = ProviderTypeCustomDomestic
	}
	return fmt.Sprintf("[domestic] %s #%d", providerType, channel.ID)
}

func extractBool(value any) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		return strings.EqualFold(strings.TrimSpace(v), "true")
	default:
		return false
	}
}
