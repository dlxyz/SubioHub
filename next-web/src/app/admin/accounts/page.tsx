'use client';

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { CircleHelp, ChevronDown, ChevronRight, Copy, ExternalLink, Loader2, Plus, RefreshCw, Search, ShieldAlert, Upload, Download, ListFilter, Columns3, Link2, Lock, TestTube2, X } from 'lucide-react';
import {
  createAdminAccount,
  exchangeAdminAccountCode,
  generateAdminAccountAuthUrl,
  getAdminAntigravityDefaultModelMapping,
  getGeminiOAuthCapabilities,
  listAdminAccounts,
  listAdminGroups,
  listAdminProxies,
  listAdminTLSFingerprintProfiles,
  testAdminAccount,
  updateAdminAccount,
  type AdminAccount,
  type AdminGroup,
  type GeminiOAuthCapabilities,
  type AdminProxy,
  type AdminTLSFingerprintProfile,
} from '@/lib/admin-api';

const PAGE_SIZE = 20;
const AUTO_REFRESH_INTERVAL_MS = 15000;

const PLATFORM_OPTIONS = [
  { key: 'anthropic', label: 'Anthropic', accent: 'text-orange-600 dark:text-orange-300' },
  { key: 'openai', label: 'OpenAI', accent: 'text-emerald-600 dark:text-emerald-300' },
  { key: 'gemini', label: 'Gemini', accent: 'text-blue-600 dark:text-blue-300' },
  { key: 'antigravity', label: 'Antigravity', accent: 'text-purple-600 dark:text-purple-300' },
] as const;

type AccountPlatform = (typeof PLATFORM_OPTIONS)[number]['key'];
type StepOneType = 'claude_code' | 'claude_console' | 'bedrock' | 'openai_oauth' | 'openai_apikey' | 'gemini_oauth' | 'gemini_apikey' | 'antigravity_oauth' | 'antigravity_upstream';
type AuthMethod = 'oauth' | 'setup-token' | 'apikey' | 'sigv4' | 'upstream';

type AccountFilters = {
  platform: string;
  type: string;
  status: string;
  privacy_mode: string;
  group: string;
};

type AccountWizardForm = {
  name: string;
  notes: string;
  platform: AccountPlatform;
  accountType: StepOneType;
  authMethod: AuthMethod;
  tempUnschedulable: boolean;
  interceptWarmupRequests: boolean;
  proxyId: string;
  concurrency: string;
  loadFactor: string;
  priority: string;
  rateMultiplier: string;
  expiresAt: string;
  autoPauseOnExpired: boolean;
  groupIds: number[];
  windowCostEnabled: boolean;
  windowCostLimit: string;
  windowCostStickyReserve: string;
  sessionLimitEnabled: boolean;
  maxSessions: string;
  sessionIdleTimeout: string;
  rpmLimitEnabled: boolean;
  baseRpm: string;
  rpmStrategy: 'tiered' | 'sticky_exempt';
  rpmStickyBuffer: string;
  userMsgQueueMode: '' | 'throttle' | 'serialize';
  tlsFingerprintEnabled: boolean;
  tlsFingerprintProfileId: string;
  sessionIdMaskingEnabled: boolean;
  cacheTTLOverrideEnabled: boolean;
  cacheTTLOverrideTarget: '5m' | '1h';
  customBaseUrlEnabled: boolean;
  customBaseUrl: string;
  tempUnschedRules: TempUnschedRuleForm[];
  apiKeyBaseUrl: string;
  apiKeyValue: string;
  quotaTotalLimit: string;
  quotaDailyLimit: string;
  quotaWeeklyLimit: string;
  anthropicPassthroughEnabled: boolean;
  webSearchEmulationMode: 'default' | 'enabled' | 'disabled';
  modelRestrictionMode: 'whitelist' | 'mapping';
  allowedModels: string[];
  modelMappings: ModelMappingForm[];
  poolModeEnabled: boolean;
  poolModeRetryCount: string;
  customErrorCodesEnabled: boolean;
  selectedErrorCodes: number[];
  customErrorCodeInput: string;
  bedrockAccessKeyId: string;
  bedrockSecretAccessKey: string;
  bedrockSessionToken: string;
  bedrockRegion: string;
  bedrockForceGlobal: boolean;
  bedrockApiKeyValue: string;
  openaiPassthroughEnabled: boolean;
  openaiResponsesWebSocketMode: 'off' | 'ctx_pool' | 'passthrough';
  openaiCodexCliOnly: boolean;
  openaiCustomModelName: string;
  geminiCustomModelName: string;
  geminiOAuthType: 'google_one' | 'code_assist' | 'ai_studio';
  geminiShowAdvancedOAuth: boolean;
  geminiTierGoogleOne: 'google_one_free' | 'google_ai_pro' | 'google_ai_ultra';
  geminiTierGcp: 'gcp_standard' | 'gcp_enterprise';
  geminiTierAIStudio: 'aistudio_free' | 'aistudio_paid';
  antigravityMixedScheduling: boolean;
  antigravityAllowOverages: boolean;
};

type TempUnschedRuleForm = {
  error_code: string;
  keywords: string;
  duration_minutes: string;
  description: string;
};

type ModelMappingForm = {
  from: string;
  to: string;
};

const DEFAULT_WIZARD_FORM: AccountWizardForm = {
  name: '',
  notes: '',
  platform: 'anthropic',
  accountType: 'claude_code',
  authMethod: 'oauth',
  tempUnschedulable: false,
  interceptWarmupRequests: false,
  proxyId: '',
  concurrency: '10',
  loadFactor: '10',
  priority: '1',
  rateMultiplier: '1',
  expiresAt: '',
  autoPauseOnExpired: true,
  groupIds: [],
  windowCostEnabled: false,
  windowCostLimit: '',
  windowCostStickyReserve: '10',
  sessionLimitEnabled: false,
  maxSessions: '',
  sessionIdleTimeout: '5',
  rpmLimitEnabled: false,
  baseRpm: '15',
  rpmStrategy: 'tiered',
  rpmStickyBuffer: '',
  userMsgQueueMode: '',
  tlsFingerprintEnabled: false,
  tlsFingerprintProfileId: '',
  sessionIdMaskingEnabled: false,
  cacheTTLOverrideEnabled: false,
  cacheTTLOverrideTarget: '5m',
  customBaseUrlEnabled: false,
  customBaseUrl: '',
  tempUnschedRules: [],
  apiKeyBaseUrl: 'https://api.anthropic.com',
  apiKeyValue: '',
  quotaTotalLimit: '',
  quotaDailyLimit: '',
  quotaWeeklyLimit: '',
  anthropicPassthroughEnabled: false,
  webSearchEmulationMode: 'default',
  modelRestrictionMode: 'whitelist',
  allowedModels: [],
  modelMappings: [],
  poolModeEnabled: false,
  poolModeRetryCount: '3',
  customErrorCodesEnabled: false,
  selectedErrorCodes: [],
  customErrorCodeInput: '',
  bedrockAccessKeyId: '',
  bedrockSecretAccessKey: '',
  bedrockSessionToken: '',
  bedrockRegion: 'us-east-1',
  bedrockForceGlobal: false,
  bedrockApiKeyValue: '',
  openaiPassthroughEnabled: false,
  openaiResponsesWebSocketMode: 'off',
  openaiCodexCliOnly: false,
  openaiCustomModelName: '',
  geminiCustomModelName: '',
  geminiOAuthType: 'google_one',
  geminiShowAdvancedOAuth: false,
  geminiTierGoogleOne: 'google_one_free',
  geminiTierGcp: 'gcp_standard',
  geminiTierAIStudio: 'aistudio_free',
  antigravityMixedScheduling: false,
  antigravityAllowOverages: false,
};

type WizardAuthState = {
  url: string;
  sessionId: string;
  state: string;
  codeInput: string;
  refreshTokenInput: string;
  sessionKeyInput: string;
  mode: 'code' | 'cookie';
  generating: boolean;
  submitting: boolean;
};

const DEFAULT_WIZARD_AUTH_STATE: WizardAuthState = {
  url: '',
  sessionId: '',
  state: '',
  codeInput: '',
  refreshTokenInput: '',
  sessionKeyInput: '',
  mode: 'code',
  generating: false,
  submitting: false,
};

const TEMP_UNSCHED_PRESETS: Array<{ label: string; rule: TempUnschedRuleForm }> = [
  {
    label: '过载 529',
    rule: {
      error_code: '529',
      keywords: 'overloaded, too many',
      duration_minutes: '60',
      description: 'Claude 过载时临时下线 60 分钟',
    },
  },
  {
    label: '限流 429',
    rule: {
      error_code: '429',
      keywords: 'rate limit, too many requests',
      duration_minutes: '10',
      description: '命中速率限制时短暂下线 10 分钟',
    },
  },
  {
    label: '不可用 503',
    rule: {
      error_code: '503',
      keywords: 'unavailable, maintenance',
      duration_minutes: '30',
      description: '服务不可用或维护时下线 30 分钟',
    },
  },
];

