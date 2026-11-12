'use client';

import { api } from '@/lib/api';

export type RelayProviderKey = 'openrouter' | 'siliconflow' | 'openai_compatible';
export type RelayAPIStyle = 'chat_completions' | 'responses';
export type RelayStatus = 'active' | 'disabled' | 'error';

export interface RelayModel {
  id: string;
  name?: string;
  context_length?: number;
  input_price?: number | null;
  output_price?: number | null;
  price_source?: string;
  input_modalities?: string[];
  output_modalities?: string[];
}

export interface RelayIntegration {
  id: number;
  name: string;
  provider_key: RelayProviderKey | string;
  base_url: string;
  group_id: number;
  channel_id: number;
  primary_account_id?: number;
  status: RelayStatus | string;
  model_catalog: RelayModel[];
  last_synced_at?: string;
  last_sync_status: string;
  last_sync_error?: string;
  created_by?: number;
  created_at: string;
  updated_at: string;
}

export interface RelayAccountSummary {
  id: number;
  name: string;
  status: string;
  schedulable: boolean;
  concurrency: number;
  priority: number;
  last_used_at?: string;
}

export interface RelayIntegrationDetail extends RelayIntegration {
  group_name: string;
  channel_name: string;
  accounts: RelayAccountSummary[];
}

export interface RelayPreviewResult {
  models: RelayModel[];
  warnings?: string[];
}

export interface RelaySyncResult {
  added: RelayModel[];
  removed: RelayModel[];
  models: RelayModel[];
  last_synced_at: string;
}

export interface RelayTestResult {
  success: boolean;
  status_code: number;
  message: string;
  duration_ms: number;
  response_preview?: string;
}

export interface CreateRelayIntegrationPayload {
  name: string;
  provider_key: string;
  base_url: string;
  api_key: string;
  api_style?: RelayAPIStyle;
  group_name?: string;
  rate_multiplier?: number;
  proxy_id?: number | null;
  concurrency?: number;
  priority?: number;
  models: RelayModel[];
}

export async function previewRelayModels(payload: {
  provider_key: string;
  base_url: string;
  api_key: string;
}): Promise<RelayPreviewResult> {
  return (await api.post('/admin/relay-integrations/preview-models', payload)) as RelayPreviewResult;
}

export async function listRelayIntegrations(): Promise<{ items: RelayIntegration[]; total: number }> {
  return (await api.get('/admin/relay-integrations')) as {
    items: RelayIntegration[];
    total: number;
  };
}

export async function getRelayIntegration(id: number): Promise<RelayIntegrationDetail> {
  return (await api.get(`/admin/relay-integrations/${id}`)) as RelayIntegrationDetail;
}

export async function createRelayIntegration(
  payload: CreateRelayIntegrationPayload
): Promise<RelayIntegration> {
  return (await api.post('/admin/relay-integrations', payload)) as RelayIntegration;
}

export async function syncRelayModels(id: number): Promise<RelaySyncResult> {
  return (await api.post(`/admin/relay-integrations/${id}/sync`)) as RelaySyncResult;
}

export async function applyRelayModels(id: number, models: RelayModel[]): Promise<{ ok: boolean }> {
  return (await api.put(`/admin/relay-integrations/${id}/models`, { models })) as { ok: boolean };
}

export async function testRelayIntegration(id: number, model: string): Promise<RelayTestResult> {
  return (await api.post(`/admin/relay-integrations/${id}/test`, { model })) as RelayTestResult;
}

export async function updateRelayIntegrationStatus(
  id: number,
  status: 'active' | 'disabled'
): Promise<{ ok: boolean }> {
  return (await api.patch(`/admin/relay-integrations/${id}/status`, { status })) as { ok: boolean };
}

export async function deleteRelayIntegration(id: number): Promise<{ ok: boolean }> {
  return (await api.delete(`/admin/relay-integrations/${id}`)) as { ok: boolean };
}
