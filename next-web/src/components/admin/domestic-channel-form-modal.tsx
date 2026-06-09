'use client';

import { FormEvent, ReactNode, useMemo, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import type { AdminChannel, AdminChannelModelPricing, AdminChannelPricingInterval, AdminGroup } from '@/lib/admin-api';
import type {
  DomesticChannelConnectionTestResult,
  DomesticFetchedModelMetadata,
  DomesticChannelMessagesTestResult,
  DomesticChannelModelsFetchResult,
  DomesticChannelResponsesTestResult,
} from '@/lib/admin-domestic-channel-api';
import { DomesticChannelDiagnosticsPanel } from '@/components/admin/domestic-channel-diagnostics-panel';

const PROVIDER_OPTIONS = [
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'qwen', label: 'Qwen' },
  { key: 'doubao', label: 'Doubao' },
  { key: 'zhipu', label: 'Zhipu' },
  { key: 'kimi', label: 'Kimi' },
  { key: 'minimax', label: 'MiniMax' },
  { key: 'openai_compat_domestic', label: 'OpenAI 兼容' },
  { key: 'custom_domestic', label: '自定义国内模型' },
] as const;

const KNOWN_PROVIDER_CONFIG_KEYS = new Set(['base_url', 'api_key', 'endpoint_path', 'headers']);
const PRICING_PLATFORM_OPTIONS = [
  { key: 'anthropic', label: 'Anthropic', color: 'text-orange-600 dark:text-orange-300' },
  { key: 'openai', label: 'OpenAI', color: 'text-emerald-600 dark:text-emerald-300' },
  { key: 'gemini', label: 'Gemini', color: 'text-blue-600 dark:text-blue-300' },
  { key: 'antigravity', label: 'Antigravity', color: 'text-purple-600 dark:text-purple-300' },
] as const;
const CAPABILITY_LABELS: Record<string, string> = {
  chat: 'Chat',
  embeddings: 'Embeddings',
  rerank: 'Rerank',
};
const CAPABILITY_ORDER = ['chat', 'embeddings', 'rerank'] as const;

type MappingRow = {
  source: string;
  target: string;
};

type DomesticChannelFormState = {
  name: string;
  description: string;
  status: string;
  restrict_models: boolean;
  billing_model_source: string;
  provider_type: string;
  group_ids: number[];
  provider_base_url: string;
  provider_api_key: string;
  provider_endpoint_path: string;
  test_model: string;
  provider_headers_text: string;
  provider_extra_json_text: string;
  openai_model_mappings: MappingRow[];
  apply_pricing_to_account_stats: boolean;
  model_pricing: PricingFormEntry[];
};

type PricingFormEntry = {
  id?: number;
  platform: string;
  modelsText: string;
  billing_mode: 'token' | 'per_request' | 'image';
  input_price: string;
  output_price: string;
  cache_write_price: string;
  cache_read_price: string;
  image_output_price: string;
  per_request_price: string;
  intervals: AdminChannelPricingInterval[];
};

type ProviderPreset = {
  baseURL: string;
  endpointPath: string;
  testModel: string;
  modelHints: string[];
  mappingRows: MappingRow[];
  pricingRows: PricingFormEntry[];
};

export type DomesticChannelPayload = {
  name: string;
  description?: string;
  status: string;
  group_ids: number[];
  model_pricing: AdminChannelModelPricing[];
  model_mapping: Record<string, Record<string, string>>;
  billing_model_source: string;
  restrict_models: boolean;
  provider_type: string;
  provider_config: Record<string, unknown>;
  features_config: Record<string, unknown>;
  apply_pricing_to_account_stats: boolean;
  account_stats_pricing_rules: [];
};

export type DomesticChannelTestPayload = {
  provider_type: string;
  provider_config: Record<string, unknown>;
  test_model?: string;
};

type Props = {
  open: boolean;
  channel: AdminChannel | null;
  groups: AdminGroup[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: DomesticChannelPayload) => Promise<void>;
  onTestConnection: (payload: DomesticChannelTestPayload) => Promise<DomesticChannelConnectionTestResult>;
  onTestMessages: (payload: DomesticChannelTestPayload) => Promise<DomesticChannelMessagesTestResult>;
  onTestResponses: (payload: DomesticChannelTestPayload) => Promise<DomesticChannelResponsesTestResult>;
  onFetchModels: (payload: DomesticChannelTestPayload) => Promise<DomesticChannelModelsFetchResult>;
};

const EMPTY_FORM: DomesticChannelFormState = {
  name: '',
  description: '',
  status: 'active',
  restrict_models: false,
  billing_model_source: 'channel_mapped',
  provider_type: 'deepseek',
  group_ids: [],
  provider_base_url: 'https://api.deepseek.com',
  provider_api_key: '',
  provider_endpoint_path: '/v1/chat/completions',
  test_model: 'deepseek-chat',
  provider_headers_text: '{}',
  provider_extra_json_text: '{}',
  openai_model_mappings: [],
  apply_pricing_to_account_stats: false,
  model_pricing: [],
};

function toNullableNumber(value: string | number | null | undefined) {
  if (value === '' || value === null || value === undefined) return null;
  const next = Number(value);
  return Number.isNaN(next) ? null : next;
}

function perTokenToMTok(value: number | null | undefined) {
  if (value === null || value === undefined) return '';
  return String(Number((value * 1_000_000).toPrecision(10)));
}

function mTokToPerToken(value: string | number | null | undefined) {
  const next = toNullableNumber(value);
  if (next === null) return null;
  return Number((next / 1_000_000).toPrecision(10));
}