const DEFAULT_POOL_MODE_RETRY_COUNT = 3;
const MAX_POOL_MODE_RETRY_COUNT = 10;
const CLAUDE_MODELS = [
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-20240620',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
  'claude-3-7-sonnet-20250219',
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-opus-4-1-20250805',
  'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-5-20251101',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-2.1',
  'claude-2.0',
  'claude-instant-1.2',
] as const;
const CLAUDE_CONSOLE_PRESET_MAPPINGS = [
  { label: 'Sonnet 4', from: 'claude-sonnet-4-20250514', to: 'claude-sonnet-4-20250514' },
  { label: 'Sonnet 4.5', from: 'claude-sonnet-4-5-20250929', to: 'claude-sonnet-4-5-20250929' },
  { label: 'Sonnet 4.6', from: 'claude-sonnet-4-6', to: 'claude-sonnet-4-6' },
  { label: 'Opus 4.5', from: 'claude-opus-4-5-20251101', to: 'claude-opus-4-5-20251101' },
  { label: 'Opus 4.6', from: 'claude-opus-4-6', to: 'claude-opus-4-6' },
  { label: 'Haiku 3.5', from: 'claude-3-5-haiku-20241022', to: 'claude-3-5-haiku-20241022' },
  { label: 'Haiku 4.5', from: 'claude-haiku-4-5-20251001', to: 'claude-haiku-4-5-20251001' },
  { label: 'Opus->Sonnet', from: 'claude-opus-4-6', to: 'claude-sonnet-4-5-20250929' },
] as const;
const BEDROCK_PRESET_MAPPINGS = [
  { label: 'Opus 4.6', from: 'claude-opus-4-6', to: 'us.anthropic.claude-opus-4-6-v1' },
  { label: 'Sonnet 4.6', from: 'claude-sonnet-4-6', to: 'us.anthropic.claude-sonnet-4-6' },
  { label: 'Opus 4.5', from: 'claude-opus-4-5-thinking', to: 'us.anthropic.claude-opus-4-5-20251101-v1:0' },
  { label: 'Sonnet 4.5', from: 'claude-sonnet-4-5', to: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0' },
  { label: 'Haiku 4.5', from: 'claude-haiku-4-5', to: 'us.anthropic.claude-haiku-4-5-20251001-v1:0' },
] as const;
const BEDROCK_REGIONS = [
  { value: 'us-east-1', label: 'us-east-1 (N. Virginia)' },
  { value: 'us-east-2', label: 'us-east-2 (Ohio)' },
  { value: 'us-west-1', label: 'us-west-1 (N. California)' },
  { value: 'us-west-2', label: 'us-west-2 (Oregon)' },
  { value: 'eu-west-1', label: 'eu-west-1 (Ireland)' },
  { value: 'eu-west-2', label: 'eu-west-2 (London)' },
  { value: 'eu-west-3', label: 'eu-west-3 (Paris)' },
  { value: 'eu-central-1', label: 'eu-central-1 (Frankfurt)' },
  { value: 'ap-northeast-1', label: 'ap-northeast-1 (Tokyo)' },
  { value: 'ap-northeast-2', label: 'ap-northeast-2 (Seoul)' },
  { value: 'ap-south-1', label: 'ap-south-1 (Mumbai)' },
  { value: 'ap-southeast-1', label: 'ap-southeast-1 (Singapore)' },
  { value: 'ap-southeast-2', label: 'ap-southeast-2 (Sydney)' },
  { value: 'ca-central-1', label: 'ca-central-1 (Canada)' },
  { value: 'sa-east-1', label: 'sa-east-1 (Sao Paulo)' },
] as const;
const COMMON_ERROR_CODES = [
  { value: 401, label: 'Unauthorized' },
  { value: 403, label: 'Forbidden' },
  { value: 429, label: 'Rate Limit' },
  { value: 500, label: 'Server Error' },
  { value: 502, label: 'Bad Gateway' },
  { value: 503, label: 'Unavailable' },
  { value: 529, label: 'Overloaded' },
] as const;
const OPENAI_WS_MODE_OPTIONS = [
  { value: 'off', label: '关闭 (off)' },
  { value: 'ctx_pool', label: '上下文池 (ctx_pool)' },
  { value: 'passthrough', label: '透传 (passthrough)' },
] as const;
const OPENAI_MODELS = [
  'gpt-4o',
  'gpt-4o-2024-11-20',
  'gpt-4o-mini',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4.5-preview',
  'o1',
  'o1-mini',
  'o1-pro',
  'o3',
  'o3-mini',
  'o3-pro',
  'o4-mini',
  'gpt-5',
  'gpt-5-chat',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-5-pro',
  'gpt-5-codex',
  'chatgpt-4o-latest',
  'gpt-4o-realtime-preview',
] as const;
const OPENAI_PRESET_MAPPINGS = [
  { label: 'GPT-4o', from: 'gpt-4o', to: 'gpt-4o' },
  { label: 'GPT-4.1', from: 'gpt-4.1', to: 'gpt-4.1' },
  { label: 'o1', from: 'o1', to: 'o1' },
  { label: 'o3', from: 'o3', to: 'o3' },
  { label: 'GPT-5', from: 'gpt-5', to: 'gpt-5' },
] as const;
const GEMINI_MODELS = [
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-image',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
] as const;
const GEMINI_HELP_DOC_URL = 'https://ai.google.dev/gemini-api/docs';
const GEMINI_API_KEY_URL = 'https://aistudio.google.com/app/apikey';
const GEMINI_GOOGLE_ONE_TIERS = [
  { value: 'google_one_free', label: 'Google One Free' },
  { value: 'google_ai_pro', label: 'Google AI Pro' },
  { value: 'google_ai_ultra', label: 'Google AI Ultra' },
] as const;
const GEMINI_GCP_TIERS = [
  { value: 'gcp_standard', label: 'GCP Standard' },
  { value: 'gcp_enterprise', label: 'GCP Enterprise' },
] as const;
const GEMINI_AISTUDIO_TIERS = [
  { value: 'aistudio_free', label: 'Google AI Free' },
  { value: 'aistudio_paid', label: 'Google AI Pay-as-you-go' },
] as const;
const ANTIGRAVITY_DEFAULT_BASE_URL = 'https://cloudcode-pa.googleapis.com';
const ANTIGRAVITY_MODELS = [
  'claude-opus-4-6',
  'claude-opus-4-6-thinking',
  'claude-opus-4-5-thinking',
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-sonnet-4-5-thinking',
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-image',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash-thinking',
  'gemini-2.5-pro',
  'gemini-3-flash',
  'gemini-3-pro-high',
  'gemini-3-pro-low',
  'gemini-3.1-pro-high',
  'gemini-3.1-pro-low',
  'gemini-3-pro-image',
  'gpt-oss-120b-medium',
  'tab_flash_lite_preview',
] as const;
const ANTIGRAVITY_PRESET_MAPPINGS = [
  { label: 'Claude→Sonnet', from: 'claude-*', to: 'claude-sonnet-4-5', color: 'border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-950/20' },
  { label: 'Sonnet→Sonnet', from: 'claude-sonnet-*', to: 'claude-sonnet-4-5', color: 'border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-950/20' },
  { label: 'Opus→Opus', from: 'claude-opus-*', to: 'claude-opus-4-6-thinking', color: 'border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-950/20' },
  { label: 'Haiku→Sonnet', from: 'claude-haiku-*', to: 'claude-sonnet-4-5', color: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-950/20' },
  { label: 'Gemini 3→Flash', from: 'gemini-3*', to: 'gemini-3-flash', color: 'border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-950/20' },
  { label: 'Gemini 2.5→Flash', from: 'gemini-2.5*', to: 'gemini-2.5-flash', color: 'border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-950/20' },
  { label: '2.5 Flash Image', from: 'gemini-2.5-flash-image', to: 'gemini-2.5-flash-image', color: 'border-sky-200 text-sky-700 hover:bg-sky-50 dark:border-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-950/20' },
  { label: '3.1 Flash Image', from: 'gemini-3.1-flash-image', to: 'gemini-3.1-flash-image', color: 'border-cyan-200 text-cyan-700 hover:bg-cyan-50 dark:border-cyan-900/30 dark:text-cyan-300 dark:hover:bg-cyan-950/20' },
  { label: 'Sonnet 4.6', from: 'claude-sonnet-4-6', to: 'claude-sonnet-4-6', color: 'border-teal-200 text-teal-700 hover:bg-teal-50 dark:border-teal-900/30 dark:text-teal-300 dark:hover:bg-teal-950/20' },
  { label: 'Opus 4.6', from: 'claude-opus-4-6', to: 'claude-opus-4-6-thinking', color: 'border-pink-200 text-pink-700 hover:bg-pink-50 dark:border-pink-900/30 dark:text-pink-300 dark:hover:bg-pink-950/20' },
] as const;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatDateTime(value?: string | number | null) {
  if (!value) return '-';
  const date = new Date(typeof value === 'number' ? value : value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalInteger(value: string) {
  const parsed = parseOptionalNumber(value);
  if (parsed === undefined) return undefined;
  return Math.trunc(parsed);
}

function parseDateTimeLocalToUnix(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / 1000);
}

function extractOAuthCode(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return url.searchParams.get('code') || trimmed;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function buildClaudeCodeExtra(form: AccountWizardForm, tokenInfo: Record<string, unknown>) {
  const extra: Record<string, unknown> = {};

  for (const key of ['org_uuid', 'account_uuid', 'email_address']) {
    const value = tokenInfo[key];
    if (typeof value === 'string' && value.trim()) {
      extra[key] = value.trim();
    }
  }

  const windowCostLimit = parseOptionalNumber(form.windowCostLimit);
  if (form.windowCostEnabled && windowCostLimit && windowCostLimit > 0) {
    extra.window_cost_limit = windowCostLimit;
    extra.window_cost_sticky_reserve = parseOptionalNumber(form.windowCostStickyReserve) ?? 10;
  }

  const maxSessions = parseOptionalInteger(form.maxSessions);
  if (form.sessionLimitEnabled && maxSessions && maxSessions > 0) {
    extra.max_sessions = maxSessions;
    extra.session_idle_timeout_minutes = parseOptionalInteger(form.sessionIdleTimeout) ?? 5;
  }

  if (form.rpmLimitEnabled) {
    extra.base_rpm = parseOptionalInteger(form.baseRpm) ?? 15;
    extra.rpm_strategy = form.rpmStrategy;
    const rpmStickyBuffer = parseOptionalInteger(form.rpmStickyBuffer);
    if (rpmStickyBuffer && rpmStickyBuffer > 0) {
      extra.rpm_sticky_buffer = rpmStickyBuffer;
    }
  }

  if (form.userMsgQueueMode) {
    extra.user_msg_queue_mode = form.userMsgQueueMode;
  }

  if (form.tlsFingerprintEnabled) {
    extra.enable_tls_fingerprint = true;
    const tlsFingerprintProfileId = parseOptionalInteger(form.tlsFingerprintProfileId);
    if (tlsFingerprintProfileId !== undefined) {
      extra.tls_fingerprint_profile_id = tlsFingerprintProfileId;
    }
  }

  if (form.sessionIdMaskingEnabled) {
    extra.session_id_masking_enabled = true;
  }

  if (form.cacheTTLOverrideEnabled) {
    extra.cache_ttl_override_enabled = true;
    extra.cache_ttl_override_target = form.cacheTTLOverrideTarget;
  }

  if (form.customBaseUrlEnabled && form.customBaseUrl.trim()) {
    extra.custom_base_url_enabled = true;
    extra.custom_base_url = form.customBaseUrl.trim();
  }

  return Object.keys(extra).length > 0 ? extra : undefined;
}

function buildAnthropicAPIKeyExtra(form: AccountWizardForm) {
  const extra = buildQuotaExtra(form);
  if (form.anthropicPassthroughEnabled) {
    extra.anthropic_passthrough = true;
  }
  if (form.webSearchEmulationMode !== 'default') {
    extra.web_search_emulation = form.webSearchEmulationMode;
  }

  return Object.keys(extra).length > 0 ? extra : undefined;
}

function buildQuotaExtra(form: AccountWizardForm) {
  const extra: Record<string, unknown> = {};

  const quotaTotalLimit = parseOptionalNumber(form.quotaTotalLimit);
  const quotaDailyLimit = parseOptionalNumber(form.quotaDailyLimit);
  const quotaWeeklyLimit = parseOptionalNumber(form.quotaWeeklyLimit);
  if (quotaTotalLimit && quotaTotalLimit > 0) {
    extra.quota_limit = quotaTotalLimit;
  }
  if (quotaDailyLimit && quotaDailyLimit > 0) {
    extra.quota_daily_limit = quotaDailyLimit;
  }
  if (quotaWeeklyLimit && quotaWeeklyLimit > 0) {
    extra.quota_weekly_limit = quotaWeeklyLimit;
  }
  return extra;
}

function buildOpenAIAPIKeyExtra(form: AccountWizardForm) {
  const extra = buildQuotaExtra(form);
  if (form.openaiPassthroughEnabled) {
    extra.openai_passthrough = true;
  }
  extra.openai_apikey_responses_websockets_v2_mode = form.openaiResponsesWebSocketMode;
  extra.openai_apikey_responses_websockets_v2_enabled = form.openaiResponsesWebSocketMode !== 'off';
  return Object.keys(extra).length > 0 ? extra : undefined;
}

function buildOpenAIOAuthExtra(form: AccountWizardForm) {
  const extra: Record<string, unknown> = {};
  if (form.openaiPassthroughEnabled) {
    extra.openai_passthrough = true;
  }
  extra.openai_oauth_responses_websockets_v2_mode = form.openaiResponsesWebSocketMode;
  extra.openai_oauth_responses_websockets_v2_enabled = form.openaiResponsesWebSocketMode !== 'off';
  if (form.openaiCodexCliOnly) {
    extra.codex_cli_only = true;
  }
  return Object.keys(extra).length > 0 ? extra : undefined;
}

function buildOpenAIOAuthCredentials(tokenInfo: Record<string, unknown>) {
  const credentials: Record<string, unknown> = {};
  const accessToken = typeof tokenInfo.access_token === 'string' ? tokenInfo.access_token.trim() : '';
  const refreshToken = typeof tokenInfo.refresh_token === 'string' ? tokenInfo.refresh_token.trim() : '';
  const idToken = typeof tokenInfo.id_token === 'string' ? tokenInfo.id_token.trim() : '';
  const email = typeof tokenInfo.email === 'string' ? tokenInfo.email.trim() : '';
  const chatGPTAccountID = typeof tokenInfo.chatgpt_account_id === 'string' ? tokenInfo.chatgpt_account_id.trim() : '';
  const chatGPTUserID = typeof tokenInfo.chatgpt_user_id === 'string' ? tokenInfo.chatgpt_user_id.trim() : '';
  const organizationID = typeof tokenInfo.organization_id === 'string' ? tokenInfo.organization_id.trim() : '';
  const planType = typeof tokenInfo.plan_type === 'string' ? tokenInfo.plan_type.trim() : '';
  const subscriptionExpiresAt =
    typeof tokenInfo.subscription_expires_at === 'string' ? tokenInfo.subscription_expires_at.trim() : '';
  const clientID = typeof tokenInfo.client_id === 'string' ? tokenInfo.client_id.trim() : '';
  const expiresAtValue = Number(tokenInfo.expires_at);

  if (accessToken) {
    credentials.access_token = accessToken;
  }
  if (Number.isFinite(expiresAtValue) && expiresAtValue > 0) {
    credentials.expires_at = new Date(expiresAtValue * 1000).toISOString();
  }
  if (refreshToken) {
    credentials.refresh_token = refreshToken;
  }
  if (idToken) {
    credentials.id_token = idToken;
  }
  if (email) {
    credentials.email = email;
  }
  if (chatGPTAccountID) {
    credentials.chatgpt_account_id = chatGPTAccountID;
  }
  if (chatGPTUserID) {
    credentials.chatgpt_user_id = chatGPTUserID;
  }
  if (organizationID) {
    credentials.organization_id = organizationID;
  }
  if (planType) {
    credentials.plan_type = planType;
  }
  if (subscriptionExpiresAt) {
    credentials.subscription_expires_at = subscriptionExpiresAt;
  }
  if (clientID) {
    credentials.client_id = clientID;
  }

  return credentials;
}

function buildGeminiOAuthCredentials(tokenInfo: Record<string, unknown>) {
  const credentials: Record<string, unknown> = {};
  const accessToken = typeof tokenInfo.access_token === 'string' ? tokenInfo.access_token.trim() : '';
  const refreshToken = typeof tokenInfo.refresh_token === 'string' ? tokenInfo.refresh_token.trim() : '';
  const tokenType = typeof tokenInfo.token_type === 'string' ? tokenInfo.token_type.trim() : '';
  const scope = typeof tokenInfo.scope === 'string' ? tokenInfo.scope.trim() : '';
  const projectID = typeof tokenInfo.project_id === 'string' ? tokenInfo.project_id.trim() : '';
  const oauthType = typeof tokenInfo.oauth_type === 'string' ? tokenInfo.oauth_type.trim() : '';
  const tierID = typeof tokenInfo.tier_id === 'string' ? tokenInfo.tier_id.trim() : '';
  const expiresAtValue = tokenInfo.expires_at;

  if (accessToken) {
    credentials.access_token = accessToken;
  }
  if (refreshToken) {
    credentials.refresh_token = refreshToken;
  }
  if (tokenType) {
    credentials.token_type = tokenType;
  }
  if (scope) {
    credentials.scope = scope;
  }
  if (projectID) {
    credentials.project_id = projectID;
  }
  if (oauthType) {
    credentials.oauth_type = oauthType;
  }
  if (tierID) {
    credentials.tier_id = tierID;
  }
  if (typeof expiresAtValue === 'number' && Number.isFinite(expiresAtValue)) {
    credentials.expires_at = Math.floor(expiresAtValue).toString();
  } else if (typeof expiresAtValue === 'string' && expiresAtValue.trim()) {
    credentials.expires_at = expiresAtValue.trim();
  }

  return credentials;
}

function buildGeminiOAuthExtra(tokenInfo: Record<string, unknown>) {
  const extra = tokenInfo.extra;
  return extra && typeof extra === 'object' && !Array.isArray(extra) ? (extra as Record<string, unknown>) : undefined;
}

function buildAntigravityOAuthCredentials(tokenInfo: Record<string, unknown>) {
  const credentials: Record<string, unknown> = {};
  const accessToken = typeof tokenInfo.access_token === 'string' ? tokenInfo.access_token.trim() : '';
  const refreshToken = typeof tokenInfo.refresh_token === 'string' ? tokenInfo.refresh_token.trim() : '';
  const tokenType = typeof tokenInfo.token_type === 'string' ? tokenInfo.token_type.trim() : '';
  const projectID = typeof tokenInfo.project_id === 'string' ? tokenInfo.project_id.trim() : '';
  const email = typeof tokenInfo.email === 'string' ? tokenInfo.email.trim() : '';
  const expiresAtValue = tokenInfo.expires_at;

  if (accessToken) {
    credentials.access_token = accessToken;
  }
  if (refreshToken) {
    credentials.refresh_token = refreshToken;
  }
  if (tokenType) {
    credentials.token_type = tokenType;
  }
  if (projectID) {
    credentials.project_id = projectID;
  }
  if (email) {
    credentials.email = email;
  }
  if (typeof expiresAtValue === 'number' && Number.isFinite(expiresAtValue)) {
    credentials.expires_at = Math.floor(expiresAtValue).toString();
  } else if (typeof expiresAtValue === 'string' && expiresAtValue.trim()) {
    credentials.expires_at = expiresAtValue.trim();
  }

  return credentials;
}

function buildAntigravityExtra(form: AccountWizardForm) {
  const extra: Record<string, unknown> = {};
  if (form.antigravityMixedScheduling) {
    extra.mixed_scheduling = true;
  }
  if (form.antigravityAllowOverages) {
    extra.allow_overages = true;
  }
  return Object.keys(extra).length > 0 ? extra : undefined;
}

function parseMultilineTokens(input: string) {
  return input
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractStateFromAuthUrl(url: string) {
  if (!url) {
    return '';
  }
  try {
    return new URL(url).searchParams.get('state') || '';
  } catch {
    return '';
  }
}

function createEmptyModelMapping(): ModelMappingForm {
  return {
    from: '',
    to: '',
  };
}

function normalizePoolModeRetryCount(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_POOL_MODE_RETRY_COUNT;
  }
  const normalized = Math.trunc(parsed);
  if (normalized < 0) {
    return 0;
  }
  if (normalized > MAX_POOL_MODE_RETRY_COUNT) {
    return MAX_POOL_MODE_RETRY_COUNT;
  }
  return normalized;
}

function buildModelMappingObject(
  mode: 'whitelist' | 'mapping',
  allowedModels: string[],
  modelMappings: ModelMappingForm[]
) {
  const mapping: Record<string, string> = {};

  if (mode === 'whitelist') {
    for (const model of allowedModels) {
      const trimmed = model.trim();
      if (trimmed && !trimmed.includes('*')) {
        mapping[trimmed] = trimmed;
      }
    }
  } else {
    for (const item of modelMappings) {
      const from = item.from.trim();
      const to = item.to.trim();
      if (!from || !to || to.includes('*')) {
        continue;
      }
      mapping[from] = to;
    }
  }

  return Object.keys(mapping).length > 0 ? mapping : undefined;
}

function createEmptyTempUnschedRule(): TempUnschedRuleForm {
  return {
    error_code: '',
    keywords: '',
    duration_minutes: '30',
    description: '',
  };
}

function splitTempUnschedKeywords(value: string) {
  return value
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildTempUnschedRules(rules: TempUnschedRuleForm[]) {
  const out: Array<{
    error_code: number;
    keywords: string[];
    duration_minutes: number;
    description: string;
  }> = [];

  for (const rule of rules) {
    const errorCode = Number(rule.error_code);
    const duration = Number(rule.duration_minutes);
    const keywords = splitTempUnschedKeywords(rule.keywords);
    if (!Number.isFinite(errorCode) || errorCode < 100 || errorCode > 599) {
      return null;
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      return null;
    }
    if (keywords.length === 0) {
      return null;
    }
    out.push({
      error_code: Math.trunc(errorCode),
      keywords,
      duration_minutes: Math.trunc(duration),
      description: rule.description.trim(),
    });
  }

  return out;
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
      <div className="max-h-[94vh] w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-[#111111]">
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
        <div className="max-h-[calc(94vh-92px)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">{children}</label>;
}

function getPlatformTypeOptions(platform: AccountPlatform) {
  switch (platform) {
    case 'anthropic':
      return [
        { key: 'claude_code', title: 'Claude Code', subtitle: 'OAuth / Setup Token' },
        { key: 'claude_console', title: 'Claude Console', subtitle: 'API Key' },
        { key: 'bedrock', title: 'AWS Bedrock', subtitle: 'SigV4 / API Key' },
      ] as const;
    case 'openai':
      return [
        { key: 'openai_oauth', title: 'OpenAI OAuth', subtitle: 'OAuth' },
        { key: 'openai_apikey', title: 'OpenAI API Key', subtitle: 'API Key' },
      ] as const;
    case 'gemini':
      return [
        { key: 'gemini_oauth', title: 'Gemini OAuth', subtitle: 'Google One / Code Assist' },
        { key: 'gemini_apikey', title: 'Gemini API Key', subtitle: 'AI Studio API Key' },
      ] as const;
    case 'antigravity':
      return [
        { key: 'antigravity_oauth', title: 'Antigravity OAuth', subtitle: 'OAuth' },
        { key: 'antigravity_upstream', title: 'API Key', subtitle: '通过 Base URL + API Key 连接' },
      ] as const;
  }
}

function getAuthOptions(type: StepOneType) {
  switch (type) {
    case 'claude_code':
      return [
        { key: 'oauth', label: 'OAuth' },
        { key: 'setup-token', label: 'Setup Token（长期有效）' },
      ] as const;
    case 'claude_console':
      return [{ key: 'apikey', label: 'API Key' }] as const;
    case 'bedrock':
      return [
        { key: 'sigv4', label: 'SigV4' },
        { key: 'apikey', label: 'API Key' },
      ] as const;
    case 'openai_oauth':
      return [{ key: 'oauth', label: 'OAuth' }] as const;
    case 'openai_apikey':
      return [{ key: 'apikey', label: 'API Key' }] as const;
    case 'gemini_oauth':
      return [{ key: 'oauth', label: 'OAuth' }] as const;
    case 'gemini_apikey':
      return [{ key: 'apikey', label: 'API Key' }] as const;
    case 'antigravity_oauth':
      return [{ key: 'oauth', label: 'OAuth' }] as const;
    case 'antigravity_upstream':
      return [{ key: 'upstream', label: 'Upstream 中继' }] as const;
  }
}

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<AccountFilters>({
    platform: '',
    type: '',
    status: '',
    privacy_mode: '',
    group: '',
  });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
  });

  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardForm, setWizardForm] = useState<AccountWizardForm>(DEFAULT_WIZARD_FORM);
  const [wizardAuth, setWizardAuth] = useState<WizardAuthState>(DEFAULT_WIZARD_AUTH_STATE);
  const [proxies, setProxies] = useState<AdminProxy[]>([]);
  const [tlsFingerprintProfiles, setTLSFingerprintProfiles] = useState<AdminTLSFingerprintProfile[]>([]);
  const [geminiCapabilities, setGeminiCapabilities] = useState<GeminiOAuthCapabilities | null>(null);
  const [antigravityDefaultMappings, setAntigravityDefaultMappings] = useState<ModelMappingForm[]>([]);
  const [antigravityDefaultsFetched, setAntigravityDefaultsFetched] = useState(false);
  const [antigravityDefaultsLoading, setAntigravityDefaultsLoading] = useState(false);
  const [claudeModelPickerOpen, setClaudeModelPickerOpen] = useState(false);
  const [claudeModelSearch, setClaudeModelSearch] = useState('');
  const [openAIModelPickerOpen, setOpenAIModelPickerOpen] = useState(false);
  const [openAIModelSearch, setOpenAIModelSearch] = useState('');
  const [openAISelectedModelsExpanded, setOpenAISelectedModelsExpanded] = useState(true);
  const [geminiModelPickerOpen, setGeminiModelPickerOpen] = useState(false);
  const [geminiModelSearch, setGeminiModelSearch] = useState('');
  const [geminiSelectedModelsExpanded, setGeminiSelectedModelsExpanded] = useState(true);

  const loadAccounts = useCallback(
    async (page = 1, keyword = search, nextFilters = filters) => {
      setLoading(true);
      setError('');
      try {
        const [accountResult, groupResult] = await Promise.all([
          listAdminAccounts({
            page,
            page_size: PAGE_SIZE,
            search: keyword || undefined,
            platform: nextFilters.platform || undefined,
            type: nextFilters.type || undefined,
            status: nextFilters.status || undefined,
            privacy_mode: nextFilters.privacy_mode || undefined,
            group: nextFilters.group || undefined,
            sort_by: 'created_at',
            sort_order: 'desc',
          }),
          groups.length > 0 ? Promise.resolve({ items: groups, total: groups.length, page: 1, pageSize: groups.length }) : listAdminGroups({ page: 1, page_size: 200 }),
        ]);

        setAccounts(accountResult.items);
        setGroups(groupResult.items);
        setPagination({
          page: accountResult.page || page,
          pageSize: accountResult.pageSize || PAGE_SIZE,
          total: accountResult.total,
        });
      } catch (loadError: unknown) {
        setError(getErrorMessage(loadError, '加载账号失败'));
      } finally {
        setLoading(false);
      }
    },
    [filters, groups, search]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAccounts(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAccounts]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void loadAccounts(pagination.page);
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loadAccounts, pagination.page]);

  useEffect(() => {
    if (!showWizard || wizardForm.platform !== 'gemini' || wizardForm.accountType !== 'gemini_oauth' || geminiCapabilities) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const caps = await getGeminiOAuthCapabilities();
      if (cancelled) {
        return;
      }
      setGeminiCapabilities(caps);
      if (!caps?.ai_studio_oauth_enabled) {
        setWizardForm((prev) =>
          prev.geminiOAuthType === 'ai_studio'
            ? {
                ...prev,
                geminiOAuthType: 'google_one',
              }
            : prev
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [geminiCapabilities, showWizard, wizardForm.accountType, wizardForm.platform]);

  useEffect(() => {
    if (
      !showWizard ||
      wizardForm.platform !== 'antigravity' ||
      antigravityDefaultsFetched ||
      antigravityDefaultsLoading
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      setAntigravityDefaultsLoading(true);
      try {
        const mapping = await getAdminAntigravityDefaultModelMapping();
        if (cancelled) {
          return;
        }
        const defaults = Object.entries(mapping).map(([from, to]) => ({
          from,
          to: String(to),
        }));
        setAntigravityDefaultMappings(defaults);
        setAntigravityDefaultsFetched(true);
        setWizardForm((prev) =>
          prev.platform === 'antigravity' && prev.modelMappings.length === 0
            ? {
                ...prev,
                modelRestrictionMode: 'mapping',
                allowedModels: [],
                modelMappings: defaults,
              }
            : prev
        );
      } catch {
        if (cancelled) {
          return;
        }
        setAntigravityDefaultMappings([]);
        setAntigravityDefaultsFetched(true);
      } finally {
        if (!cancelled) {
          setAntigravityDefaultsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    antigravityDefaultsFetched,
    antigravityDefaultsLoading,
    showWizard,
    wizardForm.platform,
  ]);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.pageSize || PAGE_SIZE)));
  const currentTypeOptions = getPlatformTypeOptions(wizardForm.platform);
  const currentAuthOptions = getAuthOptions(wizardForm.accountType);
  const isClaudeCodeWizard = wizardForm.platform === 'anthropic' && wizardForm.accountType === 'claude_code';
  const isClaudeConsoleWizard = wizardForm.platform === 'anthropic' && wizardForm.accountType === 'claude_console';
  const isBedrockWizard = wizardForm.platform === 'anthropic' && wizardForm.accountType === 'bedrock';
  const isOpenAIOAuthWizard = wizardForm.platform === 'openai' && wizardForm.accountType === 'openai_oauth';
  const isOpenAIApiKeyWizard = wizardForm.platform === 'openai' && wizardForm.accountType === 'openai_apikey';
  const isGeminiOAuthWizard = wizardForm.platform === 'gemini' && wizardForm.accountType === 'gemini_oauth';
  const isGeminiAPIKeyWizard = wizardForm.platform === 'gemini' && wizardForm.accountType === 'gemini_apikey';
  const isAntigravityOAuthWizard =
    wizardForm.platform === 'antigravity' && wizardForm.accountType === 'antigravity_oauth';
  const isAntigravityUpstreamWizard =
    wizardForm.platform === 'antigravity' && wizardForm.accountType === 'antigravity_upstream';
  const sortedSelectedErrorCodes = useMemo(
    () => [...wizardForm.selectedErrorCodes].sort((a, b) => a - b),
    [wizardForm.selectedErrorCodes]
  );
  const filteredClaudeModels = useMemo(() => {
    const keyword = claudeModelSearch.trim().toLowerCase();
    if (!keyword) {
      return [...CLAUDE_MODELS];
    }
    return CLAUDE_MODELS.filter((model) => model.toLowerCase().includes(keyword));
  }, [claudeModelSearch]);
  const filteredOpenAIModels = useMemo(() => {
    const keyword = openAIModelSearch.trim().toLowerCase();
    if (!keyword) {
      return [...OPENAI_MODELS];
    }
    return OPENAI_MODELS.filter((model) => model.toLowerCase().includes(keyword));
  }, [openAIModelSearch]);

  const currentPlatformGroups = useMemo(
    () => groups.filter((group) => group.platform === wizardForm.platform),
    [groups, wizardForm.platform]
  );

  const geminiSelectedTier = useMemo(() => {
    switch (wizardForm.geminiOAuthType) {
      case 'google_one':
        return wizardForm.geminiTierGoogleOne;
      case 'code_assist':
        return wizardForm.geminiTierGcp;
      case 'ai_studio':
        return wizardForm.geminiTierAIStudio;
      default:
        return wizardForm.geminiTierGoogleOne;
    }
  }, [wizardForm.geminiOAuthType, wizardForm.geminiTierAIStudio, wizardForm.geminiTierGcp, wizardForm.geminiTierGoogleOne]);
  const filteredGeminiModels = useMemo(() => {
    const keyword = geminiModelSearch.trim().toLowerCase();
    if (!keyword) {
      return GEMINI_MODELS;
    }
    return GEMINI_MODELS.filter((model) => model.toLowerCase().includes(keyword));
  }, [geminiModelSearch]);

  const openWizard = async () => {
    setWizardForm({
      ...DEFAULT_WIZARD_FORM,
      allowedModels: [...CLAUDE_MODELS],
    });
    setWizardAuth(DEFAULT_WIZARD_AUTH_STATE);
    setWizardStep(1);
    setShowWizard(true);
    setClaudeModelPickerOpen(false);
    setClaudeModelSearch('');
    setOpenAIModelPickerOpen(false);
    setOpenAIModelSearch('');
    setOpenAISelectedModelsExpanded(true);
    setGeminiModelPickerOpen(false);
    setGeminiModelSearch('');
    setGeminiSelectedModelsExpanded(true);
    setGeminiCapabilities(null);
    if (groups.length === 0 || tlsFingerprintProfiles.length === 0 || proxies.length === 0) {
      try {
        const [groupResult, tlsProfileResult, proxyResult] = await Promise.all([
          groups.length === 0 ? listAdminGroups({ page: 1, page_size: 200 }) : Promise.resolve(null),
          tlsFingerprintProfiles.length === 0 ? listAdminTLSFingerprintProfiles() : Promise.resolve(null),
          proxies.length === 0 ? listAdminProxies({ with_count: 'true' }) : Promise.resolve(null),
        ]);
        if (groupResult) {
          setGroups(groupResult.items);
        }
        if (tlsProfileResult) {
          setTLSFingerprintProfiles(tlsProfileResult);
        }
        if (proxyResult) {
          setProxies(proxyResult);
        }
      } catch {
        // ignore
      }
    }
  };

  const handleSelectPlatform = (platform: AccountPlatform) => {
    const nextType = getPlatformTypeOptions(platform)[0];
    const nextAuth = getAuthOptions(nextType.key)[0];
    setWizardAuth(DEFAULT_WIZARD_AUTH_STATE);
    setClaudeModelPickerOpen(false);
    setClaudeModelSearch('');
    setOpenAIModelPickerOpen(false);
    setOpenAIModelSearch('');
    setOpenAISelectedModelsExpanded(true);
    setGeminiModelPickerOpen(false);
    setGeminiModelSearch('');
    setGeminiSelectedModelsExpanded(true);
    if (platform !== 'gemini') {
      setGeminiCapabilities(null);
    }
    setWizardForm((prev) => ({
      ...prev,
      platform,
      accountType: nextType.key,
      authMethod: nextAuth.key,
      groupIds: [],
      apiKeyBaseUrl:
        platform === 'openai'
          ? 'https://api.openai.com'
          : platform === 'gemini'
            ? 'https://generativelanguage.googleapis.com'
            : platform === 'antigravity'
              ? ANTIGRAVITY_DEFAULT_BASE_URL
            : 'https://api.anthropic.com',
      modelRestrictionMode: platform === 'antigravity' ? 'mapping' : 'whitelist',
      allowedModels:
        platform === 'anthropic'
          ? [...CLAUDE_MODELS]
          : platform === 'openai'
            ? [...OPENAI_MODELS]
            : platform === 'gemini'
              ? [...GEMINI_MODELS]
              : platform === 'antigravity'
                ? []
              : [],
      modelMappings:
        platform === 'antigravity' ? antigravityDefaultMappings.map((item) => ({ ...item })) : [],
      poolModeEnabled: false,
      poolModeRetryCount: String(DEFAULT_POOL_MODE_RETRY_COUNT),
      customErrorCodesEnabled: false,
      selectedErrorCodes: [],
      customErrorCodeInput: '',
      bedrockAccessKeyId: '',
      bedrockSecretAccessKey: '',
      bedrockSessionToken: '',
      bedrockRegion: 'us-east-1',
      bedrockForceGlobal: false,
      bedrockApiKeyValue: '',
      openaiPassthroughEnabled: false,
      openaiResponsesWebSocketMode: 'off',
      openaiCodexCliOnly: false,
      openaiCustomModelName: '',
      geminiCustomModelName: '',
      geminiOAuthType: 'google_one',
      geminiShowAdvancedOAuth: false,
      geminiTierGoogleOne: 'google_one_free',
      geminiTierGcp: 'gcp_standard',
      geminiTierAIStudio: 'aistudio_free',
      antigravityMixedScheduling: false,
      antigravityAllowOverages: false,
    }));
  };

  const handleSelectAccountType = (accountType: StepOneType) => {
    const nextAuth = getAuthOptions(accountType)[0];
    setWizardAuth(DEFAULT_WIZARD_AUTH_STATE);
    setClaudeModelPickerOpen(false);
    setClaudeModelSearch('');
    setOpenAIModelPickerOpen(false);
    setOpenAIModelSearch('');
    setOpenAISelectedModelsExpanded(true);
    setGeminiModelPickerOpen(false);
    setGeminiModelSearch('');
    setGeminiSelectedModelsExpanded(true);
    if (accountType !== 'gemini_oauth' && accountType !== 'gemini_apikey') {
      setGeminiCapabilities(null);
    }
    setWizardForm((prev) => ({
      ...prev,
      accountType,
      authMethod: nextAuth.key,
      apiKeyBaseUrl:
        prev.platform === 'openai'
          ? 'https://api.openai.com'
          : prev.platform === 'gemini'
            ? 'https://generativelanguage.googleapis.com'
            : prev.platform === 'antigravity'
              ? ANTIGRAVITY_DEFAULT_BASE_URL
            : 'https://api.anthropic.com',
      modelRestrictionMode: prev.platform === 'antigravity' ? 'mapping' : 'whitelist',
      allowedModels:
        prev.platform === 'anthropic'
          ? [...CLAUDE_MODELS]
          : accountType === 'openai_apikey'
            ? [...OPENAI_MODELS]
            : accountType === 'gemini_apikey'
              ? [...GEMINI_MODELS]
              : prev.platform === 'antigravity'
                ? []
              : [],
      modelMappings:
        prev.platform === 'antigravity' ? antigravityDefaultMappings.map((item) => ({ ...item })) : [],
      poolModeEnabled: false,
      poolModeRetryCount: String(DEFAULT_POOL_MODE_RETRY_COUNT),
      customErrorCodesEnabled: false,
      selectedErrorCodes: [],
      customErrorCodeInput: '',
      bedrockAccessKeyId: '',
      bedrockSecretAccessKey: '',
      bedrockSessionToken: '',
      bedrockRegion: 'us-east-1',
      bedrockForceGlobal: false,
      bedrockApiKeyValue: '',
      openaiPassthroughEnabled: false,
      openaiResponsesWebSocketMode: 'off',
      openaiCodexCliOnly: false,
      openaiCustomModelName: '',
      geminiCustomModelName: '',
      geminiOAuthType: 'google_one',
      geminiShowAdvancedOAuth: false,
      geminiTierGoogleOne: 'google_one_free',
      geminiTierGcp: 'gcp_standard',
      geminiTierAIStudio: 'aistudio_free',
      antigravityMixedScheduling: false,
      antigravityAllowOverages: false,
    }));
  };

  const handleApplyAntigravityDefaultMappings = useCallback(() => {
    setWizardForm((prev) => ({
      ...prev,
      modelRestrictionMode: 'mapping',
      allowedModels: [],
      modelMappings: antigravityDefaultMappings.map((item) => ({ ...item })),
    }));
  }, [antigravityDefaultMappings]);

  const handleToggleGroup = (groupId: number) => {
    setWizardForm((prev) => ({
      ...prev,
      groupIds: prev.groupIds.includes(groupId)
        ? prev.groupIds.filter((id) => id !== groupId)
        : [...prev.groupIds, groupId],
    }));
  };

  const handleAddTempUnschedRule = (preset?: TempUnschedRuleForm) => {
    setWizardForm((prev) => ({
      ...prev,
      tempUnschedRules: [...prev.tempUnschedRules, preset ? { ...preset } : createEmptyTempUnschedRule()],
    }));
  };

  const handleRemoveTempUnschedRule = (index: number) => {
    setWizardForm((prev) => ({
      ...prev,
      tempUnschedRules: prev.tempUnschedRules.filter((_, ruleIndex) => ruleIndex !== index),
    }));
  };

  const handleMoveTempUnschedRule = (index: number, direction: -1 | 1) => {
    setWizardForm((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.tempUnschedRules.length) {
        return prev;
      }
      const nextRules = [...prev.tempUnschedRules];
      [nextRules[index], nextRules[target]] = [nextRules[target], nextRules[index]];
      return {
        ...prev,
        tempUnschedRules: nextRules,
      };
    });
  };

  const handleChangeTempUnschedRule = (index: number, key: keyof TempUnschedRuleForm, value: string) => {
    setWizardForm((prev) => ({
      ...prev,
      tempUnschedRules: prev.tempUnschedRules.map((rule, ruleIndex) =>
        ruleIndex === index
          ? {
              ...rule,
              [key]: value,
            }
          : rule
      ),
    }));
  };

  const handleToggleAllowedModel = (model: string) => {
    setWizardForm((prev) => ({
      ...prev,
      allowedModels: prev.allowedModels.includes(model)
        ? prev.allowedModels.filter((item) => item !== model)
        : [...prev.allowedModels, model],
    }));
  };

  const handleSelectAllAllowedModels = () => {
    setWizardForm((prev) => ({
      ...prev,
      allowedModels: [...CLAUDE_MODELS],
    }));
  };

  const handleClearAllowedModels = () => {
    setWizardForm((prev) => ({
      ...prev,
      allowedModels: [],
    }));
  };

  const handleToggleOpenAIAllowedModel = (model: string) => {
    setWizardForm((prev) => ({
      ...prev,
      allowedModels: prev.allowedModels.includes(model)
        ? prev.allowedModels.filter((item) => item !== model)
        : [...prev.allowedModels, model],
    }));
  };

  const handleSelectAllOpenAIModels = () => {
    setWizardForm((prev) => ({
      ...prev,
      allowedModels: [...OPENAI_MODELS],
    }));
  };

  const handleAddOpenAICustomModel = () => {
    const model = wizardForm.openaiCustomModelName.trim();
    if (!model) {
      return;
    }
    setWizardForm((prev) => ({
      ...prev,
      allowedModels: prev.allowedModels.includes(model) ? prev.allowedModels : [...prev.allowedModels, model],
      openaiCustomModelName: '',
    }));
  };

  const handleAddGeminiCustomModel = () => {
    const model = wizardForm.geminiCustomModelName.trim();
    if (!model) {
      return;
    }
    setWizardForm((prev) => ({
      ...prev,
      allowedModels: prev.allowedModels.includes(model) ? prev.allowedModels : [...prev.allowedModels, model],
      geminiCustomModelName: '',
    }));
  };

  const handleAddModelMapping = (preset?: ModelMappingForm) => {
    setWizardForm((prev) => ({
      ...prev,
      modelMappings: [...prev.modelMappings, preset ? { ...preset } : createEmptyModelMapping()],
    }));
  };

  const handleChangeModelMapping = (index: number, key: keyof ModelMappingForm, value: string) => {
    setWizardForm((prev) => ({
      ...prev,
      modelMappings: prev.modelMappings.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [key]: value,
            }
          : item
      ),
    }));
  };

  const handleRemoveModelMapping = (index: number) => {
    setWizardForm((prev) => ({
      ...prev,
      modelMappings: prev.modelMappings.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handleToggleErrorCode = (code: number) => {
    setWizardForm((prev) => ({
      ...prev,
      selectedErrorCodes: prev.selectedErrorCodes.includes(code)
        ? prev.selectedErrorCodes.filter((item) => item !== code)
        : [...prev.selectedErrorCodes, code],
    }));
  };

  const handleAddCustomErrorCode = () => {
    const parsed = Number(wizardForm.customErrorCodeInput.trim());
    if (!Number.isFinite(parsed) || parsed < 100 || parsed > 599) {
      setError('请输入 100-599 之间的错误码');
      return;
    }
    const code = Math.trunc(parsed);
    setError('');
    setWizardForm((prev) => ({
      ...prev,
      selectedErrorCodes: prev.selectedErrorCodes.includes(code) ? prev.selectedErrorCodes : [...prev.selectedErrorCodes, code],
      customErrorCodeInput: '',
    }));
  };

  const handleRemoveErrorCode = (code: number) => {
    setWizardForm((prev) => ({
      ...prev,
      selectedErrorCodes: prev.selectedErrorCodes.filter((item) => item !== code),
    }));
  };

  const handleOpenClaudeAuthUrl = useCallback(async () => {
    try {
      setWizardAuth((prev) => ({ ...prev, generating: true }));
      const proxyId = parseOptionalInteger(wizardForm.proxyId);
      const endpoint =
        wizardForm.authMethod === 'setup-token'
          ? '/admin/accounts/generate-setup-token-url'
          : '/admin/accounts/generate-auth-url';
      const result = await generateAdminAccountAuthUrl(endpoint, proxyId ? { proxy_id: proxyId } : {});
      setWizardAuth((prev) => ({
        ...prev,
        url: result.auth_url,
        sessionId: result.session_id,
        mode: 'code',
      }));
      setSuccess(wizardForm.authMethod === 'setup-token' ? 'Setup Token 授权链接已生成' : 'OAuth 授权链接已生成');
      setError('');
    } catch (authError: unknown) {
      setError(getErrorMessage(authError, '生成授权链接失败'));
    } finally {
      setWizardAuth((prev) => ({ ...prev, generating: false }));
    }
  }, [wizardForm.authMethod, wizardForm.proxyId]);

  const handleOpenOpenAIAuthUrl = useCallback(async () => {
    try {
      setWizardAuth((prev) => ({ ...prev, generating: true }));
      const proxyId = parseOptionalInteger(wizardForm.proxyId);
      const result = await generateAdminAccountAuthUrl('/admin/openai/generate-auth-url', {
        proxy_id: proxyId ?? undefined,
      });

      setWizardAuth((prev) => ({
        ...prev,
        url: result.auth_url,
        sessionId: result.session_id,
        state: extractStateFromAuthUrl(result.auth_url),
      }));
      setSuccess('OpenAI OAuth 授权链接已生成');
      setError('');
    } catch (authError: unknown) {
      setError(getErrorMessage(authError, '生成 OpenAI OAuth 授权链接失败'));
      setSuccess('');
    } finally {
      setWizardAuth((prev) => ({ ...prev, generating: false }));
    }
  }, [wizardForm.proxyId]);

  const handleOpenGeminiAuthUrl = useCallback(async () => {
    if (wizardForm.geminiOAuthType === 'ai_studio' && !geminiCapabilities?.ai_studio_oauth_enabled) {
      setError('AI Studio OAuth 尚未配置，请先完成管理员预设 OAuth Client');
      return;
    }
    try {
      setWizardAuth((prev) => ({ ...prev, generating: true }));
      const proxyId = parseOptionalInteger(wizardForm.proxyId);
      const result = await generateAdminAccountAuthUrl('/admin/gemini/oauth/auth-url', {
        proxy_id: proxyId ?? undefined,
        oauth_type: wizardForm.geminiOAuthType,
        tier_id: geminiSelectedTier,
      });

      setWizardAuth((prev) => ({
        ...prev,
        url: result.auth_url,
        sessionId: result.session_id,
        state: result.state || extractStateFromAuthUrl(result.auth_url),
      }));
      setSuccess('Gemini OAuth 授权链接已生成');
      setError('');
    } catch (authError: unknown) {
      setError(getErrorMessage(authError, '生成 Gemini OAuth 授权链接失败'));
      setSuccess('');
    } finally {
      setWizardAuth((prev) => ({ ...prev, generating: false }));
    }
  }, [geminiCapabilities?.ai_studio_oauth_enabled, geminiSelectedTier, wizardForm.geminiOAuthType, wizardForm.proxyId]);

  const handleOpenAntigravityAuthUrl = useCallback(async () => {
    try {
      setWizardAuth((prev) => ({ ...prev, generating: true }));
      const proxyId = parseOptionalInteger(wizardForm.proxyId);
      const result = await generateAdminAccountAuthUrl('/admin/antigravity/oauth/auth-url', {
        proxy_id: proxyId ?? undefined,
      });

      setWizardAuth((prev) => ({
        ...prev,
        url: result.auth_url,
        sessionId: result.session_id,
        state: result.state || extractStateFromAuthUrl(result.auth_url),
      }));
      setSuccess('Antigravity OAuth 授权链接已生成');
      setError('');
    } catch (authError: unknown) {
      setError(getErrorMessage(authError, '生成 Antigravity OAuth 授权链接失败'));
      setSuccess('');
    } finally {
      setWizardAuth((prev) => ({ ...prev, generating: false }));
    }
  }, [wizardForm.proxyId]);

  const handleCopyAuthUrl = useCallback(async () => {
    if (!wizardAuth.url) return;
    try {
      await navigator.clipboard.writeText(wizardAuth.url);
      setSuccess('授权链接已复制');
      setError('');
    } catch {
      setError('复制授权链接失败，请手动复制');
    }
  }, [wizardAuth.url]);

  const handleCreateClaudeCodeAccount = useCallback(async () => {
    if (!wizardForm.name.trim()) {
      setError('请输入账号名称');
      return;
    }

    if (wizardAuth.mode === 'code' && !wizardAuth.sessionId.trim()) {
      setError('请先生成授权链接');
      return;
    }

    const rawCodeInput = wizardAuth.mode === 'code' ? wizardAuth.codeInput : wizardAuth.sessionKeyInput;
    const code = extractOAuthCode(rawCodeInput);
    if (!code) {
      setError(wizardAuth.mode === 'code' ? '请输入授权码' : '请输入 Session Key');
      return;
    }

    try {
      setWizardAuth((prev) => ({ ...prev, submitting: true }));
      setError('');
      setSuccess('');

      const proxyId = parseOptionalInteger(wizardForm.proxyId);
      const exchangeEndpoint =
        wizardAuth.mode === 'cookie'
          ? wizardForm.authMethod === 'setup-token'
            ? '/admin/accounts/setup-token-cookie-auth'
            : '/admin/accounts/cookie-auth'
          : wizardForm.authMethod === 'setup-token'
            ? '/admin/accounts/exchange-setup-token-code'
            : '/admin/accounts/exchange-code';

      const tokenInfo = await exchangeAdminAccountCode(exchangeEndpoint, {
        session_id: wizardAuth.mode === 'cookie' ? '' : wizardAuth.sessionId.trim(),
        code,
        ...(proxyId ? { proxy_id: proxyId } : {}),
      });

      const credentials: Record<string, unknown> = { ...tokenInfo };
      if (wizardForm.tempUnschedulable) {
        const tempUnschedRules = buildTempUnschedRules(wizardForm.tempUnschedRules);
        if (!tempUnschedRules || tempUnschedRules.length === 0) {
          setError('请至少配置一条有效的临时不可调度规则');
          return;
        }
        credentials.temp_unschedulable_enabled = true;
        credentials.temp_unschedulable_rules = tempUnschedRules;
      }
      if (wizardForm.interceptWarmupRequests) {
        credentials.intercept_warmup_requests = true;
      }

      await createAdminAccount({
        name: wizardForm.name.trim(),
        notes: wizardForm.notes.trim() || undefined,
        platform: 'anthropic',
        type: wizardForm.authMethod,
        credentials,
        extra: buildClaudeCodeExtra(wizardForm, tokenInfo),
        proxy_id: proxyId ?? null,
        concurrency: parseOptionalInteger(wizardForm.concurrency) ?? 10,
        load_factor: parseOptionalInteger(wizardForm.loadFactor) ?? 10,
        priority: parseOptionalInteger(wizardForm.priority) ?? 1,
        rate_multiplier: parseOptionalNumber(wizardForm.rateMultiplier) ?? 1,
        group_ids: wizardForm.groupIds,
        expires_at: parseDateTimeLocalToUnix(wizardForm.expiresAt),
        auto_pause_on_expired: wizardForm.autoPauseOnExpired,
      });

      setSuccess('Claude Code 账号已创建');
      setShowWizard(false);
      await loadAccounts(1);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError, '创建 Claude Code 账号失败'));
    } finally {
      setWizardAuth((prev) => ({ ...prev, submitting: false }));
    }
  }, [loadAccounts, wizardAuth, wizardForm]);

  const handleCreateClaudeConsoleAccount = useCallback(async () => {
    if (!wizardForm.name.trim()) {
      setError('请输入账号名称');
      return;
    }
    if (!wizardForm.apiKeyValue.trim()) {
      setError('请输入 API Key');
      return;
    }

    try {
      setWizardAuth((prev) => ({ ...prev, submitting: true }));
      setError('');
      setSuccess('');

      const proxyId = parseOptionalInteger(wizardForm.proxyId);
      const credentials: Record<string, unknown> = {
        base_url: wizardForm.apiKeyBaseUrl.trim() || 'https://api.anthropic.com',
        api_key: wizardForm.apiKeyValue.trim(),
      };
      const modelMapping = buildModelMappingObject(
        wizardForm.modelRestrictionMode,
        wizardForm.allowedModels,
        wizardForm.modelMappings
      );
      if (modelMapping) {
        credentials.model_mapping = modelMapping;
      }
      if (wizardForm.poolModeEnabled) {
        credentials.pool_mode = true;
        credentials.pool_mode_retry_count = normalizePoolModeRetryCount(wizardForm.poolModeRetryCount);
      }
      if (wizardForm.customErrorCodesEnabled) {
        credentials.custom_error_codes_enabled = true;
        credentials.custom_error_codes = [...wizardForm.selectedErrorCodes];
      }

      if (wizardForm.tempUnschedulable) {
        const tempUnschedRules = buildTempUnschedRules(wizardForm.tempUnschedRules);
        if (!tempUnschedRules || tempUnschedRules.length === 0) {
          setError('请至少配置一条有效的临时不可调度规则');
          return;
        }
        credentials.temp_unschedulable_enabled = true;
        credentials.temp_unschedulable_rules = tempUnschedRules;
      }
      if (wizardForm.interceptWarmupRequests) {
        credentials.intercept_warmup_requests = true;
      }

      await createAdminAccount({
        name: wizardForm.name.trim(),
        notes: wizardForm.notes.trim() || undefined,
        platform: 'anthropic',
        type: 'apikey',
        credentials,
        extra: buildAnthropicAPIKeyExtra(wizardForm),
        proxy_id: proxyId ?? null,
        concurrency: parseOptionalInteger(wizardForm.concurrency) ?? 10,
        load_factor: parseOptionalInteger(wizardForm.loadFactor) ?? 10,
        priority: parseOptionalInteger(wizardForm.priority) ?? 1,
        rate_multiplier: parseOptionalNumber(wizardForm.rateMultiplier) ?? 1,
        group_ids: wizardForm.groupIds,
        expires_at: parseDateTimeLocalToUnix(wizardForm.expiresAt),
        auto_pause_on_expired: wizardForm.autoPauseOnExpired,
      });

      setSuccess('Claude Console 账号已创建');
      setShowWizard(false);
      await loadAccounts(1);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError, '创建 Claude Console 账号失败'));
    } finally {
      setWizardAuth((prev) => ({ ...prev, submitting: false }));
    }
  }, [loadAccounts, wizardForm]);

  const handleCreateBedrockAccount = useCallback(async () => {
    if (!wizardForm.name.trim()) {
      setError('请输入账号名称');
      return;
    }

    try {
      setWizardAuth((prev) => ({ ...prev, submitting: true }));
      setError('');
      setSuccess('');

      const proxyId = parseOptionalInteger(wizardForm.proxyId);
      const credentials: Record<string, unknown> = {
        auth_mode: wizardForm.authMethod,
        aws_region: wizardForm.bedrockRegion.trim() || 'us-east-1',
      };

      if (wizardForm.authMethod === 'sigv4') {
        if (!wizardForm.bedrockAccessKeyId.trim()) {
          setError('请输入 AWS Access Key ID');
          return;
        }
        if (!wizardForm.bedrockSecretAccessKey.trim()) {
          setError('请输入 AWS Secret Access Key');
          return;
        }
        credentials.aws_access_key_id = wizardForm.bedrockAccessKeyId.trim();
        credentials.aws_secret_access_key = wizardForm.bedrockSecretAccessKey.trim();
        if (wizardForm.bedrockSessionToken.trim()) {
          credentials.aws_session_token = wizardForm.bedrockSessionToken.trim();
        }
      } else {
        if (!wizardForm.bedrockApiKeyValue.trim()) {
          setError('请输入 Bedrock API Key');
          return;
        }
        credentials.api_key = wizardForm.bedrockApiKeyValue.trim();
      }

      if (wizardForm.bedrockForceGlobal) {
        credentials.aws_force_global = 'true';
      }

      const modelMapping = buildModelMappingObject(
        wizardForm.modelRestrictionMode,
        wizardForm.allowedModels,
        wizardForm.modelMappings
      );
      if (modelMapping) {
        credentials.model_mapping = modelMapping;
      }

      if (wizardForm.poolModeEnabled) {
        credentials.pool_mode = true;
        credentials.pool_mode_retry_count = normalizePoolModeRetryCount(wizardForm.poolModeRetryCount);
      }

      if (wizardForm.interceptWarmupRequests) {
        credentials.intercept_warmup_requests = true;
      }

      await createAdminAccount({
        name: wizardForm.name.trim(),
        notes: wizardForm.notes.trim() || undefined,
        platform: 'anthropic',
        type: 'bedrock',
        credentials,
        extra: Object.keys(buildQuotaExtra(wizardForm)).length > 0 ? buildQuotaExtra(wizardForm) : undefined,
        proxy_id: proxyId ?? null,
        concurrency: parseOptionalInteger(wizardForm.concurrency) ?? 10,
        load_factor: parseOptionalInteger(wizardForm.loadFactor) ?? 10,
        priority: parseOptionalInteger(wizardForm.priority) ?? 1,
        rate_multiplier: parseOptionalNumber(wizardForm.rateMultiplier) ?? 1,
        group_ids: wizardForm.groupIds,
        expires_at: parseDateTimeLocalToUnix(wizardForm.expiresAt),
        auto_pause_on_expired: wizardForm.autoPauseOnExpired,
      });

      setSuccess('AWS Bedrock 账号已创建');
      setShowWizard(false);
      await loadAccounts(1);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError, '创建 AWS Bedrock 账号失败'));
    } finally {
      setWizardAuth((prev) => ({ ...prev, submitting: false }));
    }
  }, [loadAccounts, wizardForm]);

  const handleCreateOpenAIAPIKeyAccount = useCallback(async () => {
    if (!wizardForm.name.trim()) {
      setError('请输入账号名称');
      return;
    }
    if (!wizardForm.apiKeyValue.trim()) {
      setError('请输入 API Key');
      return;
    }

    try {
      setWizardAuth((prev) => ({ ...prev, submitting: true }));
      setError('');
      setSuccess('');

      const proxyId = parseOptionalInteger(wizardForm.proxyId);
      const credentials: Record<string, unknown> = {
        base_url: wizardForm.apiKeyBaseUrl.trim() || 'https://api.openai.com',
        api_key: wizardForm.apiKeyValue.trim(),
      };

      if (!wizardForm.openaiPassthroughEnabled) {
        const modelMapping = buildModelMappingObject(
          wizardForm.modelRestrictionMode,
          wizardForm.allowedModels,
          wizardForm.modelMappings
        );
        if (modelMapping) {
          credentials.model_mapping = modelMapping;
        }
      }

      if (wizardForm.poolModeEnabled) {
        credentials.pool_mode = true;
        credentials.pool_mode_retry_count = normalizePoolModeRetryCount(wizardForm.poolModeRetryCount);
      }

      if (wizardForm.customErrorCodesEnabled) {
        credentials.custom_error_codes_enabled = true;
        credentials.custom_error_codes = [...wizardForm.selectedErrorCodes];
      }

      await createAdminAccount({
        name: wizardForm.name.trim(),
        notes: wizardForm.notes.trim() || undefined,
        platform: 'openai',
        type: 'apikey',
        credentials,
        extra: buildOpenAIAPIKeyExtra(wizardForm),
        proxy_id: proxyId ?? null,
        concurrency: parseOptionalInteger(wizardForm.concurrency) ?? 10,
        load_factor: parseOptionalInteger(wizardForm.loadFactor) ?? 10,
        priority: parseOptionalInteger(wizardForm.priority) ?? 1,
        rate_multiplier: parseOptionalNumber(wizardForm.rateMultiplier) ?? 1,
        group_ids: wizardForm.groupIds,
        expires_at: parseDateTimeLocalToUnix(wizardForm.expiresAt),
        auto_pause_on_expired: wizardForm.autoPauseOnExpired,
      });

      setSuccess('OpenAI API Key 账号已创建');
      setShowWizard(false);
      await loadAccounts(1);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError, '创建 OpenAI API Key 账号失败'));
    } finally {
      setWizardAuth((prev) => ({ ...prev, submitting: false }));
    }
  }, [loadAccounts, wizardForm]);

  const handleCreateOpenAIOAuthAccount = useCallback(async () => {
    if (!wizardForm.name.trim()) {
      setError('请输入账号名称');
      return;
    }
    if (!wizardAuth.sessionId || !wizardAuth.state) {
      setError('请先生成 OpenAI OAuth 授权链接');
      return;
    }
    const code = extractOAuthCode(wizardAuth.codeInput);
    if (!code) {
      setError('请输入授权码');
      return;
    }

    try {
      setWizardAuth((prev) => ({ ...prev, submitting: true }));
      setError('');
      setSuccess('');

      const proxyId = parseOptionalInteger(wizardForm.proxyId);
      const tokenInfo = await exchangeAdminAccountCode('/admin/openai/exchange-code', {
        session_id: wizardAuth.sessionId,
        code,
        state: wizardAuth.state,
        proxy_id: proxyId ?? undefined,
      });

      const credentials = buildOpenAIOAuthCredentials(tokenInfo);
      if (Object.keys(credentials).length === 0) {
        setError('OpenAI OAuth 返回的凭证为空');
        return;
      }

      if (!wizardForm.openaiPassthroughEnabled) {
        const modelMapping = buildModelMappingObject(
          wizardForm.modelRestrictionMode,
          wizardForm.allowedModels,
          wizardForm.modelMappings
        );
        if (modelMapping) {
          credentials.model_mapping = modelMapping;
        }
      }

      if (wizardForm.tempUnschedulable) {
        const tempUnschedRules = buildTempUnschedRules(wizardForm.tempUnschedRules);
        if (!tempUnschedRules || tempUnschedRules.length === 0) {
          setError('请至少配置一条有效的临时不可调度规则');
          return;
        }
        credentials.temp_unschedulable_enabled = true;
        credentials.temp_unschedulable_rules = tempUnschedRules;
      }

      await createAdminAccount({
        name: wizardForm.name.trim(),
        notes: wizardForm.notes.trim() || undefined,
        platform: 'openai',
        type: 'oauth',
        credentials,
        extra: buildOpenAIOAuthExtra(wizardForm),
        proxy_id: proxyId ?? null,
        concurrency: parseOptionalInteger(wizardForm.concurrency) ?? 10,
        load_factor: parseOptionalInteger(wizardForm.loadFactor) ?? 10,
        priority: parseOptionalInteger(wizardForm.priority) ?? 1,
        rate_multiplier: parseOptionalNumber(wizardForm.rateMultiplier) ?? 1,
        group_ids: wizardForm.groupIds,
        expires_at: parseDateTimeLocalToUnix(wizardForm.expiresAt),
        auto_pause_on_expired: wizardForm.autoPauseOnExpired,
      });

      setSuccess('OpenAI OAuth 账号已创建');
      setShowWizard(false);
      await loadAccounts(1);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError, '创建 OpenAI OAuth 账号失败'));
    } finally {
      setWizardAuth((prev) => ({ ...prev, submitting: false }));
    }
  }, [loadAccounts, wizardAuth.codeInput, wizardAuth.sessionId, wizardAuth.state, wizardForm]);

  const handleCreateGeminiOAuthAccount = useCallback(async () => {
    if (!wizardForm.name.trim()) {
      setError('请输入账号名称');
      return;
    }
    if (!wizardAuth.sessionId || !wizardAuth.state) {
      setError('请先生成 Gemini OAuth 授权链接');
      return;
    }
    const code = extractOAuthCode(wizardAuth.codeInput);
    if (!code) {
      setError('请输入授权码');
      return;
    }

    try {
      setWizardAuth((prev) => ({ ...prev, submitting: true }));
      setError('');
      setSuccess('');

      const proxyId = parseOptionalInteger(wizardForm.proxyId);
      const tokenInfo = await exchangeAdminAccountCode('/admin/gemini/oauth/exchange-code', {
        session_id: wizardAuth.sessionId,
        code,
        state: wizardAuth.state,
        proxy_id: proxyId ?? undefined,
        oauth_type: wizardForm.geminiOAuthType,
        tier_id: geminiSelectedTier,
      });

      const credentials = buildGeminiOAuthCredentials(tokenInfo);
      if (Object.keys(credentials).length === 0) {
        setError('Gemini OAuth 返回的凭证为空');
        return;
      }

      if (wizardForm.tempUnschedulable) {
        const tempUnschedRules = buildTempUnschedRules(wizardForm.tempUnschedRules);
        if (!tempUnschedRules || tempUnschedRules.length === 0) {
          setError('请至少配置一条有效的临时不可调度规则');
          return;
        }
        credentials.temp_unschedulable_enabled = true;
        credentials.temp_unschedulable_rules = tempUnschedRules;
      }

      await createAdminAccount({
        name: wizardForm.name.trim(),
        notes: wizardForm.notes.trim() || undefined,
        platform: 'gemini',
        type: 'oauth',
        credentials,
        extra: buildGeminiOAuthExtra(tokenInfo),
        proxy_id: proxyId ?? null,
        concurrency: parseOptionalInteger(wizardForm.concurrency) ?? 10,
        load_factor: parseOptionalInteger(wizardForm.loadFactor) ?? 10,
        priority: parseOptionalInteger(wizardForm.priority) ?? 1,
        rate_multiplier: parseOptionalNumber(wizardForm.rateMultiplier) ?? 1,
        group_ids: wizardForm.groupIds,
        expires_at: parseDateTimeLocalToUnix(wizardForm.expiresAt),
        auto_pause_on_expired: wizardForm.autoPauseOnExpired,
      });

      setSuccess('Gemini OAuth 账号已创建');
      setShowWizard(false);
      await loadAccounts(1);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError, '创建 Gemini OAuth 账号失败'));
    } finally {
      setWizardAuth((prev) => ({ ...prev, submitting: false }));
    }
  }, [geminiSelectedTier, loadAccounts, wizardAuth.codeInput, wizardAuth.sessionId, wizardAuth.state, wizardForm]);

  const handleCreateGeminiAPIKeyAccount = useCallback(async () => {
    if (!wizardForm.name.trim()) {
      setError('请输入账号名称');
      return;
    }
    if (!wizardForm.apiKeyValue.trim()) {
      setError('请输入 API Key');
      return;
    }

    try {
      setWizardAuth((prev) => ({ ...prev, submitting: true }));
      setError('');
      setSuccess('');

      const proxyId = parseOptionalInteger(wizardForm.proxyId);
      const credentials: Record<string, unknown> = {
        base_url: wizardForm.apiKeyBaseUrl.trim() || 'https://generativelanguage.googleapis.com',
        api_key: wizardForm.apiKeyValue.trim(),
        tier_id: wizardForm.geminiTierAIStudio,
      };

      const modelMapping = buildModelMappingObject(
        wizardForm.modelRestrictionMode,
        wizardForm.allowedModels,
        wizardForm.modelMappings
      );
      if (modelMapping) {
        credentials.model_mapping = modelMapping;
      }

      if (wizardForm.poolModeEnabled) {
        credentials.pool_mode = true;
        credentials.pool_mode_retry_count = normalizePoolModeRetryCount(wizardForm.poolModeRetryCount);
      }

      if (wizardForm.customErrorCodesEnabled) {
        credentials.custom_error_codes_enabled = true;
        credentials.custom_error_codes = [...wizardForm.selectedErrorCodes];
      }

      if (wizardForm.interceptWarmupRequests) {
        credentials.intercept_warmup_requests = true;
      }
      if (wizardForm.tempUnschedulable) {
        const tempUnschedRules = buildTempUnschedRules(wizardForm.tempUnschedRules);
        if (!tempUnschedRules || tempUnschedRules.length === 0) {
          setError('请至少配置一条有效的临时不可调度规则');
          return;
        }
        credentials.temp_unschedulable_enabled = true;
        credentials.temp_unschedulable_rules = tempUnschedRules;
      }

      const quotaExtra = buildQuotaExtra(wizardForm);
      await createAdminAccount({
        name: wizardForm.name.trim(),
        notes: wizardForm.notes.trim() || undefined,
        platform: 'gemini',
        type: 'apikey',
        credentials,
        extra: Object.keys(quotaExtra).length > 0 ? quotaExtra : undefined,
        proxy_id: proxyId ?? null,
        concurrency: parseOptionalInteger(wizardForm.concurrency) ?? 10,
        load_factor: parseOptionalInteger(wizardForm.loadFactor) ?? 10,
        priority: parseOptionalInteger(wizardForm.priority) ?? 1,
        rate_multiplier: parseOptionalNumber(wizardForm.rateMultiplier) ?? 1,
        group_ids: wizardForm.groupIds,
        expires_at: parseDateTimeLocalToUnix(wizardForm.expiresAt),
        auto_pause_on_expired: wizardForm.autoPauseOnExpired,
      });

      setSuccess('Gemini API Key 账号已创建');
      setShowWizard(false);
      await loadAccounts(1);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError, '创建 Gemini API Key 账号失败'));
    } finally {
      setWizardAuth((prev) => ({ ...prev, submitting: false }));
    }
  }, [loadAccounts, wizardForm]);

  const handleCreateAntigravityUpstreamAccount = useCallback(async () => {
    if (!wizardForm.name.trim()) {
      setError('请输入账号名称');
      return;
    }
    if (!wizardForm.apiKeyValue.trim()) {
      setError('请输入 API Key');
      return;
    }

    try {
      setWizardAuth((prev) => ({ ...prev, submitting: true }));
      setError('');
      setSuccess('');

      const proxyId = parseOptionalInteger(wizardForm.proxyId);
      const credentials: Record<string, unknown> = {
        base_url: wizardForm.apiKeyBaseUrl.trim() || ANTIGRAVITY_DEFAULT_BASE_URL,
        api_key: wizardForm.apiKeyValue.trim(),
      };
      const modelMapping = buildModelMappingObject('mapping', [], wizardForm.modelMappings);
      if (modelMapping) {
        credentials.model_mapping = modelMapping;
      }
      if (wizardForm.interceptWarmupRequests) {
        credentials.intercept_warmup_requests = true;
      }
      if (wizardForm.tempUnschedulable) {
        const tempUnschedRules = buildTempUnschedRules(wizardForm.tempUnschedRules);
        if (!tempUnschedRules || tempUnschedRules.length === 0) {
          setError('请至少配置一条有效的临时不可调度规则');
          return;
        }
        credentials.temp_unschedulable_enabled = true;
        credentials.temp_unschedulable_rules = tempUnschedRules;
      }

      await createAdminAccount({
        name: wizardForm.name.trim(),
        notes: wizardForm.notes.trim() || undefined,
        platform: 'antigravity',
        type: 'apikey',
        credentials,
        extra: buildAntigravityExtra(wizardForm),
        proxy_id: proxyId ?? null,
        concurrency: parseOptionalInteger(wizardForm.concurrency) ?? 10,
        load_factor: parseOptionalInteger(wizardForm.loadFactor) ?? 10,
        priority: parseOptionalInteger(wizardForm.priority) ?? 1,
        rate_multiplier: parseOptionalNumber(wizardForm.rateMultiplier) ?? 1,
        group_ids: wizardForm.groupIds,
        expires_at: parseDateTimeLocalToUnix(wizardForm.expiresAt),
        auto_pause_on_expired: wizardForm.autoPauseOnExpired,
      });

      setSuccess('Antigravity API Key 账号已创建');
      setShowWizard(false);
      await loadAccounts(1);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError, '创建 Antigravity API Key 账号失败'));
    } finally {
      setWizardAuth((prev) => ({ ...prev, submitting: false }));
    }
  }, [loadAccounts, wizardForm]);

  const handleCreateAntigravityOAuthAccount = useCallback(async () => {
    if (!wizardForm.name.trim()) {
      setError('请输入账号名称');
      return;
    }
    if (!wizardAuth.sessionId || !wizardAuth.state) {
      setError('请先生成 Antigravity OAuth 授权链接');
      return;
    }
    const code = extractOAuthCode(wizardAuth.codeInput);
    if (!code) {
      setError('请输入授权码');
      return;
    }

    try {
      setWizardAuth((prev) => ({ ...prev, submitting: true }));
      setError('');
      setSuccess('');

      const proxyId = parseOptionalInteger(wizardForm.proxyId);
      const tokenInfo = await exchangeAdminAccountCode('/admin/antigravity/oauth/exchange-code', {
        session_id: wizardAuth.sessionId,
        code,
        state: wizardAuth.state,
        proxy_id: proxyId ?? undefined,
      });

      const credentials = buildAntigravityOAuthCredentials(tokenInfo);
      if (Object.keys(credentials).length === 0) {
        setError('Antigravity OAuth 返回的凭证为空');
        return;
      }
      const modelMapping = buildModelMappingObject('mapping', [], wizardForm.modelMappings);
      if (modelMapping) {
        credentials.model_mapping = modelMapping;
      }
      if (wizardForm.interceptWarmupRequests) {
        credentials.intercept_warmup_requests = true;
      }
      if (wizardForm.tempUnschedulable) {
        const tempUnschedRules = buildTempUnschedRules(wizardForm.tempUnschedRules);
        if (!tempUnschedRules || tempUnschedRules.length === 0) {
          setError('请至少配置一条有效的临时不可调度规则');
          return;
        }
        credentials.temp_unschedulable_enabled = true;
        credentials.temp_unschedulable_rules = tempUnschedRules;
      }

      await createAdminAccount({
        name: wizardForm.name.trim(),
        notes: wizardForm.notes.trim() || undefined,
        platform: 'antigravity',
        type: 'oauth',
        credentials,
        extra: buildAntigravityExtra(wizardForm),
        proxy_id: proxyId ?? null,
        concurrency: parseOptionalInteger(wizardForm.concurrency) ?? 10,
        load_factor: parseOptionalInteger(wizardForm.loadFactor) ?? 10,
        priority: parseOptionalInteger(wizardForm.priority) ?? 1,
        rate_multiplier: parseOptionalNumber(wizardForm.rateMultiplier) ?? 1,
        group_ids: wizardForm.groupIds,
        expires_at: parseDateTimeLocalToUnix(wizardForm.expiresAt),
        auto_pause_on_expired: wizardForm.autoPauseOnExpired,
      });

      setSuccess('Antigravity OAuth 账号已创建');
      setShowWizard(false);
      await loadAccounts(1);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError, '创建 Antigravity OAuth 账号失败'));
    } finally {
      setWizardAuth((prev) => ({ ...prev, submitting: false }));
    }
  }, [loadAccounts, wizardAuth.codeInput, wizardAuth.sessionId, wizardAuth.state, wizardForm]);

  const handleCreateAntigravityRefreshTokenAccounts = useCallback(async () => {
    if (!wizardForm.name.trim()) {
      setError('请输入账号名称');
      return;
    }

    const refreshTokens = parseMultilineTokens(wizardAuth.refreshTokenInput);
    if (refreshTokens.length === 0) {
      setError('请输入 Refresh Token');
      return;
    }

    try {
      setWizardAuth((prev) => ({ ...prev, submitting: true }));
      setError('');
      setSuccess('');

      const proxyId = parseOptionalInteger(wizardForm.proxyId);
      let successCount = 0;
      const failures: string[] = [];

      for (let index = 0; index < refreshTokens.length; index += 1) {
        try {
          const tokenInfo = await exchangeAdminAccountCode('/admin/antigravity/oauth/refresh-token', {
            refresh_token: refreshTokens[index],
            proxy_id: proxyId ?? undefined,
          });

          const credentials = buildAntigravityOAuthCredentials(tokenInfo);
          if (Object.keys(credentials).length === 0) {
            throw new Error('返回的凭证为空');
          }

          const modelMapping = buildModelMappingObject('mapping', [], wizardForm.modelMappings);
          if (modelMapping) {
            credentials.model_mapping = modelMapping;
          }
          if (wizardForm.interceptWarmupRequests) {
            credentials.intercept_warmup_requests = true;
          }
          if (wizardForm.tempUnschedulable) {
            const tempUnschedRules = buildTempUnschedRules(wizardForm.tempUnschedRules);
            if (!tempUnschedRules || tempUnschedRules.length === 0) {
              setError('请至少配置一条有效的临时不可调度规则');
              return;
            }
            credentials.temp_unschedulable_enabled = true;
            credentials.temp_unschedulable_rules = tempUnschedRules;
          }

          await createAdminAccount({
            name: refreshTokens.length > 1 ? `${wizardForm.name.trim()} #${index + 1}` : wizardForm.name.trim(),
            notes: wizardForm.notes.trim() || undefined,
            platform: 'antigravity',
            type: 'oauth',
            credentials,
            extra: buildAntigravityExtra(wizardForm),
            proxy_id: proxyId ?? null,
            concurrency: parseOptionalInteger(wizardForm.concurrency) ?? 10,
            load_factor: parseOptionalInteger(wizardForm.loadFactor) ?? 10,
            priority: parseOptionalInteger(wizardForm.priority) ?? 1,
            rate_multiplier: parseOptionalNumber(wizardForm.rateMultiplier) ?? 1,
            group_ids: wizardForm.groupIds,
            expires_at: parseDateTimeLocalToUnix(wizardForm.expiresAt),
            auto_pause_on_expired: wizardForm.autoPauseOnExpired,
          });

          successCount += 1;
        } catch (createError: unknown) {
          failures.push(`#${index + 1}: ${getErrorMessage(createError, 'Refresh Token 校验失败')}`);
        }
      }

      if (successCount > 0 && failures.length === 0) {
        setSuccess(refreshTokens.length > 1 ? `已批量创建 ${successCount} 个 Antigravity OAuth 账号` : 'Antigravity OAuth 账号已创建');
        setShowWizard(false);
        await loadAccounts(1);
        return;
      }

      if (successCount > 0) {
        setError(`已成功创建 ${successCount} 个账号，失败 ${failures.length} 个：\n${failures.join('\n')}`);
        await loadAccounts(1);
        return;
      }

      setError(failures.join('\n') || 'Antigravity Refresh Token 校验失败');
    } finally {
      setWizardAuth((prev) => ({ ...prev, submitting: false }));
    }
  }, [loadAccounts, wizardAuth.refreshTokenInput, wizardForm]);

  const handleAdvanceWizard = () => {
    if (!wizardForm.name.trim()) {
      setError('请输入账号名称');
      return;
    }
    setError('');
    setSuccess('');
    setWizardStep(2);
  };

  const handleToggleStatus = async (account: AdminAccount) => {
    try {
      const nextStatus = account.status === 'inactive' ? 'active' : 'inactive';
      await updateAdminAccount(account.id, { status: nextStatus });
      setSuccess(nextStatus === 'active' ? '账号已启用' : '账号已停用');
      await loadAccounts(pagination.page);
    } catch (updateError: unknown) {
      setError(getErrorMessage(updateError, '更新账号状态失败'));
    }
  };

  const handleTest = async (account: AdminAccount) => {
    try {
      const result = await testAdminAccount(account.id);
      setSuccess(result.message || `账号 ${account.id} 测试完成`);
    } catch (testError: unknown) {
      setError(getErrorMessage(testError, '测试账号失败'));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">账号管理</h2>
      </div>

      {(error || success) && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            error
              ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
              : 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
          }`}
        >
          {error || success}
        </div>
      )}

      <div className="space-y-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadAccounts(pagination.page)}
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            type="button"
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm transition ${
              autoRefresh
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            <RefreshCw className="h-4 w-4" />
            自动刷新
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-400 dark:border-gray-700"
            title="Phase 5 实现"
          >
            <ShieldAlert className="h-4 w-4" />
            错误透传规则
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-400 dark:border-gray-700"
            title="Phase 5 实现"
          >
            <Lock className="h-4 w-4" />
            TLS 指纹模板
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-400 dark:border-gray-700"
            title="Phase 5 实现"
          >
            <Columns3 className="h-4 w-4" />
            列设置
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-400 dark:border-gray-700"
            title="Phase 5 实现"
          >
            <Link2 className="h-4 w-4" />
            从 CRS 同步
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-400 dark:border-gray-700"
            title="Phase 5 实现"
          >
            <Upload className="h-4 w-4" />
            导入
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-400 dark:border-gray-700"
            title="Phase 5 实现"
          >
            <Download className="h-4 w-4" />
            导出
          </button>
          <button
            type="button"
            onClick={() => void openWizard()}
            className="ml-auto inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-600"
          >
            <Plus className="h-4 w-4" />
            添加账号
          </button>
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.3fr_repeat(5,minmax(0,1fr))]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void loadAccounts(1);
                }
              }}
              placeholder="搜索账号..."
              className="w-full rounded-2xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-800 dark:bg-[#111111] dark:text-white"
            />
          </div>
          <select
            value={filters.platform}
            onChange={(e) => setFilters((prev) => ({ ...prev, platform: e.target.value }))}
            className="rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
          >
            <option value="">全部平台</option>
            {PLATFORM_OPTIONS.map((platform) => (
              <option key={platform.key} value={platform.key}>
                {platform.label}
              </option>
            ))}
          </select>
          <select
            value={filters.type}
            onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
            className="rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
          >
            <option value="">全部类型</option>
            <option value="oauth">oauth</option>
            <option value="setup-token">setup-token</option>
            <option value="apikey">apikey</option>
            <option value="bedrock">bedrock</option>
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            className="rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
          >
            <option value="">全部状态</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="error">error</option>
          </select>
          <select
            value={filters.privacy_mode}
            onChange={(e) => setFilters((prev) => ({ ...prev, privacy_mode: e.target.value }))}
            className="rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
          >
            <option value="">全部 Privacy</option>
            <option value="enabled">开启</option>
            <option value="disabled">关闭</option>
          </select>
          <select
            value={filters.group}
            onChange={(e) => setFilters((prev) => ({ ...prev, group: e.target.value }))}
            className="rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
          >
            <option value="">全部分组</option>
            {groups.map((group) => (
              <option key={group.id} value={group.name}>
                {group.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadAccounts(1)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ListFilter className="h-4 w-4" />
            应用筛选
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="border-b border-gray-100 px-5 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          第 {pagination.page} / {totalPages} 页，共 {pagination.total} 个账号
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr className="text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">
                  <input type="checkbox" disabled />
                </th>
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">平台/类型</th>
                <th className="px-4 py-3 font-medium">容量</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">调度</th>
                <th className="px-4 py-3 font-medium">分组</th>
                <th className="px-4 py-3 font-medium">用量窗口</th>
                <th className="px-4 py-3 font-medium">最近使用</th>
                <th className="px-4 py-3 font-medium">过期时间</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    正在加载账号列表...
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-gray-500 dark:text-gray-400">
                    暂无数据
                  </td>
                </tr>
              ) : (
                accounts.map((account) => (
                  <tr key={account.id} className="border-t border-gray-100 align-top dark:border-gray-800">
                    <td className="px-4 py-4">
                      <input type="checkbox" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-gray-900 dark:text-white">{account.name || '-'}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{account.notes || '-'}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-gray-900 dark:text-white">{account.platform || '-'}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{account.type || '-'}</div>
                    </td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">{account.concurrency ?? 0}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          account.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {account.status || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          account.schedulable === false
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        }`}
                      >
                        {account.schedulable === false ? '暂停' : '可调度'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">{account.group_name || account.group || '-'}</td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">
                      {account.window_cost_limit ? `5h / ${account.window_cost_limit}` : '-'}
                    </td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">{formatDateTime(account.last_used_at)}</td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">{formatDateTime(account.expires_at)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleTest(account)}
                          className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          <TestTube2 className="h-3.5 w-3.5" />
                          测试
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleStatus(account)}
                          className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                            account.status === 'inactive'
                              ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-950/30'
                              : 'border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-900/40 dark:text-orange-300 dark:hover:bg-orange-950/30'
                          }`}
                        >
                          {account.status === 'inactive' ? '启用' : '停用'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <div>
            第 {pagination.page} / {totalPages} 页，共 {pagination.total} 个账号
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1 || loading}
              onClick={() => void loadAccounts(pagination.page - 1)}
              className="rounded-2xl border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={pagination.page >= totalPages || loading}
              onClick={() => void loadAccounts(pagination.page + 1)}
              className="rounded-2xl border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      <ModalShell open={showWizard} title="添加账号" onClose={() => setShowWizard(false)}>
        <div className="border-b border-gray-200 px-7 py-5 dark:border-gray-800">
          <div className="flex items-center justify-center gap-4 text-sm">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${wizardStep >= 1 ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500 dark:bg-gray-700'}`}>
                1
              </div>
              <span className={`${wizardStep >= 1 ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>授权方式</span>
            </div>
            <div className="h-px w-16 bg-gray-300 dark:bg-gray-700" />
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${wizardStep >= 2 ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500 dark:bg-gray-700'}`}>
                2
              </div>
              <span className={`${wizardStep >= 2 ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                {wizardForm.platform === 'anthropic' ? 'Claude 账号授权' : '账号授权'}
              </span>
            </div>
          </div>
        </div>

        {wizardStep === 1 ? (
          <div className="space-y-6 px-7 py-6">
            <div>
              <FieldLabel>账号名称</FieldLabel>
              <input
                value={wizardForm.name}
                onChange={(e) => setWizardForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="请输入账号名称"
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              />
            </div>

            <div>
              <FieldLabel>备注</FieldLabel>
              <textarea
                rows={3}
                value={wizardForm.notes}
                onChange={(e) => setWizardForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="请输入备注"
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              />
              <p className="mt-2 text-xs text-gray-400">备注可选</p>
            </div>

            <div>
              <FieldLabel>平台</FieldLabel>
              <div className="grid gap-3 lg:grid-cols-4">
                {PLATFORM_OPTIONS.map((platform) => {
                  const active = wizardForm.platform === platform.key;
                  return (
                    <button
                      key={platform.key}
                      type="button"
                      onClick={() => handleSelectPlatform(platform.key)}
                      className={`rounded-2xl border px-5 py-5 text-left transition ${
                        active
                          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                          : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className={`text-xl font-semibold ${platform.accent}`}>{platform.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <FieldLabel>账号类型</FieldLabel>
                {wizardForm.platform === 'gemini' ? (
                  <a
                    href={GEMINI_HELP_DOC_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-xl px-2 py-1 text-sm text-blue-600 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/30"
                  >
                    <CircleHelp className="h-4 w-4" />
                    使用帮助
                  </a>
                ) : null}
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                {currentTypeOptions.map((option) => {
                  const active = wizardForm.accountType === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => handleSelectAccountType(option.key)}
                      className={`rounded-2xl border px-5 py-5 text-left transition ${
                        active
                          ? 'border-orange-400 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30'
                          : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className="text-xl font-semibold text-gray-900 dark:text-white">{option.title}</div>
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{option.subtitle}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {!isClaudeConsoleWizard &&
              !isBedrockWizard &&
              !isOpenAIApiKeyWizard &&
              !isOpenAIOAuthWizard &&
              !isGeminiOAuthWizard &&
              !isGeminiAPIKeyWizard &&
              !isAntigravityOAuthWizard &&
              !isAntigravityUpstreamWizard && (
              <div>
                <FieldLabel>添加方式</FieldLabel>
                <div className="flex flex-wrap gap-6">
                  {currentAuthOptions.map((option) => (
                    <label key={option.key} className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="radio"
                        name="auth-method"
                        checked={wizardForm.authMethod === option.key}
                        onChange={() => {
                          setWizardAuth(DEFAULT_WIZARD_AUTH_STATE);
                          setWizardForm((prev) => ({ ...prev, authMethod: option.key }));
                        }}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {isGeminiOAuthWizard && (
              <div className="space-y-4 rounded-3xl border border-blue-200 bg-blue-50/40 p-5 dark:border-blue-900/40 dark:bg-blue-950/20">
                <div>
                  <div className="text-base font-semibold text-gray-900 dark:text-white">Gemini OAuth 配置</div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">按 Vue 的 Gemini OAuth 流程，先选 OAuth 子类型与账号等级，再进入下一步完成授权。</p>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <FieldLabel>OAuth 类型</FieldLabel>
                    <button
                      type="button"
                      onClick={() => setWizardForm((prev) => ({ ...prev, geminiShowAdvancedOAuth: !prev.geminiShowAdvancedOAuth }))}
                      className="inline-flex items-center gap-2 text-sm text-gray-600 transition hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                    >
                      <ChevronDown className={`h-4 w-4 transition ${wizardForm.geminiShowAdvancedOAuth ? 'rotate-180' : ''}`} />
                      {wizardForm.geminiShowAdvancedOAuth ? '隐藏高级选项（自建 OAuth Client）' : '显示高级选项（自建 OAuth Client）'}
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setWizardForm((prev) => ({ ...prev, geminiOAuthType: 'google_one' }))}
                      className={`rounded-2xl border p-6 text-left transition ${
                        wizardForm.geminiOAuthType === 'google_one'
                          ? 'border-purple-400 bg-purple-50 dark:border-purple-700 dark:bg-purple-950/30'
                          : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-[#111111] dark:hover:bg-gray-900'
                      }`}
                    >
                      <div className="text-2xl font-semibold text-gray-900 dark:text-white">Google One</div>
                      <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">个人账号，享受 Google One 订阅配额</div>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-purple-100 px-3 py-1 font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">推荐个人用户</span>
                        <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">无需 GCP</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setWizardForm((prev) => ({ ...prev, geminiOAuthType: 'code_assist' }))}
                      className={`rounded-2xl border p-6 text-left transition ${
                        wizardForm.geminiOAuthType === 'code_assist'
                          ? 'border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30'
                          : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-[#111111] dark:hover:bg-gray-900'
                      }`}
                    >
                      <div className="text-2xl font-semibold text-gray-900 dark:text-white">GCP Code Assist</div>
                      <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">企业级，需要 GCP 项目</div>
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        需要激活 GCP 项目并绑定信用卡 <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-300">创建项目</a>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-blue-100 px-3 py-1 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">企业用户</span>
                        <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">高并发</span>
                      </div>
                    </button>
                  </div>

                  {wizardForm.geminiShowAdvancedOAuth && (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-white p-5 dark:border-amber-900/30 dark:bg-[#111111]">
                      <button
                        type="button"
                        disabled={!geminiCapabilities?.ai_studio_oauth_enabled}
                        onClick={() =>
                          geminiCapabilities?.ai_studio_oauth_enabled &&
                          setWizardForm((prev) => ({ ...prev, geminiOAuthType: 'ai_studio' }))
                        }
                        className={`w-full rounded-2xl border p-6 text-left transition ${
                          wizardForm.geminiOAuthType === 'ai_studio'
                            ? 'border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30'
                            : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-[#111111] dark:hover:bg-gray-900'
                        } ${!geminiCapabilities?.ai_studio_oauth_enabled ? 'cursor-not-allowed opacity-70' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-2xl font-semibold text-gray-900 dark:text-white">自定义授权（AI Studio OAuth）</div>
                            <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">使用管理员预设的 OAuth 客户端，适合组织管理。</div>
                            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">需要管理员配置 Client ID 并加入测试用户白名单。</div>
                            <div className="mt-4 flex flex-wrap gap-2 text-xs">
                              <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">组织管理</span>
                              <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">需要管理员</span>
                            </div>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                            geminiCapabilities?.ai_studio_oauth_enabled
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                          }`}>
                            {geminiCapabilities?.ai_studio_oauth_enabled ? '已配置' : '未配置'}
                          </span>
                        </div>
                      </button>

                      {!geminiCapabilities?.ai_studio_oauth_enabled && (
                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
                          <div>AI Studio OAuth 未配置：请先设置 `GEMINI_OAUTH_CLIENT_ID`、`GEMINI_OAUTH_CLIENT_SECRET`。</div>
                          {geminiCapabilities?.required_redirect_uris?.length ? (
                            <div className="mt-2">
                              Redirect URI:
                              {geminiCapabilities.required_redirect_uris.map((uri) => (
                                <div key={uri} className="mt-1 break-all">{uri}</div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                  <FieldLabel>账号等级</FieldLabel>
                  <select
                    value={geminiSelectedTier}
                    onChange={(e) =>
                      setWizardForm((prev) =>
                        prev.geminiOAuthType === 'google_one'
                          ? { ...prev, geminiTierGoogleOne: e.target.value as AccountWizardForm['geminiTierGoogleOne'] }
                          : prev.geminiOAuthType === 'code_assist'
                            ? { ...prev, geminiTierGcp: e.target.value as AccountWizardForm['geminiTierGcp'] }
                            : { ...prev, geminiTierAIStudio: e.target.value as AccountWizardForm['geminiTierAIStudio'] }
                      )
                    }
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                  >
                    {(wizardForm.geminiOAuthType === 'google_one'
                      ? GEMINI_GOOGLE_ONE_TIERS
                      : wizardForm.geminiOAuthType === 'code_assist'
                        ? GEMINI_GCP_TIERS
                        : GEMINI_AISTUDIO_TIERS
                    ).map((tier) => (
                      <option key={tier.value} value={tier.value}>
                        {tier.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    提示：系统会优先尝试自动识别账号等级；若自动识别不可用或失败，则使用你选择的等级作为回退。
                  </p>
                </div>
              </div>
            )}

            {isGeminiAPIKeyWizard && (
              <div className="space-y-4 rounded-3xl border border-purple-200 bg-purple-50/50 p-5 dark:border-purple-900/40 dark:bg-purple-950/20">
                <div className="rounded-2xl border border-purple-200 bg-white p-4 dark:border-purple-900/30 dark:bg-[#111111]">
                  <p className="text-sm text-purple-800 dark:text-purple-200">适合轻量测试。免费层限流严格，数据可能用于训练。</p>
                  <div className="mt-2">
                    <a
                      href={GEMINI_API_KEY_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-300"
                    >
                      获取 API Key
                    </a>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                      <FieldLabel>账号等级</FieldLabel>
                      <select
                        value={wizardForm.geminiTierAIStudio}
                        onChange={(e) =>
                          setWizardForm((prev) => ({
                            ...prev,
                            geminiTierAIStudio: e.target.value as AccountWizardForm['geminiTierAIStudio'],
                          }))
                        }
                        className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                      >
                        {GEMINI_AISTUDIO_TIERS.map((tier) => (
                          <option key={tier.value} value={tier.value}>
                            {tier.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">AI Studio 的配额是按模型分别限流（Pro/Flash 独立）。若已绑卡（按量付费），请选择 Pay-as-you-go。</p>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                      <FieldLabel>Base URL</FieldLabel>
                      <input
                        value={wizardForm.apiKeyBaseUrl}
                        onChange={(e) => setWizardForm((prev) => ({ ...prev, apiKeyBaseUrl: e.target.value }))}
                        placeholder="https://generativelanguage.googleapis.com"
                        className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                      />
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">留空使用官方 Gemini API</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                    <FieldLabel>API Key</FieldLabel>
                    <input
                      type="password"
                      value={wizardForm.apiKeyValue}
                      onChange={(e) => setWizardForm((prev) => ({ ...prev, apiKeyValue: e.target.value }))}
                      placeholder="AIza..."
                      className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 font-mono text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                    />
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">您的 Gemini API Key（以 AIza 开头）</p>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">模型限制（可选）</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setWizardForm((prev) => ({ ...prev, modelRestrictionMode: 'whitelist' }))}
                          className={`rounded-2xl px-4 py-2.5 text-sm transition ${
                            wizardForm.modelRestrictionMode === 'whitelist'
                              ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                              : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                          }`}
                        >
                          模型白名单
                        </button>
                        <button
                          type="button"
                          onClick={() => setWizardForm((prev) => ({ ...prev, modelRestrictionMode: 'mapping' }))}
                          className={`rounded-2xl px-4 py-2.5 text-sm transition ${
                            wizardForm.modelRestrictionMode === 'mapping'
                              ? 'border border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-300'
                              : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                          }`}
                        >
                          模型映射
                        </button>
                      </div>
                    </div>

                    {wizardForm.modelRestrictionMode === 'whitelist' ? (
                      <div className="mt-4 space-y-4">
                        <div className="rounded-2xl border border-gray-200 dark:border-gray-800">
                          {geminiSelectedModelsExpanded && (
                            <div className="grid gap-2 border-b border-gray-100 p-4 md:grid-cols-2 dark:border-gray-800">
                              {wizardForm.allowedModels.map((model) => (
                                <div key={`gemini-selected-${model}`} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm dark:bg-[#0f0f0f]">
                                  <span className="truncate text-gray-700 dark:text-gray-300">{model}</span>
                                  <button type="button" onClick={() => handleToggleAllowedModel(model)} className="text-gray-500 transition hover:text-red-500">
                                    x
                                  </button>
                                </div>
                              ))}
                              {wizardForm.allowedModels.length === 0 && (
                                <div className="col-span-full rounded-2xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                  当前还没有选中模型
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex items-center justify-between px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            <span>{wizardForm.allowedModels.length} 个模型</span>
                            <button
                              type="button"
                              onClick={() => setGeminiSelectedModelsExpanded((prev) => !prev)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                              <ChevronDown className={`h-4 w-4 transition ${geminiSelectedModelsExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setGeminiModelPickerOpen((prev) => !prev)}
                            className={`rounded-2xl border px-4 py-2.5 text-sm transition ${
                              geminiModelPickerOpen
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                                : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                            }`}
                          >
                            {geminiModelPickerOpen ? '收起模型选择' : '点开选择模型'}
                          </button>
                          <button
                            type="button"
                            onClick={handleSelectAllAllowedModels}
                            className="rounded-2xl border border-blue-200 px-4 py-2.5 text-sm text-blue-600 transition hover:bg-blue-50 dark:border-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-950/30"
                          >
                            填入相关模型
                          </button>
                          <button
                            type="button"
                            onClick={handleClearAllowedModels}
                            className="rounded-2xl border border-red-200 px-4 py-2.5 text-sm text-red-600 transition hover:bg-red-50 dark:border-red-900/30 dark:text-red-300 dark:hover:bg-red-950/30"
                          >
                            清除所有模型
                          </button>
                        </div>

                        {geminiModelPickerOpen && (
                          <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                            <div className="relative">
                              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                              <input
                                value={geminiModelSearch}
                                onChange={(e) => setGeminiModelSearch(e.target.value)}
                                placeholder="搜索 Gemini 模型"
                                className="w-full rounded-2xl border border-gray-200 bg-transparent py-3 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                              />
                            </div>
                            <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto md:grid-cols-2">
                              {filteredGeminiModels.map((model) => (
                                <label
                                  key={`gemini-picker-${model}`}
                                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-sm transition ${
                                    wizardForm.allowedModels.includes(model)
                                      ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                                      : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={wizardForm.allowedModels.includes(model)}
                                    onChange={() => handleToggleAllowedModel(model)}
                                  />
                                  <span className="truncate text-gray-700 dark:text-gray-300">{model}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <FieldLabel>自定义模型名称</FieldLabel>
                          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                            <input
                              value={wizardForm.geminiCustomModelName}
                              onChange={(e) => setWizardForm((prev) => ({ ...prev, geminiCustomModelName: e.target.value }))}
                              placeholder="输入自定义模型名称"
                              className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={handleAddGeminiCustomModel}
                              className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-600"
                            >
                              填入
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">已选择 {wizardForm.allowedModels.length} 个模型</p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        <button
                          type="button"
                          onClick={() => handleAddModelMapping()}
                          className="rounded-2xl border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          + 添加映射
                        </button>
                        {wizardForm.modelMappings.map((mapping, index) => (
                          <div key={`gemini-mapping-${index}`} className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto]">
                            <input
                              value={mapping.from}
                              onChange={(e) => handleChangeModelMapping(index, 'from', e.target.value)}
                              placeholder="请求模型"
                              className="rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                            />
                            <div className="flex items-center justify-center text-sm text-gray-400">{'->'}</div>
                            <input
                              value={mapping.to}
                              onChange={(e) => handleChangeModelMapping(index, 'to', e.target.value)}
                              placeholder="实际模型"
                              className="rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveModelMapping(index)}
                              className="rounded-xl border border-red-200 px-3 py-3 text-xs text-red-600 transition hover:bg-red-50 dark:border-red-900/30 dark:text-red-300 dark:hover:bg-red-950/30"
                            >
                              删除
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">池模式</div>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">上游为账号池时启用，错误不标记本地账号状态。</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setWizardForm((prev) => ({ ...prev, poolModeEnabled: !prev.poolModeEnabled }))}
                          className={`relative inline-flex h-7 w-12 rounded-full transition ${
                            wizardForm.poolModeEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        >
                          <span
                            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                              wizardForm.poolModeEnabled ? 'left-6' : 'left-1'
                            }`}
                          />
                        </button>
                      </div>
                      {wizardForm.poolModeEnabled && (
                        <div className="mt-4">
                          <FieldLabel>重试次数</FieldLabel>
                          <input
                            type="number"
                            min="0"
                            max={MAX_POOL_MODE_RETRY_COUNT}
                            step="1"
                            value={wizardForm.poolModeRetryCount}
                            onChange={(e) => setWizardForm((prev) => ({ ...prev, poolModeRetryCount: e.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">配额限制</div>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">设置日/周/总使用额度（美元），任一维度达到限制后账号暂停调度。</p>
                      <div className="mt-4 grid gap-4">
                        <div>
                          <FieldLabel>日额度（USD）</FieldLabel>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={wizardForm.quotaDailyLimit}
                            onChange={(e) => setWizardForm((prev) => ({ ...prev, quotaDailyLimit: e.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                        </div>
                        <div>
                          <FieldLabel>周额度（USD）</FieldLabel>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={wizardForm.quotaWeeklyLimit}
                            onChange={(e) => setWizardForm((prev) => ({ ...prev, quotaWeeklyLimit: e.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                        </div>
                        <div>
                          <FieldLabel>总额度（USD）</FieldLabel>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={wizardForm.quotaTotalLimit}
                            onChange={(e) => setWizardForm((prev) => ({ ...prev, quotaTotalLimit: e.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">自定义错误码</div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">仅对选中的错误码停止调度。</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, customErrorCodesEnabled: !prev.customErrorCodesEnabled }))}
                        className={`relative inline-flex h-7 w-12 rounded-full transition ${
                          wizardForm.customErrorCodesEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                            wizardForm.customErrorCodesEnabled ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>
                    </div>
                    {wizardForm.customErrorCodesEnabled && (
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {COMMON_ERROR_CODES.map((item) => {
                            const active = wizardForm.selectedErrorCodes.includes(item.value);
                            return (
                              <button
                                key={`gemini-code-${item.value}`}
                                type="button"
                                onClick={() => handleToggleErrorCode(item.value)}
                                className={`rounded-2xl px-3 py-1.5 text-xs font-medium transition ${
                                  active
                                    ? 'bg-red-100 text-red-700 ring-1 ring-red-400 dark:bg-red-900/30 dark:text-red-300'
                                    : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                                }`}
                              >
                                {item.value} {item.label}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="100"
                            max="599"
                            value={wizardForm.customErrorCodeInput}
                            onChange={(e) => setWizardForm((prev) => ({ ...prev, customErrorCodeInput: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCustomErrorCode();
                              }
                            }}
                            placeholder="输入错误码"
                            className="flex-1 rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={handleAddCustomErrorCode}
                            className="rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            添加
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {sortedSelectedErrorCodes.length > 0 ? (
                            sortedSelectedErrorCodes.map((code) => (
                              <span key={`gemini-selected-code-${code}`} className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                {code}
                                <button type="button" onClick={() => handleRemoveErrorCode(code)} className="text-red-600 transition hover:text-red-800 dark:text-red-300 dark:hover:text-red-100">
                                  x
                                </button>
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-400">未选择错误码，默认沿用系统规则。</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {(isAntigravityOAuthWizard || isAntigravityUpstreamWizard) && (
              <div className="space-y-4 rounded-3xl border border-violet-200 bg-violet-50/50 p-5 dark:border-violet-900/40 dark:bg-violet-950/20">
                <div>
                  <div className="text-base font-semibold text-gray-900 dark:text-white">Antigravity 配置</div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    按 Vue 原表单迁移：支持 `OAuth` 和 `API Key` 两种方式，模型限制固定为映射模式，并保留默认映射与快捷预设。
                  </p>
                </div>

                {isAntigravityUpstreamWizard && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                      <FieldLabel>Base URL</FieldLabel>
                      <input
                        value={wizardForm.apiKeyBaseUrl}
                        onChange={(e) => setWizardForm((prev) => ({ ...prev, apiKeyBaseUrl: e.target.value }))}
                        placeholder={ANTIGRAVITY_DEFAULT_BASE_URL}
                        className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                      />
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">留空时默认使用 Antigravity 官方上游地址。</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                      <FieldLabel>API Key</FieldLabel>
                      <input
                        type="password"
                        value={wizardForm.apiKeyValue}
                        onChange={(e) => setWizardForm((prev) => ({ ...prev, apiKeyValue: e.target.value }))}
                        placeholder="sk-..."
                        className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 font-mono text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                      />
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">模型映射</div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Antigravity 只支持映射模式，不支持白名单；支持通配符预设和默认映射回填。
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleApplyAntigravityDefaultMappings}
                        disabled={antigravityDefaultsLoading || antigravityDefaultMappings.length === 0}
                        className="rounded-2xl border border-gray-200 px-3 py-2 text-xs text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        {antigravityDefaultsLoading ? '加载默认映射中' : '恢复默认映射'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, modelMappings: [] }))}
                        className="rounded-2xl border border-red-200 px-3 py-2 text-xs text-red-600 transition hover:bg-red-50 dark:border-red-900/30 dark:text-red-300 dark:hover:bg-red-950/30"
                      >
                        清空映射
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-xs text-violet-700 dark:border-violet-900/30 dark:bg-violet-950/20 dark:text-violet-300">
                    官方支持模型：{ANTIGRAVITY_MODELS.join(' / ')}
                  </div>

                  <div className="mt-4 space-y-3">
                    {wizardForm.modelMappings.length > 0 ? (
                      <div className="space-y-2">
                        {wizardForm.modelMappings.map((mapping, index) => (
                          <div
                            key={`antigravity-mapping-${index}-${mapping.from}-${mapping.to}`}
                            className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto]"
                          >
                            <input
                              value={mapping.from}
                              onChange={(e) => handleChangeModelMapping(index, 'from', e.target.value)}
                              placeholder="请求模型，例如 claude-*"
                              className="rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                            />
                            <div className="flex items-center justify-center text-sm text-gray-400">{'->'}</div>
                            <input
                              value={mapping.to}
                              onChange={(e) => handleChangeModelMapping(index, 'to', e.target.value)}
                              placeholder="实际模型，例如 claude-sonnet-4-5"
                              className="rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveModelMapping(index)}
                              className="rounded-xl border border-red-200 px-3 py-3 text-xs text-red-600 transition hover:bg-red-50 dark:border-red-900/30 dark:text-red-300 dark:hover:bg-red-950/30"
                            >
                              删除
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                        还没有映射规则，可以先恢复默认映射，或点击下面的快捷预设。
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleAddModelMapping()}
                      className="w-full rounded-2xl border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      + 添加映射
                    </button>

                    <div className="flex flex-wrap gap-2">
                      {ANTIGRAVITY_PRESET_MAPPINGS.map((preset) => (
                        <button
                          key={`antigravity-preset-${preset.label}`}
                          type="button"
                          onClick={() => handleAddModelMapping({ from: preset.from, to: preset.to })}
                          className={`rounded-2xl border px-3 py-2 text-xs transition ${preset.color}`}
                        >
                          + {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">Mixed Scheduling</div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          开启后允许 Antigravity 参与混合调度，兼容 `/v1/messages` 之类的统一入口。
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setWizardForm((prev) => ({
                            ...prev,
                            antigravityMixedScheduling: !prev.antigravityMixedScheduling,
                          }))
                        }
                        className={`relative inline-flex h-7 w-12 rounded-full transition ${
                          wizardForm.antigravityMixedScheduling ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                            wizardForm.antigravityMixedScheduling ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">Allow Overages</div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          开启后允许透支 AI Credits，对应后端 `allow_overages` 开关。
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setWizardForm((prev) => ({
                            ...prev,
                            antigravityAllowOverages: !prev.antigravityAllowOverages,
                          }))
                        }
                        className={`relative inline-flex h-7 w-12 rounded-full transition ${
                          wizardForm.antigravityAllowOverages ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                            wizardForm.antigravityAllowOverages ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isOpenAIOAuthWizard && (
              <div className="space-y-4 rounded-3xl border border-emerald-200 bg-emerald-50/40 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <div>
                  <div className="text-base font-semibold text-gray-900 dark:text-white">OpenAI OAuth 配置</div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">先配置模型限制和 OpenAI 专属控制项，再进入下一步完成 ChatGPT OAuth 授权。</p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">模型限制（可选）</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, modelRestrictionMode: 'whitelist' }))}
                        disabled={wizardForm.openaiPassthroughEnabled}
                        className={`rounded-2xl px-4 py-2.5 text-sm transition ${
                          wizardForm.modelRestrictionMode === 'whitelist'
                            ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        模型白名单
                      </button>
                      <button
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, modelRestrictionMode: 'mapping' }))}
                        disabled={wizardForm.openaiPassthroughEnabled}
                        className={`rounded-2xl px-4 py-2.5 text-sm transition ${
                          wizardForm.modelRestrictionMode === 'mapping'
                            ? 'border border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-300'
                            : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        模型映射
                      </button>
                    </div>
                  </div>

                  {wizardForm.openaiPassthroughEnabled ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
                      已开启自动透传（仅替换认证），模型白名单和模型映射会自动停用。
                    </div>
                  ) : wizardForm.modelRestrictionMode === 'whitelist' ? (
                    <div className="mt-4 space-y-4">
                      <div className="rounded-2xl border border-gray-200 dark:border-gray-800">
                        {openAISelectedModelsExpanded && (
                          <div className="grid gap-2 border-b border-gray-100 p-4 md:grid-cols-2 dark:border-gray-800">
                            {wizardForm.allowedModels.map((model) => (
                              <div key={`oauth-selected-${model}`} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm dark:bg-[#0f0f0f]">
                                <span className="truncate text-gray-700 dark:text-gray-300">{model}</span>
                                <button type="button" onClick={() => handleToggleOpenAIAllowedModel(model)} className="text-gray-500 transition hover:text-red-500">
                                  x
                                </button>
                              </div>
                            ))}
                            {wizardForm.allowedModels.length === 0 && (
                              <div className="col-span-full rounded-2xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                当前还没有选中模型
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex items-center justify-between px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          <span>{wizardForm.allowedModels.length} 个模型</span>
                          <button
                            type="button"
                            onClick={() => setOpenAISelectedModelsExpanded((prev) => !prev)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-gray-100 dark:hover:bg-gray-800"
                          >
                            <ChevronDown className={`h-4 w-4 transition ${openAISelectedModelsExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleSelectAllOpenAIModels}
                          className="rounded-2xl border border-blue-200 px-4 py-2.5 text-sm text-blue-600 transition hover:bg-blue-50 dark:border-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-950/30"
                        >
                          填入相关模型
                        </button>
                        <button
                          type="button"
                          onClick={handleClearAllowedModels}
                          className="rounded-2xl border border-red-200 px-4 py-2.5 text-sm text-red-600 transition hover:bg-red-50 dark:border-red-900/30 dark:text-red-300 dark:hover:bg-red-950/30"
                        >
                          清除所有模型
                        </button>
                      </div>

                      <div>
                        <FieldLabel>自定义模型名称</FieldLabel>
                        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                          <input
                            value={wizardForm.openaiCustomModelName}
                            onChange={(e) => setWizardForm((prev) => ({ ...prev, openaiCustomModelName: e.target.value }))}
                            placeholder="输入自定义模型名称"
                            className="rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={handleAddOpenAICustomModel}
                            className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-600"
                          >
                            填入
                          </button>
                        </div>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">已选择 {wizardForm.allowedModels.length} 个模型</p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <button
                        type="button"
                        onClick={() => handleAddModelMapping()}
                        className="rounded-2xl border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        + 添加映射
                      </button>
                      <div className="flex flex-wrap gap-2">
                        {OPENAI_PRESET_MAPPINGS.map((preset) => (
                          <button
                            key={`oauth-preset-${preset.from}`}
                            type="button"
                            onClick={() => handleAddModelMapping({ from: preset.from, to: preset.to })}
                            className="rounded-2xl border border-gray-200 px-3 py-2 text-xs text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            + {preset.label}
                          </button>
                        ))}
                      </div>
                      {wizardForm.modelMappings.map((mapping, index) => (
                        <div key={`oauth-mapping-${index}`} className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto]">
                          <input
                            value={mapping.from}
                            onChange={(e) => handleChangeModelMapping(index, 'from', e.target.value)}
                            placeholder="请求模型"
                            className="rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                          <div className="flex items-center justify-center text-sm text-gray-400">{'->'}</div>
                          <input
                            value={mapping.to}
                            onChange={(e) => handleChangeModelMapping(index, 'to', e.target.value)}
                            placeholder="实际模型"
                            className="rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveModelMapping(index)}
                            className="rounded-xl border border-red-200 px-3 py-3 text-xs text-red-600 transition hover:bg-red-50 dark:border-red-900/30 dark:text-red-300 dark:hover:bg-red-950/30"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {isOpenAIApiKeyWizard && (
              <div className="space-y-4 rounded-3xl border border-emerald-200 bg-emerald-50/40 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <div>
                  <div className="text-base font-semibold text-gray-900 dark:text-white">OpenAI API Key 配置</div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">沿用当前统一布局，当前页直接填写 Base URL、API Key 和模型限制后创建。</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                    <FieldLabel>Base URL</FieldLabel>
                    <input
                      value={wizardForm.apiKeyBaseUrl}
                      onChange={(e) => setWizardForm((prev) => ({ ...prev, apiKeyBaseUrl: e.target.value }))}
                      placeholder="https://api.openai.com"
                      className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                    />
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                    <FieldLabel>API Key</FieldLabel>
                    <input
                      type="password"
                      value={wizardForm.apiKeyValue}
                      onChange={(e) => setWizardForm((prev) => ({ ...prev, apiKeyValue: e.target.value }))}
                      placeholder="sk-..."
                      className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 font-mono text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">模型限制（可选）</div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">OpenAI 自动透传开启时，这块会自动停用。</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, modelRestrictionMode: 'whitelist' }))}
                        disabled={wizardForm.openaiPassthroughEnabled}
                        className={`rounded-2xl px-4 py-2.5 text-sm transition ${
                          wizardForm.modelRestrictionMode === 'whitelist'
                            ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        模型白名单
                      </button>
                      <button
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, modelRestrictionMode: 'mapping' }))}
                        disabled={wizardForm.openaiPassthroughEnabled}
                        className={`rounded-2xl px-4 py-2.5 text-sm transition ${
                          wizardForm.modelRestrictionMode === 'mapping'
                            ? 'border border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-300'
                            : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        模型映射
                      </button>
                    </div>
                  </div>

                  {wizardForm.openaiPassthroughEnabled ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
                      已开启 OpenAI 自动透传，模型白名单和模型映射会自动停用。
                    </div>
                  ) : wizardForm.modelRestrictionMode === 'whitelist' ? (
                    <div className="mt-4 space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setOpenAIModelPickerOpen((prev) => !prev)}
                          className={`rounded-2xl border px-4 py-2.5 text-sm transition ${
                            openAIModelPickerOpen
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                              : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                          }`}
                        >
                          {openAIModelPickerOpen ? '收起模型选择' : '点开选择模型'}
                        </button>
                        <button
                          type="button"
                          onClick={handleSelectAllOpenAIModels}
                          className="rounded-2xl border border-gray-200 px-3 py-2 text-xs text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          填入相关模型
                        </button>
                        <button
                          type="button"
                          onClick={handleClearAllowedModels}
                          className="rounded-2xl border border-red-200 px-3 py-2 text-xs text-red-600 transition hover:bg-red-50 dark:border-red-900/30 dark:text-red-300 dark:hover:bg-red-950/30"
                        >
                          清除所有模型
                        </button>
                        <span className="text-xs text-gray-500 dark:text-gray-400">已选 {wizardForm.allowedModels.length} 个</span>
                      </div>

                      {openAIModelPickerOpen && (
                        <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                              value={openAIModelSearch}
                              onChange={(e) => setOpenAIModelSearch(e.target.value)}
                              placeholder="搜索 OpenAI 模型"
                              className="w-full rounded-2xl border border-gray-200 bg-transparent py-3 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                            />
                          </div>
                          <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
                            {filteredOpenAIModels.map((model) => (
                              <label
                                key={`openai-picker-${model}`}
                                className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-sm transition ${
                                  wizardForm.allowedModels.includes(model)
                                    ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                                    : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={wizardForm.allowedModels.includes(model)}
                                  onChange={() => handleToggleOpenAIAllowedModel(model)}
                                />
                                <span className="truncate text-gray-700 dark:text-gray-300">{model}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <button
                        type="button"
                        onClick={() => handleAddModelMapping()}
                        className="rounded-2xl border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        + 添加映射
                      </button>
                      <div className="flex flex-wrap gap-2">
                        {OPENAI_PRESET_MAPPINGS.map((preset) => (
                          <button
                            key={`openai-preset-${preset.from}`}
                            type="button"
                            onClick={() => handleAddModelMapping({ from: preset.from, to: preset.to })}
                            className="rounded-2xl border border-gray-200 px-3 py-2 text-xs text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            + {preset.label}
                          </button>
                        ))}
                      </div>
                      {wizardForm.modelMappings.map((mapping, index) => (
                        <div key={`openai-mapping-${index}`} className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto]">
                          <input
                            value={mapping.from}
                            onChange={(e) => handleChangeModelMapping(index, 'from', e.target.value)}
                            placeholder="请求模型"
                            className="rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                          <div className="flex items-center justify-center text-sm text-gray-400">{'->'}</div>
                          <input
                            value={mapping.to}
                            onChange={(e) => handleChangeModelMapping(index, 'to', e.target.value)}
                            placeholder="实际模型"
                            className="rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveModelMapping(index)}
                            className="rounded-xl border border-red-200 px-3 py-3 text-xs text-red-600 transition hover:bg-red-50 dark:border-red-900/30 dark:text-red-300 dark:hover:bg-red-950/30"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">池模式</div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">启用后请求失败时切换池内其他账号重试。</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, poolModeEnabled: !prev.poolModeEnabled }))}
                        className={`relative inline-flex h-7 w-12 rounded-full transition ${
                          wizardForm.poolModeEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                            wizardForm.poolModeEnabled ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>
                    </div>
                    {wizardForm.poolModeEnabled && (
                      <div className="mt-4">
                        <FieldLabel>重试次数</FieldLabel>
                        <input
                          type="number"
                          min="0"
                          max={MAX_POOL_MODE_RETRY_COUNT}
                          step="1"
                          value={wizardForm.poolModeRetryCount}
                          onChange={(e) => setWizardForm((prev) => ({ ...prev, poolModeRetryCount: e.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                        />
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">配额限制</div>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">总额度、日额度、周额度。</p>
                    </div>
                    <div className="mt-4 grid gap-4">
                      <div>
                        <FieldLabel>日额度（USD）</FieldLabel>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={wizardForm.quotaDailyLimit}
                          onChange={(e) => setWizardForm((prev) => ({ ...prev, quotaDailyLimit: e.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                        />
                      </div>
                      <div>
                        <FieldLabel>周额度（USD）</FieldLabel>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={wizardForm.quotaWeeklyLimit}
                          onChange={(e) => setWizardForm((prev) => ({ ...prev, quotaWeeklyLimit: e.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                        />
                      </div>
                      <div>
                        <FieldLabel>总额度（USD）</FieldLabel>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={wizardForm.quotaTotalLimit}
                          onChange={(e) => setWizardForm((prev) => ({ ...prev, quotaTotalLimit: e.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">自定义错误码</div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">命中后按账号自定义错误码规则处理。</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWizardForm((prev) => ({ ...prev, customErrorCodesEnabled: !prev.customErrorCodesEnabled }))}
                      className={`relative inline-flex h-7 w-12 rounded-full transition ${
                        wizardForm.customErrorCodesEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                          wizardForm.customErrorCodesEnabled ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                  {wizardForm.customErrorCodesEnabled && (
                    <div className="mt-4 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {COMMON_ERROR_CODES.map((item) => {
                          const active = wizardForm.selectedErrorCodes.includes(item.value);
                          return (
                            <button
                              key={`openai-error-${item.value}`}
                              type="button"
                              onClick={() => handleToggleErrorCode(item.value)}
                              className={`rounded-2xl px-3 py-1.5 text-xs font-medium transition ${
                                active
                                  ? 'bg-red-100 text-red-700 ring-1 ring-red-400 dark:bg-red-900/30 dark:text-red-300'
                                  : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                              }`}
                            >
                              {item.value} {item.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                        <input
                          type="number"
                          min="100"
                          max="599"
                          value={wizardForm.customErrorCodeInput}
                          onChange={(e) => setWizardForm((prev) => ({ ...prev, customErrorCodeInput: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomErrorCode();
                            }
                          }}
                          placeholder="输入错误码"
                          className="rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomErrorCode}
                          className="rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          添加
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {isBedrockWizard && (
              <div className="space-y-4 rounded-3xl border border-amber-200 bg-amber-50/40 p-5 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div>
                  <div className="text-base font-semibold text-gray-900 dark:text-white">AWS Bedrock 配置</div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">按你截图的布局，当前页直接填写认证方式、区域、模型限制和配额后创建。</p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                  <FieldLabel>认证方式</FieldLabel>
                  <div className="flex flex-wrap gap-6">
                    {[
                      { value: 'sigv4' as const, label: 'SigV4 签名' },
                      { value: 'apikey' as const, label: 'Bedrock API Key' },
                    ].map((option) => (
                      <label key={option.value} className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                        <input
                          type="radio"
                          name="bedrock-auth-method"
                          checked={wizardForm.authMethod === option.value}
                          onChange={() => setWizardForm((prev) => ({ ...prev, authMethod: option.value }))}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>

                {wizardForm.authMethod === 'sigv4' ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                      <FieldLabel>AWS Access Key ID</FieldLabel>
                      <input
                        value={wizardForm.bedrockAccessKeyId}
                        onChange={(e) => setWizardForm((prev) => ({ ...prev, bedrockAccessKeyId: e.target.value }))}
                        placeholder="AKIA..."
                        className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 font-mono text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                      />
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                      <FieldLabel>AWS Secret Access Key</FieldLabel>
                      <input
                        type="password"
                        value={wizardForm.bedrockSecretAccessKey}
                        onChange={(e) => setWizardForm((prev) => ({ ...prev, bedrockSecretAccessKey: e.target.value }))}
                        className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 font-mono text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                      />
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                      <FieldLabel>AWS Session Token</FieldLabel>
                      <input
                        type="password"
                        value={wizardForm.bedrockSessionToken}
                        onChange={(e) => setWizardForm((prev) => ({ ...prev, bedrockSessionToken: e.target.value }))}
                        className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 font-mono text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                      />
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">可选，用于临时凭证。</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                    <FieldLabel>Bedrock API Key</FieldLabel>
                    <input
                      type="password"
                      value={wizardForm.bedrockApiKeyValue}
                      onChange={(e) => setWizardForm((prev) => ({ ...prev, bedrockApiKeyValue: e.target.value }))}
                      className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 font-mono text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                    />
                  </div>
                )}

                <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                  <FieldLabel>AWS Region</FieldLabel>
                  <select
                    value={wizardForm.bedrockRegion}
                    onChange={(e) => setWizardForm((prev) => ({ ...prev, bedrockRegion: e.target.value }))}
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                  >
                    {BEDROCK_REGIONS.map((region) => (
                      <option key={region.value} value={region.value}>
                        {region.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">例如 `us-east-1`、`us-west-2`、`eu-west-1`。</p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={wizardForm.bedrockForceGlobal}
                      onChange={(e) => setWizardForm((prev) => ({ ...prev, bedrockForceGlobal: e.target.checked }))}
                      className="mt-1"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      <span className="block font-medium text-gray-900 dark:text-white">强制使用 Global 跨区域推理</span>
                      <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                        启用后模型 ID 使用 `global.` 前缀时，请求可路由到全球任意支持区域，获得更高可用性。
                      </span>
                    </span>
                  </label>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">模型限制（可选）</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, modelRestrictionMode: 'whitelist' }))}
                        className={`rounded-2xl px-4 py-2.5 text-sm transition ${
                          wizardForm.modelRestrictionMode === 'whitelist'
                            ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                        }`}
                      >
                        模型白名单
                      </button>
                      <button
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, modelRestrictionMode: 'mapping' }))}
                        className={`rounded-2xl px-4 py-2.5 text-sm transition ${
                          wizardForm.modelRestrictionMode === 'mapping'
                            ? 'border border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-300'
                            : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                        }`}
                      >
                        模型映射
                      </button>
                    </div>
                  </div>

                  {wizardForm.modelRestrictionMode === 'whitelist' ? (
                    <div className="mt-4 space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setClaudeModelPickerOpen((prev) => !prev)}
                          className={`rounded-2xl border px-4 py-2.5 text-sm transition ${
                            claudeModelPickerOpen
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                              : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                          }`}
                        >
                          {claudeModelPickerOpen ? '收起模型选择' : '点开选择模型'}
                        </button>
                        <button
                          type="button"
                          onClick={handleSelectAllAllowedModels}
                          className="rounded-2xl border border-gray-200 px-3 py-2 text-xs text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          填入相关模型
                        </button>
                        <button
                          type="button"
                          onClick={handleClearAllowedModels}
                          className="rounded-2xl border border-red-200 px-3 py-2 text-xs text-red-600 transition hover:bg-red-50 dark:border-red-900/30 dark:text-red-300 dark:hover:bg-red-950/30"
                        >
                          清除所有模型
                        </button>
                      </div>

                      {claudeModelPickerOpen && (
                        <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                          <div className="grid gap-2 md:grid-cols-2">
                            {CLAUDE_MODELS.map((model) => (
                              <label
                                key={`bedrock-picker-${model}`}
                                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                                  wizardForm.allowedModels.includes(model)
                                    ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                                    : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                                }`}
                              >
                                <span className="truncate text-gray-700 dark:text-gray-300">{model}</span>
                                <button type="button" onClick={() => handleToggleAllowedModel(model)} className="text-gray-500">
                                  {wizardForm.allowedModels.includes(model) ? 'x' : '+'}
                                </button>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <button
                        type="button"
                        onClick={() => handleAddModelMapping()}
                        className="rounded-2xl border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        + 添加映射
                      </button>
                      <div className="flex flex-wrap gap-2">
                        {BEDROCK_PRESET_MAPPINGS.map((preset) => (
                          <button
                            key={`bedrock-preset-${preset.from}`}
                            type="button"
                            onClick={() => handleAddModelMapping({ from: preset.from, to: preset.to })}
                            className="rounded-2xl border border-gray-200 px-3 py-2 text-xs text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            + {preset.label}
                          </button>
                        ))}
                      </div>
                      {wizardForm.modelMappings.map((mapping, index) => (
                        <div key={`bedrock-mapping-${index}`} className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto]">
                          <input
                            value={mapping.from}
                            onChange={(e) => handleChangeModelMapping(index, 'from', e.target.value)}
                            placeholder="from model"
                            className="rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                          <div className="flex items-center justify-center text-sm text-gray-400">{'->'}</div>
                          <input
                            value={mapping.to}
                            onChange={(e) => handleChangeModelMapping(index, 'to', e.target.value)}
                            placeholder="to model"
                            className="rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveModelMapping(index)}
                            className="rounded-xl border border-red-200 px-3 py-3 text-xs text-red-600 transition hover:bg-red-50 dark:border-red-900/30 dark:text-red-300 dark:hover:bg-red-950/30"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">池模式</div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">启用后请求失败时切换池内其他账号重试。</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, poolModeEnabled: !prev.poolModeEnabled }))}
                        className={`relative inline-flex h-7 w-12 rounded-full transition ${
                          wizardForm.poolModeEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                            wizardForm.poolModeEnabled ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>
                    </div>
                    {wizardForm.poolModeEnabled && (
                      <div className="mt-4">
                        <FieldLabel>重试次数</FieldLabel>
                        <input
                          type="number"
                          min="0"
                          max={MAX_POOL_MODE_RETRY_COUNT}
                          step="1"
                          value={wizardForm.poolModeRetryCount}
                          onChange={(e) => setWizardForm((prev) => ({ ...prev, poolModeRetryCount: e.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                        />
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">配额限制</div>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">先补总额度、日额度、周额度，和 Claude Console 保持同类布局。</p>
                    </div>
                    <div className="mt-4 grid gap-4">
                      <div>
                        <FieldLabel>日额度（USD）</FieldLabel>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={wizardForm.quotaDailyLimit}
                          onChange={(e) => setWizardForm((prev) => ({ ...prev, quotaDailyLimit: e.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                        />
                      </div>
                      <div>
                        <FieldLabel>周额度（USD）</FieldLabel>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={wizardForm.quotaWeeklyLimit}
                          onChange={(e) => setWizardForm((prev) => ({ ...prev, quotaWeeklyLimit: e.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                        />
                      </div>
                      <div>
                        <FieldLabel>总额度（USD）</FieldLabel>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={wizardForm.quotaTotalLimit}
                          onChange={(e) => setWizardForm((prev) => ({ ...prev, quotaTotalLimit: e.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isClaudeConsoleWizard && (
              <div className="space-y-4 rounded-3xl border border-purple-200 bg-purple-50/70 p-5 dark:border-purple-900/40 dark:bg-purple-950/20">
                <div>
                  <div className="text-base font-semibold text-gray-900 dark:text-white">Claude Console 配置</div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    按 Vue 原页面把 Claude Console 的 API Key 和高级控制项直接前置到当前页，选中后立刻可见。
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                      <FieldLabel>Base URL</FieldLabel>
                      <input
                        value={wizardForm.apiKeyBaseUrl}
                        onChange={(e) => setWizardForm((prev) => ({ ...prev, apiKeyBaseUrl: e.target.value }))}
                        placeholder="https://api.anthropic.com"
                        className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                      />
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                      <FieldLabel>API Key</FieldLabel>
                      <input
                        type="password"
                        value={wizardForm.apiKeyValue}
                        onChange={(e) => setWizardForm((prev) => ({ ...prev, apiKeyValue: e.target.value }))}
                        placeholder="sk-ant-..."
                        className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 font-mono text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">Anthropic API Key 自动透传</div>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">开启后更贴近原始 Claude Console API Key 行为。</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setWizardForm((prev) => ({ ...prev, anthropicPassthroughEnabled: !prev.anthropicPassthroughEnabled }))}
                          className={`relative inline-flex h-7 w-12 rounded-full transition ${
                            wizardForm.anthropicPassthroughEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        >
                          <span
                            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                              wizardForm.anthropicPassthroughEnabled ? 'left-6' : 'left-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                      <FieldLabel>Web Search Emulation</FieldLabel>
                      <select
                        value={wizardForm.webSearchEmulationMode}
                        onChange={(e) =>
                          setWizardForm((prev) => ({
                            ...prev,
                            webSearchEmulationMode: e.target.value as AccountWizardForm['webSearchEmulationMode'],
                          }))
                        }
                        className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                      >
                        <option value="default">default</option>
                        <option value="enabled">enabled</option>
                        <option value="disabled">disabled</option>
                      </select>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">模型限制（可选）</div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">按截图改成横向区域，白名单支持点开后搜索选择。</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setWizardForm((prev) => ({ ...prev, modelRestrictionMode: 'whitelist' }))}
                          className={`rounded-2xl px-4 py-2.5 text-sm transition ${
                            wizardForm.modelRestrictionMode === 'whitelist'
                              ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                              : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                          }`}
                        >
                          模型白名单
                        </button>
                        <button
                          type="button"
                          onClick={() => setWizardForm((prev) => ({ ...prev, modelRestrictionMode: 'mapping' }))}
                          className={`rounded-2xl px-4 py-2.5 text-sm transition ${
                            wizardForm.modelRestrictionMode === 'mapping'
                              ? 'border border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-300'
                              : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                          }`}
                        >
                          模型映射
                        </button>
                      </div>
                    </div>

                    {wizardForm.modelRestrictionMode === 'whitelist' ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setClaudeModelPickerOpen((prev) => !prev)}
                            className={`rounded-2xl border px-4 py-2.5 text-sm transition ${
                              claudeModelPickerOpen
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                                : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                            }`}
                          >
                            {claudeModelPickerOpen ? '收起模型选择' : '点开选择模型'}
                          </button>
                          <button
                            type="button"
                            onClick={handleSelectAllAllowedModels}
                            className="rounded-2xl border border-gray-200 px-3 py-2 text-xs text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            全选 18 个模型
                          </button>
                          <button
                            type="button"
                            onClick={handleClearAllowedModels}
                            className="rounded-2xl border border-gray-200 px-3 py-2 text-xs text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            清空
                          </button>
                          <span className="text-xs text-gray-500 dark:text-gray-400">已选 {wizardForm.allowedModels.length} 个</span>
                        </div>

                        {claudeModelPickerOpen && (
                          <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                            <div className="relative">
                              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                              <input
                                value={claudeModelSearch}
                                onChange={(e) => setClaudeModelSearch(e.target.value)}
                                placeholder="搜索 Claude 模型"
                                className="w-full rounded-2xl border border-gray-200 bg-transparent py-3 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                              />
                            </div>
                            <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
                              {filteredClaudeModels.map((model) => (
                                <label
                                  key={`picker-${model}`}
                                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-sm transition ${
                                    wizardForm.allowedModels.includes(model)
                                      ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                                      : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={wizardForm.allowedModels.includes(model)}
                                    onChange={() => handleToggleAllowedModel(model)}
                                  />
                                  <span className="truncate text-gray-700 dark:text-gray-300">{model}</span>
                                </label>
                              ))}
                              {filteredClaudeModels.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                  没有匹配到模型
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {wizardForm.allowedModels.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {wizardForm.allowedModels.slice(0, 8).map((model) => (
                              <span
                                key={`selected-${model}`}
                                className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                              >
                                {model}
                              </span>
                            ))}
                            {wizardForm.allowedModels.length > 8 && (
                              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                +{wizardForm.allowedModels.length - 8}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
                          <button
                            type="button"
                            onClick={() => handleAddModelMapping()}
                            className="rounded-2xl border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            新增映射
                          </button>
                          <div className="flex flex-wrap gap-2">
                            {CLAUDE_CONSOLE_PRESET_MAPPINGS.map((preset) => (
                              <button
                                key={`inline-${preset.label}`}
                                type="button"
                                onClick={() => handleAddModelMapping({ from: preset.from, to: preset.to })}
                                className="rounded-2xl border border-gray-200 px-3 py-2 text-xs text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                              >
                                + {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        {wizardForm.modelMappings.length > 0 ? (
                          <div className="space-y-2">
                            {wizardForm.modelMappings.map((mapping, index) => (
                              <div key={`inline-${index}-${mapping.from}-${mapping.to}`} className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto]">
                                <input
                                  value={mapping.from}
                                  onChange={(e) => handleChangeModelMapping(index, 'from', e.target.value)}
                                  placeholder="请求模型"
                                  className="rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                                />
                                <div className="flex items-center justify-center text-sm text-gray-400">{'->'}</div>
                                <input
                                  value={mapping.to}
                                  onChange={(e) => handleChangeModelMapping(index, 'to', e.target.value)}
                                  placeholder="实际模型"
                                  className="rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveModelMapping(index)}
                                  className="rounded-xl border border-red-200 px-3 py-3 text-xs text-red-600 transition hover:bg-red-50 dark:border-red-900/30 dark:text-red-300 dark:hover:bg-red-950/30"
                                >
                                  删除
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                            还没有映射规则，可以先手动新增，或点击上方预设。
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">池模式</div>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">启用后请求失败时切换池内其他账号重试。</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setWizardForm((prev) => ({ ...prev, poolModeEnabled: !prev.poolModeEnabled }))}
                          className={`relative inline-flex h-7 w-12 rounded-full transition ${
                            wizardForm.poolModeEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        >
                          <span
                            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                              wizardForm.poolModeEnabled ? 'left-6' : 'left-1'
                            }`}
                          />
                        </button>
                      </div>
                      {wizardForm.poolModeEnabled && (
                        <div className="mt-4">
                          <FieldLabel>重试次数</FieldLabel>
                          <input
                            type="number"
                            min="0"
                            max={MAX_POOL_MODE_RETRY_COUNT}
                            step="1"
                            value={wizardForm.poolModeRetryCount}
                            onChange={(e) => setWizardForm((prev) => ({ ...prev, poolModeRetryCount: e.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">配额限制</div>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">总额度、日额度、周额度。</p>
                      </div>
                      <div className="mt-4 grid gap-4">
                        <div>
                          <FieldLabel>总额度（USD）</FieldLabel>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={wizardForm.quotaTotalLimit}
                            onChange={(e) => setWizardForm((prev) => ({ ...prev, quotaTotalLimit: e.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                        </div>
                        <div>
                          <FieldLabel>日额度（USD）</FieldLabel>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={wizardForm.quotaDailyLimit}
                            onChange={(e) => setWizardForm((prev) => ({ ...prev, quotaDailyLimit: e.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                        </div>
                        <div>
                          <FieldLabel>周额度（USD）</FieldLabel>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={wizardForm.quotaWeeklyLimit}
                            onChange={(e) => setWizardForm((prev) => ({ ...prev, quotaWeeklyLimit: e.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#111111]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">自定义错误码</div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">命中后按账号自定义错误码规则处理。</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, customErrorCodesEnabled: !prev.customErrorCodesEnabled }))}
                        className={`relative inline-flex h-7 w-12 rounded-full transition ${
                          wizardForm.customErrorCodesEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                            wizardForm.customErrorCodesEnabled ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>
                    </div>
                    {wizardForm.customErrorCodesEnabled && (
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {COMMON_ERROR_CODES.map((item) => {
                            const active = wizardForm.selectedErrorCodes.includes(item.value);
                            return (
                              <button
                                key={`inline-error-${item.value}`}
                                type="button"
                                onClick={() => handleToggleErrorCode(item.value)}
                                className={`rounded-2xl px-3 py-1.5 text-xs font-medium transition ${
                                  active
                                    ? 'bg-red-100 text-red-700 ring-1 ring-red-400 dark:bg-red-900/30 dark:text-red-300'
                                    : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                                }`}
                              >
                                {item.value} {item.label}
                              </button>
                            );
                          })}
                        </div>
                        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                          <input
                            type="number"
                            min="100"
                            max="599"
                            value={wizardForm.customErrorCodeInput}
                            onChange={(e) => setWizardForm((prev) => ({ ...prev, customErrorCodeInput: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCustomErrorCode();
                              }
                            }}
                            placeholder="输入错误码"
                            className="rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={handleAddCustomErrorCode}
                            className="rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            添加
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {sortedSelectedErrorCodes.length > 0 ? (
                            sortedSelectedErrorCodes.map((code) => (
                              <span
                                key={`inline-selected-${code}`}
                                className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300"
                              >
                                {code}
                                <button type="button" onClick={() => handleRemoveErrorCode(code)} className="text-red-600 transition hover:text-red-800 dark:text-red-300 dark:hover:text-red-100">
                                  x
                                </button>
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-400">未选择错误码，默认沿用系统规则。</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-5 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-base font-medium text-gray-900 dark:text-white">临时不可调度</div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">当错误码与关键词同时匹配时，账号会在指定时间内被临时禁用。</div>
                </div>
                <button
                  type="button"
                  onClick={() => setWizardForm((prev) => ({ ...prev, tempUnschedulable: !prev.tempUnschedulable }))}
                  className={`relative inline-flex h-7 w-12 rounded-full transition ${
                    wizardForm.tempUnschedulable ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                      wizardForm.tempUnschedulable ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-base font-medium text-gray-900 dark:text-white">拦截预热请求</div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">启用后，标题生成等预热请求将返回 mock 响应，不消耗上游 token。</div>
                </div>
                <button
                  type="button"
                  onClick={() => setWizardForm((prev) => ({ ...prev, interceptWarmupRequests: !prev.interceptWarmupRequests }))}
                  className={`relative inline-flex h-7 w-12 rounded-full transition ${
                    wizardForm.interceptWarmupRequests ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                      wizardForm.interceptWarmupRequests ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {isClaudeCodeWizard && (
              <div className="space-y-4 rounded-3xl border border-orange-200 bg-orange-50/70 p-5 dark:border-orange-900/40 dark:bg-orange-950/20">
                <div>
                  <div className="text-base font-semibold text-gray-900 dark:text-white">Claude Code 专属控制项</div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    这一组字段直接对齐原 Vue 的 Anthropic OAuth / Setup Token 路径，提交时写入 `extra`。
                  </p>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#111111]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">5h 窗口费用控制</div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">限制 Claude Code 单账号 5 小时窗口成本，并预留粘性会话额度。</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, windowCostEnabled: !prev.windowCostEnabled }))}
                        className={`relative inline-flex h-7 w-12 rounded-full transition ${
                          wizardForm.windowCostEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                            wizardForm.windowCostEnabled ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>
                    </div>
                    {wizardForm.windowCostEnabled && (
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                          <FieldLabel>窗口上限（USD）</FieldLabel>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={wizardForm.windowCostLimit}
                            onChange={(e) => setWizardForm((prev) => ({ ...prev, windowCostLimit: e.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                        </div>
                        <div>
                          <FieldLabel>粘性预留（USD）</FieldLabel>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={wizardForm.windowCostStickyReserve}
                            onChange={(e) => setWizardForm((prev) => ({ ...prev, windowCostStickyReserve: e.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#111111]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">会话数量控制</div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">控制最大活跃会话数，并设置空闲会话释放时间。</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, sessionLimitEnabled: !prev.sessionLimitEnabled }))}
                        className={`relative inline-flex h-7 w-12 rounded-full transition ${
                          wizardForm.sessionLimitEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                            wizardForm.sessionLimitEnabled ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>
                    </div>
                    {wizardForm.sessionLimitEnabled && (
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                          <FieldLabel>最大会话数</FieldLabel>
                          <input
                            type="number"
                            min="1"
                            value={wizardForm.maxSessions}
                            onChange={(e) => setWizardForm((prev) => ({ ...prev, maxSessions: e.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                        </div>
                        <div>
                          <FieldLabel>空闲超时（分钟）</FieldLabel>
                          <input
                            type="number"
                            min="1"
                            value={wizardForm.sessionIdleTimeout}
                            onChange={(e) => setWizardForm((prev) => ({ ...prev, sessionIdleTimeout: e.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#111111]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">RPM 限制</div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">支持基础 RPM、粘性豁免策略和用户消息队列模式。</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWizardForm((prev) => ({ ...prev, rpmLimitEnabled: !prev.rpmLimitEnabled }))}
                      className={`relative inline-flex h-7 w-12 rounded-full transition ${
                        wizardForm.rpmLimitEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                          wizardForm.rpmLimitEnabled ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
                    <div>
                      <FieldLabel>基础 RPM</FieldLabel>
                      <input
                        type="number"
                        min="1"
                        value={wizardForm.baseRpm}
                        onChange={(e) => setWizardForm((prev) => ({ ...prev, baseRpm: e.target.value }))}
                        disabled={!wizardForm.rpmLimitEnabled}
                        className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:opacity-60 dark:border-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <FieldLabel>策略</FieldLabel>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!wizardForm.rpmLimitEnabled}
                          onClick={() => setWizardForm((prev) => ({ ...prev, rpmStrategy: 'tiered' }))}
                          className={`flex-1 rounded-2xl border px-3 py-3 text-sm transition ${
                            wizardForm.rpmStrategy === 'tiered'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                              : 'border-gray-200 text-gray-600 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300'
                          }`}
                        >
                          三区模型
                        </button>
                        <button
                          type="button"
                          disabled={!wizardForm.rpmLimitEnabled}
                          onClick={() => setWizardForm((prev) => ({ ...prev, rpmStrategy: 'sticky_exempt' }))}
                          className={`flex-1 rounded-2xl border px-3 py-3 text-sm transition ${
                            wizardForm.rpmStrategy === 'sticky_exempt'
                              ? 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300'
                              : 'border-gray-200 text-gray-600 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300'
                          }`}
                        >
                          粘性豁免
                        </button>
                      </div>
                    </div>
                    <div>
                      <FieldLabel>粘性缓冲</FieldLabel>
                      <input
                        type="number"
                        min="1"
                        value={wizardForm.rpmStickyBuffer}
                        onChange={(e) => setWizardForm((prev) => ({ ...prev, rpmStickyBuffer: e.target.value }))}
                        disabled={!wizardForm.rpmLimitEnabled || wizardForm.rpmStrategy !== 'tiered'}
                        className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:opacity-60 dark:border-gray-700 dark:text-white"
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <FieldLabel>用户消息队列</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: '', label: '关闭' },
                        { value: 'throttle', label: 'Throttle' },
                        { value: 'serialize', label: 'Serialize' },
                      ].map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => setWizardForm((prev) => ({ ...prev, userMsgQueueMode: option.value as AccountWizardForm['userMsgQueueMode'] }))}
                          className={`rounded-2xl border px-4 py-2 text-sm transition ${
                            wizardForm.userMsgQueueMode === option.value
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#111111]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">TLS 指纹伪装</div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">模拟官方客户端 TLS 指纹，可绑定具体模板。</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, tlsFingerprintEnabled: !prev.tlsFingerprintEnabled }))}
                        className={`relative inline-flex h-7 w-12 rounded-full transition ${
                          wizardForm.tlsFingerprintEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                            wizardForm.tlsFingerprintEnabled ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>
                    </div>
                    {wizardForm.tlsFingerprintEnabled && (
                      <div className="mt-4">
                        <FieldLabel>模板</FieldLabel>
                        <select
                          value={wizardForm.tlsFingerprintProfileId}
                          onChange={(e) => setWizardForm((prev) => ({ ...prev, tlsFingerprintProfileId: e.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                        >
                          <option value="">默认模板</option>
                          {tlsFingerprintProfiles.map((profile) => (
                            <option key={profile.id} value={String(profile.id)}>
                              {profile.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#111111]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">会话 ID 伪装</div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">固定 metadata.user_id 的 session 语义，降低多用户共享碰撞。</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, sessionIdMaskingEnabled: !prev.sessionIdMaskingEnabled }))}
                        className={`relative inline-flex h-7 w-12 rounded-full transition ${
                          wizardForm.sessionIdMaskingEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                            wizardForm.sessionIdMaskingEnabled ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#111111]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">缓存 TTL 强制替换</div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">把所有 cache creation tokens 计入目标 TTL 档位。</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, cacheTTLOverrideEnabled: !prev.cacheTTLOverrideEnabled }))}
                        className={`relative inline-flex h-7 w-12 rounded-full transition ${
                          wizardForm.cacheTTLOverrideEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                            wizardForm.cacheTTLOverrideEnabled ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>
                    </div>
                    {wizardForm.cacheTTLOverrideEnabled && (
                      <div className="mt-4">
                        <FieldLabel>目标 TTL</FieldLabel>
                        <select
                          value={wizardForm.cacheTTLOverrideTarget}
                          onChange={(e) => setWizardForm((prev) => ({ ...prev, cacheTTLOverrideTarget: e.target.value as '5m' | '1h' }))}
                          className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                        >
                          <option value="5m">5m</option>
                          <option value="1h">1h</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#111111]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">自定义转发地址</div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">把 Claude Code 请求中继到自定义上游地址。</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWizardForm((prev) => ({ ...prev, customBaseUrlEnabled: !prev.customBaseUrlEnabled }))}
                      className={`relative inline-flex h-7 w-12 rounded-full transition ${
                        wizardForm.customBaseUrlEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                          wizardForm.customBaseUrlEnabled ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                  {wizardForm.customBaseUrlEnabled && (
                    <div className="mt-4">
                      <FieldLabel>Base URL</FieldLabel>
                      <input
                        value={wizardForm.customBaseUrl}
                        onChange={(e) => setWizardForm((prev) => ({ ...prev, customBaseUrl: e.target.value }))}
                        placeholder="https://your-upstream.example.com"
                        className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                      />
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#111111]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">临时不可调度规则</div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        命中指定错误码和关键字后，自动将账号临时下线一段时间，按规则顺序依次匹配。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWizardForm((prev) => ({ ...prev, tempUnschedulable: !prev.tempUnschedulable }))}
                      className={`relative inline-flex h-7 w-12 rounded-full transition ${
                        wizardForm.tempUnschedulable ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                          wizardForm.tempUnschedulable ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                  {wizardForm.tempUnschedulable && (
                    <div className="mt-4 space-y-4">
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700 dark:border-blue-900/30 dark:bg-blue-950/20 dark:text-blue-300">
                        建议至少保留一条 `529/429/503` 规则，避免异常账号持续被调度击穿。
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {TEMP_UNSCHED_PRESETS.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => handleAddTempUnschedRule(preset.rule)}
                            className="rounded-2xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            + {preset.label}
                          </button>
                        ))}
                      </div>
                      {wizardForm.tempUnschedRules.length > 0 ? (
                        <div className="space-y-3">
                          {wizardForm.tempUnschedRules.map((rule, index) => (
                            <div key={`${index}-${rule.error_code}-${rule.description}`} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400">规则 #{index + 1}</div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={index === 0}
                                    onClick={() => handleMoveTempUnschedRule(index, -1)}
                                    className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                                  >
                                    上移
                                  </button>
                                  <button
                                    type="button"
                                    disabled={index === wizardForm.tempUnschedRules.length - 1}
                                    onClick={() => handleMoveTempUnschedRule(index, 1)}
                                    className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                                  >
                                    下移
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveTempUnschedRule(index)}
                                    className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 transition hover:bg-red-50 dark:border-red-900/30 dark:text-red-300 dark:hover:bg-red-950/30"
                                  >
                                    删除
                                  </button>
                                </div>
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                  <FieldLabel>错误码</FieldLabel>
                                  <input
                                    type="number"
                                    min="100"
                                    max="599"
                                    value={rule.error_code}
                                    onChange={(e) => handleChangeTempUnschedRule(index, 'error_code', e.target.value)}
                                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                                  />
                                </div>
                                <div>
                                  <FieldLabel>下线时长（分钟）</FieldLabel>
                                  <input
                                    type="number"
                                    min="1"
                                    value={rule.duration_minutes}
                                    onChange={(e) => handleChangeTempUnschedRule(index, 'duration_minutes', e.target.value)}
                                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                                  />
                                </div>
                                <div className="md:col-span-2">
                                  <FieldLabel>关键字</FieldLabel>
                                  <input
                                    value={rule.keywords}
                                    onChange={(e) => handleChangeTempUnschedRule(index, 'keywords', e.target.value)}
                                    placeholder="多个关键字用逗号或分号分隔"
                                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                                  />
                                </div>
                                <div className="md:col-span-2">
                                  <FieldLabel>说明</FieldLabel>
                                  <input
                                    value={rule.description}
                                    onChange={(e) => handleChangeTempUnschedRule(index, 'description', e.target.value)}
                                    placeholder="例如：Claude overload fallback"
                                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          还没有规则，先从上面的预设添加，或手动新增一条。
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleAddTempUnschedRule()}
                        className="w-full rounded-2xl border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        新增规则
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <FieldLabel>代理</FieldLabel>
                <select
                  value={wizardForm.proxyId}
                  onChange={(e) => setWizardForm((prev) => ({ ...prev, proxyId: e.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                >
                  <option value="">无代理</option>
                  {proxies.map((proxy) => (
                    <option key={proxy.id} value={String(proxy.id)}>
                      {proxy.name} ({proxy.protocol || 'proxy'}://{proxy.host}:{proxy.port}
                      {typeof proxy.account_count === 'number' ? ` / 账号${proxy.account_count}` : ''})
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  使用真实 `/admin/proxies/all` 列表，优先显示可直接绑定的代理节点。
                </p>
              </div>
              <div>
                <FieldLabel>并发数</FieldLabel>
                <input
                  type="number"
                  min="1"
                  value={wizardForm.concurrency}
                  onChange={(e) => setWizardForm((prev) => ({ ...prev, concurrency: e.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
              </div>
              <div>
                <FieldLabel>负载因子</FieldLabel>
                <input
                  type="number"
                  min="0"
                  value={wizardForm.loadFactor}
                  onChange={(e) => setWizardForm((prev) => ({ ...prev, loadFactor: e.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">提高负载因子可以提高对账号的调度频率</p>
              </div>
              <div>
                <FieldLabel>优先级</FieldLabel>
                <input
                  type="number"
                  value={wizardForm.priority}
                  onChange={(e) => setWizardForm((prev) => ({ ...prev, priority: e.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">优先级越小的账号优先使用</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>账号计费倍率</FieldLabel>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={wizardForm.rateMultiplier}
                  onChange={(e) => setWizardForm((prev) => ({ ...prev, rateMultiplier: e.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">0 表示不计费，仅影响账号计费</p>
              </div>
              <div>
                <FieldLabel>过期时间</FieldLabel>
                <input
                  type="datetime-local"
                  value={wizardForm.expiresAt}
                  onChange={(e) => setWizardForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">留空表示不过期</p>
              </div>
            </div>

            {wizardForm.platform === 'openai' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-base font-medium text-gray-900 dark:text-white">自动透传（仅替换认证）</div>
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        开启后，该 OpenAI 账号将自动透传请求与响应，仅替换认证并保留计费/并发/审计及必要安全过滤。
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWizardForm((prev) => ({ ...prev, openaiPassthroughEnabled: !prev.openaiPassthroughEnabled }))}
                      className={`relative inline-flex h-7 w-12 rounded-full transition ${
                        wizardForm.openaiPassthroughEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                          wizardForm.openaiPassthroughEnabled ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className={`grid gap-4 ${isOpenAIOAuthWizard ? 'md:grid-cols-2' : ''}`}>
                  <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-base font-medium text-gray-900 dark:text-white">WS mode</div>
                        <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          仅对当前 OpenAI 账号类型生效。启用 WS mode 后，该账户并发数将作为该账号 WS 连接池上限。
                        </div>
                      </div>
                      <div className="min-w-56">
                        <select
                          value={wizardForm.openaiResponsesWebSocketMode}
                          onChange={(e) =>
                            setWizardForm((prev) => ({
                              ...prev,
                              openaiResponsesWebSocketMode: e.target.value as AccountWizardForm['openaiResponsesWebSocketMode'],
                            }))
                          }
                          className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                        >
                          {OPENAI_WS_MODE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {isOpenAIOAuthWizard && (
                    <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-base font-medium text-gray-900 dark:text-white">仅允许 Codex 官方客户端</div>
                          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            仅对 OpenAI OAuth 生效。开启后仅允许 Codex 官方客户端家族访问；关闭后完全绕过并保持原逻辑。
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setWizardForm((prev) => ({ ...prev, openaiCodexCliOnly: !prev.openaiCodexCliOnly }))}
                          className={`relative inline-flex h-7 w-12 rounded-full transition ${
                            wizardForm.openaiCodexCliOnly ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        >
                          <span
                            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                              wizardForm.openaiCodexCliOnly ? 'left-6' : 'left-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-base font-medium text-gray-900 dark:text-white">过期自动暂停调度</div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">启用后，账号过期将自动暂停调度。</div>
                </div>
                <button
                  type="button"
                  onClick={() => setWizardForm((prev) => ({ ...prev, autoPauseOnExpired: !prev.autoPauseOnExpired }))}
                  className={`relative inline-flex h-7 w-12 rounded-full transition ${
                    wizardForm.autoPauseOnExpired ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                      wizardForm.autoPauseOnExpired ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
              <div className="mb-4 text-base font-medium text-gray-900 dark:text-white">
                分组（已选 {wizardForm.groupIds.length} 个）
              </div>
              {currentPlatformGroups.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">当前平台暂无可绑定分组</div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {currentPlatformGroups.map((group) => (
                    <label
                      key={group.id}
                      className={`flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3 text-sm transition ${
                        wizardForm.groupIds.includes(group.id)
                          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                          : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={wizardForm.groupIds.includes(group.id)}
                          onChange={() => handleToggleGroup(group.id)}
                        />
                        <span className="font-medium text-gray-900 dark:text-white">{group.name}</span>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          {Number(group.rate_multiplier || 1).toFixed(1)}x
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : isClaudeCodeWizard ? (
          <div className="space-y-6 px-7 py-6">
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 dark:border-orange-900/30 dark:bg-orange-950/20">
              <div className="text-base font-medium text-orange-700 dark:text-orange-300">
                Anthropic / Claude Code / {wizardForm.authMethod === 'setup-token' ? 'Setup Token' : 'OAuth'}
              </div>
              <p className="mt-2 text-sm text-orange-700/90 dark:text-orange-300/90">
                这一步已经接入真实授权流程：先生成授权链接，再回填授权码，最后按 Vue 的 `credentials + extra` 结构创建账号。
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">1. 生成授权链接</div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {wizardForm.authMethod === 'setup-token'
                      ? '长期 Setup Token 授权会走专用回调端点，生成后的链接需要在浏览器完成授权。'
                      : 'OAuth 会使用后端已有的 Claude 授权端点，生成后可直接在浏览器打开。'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleOpenClaudeAuthUrl()}
                    disabled={wizardAuth.generating || wizardAuth.submitting}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {wizardAuth.generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    {wizardAuth.url ? '重新生成授权链接' : '生成授权链接'}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(wizardAuth.url, '_blank', 'noopener,noreferrer')}
                    disabled={!wizardAuth.url}
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                    打开授权页
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyAuthUrl()}
                    disabled={!wizardAuth.url}
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <Copy className="h-4 w-4" />
                    复制链接
                  </button>
                </div>
                <div>
                  <FieldLabel>授权链接</FieldLabel>
                  <textarea
                    rows={4}
                    readOnly
                    value={wizardAuth.url}
                    placeholder="点击上方按钮生成 Claude Code 授权链接"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-[#0f0f0f] dark:text-gray-300"
                  />
                </div>
                <div>
                  <FieldLabel>Session ID</FieldLabel>
                  <input
                    readOnly
                    value={wizardAuth.sessionId}
                    placeholder="生成授权链接后自动回填"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-[#0f0f0f] dark:text-gray-300"
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setWizardAuth((prev) => ({ ...prev, mode: 'code' }))}
                    className={`rounded-2xl border px-4 py-2 text-sm transition ${
                      wizardAuth.mode === 'code'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
                  >
                    授权码
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardAuth((prev) => ({ ...prev, mode: 'cookie' }))}
                    className={`rounded-2xl border px-4 py-2 text-sm transition ${
                      wizardAuth.mode === 'cookie'
                        ? 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
                  >
                    Session Key
                  </button>
                </div>

                {wizardAuth.mode === 'code' ? (
                  <div>
                    <FieldLabel>2. 回填授权码</FieldLabel>
                    <textarea
                      rows={6}
                      value={wizardAuth.codeInput}
                      onChange={(e) => setWizardAuth((prev) => ({ ...prev, codeInput: e.target.value }))}
                      placeholder="粘贴授权完成后拿到的 code，若复制了完整回调链接，这里也会自动解析 code 参数。"
                      className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                    />
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      如果回调页里拿到的是完整链接，也可以整段粘贴，页面会自动提取 `code`。
                    </p>
                  </div>
                ) : (
                  <div>
                    <FieldLabel>2. 直接输入 Session Key</FieldLabel>
                    <textarea
                      rows={6}
                      value={wizardAuth.sessionKeyInput}
                      onChange={(e) => setWizardAuth((prev) => ({ ...prev, sessionKeyInput: e.target.value }))}
                      placeholder="粘贴 Claude 的 sessionKey，支持直接走 cookie-auth / setup-token-cookie-auth。"
                      className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                    />
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      当前先支持单个 Session Key 创建；批量导入会在后续批量工具阶段继续补齐。
                    </p>
                  </div>
                )}

                <div className="rounded-2xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  <div>当前选择：{wizardForm.platform} / {wizardForm.accountType} / {wizardForm.authMethod}</div>
                  <div className="mt-1">已绑定分组：{wizardForm.groupIds.length} 个</div>
                  <div className="mt-1">预热拦截：{wizardForm.interceptWarmupRequests ? '开启' : '关闭'}</div>
                </div>
              </div>
            </div>
          </div>
        ) : isClaudeConsoleWizard ? (
          <div className="space-y-6 px-7 py-6">
            <div className="rounded-2xl border border-purple-200 bg-purple-50 p-5 dark:border-purple-900/30 dark:bg-purple-950/20">
              <div className="text-base font-medium text-purple-700 dark:text-purple-300">Anthropic / Claude Console / API Key</div>
              <p className="mt-2 text-sm text-purple-700/90 dark:text-purple-300/90">
                这里继续按 Vue 原表单补齐，可直接配置模型限制、模型映射、池模式、自定义错误码以及 Anthropic 专属开关。
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <div>
                  <FieldLabel>Base URL</FieldLabel>
                  <input
                    value={wizardForm.apiKeyBaseUrl}
                    onChange={(e) => setWizardForm((prev) => ({ ...prev, apiKeyBaseUrl: e.target.value }))}
                    placeholder="https://api.anthropic.com"
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                  />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">默认直连 Anthropic 官方接口，也可以替换成兼容中继地址。</p>
                </div>
                <div>
                  <FieldLabel>API Key</FieldLabel>
                  <input
                    type="password"
                    value={wizardForm.apiKeyValue}
                    onChange={(e) => setWizardForm((prev) => ({ ...prev, apiKeyValue: e.target.value }))}
                    placeholder="sk-ant-..."
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 font-mono text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                  />
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#111111]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">Anthropic API Key 自动透传</div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">开启后更贴近原始 Claude Console API Key 行为。</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWizardForm((prev) => ({ ...prev, anthropicPassthroughEnabled: !prev.anthropicPassthroughEnabled }))}
                      className={`relative inline-flex h-7 w-12 rounded-full transition ${
                        wizardForm.anthropicPassthroughEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                          wizardForm.anthropicPassthroughEnabled ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#111111]">
                  <FieldLabel>Web Search Emulation</FieldLabel>
                  <select
                    value={wizardForm.webSearchEmulationMode}
                    onChange={(e) =>
                      setWizardForm((prev) => ({
                        ...prev,
                        webSearchEmulationMode: e.target.value as AccountWizardForm['webSearchEmulationMode'],
                      }))
                    }
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                  >
                    <option value="default">default</option>
                    <option value="enabled">enabled</option>
                    <option value="disabled">disabled</option>
                  </select>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">与 Vue 一致，默认跟随全局配置，也可以按账号强制开关。</p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#111111]">
                  <div className="mb-3">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">模型限制（可选）</div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">支持白名单和模型映射两种模式，和 Vue 的 Claude Console 表单保持一致。</p>
                  </div>
                  <div className="mb-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setWizardForm((prev) => ({ ...prev, modelRestrictionMode: 'whitelist' }))}
                      className={`flex-1 rounded-2xl px-4 py-2.5 text-sm transition ${
                        wizardForm.modelRestrictionMode === 'whitelist'
                          ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                          : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                      }`}
                    >
                      模型白名单
                    </button>
                    <button
                      type="button"
                      onClick={() => setWizardForm((prev) => ({ ...prev, modelRestrictionMode: 'mapping' }))}
                      className={`flex-1 rounded-2xl px-4 py-2.5 text-sm transition ${
                        wizardForm.modelRestrictionMode === 'mapping'
                          ? 'border border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-300'
                          : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                      }`}
                    >
                      模型映射
                    </button>
                  </div>

                  {wizardForm.modelRestrictionMode === 'whitelist' ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleSelectAllAllowedModels}
                          className="rounded-2xl border border-gray-200 px-3 py-2 text-xs text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          全选 Claude 模型
                        </button>
                        <button
                          type="button"
                          onClick={handleClearAllowedModels}
                          className="rounded-2xl border border-gray-200 px-3 py-2 text-xs text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          清空限制
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {CLAUDE_MODELS.map((model) => {
                          const active = wizardForm.allowedModels.includes(model);
                          return (
                            <button
                              key={model}
                              type="button"
                              onClick={() => handleToggleAllowedModel(model)}
                              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                                active
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                                  : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                              }`}
                            >
                              {model}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        已选 {wizardForm.allowedModels.length} 个模型，空列表表示不限制。
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 text-xs text-purple-700 dark:border-purple-900/30 dark:bg-purple-950/20 dark:text-purple-300">
                        请求模型命中左侧时会被替换成右侧目标模型，适合做兼容别名或降级路由。
                      </div>
                      {wizardForm.modelMappings.length > 0 ? (
                        <div className="space-y-2">
                          {wizardForm.modelMappings.map((mapping, index) => (
                            <div key={`${index}-${mapping.from}-${mapping.to}`} className="flex items-center gap-2">
                              <input
                                value={mapping.from}
                                onChange={(e) => handleChangeModelMapping(index, 'from', e.target.value)}
                                placeholder="请求模型"
                                className="flex-1 rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                              />
                              <span className="text-sm text-gray-400">{'->'}</span>
                              <input
                                value={mapping.to}
                                onChange={(e) => handleChangeModelMapping(index, 'to', e.target.value)}
                                placeholder="实际模型"
                                className="flex-1 rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveModelMapping(index)}
                                className="rounded-xl border border-red-200 px-3 py-3 text-xs text-red-600 transition hover:bg-red-50 dark:border-red-900/30 dark:text-red-300 dark:hover:bg-red-950/30"
                              >
                                删除
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          还没有映射规则，可以先手动新增，或直接点击下面的预设快捷添加。
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleAddModelMapping()}
                        className="w-full rounded-2xl border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        新增映射
                      </button>
                      <div className="flex flex-wrap gap-2">
                        {CLAUDE_CONSOLE_PRESET_MAPPINGS.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => handleAddModelMapping({ from: preset.from, to: preset.to })}
                            className="rounded-2xl border border-gray-200 px-3 py-2 text-xs text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            + {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#111111]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">池模式</div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">启用后请求失败时会自动切换到池内其他账号重试。</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWizardForm((prev) => ({ ...prev, poolModeEnabled: !prev.poolModeEnabled }))}
                      className={`relative inline-flex h-7 w-12 rounded-full transition ${
                        wizardForm.poolModeEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                          wizardForm.poolModeEnabled ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                  {wizardForm.poolModeEnabled && (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700 dark:border-blue-900/30 dark:bg-blue-950/20 dark:text-blue-300">
                        池模式适合 Claude Console 账号池故障切换；重试次数默认 3，最大 10。
                      </div>
                      <div>
                        <FieldLabel>重试次数</FieldLabel>
                        <input
                          type="number"
                          min="0"
                          max={MAX_POOL_MODE_RETRY_COUNT}
                          step="1"
                          value={wizardForm.poolModeRetryCount}
                          onChange={(e) => setWizardForm((prev) => ({ ...prev, poolModeRetryCount: e.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">配额限制</div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">先接入总额度、日额度、周额度三项，后续再继续补齐重置模式和通知阈值。</p>
                </div>
                <div className="grid gap-4">
                  <div>
                    <FieldLabel>总额度（USD）</FieldLabel>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={wizardForm.quotaTotalLimit}
                      onChange={(e) => setWizardForm((prev) => ({ ...prev, quotaTotalLimit: e.target.value }))}
                      className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <FieldLabel>日额度（USD）</FieldLabel>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={wizardForm.quotaDailyLimit}
                      onChange={(e) => setWizardForm((prev) => ({ ...prev, quotaDailyLimit: e.target.value }))}
                      className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <FieldLabel>周额度（USD）</FieldLabel>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={wizardForm.quotaWeeklyLimit}
                      onChange={(e) => setWizardForm((prev) => ({ ...prev, quotaWeeklyLimit: e.target.value }))}
                      className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#111111]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">自定义错误码</div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">对接 Vue 的错误码白名单，命中后可按账号规则特殊处理。</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWizardForm((prev) => ({ ...prev, customErrorCodesEnabled: !prev.customErrorCodesEnabled }))}
                      className={`relative inline-flex h-7 w-12 rounded-full transition ${
                        wizardForm.customErrorCodesEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                          wizardForm.customErrorCodesEnabled ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                  {wizardForm.customErrorCodesEnabled && (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
                        只有选中的错误码会进入该账号的自定义错误处理，留空则沿用系统默认行为。
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {COMMON_ERROR_CODES.map((item) => {
                          const active = wizardForm.selectedErrorCodes.includes(item.value);
                          return (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() => handleToggleErrorCode(item.value)}
                              className={`rounded-2xl px-3 py-1.5 text-xs font-medium transition ${
                                active
                                  ? 'bg-red-100 text-red-700 ring-1 ring-red-400 dark:bg-red-900/30 dark:text-red-300'
                                  : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                              }`}
                            >
                              {item.value} {item.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="100"
                          max="599"
                          value={wizardForm.customErrorCodeInput}
                          onChange={(e) => setWizardForm((prev) => ({ ...prev, customErrorCodeInput: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomErrorCode();
                            }
                          }}
                          placeholder="输入错误码"
                          className="flex-1 rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomErrorCode}
                          className="rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          添加
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sortedSelectedErrorCodes.length > 0 ? (
                          sortedSelectedErrorCodes.map((code) => (
                            <span
                              key={code}
                              className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300"
                            >
                              {code}
                              <button type="button" onClick={() => handleRemoveErrorCode(code)} className="text-red-600 transition hover:text-red-800 dark:text-red-300 dark:hover:text-red-100">
                                x
                              </button>
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400">未选择错误码，默认沿用系统规则。</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  <div>当前选择：{wizardForm.platform} / {wizardForm.accountType} / {wizardForm.authMethod}</div>
                  <div className="mt-1">API Key 已填写：{wizardForm.apiKeyValue.trim() ? '是' : '否'}</div>
                  <div className="mt-1">透传模式：{wizardForm.anthropicPassthroughEnabled ? '开启' : '关闭'}</div>
                  <div className="mt-1">模型限制：{wizardForm.modelRestrictionMode === 'whitelist' ? `白名单 ${wizardForm.allowedModels.length} 个` : `映射 ${wizardForm.modelMappings.length} 条`}</div>
                </div>
              </div>
            </div>
          </div>
        ) : isGeminiOAuthWizard ? (
          <div className="space-y-6 px-7 py-6">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900/30 dark:bg-blue-950/20">
              <div className="text-base font-medium text-blue-700 dark:text-blue-300">Gemini / OAuth</div>
              <p className="mt-2 text-sm text-blue-700/90 dark:text-blue-300/90">
                先生成 Gemini OAuth 授权链接，完成 Google 授权后回填授权码，再结合当前页选定的 OAuth 子类型和账号等级创建账号。
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">1. 生成授权链接</div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">根据当前选择的 OAuth 子类型和账号等级生成 Gemini 授权链接。</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleOpenGeminiAuthUrl()}
                    disabled={wizardAuth.generating || wizardAuth.submitting}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {wizardAuth.generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    {wizardAuth.url ? '重新生成授权链接' : '生成授权链接'}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(wizardAuth.url, '_blank', 'noopener,noreferrer')}
                    disabled={!wizardAuth.url}
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                    打开授权页
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyAuthUrl()}
                    disabled={!wizardAuth.url}
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <Copy className="h-4 w-4" />
                    复制链接
                  </button>
                </div>
                <div>
                  <FieldLabel>授权链接</FieldLabel>
                  <textarea
                    rows={4}
                    readOnly
                    value={wizardAuth.url}
                    placeholder="点击上方按钮生成 Gemini OAuth 授权链接"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-[#0f0f0f] dark:text-gray-300"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <FieldLabel>Session ID</FieldLabel>
                    <input
                      readOnly
                      value={wizardAuth.sessionId}
                      placeholder="生成授权链接后自动回填"
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-[#0f0f0f] dark:text-gray-300"
                    />
                  </div>
                  <div>
                    <FieldLabel>State</FieldLabel>
                    <input
                      readOnly
                      value={wizardAuth.state}
                      placeholder="从授权链接自动回填"
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-[#0f0f0f] dark:text-gray-300"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <div>
                  <FieldLabel>2. 回填授权码</FieldLabel>
                  <textarea
                    rows={8}
                    value={wizardAuth.codeInput}
                    onChange={(e) => setWizardAuth((prev) => ({ ...prev, codeInput: e.target.value }))}
                    placeholder="粘贴授权完成后拿到的 code，若复制了完整回调链接，这里也会自动解析 code 参数。"
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                  />
                </div>

                <div className="rounded-2xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  <div>OAuth 类型：{wizardForm.geminiOAuthType}</div>
                  <div className="mt-1">账号等级：{geminiSelectedTier}</div>
                  <div className="mt-1">已绑定分组：{wizardForm.groupIds.length} 个</div>
                  <div className="mt-1">临时不可调度：{wizardForm.tempUnschedulable ? '开启' : '关闭'}</div>
                </div>
              </div>
            </div>
          </div>
        ) : isAntigravityOAuthWizard ? (
          <div className="space-y-6 px-7 py-6">
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-900/30 dark:bg-violet-950/20">
              <div className="text-base font-medium text-violet-700 dark:text-violet-300">Antigravity / OAuth</div>
              <p className="mt-2 text-sm text-violet-700/90 dark:text-violet-300/90">
                先生成 Antigravity OAuth 授权链接，完成 Google 授权后回填授权码，再结合当前页的模型映射和专属开关创建账号。
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">1. 生成授权链接</div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">使用后端 Antigravity OAuth 端点生成授权链接，生成后可直接在浏览器完成授权。</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleOpenAntigravityAuthUrl()}
                    disabled={wizardAuth.generating || wizardAuth.submitting}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {wizardAuth.generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    {wizardAuth.url ? '重新生成授权链接' : '生成授权链接'}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(wizardAuth.url, '_blank', 'noopener,noreferrer')}
                    disabled={!wizardAuth.url}
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                    打开授权页
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyAuthUrl()}
                    disabled={!wizardAuth.url}
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <Copy className="h-4 w-4" />
                    复制链接
                  </button>
                </div>
                <div>
                  <FieldLabel>授权链接</FieldLabel>
                  <textarea
                    rows={4}
                    readOnly
                    value={wizardAuth.url}
                    placeholder="点击上方按钮生成 Antigravity OAuth 授权链接"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-[#0f0f0f] dark:text-gray-300"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <FieldLabel>Session ID</FieldLabel>
                    <input
                      readOnly
                      value={wizardAuth.sessionId}
                      placeholder="生成授权链接后自动回填"
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-[#0f0f0f] dark:text-gray-300"
                    />
                  </div>
                  <div>
                    <FieldLabel>State</FieldLabel>
                    <input
                      readOnly
                      value={wizardAuth.state}
                      placeholder="从授权链接自动回填"
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-[#0f0f0f] dark:text-gray-300"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <div>
                  <FieldLabel>2. 回填授权码</FieldLabel>
                  <textarea
                    rows={8}
                    value={wizardAuth.codeInput}
                    onChange={(e) => setWizardAuth((prev) => ({ ...prev, codeInput: e.target.value }))}
                    placeholder="粘贴授权完成后拿到的 code，若复制了完整回调链接，这里也会自动解析 code 参数。"
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                  />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">保留和 Vue 一样的 OAuth 主流程，支持直接粘贴完整回调链接自动提取 `code`。</p>
                </div>

                <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900/30 dark:bg-violet-950/20">
                  <div className="text-sm font-medium text-violet-700 dark:text-violet-300">或使用 Refresh Token 创建</div>
                  <p className="mt-1 text-xs text-violet-700/90 dark:text-violet-300/90">
                    与 Vue 一样支持手动输入 Refresh Token。可一次粘贴多个，每行一个，系统会逐条校验并批量创建账号。
                  </p>
                  <textarea
                    rows={6}
                    value={wizardAuth.refreshTokenInput}
                    onChange={(e) => setWizardAuth((prev) => ({ ...prev, refreshTokenInput: e.target.value }))}
                    placeholder={'每行一个 Refresh Token\n例如：1//0g...\n1//0h...'}
                    className="mt-3 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 font-mono text-sm outline-none transition focus:border-violet-400 dark:border-violet-900/40 dark:bg-[#0f0f0f] dark:text-white"
                  />
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handleCreateAntigravityRefreshTokenAccounts()}
                      disabled={wizardAuth.submitting}
                      className="inline-flex items-center gap-2 rounded-2xl border border-violet-300 px-4 py-2.5 text-sm font-medium text-violet-700 transition hover:bg-violet-100 disabled:opacity-60 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950/30"
                    >
                      {wizardAuth.submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      校验 RT 并创建
                    </button>
                    <button
                      type="button"
                      onClick={() => setWizardAuth((prev) => ({ ...prev, refreshTokenInput: '' }))}
                      disabled={!wizardAuth.refreshTokenInput}
                      className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      清空 RT
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  <div>当前选择：{wizardForm.platform} / {wizardForm.accountType} / {wizardForm.authMethod}</div>
                  <div className="mt-1">已绑定分组：{wizardForm.groupIds.length} 个</div>
                  <div className="mt-1">模型映射：{wizardForm.modelMappings.length} 条</div>
                  <div className="mt-1">Mixed Scheduling：{wizardForm.antigravityMixedScheduling ? '开启' : '关闭'}</div>
                </div>
              </div>
            </div>
          </div>
        ) : isOpenAIOAuthWizard ? (
          <div className="space-y-6 px-7 py-6">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/30 dark:bg-emerald-950/20">
              <div className="text-base font-medium text-emerald-700 dark:text-emerald-300">OpenAI / OAuth</div>
              <p className="mt-2 text-sm text-emerald-700/90 dark:text-emerald-300/90">
                先生成 ChatGPT OAuth 授权链接，在浏览器完成授权后回填授权码，最后按当前页已配置的模型限制和 OpenAI 专属开关创建账号。
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">1. 生成授权链接</div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">使用后端 OpenAI OAuth 端点生成授权链接，生成后可直接打开浏览器完成授权。</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleOpenOpenAIAuthUrl()}
                    disabled={wizardAuth.generating || wizardAuth.submitting}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {wizardAuth.generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    {wizardAuth.url ? '重新生成授权链接' : '生成授权链接'}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(wizardAuth.url, '_blank', 'noopener,noreferrer')}
                    disabled={!wizardAuth.url}
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                    打开授权页
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyAuthUrl()}
                    disabled={!wizardAuth.url}
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <Copy className="h-4 w-4" />
                    复制链接
                  </button>
                </div>
                <div>
                  <FieldLabel>授权链接</FieldLabel>
                  <textarea
                    rows={4}
                    readOnly
                    value={wizardAuth.url}
                    placeholder="点击上方按钮生成 OpenAI OAuth 授权链接"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-[#0f0f0f] dark:text-gray-300"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <FieldLabel>Session ID</FieldLabel>
                    <input
                      readOnly
                      value={wizardAuth.sessionId}
                      placeholder="生成授权链接后自动回填"
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-[#0f0f0f] dark:text-gray-300"
                    />
                  </div>
                  <div>
                    <FieldLabel>State</FieldLabel>
                    <input
                      readOnly
                      value={wizardAuth.state}
                      placeholder="从授权链接自动解析"
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-[#0f0f0f] dark:text-gray-300"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <div>
                  <FieldLabel>2. 回填授权码</FieldLabel>
                  <textarea
                    rows={8}
                    value={wizardAuth.codeInput}
                    onChange={(e) => setWizardAuth((prev) => ({ ...prev, codeInput: e.target.value }))}
                    placeholder="粘贴授权完成后拿到的 code，若复制了完整回调链接，这里也会自动解析 code 参数。"
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                  />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">支持直接粘贴完整回调链接，页面会自动提取 `code` 参数。</p>
                </div>

                <div className="rounded-2xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  <div>当前选择：{wizardForm.platform} / {wizardForm.accountType} / {wizardForm.authMethod}</div>
                  <div className="mt-1">已绑定分组：{wizardForm.groupIds.length} 个</div>
                  <div className="mt-1">模型限制：{wizardForm.modelRestrictionMode === 'whitelist' ? `白名单 ${wizardForm.allowedModels.length} 个` : `映射 ${wizardForm.modelMappings.length} 条`}</div>
                  <div className="mt-1">自动透传：{wizardForm.openaiPassthroughEnabled ? '开启' : '关闭'}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 px-7 py-6">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/30 dark:bg-emerald-950/20">
              <div className="text-base font-medium text-emerald-700 dark:text-emerald-300">Phase 2 开始接入具体授权表单</div>
              <p className="mt-2 text-sm text-emerald-700/90 dark:text-emerald-300/90">
                当前已完成 Step 1 骨架和平台/账号类型/授权方式选择。下一阶段会按账号管理开发流程，继续补齐
                各平台的专属凭证表单与 OAuth 流程。
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">当前选择</div>
                <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <div>平台：{wizardForm.platform}</div>
                  <div>账号类型：{wizardForm.accountType}</div>
                  <div>授权方式：{wizardForm.authMethod}</div>
                  <div>分组数：{wizardForm.groupIds.length}</div>
                </div>
              </div>
              <div className="rounded-2xl border border-dashed border-gray-300 p-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                这里将接入各平台专属凭证表单、OAuth 跳转、Token 验证、Session/Refresh Token 流程，以及高级控制项。
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-gray-200 px-7 py-5 dark:border-gray-800">
          <button
            type="button"
            onClick={() => {
              if (wizardStep === 1) {
                setShowWizard(false);
              } else {
                setWizardStep(1);
              }
            }}
            className="rounded-2xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {wizardStep === 1 ? '取消' : '上一步'}
          </button>
          {wizardStep === 1 ? (
            isClaudeConsoleWizard ? (
              <button
                type="button"
                onClick={() => void handleCreateClaudeConsoleAccount()}
                disabled={wizardAuth.submitting}
                className={`inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-medium text-white transition ${
                  wizardAuth.submitting ? 'bg-gray-300 dark:bg-gray-700' : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                {wizardAuth.submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                创建账号
              </button>
            ) : isOpenAIApiKeyWizard ? (
              <button
                type="button"
                onClick={() => void handleCreateOpenAIAPIKeyAccount()}
                disabled={wizardAuth.submitting}
                className={`inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-medium text-white transition ${
                  wizardAuth.submitting ? 'bg-gray-300 dark:bg-gray-700' : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                {wizardAuth.submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                创建账号
              </button>
            ) : isGeminiAPIKeyWizard ? (
              <button
                type="button"
                onClick={() => void handleCreateGeminiAPIKeyAccount()}
                disabled={wizardAuth.submitting}
                className={`inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-medium text-white transition ${
                  wizardAuth.submitting ? 'bg-gray-300 dark:bg-gray-700' : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                {wizardAuth.submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                创建账号
              </button>
            ) : isAntigravityUpstreamWizard ? (
              <button
                type="button"
                onClick={() => void handleCreateAntigravityUpstreamAccount()}
                disabled={wizardAuth.submitting}
                className={`inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-medium text-white transition ${
                  wizardAuth.submitting ? 'bg-gray-300 dark:bg-gray-700' : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                {wizardAuth.submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                创建账号
              </button>
            ) : isOpenAIOAuthWizard || isGeminiOAuthWizard || isAntigravityOAuthWizard ? (
              <button
                type="button"
                onClick={handleAdvanceWizard}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-600"
              >
                下一步
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : isBedrockWizard ? (
              <button
                type="button"
                onClick={() => void handleCreateBedrockAccount()}
                disabled={wizardAuth.submitting}
                className={`inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-medium text-white transition ${
                  wizardAuth.submitting ? 'bg-gray-300 dark:bg-gray-700' : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                {wizardAuth.submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                创建账号
              </button>
            ) : (
              <button
                type="button"
                onClick={handleAdvanceWizard}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-600"
              >
                下一步
                <ChevronRight className="h-4 w-4" />
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => {
                if (isClaudeCodeWizard) {
                  void handleCreateClaudeCodeAccount();
                  return;
                }
                if (isClaudeConsoleWizard) {
                  void handleCreateClaudeConsoleAccount();
                  return;
                }
                if (isOpenAIApiKeyWizard) {
                  void handleCreateOpenAIAPIKeyAccount();
                  return;
                }
                if (isOpenAIOAuthWizard) {
                  void handleCreateOpenAIOAuthAccount();
                  return;
                }
                if (isGeminiOAuthWizard) {
                  void handleCreateGeminiOAuthAccount();
                  return;
                }
                if (isGeminiAPIKeyWizard) {
                  void handleCreateGeminiAPIKeyAccount();
                  return;
                }
                if (isAntigravityOAuthWizard) {
                  if (wizardAuth.refreshTokenInput.trim()) {
                    void handleCreateAntigravityRefreshTokenAccounts();
                  } else {
                    void handleCreateAntigravityOAuthAccount();
                  }
                  return;
                }
                if (isAntigravityUpstreamWizard) {
                  void handleCreateAntigravityUpstreamAccount();
                  return;
                }
                if (isBedrockWizard) {
                  void handleCreateBedrockAccount();
                }
              }}
              disabled={
                (!isClaudeCodeWizard &&
                  !isClaudeConsoleWizard &&
                  !isOpenAIApiKeyWizard &&
                  !isOpenAIOAuthWizard &&
                  !isGeminiOAuthWizard &&
                  !isGeminiAPIKeyWizard &&
                  !isAntigravityOAuthWizard &&
                  !isAntigravityUpstreamWizard &&
                  !isBedrockWizard) ||
                wizardAuth.submitting
              }
              className={`inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-medium text-white transition ${
                (!isClaudeCodeWizard &&
                  !isClaudeConsoleWizard &&
                  !isOpenAIApiKeyWizard &&
                  !isOpenAIOAuthWizard &&
                  !isGeminiOAuthWizard &&
                  !isGeminiAPIKeyWizard &&
                  !isAntigravityOAuthWizard &&
                  !isAntigravityUpstreamWizard &&
                  !isBedrockWizard) ||
                wizardAuth.submitting
                  ? 'bg-gray-300 dark:bg-gray-700'
                  : 'bg-emerald-500 hover:bg-emerald-600'
              }`}
              title={
                isClaudeCodeWizard
                  ? '创建 Claude Code 账号'
                  : isClaudeConsoleWizard
                    ? '创建 Claude Console 账号'
                    : isOpenAIApiKeyWizard
                      ? '创建 OpenAI API Key 账号'
                      : isOpenAIOAuthWizard
                        ? '创建 OpenAI OAuth 账号'
                        : isGeminiOAuthWizard
                          ? '创建 Gemini OAuth 账号'
                          : isGeminiAPIKeyWizard
                            ? '创建 Gemini API Key 账号'
                            : isAntigravityOAuthWizard
                              ? '创建 Antigravity OAuth 账号'
                              : isAntigravityUpstreamWizard
                                ? '创建 Antigravity API Key 账号'
                                : isBedrockWizard
                                  ? '创建 AWS Bedrock 账号'
                                  : '继续接入平台专属创建流程'
              }
            >
              {wizardAuth.submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isClaudeCodeWizard ||
              isClaudeConsoleWizard ||
              isOpenAIApiKeyWizard ||
              isOpenAIOAuthWizard ||
              isGeminiOAuthWizard ||
              isGeminiAPIKeyWizard ||
              isAntigravityOAuthWizard ||
              isAntigravityUpstreamWizard ||
              isBedrockWizard
                ? isAntigravityOAuthWizard && wizardAuth.refreshTokenInput.trim()
                  ? '校验 RT 并创建'
                  : '创建账号'
                : '下一阶段接入'}
            </button>
          )}
        </div>
      </ModalShell>
    </div>
  );
}
