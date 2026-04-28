import { api } from '@/lib/api';

export interface ModelPlazaProvider {
  id: string;
  label: string;
  model_count: number;
}

export interface ModelPlazaStats {
  total_models: number;
  provider_count: number;
  priced_model_count: number;
  cached_model_count: number;
}

export interface ModelPlazaModel {
  id: string;
  display_name: string;
  provider: string;
  provider_label: string;
  summary: string;
  mode: string;
  capabilities: string[];
  supports_prompt_caching: boolean;
  supports_service_tier: boolean;
  input_price_per_mtok: number;
  output_price_per_mtok: number;
  cache_read_price_per_mtok: number;
  cache_write_price_per_mtok: number;
  long_context_threshold: number;
  pricing_source: string;
}

export interface ModelPlazaResponse {
  site_name: string;
  site_subtitle: string;
  doc_url: string;
  providers: ModelPlazaProvider[];
  stats: ModelPlazaStats;
  models: ModelPlazaModel[];
}

export async function getPublicModelPlaza() {
  return (await api.get('/settings/public/model-plaza')) as ModelPlazaResponse;
}
