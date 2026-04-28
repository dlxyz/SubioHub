package dto

type PublicModelPlazaProvider struct {
	ID         string `json:"id"`
	Label      string `json:"label"`
	ModelCount int    `json:"model_count"`
}

type PublicModelPlazaStats struct {
	TotalModels      int `json:"total_models"`
	ProviderCount    int `json:"provider_count"`
	PricedModelCount int `json:"priced_model_count"`
	CachedModelCount int `json:"cached_model_count"`
}

type PublicModelPlazaModel struct {
	ID                     string   `json:"id"`
	DisplayName            string   `json:"display_name"`
	Provider               string   `json:"provider"`
	ProviderLabel          string   `json:"provider_label"`
	Summary                string   `json:"summary"`
	Mode                   string   `json:"mode"`
	Capabilities           []string `json:"capabilities"`
	SupportsPromptCaching  bool     `json:"supports_prompt_caching"`
	SupportsServiceTier    bool     `json:"supports_service_tier"`
	InputPricePerMTok      float64  `json:"input_price_per_mtok"`
	OutputPricePerMTok     float64  `json:"output_price_per_mtok"`
	CacheReadPricePerMTok  float64  `json:"cache_read_price_per_mtok"`
	CacheWritePricePerMTok float64  `json:"cache_write_price_per_mtok"`
	LongContextThreshold   int      `json:"long_context_threshold"`
	PricingSource          string   `json:"pricing_source"`
}

type PublicModelPlaza struct {
	SiteName     string                     `json:"site_name"`
	SiteSubtitle string                     `json:"site_subtitle"`
	DocURL       string                     `json:"doc_url"`
	Providers    []PublicModelPlazaProvider `json:"providers"`
	Stats        PublicModelPlazaStats      `json:"stats"`
	Models       []PublicModelPlazaModel    `json:"models"`
}