function apiPricingToForm(entry: AdminChannelModelPricing): PricingFormEntry {
  return {
    id: entry.id,
    platform: entry.platform,
    modelsText: (entry.models || []).join('\n'),
    billing_mode: (entry.billing_mode || 'token') as PricingFormEntry['billing_mode'],
    input_price: perTokenToMTok(entry.input_price),
    output_price: perTokenToMTok(entry.output_price),
    cache_write_price: perTokenToMTok(entry.cache_write_price),
    cache_read_price: perTokenToMTok(entry.cache_read_price),
    image_output_price: perTokenToMTok(entry.image_output_price),
    per_request_price: entry.per_request_price == null ? '' : String(entry.per_request_price),
    intervals: entry.intervals || [],
  };
}

function formPricingToApi(entry: PricingFormEntry): AdminChannelModelPricing {
  const models = Array.from(
    new Set(
      entry.modelsText
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

  return {
    id: entry.id,
    platform: entry.platform,
    models,
    billing_mode: entry.billing_mode,
    input_price: entry.billing_mode === 'token' ? mTokToPerToken(entry.input_price) : null,
    output_price: entry.billing_mode === 'token' ? mTokToPerToken(entry.output_price) : null,
    cache_write_price: entry.billing_mode === 'token' ? mTokToPerToken(entry.cache_write_price) : null,
    cache_read_price: entry.billing_mode === 'token' ? mTokToPerToken(entry.cache_read_price) : null,
    image_output_price: entry.billing_mode === 'token' ? mTokToPerToken(entry.image_output_price) : null,
    per_request_price: entry.billing_mode === 'token' ? null : toNullableNumber(entry.per_request_price),
    intervals: entry.intervals || [],
  };
}

function emptyPricingEntry(platform = 'openai'): PricingFormEntry {
  return {
    platform,
    modelsText: '',
    billing_mode: 'token',
    input_price: '',
    output_price: '',
    cache_write_price: '',
    cache_read_price: '',
    image_output_price: '',
    per_request_price: '',
    intervals: [],
  };
}

function createPricingTemplate(
  platform: string,
  models: string[],
  prices?: Partial<Pick<PricingFormEntry, 'input_price' | 'output_price' | 'per_request_price' | 'billing_mode'>>
): PricingFormEntry {
  return {
    ...emptyPricingEntry(platform),
    billing_mode: prices?.billing_mode || 'token',
    modelsText: models.join('\n'),
    input_price: prices?.input_price || '',
    output_price: prices?.output_price || '',
    per_request_price: prices?.per_request_price || '',
  };
}

function cloneMappings(rows: MappingRow[]) {
  return rows.map((row) => ({ ...row }));
}

function clonePricingRows(rows: PricingFormEntry[]) {
  return rows.map((row) => ({
    ...row,
    intervals: row.intervals.map((interval) => ({ ...interval })),
  }));
}

function normalizeTextValue(value: string | undefined) {
  return (value || '').trim();
}

function shouldReplacePresetTextValue(currentValue: string, previousValue?: string, nextValue?: string) {
  const current = normalizeTextValue(currentValue);
  if (!current) return true;
  if (previousValue && current === normalizeTextValue(previousValue)) return true;
  if (nextValue && current === normalizeTextValue(nextValue)) return true;
  return false;
}

function areMappingRowsEquivalent(left: MappingRow[], right: MappingRow[]) {
  const normalize = (rows: MappingRow[]) =>
    rows
      .map((row) => `${row.source.trim()}=>${row.target.trim()}`)
      .filter(Boolean)
      .sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function arePricingRowsEquivalent(left: PricingFormEntry[], right: PricingFormEntry[]) {
  const normalize = (rows: PricingFormEntry[]) =>
    rows
      .map((row) => ({
        platform: row.platform,
        modelsText: row.modelsText
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean)
          .sort(),
        billing_mode: row.billing_mode,
        input_price: row.input_price,
        output_price: row.output_price,
        cache_write_price: row.cache_write_price,
        cache_read_price: row.cache_read_price,
        image_output_price: row.image_output_price,
        per_request_price: row.per_request_price,
      }))
      .sort((a, b) => `${a.platform}:${a.modelsText.join(',')}`.localeCompare(`${b.platform}:${b.modelsText.join(',')}`));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  deepseek: {
    baseURL: 'https://api.deepseek.com',
    endpointPath: '/v1/chat/completions',
    testModel: 'deepseek-chat',
    modelHints: ['deepseek-chat', 'deepseek-v4-flash', 'deepseek-v4-pro'],
    mappingRows: [
      { source: 'gpt-4o-mini', target: 'deepseek-chat' },
      { source: 'gpt-4.1-mini', target: 'deepseek-v4-flash' },
      { source: 'gpt-4.1', target: 'deepseek-v4-pro' },
    ],
    pricingRows: [
      createPricingTemplate('openai', ['deepseek-chat', 'deepseek-v4-flash', 'deepseek-v4-pro']),
    ],
  },
  qwen: {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode',
    endpointPath: '/v1/chat/completions',
    testModel: 'qwen-plus',
    modelHints: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen3-235b-a22b'],
    mappingRows: [
      { source: 'gpt-4o-mini', target: 'qwen-plus' },
      { source: 'gpt-4.1', target: 'qwen-max' },
      { source: 'gpt-4o', target: 'qwen-max' },
    ],
    pricingRows: [
      createPricingTemplate('openai', ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen3-235b-a22b']),
    ],
  },
  doubao: {
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    endpointPath: '/chat/completions',
    testModel: '',
    modelHints: ['doubao-pro-32k', 'doubao-lite-32k'],
    mappingRows: [],
    pricingRows: [createPricingTemplate('openai', ['doubao-pro-32k', 'doubao-lite-32k'])],
  },
  zhipu: {
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    endpointPath: '/chat/completions',
    testModel: 'glm-4-flash',
    modelHints: ['glm-4-flash', 'glm-4-plus', 'glm-4.6', 'glm-5'],
    mappingRows: [
      { source: 'gpt-4o-mini', target: 'glm-4-flash' },
      { source: 'gpt-4.1', target: 'glm-4-plus' },
      { source: 'gpt-4o', target: 'glm-4.6' },
    ],
    pricingRows: [
      createPricingTemplate('openai', ['glm-4-flash', 'glm-4-plus', 'glm-4.6', 'glm-5']),
    ],
  },
  kimi: {
    baseURL: 'https://api.moonshot.ai',
    endpointPath: '/v1/chat/completions',
    testModel: 'kimi-k2.6',
    modelHints: ['kimi-k2.6', 'kimi-k2.5', 'kimi-k2-thinking', 'kimi-k2-thinking-turbo'],
    mappingRows: [
      { source: 'gpt-4o-mini', target: 'kimi-k2.5' },
      { source: 'gpt-4.1', target: 'kimi-k2.6' },
      { source: 'gpt-4o', target: 'kimi-k2-thinking' },
    ],
    pricingRows: [
      createPricingTemplate('openai', ['kimi-k2.6', 'kimi-k2.5', 'kimi-k2-thinking', 'kimi-k2-thinking-turbo']),
    ],
  },
  minimax: {
    baseURL: 'https://api.minimax.io',
    endpointPath: '/v1/text/chatcompletion_v2',
    testModel: 'MiniMax-M2.5',
    modelHints: ['MiniMax-M2.5', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'abab6.5-chat'],
    mappingRows: [
      { source: 'gpt-4o-mini', target: 'abab6.5-chat' },
      { source: 'gpt-4.1', target: 'MiniMax-M2.5' },
      { source: 'gpt-4o', target: 'MiniMax-M2.7' },
    ],
    pricingRows: [
      createPricingTemplate('openai', ['abab6.5-chat', 'MiniMax-M2.5', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed']),
    ],
  },
};

function getProviderPreset(providerType: string): ProviderPreset | null {
  return PROVIDER_PRESETS[providerType] || null;
}

function formatJsonText(value?: Record<string, unknown>) {
  if (!value || Object.keys(value).length === 0) return '{}';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '{}';
  }
}

function parseJsonObject(text: string, fieldName: string) {
  const trimmed = text.trim();
  if (!trimmed) return {} as Record<string, unknown>;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${fieldName} 不是合法 JSON`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${fieldName} 必须是 JSON 对象`);
  }
  return parsed as Record<string, unknown>;
}

function getProviderHelpText(providerType: string) {
  const preset = getProviderPreset(providerType);
  if (preset) {
    return `推荐 Base URL：${preset.baseURL}，默认 endpoint 为 ${preset.endpointPath}，测试模型可先用 ${preset.testModel || '上游真实模型名'}。`;
  }
  if (providerType === 'openai_compat_domestic') {
    return '用于任意兼容 OpenAI 协议的国内上游。';
  }
  return '用于自定义国内兼容上游，可在额外配置 JSON 中补更多参数。';
}

function applyProviderMappingPreset(prev: DomesticChannelFormState, providerType: string): DomesticChannelFormState {
  const preset = getProviderPreset(providerType);
  if (!preset || preset.mappingRows.length === 0) return prev;
  return {
    ...prev,
    openai_model_mappings: cloneMappings(preset.mappingRows),
  };
}

function applyProviderPricingPreset(prev: DomesticChannelFormState, providerType: string): DomesticChannelFormState {
  const preset = getProviderPreset(providerType);
  if (!preset || preset.pricingRows.length === 0) return prev;
  return {
    ...prev,
    apply_pricing_to_account_stats: true,
    model_pricing: clonePricingRows(preset.pricingRows),
  };
}

function applyProviderDefaults(providerType: string, prev: DomesticChannelFormState): DomesticChannelFormState {
  const next = { ...prev, provider_type: providerType };
  const previousPreset = getProviderPreset(prev.provider_type);
  const preset = getProviderPreset(providerType);
  if (preset) {
    if (shouldReplacePresetTextValue(prev.provider_base_url, previousPreset?.baseURL, preset.baseURL)) {
      next.provider_base_url = preset.baseURL;
    }
    if (shouldReplacePresetTextValue(prev.provider_endpoint_path, previousPreset?.endpointPath, preset.endpointPath)) {
      next.provider_endpoint_path = preset.endpointPath;
    }
    if (shouldReplacePresetTextValue(prev.test_model, previousPreset?.testModel, preset.testModel)) {
      next.test_model = preset.testModel;
    }
    if (
      preset.mappingRows.length > 0 &&
      (prev.openai_model_mappings.length === 0 ||
        areMappingRowsEquivalent(prev.openai_model_mappings, previousPreset?.mappingRows || []))
    ) {
      next.openai_model_mappings = cloneMappings(preset.mappingRows);
    }
    if (
      preset.pricingRows.length > 0 &&
      (prev.model_pricing.length === 0 || arePricingRowsEquivalent(prev.model_pricing, previousPreset?.pricingRows || []))
    ) {
      next.model_pricing = clonePricingRows(preset.pricingRows);
      next.apply_pricing_to_account_stats = true;
    }
    return next;
  }
  if (!prev.test_model.trim()) {
    next.test_model = defaultTestModel(providerType);
  }
  next.provider_endpoint_path = prev.provider_endpoint_path || '/v1/chat/completions';
  return next;
}

function buildFormState(channel: AdminChannel | null): DomesticChannelFormState {
  if (!channel) return EMPTY_FORM;

  const providerConfig = (channel.provider_config || {}) as Record<string, unknown>;
  const headers =
    providerConfig.headers && typeof providerConfig.headers === 'object' && !Array.isArray(providerConfig.headers)
      ? (providerConfig.headers as Record<string, unknown>)
      : {};
  const extra = Object.fromEntries(Object.entries(providerConfig).filter(([key]) => !KNOWN_PROVIDER_CONFIG_KEYS.has(key)));
  const openaiMappings = Object.entries(channel.model_mapping?.openai || {}).map(([source, target]) => ({
    source,
    target,
  }));

  return {
    name: channel.name || '',
    description: channel.description || '',
    status: channel.status || 'active',
    restrict_models: Boolean(channel.restrict_models),
    billing_model_source: channel.billing_model_source || 'channel_mapped',
    provider_type: channel.provider_type || 'deepseek',
    group_ids: channel.group_ids || [],
    provider_base_url:
      typeof providerConfig.base_url === 'string' && providerConfig.base_url.trim()
        ? providerConfig.base_url.trim()
        : getProviderPreset(channel.provider_type || 'deepseek')?.baseURL || '',
    provider_api_key: typeof providerConfig.api_key === 'string' ? providerConfig.api_key : '',
    provider_endpoint_path:
      typeof providerConfig.endpoint_path === 'string' && providerConfig.endpoint_path.trim()
        ? providerConfig.endpoint_path.trim()
        : getProviderPreset(channel.provider_type || 'deepseek')?.endpointPath || '/v1/chat/completions',
    test_model: defaultTestModel(channel.provider_type || 'deepseek'),
    provider_headers_text: formatJsonText(headers),
    provider_extra_json_text: formatJsonText(extra),
    openai_model_mappings: openaiMappings,
    apply_pricing_to_account_stats: Boolean(channel.apply_pricing_to_account_stats),
    model_pricing: (channel.model_pricing || []).map(apiPricingToForm),
  };
}

function buildInitialFormState(channel: AdminChannel | null, groups: AdminGroup[]): DomesticChannelFormState {
  const next = buildFormState(channel);
  const allowedGroupIDs = new Set(
    groups.filter((group) => group.routing_profile === 'domestic' || group.routing_profile === 'mixed').map((group) => group.id)
  );
  next.group_ids = next.group_ids.filter((groupId) => allowedGroupIDs.has(groupId));
  return next;
}

function buildPayload(form: DomesticChannelFormState, channel: AdminChannel | null): DomesticChannelPayload {
  const headers = parseJsonObject(form.provider_headers_text, '请求头配置');
  const extra = parseJsonObject(form.provider_extra_json_text, '额外配置');
  const validMappings = form.openai_model_mappings.filter((item) => item.source.trim() && item.target.trim());
  const modelPricing = form.model_pricing.map(formPricingToApi).filter((entry) => entry.models.length > 0);

  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    status: form.status,
    group_ids: form.group_ids,
    model_pricing: modelPricing,
    model_mapping:
      validMappings.length > 0
        ? { openai: Object.fromEntries(validMappings.map((item) => [item.source.trim(), item.target.trim()])) }
        : {},
    billing_model_source: form.billing_model_source,
    restrict_models: form.restrict_models,
    provider_type: form.provider_type,
    provider_config: {
      ...extra,
      base_url: form.provider_base_url.trim(),
      api_key: form.provider_api_key.trim(),
      endpoint_path: form.provider_endpoint_path.trim() || '/v1/chat/completions',
      headers,
    },
    features_config: channel?.features_config || {},
    apply_pricing_to_account_stats: form.apply_pricing_to_account_stats,
    account_stats_pricing_rules: [],
  };
}

function buildTestPayload(form: DomesticChannelFormState): DomesticChannelTestPayload {
  const headers = parseJsonObject(form.provider_headers_text, '请求头配置');
  const extra = parseJsonObject(form.provider_extra_json_text, '额外配置');
  return {
    provider_type: form.provider_type,
    provider_config: {
      ...extra,
      base_url: form.provider_base_url.trim(),
      api_key: form.provider_api_key.trim(),
      endpoint_path: form.provider_endpoint_path.trim() || '/v1/chat/completions',
      headers,
    },
    test_model: form.test_model.trim() || undefined,
  };
}

function defaultTestModel(providerType?: string) {
  const preset = providerType ? getProviderPreset(providerType) : null;
  if (preset?.testModel) return preset.testModel;
  switch (providerType) {
    case 'deepseek':
      return 'deepseek-chat';
    case 'qwen':
      return 'qwen-plus';
    case 'zhipu':
      return 'glm-4-flash';
    default:
      return '';
  }
}

function getGroupPlatformLabel(platform?: string) {
  switch (platform) {
    case 'anthropic':
      return 'Anthropic';
    case 'openai':
      return 'OpenAI';
    case 'gemini':
      return 'Gemini';
    case 'antigravity':
      return 'Antigravity';
    default:
      return platform || '未设置';
  }
}

function getGroupPlatformBadgeClass(platform?: string) {
  switch (platform) {
    case 'anthropic':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
    case 'openai':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'antigravity':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
    default:
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
  }
}

function getGroupRoutingProfileLabel(profile?: string) {
  switch (profile) {
    case 'domestic':
      return '国内';
    case 'mixed':
      return '混合';
    default:
      return '海外';
  }
}

function getGroupRoutingProfileBadgeClass(profile?: string) {
  switch (profile) {
    case 'domestic':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
    case 'mixed':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">{children}</label>;
}

function capabilityBadgeClass(capability: string) {
  switch (capability) {
    case 'chat':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300';
    case 'embeddings':
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300';
    case 'rerank':
      return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-300';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300';
  }
}

function uniqueModelNames(models?: string[]) {
  if (!models?.length) return [];
  return Array.from(new Set(models.map((item) => item.trim()).filter(Boolean)));
}

function mergeModelsTextValue(currentValue: string, models: string[], mode: 'replace' | 'append' = 'replace') {
  const nextModels = uniqueModelNames(models);
  if (!nextModels.length) return currentValue;
  if (mode === 'replace') return nextModels.join('\n');
  return uniqueModelNames([...currentValue.split(/[\n,]/), ...nextModels]).join('\n');
}

function normalizeCapabilityModels(result: DomesticChannelModelsFetchResult | null) {
  const entries = CAPABILITY_ORDER.map((capability) => ({
    capability,
    label: CAPABILITY_LABELS[capability],
    models: uniqueModelNames(result?.capability_models?.[capability]),
  })).filter((entry) => entry.models.length > 0);
  return entries;
}

function summarizeTaskType(taskType?: string) {
  const value = (taskType || '').trim();
  if (!value) return '';
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.join(' / ');
      }
    } catch {}
  }
  return value;
}

