package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/dlxyz/SubioHub/internal/config"
	infraerrors "github.com/dlxyz/SubioHub/internal/pkg/errors"
	"github.com/dlxyz/SubioHub/internal/util/urlvalidator"
)

const (
	defaultNewsTranslationBaseURL = "https://api.openai.com/v1"
	newsTranslationSystemPrompt   = "You are a professional multilingual editor for website news posts. Translate the provided fields accurately. Preserve HTML tag structure in content, do not change image URLs, do not invent facts, and return only a JSON object with keys: title, summary, content, seo_title, seo_description."
)

type NewsTranslationAIService struct {
	cfg            *config.Config
	settingService *SettingService
	httpClient     *http.Client
}

type NewsAITranslateInput struct {
	SourceLocale   string
	TargetLocale   string
	Title          string
	Summary        string
	Content        string
	SEOTitle       *string
	SEODescription *string
}

type NewsAITranslateResult struct {
	Title          string
	Summary        string
	Content        string
	SEOTitle       *string
	SEODescription *string
	Model          string
	Provider       string
}

type newsTranslationChatRequest struct {
	Model          string                       `json:"model"`
	Temperature    float64                      `json:"temperature"`
	ResponseFormat map[string]string            `json:"response_format,omitempty"`
	Messages       []newsTranslationChatMessage `json:"messages"`
}

type newsTranslationChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type newsTranslationChatResponse struct {
	Choices []struct {
		Message struct {
			Content any `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type newsTranslationStructuredOutput struct {
	Title          string  `json:"title"`
	Summary        string  `json:"summary"`
	Content        string  `json:"content"`
	SEOTitle       *string `json:"seo_title"`
	SEODescription *string `json:"seo_description"`
}

type newsTranslationRuntimeConfig struct {
	APIKey      string
	BaseURL     string
	Model       string
	Timeout     time.Duration
	Temperature float64
}

func NewNewsTranslationAIService(cfg *config.Config, settingService *SettingService) *NewsTranslationAIService {
	timeoutSeconds := 60
	if cfg != nil && cfg.NewsTranslation.TimeoutSeconds > 0 {
		timeoutSeconds = cfg.NewsTranslation.TimeoutSeconds
	}
	return &NewsTranslationAIService{
		cfg:            cfg,
		settingService: settingService,
		httpClient: &http.Client{
			Timeout: time.Duration(timeoutSeconds) * time.Second,
		},
	}
}

func (s *NewsTranslationAIService) Enabled(ctx context.Context) bool {
	runtimeCfg := s.getRuntimeConfig(ctx)
	return runtimeCfg.APIKey != "" && runtimeCfg.Model != ""
}

func (s *NewsTranslationAIService) Translate(ctx context.Context, input NewsAITranslateInput) (*NewsAITranslateResult, error) {
	runtimeCfg := s.getRuntimeConfig(ctx)
	if s == nil {
		return nil, infraerrors.ServiceUnavailable("NEWS_AI_TRANSLATION_UNAVAILABLE", "AI translation is not configured")
	}
	if runtimeCfg.APIKey == "" || runtimeCfg.Model == "" {
		return nil, infraerrors.ServiceUnavailable("NEWS_AI_TRANSLATION_UNAVAILABLE", "AI translation is not configured")
	}
	if strings.TrimSpace(input.SourceLocale) == "" || strings.TrimSpace(input.TargetLocale) == "" {
		return nil, infraerrors.BadRequest("NEWS_AI_TRANSLATION_INVALID_LOCALE", "source locale and target locale are required")
	}
	if strings.EqualFold(strings.TrimSpace(input.SourceLocale), strings.TrimSpace(input.TargetLocale)) {
		return nil, infraerrors.BadRequest("NEWS_AI_TRANSLATION_SAME_LOCALE", "source locale and target locale must be different")
	}
	if strings.TrimSpace(input.Title) == "" || strings.TrimSpace(input.Content) == "" {
		return nil, infraerrors.BadRequest("NEWS_AI_TRANSLATION_EMPTY_SOURCE", "source title and content are required")
	}

	endpoint, err := s.resolveChatCompletionsURL(runtimeCfg.BaseURL)
	if err != nil {
		return nil, infraerrors.ServiceUnavailable("NEWS_AI_TRANSLATION_BAD_CONFIG", "AI translation configuration is invalid").WithCause(err)
	}

	payload := newsTranslationChatRequest{
		Model:       runtimeCfg.Model,
		Temperature: runtimeCfg.Temperature,
		ResponseFormat: map[string]string{
			"type": "json_object",
		},
		Messages: []newsTranslationChatMessage{
			{Role: "system", Content: newsTranslationSystemPrompt},
			{Role: "user", Content: buildNewsTranslationUserPrompt(input)},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, infraerrors.InternalServer("NEWS_AI_TRANSLATION_REQUEST_BUILD_FAILED", "failed to build AI translation request").WithCause(err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, infraerrors.InternalServer("NEWS_AI_TRANSLATION_REQUEST_BUILD_FAILED", "failed to build AI translation request").WithCause(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+runtimeCfg.APIKey)

	client := *s.httpClient
	client.Timeout = runtimeCfg.Timeout
	resp, err := client.Do(req)
	if err != nil {
		return nil, infraerrors.ServiceUnavailable("NEWS_AI_TRANSLATION_REQUEST_FAILED", "failed to call AI translation service").WithCause(err)
	}
	defer func() { _ = resp.Body.Close() }()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, infraerrors.ServiceUnavailable("NEWS_AI_TRANSLATION_RESPONSE_READ_FAILED", "failed to read AI translation response").WithCause(err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		message := strings.TrimSpace(string(respBody))
		if message == "" {
			message = resp.Status
		}
		return nil, infraerrors.ServiceUnavailable("NEWS_AI_TRANSLATION_UPSTREAM_ERROR", "AI translation service returned an error").WithMetadata(map[string]string{
			"status":  resp.Status,
			"details": truncateNewsTranslationDetail(message, 400),
		})
	}

	result, err := parseNewsTranslationResponse(respBody)
	if err != nil {
		return nil, infraerrors.ServiceUnavailable("NEWS_AI_TRANSLATION_PARSE_FAILED", "failed to parse AI translation response").WithCause(err)
	}
	if strings.TrimSpace(result.Title) == "" || strings.TrimSpace(result.Content) == "" {
		return nil, infraerrors.ServiceUnavailable("NEWS_AI_TRANSLATION_INVALID_OUTPUT", "AI translation returned incomplete content")
	}

	return &NewsAITranslateResult{
		Title:          strings.TrimSpace(result.Title),
		Summary:        strings.TrimSpace(result.Summary),
		Content:        sanitizeNewsHTML(strings.TrimSpace(result.Content)),
		SEOTitle:       normalizeOptionalString(result.SEOTitle),
		SEODescription: normalizeOptionalString(result.SEODescription),
		Model:          payload.Model,
		Provider:       "external_ai",
	}, nil
}

func (s *NewsTranslationAIService) resolveChatCompletionsURL(baseURL string) (string, error) {
	var (
		normalized string
		err        error
	)
	if s.cfg != nil && s.cfg.Security.URLAllowlist.Enabled {
		normalized, err = urlvalidator.ValidateHTTPURL(baseURL, s.cfg.Security.URLAllowlist.AllowInsecureHTTP, urlvalidator.ValidationOptions{
			AllowedHosts:     s.cfg.Security.URLAllowlist.UpstreamHosts,
			RequireAllowlist: true,
			AllowPrivate:     s.cfg.Security.URLAllowlist.AllowPrivateHosts,
		})
	} else if s.cfg != nil {
		normalized, err = urlvalidator.ValidateURLFormat(baseURL, s.cfg.Security.URLAllowlist.AllowInsecureHTTP)
	} else {
		normalized, err = urlvalidator.ValidateURLFormat(baseURL, false)
	}
	if err != nil {
		return "", err
	}

	switch {
	case strings.HasSuffix(normalized, "/chat/completions"):
		return normalized, nil
	case strings.HasSuffix(normalized, "/v1"):
		return normalized + "/chat/completions", nil
	default:
		return normalized + "/v1/chat/completions", nil
	}
}

func (s *NewsTranslationAIService) getRuntimeConfig(ctx context.Context) newsTranslationRuntimeConfig {
	runtimeCfg := newsTranslationRuntimeConfig{
		BaseURL:     defaultNewsTranslationBaseURL,
		Timeout:     60 * time.Second,
		Temperature: 0.2,
	}
	if s != nil && s.cfg != nil {
		runtimeCfg.APIKey = strings.TrimSpace(s.cfg.NewsTranslation.APIKey)
		if strings.TrimSpace(s.cfg.NewsTranslation.BaseURL) != "" {
			runtimeCfg.BaseURL = strings.TrimSpace(s.cfg.NewsTranslation.BaseURL)
		}
		runtimeCfg.Model = strings.TrimSpace(s.cfg.NewsTranslation.Model)
		if s.cfg.NewsTranslation.TimeoutSeconds > 0 {
			runtimeCfg.Timeout = time.Duration(s.cfg.NewsTranslation.TimeoutSeconds) * time.Second
		}
		if s.cfg.NewsTranslation.Temperature >= 0 {
			runtimeCfg.Temperature = s.cfg.NewsTranslation.Temperature
		}
	}
	if s != nil && s.settingService != nil && ctx != nil {
		settings, err := s.settingService.GetAllSettings(ctx)
		if err == nil && settings != nil {
			if strings.TrimSpace(settings.NewsTranslationAPIKey) != "" {
				runtimeCfg.APIKey = strings.TrimSpace(settings.NewsTranslationAPIKey)
			}
			if strings.TrimSpace(settings.NewsTranslationBaseURL) != "" {
				runtimeCfg.BaseURL = strings.TrimSpace(settings.NewsTranslationBaseURL)
			}
			if strings.TrimSpace(settings.NewsTranslationModel) != "" {
				runtimeCfg.Model = strings.TrimSpace(settings.NewsTranslationModel)
			}
			if settings.NewsTranslationTimeoutSeconds > 0 {
				runtimeCfg.Timeout = time.Duration(settings.NewsTranslationTimeoutSeconds) * time.Second
			}
			if settings.NewsTranslationTemperature >= 0 {
				runtimeCfg.Temperature = settings.NewsTranslationTemperature
			}
		}
	}
	return runtimeCfg
}

func buildNewsTranslationUserPrompt(input NewsAITranslateInput) string {
	source := map[string]any{
		"source_locale":   strings.TrimSpace(input.SourceLocale),
		"target_locale":   strings.TrimSpace(input.TargetLocale),
		"title":           strings.TrimSpace(input.Title),
		"summary":         strings.TrimSpace(input.Summary),
		"content":         strings.TrimSpace(input.Content),
		"seo_title":       strings.TrimSpace(derefString(input.SEOTitle)),
		"seo_description": strings.TrimSpace(derefString(input.SEODescription)),
		"requirements": []string{
			"Keep HTML tags and hierarchy in content.",
			"Do not translate image URLs or other URLs.",
			"Do not add facts that are not in the source text.",
			"Return valid JSON only.",
		},
	}
	body, _ := json.Marshal(source)
	return fmt.Sprintf("Translate this news post into %s.\n%s", strings.TrimSpace(input.TargetLocale), string(body))
}

func parseNewsTranslationResponse(body []byte) (*newsTranslationStructuredOutput, error) {
	var payload newsTranslationChatResponse
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	if payload.Error != nil && strings.TrimSpace(payload.Error.Message) != "" {
		return nil, errors.New(payload.Error.Message)
	}
	if len(payload.Choices) == 0 {
		return nil, fmt.Errorf("no choices in response")
	}

	content, err := extractNewsTranslationMessageContent(payload.Choices[0].Message.Content)
	if err != nil {
		return nil, err
	}
	content = strings.TrimSpace(stripNewsTranslationCodeFence(content))
	if content == "" {
		return nil, fmt.Errorf("empty translation content")
	}

	var result newsTranslationStructuredOutput
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func extractNewsTranslationMessageContent(raw any) (string, error) {
	switch value := raw.(type) {
	case string:
		return value, nil
	case []any:
		var builder strings.Builder
		for _, item := range value {
			part, ok := item.(map[string]any)
			if !ok {
				continue
			}
			text, _ := part["text"].(string)
			if text != "" {
				builder.WriteString(text)
			}
		}
		if builder.Len() == 0 {
			return "", fmt.Errorf("message content array does not contain text")
		}
		return builder.String(), nil
	default:
		return "", fmt.Errorf("unsupported message content type")
	}
}

func stripNewsTranslationCodeFence(content string) string {
	trimmed := strings.TrimSpace(content)
	if !strings.HasPrefix(trimmed, "```") {
		return trimmed
	}
	trimmed = strings.TrimPrefix(trimmed, "```json")
	trimmed = strings.TrimPrefix(trimmed, "```JSON")
	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimSuffix(trimmed, "```")
	return strings.TrimSpace(trimmed)
}

func truncateNewsTranslationDetail(value string, maxLen int) string {
	if len(value) <= maxLen {
		return value
	}
	return value[:maxLen]
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
