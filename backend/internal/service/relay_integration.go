package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	RelayProviderOpenRouter       = "openrouter"
	RelayProviderSiliconFlow      = "siliconflow"
	RelayProviderOpenAICompatible = "openai_compatible"

	RelayStatusActive   = "active"
	RelayStatusDisabled = "disabled"
	RelayStatusError    = "error"

	RelayAPIStyleResponses       = "responses"
	RelayAPIStyleChatCompletions = "chat_completions"
)

// RelayModel 是第三方中转站返回并导入到系统的模型。
type RelayModel struct {
	ID               string   `json:"id"`
	Name             string   `json:"name,omitempty"`
	ContextLength    int      `json:"context_length,omitempty"`
	InputPrice       *float64 `json:"input_price,omitempty"`
	OutputPrice      *float64 `json:"output_price,omitempty"`
	PriceSource      string   `json:"price_source,omitempty"`
	InputModalities  []string `json:"input_modalities,omitempty"`
	OutputModalities []string `json:"output_modalities,omitempty"`
}

// RelayIntegration 是第三方中转站接入记录。
// API Key 不存在本表，仍保存在 accounts.credentials 中。
type RelayIntegration struct {
	ID               int64        `json:"id"`
	Name             string       `json:"name"`
	ProviderKey      string       `json:"provider_key"`
	BaseURL          string       `json:"base_url"`
	GroupID          int64        `json:"group_id"`
	ChannelID        int64        `json:"channel_id"`
	PrimaryAccountID *int64       `json:"primary_account_id,omitempty"`
	Status           string       `json:"status"`
	ModelCatalog     []RelayModel `json:"model_catalog"`
	LastSyncedAt     *time.Time   `json:"last_synced_at,omitempty"`
	LastSyncStatus   string       `json:"last_sync_status"`
	LastSyncError    string       `json:"last_sync_error,omitempty"`
	CreatedBy        *int64       `json:"created_by,omitempty"`
	CreatedAt        time.Time    `json:"created_at"`
	UpdatedAt        time.Time    `json:"updated_at"`
}

// RelayIntegrationRepository 定义第三方接入的数据访问接口。
type RelayIntegrationRepository interface {
	Create(ctx context.Context, integration *RelayIntegration) error
	GetByID(ctx context.Context, id int64) (*RelayIntegration, error)
	List(ctx context.Context) ([]*RelayIntegration, error)
	Update(ctx context.Context, integration *RelayIntegration) error
	SoftDelete(ctx context.Context, id int64) error
}

// RelayPreviewResult 是模型预览结果。
type RelayPreviewResult struct {
	Models   []RelayModel `json:"models"`
	Warnings []string     `json:"warnings,omitempty"`
}

// RelaySyncResult 是模型同步 diff 结果。
type RelaySyncResult struct {
	Added        []RelayModel `json:"added"`
	Removed      []RelayModel `json:"removed"`
	Models       []RelayModel `json:"models"`
	LastSyncedAt time.Time    `json:"last_synced_at"`
}

// RelayTestResult 是一次最小对话测试的结果。
type RelayTestResult struct {
	Success         bool   `json:"success"`
	StatusCode      int    `json:"status_code"`
	Message         string `json:"message"`
	DurationMs      int64  `json:"duration_ms"`
	ResponsePreview string `json:"response_preview,omitempty"`
}

// RelayAccountSummary 是接入详情里的账号摘要。
type RelayAccountSummary struct {
	ID          int64      `json:"id"`
	Name        string     `json:"name"`
	Status      string     `json:"status"`
	Schedulable bool       `json:"schedulable"`
	Concurrency int        `json:"concurrency"`
	Priority    int        `json:"priority"`
	LastUsedAt  *time.Time `json:"last_used_at,omitempty"`
}

// RelayIntegrationDetail 是接入详情。
type RelayIntegrationDetail struct {
	*RelayIntegration
	GroupName   string                `json:"group_name"`
	ChannelName string                `json:"channel_name"`
	Accounts    []RelayAccountSummary `json:"accounts"`
}

// CreateRelayIntegrationInput 是创建第三方接入的输入。
type CreateRelayIntegrationInput struct {
	Name           string       `json:"name"`
	ProviderKey    string       `json:"provider_key"`
	BaseURL        string       `json:"base_url"`
	APIKey         string       `json:"api_key"`
	APIStyle       string       `json:"api_style"`
	GroupName      string       `json:"group_name"`
	RateMultiplier float64      `json:"rate_multiplier"`
	ProxyID        *int64       `json:"proxy_id"`
	Concurrency    int          `json:"concurrency"`
	Priority       int          `json:"priority"`
	Models         []RelayModel `json:"models"`
}