function buildCatalogPreview(models: DomesticFetchedModelMetadata[] | undefined, limit = 8) {
  if (!models?.length) return [];
  return models
    .filter((item) => item.id || item.name)
    .slice(0, limit)
    .map((item) => ({
      id: item.id || item.name || '',
      version: item.version || '',
      domain: item.domain || '',
      taskType: summarizeTaskType(item.task_type),
      status: item.status || '',
      capabilities: item.capabilities || [],
    }));
}

function buildModelsFetchConfigKey(form: DomesticChannelFormState) {
  return JSON.stringify({
    providerType: form.provider_type,
    baseURL: form.provider_base_url.trim(),
    endpointPath: form.provider_endpoint_path.trim(),
    apiKey: form.provider_api_key.trim(),
    headers: form.provider_headers_text.trim(),
    extra: form.provider_extra_json_text.trim(),
  });
}

function ModalShell({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-[#111111]">
        <div className="flex items-center justify-between border-b border-gray-200 px-7 py-6 dark:border-gray-800">
          <h3 className="text-[32px] font-semibold tracking-[-0.03em] text-gray-900 dark:text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[calc(92vh-92px)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function DomesticChannelFormModal({
  open,
  channel,
  groups,
  submitting,
  onClose,
  onSubmit,
  onTestConnection,
  onTestMessages,
  onTestResponses,
  onFetchModels,
}: Props) {
  const [form, setForm] = useState<DomesticChannelFormState>(() => buildInitialFormState(channel, groups));
  const [localError, setLocalError] = useState('');
  const [fetchedModelsSnapshot, setFetchedModelsSnapshot] = useState<{
    key: string;
    result: DomesticChannelModelsFetchResult;
  } | null>(null);

  const availableGroups = useMemo(
    () =>
      [...groups]
        .filter((group) => group.routing_profile === 'domestic' || group.routing_profile === 'mixed')
        .sort((a, b) => {
        const routingRank = (profile?: string) => {
          if (profile === 'domestic') return 0;
          if (profile === 'mixed') return 1;
          return 2;
        };
        const routingCompare = routingRank(a.routing_profile) - routingRank(b.routing_profile);
        if (routingCompare !== 0) return routingCompare;
        const platformCompare = String(a.platform || '').localeCompare(String(b.platform || ''));
        if (platformCompare !== 0) return platformCompare;
        return String(a.name || '').localeCompare(String(b.name || ''));
        }),
    [groups]
  );

  const toggleGroup = (groupId: number) => {
    setForm((prev) => ({
      ...prev,
      group_ids: prev.group_ids.includes(groupId) ? prev.group_ids.filter((item) => item !== groupId) : [...prev.group_ids, groupId],
    }));
  };

  const addMapping = () => {
    setForm((prev) => ({
      ...prev,
      openai_model_mappings: [...prev.openai_model_mappings, { source: '', target: '' }],
    }));
  };

  const updateMapping = (index: number, field: keyof MappingRow, value: string) => {
    setForm((prev) => ({
      ...prev,
      openai_model_mappings: prev.openai_model_mappings.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const removeMapping = (index: number) => {
    setForm((prev) => ({
      ...prev,
      openai_model_mappings: prev.openai_model_mappings.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const pricingPlatforms = useMemo(() => {
    const selectedGroupPlatforms = Array.from(
      new Set(
        availableGroups
          .filter((group) => form.group_ids.includes(group.id))
          .map((group) => group.platform)
          .filter((platform): platform is string => Boolean(platform))
      )
    );
    return Array.from(new Set([...selectedGroupPlatforms, ...PRICING_PLATFORM_OPTIONS.map((item) => item.key)]));
  }, [availableGroups, form.group_ids]);
  const providerPreset = getProviderPreset(form.provider_type);
  const fetchModelsConfigKey = buildModelsFetchConfigKey(form);
  const fetchedModelsResult =
    fetchedModelsSnapshot && fetchedModelsSnapshot.key === fetchModelsConfigKey ? fetchedModelsSnapshot.result : null;
  const capabilityGroups = useMemo(() => normalizeCapabilityModels(fetchedModelsResult), [fetchedModelsResult]);
  const fetchedCatalogPreview = useMemo(() => buildCatalogPreview(fetchedModelsResult?.model_catalog), [fetchedModelsResult]);
  const dynamicTestModelHints = useMemo(() => {
    const chatModels = uniqueModelNames(fetchedModelsResult?.capability_models?.chat);
    return chatModels.length > 0 ? chatModels.slice(0, 12) : providerPreset?.modelHints || [];
  }, [fetchedModelsResult, providerPreset]);
  const chatCapabilityModels = useMemo(() => uniqueModelNames(fetchedModelsResult?.capability_models?.chat), [fetchedModelsResult]);

  const addPricingEntry = (platform: string) => {
    setForm((prev) => ({
      ...prev,
      model_pricing: [...prev.model_pricing, emptyPricingEntry(platform)],
    }));
  };

  const updatePricingEntry = (index: number, patch: Partial<PricingFormEntry>) => {
    setForm((prev) => ({
      ...prev,
      model_pricing: prev.model_pricing.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  };

  const removePricingEntry = (index: number) => {
    setForm((prev) => ({
      ...prev,
      model_pricing: prev.model_pricing.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError('');

    if (!form.name.trim()) {
      setLocalError('请输入接口名称');
      return;
    }
    if (!form.provider_base_url.trim()) {
      setLocalError('请输入上游 Base URL');
      return;
    }
    if (!form.provider_api_key.trim()) {
      setLocalError('请输入上游 API Key');
      return;
    }

    try {
      await onSubmit(buildPayload(form, channel));
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '保存接口配置失败');
    }
  };

  const ensureDiagnosticConfig = () => {
    if (!form.provider_base_url.trim()) {
      throw new Error('请输入上游 Base URL');
    }
    if (!form.provider_api_key.trim()) {
      throw new Error('请输入上游 API Key');
    }
  };

  const runTestConnection = async () => {
    ensureDiagnosticConfig();
    return await onTestConnection(buildTestPayload(form));
  };

  const runTestMessages = async () => {
    ensureDiagnosticConfig();
    return await onTestMessages(buildTestPayload(form));
  };

  const runTestResponses = async () => {
    ensureDiagnosticConfig();
    return await onTestResponses(buildTestPayload(form));
  };

  const runFetchModels = async () => {
    ensureDiagnosticConfig();
    const result = await onFetchModels(buildTestPayload(form));
    setFetchedModelsSnapshot({ key: fetchModelsConfigKey, result });
    return result;
  };

  return (
    <ModalShell open={open} title={channel ? '编辑接口' : '创建接口'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="border-b border-gray-200 px-7 pt-4 dark:border-gray-800">
          <div className="inline-flex border-b-2 border-emerald-500 px-3 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            接口配置
          </div>
        </div>

        <div className="space-y-6 px-7 py-6">
          {localError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {localError}
            </div>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <FieldLabel>名称 *</FieldLabel>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="输入接口名称"
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              />
            </div>
            <div>
              <FieldLabel>接口类型</FieldLabel>
              <select
                value={form.provider_type}
                onChange={(e) => setForm((prev) => applyProviderDefaults(e.target.value, prev))}
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              >
                {PROVIDER_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-gray-400">{getProviderHelpText(form.provider_type)}</p>
              {providerPreset ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((prev) => applyProviderMappingPreset(prev, form.provider_type))}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                  >
                    套用当前接口推荐映射
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => applyProviderPricingPreset(prev, form.provider_type))}
                    className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-900/50 dark:bg-indigo-950/20 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                  >
                    套用当前接口定价模板
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div>
            <FieldLabel>描述</FieldLabel>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="可选描述"
              className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            />
          </div>

          {channel ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <FieldLabel>状态</FieldLabel>
                <select
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                >
                  <option value="active">启用</option>
                  <option value="disabled">停用</option>
                </select>
              </div>
              <div>
                <FieldLabel>计费基准</FieldLabel>
                <select
                  value={form.billing_model_source}
                  onChange={(e) => setForm((prev) => ({ ...prev, billing_model_source: e.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                >
                  <option value="channel_mapped">以接口映射后的模型计费</option>
                  <option value="requested">以请求模型计费</option>
                  <option value="upstream">以上游最终模型计费</option>
                </select>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <div className="mb-2 text-sm font-medium text-gray-900 dark:text-white">绑定分组</div>
            <div className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              接口管理这里只显示 `国内渠道组` 和 `混合组`。分组上的 `Anthropic / OpenAI / Gemini / Antigravity`
              仅表示原系统的主调度平台，不再作为接口分组的区分依据。
            </div>
            <div className="space-y-4">
              {availableGroups.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">当前暂无可绑定分组</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableGroups.map((group) => (
                    <label
                      key={group.id}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                        form.group_ids.includes(group.id)
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.group_ids.includes(group.id)}
                        onChange={() => toggleGroup(group.id)}
                        className="h-3.5 w-3.5 rounded border-gray-300"
                      />
                      <span>{group.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getGroupRoutingProfileBadgeClass(group.routing_profile)}`}
                      >
                        {getGroupRoutingProfileLabel(group.routing_profile)}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getGroupPlatformBadgeClass(group.platform)}`}
                      >
                        {getGroupPlatformLabel(group.platform)}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                        {group.subscription_type === 'subscription' ? '订阅' : '标准'}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                        {Number(group.rate_multiplier || 1).toFixed(1)}x
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
              <div className="mb-4 text-sm font-medium text-gray-900 dark:text-white">上游接入</div>
              <div className="space-y-4">
                <div>
                  <FieldLabel>Base URL *</FieldLabel>
                  <input
                    value={form.provider_base_url}
                    onChange={(e) => setForm((prev) => ({ ...prev, provider_base_url: e.target.value }))}
                    placeholder="例如 https://api.deepseek.com"
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <FieldLabel>API Key *</FieldLabel>
                  <input
                    type="password"
                    value={form.provider_api_key}
                    onChange={(e) => setForm((prev) => ({ ...prev, provider_api_key: e.target.value }))}
                    placeholder="输入真实上游 API Key"
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <FieldLabel>Endpoint Path</FieldLabel>
                  <input
                    value={form.provider_endpoint_path}
                    onChange={(e) => setForm((prev) => ({ ...prev, provider_endpoint_path: e.target.value }))}
                    placeholder="/v1/chat/completions"
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <FieldLabel>测试模型</FieldLabel>
                  <input
                    value={form.test_model}
                    onChange={(e) => setForm((prev) => ({ ...prev, test_model: e.target.value }))}
                    placeholder={`例如 ${providerPreset?.testModel || 'deepseek-chat'}`}
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                  />
                  <p className="mt-2 text-xs text-gray-400">这里填写上游真实模型名，测试连接按钮会直接拿当前表单配置请求上游。</p>
                  {dynamicTestModelHints.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {dynamicTestModelHints.map((model) => (
                        <button
                          key={model}
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, test_model: model }))}
                          className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20 dark:hover:text-emerald-300"
                        >
                          {model}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {capabilityGroups.length ? (
                    <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/30">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-200">最近一次拉取的模型能力分桶</div>
                      <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        可直接点选填入测试模型；当前分桶来自最新一次 `拉取模型列表` 结果。
                      </div>
                      <div className="mt-3 space-y-3">
                        {capabilityGroups.map((group) => (
                          <div key={group.capability}>
                            <div className="mb-2 flex items-center gap-2">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${capabilityBadgeClass(group.capability)}`}
                              >
                                {group.label} {group.models.length}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {group.models.slice(0, 12).map((model) => (
                                <button
                                  key={`${group.capability}-${model}`}
                                  type="button"
                                  onClick={() => setForm((prev) => ({ ...prev, test_model: model }))}
                                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                                    form.test_model.trim() === model
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                                      : 'border-gray-200 bg-white text-gray-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20 dark:hover:text-emerald-300'
                                  }`}
                                >
                                  {model}
                                </button>
                              ))}
                              {group.models.length > 12 ? (
                                <span className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-[11px] text-gray-400 dark:border-gray-700">
                                  +{group.models.length - 12}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {fetchedCatalogPreview.length ? (
                    <div className="mt-4 rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-200">最近一次上游模型目录预览</div>
                      <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        用来确认模型族、版本、状态和能力分类是否对得上。
                      </div>
                      <div className="mt-3 space-y-2">
                        {fetchedCatalogPreview.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, test_model: item.id }))}
                            className="w-full rounded-xl border border-gray-200 px-3 py-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-gray-700 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/10"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{item.id}</span>
                              {item.version ? (
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                                  v{item.version}
                                </span>
                              ) : null}
                              {item.status ? (
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                                  {item.status}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {item.domain ? (
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                                  {item.domain}
                                </span>
                              ) : null}
                              {item.taskType ? (
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                                  {item.taskType}
                                </span>
                              ) : null}
                              {item.capabilities.map((capability) => (
                                <span
                                  key={`${item.id}-${capability}`}
                                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${capabilityBadgeClass(capability)}`}
                                >
                                  {CAPABILITY_LABELS[capability] || capability}
                                </span>
                              ))}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div>
                  <FieldLabel>请求头 JSON</FieldLabel>
                  <textarea
                    rows={5}
                    value={form.provider_headers_text}
                    onChange={(e) => setForm((prev) => ({ ...prev, provider_headers_text: e.target.value }))}
                    placeholder={'{\n  "X-Custom-Header": "value"\n}'}
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 font-mono text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">OpenAI 模型映射</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    把外部请求模型映射到国内上游真实模型名。切到 `Qwen / Zhipu / DeepSeek` 后，可直接点上方按钮套用推荐模板。
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400">
                    左边是你对外暴露给客户端使用的请求模型别名，右边才是当前国内上游的真实模型名。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={addMapping}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <Plus className="mr-1 inline h-3.5 w-3.5" />
                  添加映射
                </button>
              </div>
              {form.openai_model_mappings.length === 0 ? (
                <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
                  暂无模型映射。你可以直接请求真实上游模型名，也可以在这里补标准模型别名。
                </div>
              ) : (
                <div className="space-y-3">
                  {form.openai_model_mappings.map((row, index) => (
                    <div key={`mapping-${index}`} className="rounded-2xl border border-gray-200 p-3 dark:border-gray-700">
                      <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                        <input
                          value={row.source}
                          onChange={(e) => updateMapping(index, 'source', e.target.value)}
                          placeholder="请求模型，如 gpt-4o-mini"
                          className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                        />
                        <input
                          value={row.target}
                          onChange={(e) => updateMapping(index, 'target', e.target.value)}
                          placeholder="上游模型，如 deepseek-chat"
                          className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => removeMapping(index)}
                          className="rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          删除
                        </button>
                      </div>
                      {chatCapabilityModels.length ? (
                        <div className="mt-3">
                          <div className="mb-2 flex items-center gap-2">
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${capabilityBadgeClass('chat')}`}>
                              Chat 候选 {chatCapabilityModels.length}
                            </span>
                            <span className="text-[11px] text-gray-400">点击可直接回填右侧 target</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {chatCapabilityModels.slice(0, 10).map((model) => (
                              <button
                                key={`mapping-${index}-${model}`}
                                type="button"
                                onClick={() => updateMapping(index, 'target', model)}
                                className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                                  row.target.trim() === model
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20 dark:hover:text-emerald-300'
                                }`}
                              >
                                {model}
                              </button>
                            ))}
                            {chatCapabilityModels.length > 10 ? (
                              <span className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-[11px] text-gray-400 dark:border-gray-700">
                                +{chatCapabilityModels.length - 10}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <div className="mb-4 text-sm font-medium text-gray-900 dark:text-white">额外 Provider 配置 JSON</div>
            <textarea
              rows={6}
              value={form.provider_extra_json_text}
              onChange={(e) => setForm((prev) => ({ ...prev, provider_extra_json_text: e.target.value }))}
              placeholder={'{\n  "timeout_ms": 60000,\n  "organization": "",\n  "proxy": ""\n}'}
              className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 font-mono text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            />
          </div>

          <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">模型定价</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  接口管理也必须配置模型定价，否则请求虽然会写入 `usage_logs`，但 `total_cost / quota_used / 用户余额` 都不会变化。
                </div>
                  {providerPreset ? (
                    <div className="mt-2 text-[11px] text-gray-400">
                      当前接口可先套用 `{PROVIDER_OPTIONS.find((option) => option.key === form.provider_type)?.label || form.provider_type}`
                      模板；模板会预填常用模型，单价请按你的上游账单核对后再保存。
                    </div>
                  ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {pricingPlatforms.map((platform) => (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => addPricingEntry(platform)}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    新增 {PRICING_PLATFORM_OPTIONS.find((item) => item.key === platform)?.label || platform} 定价
                  </button>
                ))}
              </div>
            </div>
            {form.model_pricing.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">暂无模型定价配置</div>
            ) : (
              <div className="space-y-4">
                {form.model_pricing.map((entry, index) => (
                  <div key={`${entry.platform}-${index}`} className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/40">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium ${
                            PRICING_PLATFORM_OPTIONS.find((item) => item.key === entry.platform)?.color || 'text-gray-700'
                          }`}
                        >
                          {PRICING_PLATFORM_OPTIONS.find((item) => item.key === entry.platform)?.label || entry.platform}
                        </span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-500 dark:bg-[#111111] dark:text-gray-300">
                          {entry.billing_mode === 'token' ? 'Token' : entry.billing_mode === 'image' ? '图片按次' : '按次'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePricingEntry(index)}
                        className="rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        删除定价
                      </button>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[180px_1.5fr_220px]">
                      <div>
                        <FieldLabel>所属平台</FieldLabel>
                        <select
                          value={entry.platform}
                          onChange={(e) => updatePricingEntry(index, { platform: e.target.value })}
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                        >
                          {PRICING_PLATFORM_OPTIONS.map((option) => (
                            <option key={option.key} value={option.key}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <FieldLabel>模型列表</FieldLabel>
                        <textarea
                          rows={4}
                          value={entry.modelsText}
                          onChange={(e) => updatePricingEntry(index, { modelsText: e.target.value })}
                          placeholder="每行一个模型，或使用逗号分隔，支持通配符 *"
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                        />
                        {capabilityGroups.length ? (
                          <div className="mt-3 rounded-2xl border border-gray-200 bg-white/70 p-3 dark:border-gray-700 dark:bg-[#111111]/40">
                            <div className="text-[11px] font-medium text-gray-600 dark:text-gray-300">按能力分桶快捷填充</div>
                            <div className="mt-1 text-[11px] text-gray-400">可整桶覆盖或追加到当前模型列表，适合给聊天、向量和重排分别建定价。</div>
                            <div className="mt-3 space-y-3">
                              {capabilityGroups.map((group) => (
                                <div key={`${entry.platform}-${index}-${group.capability}`}>
                                  <div className="mb-2 flex items-center gap-2">
                                    <span
                                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${capabilityBadgeClass(group.capability)}`}
                                    >
                                      {group.label} {group.models.length}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updatePricingEntry(index, {
                                          modelsText: mergeModelsTextValue(entry.modelsText, group.models, 'replace'),
                                        })
                                      }
                                      className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-gray-700 dark:text-gray-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20 dark:hover:text-emerald-300"
                                    >
                                      覆盖填入
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updatePricingEntry(index, {
                                          modelsText: mergeModelsTextValue(entry.modelsText, group.models, 'append'),
                                        })
                                      }
                                      className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-gray-700 dark:text-gray-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20 dark:hover:text-emerald-300"
                                    >
                                      追加填入
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {group.models.slice(0, 8).map((model) => (
                                      <button
                                        key={`${entry.platform}-${index}-${group.capability}-${model}`}
                                        type="button"
                                        onClick={() =>
                                          updatePricingEntry(index, {
                                            modelsText: mergeModelsTextValue(entry.modelsText, [model], 'append'),
                                          })
                                        }
                                        className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20 dark:hover:text-emerald-300"
                                      >
                                        {model}
                                      </button>
                                    ))}
                                    {group.models.length > 8 ? (
                                      <span className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-[11px] text-gray-400 dark:border-gray-700">
                                        +{group.models.length - 8}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <FieldLabel>计费模式</FieldLabel>
                        <select
                          value={entry.billing_mode}
                          onChange={(e) =>
                            updatePricingEntry(index, {
                              billing_mode: e.target.value as PricingFormEntry['billing_mode'],
                            })
                          }
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                        >
                          <option value="token">Token</option>
                          <option value="per_request">按次</option>
                          <option value="image">图片按次</option>
                        </select>
                        {entry.intervals.length > 0 ? (
                          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                            已保留 {entry.intervals.length} 个区间配置，本版暂不编辑区间。
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {entry.billing_mode === 'token' ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        <div>
                          <FieldLabel>输入价 ($/MTok)</FieldLabel>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={entry.input_price}
                            onChange={(e) => updatePricingEntry(index, { input_price: e.target.value })}
                            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                          />
                        </div>
                        <div>
                          <FieldLabel>输出价 ($/MTok)</FieldLabel>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={entry.output_price}
                            onChange={(e) => updatePricingEntry(index, { output_price: e.target.value })}
                            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                          />
                        </div>
                        <div>
                          <FieldLabel>缓存写入 ($/MTok)</FieldLabel>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={entry.cache_write_price}
                            onChange={(e) => updatePricingEntry(index, { cache_write_price: e.target.value })}
                            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                          />
                        </div>
                        <div>
                          <FieldLabel>缓存读取 ($/MTok)</FieldLabel>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={entry.cache_read_price}
                            onChange={(e) => updatePricingEntry(index, { cache_read_price: e.target.value })}
                            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                          />
                        </div>
                        <div>
                          <FieldLabel>图片输出 ($/MTok)</FieldLabel>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={entry.image_output_price}
                            onChange={(e) => updatePricingEntry(index, { image_output_price: e.target.value })}
                            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div>
                          <FieldLabel>{entry.billing_mode === 'image' ? '图片价格 ($)' : '单次价格 ($)'}</FieldLabel>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={entry.per_request_price}
                            onChange={(e) => updatePricingEntry(index, { per_request_price: e.target.value })}
                            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">将定价应用到账号统计</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">开启后，接口定价也会参与账号统计口径。</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    apply_pricing_to_account_stats: !prev.apply_pricing_to_account_stats,
                  }))
                }
                className={`relative inline-flex h-7 w-12 rounded-full transition ${
                  form.apply_pricing_to_account_stats ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                    form.apply_pricing_to_account_stats ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <DomesticChannelDiagnosticsPanel
            key={JSON.stringify({
              providerType: form.provider_type,
              baseURL: form.provider_base_url,
              endpointPath: form.provider_endpoint_path,
              testModel: form.test_model,
              headers: form.provider_headers_text,
              extra: form.provider_extra_json_text,
            })}
            onTestConnection={runTestConnection}
            onTestMessages={runTestMessages}
            onTestResponses={runTestResponses}
            onFetchModels={runFetchModels}
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-7 py-5 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? (channel ? '保存中' : '创建中') : channel ? '保存' : '创建'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
