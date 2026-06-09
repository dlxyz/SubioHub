package handler

import (
	"context"
	"sort"
	"strings"

	"github.com/dlxyz/SubioHub/internal/handler/dto"
	"github.com/dlxyz/SubioHub/internal/pkg/antigravity"
	"github.com/dlxyz/SubioHub/internal/pkg/claude"
	"github.com/dlxyz/SubioHub/internal/pkg/gemini"
	"github.com/dlxyz/SubioHub/internal/pkg/openai"
	"github.com/dlxyz/SubioHub/internal/pkg/pagination"
	"github.com/dlxyz/SubioHub/internal/pkg/response"
	"github.com/dlxyz/SubioHub/internal/service"

	"github.com/gin-gonic/gin"
)

var modelPlazaProviderLabels = map[string]string{
	"openai":    "OpenAI",
	"anthropic": "Anthropic",
	"gemini":    "Gemini",
	"other":     "Other",
}

var modelPlazaProviderOrder = map[string]int{
	"openai":    1,
	"anthropic": 2,
	"gemini":    3,
	"other":     99,
}

type publicModelPlazaCollectedModel struct {
	ID           string
	SourceType   string
	SourceScopes []string
}

// GetPublicModelPlaza 获取公开模型广场数据
// GET /api/v1/settings/public/model-plaza
func (h *SettingHandler) GetPublicModelPlaza(c *gin.Context) {
	settings, err := h.settingService.GetPublicSettings(c.Request.Context())
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	collectedModels := h.collectPublicModelPlazaModels(c.Request.Context())
	modelIDs := make([]string, 0, len(collectedModels))
	collectedByID := make(map[string]publicModelPlazaCollectedModel, len(collectedModels))
	for _, collected := range collectedModels {
		modelIDs = append(modelIDs, collected.ID)
		collectedByID[collected.ID] = collected
	}
	if len(collectedModels) == 0 {
		if h.gatewayService != nil {
			modelIDs = h.gatewayService.GetAvailableModels(c.Request.Context(), nil, "")
		}
	}
	if len(modelIDs) == 0 {
		modelIDs = defaultPublicModelPlazaModels()
	}

	models := make([]dto.PublicModelPlazaModel, 0, len(modelIDs))
	providerCounts := make(map[string]int)
	pricedModelCount := 0
	cachedModelCount := 0

	for _, modelID := range normalizeModelIDs(modelIDs) {
		model := h.buildPublicModelPlazaModel(modelID, collectedByID[modelID])
		models = append(models, model)
		providerCounts[model.Provider]++
		if model.PricingSource != "unavailable" {
			pricedModelCount++
		}
		if model.SupportsPromptCaching {
			cachedModelCount++
		}
	}

	sort.Slice(models, func(i, j int) bool {
		leftOrder := providerSortOrder(models[i].Provider)
		rightOrder := providerSortOrder(models[j].Provider)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		return strings.ToLower(models[i].DisplayName) < strings.ToLower(models[j].DisplayName)
	})

	providers := make([]dto.PublicModelPlazaProvider, 0, len(providerCounts))
	for provider, count := range providerCounts {
		providers = append(providers, dto.PublicModelPlazaProvider{
			ID:         provider,
			Label:      providerDisplayLabel(provider),
			ModelCount: count,
		})
	}
	sort.Slice(providers, func(i, j int) bool {
		leftOrder := providerSortOrder(providers[i].ID)
		rightOrder := providerSortOrder(providers[j].ID)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		return providers[i].Label < providers[j].Label
	})

	response.Success(c, dto.PublicModelPlaza{
		SiteName:     settings.SiteName,
		SiteSubtitle: settings.SiteSubtitle,
		DocURL:       settings.DocURL,
		Providers:    providers,
		Stats: dto.PublicModelPlazaStats{
			TotalModels:      len(models),
			ProviderCount:    len(providers),
			PricedModelCount: pricedModelCount,
			CachedModelCount: cachedModelCount,
		},
		Models: models,
	})
}