// RelayIntegrationService 负责第三方中转站接入的预览、创建、同步和测试。
type RelayIntegrationService struct {
	repo        RelayIntegrationRepository
	adminSvc    AdminService
	channelSvc  *ChannelService
	accountRepo AccountRepository
	httpClient  *http.Client
}

// NewRelayIntegrationService 创建第三方接入服务。
func NewRelayIntegrationService(
	repo RelayIntegrationRepository,
	adminSvc AdminService,
	channelSvc *ChannelService,
	accountRepo AccountRepository,
) *RelayIntegrationService {
	return &RelayIntegrationService{
		repo:        repo,
		adminSvc:    adminSvc,
		channelSvc:  channelSvc,
		accountRepo: accountRepo,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// PreviewModels 使用临时 base_url + key 拉取模型列表，不落库。
func (s *RelayIntegrationService) PreviewModels(ctx context.Context, providerKey, baseURL, apiKey string) (*RelayPreviewResult, error) {
	normalized, err := normalizeRelayBaseURL(baseURL)
	if err != nil {
		return nil, err
	}
	models, warnings, err := s.fetchModels(ctx, providerKey, normalized, apiKey)
	if err != nil {
		return nil, err
	}
	return &RelayPreviewResult{Models: models, Warnings: warnings}, nil
}

// Create 创建第三方接入：分组 + 账号 + 渠道 + 接入记录。
func (s *RelayIntegrationService) Create(ctx context.Context, input *CreateRelayIntegrationInput, createdBy int64) (*RelayIntegration, error) {
	if input == nil {
		return nil, errors.New("input is required")
	}
	input.Name = strings.TrimSpace(input.Name)
	input.ProviderKey = strings.TrimSpace(input.ProviderKey)
	input.APIKey = strings.TrimSpace(input.APIKey)
	input.APIStyle = strings.TrimSpace(input.APIStyle)
	if input.Name == "" {
		return nil, errors.New("name is required")
	}
	if input.APIKey == "" {
		return nil, errors.New("api_key is required")
	}
	if input.ProviderKey == "" {
		input.ProviderKey = RelayProviderOpenAICompatible
	}
	if input.APIStyle == "" {
		input.APIStyle = RelayAPIStyleChatCompletions
	}
	if input.APIStyle != RelayAPIStyleChatCompletions && input.APIStyle != RelayAPIStyleResponses {
		return nil, fmt.Errorf("unsupported api_style: %s", input.APIStyle)
	}
	if input.RateMultiplier <= 0 {
		input.RateMultiplier = 1
	}
	if input.Concurrency <= 0 {
		input.Concurrency = 3
	}
	if input.Priority <= 0 {
		input.Priority = 50
	}

	normalizedBaseURL, err := normalizeRelayBaseURL(input.BaseURL)
	if err != nil {
		return nil, err
	}
	models, err := normalizeRelayModels(input.Models)
	if err != nil {
		return nil, err
	}

	groupName := strings.TrimSpace(input.GroupName)
	if groupName == "" {
		groupName = input.Name
	}

	group, err := s.adminSvc.CreateGroup(ctx, &CreateGroupInput{
		Name:             groupName,
		Description:      "第三方中转站自动创建：" + input.Name,
		Platform:         PlatformOpenAI,
		RoutingProfile:   GroupRoutingProfileMixed,
		RateMultiplier:   input.RateMultiplier,
		SubscriptionType: SubscriptionTypeStandard,
	})
	if err != nil {
		return nil, fmt.Errorf("create group: %w", err)
	}

	modelMapping := make(map[string]string, len(models))
	for _, model := range models {
		modelMapping[model.ID] = model.ID
	}
	credentials := map[string]any{
		"api_key":       input.APIKey,
		"base_url":      normalizedBaseURL,
		"model_mapping": modelMapping,
	}
	extra := map[string]any{
		"relay_provider": input.ProviderKey,
		"api_style":      input.APIStyle,
	}

	account, err := s.adminSvc.CreateAccount(ctx, &CreateAccountInput{
		Name:                  input.Name + " 主 Key",
		Platform:              PlatformOpenAI,
		Type:                  AccountTypeAPIKey,
		Credentials:           credentials,
		Extra:                 extra,
		ProxyID:               input.ProxyID,
		Concurrency:           input.Concurrency,
		Priority:              input.Priority,
		GroupIDs:              []int64{group.ID},
		SkipMixedChannelCheck: true,
	})
	if err != nil {
		_ = s.adminSvc.DeleteGroup(ctx, group.ID)
		return nil, fmt.Errorf("create account: %w", err)
	}

	pricing := make([]ChannelModelPricing, 0, len(models))
	for _, model := range models {
		pricing = append(pricing, ChannelModelPricing{
			Platform:    PlatformOpenAI,
			Models:      []string{model.ID},
			BillingMode: BillingModeToken,
			InputPrice:  model.InputPrice,
			OutputPrice: model.OutputPrice,
		})
	}

	channel, err := s.channelSvc.Create(ctx, &CreateChannelInput{
		Name:               input.Name,
		Description:        "第三方中转站：" + normalizedBaseURL,
		GroupIDs:           []int64{group.ID},
		ModelPricing:       pricing,
		ModelMapping:       map[string]map[string]string{PlatformOpenAI: {}},
		BillingModelSource: BillingModelSourceChannelMapped,
		RestrictModels:     true,
		ProviderType:       ProviderTypeStandard,
		ProviderConfig: map[string]any{
			"relay":        true,
			"provider_key": input.ProviderKey,
			"base_url":     normalizedBaseURL,
		},
		ApplyPricingToAccountStats: true,
	})
	if err != nil {
		_ = s.adminSvc.DeleteAccount(ctx, account.ID)
		_ = s.adminSvc.DeleteGroup(ctx, group.ID)
		return nil, fmt.Errorf("create channel: %w", err)
	}

	integration := &RelayIntegration{
		Name:             input.Name,
		ProviderKey:      input.ProviderKey,
		BaseURL:          normalizedBaseURL,
		GroupID:          group.ID,
		ChannelID:        channel.ID,
		PrimaryAccountID: &account.ID,
		Status:           RelayStatusActive,
		ModelCatalog:     models,
		CreatedBy:        &createdBy,
	}
	if err := s.repo.Create(ctx, integration); err != nil {
		_ = s.channelSvc.Delete(ctx, channel.ID)
		_ = s.adminSvc.DeleteAccount(ctx, account.ID)
		_ = s.adminSvc.DeleteGroup(ctx, group.ID)
		return nil, fmt.Errorf("create relay integration: %w", err)
	}

	// 回写接入 ID，便于后续按接入查找账号。
	extra["relay_integration_id"] = integration.ID
	if _, err := s.adminSvc.UpdateAccount(ctx, account.ID, &UpdateAccountInput{Extra: extra}); err != nil {
		return integration, fmt.Errorf("update account integration tag: %w", err)
	}

	return integration, nil
}

// List 返回全部未删除的第三方接入。
func (s *RelayIntegrationService) List(ctx context.Context) ([]*RelayIntegration, error) {
	return s.repo.List(ctx)
}

// Get 返回接入详情。
func (s *RelayIntegrationService) Get(ctx context.Context, id int64) (*RelayIntegrationDetail, error) {
	integration, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	detail := &RelayIntegrationDetail{
		RelayIntegration: integration,
		Accounts:         []RelayAccountSummary{},
	}
	if group, err := s.adminSvc.GetGroup(ctx, integration.GroupID); err == nil && group != nil {
		detail.GroupName = group.Name
	}
	if channel, err := s.channelSvc.GetByID(ctx, integration.ChannelID); err == nil && channel != nil {
		detail.ChannelName = channel.Name
	}
	accounts, err := s.accountRepo.ListByGroup(ctx, integration.GroupID)
	if err != nil {
		return nil, fmt.Errorf("list accounts: %w", err)
	}
	for i := range accounts {
		account := accounts[i]
		detail.Accounts = append(detail.Accounts, RelayAccountSummary{
			ID:          account.ID,
			Name:        account.Name,
			Status:      account.Status,
			Schedulable: account.Schedulable,
			Concurrency: account.Concurrency,
			Priority:    account.Priority,
			LastUsedAt:  account.LastUsedAt,
		})
	}
	return detail, nil
}

// SyncModels 重新拉取模型并返回 diff，不直接修改账号和渠道。
func (s *RelayIntegrationService) SyncModels(ctx context.Context, id int64) (*RelaySyncResult, error) {
	integration, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	account, err := s.primaryAccount(ctx, integration)
	if err != nil {
		return nil, err
	}
	models, warnings, err := s.fetchModels(ctx, integration.ProviderKey, integration.BaseURL, account.GetCredential("api_key"))
	if err != nil {
		s.markSyncFailed(ctx, integration, err)
		return nil, err
	}
	_ = warnings

	added, removed := diffRelayModels(integration.ModelCatalog, models)
	now := time.Now()
	integration.ModelCatalog = models
	integration.LastSyncedAt = &now
	integration.LastSyncStatus = "success"
	integration.LastSyncError = ""
	if err := s.repo.Update(ctx, integration); err != nil {
		return nil, err
	}
	return &RelaySyncResult{Added: added, Removed: removed, Models: models, LastSyncedAt: now}, nil
}

// ApplyModels 将选择的模型写入账号 model_mapping 和渠道 model_pricing。
func (s *RelayIntegrationService) ApplyModels(ctx context.Context, id int64, models []RelayModel) error {
	normalizedModels, err := normalizeRelayModels(models)
	if err != nil {
		return err
	}
	integration, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	accounts, err := s.accountRepo.ListByGroup(ctx, integration.GroupID)
	if err != nil {
		return fmt.Errorf("list accounts: %w", err)
	}
	if len(accounts) == 0 {
		return errors.New("no account found for this integration")
	}

	modelMapping := make(map[string]string, len(normalizedModels))
	for _, model := range normalizedModels {
		modelMapping[model.ID] = model.ID
	}
	for i := range accounts {
		account := accounts[i]
		credentials := make(map[string]any, len(account.Credentials)+1)
		for key, value := range account.Credentials {
			credentials[key] = value
		}
		credentials["model_mapping"] = modelMapping
		if _, err := s.adminSvc.UpdateAccount(ctx, account.ID, &UpdateAccountInput{Credentials: credentials}); err != nil {
			return fmt.Errorf("update account %d model mapping: %w", account.ID, err)
		}
	}

	pricing := make([]ChannelModelPricing, 0, len(normalizedModels))
	for _, model := range normalizedModels {
		pricing = append(pricing, ChannelModelPricing{
			Platform:    PlatformOpenAI,
			Models:      []string{model.ID},
			BillingMode: BillingModeToken,
			InputPrice:  model.InputPrice,
			OutputPrice: model.OutputPrice,
		})
	}
	restrict := true
	if _, err := s.channelSvc.Update(ctx, integration.ChannelID, &UpdateChannelInput{
		ModelPricing:       &pricing,
		RestrictModels:     &restrict,
		BillingModelSource: BillingModelSourceChannelMapped,
	}); err != nil {
		return fmt.Errorf("update channel pricing: %w", err)
	}

	now := time.Now()
	integration.ModelCatalog = normalizedModels
	integration.LastSyncedAt = &now
	integration.LastSyncStatus = "success"
	integration.LastSyncError = ""
	return s.repo.Update(ctx, integration)
}

// Test 使用指定模型发起一次最小对话测试。
func (s *RelayIntegrationService) Test(ctx context.Context, id int64, model string) (*RelayTestResult, error) {
	model = strings.TrimSpace(model)
	if model == "" {
		return nil, errors.New("model is required")
	}
	integration, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	account, err := s.primaryAccount(ctx, integration)
	if err != nil {
		return nil, err
	}
	payload := map[string]any{
		"model":      model,
		"messages":   []map[string]string{{"role": "user", "content": "ping"}},
		"max_tokens": 16,
		"stream":     false,
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, buildRelayChatURL(integration.BaseURL), strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+account.GetCredential("api_key"))
	req.Header.Set("Content-Type", "application/json")

	start := time.Now()
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return &RelayTestResult{Success: false, StatusCode: http.StatusBadGateway, Message: err.Error(), DurationMs: time.Since(start).Milliseconds()}, nil
	}
	defer func() { _ = resp.Body.Close() }()
	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	result := &RelayTestResult{
		Success:         resp.StatusCode >= 200 && resp.StatusCode < 300,
		StatusCode:      resp.StatusCode,
		DurationMs:      time.Since(start).Milliseconds(),
		ResponsePreview: truncateRelayText(string(responseBody), 500),
	}
	if result.Success {
		result.Message = "test succeeded"
	} else {
		result.Message = truncateRelayText(string(responseBody), 300)
		if result.Message == "" {
			result.Message = "test failed"
		}
	}
	return result, nil
}

// SetStatus 启用或停用接入。
func (s *RelayIntegrationService) SetStatus(ctx context.Context, id int64, status string) error {
	if status != RelayStatusActive && status != RelayStatusDisabled {
		return fmt.Errorf("unsupported status: %s", status)
	}
	integration, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	channelStatus := StatusActive
	active := status == RelayStatusActive
	if !active {
		channelStatus = StatusDisabled
	}
	if _, err := s.channelSvc.Update(ctx, integration.ChannelID, &UpdateChannelInput{Status: channelStatus}); err != nil {
		return fmt.Errorf("update channel status: %w", err)
	}
	accounts, err := s.accountRepo.ListByGroup(ctx, integration.GroupID)
	if err != nil {
		return fmt.Errorf("list accounts: %w", err)
	}
	for i := range accounts {
		if _, err := s.adminSvc.SetAccountSchedulable(ctx, accounts[i].ID, active); err != nil {
			return fmt.Errorf("set account %d schedulable: %w", accounts[i].ID, err)
		}
	}
	integration.Status = status
	return s.repo.Update(ctx, integration)
}

// Delete 停用并软删除接入，保留历史账号和分组。
func (s *RelayIntegrationService) Delete(ctx context.Context, id int64) error {
	if err := s.SetStatus(ctx, id, RelayStatusDisabled); err != nil {
		return err
	}
	return s.repo.SoftDelete(ctx, id)
}

func (s *RelayIntegrationService) primaryAccount(ctx context.Context, integration *RelayIntegration) (*Account, error) {
	if integration.PrimaryAccountID != nil && *integration.PrimaryAccountID > 0 {
		account, err := s.accountRepo.GetByID(ctx, *integration.PrimaryAccountID)
		if err == nil && account != nil {
			return account, nil
		}
	}
	accounts, err := s.accountRepo.ListByGroup(ctx, integration.GroupID)
	if err != nil {
		return nil, fmt.Errorf("list accounts: %w", err)
	}
	if len(accounts) == 0 {
		return nil, errors.New("no account found for this integration")
	}
	return &accounts[0], nil
}

func (s *RelayIntegrationService) markSyncFailed(ctx context.Context, integration *RelayIntegration, syncErr error) {
	now := time.Now()
	integration.LastSyncedAt = &now
	integration.LastSyncStatus = "failed"
	integration.LastSyncError = truncateRelayText(syncErr.Error(), 500)
	_ = s.repo.Update(ctx, integration)
}

func (s *RelayIntegrationService) fetchModels(ctx context.Context, providerKey, baseURL, apiKey string) ([]RelayModel, []string, error) {
	if strings.TrimSpace(apiKey) == "" {
		return nil, nil, errors.New("api_key is required")
	}
	targetURL := buildRelayModelsURL(baseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("request models: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, nil, fmt.Errorf("upstream returned %d: %s", resp.StatusCode, truncateRelayText(string(body), 300))
	}
	models, warnings, err := parseRelayModels(body)
	if err != nil {
		return nil, nil, err
	}
	if len(models) == 0 {
		warnings = append(warnings, "upstream returned no models")
	}
	return models, warnings, nil
}

func parseRelayModels(body []byte) ([]RelayModel, []string, error) {
	var payload struct {
		Data   []json.RawMessage `json:"data"`
		Models []json.RawMessage `json:"models"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, nil, fmt.Errorf("parse models response: %w", err)
	}
	items := payload.Data
	if len(items) == 0 {
		items = payload.Models
	}
	models := make([]RelayModel, 0, len(items))
	warnings := make([]string, 0)
	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		var raw map[string]any
		if err := json.Unmarshal(item, &raw); err != nil {
			continue
		}
		id := strings.TrimSpace(relayString(raw["id"]))
		if id == "" {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		model := RelayModel{
			ID:          id,
			Name:        strings.TrimSpace(relayString(raw["name"])),
			PriceSource: "manual",
		}
		if v, ok := raw["context_length"]; ok {
			model.ContextLength = int(relayFloat(v))
		} else if v, ok := raw["context_window"]; ok {
			model.ContextLength = int(relayFloat(v))
		}
		if pricing, ok := raw["pricing"].(map[string]any); ok {
			if value, ok := relayOptionalFloat(pricing["prompt"]); ok {
				model.InputPrice = &value
				model.PriceSource = "upstream"
			}
			if value, ok := relayOptionalFloat(pricing["completion"]); ok {
				model.OutputPrice = &value
				model.PriceSource = "upstream"
			}
		}
		if architecture, ok := raw["architecture"].(map[string]any); ok {
			model.InputModalities = relayStringSlice(architecture["input_modalities"])
			model.OutputModalities = relayStringSlice(architecture["output_modalities"])
		}
		models = append(models, model)
	}
	sort.Slice(models, func(i, j int) bool { return models[i].ID < models[j].ID })
	return models, warnings, nil
}

func normalizeRelayModels(models []RelayModel) ([]RelayModel, error) {
	if len(models) == 0 {
		return nil, errors.New("at least one model is required")
	}
	out := make([]RelayModel, 0, len(models))
	seen := make(map[string]struct{}, len(models))
	for _, model := range models {
		model.ID = strings.TrimSpace(model.ID)
		if model.ID == "" {
			return nil, errors.New("model id is required")
		}
		if _, exists := seen[model.ID]; exists {
			return nil, fmt.Errorf("duplicate model: %s", model.ID)
		}
		seen[model.ID] = struct{}{}
		if model.InputPrice == nil || model.OutputPrice == nil {
			return nil, fmt.Errorf("model %s input_price and output_price are required", model.ID)
		}
		if *model.InputPrice < 0 || *model.OutputPrice < 0 {
			return nil, fmt.Errorf("model %s price must be >= 0", model.ID)
		}
		if model.PriceSource == "" {
			model.PriceSource = "manual"
		}
		out = append(out, model)
	}
	return out, nil
}

func normalizeRelayBaseURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", errors.New("base_url is required")
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("invalid base_url: %w", err)
	}
	if parsed.Scheme != "https" || parsed.Host == "" {
		return "", errors.New("base_url must be a valid https URL")
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	parsed.Path = strings.TrimSuffix(parsed.Path, "/chat/completions")
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String(), nil
}

func buildRelayModelsURL(baseURL string) string {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.HasSuffix(base, "/v1") {
		return base + "/models"
	}
	return base + "/v1/models"
}

func buildRelayChatURL(baseURL string) string {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.HasSuffix(base, "/chat/completions") {
		return base
	}
	if strings.HasSuffix(base, "/v1") {
		return base + "/chat/completions"
	}
	return base + "/v1/chat/completions"
}

func diffRelayModels(oldModels, newModels []RelayModel) ([]RelayModel, []RelayModel) {
	oldSet := make(map[string]RelayModel, len(oldModels))
	for _, model := range oldModels {
		oldSet[model.ID] = model
	}
	newSet := make(map[string]RelayModel, len(newModels))
	for _, model := range newModels {
		newSet[model.ID] = model
	}
	added := make([]RelayModel, 0)
	removed := make([]RelayModel, 0)
	for id, model := range newSet {
		if _, exists := oldSet[id]; !exists {
			added = append(added, model)
		}
	}
	for id, model := range oldSet {
		if _, exists := newSet[id]; !exists {
			removed = append(removed, model)
		}
	}
	sort.Slice(added, func(i, j int) bool { return added[i].ID < added[j].ID })
	sort.Slice(removed, func(i, j int) bool { return removed[i].ID < removed[j].ID })
	return added, removed
}

func relayString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	default:
		return ""
	}
}

func relayFloat(value any) float64 {
	parsed, ok := relayOptionalFloat(value)
	if !ok {
		return 0
	}
	return parsed
}

func relayOptionalFloat(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case json.Number:
		parsed, err := typed.Float64()
		return parsed, err == nil
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		if err != nil {
			return 0, false
		}
		return parsed, true
	default:
		return 0, false
	}
}

func relayStringSlice(value any) []string {
	items, ok := value.([]any)
	if !ok {
		if typed, ok := value.([]string); ok {
			return typed
		}
		return nil
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
			out = append(out, text)
		}
	}
	return out
}

func truncateRelayText(text string, max int) string {
	text = strings.TrimSpace(text)
	if max <= 0 || len(text) <= max {
		return text
	}
	return text[:max] + "..."
}