func (h *SettingHandler) collectPublicModelPlazaModels(ctx context.Context) []publicModelPlazaCollectedModel {
	if h.channelService == nil {
		return nil
	}

	channels, err := h.channelService.ListAll(ctx)
	if err == nil {
		models := collectChannelModels(channels)
		if len(models) > 0 {
			return models
		}
	}

	// Fallback to the paginated list path used by admin channels so the
	// public plaza still reflects channel models even if ListAll fails.
	params := pagination.PaginationParams{
		Page:      1,
		PageSize:  1000,
		SortBy:    "created_at",
		SortOrder: pagination.SortOrderDesc,
	}
	channels, _, err = h.channelService.List(ctx, params, service.StatusActive, "", "")
	if err != nil {
		return nil
	}

	return collectChannelModels(channels)
}

func collectChannelModels(channels []service.Channel) []publicModelPlazaCollectedModel {
	collected := make([]publicModelPlazaCollectedModel, 0, 256)
	indexByID := make(map[string]int, 256)
	for _, channel := range channels {
		if !channel.IsActive() {
			continue
		}

		sourceScope := inferModelSourceScope(channel)
		for _, pricing := range channel.ModelPricing {
			for _, modelID := range pricing.Models {
				collected, indexByID = appendCollectedModel(collected, indexByID, modelID, sourceScope)
			}
		}

		for _, mappings := range channel.ModelMapping {
			for _, target := range mappings {
				collected, indexByID = appendCollectedModel(collected, indexByID, target, sourceScope)
			}
		}
	}

	return collected
}

func appendCollectedModel(
	collected []publicModelPlazaCollectedModel,
	indexByID map[string]int,
	modelID string,
	sourceScope string,
) ([]publicModelPlazaCollectedModel, map[string]int) {
	trimmed := strings.TrimSpace(modelID)
	if trimmed == "" {
		return collected, indexByID
	}

	if idx, exists := indexByID[trimmed]; exists {
		collected[idx].SourceScopes = appendUniqueStrings(collected[idx].SourceScopes, sourceScope)
		collected[idx].SourceType = deriveModelSourceType(collected[idx].SourceScopes)
		return collected, indexByID
	}

	entry := publicModelPlazaCollectedModel{
		ID:           trimmed,
		SourceScopes: []string{sourceScope},
		SourceType:   deriveModelSourceType([]string{sourceScope}),
	}
	indexByID[trimmed] = len(collected)
	return append(collected, entry), indexByID
}

func appendUniqueStrings(items []string, value string) []string {
	for _, item := range items {
		if item == value {
			return items
		}
	}
	return append(items, value)
}

func inferModelSourceScope(channel service.Channel) string {
	if strings.EqualFold(strings.TrimSpace(channel.ProviderType), service.ProviderTypeStandard) {
		return "subscription"
	}
	return "interface"
}

func deriveModelSourceType(scopes []string) string {
	hasSubscription := false
	hasInterface := false
	for _, scope := range scopes {
		switch scope {
		case "subscription":
			hasSubscription = true
		case "interface":
			hasInterface = true
		}
	}
	if hasSubscription && hasInterface {
		return "shared"
	}
	if hasSubscription {
		return "subscription"
	}
	if !hasInterface {
		return ""
	}
	return "interface"
}

func (h *SettingHandler) buildPublicModelPlazaModel(modelID string, collected publicModelPlazaCollectedModel) dto.PublicModelPlazaModel {
	rawPricing := (*service.LiteLLMModelPricing)(nil)
	if h.pricingService != nil {
		rawPricing = h.pricingService.GetModelPricing(modelID)
	}

	billingPricing := (*service.ModelPricing)(nil)
	pricingSource := "unavailable"
	if h.billingService != nil {
		if pricing, err := h.billingService.GetModelPricing(modelID); err == nil {
			billingPricing = pricing
			if rawPricing != nil {
				pricingSource = "dynamic"
			} else {
				pricingSource = "fallback"
			}
		}
	}

	provider := inferModelPlazaProvider(modelID, rawPricing)
	mode := inferModelPlazaMode(modelID, rawPricing)
	capabilities := inferModelPlazaCapabilities(modelID, mode, rawPricing, billingPricing)

	model := dto.PublicModelPlazaModel{
		ID:            modelID,
		DisplayName:   lookupModelDisplayName(modelID),
		Provider:      provider,
		ProviderLabel: providerDisplayLabel(provider),
		SourceType:    collected.SourceType,
		SourceScopes:  collected.SourceScopes,
		Summary:       buildModelSummary(provider, capabilities),
		Mode:          mode,
		Capabilities:  capabilities,
		PricingSource: pricingSource,
	}

	if rawPricing != nil {
		model.SupportsPromptCaching = rawPricing.SupportsPromptCaching
		model.SupportsServiceTier = rawPricing.SupportsServiceTier
		model.LongContextThreshold = rawPricing.LongContextInputTokenThreshold
	}

	if billingPricing != nil {
		model.InputPricePerMTok = billingPricing.InputPricePerToken * 1_000_000
		model.OutputPricePerMTok = billingPricing.OutputPricePerToken * 1_000_000
		model.CacheReadPricePerMTok = billingPricing.CacheReadPricePerToken * 1_000_000
		model.CacheWritePricePerMTok = billingPricing.CacheCreationPricePerToken * 1_000_000
		if model.LongContextThreshold == 0 {
			model.LongContextThreshold = billingPricing.LongContextInputThreshold
		}
		if !model.SupportsServiceTier {
			model.SupportsServiceTier = billingPricing.InputPricePerTokenPriority > 0 ||
				billingPricing.OutputPricePerTokenPriority > 0 ||
				billingPricing.CacheReadPricePerTokenPriority > 0
		}
		if !model.SupportsPromptCaching {
			model.SupportsPromptCaching = model.CacheReadPricePerMTok > 0 || model.CacheWritePricePerMTok > 0
		}
	}

	return model
}

func normalizeModelIDs(modelIDs []string) []string {
	set := make(map[string]struct{}, len(modelIDs))
	normalized := make([]string, 0, len(modelIDs))
	for _, modelID := range modelIDs {
		trimmed := strings.TrimSpace(modelID)
		if trimmed == "" {
			continue
		}
		if _, exists := set[trimmed]; exists {
			continue
		}
		set[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	return normalized
}

func defaultPublicModelPlazaModels() []string {
	models := make([]string, 0, len(openai.DefaultModels)+len(claude.DefaultModels)+len(gemini.DefaultModels())+len(antigravity.DefaultModels()))

	for _, model := range openai.DefaultModels {
		models = append(models, model.ID)
	}
	for _, model := range claude.DefaultModels {
		models = append(models, model.ID)
	}
	for _, model := range gemini.DefaultModels() {
		models = append(models, model.Name)
	}
	for _, model := range antigravity.DefaultModels() {
		models = append(models, model.ID)
	}

	return normalizeModelIDs(models)
}

func providerSortOrder(provider string) int {
	if order, ok := modelPlazaProviderOrder[provider]; ok {
		return order
	}
	return modelPlazaProviderOrder["other"]
}

func providerDisplayLabel(provider string) string {
	if label, ok := modelPlazaProviderLabels[provider]; ok {
		return label
	}
	return modelPlazaProviderLabels["other"]
}

func lookupModelDisplayName(modelID string) string {
	for _, model := range openai.DefaultModels {
		if model.ID == modelID {
			return model.DisplayName
		}
	}
	for _, model := range claude.DefaultModels {
		if model.ID == modelID {
			return model.DisplayName
		}
	}
	for _, model := range gemini.DefaultModels() {
		if model.Name == modelID {
			if strings.TrimSpace(model.DisplayName) != "" {
				return model.DisplayName
			}
			return strings.TrimPrefix(model.Name, "models/")
		}
	}
	for _, model := range antigravity.DefaultModels() {
		if model.ID == modelID && strings.TrimSpace(model.DisplayName) != "" {
			return model.DisplayName
		}
	}
	return strings.TrimPrefix(modelID, "models/")
}

func inferModelPlazaProvider(modelID string, pricing *service.LiteLLMModelPricing) string {
	modelLower := strings.ToLower(strings.TrimSpace(modelID))

	switch {
	case strings.HasPrefix(modelLower, "gpt-"),
		strings.HasPrefix(modelLower, "o1"),
		strings.HasPrefix(modelLower, "o3"),
		strings.HasPrefix(modelLower, "o4"):
		return "openai"
	case strings.HasPrefix(modelLower, "claude-"):
		return "anthropic"
	case strings.HasPrefix(modelLower, "gemini-"),
		strings.HasPrefix(modelLower, "models/gemini-"):
		return "gemini"
	}

	if pricing == nil {
		return "other"
	}

	provider := strings.ToLower(strings.TrimSpace(pricing.LiteLLMProvider))
	switch {
	case strings.Contains(provider, "openai"):
		return "openai"
	case strings.Contains(provider, "anthropic"), strings.Contains(provider, "claude"):
		return "anthropic"
	case strings.Contains(provider, "gemini"), strings.Contains(provider, "google"), strings.Contains(provider, "vertex"):
		return "gemini"
	default:
		return "other"
	}
}

func inferModelPlazaMode(modelID string, pricing *service.LiteLLMModelPricing) string {
	if pricing != nil && strings.TrimSpace(pricing.Mode) != "" {
		return pricing.Mode
	}

	modelLower := strings.ToLower(strings.TrimSpace(modelID))
	switch {
	case strings.Contains(modelLower, "embedding"):
		return "embedding"
	case strings.Contains(modelLower, "image"), strings.Contains(modelLower, "dall"), strings.Contains(modelLower, "imagen"):
		return "image"
	case strings.Contains(modelLower, "audio"), strings.Contains(modelLower, "tts"), strings.Contains(modelLower, "whisper"):
		return "audio"
	default:
		return "chat"
	}
}

func inferModelPlazaCapabilities(
	modelID string,
	mode string,
	rawPricing *service.LiteLLMModelPricing,
	billingPricing *service.ModelPricing,
) []string {
	modelLower := strings.ToLower(strings.TrimSpace(modelID))
	set := map[string]struct{}{
		"chat": {},
	}

	if mode != "" && mode != "chat" {
		set[mode] = struct{}{}
	}
	if strings.Contains(modelLower, "codex") || strings.Contains(modelLower, "code") {
		set["coding"] = struct{}{}
	}
	if strings.HasPrefix(modelLower, "gpt-") || strings.HasPrefix(modelLower, "o1") || strings.HasPrefix(modelLower, "o3") || strings.HasPrefix(modelLower, "o4") ||
		strings.Contains(modelLower, "sonnet") || strings.Contains(modelLower, "opus") || strings.Contains(modelLower, "pro") {
		set["reasoning"] = struct{}{}
	}
	if strings.Contains(modelLower, "vision") || strings.Contains(modelLower, "image") || strings.Contains(modelLower, "gemini") {
		set["vision"] = struct{}{}
	}
	if strings.Contains(modelLower, "embedding") {
		set["embedding"] = struct{}{}
	}
	if strings.Contains(modelLower, "audio") || strings.Contains(modelLower, "tts") || strings.Contains(modelLower, "whisper") {
		set["audio"] = struct{}{}
	}

	if rawPricing != nil && rawPricing.LongContextInputTokenThreshold > 0 {
		set["long-context"] = struct{}{}
	}
	if billingPricing != nil && billingPricing.LongContextInputThreshold > 0 {
		set["long-context"] = struct{}{}
	}
	if rawPricing != nil && rawPricing.SupportsPromptCaching {
		set["caching"] = struct{}{}
	}
	if billingPricing != nil && (billingPricing.CacheCreationPricePerToken > 0 || billingPricing.CacheReadPricePerToken > 0) {
		set["caching"] = struct{}{}
	}

	capabilities := make([]string, 0, len(set))
	for capability := range set {
		capabilities = append(capabilities, capability)
	}
	sort.Strings(capabilities)
	return capabilities
}

func buildModelSummary(provider string, capabilities []string) string {
	parts := make([]string, 0, 3)
	if provider != "" {
		parts = append(parts, providerDisplayLabel(provider))
	}
	if containsCapability(capabilities, "reasoning") {
		parts = append(parts, "推理")
	}
	if containsCapability(capabilities, "coding") {
		parts = append(parts, "代码")
	}
	if containsCapability(capabilities, "vision") {
		parts = append(parts, "多模态")
	}
	if containsCapability(capabilities, "embedding") {
		parts = append(parts, "向量")
	}
	if containsCapability(capabilities, "audio") {
		parts = append(parts, "音频")
	}
	if containsCapability(capabilities, "caching") {
		parts = append(parts, "缓存")
	}
	if len(parts) == 0 {
		return "通用模型"
	}
	return "适合 " + strings.Join(parts, " / ")
}

func containsCapability(capabilities []string, target string) bool {
	for _, capability := range capabilities {
		if capability == target {
			return true
		}
	}
	return false
}
