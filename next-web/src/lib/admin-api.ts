'use client';

import { api } from '@/lib/api';

export interface AdminDashboardStats {
  total_users?: number;
  today_new_users?: number;
  total_api_keys?: number;
  active_api_keys?: number;
  total_accounts?: number;
  normal_accounts?: number;
  error_accounts?: number;
  today_requests?: number;
  total_requests?: number;
  today_tokens?: number;
  total_tokens?: number;
  today_cost?: number;
  total_cost?: number;
  today_actual_cost?: number;
  total_actual_cost?: number;
  average_duration_ms?: number;
  active_users?: number;
  rpm?: number;
  tpm?: number;
  uptime?: number;
}

export interface AdminDashboardSnapshot {
  generated_at?: string;
  stats?: AdminDashboardStats;
  trend?: Array<Record<string, unknown>>;
  models?: Array<Record<string, unknown>>;
  groups?: Array<Record<string, unknown>>;
}

export interface AdminSystemReleaseAsset {
  name: string;
  download_url: string;
  size: number;
}

export interface AdminSystemReleaseInfo {
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  assets?: AdminSystemReleaseAsset[];
}

export interface AdminSystemUpdateInfo {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  release_info?: AdminSystemReleaseInfo | null;
  cached?: boolean;
  warning?: string;
  build_type?: 'source' | 'release' | string;
}

export interface AdminSystemVersionInfo {
  version: string;
}

export interface AdminSystemOperationResult {
  message?: string;
  need_restart?: boolean;
  operation_id?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminUser {
  id: number;
  email: string;
  username?: string;
  notes?: string;
  role?: string;
  status?: string;
  balance?: number;
  concurrency?: number;
  current_concurrency?: number;
  group_name?: string;
  allowed_groups?: Array<{ id: number; name: string }> | number[];
  commission_rate?: number;
  commission_balance?: number;
  created_at?: string;
}

export interface AdminUserApiKey {
  id: number;
  user_id: number;
  key: string;
  name?: string;
  status?: string;
  quota?: number;
  quota_used?: number;
  created_at?: string;
  updated_at?: string;
  expires_at?: string | null;
  last_used_at?: string | null;
}

export interface AdminUserBalanceHistoryItem {
  id: number;
  code?: string;
  type?: string;
  value?: number;
  status?: string;
  used_by?: number | null;
  used_at?: string | null;
  created_at?: string;
  group_id?: number | null;
  validity_days?: number;
  notes?: string;
}

export interface AdminUserBalanceHistoryResult extends PaginatedResult<AdminUserBalanceHistoryItem> {
  total_recharged?: number;
}

export interface AdminUserUsageStats {
  total_requests?: number;
  total_cost?: number;
  total_tokens?: number;
}

export interface AdminGroup {
  id: number;
  name: string;
  status?: string;
  platform?: string;
  description?: string;
  sort_order?: number;
  rate_multiplier?: number;
  is_exclusive?: boolean;
  subscription_type?: string;
  daily_limit_usd?: number | null;
  weekly_limit_usd?: number | null;
  monthly_limit_usd?: number | null;
  claude_code_only?: boolean;
  fallback_group_id?: number | null;
  fallback_group_id_on_invalid_request?: number | null;
  require_oauth_only?: boolean;
  require_privacy_set?: boolean;
  model_routing_enabled?: boolean;
  account_count?: number;
  active_account_count?: number;
  rate_limited_account_count?: number;
  created_at?: string;
}

export interface AdminGroupUsageSummary {
  group_id: number;
  today_cost?: number;
  total_cost?: number;
}

export interface AdminGroupCapacitySummary {
  group_id: number;
  concurrency_used?: number;
  concurrency_max?: number;
  sessions_used?: number;
  sessions_max?: number;
  rpm_used?: number;
  rpm_max?: number;
}

export interface AdminGroupRateMultiplierEntry {
  user_id: number;
  user_name?: string;
  user_email?: string;
  user_notes?: string;
  user_status?: string;
  rate_multiplier?: number;
}

export type AdminChannelBillingMode = 'token' | 'per_request' | 'image';

export interface AdminChannelPricingInterval {
  id?: number;
  min_tokens: number;
  max_tokens: number | null;
  tier_label: string;
  input_price: number | null;
  output_price: number | null;
  cache_write_price: number | null;
  cache_read_price: number | null;
  per_request_price: number | null;
  sort_order: number;
}

export interface AdminChannelModelPricing {
  id?: number;
  platform: string;
  models: string[];
  billing_mode: AdminChannelBillingMode;
  input_price: number | null;
  output_price: number | null;
  cache_write_price: number | null;
  cache_read_price: number | null;
  image_output_price: number | null;
  per_request_price: number | null;
  intervals: AdminChannelPricingInterval[];
}

export interface AdminChannelAccountStatsPricingRule {
  id?: number;
  name: string;
  group_ids: number[];
  account_ids: number[];
  pricing: AdminChannelModelPricing[];
}

export interface AdminChannel {
  id: number;
  name: string;
  description?: string;
  status: string;
  billing_model_source?: string;
  restrict_models?: boolean;
  features?: string;
  features_config?: Record<string, unknown>;
  group_ids: number[];
  model_pricing: AdminChannelModelPricing[];
  model_mapping: Record<string, Record<string, string>>;
  apply_pricing_to_account_stats?: boolean;
  account_stats_pricing_rules: AdminChannelAccountStatsPricingRule[];
  created_at?: string;
  updated_at?: string;
}

export interface AdminSubscription {
  id: number;
  user_id: number;
  group_id: number;
  starts_at?: string;
  expires_at?: string;
  status?: string;
  daily_window_start?: string | null;
  weekly_window_start?: string | null;
  monthly_window_start?: string | null;
  daily_usage_usd?: number;
  weekly_usage_usd?: number;
  monthly_usage_usd?: number;
  created_at?: string;
  updated_at?: string;
  user?: AdminUser;
  group?: AdminGroup;
}

export interface AdminSubscriptionProgress {
  subscription_id: number;
  status?: string;
  starts_at?: string;
  expires_at?: string;
  daily_usage_usd?: number;
  weekly_usage_usd?: number;
  monthly_usage_usd?: number;
  daily_limit_usd?: number;
  weekly_limit_usd?: number;
  monthly_limit_usd?: number;
}

export type AdminRedeemCodeType =
  | 'balance'
  | 'concurrency'
  | 'subscription'
  | 'invitation'
  | 'admin_balance'
  | 'admin_concurrency';

export interface AdminRedeemCode {
  id: number;
  code: string;
  type: AdminRedeemCodeType | string;
  value: number;
  status: 'unused' | 'used' | 'expired' | string;
  used_by?: number | null;
  used_at?: string | null;
  created_at?: string;
  group_id?: number | null;
  validity_days?: number;
  notes?: string;
  user?: AdminUser | null;
  group?: AdminGroup | null;
}

export interface AdminPromoCode {
  id: number;
  code: string;
  bonus_amount: number;
  max_uses: number;
  used_count: number;
  status: 'active' | 'disabled' | string;
  expires_at?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AdminPromoCodeUsage {
  id: number;
  promo_code_id: number;
  user_id: number;
  bonus_amount: number;
  used_at?: string;
  user?: AdminUser | null;
}

export interface AdminCreatePromoCodePayload {
  code?: string;
  bonus_amount: number;
  max_uses?: number;
  expires_at?: number | null;
  notes?: string;
}

export interface AdminUpdatePromoCodePayload {
  code?: string;
  bonus_amount?: number;
  max_uses?: number;
  status?: 'active' | 'disabled';
  expires_at?: number | null;
  notes?: string;
}

export interface AdminAccount {
  id: number;
  name?: string;
  notes?: string;
  platform?: string;
  type?: string;
  status?: string;
  group?: string;
  group_name?: string;
  model_count?: number;
  last_error?: string;
  schedulable?: boolean;
  concurrency?: number;
  load_factor?: number;
  priority?: number;
  rate_multiplier?: number;
  privacy_mode?: string;
  window_cost_limit?: number;
  last_used_at?: string;
  expires_at?: string;
  created_at?: string;
}

export interface AdminCreateAccountPayload {
  name: string;
  notes?: string;
  platform: string;
  type: string;
  credentials: Record<string, unknown>;
  extra?: Record<string, unknown>;
  proxy_id?: number | null;
  concurrency?: number;
  load_factor?: number | null;
  priority?: number;
  rate_multiplier?: number;
  group_ids?: number[];
  expires_at?: number | null;
  auto_pause_on_expired?: boolean;
  confirm_mixed_channel_risk?: boolean;
}

export interface AdminAccountAuthUrlResult {
  auth_url: string;
  session_id: string;
  state?: string;
}

export interface AdminAccountAuthExchangePayload {
  session_id: string;
  code: string;
  state?: string;
  proxy_id?: number;
  oauth_type?: string;
  tier_id?: string;
  project_id?: string;
}

export interface GeminiOAuthCapabilities {
  ai_studio_oauth_enabled: boolean;
  required_redirect_uris: string[];
}

export interface AdminTLSFingerprintProfile {
  id: number;
  name: string;
  description?: string;
}

export interface AdminProxy {
  id: number;
  name: string;
  protocol?: string;
  host?: string;
  username?: string;
  password?: string;
  port?: number;
  status?: string;
  account_count?: number;
  latency_ms?: number | null;
  latency_status?: string;
  latency_message?: string;
  ip_address?: string;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
  quality_status?: string;
  quality_score?: number | null;
  quality_grade?: string;
  quality_summary?: string;
  quality_checked?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface AdminProxyAccountSummary {
  id: number;
  name: string;
  platform: string;
  type: string;
  notes?: string | null;
}

export interface AdminProxyQualityCheckItem {
  target: string;
  status: string;
  http_status?: number;
  latency_ms?: number;
  message?: string;
  cf_ray?: string;
}

export interface AdminProxyQualityCheckResult {
  proxy_id: number;
  score: number;
  grade: string;
  summary: string;
  exit_ip?: string;
  country?: string;
  country_code?: string;
  base_latency_ms?: number;
  passed_count: number;
  warn_count: number;
  failed_count: number;
  challenge_count: number;
  checked_at: number;
  items: AdminProxyQualityCheckItem[];
}

export interface AdminProxyDataPayload {
  type?: string;
  version?: number;
  exported_at?: string;
  proxies: Array<{
    proxy_key?: string;
    name: string;
    protocol: string;
    host: string;
    port: number;
    username?: string;
    password?: string;
    status?: string;
  }>;
  accounts?: Array<Record<string, unknown>>;
}

export interface AdminProxyDataImportResult {
  proxy_created?: number;
  proxy_reused?: number;
  proxy_failed?: number;
  account_created?: number;
  account_failed?: number;
  errors?: Array<{
    kind?: string;
    name?: string;
    proxy_key?: string;
    message?: string;
  }>;
}

export interface AdminCreateProxyPayload {
  name: string;
  protocol: string;
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
}

export interface AdminUpdateProxyPayload {
  name?: string;
  protocol?: string;
  host?: string;
  port?: number;
  username?: string | null;
  password?: string | null;
  status?: string;
}

export interface DefaultSubscriptionSetting {
  group_id: number;
  validity_days: number;
}

export interface NotifyEmailEntry {
  email: string;
  name?: string;
}

export interface SystemSettings {
  registration_enabled?: boolean;
  email_verify_enabled?: boolean;
  registration_email_suffix_whitelist?: string[];
  promo_code_enabled?: boolean;
  password_reset_enabled?: boolean;
  frontend_url?: string;
  invitation_code_enabled?: boolean;
  totp_enabled?: boolean;
  totp_encryption_key_configured?: boolean;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_password_configured?: boolean;
  smtp_from_email?: string;
  smtp_from_name?: string;
  smtp_use_tls?: boolean;
  site_name?: string;
  site_logo?: string;
  site_subtitle?: string;
  api_base_url?: string;
  contact_info?: string;
  doc_url?: string;
  home_content?: string;
  hide_ccs_import_button?: boolean;
  purchase_subscription_enabled?: boolean;
  purchase_subscription_url?: string;
  table_default_page_size?: number;
  table_page_size_options?: number[];
  default_concurrency?: number;
  default_balance?: number;
  default_subscriptions?: DefaultSubscriptionSetting[];
  enable_model_fallback?: boolean;
  fallback_model_anthropic?: string;
  fallback_model_openai?: string;
  fallback_model_gemini?: string;
  fallback_model_antigravity?: string;
  news_translation_api_key?: string;
  news_translation_api_key_configured?: boolean;
  news_translation_base_url?: string;
  news_translation_model?: string;
  news_translation_timeout_seconds?: number;
  news_translation_temperature?: number;
  enable_identity_patch?: boolean;
  identity_patch_prompt?: string;
  allow_ungrouped_key_scheduling?: boolean;
  backend_mode_enabled?: boolean;
  enable_fingerprint_unification?: boolean;
  enable_metadata_passthrough?: boolean;
  enable_cch_signing?: boolean;
  web_search_emulation_enabled?: boolean;
  payment_enabled?: boolean;
  payment_min_amount?: number;
  payment_max_amount?: number;
  payment_daily_limit?: number;
  payment_order_timeout_minutes?: number;
  payment_max_pending_orders?: number;
  payment_enabled_types?: string[];
  payment_balance_disabled?: boolean;
  payment_balance_recharge_multiplier?: number;
  payment_recharge_fee_rate?: number;
  payment_load_balance_strategy?: string;
  payment_product_name_prefix?: string;
  payment_product_name_suffix?: string;
  payment_help_image_url?: string;
  payment_help_text?: string;
  payment_cancel_rate_limit_enabled?: boolean;
  payment_cancel_rate_limit_max?: number;
  payment_cancel_rate_limit_window?: number;
  payment_cancel_rate_limit_unit?: string;
  payment_cancel_rate_limit_window_mode?: string;
  balance_low_notify_enabled?: boolean;
  balance_low_notify_threshold?: number;
  balance_low_notify_recharge_url?: string;
  account_quota_notify_enabled?: boolean;
  account_quota_notify_emails?: NotifyEmailEntry[];
  affiliate_auto_settlement_enabled?: boolean;
  affiliate_manual_payout_settlement_enabled?: boolean;
  [key: string]: unknown;
}

export interface AdminAPIKeyStatus {
  exists: boolean;
  masked_key?: string;
}

export interface AdminAnnouncement {
  id: number;
  title: string;
  content: string;
  status?: string;
  notify_mode?: string;
  created_at?: string;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface AdminNewsTranslation {
  id?: number;
  news_post_id?: number;
  locale: string;
  title: string;
  summary: string;
  content: string;
  seo_title?: string | null;
  seo_description?: string | null;
  translation_status?: string;
  translation_provider?: string | null;
  translated_from_locale?: string | null;
  last_translated_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AdminNewsPost {
  id: number;
  slug: string;
  status: string;
  default_locale: string;
  cover_image_url?: string | null;
  author_name?: string | null;
  published_at?: string | null;
  created_by?: number | null;
  updated_by?: number | null;
  created_at?: string;
  updated_at?: string;
  translations: AdminNewsTranslation[];
}

export interface AdminNewsAITranslateResult {
  post: AdminNewsPost;
  translation: AdminNewsTranslation;
}

export interface AdminCommissionLog {
  id: number;
  user_id: number;
  invitee_id: number | null;
  order_id?: number | null;
  amount: number;
  status: string;
  reason: string;
  created_at?: string;
  updated_at?: string;
}

export interface AdminPaymentOrder {
  id: number;
  user_id: number;
  user_email?: string;
  user_name?: string;
  amount: number;
  pay_amount: number;
  fee_rate: number;
  payment_type: string;
  out_trade_no: string;
  payment_trade_no?: string;
  status: string;
  order_type: string;
  created_at?: string;
  expires_at?: string;
  paid_at?: string;
  completed_at?: string;
  refund_amount?: number;
  refund_reason?: string | null;
  refund_requested_at?: string;
  refund_requested_by?: number;
  refund_request_reason?: string | null;
  failed_reason?: string | null;
  provider_instance_id?: string | null;
}

export interface AdminOrderAuditLog {
  id: number;
  action: string;
  detail?: string | null;
  operator?: string | null;
  created_at?: string;
}

export interface AdminPaymentDashboardDailyStat {
  date: string;
  amount: number;
  count: number;
}

export interface AdminPaymentDashboardMethodStat {
  type: string;
  amount: number;
  count: number;
}

export interface AdminPaymentDashboardTopUser {
  user_id: number;
  email: string;
  amount: number;
}

export interface AdminPaymentDashboardStats {
  today_amount: number;
  total_amount: number;
  today_count: number;
  total_count: number;
  avg_amount: number;
  pending_orders?: number;
  daily_series: AdminPaymentDashboardDailyStat[];
  payment_methods: AdminPaymentDashboardMethodStat[];
  top_users: AdminPaymentDashboardTopUser[];
}

export interface AdminPaymentProviderInstance {
  id: number;
  provider_key: string;
  name: string;
  config: Record<string, string>;
  supported_types: string[];
  limits: string;
  enabled: boolean;
  refund_enabled: boolean;
  allow_user_refund: boolean;
  sort_order: number;
  payment_mode: string;
}

export interface AdminCreatePaymentProviderPayload {
  provider_key: string;
  name: string;
  config: Record<string, string>;
  supported_types: string[];
  enabled: boolean;
  payment_mode: string;
  sort_order?: number;
  limits?: string;
  refund_enabled?: boolean;
  allow_user_refund?: boolean;
}

export interface AdminUpdatePaymentProviderPayload {
  name?: string;
  config?: Record<string, string>;
  supported_types?: string[];
  enabled?: boolean;
  payment_mode?: string;
  sort_order?: number;
  limits?: string;
  refund_enabled?: boolean;
  allow_user_refund?: boolean;
}

export interface AdminSubscriptionPlan {
  id: number;
  group_id: number;
  name: string;
  product_name?: string;
  description?: string;
  price: number;
  original_price?: number | null;
  validity_days: number;
  validity_unit: string;
  features: string[];
  for_sale: boolean;
  sort_order: number;
  created_at?: string;
}

export interface AdminUsageEntityRef {
  id: number;
  name?: string;
  email?: string;
}

export interface AdminUsageAccountRef {
  id: number;
  name: string;
}

export interface AdminUsageLog {
  id: number;
  user_id: number;
  api_key_id?: number | null;
  account_id?: number | null;
  channel_id?: number | null;
  group_id?: number | null;
  model: string;
  upstream_model?: string | null;
  request_type: string;
  stream: boolean;
  billing_type: number;
  billing_mode?: string | null;
  input_tokens: number;
  output_tokens: number;
  total_cost: number;
  actual_cost: number;
  rate_multiplier: number;
  duration_ms?: number | null;
  first_token_ms?: number | null;
  ip_address?: string | null;
  user?: AdminUsageEntityRef | null;
  api_key?: AdminUsageEntityRef | null;
  group?: AdminUsageEntityRef | null;
  account?: AdminUsageAccountRef | null;
  created_at?: string;
}

export interface AdminUsageStats {
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_tokens: number;
  total_tokens: number;
  total_cost: number;
  total_actual_cost: number;
  average_duration_ms: number;
}

export interface AdminUsageCleanupFilters {
  start_time?: string;
  end_time?: string;
  user_id?: number;
  api_key_id?: number;
  account_id?: number;
  group_id?: number;
  model?: string | null;
  request_type?: string | null;
  stream?: boolean | null;
  billing_type?: number | null;
}

export interface AdminUsageCleanupTask {
  id: number;
  status: string;
  filters: AdminUsageCleanupFilters;
  created_by: number;
  deleted_rows: number;
  error_message?: string | null;
  canceled_by?: number | null;
  canceled_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

type ApiRecord = Record<string, unknown>;

function asRecord(payload: unknown): ApiRecord | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  return payload as ApiRecord;
}

function getValue(record: ApiRecord | null, ...keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function unwrapData<T>(payload: unknown): T {
  const record = asRecord(payload);
  const hasEnvelope = record && ('code' in record || 'message' in record) && 'data' in record;
  return (hasEnvelope ? record?.data : payload) as T;
}

function normalizeArray<T>(payload: unknown): T[] {
  const unwrapped = unwrapData<unknown>(payload);
  if (Array.isArray(unwrapped)) return unwrapped as T[];
  const record = asRecord(unwrapped);
  const candidates = ['items', 'data', 'list', 'results'];
  for (const key of candidates) {
    const value = record?.[key];
    if (Array.isArray(value)) {
      return value as T[];
    }
  }
  return [];
}

function normalizePaginated<T>(payload: unknown): PaginatedResult<T> {
  const unwrapped = unwrapData<unknown>(payload);
  const items = normalizeArray<T>(unwrapped);
  const record = asRecord(unwrapped);
  const pagination = asRecord(record?.pagination);
  return {
    items,
    total: Number(
      getValue(record, 'total', 'count') ?? getValue(pagination, 'total', 'Total') ?? items.length ?? 0
    ),
    page: Number(getValue(record, 'page', 'Page') ?? getValue(pagination, 'page', 'Page') ?? 1),
    pageSize: Number(
      getValue(record, 'page_size', 'pageSize', 'PageSize') ??
        getValue(pagination, 'page_size', 'pageSize', 'PageSize') ??
        items.length ??
        0
    ),
  };
}

function normalizeCommissionLog(payload: unknown): AdminCommissionLog {
  const record = asRecord(payload);
  const inviteeIDValue = getValue(record, 'invitee_id', 'InviteeID');
  return {
    id: Number(getValue(record, 'id', 'ID') ?? 0),
    user_id: Number(getValue(record, 'user_id', 'UserID') ?? 0),
    invitee_id: inviteeIDValue == null ? null : Number(inviteeIDValue),
    order_id: (getValue(record, 'order_id', 'OrderID') as number | null | undefined) ?? null,
    amount: Number(getValue(record, 'amount', 'Amount') ?? 0),
    status: String(getValue(record, 'status', 'Status') ?? ''),
    reason: String(getValue(record, 'reason', 'Reason') ?? ''),
    created_at: getValue(record, 'created_at', 'CreatedAt') as string | undefined,
    updated_at: getValue(record, 'updated_at', 'UpdatedAt') as string | undefined,
  };
}

function normalizePaymentOrder(payload: unknown): AdminPaymentOrder {
  const record = asRecord(payload);
  return {
    id: Number(getValue(record, 'id', 'ID') ?? 0),
    user_id: Number(getValue(record, 'user_id', 'UserID') ?? 0),
    user_email: getValue(record, 'user_email', 'UserEmail') as string | undefined,
    user_name: getValue(record, 'user_name', 'UserName') as string | undefined,
    amount: Number(getValue(record, 'amount', 'Amount') ?? 0),
    pay_amount: Number(getValue(record, 'pay_amount', 'PayAmount') ?? 0),
    fee_rate: Number(getValue(record, 'fee_rate', 'FeeRate') ?? 0),
    payment_type: String(getValue(record, 'payment_type', 'PaymentType') ?? ''),
    out_trade_no: String(getValue(record, 'out_trade_no', 'OutTradeNo') ?? ''),
    payment_trade_no: getValue(record, 'payment_trade_no', 'PaymentTradeNo') as string | undefined,
    status: String(getValue(record, 'status', 'Status') ?? ''),
    order_type: String(getValue(record, 'order_type', 'OrderType') ?? ''),
    created_at: getValue(record, 'created_at', 'CreatedAt') as string | undefined,
    expires_at: getValue(record, 'expires_at', 'ExpiresAt') as string | undefined,
    paid_at: getValue(record, 'paid_at', 'PaidAt') as string | undefined,
    completed_at: getValue(record, 'completed_at', 'CompletedAt') as string | undefined,
    refund_amount: Number(getValue(record, 'refund_amount', 'RefundAmount') ?? 0),
    refund_reason: (getValue(record, 'refund_reason', 'RefundReason') as string | null | undefined) ?? null,
    refund_requested_at: getValue(record, 'refund_requested_at', 'RefundRequestedAt') as string | undefined,
    refund_requested_by: Number(getValue(record, 'refund_requested_by', 'RefundRequestedBy') ?? 0),
    refund_request_reason:
      (getValue(record, 'refund_request_reason', 'RefundRequestReason') as string | null | undefined) ?? null,
    failed_reason: (getValue(record, 'failed_reason', 'FailedReason') as string | null | undefined) ?? null,
    provider_instance_id:
      (getValue(record, 'provider_instance_id', 'ProviderInstanceID') as string | null | undefined) ?? null,
  };
}

function normalizeOrderAuditLog(payload: unknown): AdminOrderAuditLog {
  const record = asRecord(payload);
  return {
    id: Number(getValue(record, 'id', 'ID') ?? 0),
    action: String(getValue(record, 'action', 'Action') ?? ''),
    detail: (getValue(record, 'detail', 'Detail') as string | null | undefined) ?? null,
    operator: (getValue(record, 'operator', 'Operator') as string | null | undefined) ?? null,
    created_at: getValue(record, 'created_at', 'CreatedAt') as string | undefined,
  };
}

function normalizePaymentDashboardStats(payload: unknown): AdminPaymentDashboardStats {
  const record = asRecord(payload);
  const dailySeries = normalizeArray<ApiRecord>(getValue(record, 'daily_series', 'dailySeries')).map((item) => ({
    date: String(getValue(item, 'date', 'Date') ?? ''),
    amount: Number(getValue(item, 'amount', 'Amount') ?? 0),
    count: Number(getValue(item, 'count', 'Count') ?? 0),
  }));
  const paymentMethods = normalizeArray<ApiRecord>(getValue(record, 'payment_methods', 'paymentMethods')).map(
    (item) => ({
      type: String(getValue(item, 'type', 'Type') ?? ''),
      amount: Number(getValue(item, 'amount', 'Amount') ?? 0),
      count: Number(getValue(item, 'count', 'Count') ?? 0),
    })
  );
  const topUsers = normalizeArray<ApiRecord>(getValue(record, 'top_users', 'topUsers')).map((item) => ({
    user_id: Number(getValue(item, 'user_id', 'UserID') ?? 0),
    email: String(getValue(item, 'email', 'Email') ?? ''),
    amount: Number(getValue(item, 'amount', 'Amount') ?? 0),
  }));

  return {
    today_amount: Number(getValue(record, 'today_amount', 'TodayAmount') ?? 0),
    total_amount: Number(getValue(record, 'total_amount', 'TotalAmount') ?? 0),
    today_count: Number(getValue(record, 'today_count', 'TodayCount') ?? 0),
    total_count: Number(getValue(record, 'total_count', 'TotalCount') ?? 0),
    avg_amount: Number(getValue(record, 'avg_amount', 'AvgAmount') ?? 0),
    pending_orders: Number(getValue(record, 'pending_orders', 'PendingOrders') ?? 0),
    daily_series: dailySeries,
    payment_methods: paymentMethods,
    top_users: topUsers,
  };
}

function normalizeSubscriptionPlan(payload: unknown): AdminSubscriptionPlan {
  const record = asRecord(payload);
  const rawFeatures = getValue(record, 'features', 'Features');
  let features: string[] = [];
  if (Array.isArray(rawFeatures)) {
    features = rawFeatures.map((item) => String(item)).filter(Boolean);
  } else if (typeof rawFeatures === 'string') {
    features = rawFeatures
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return {
    id: Number(getValue(record, 'id', 'ID') ?? 0),
    group_id: Number(getValue(record, 'group_id', 'GroupID') ?? 0),
    name: String(getValue(record, 'name', 'Name') ?? ''),
    product_name: getValue(record, 'product_name', 'ProductName') as string | undefined,
    description: String(getValue(record, 'description', 'Description') ?? ''),
    price: Number(getValue(record, 'price', 'Price') ?? 0),
    original_price: (getValue(record, 'original_price', 'OriginalPrice') as number | null | undefined) ?? null,
    validity_days: Number(getValue(record, 'validity_days', 'ValidityDays') ?? 0),
    validity_unit: String(getValue(record, 'validity_unit', 'ValidityUnit') ?? 'days'),
    features,
    for_sale: Boolean(getValue(record, 'for_sale', 'ForSale') ?? false),
    sort_order: Number(getValue(record, 'sort_order', 'SortOrder') ?? 0),
    created_at: getValue(record, 'created_at', 'CreatedAt') as string | undefined,
  };
}

function normalizeUsageEntityRef(payload: unknown): AdminUsageEntityRef | null {
  const record = asRecord(payload);
  if (!record) return null;
  return {
    id: Number(getValue(record, 'id', 'ID') ?? 0),
    name: getValue(record, 'name', 'Name') as string | undefined,
    email: getValue(record, 'email', 'Email') as string | undefined,
  };
}

function normalizeUsageAccountRef(payload: unknown): AdminUsageAccountRef | null {
  const record = asRecord(payload);
  if (!record) return null;
  return {
    id: Number(getValue(record, 'id', 'ID') ?? 0),
    name: String(getValue(record, 'name', 'Name') ?? ''),
  };
}

function normalizeUsageLog(payload: unknown): AdminUsageLog {
  const record = asRecord(payload);
  return {
    id: Number(getValue(record, 'id', 'ID') ?? 0),
    user_id: Number(getValue(record, 'user_id', 'UserID') ?? 0),
    api_key_id: (getValue(record, 'api_key_id', 'APIKeyID') as number | null | undefined) ?? null,
    account_id: (getValue(record, 'account_id', 'AccountID') as number | null | undefined) ?? null,
    channel_id: (getValue(record, 'channel_id', 'ChannelID') as number | null | undefined) ?? null,
    group_id: (getValue(record, 'group_id', 'GroupID') as number | null | undefined) ?? null,
    model: String(getValue(record, 'model', 'Model') ?? ''),
    upstream_model: (getValue(record, 'upstream_model', 'UpstreamModel') as string | null | undefined) ?? null,
    request_type: String(getValue(record, 'request_type', 'RequestType') ?? ''),
    stream: Boolean(getValue(record, 'stream', 'Stream') ?? false),
    billing_type: Number(getValue(record, 'billing_type', 'BillingType') ?? 0),
    billing_mode: (getValue(record, 'billing_mode', 'BillingMode') as string | null | undefined) ?? null,
    input_tokens: Number(getValue(record, 'input_tokens', 'InputTokens') ?? 0),
    output_tokens: Number(getValue(record, 'output_tokens', 'OutputTokens') ?? 0),
    total_cost: Number(getValue(record, 'total_cost', 'TotalCost') ?? 0),
    actual_cost: Number(getValue(record, 'actual_cost', 'ActualCost') ?? 0),
    rate_multiplier: Number(getValue(record, 'rate_multiplier', 'RateMultiplier') ?? 0),
    duration_ms: (getValue(record, 'duration_ms', 'DurationMs') as number | null | undefined) ?? null,
    first_token_ms: (getValue(record, 'first_token_ms', 'FirstTokenMs') as number | null | undefined) ?? null,
    ip_address: (getValue(record, 'ip_address', 'IPAddress') as string | null | undefined) ?? null,
    user: normalizeUsageEntityRef(getValue(record, 'user', 'User')),
    api_key: normalizeUsageEntityRef(getValue(record, 'api_key', 'APIKey')),
    group: normalizeUsageEntityRef(getValue(record, 'group', 'Group')),
    account: normalizeUsageAccountRef(getValue(record, 'account', 'Account')),
    created_at: getValue(record, 'created_at', 'CreatedAt') as string | undefined,
  };
}

function normalizeUsageStats(payload: unknown): AdminUsageStats {
  const record = asRecord(payload);
  return {
    total_requests: Number(getValue(record, 'total_requests', 'TotalRequests') ?? 0),
    total_input_tokens: Number(getValue(record, 'total_input_tokens', 'TotalInputTokens') ?? 0),
    total_output_tokens: Number(getValue(record, 'total_output_tokens', 'TotalOutputTokens') ?? 0),
    total_cache_tokens: Number(getValue(record, 'total_cache_tokens', 'TotalCacheTokens') ?? 0),
    total_tokens: Number(getValue(record, 'total_tokens', 'TotalTokens') ?? 0),
    total_cost: Number(getValue(record, 'total_cost', 'TotalCost') ?? 0),
    total_actual_cost: Number(getValue(record, 'total_actual_cost', 'TotalActualCost') ?? 0),
    average_duration_ms: Number(getValue(record, 'average_duration_ms', 'AverageDurationMs') ?? 0),
  };
}

function normalizeUsageCleanupTask(payload: unknown): AdminUsageCleanupTask {
  const record = asRecord(payload);
  const filters = asRecord(getValue(record, 'filters', 'Filters'));
  return {
    id: Number(getValue(record, 'id', 'ID') ?? 0),
    status: String(getValue(record, 'status', 'Status') ?? ''),
    filters: {
      start_time: getValue(filters, 'start_time', 'StartTime') as string | undefined,
      end_time: getValue(filters, 'end_time', 'EndTime') as string | undefined,
      user_id: (getValue(filters, 'user_id', 'UserID') as number | undefined) ?? undefined,
      api_key_id: (getValue(filters, 'api_key_id', 'APIKeyID') as number | undefined) ?? undefined,
      account_id: (getValue(filters, 'account_id', 'AccountID') as number | undefined) ?? undefined,
      group_id: (getValue(filters, 'group_id', 'GroupID') as number | undefined) ?? undefined,
      model: (getValue(filters, 'model', 'Model') as string | null | undefined) ?? null,
      request_type: (getValue(filters, 'request_type', 'RequestType') as string | null | undefined) ?? null,
      stream: (getValue(filters, 'stream', 'Stream') as boolean | null | undefined) ?? null,
      billing_type: (getValue(filters, 'billing_type', 'BillingType') as number | null | undefined) ?? null,
    },
    created_by: Number(getValue(record, 'created_by', 'CreatedBy') ?? 0),
    deleted_rows: Number(getValue(record, 'deleted_rows', 'DeletedRows') ?? 0),
    error_message: (getValue(record, 'error_message', 'ErrorMessage') as string | null | undefined) ?? null,
    canceled_by: (getValue(record, 'canceled_by', 'CanceledBy') as number | null | undefined) ?? null,
    canceled_at: (getValue(record, 'canceled_at', 'CanceledAt') as string | null | undefined) ?? null,
    started_at: (getValue(record, 'started_at', 'StartedAt') as string | null | undefined) ?? null,
    finished_at: (getValue(record, 'finished_at', 'FinishedAt') as string | null | undefined) ?? null,
    created_at: getValue(record, 'created_at', 'CreatedAt') as string | undefined,
    updated_at: getValue(record, 'updated_at', 'UpdatedAt') as string | undefined,
  };
}

export async function getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
  try {
    const snapshot = (await api.get('/admin/dashboard/snapshot-v2')) as AdminDashboardSnapshot;
    if (snapshot?.stats) {
      return snapshot;
    }
  } catch {
    // Fall through to stats endpoint.
  }
  const stats = (await api.get('/admin/dashboard/stats')) as AdminDashboardStats;
  return { stats };
}

export async function getAdminSystemVersion(): Promise<AdminSystemVersionInfo> {
  return (await api.get('/admin/system/version')) as AdminSystemVersionInfo;
}

export async function checkAdminSystemUpdates(force = false): Promise<AdminSystemUpdateInfo> {
  return (await api.get('/admin/system/check-updates', {
    params: force ? { force: 'true' } : undefined,
  })) as AdminSystemUpdateInfo;
}

export async function performAdminSystemUpdate(): Promise<AdminSystemOperationResult> {
  return (await api.post('/admin/system/update', {})) as AdminSystemOperationResult;
}

export async function rollbackAdminSystemUpdate(): Promise<AdminSystemOperationResult> {
  return (await api.post('/admin/system/rollback', {})) as AdminSystemOperationResult;
}

export async function restartAdminSystemService(): Promise<AdminSystemOperationResult> {
  return (await api.post('/admin/system/restart', {})) as AdminSystemOperationResult;
}

export async function listAdminUsers(params?: Record<string, unknown>): Promise<PaginatedResult<AdminUser>> {
  const payload = (await api.get('/admin/users', { params })) as unknown;
  return normalizePaginated<AdminUser>(payload);
}

export async function createAdminUser(payload: {
  email: string;
  password: string;
  username?: string;
  notes?: string;
  balance?: number;
  concurrency?: number;
  allowed_groups?: number[];
}): Promise<AdminUser> {
  return (await api.post('/admin/users', payload)) as AdminUser;
}

export async function updateAdminUser(id: number, payload: Record<string, unknown>): Promise<AdminUser> {
  return (await api.put(`/admin/users/${id}`, payload)) as AdminUser;
}

export async function deleteAdminUser(id: number): Promise<{ message?: string }> {
  return (await api.delete(`/admin/users/${id}`)) as { message?: string };
}

export async function updateAdminUserBalance(id: number, payload: {
  balance: number;
  operation: 'set' | 'add' | 'subtract';
  notes?: string;
}): Promise<AdminUser> {
  return (await api.post(`/admin/users/${id}/balance`, payload)) as AdminUser;
}

export async function listAdminUserApiKeys(
  id: number,
  params?: Record<string, unknown>
): Promise<PaginatedResult<AdminUserApiKey>> {
  const payload = (await api.get(`/admin/users/${id}/api-keys`, { params })) as unknown;
  return normalizePaginated<AdminUserApiKey>(payload);
}

export async function listAdminUserBalanceHistory(
  id: number,
  params?: Record<string, unknown>
): Promise<AdminUserBalanceHistoryResult> {
  const payload = unwrapData<Record<string, unknown>>((await api.get(`/admin/users/${id}/balance-history`, { params })) as unknown);
  const paginated = normalizePaginated<AdminUserBalanceHistoryItem>(payload);
  return {
    ...paginated,
    total_recharged:
      typeof payload?.total_recharged === 'number' ? payload.total_recharged : Number(payload?.total_recharged ?? 0),
  };
}

export async function getAdminUserUsageStats(
  id: number,
  params?: Record<string, unknown>
): Promise<AdminUserUsageStats> {
  return unwrapData<AdminUserUsageStats>((await api.get(`/admin/users/${id}/usage`, { params })) as unknown);
}

export async function listAdminGroups(params?: Record<string, unknown>): Promise<PaginatedResult<AdminGroup>> {
  const payload = (await api.get('/admin/groups', { params })) as unknown;
  return normalizePaginated<AdminGroup>(payload);
}

export async function listAdminRedeemCodes(params?: Record<string, unknown>): Promise<PaginatedResult<AdminRedeemCode>> {
  const payload = (await api.get('/admin/redeem-codes', { params })) as unknown;
  return normalizePaginated<AdminRedeemCode>(payload);
}

export async function listAdminPromoCodes(params?: Record<string, unknown>): Promise<PaginatedResult<AdminPromoCode>> {
  const payload = (await api.get('/admin/promo-codes', { params })) as unknown;
  return normalizePaginated<AdminPromoCode>(payload);
}

export async function getAdminPromoCode(id: number): Promise<AdminPromoCode> {
  return unwrapData<AdminPromoCode>((await api.get(`/admin/promo-codes/${id}`)) as unknown);
}

export async function createAdminPromoCode(payload: AdminCreatePromoCodePayload): Promise<AdminPromoCode> {
  return unwrapData<AdminPromoCode>((await api.post('/admin/promo-codes', payload)) as unknown);
}

export async function updateAdminPromoCode(id: number, payload: AdminUpdatePromoCodePayload): Promise<AdminPromoCode> {
  return unwrapData<AdminPromoCode>((await api.put(`/admin/promo-codes/${id}`, payload)) as unknown);
}

export async function deleteAdminPromoCode(id: number): Promise<{ message?: string }> {
  return unwrapData<{ message?: string }>((await api.delete(`/admin/promo-codes/${id}`)) as unknown) || {};
}

export async function listAdminPromoCodeUsages(
  id: number,
  params?: Record<string, unknown>
): Promise<PaginatedResult<AdminPromoCodeUsage>> {
  const payload = (await api.get(`/admin/promo-codes/${id}/usages`, { params })) as unknown;
  return normalizePaginated<AdminPromoCodeUsage>(payload);
}

export async function generateAdminRedeemCodes(payload: {
  count: number;
  type: AdminRedeemCodeType | 'balance' | 'concurrency' | 'subscription' | 'invitation';
  value: number;
  group_id?: number | null;
  validity_days?: number;
}): Promise<AdminRedeemCode[]> {
  return unwrapData<AdminRedeemCode[]>((await api.post('/admin/redeem-codes/generate', payload)) as unknown) || [];
}

export async function deleteAdminRedeemCode(id: number): Promise<{ message?: string }> {
  return unwrapData<{ message?: string }>((await api.delete(`/admin/redeem-codes/${id}`)) as unknown) || {};
}

export async function batchDeleteAdminRedeemCodes(ids: number[]): Promise<{ deleted: number; message?: string }> {
  return unwrapData<{ deleted: number; message?: string }>((await api.post('/admin/redeem-codes/batch-delete', { ids })) as unknown) || { deleted: 0 };
}

export async function expireAdminRedeemCode(id: number): Promise<AdminRedeemCode> {
  return unwrapData<AdminRedeemCode>((await api.post(`/admin/redeem-codes/${id}/expire`)) as unknown);
}

export async function exportAdminRedeemCodes(params?: Record<string, unknown>): Promise<Blob> {
  return (await api.get('/admin/redeem-codes/export', { params, responseType: 'blob' })) as Blob;
}

export async function createAdminGroup(payload: {
  name: string;
  description?: string;
  platform?: string;
  rate_multiplier?: number;
  is_exclusive?: boolean;
  subscription_type?: string;
  claude_code_only?: boolean;
  fallback_group_id?: number | null;
  fallback_group_id_on_invalid_request?: number | null;
  require_oauth_only?: boolean;
  require_privacy_set?: boolean;
  model_routing_enabled?: boolean;
}): Promise<AdminGroup> {
  return (await api.post('/admin/groups', payload)) as AdminGroup;
}

export async function updateAdminGroup(id: number, payload: Record<string, unknown>): Promise<AdminGroup> {
  return (await api.put(`/admin/groups/${id}`, payload)) as AdminGroup;
}

export async function deleteAdminGroup(id: number): Promise<{ message?: string }> {
  return (await api.delete(`/admin/groups/${id}`)) as { message?: string };
}

export async function listAdminGroupUsageSummary(params?: Record<string, unknown>): Promise<AdminGroupUsageSummary[]> {
  return unwrapData<AdminGroupUsageSummary[]>((await api.get('/admin/groups/usage-summary', { params })) as unknown) || [];
}

export async function listAdminGroupCapacitySummary(): Promise<AdminGroupCapacitySummary[]> {
  return unwrapData<AdminGroupCapacitySummary[]>((await api.get('/admin/groups/capacity-summary')) as unknown) || [];
}

export async function listAdminGroupRateMultipliers(id: number): Promise<AdminGroupRateMultiplierEntry[]> {
  return unwrapData<AdminGroupRateMultiplierEntry[]>((await api.get(`/admin/groups/${id}/rate-multipliers`)) as unknown) || [];
}

export async function batchSetAdminGroupRateMultipliers(
  id: number,
  entries: Array<{ user_id: number; rate_multiplier: number }>
): Promise<{ message?: string }> {
  return (await api.put(`/admin/groups/${id}/rate-multipliers`, { entries })) as { message?: string };
}

export async function clearAdminGroupRateMultipliers(id: number): Promise<{ message?: string }> {
  return (await api.delete(`/admin/groups/${id}/rate-multipliers`)) as { message?: string };
}

export async function listAdminChannels(params?: Record<string, unknown>): Promise<PaginatedResult<AdminChannel>> {
  const payload = (await api.get('/admin/channels', { params })) as unknown;
  return normalizePaginated<AdminChannel>(payload);
}

export async function getAdminChannel(id: number): Promise<AdminChannel> {
  return unwrapData<AdminChannel>((await api.get(`/admin/channels/${id}`)) as unknown);
}

export async function createAdminChannel(payload: {
  name: string;
  description?: string;
  group_ids?: number[];
  model_pricing?: AdminChannelModelPricing[];
  model_mapping?: Record<string, Record<string, string>>;
  billing_model_source?: string;
  restrict_models?: boolean;
  features_config?: Record<string, unknown>;
  apply_pricing_to_account_stats?: boolean;
  account_stats_pricing_rules?: AdminChannelAccountStatsPricingRule[];
}): Promise<AdminChannel> {
  return (await api.post('/admin/channels', payload)) as AdminChannel;
}

export async function updateAdminChannel(id: number, payload: Record<string, unknown>): Promise<AdminChannel> {
  return (await api.put(`/admin/channels/${id}`, payload)) as AdminChannel;
}

export async function deleteAdminChannel(id: number): Promise<{ message?: string }> {
  return (await api.delete(`/admin/channels/${id}`)) as { message?: string };
}

export async function listAdminSubscriptions(params?: Record<string, unknown>): Promise<PaginatedResult<AdminSubscription>> {
  const payload = (await api.get('/admin/subscriptions', { params })) as unknown;
  return normalizePaginated<AdminSubscription>(payload);
}

export async function getAdminSubscription(id: number): Promise<AdminSubscription> {
  return unwrapData<AdminSubscription>((await api.get(`/admin/subscriptions/${id}`)) as unknown);
}

export async function getAdminSubscriptionProgress(id: number): Promise<AdminSubscriptionProgress> {
  return unwrapData<AdminSubscriptionProgress>((await api.get(`/admin/subscriptions/${id}/progress`)) as unknown);
}

export async function assignAdminSubscription(payload: {
  user_id: number;
  group_id: number;
  validity_days?: number;
  notes?: string;
}): Promise<AdminSubscription> {
  return (await api.post('/admin/subscriptions/assign', payload)) as AdminSubscription;
}

export async function extendAdminSubscription(id: number, payload: { days: number }): Promise<AdminSubscription> {
  return (await api.post(`/admin/subscriptions/${id}/extend`, payload)) as AdminSubscription;
}

export async function resetAdminSubscriptionQuota(
  id: number,
  payload: { daily: boolean; weekly: boolean; monthly: boolean }
): Promise<AdminSubscription> {
  return (await api.post(`/admin/subscriptions/${id}/reset-quota`, payload)) as AdminSubscription;
}

export async function revokeAdminSubscription(id: number): Promise<{ message?: string }> {
  return (await api.delete(`/admin/subscriptions/${id}`)) as { message?: string };
}

export async function listAdminAccounts(params?: Record<string, unknown>): Promise<PaginatedResult<AdminAccount>> {
  const payload = (await api.get('/admin/accounts', { params })) as unknown;
  return normalizePaginated<AdminAccount>(payload);
}

export async function createAdminAccount(payload: AdminCreateAccountPayload): Promise<AdminAccount> {
  return (await api.post('/admin/accounts', payload)) as AdminAccount;
}

export async function generateAdminAccountAuthUrl(
  endpoint: string,
  payload: Record<string, unknown> = {}
): Promise<AdminAccountAuthUrlResult> {
  return unwrapData<AdminAccountAuthUrlResult>((await api.post(endpoint, payload)) as unknown);
}

export async function exchangeAdminAccountCode(
  endpoint: string,
  payload: AdminAccountAuthExchangePayload | Record<string, unknown>
): Promise<Record<string, unknown>> {
  return unwrapData<Record<string, unknown>>((await api.post(endpoint, payload)) as unknown);
}

export async function getGeminiOAuthCapabilities(): Promise<GeminiOAuthCapabilities | null> {
  try {
    return unwrapData<GeminiOAuthCapabilities>((await api.get('/admin/gemini/oauth/capabilities')) as unknown);
  } catch {
    return null;
  }
}

export async function getAdminAntigravityDefaultModelMapping(): Promise<Record<string, string>> {
  return unwrapData<Record<string, string>>(
    (await api.get('/admin/accounts/antigravity/default-model-mapping')) as unknown
  );
}

export async function listAdminTLSFingerprintProfiles(): Promise<AdminTLSFingerprintProfile[]> {
  const payload = unwrapData<unknown>((await api.get('/admin/tls-fingerprint-profiles')) as unknown);
  return normalizeArray<AdminTLSFingerprintProfile>(payload);
}

export async function listAdminProxies(params?: Record<string, unknown>): Promise<AdminProxy[]> {
  const payload = unwrapData<unknown>((await api.get('/admin/proxies/all', { params })) as unknown);
  return normalizeArray<AdminProxy>(payload);
}

export async function listAdminProxyPage(params?: Record<string, unknown>): Promise<PaginatedResult<AdminProxy>> {
  const payload = unwrapData<unknown>((await api.get('/admin/proxies', { params })) as unknown);
  return normalizePaginated<AdminProxy>(payload);
}

export async function createAdminProxy(payload: AdminCreateProxyPayload): Promise<AdminProxy> {
  return unwrapData<AdminProxy>((await api.post('/admin/proxies', payload)) as unknown);
}

export async function updateAdminProxy(id: number, payload: AdminUpdateProxyPayload): Promise<AdminProxy> {
  return unwrapData<AdminProxy>((await api.put(`/admin/proxies/${id}`, payload)) as unknown);
}

export async function deleteAdminProxy(id: number): Promise<{ message: string }> {
  return unwrapData<{ message: string }>((await api.delete(`/admin/proxies/${id}`)) as unknown);
}

export async function testAdminProxy(id: number): Promise<{
  success: boolean;
  message: string;
  latency_ms?: number;
  ip_address?: string;
  city?: string;
  region?: string;
  country?: string;
  country_code?: string;
}> {
  return unwrapData<{
    success: boolean;
    message: string;
    latency_ms?: number;
    ip_address?: string;
    city?: string;
    region?: string;
    country?: string;
    country_code?: string;
  }>((await api.post(`/admin/proxies/${id}/test`)) as unknown);
}

export async function checkAdminProxyQuality(id: number): Promise<AdminProxyQualityCheckResult> {
  return unwrapData<AdminProxyQualityCheckResult>((await api.post(`/admin/proxies/${id}/quality-check`)) as unknown);
}

export async function getAdminProxyAccounts(id: number): Promise<AdminProxyAccountSummary[]> {
  return unwrapData<AdminProxyAccountSummary[]>((await api.get(`/admin/proxies/${id}/accounts`)) as unknown) || [];
}

export async function batchCreateAdminProxies(
  proxies: Array<{
    protocol: string;
    host: string;
    port: number;
    username?: string;
    password?: string;
  }>
): Promise<{ created: number; skipped: number }> {
  return unwrapData<{ created: number; skipped: number }>((await api.post('/admin/proxies/batch', { proxies })) as unknown);
}

export async function batchDeleteAdminProxies(ids: number[]): Promise<{
  deleted_ids: number[];
  skipped: Array<{ id: number; reason: string }>;
}> {
  return unwrapData<{
    deleted_ids: number[];
    skipped: Array<{ id: number; reason: string }>;
  }>((await api.post('/admin/proxies/batch-delete', { ids })) as unknown);
}

export async function exportAdminProxyData(options?: {
  ids?: number[];
  filters?: {
    protocol?: string;
    status?: string;
    search?: string;
    sort_by?: string;
    sort_order?: string;
  };
}): Promise<AdminProxyDataPayload> {
  const params: Record<string, string> = {};
  if (options?.ids && options.ids.length > 0) {
    params.ids = options.ids.join(',');
  } else if (options?.filters) {
    const { protocol, status, search, sort_by, sort_order } = options.filters;
    if (protocol) params.protocol = protocol;
    if (status) params.status = status;
    if (search) params.search = search;
    if (sort_by) params.sort_by = sort_by;
    if (sort_order) params.sort_order = sort_order;
  }
  return unwrapData<AdminProxyDataPayload>((await api.get('/admin/proxies/data', { params })) as unknown);
}

export async function importAdminProxyData(payload: {
  data: AdminProxyDataPayload;
}): Promise<AdminProxyDataImportResult> {
  return unwrapData<AdminProxyDataImportResult>((await api.post('/admin/proxies/data', payload)) as unknown);
}

export async function updateAdminAccount(id: number, payload: Record<string, unknown>): Promise<AdminAccount> {
  return (await api.put(`/admin/accounts/${id}`, payload)) as AdminAccount;
}

export async function testAdminAccount(id: number) {
  return (await api.post(`/admin/accounts/${id}/test`)) as {
    success: boolean;
    message: string;
    latency_ms?: number;
  };
}

export async function getAdminSettings(): Promise<SystemSettings> {
  return unwrapData<SystemSettings>((await api.get('/admin/settings')) as unknown);
}

export async function updateAdminSettings(payload: Record<string, unknown>): Promise<SystemSettings> {
  return unwrapData<SystemSettings>((await api.put('/admin/settings', payload)) as unknown);
}

export async function testAdminSMTPConnection(payload: {
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_use_tls?: boolean;
}): Promise<{ message: string }> {
  return unwrapData<{ message: string }>((await api.post('/admin/settings/test-smtp', payload)) as unknown);
}

export async function sendAdminTestEmail(payload: {
  email: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_from_email?: string;
  smtp_from_name?: string;
  smtp_use_tls?: boolean;
}): Promise<{ message: string }> {
  return unwrapData<{ message: string }>((await api.post('/admin/settings/send-test-email', payload)) as unknown);
}

export async function getAdminAPIKeyStatus(): Promise<AdminAPIKeyStatus> {
  return unwrapData<AdminAPIKeyStatus>((await api.get('/admin/settings/admin-api-key')) as unknown);
}

export async function regenerateAdminAPIKey(): Promise<{ key: string }> {
  return unwrapData<{ key: string }>((await api.post('/admin/settings/admin-api-key/regenerate')) as unknown);
}

export async function deleteAdminAPIKey(): Promise<{ message: string }> {
  return unwrapData<{ message: string }>((await api.delete('/admin/settings/admin-api-key')) as unknown);
}

export async function listAdminAnnouncements(
  params?: Record<string, unknown>
): Promise<PaginatedResult<AdminAnnouncement>> {
  const payload = (await api.get('/admin/announcements', { params })) as unknown;
  return normalizePaginated<AdminAnnouncement>(payload);
}

export async function createAdminAnnouncement(payload: {
  title: string;
  content: string;
  status?: string;
  notify_mode?: string;
}): Promise<AdminAnnouncement> {
  return (await api.post('/admin/announcements', payload)) as AdminAnnouncement;
}

export async function listAdminNews(params?: Record<string, unknown>): Promise<PaginatedResult<AdminNewsPost>> {
  const payload = (await api.get('/admin/news', { params })) as unknown;
  return normalizePaginated<AdminNewsPost>(payload);
}

export async function createAdminNews(payload: {
  slug: string;
  status?: string;
  default_locale: string;
  cover_image_url?: string | null;
  author_name?: string | null;
  published_at?: number | null;
  translations: Array<{
    locale: string;
    title: string;
    summary: string;
    content: string;
    seo_title?: string | null;
    seo_description?: string | null;
    translation_status?: string;
  }>;
}): Promise<AdminNewsPost> {
  return (await api.post('/admin/news', payload)) as AdminNewsPost;
}

export async function updateAdminNews(
  id: number,
  payload: {
    slug?: string;
    status?: string;
    default_locale?: string;
    cover_image_url?: string | null;
    author_name?: string | null;
    published_at?: number | null;
    translations?: Array<{
      locale: string;
      title: string;
      summary: string;
      content: string;
      seo_title?: string | null;
      seo_description?: string | null;
      translation_status?: string;
    }>;
  }
): Promise<AdminNewsPost> {
  return (await api.put(`/admin/news/${id}`, payload)) as AdminNewsPost;
}

export async function deleteAdminNews(id: number): Promise<{ message?: string }> {
  return (await api.delete(`/admin/news/${id}`)) as { message?: string };
}

export async function aiTranslateAdminNews(
  id: number,
  locale: string,
  payload?: { source_locale?: string }
): Promise<AdminNewsAITranslateResult> {
  return (await api.post(`/admin/news/${id}/translations/${encodeURIComponent(locale)}/ai-translate`, payload || {})) as AdminNewsAITranslateResult;
}

export async function listAdminAffiliateCommissions(
  params?: Record<string, unknown>
): Promise<PaginatedResult<AdminCommissionLog>> {
  const payload = unwrapData<unknown>((await api.get('/admin/affiliate/commissions', { params })) as unknown);
  const record = asRecord(payload);
  const pagination = asRecord(record?.pagination);
  const items = normalizeArray<ApiRecord>(payload).map(normalizeCommissionLog);
  return {
    items,
    total: Number(getValue(pagination, 'total', 'Total') ?? getValue(record, 'total') ?? items.length ?? 0),
    page: Number(getValue(pagination, 'page', 'Page') ?? getValue(record, 'page') ?? params?.page ?? 1),
    pageSize: Number(
      getValue(pagination, 'page_size', 'pageSize', 'PageSize') ??
        getValue(record, 'page_size') ??
        params?.page_size ??
        items.length ??
        0
    ),
  };
}

export async function settleAdminAffiliateCommission(id: number): Promise<{ message: string }> {
  return (await api.post(`/admin/affiliate/commissions/${id}/settle`)) as { message: string };
}

export async function updateAdminAffiliateUserRate(
  id: number,
  rate: number
): Promise<{ message: string }> {
  return (await api.post(`/admin/affiliate/users/${id}/rate`, { rate })) as { message: string };
}

export async function listAdminPaymentOrders(
  params?: Record<string, unknown>
): Promise<PaginatedResult<AdminPaymentOrder>> {
  const payload = unwrapData<unknown>((await api.get('/admin/payment/orders', { params })) as unknown);
  const record = asRecord(payload);
  const pagination = asRecord(record?.pagination);
  const items = normalizeArray<ApiRecord>(payload).map(normalizePaymentOrder);
  return {
    items,
    total: Number(getValue(pagination, 'total', 'Total') ?? getValue(record, 'total') ?? items.length ?? 0),
    page: Number(getValue(pagination, 'page', 'Page') ?? getValue(record, 'page') ?? params?.page ?? 1),
    pageSize: Number(
      getValue(pagination, 'page_size', 'pageSize', 'PageSize') ??
        getValue(record, 'page_size') ??
        params?.page_size ??
        items.length ??
        0
    ),
  };
}

export async function getAdminPaymentOrder(
  id: number
): Promise<{ order: AdminPaymentOrder; auditLogs: AdminOrderAuditLog[] }> {
  const payload = unwrapData<unknown>((await api.get(`/admin/payment/orders/${id}`)) as unknown);
  const record = asRecord(payload);
  return {
    order: normalizePaymentOrder(getValue(record, 'order') ?? payload),
    auditLogs: normalizeArray<ApiRecord>(getValue(record, 'auditLogs', 'audit_logs')).map(normalizeOrderAuditLog),
  };
}

export async function cancelAdminPaymentOrder(id: number): Promise<{ message: string }> {
  return (await api.post(`/admin/payment/orders/${id}/cancel`)) as { message: string };
}

export async function retryAdminPaymentOrder(id: number): Promise<{ message: string }> {
  return (await api.post(`/admin/payment/orders/${id}/retry`)) as { message: string };
}

export async function refundAdminPaymentOrder(
  id: number,
  payload: { amount: number; reason: string; deduct_balance?: boolean; force?: boolean }
): Promise<{ message?: string }> {
  return (await api.post(`/admin/payment/orders/${id}/refund`, payload)) as { message?: string };
}

export async function getAdminPaymentDashboard(days = 30): Promise<AdminPaymentDashboardStats> {
  const payload = unwrapData<unknown>((await api.get('/admin/payment/dashboard', {
    params: { days },
  })) as unknown);
  return normalizePaymentDashboardStats(payload);
}

export async function listAdminPaymentProviders(): Promise<AdminPaymentProviderInstance[]> {
  return unwrapData<AdminPaymentProviderInstance[]>((await api.get('/admin/payment/providers')) as unknown) || [];
}

export async function createAdminPaymentProvider(
  payload: AdminCreatePaymentProviderPayload
): Promise<AdminPaymentProviderInstance> {
  return unwrapData<AdminPaymentProviderInstance>((await api.post('/admin/payment/providers', payload)) as unknown);
}

export async function updateAdminPaymentProvider(
  id: number,
  payload: AdminUpdatePaymentProviderPayload
): Promise<AdminPaymentProviderInstance> {
  return unwrapData<AdminPaymentProviderInstance>((await api.put(`/admin/payment/providers/${id}`, payload)) as unknown);
}

export async function deleteAdminPaymentProvider(id: number): Promise<{ message?: string }> {
  return unwrapData<{ message?: string }>((await api.delete(`/admin/payment/providers/${id}`)) as unknown) || {};
}

export async function listAdminPaymentPlans(): Promise<AdminSubscriptionPlan[]> {
  const payload = unwrapData<unknown>((await api.get('/admin/payment/plans')) as unknown);
  return normalizeArray<ApiRecord>(payload).map(normalizeSubscriptionPlan);
}

export async function createAdminPaymentPlan(payload: {
  group_id: number;
  name: string;
  description?: string;
  price: number;
  original_price?: number;
  validity_days: number;
  validity_unit: string;
  features?: string;
  product_name?: string;
  for_sale?: boolean;
  sort_order?: number;
}): Promise<AdminSubscriptionPlan> {
  return normalizeSubscriptionPlan((await api.post('/admin/payment/plans', payload)) as unknown);
}

export async function updateAdminPaymentPlan(
  id: number,
  payload: Record<string, unknown>
): Promise<AdminSubscriptionPlan> {
  return normalizeSubscriptionPlan((await api.put(`/admin/payment/plans/${id}`, payload)) as unknown);
}

export async function deleteAdminPaymentPlan(id: number): Promise<{ message?: string }> {
  return (await api.delete(`/admin/payment/plans/${id}`)) as { message?: string };
}

export async function listAdminUsageLogs(
  params?: Record<string, unknown>
): Promise<PaginatedResult<AdminUsageLog>> {
  const payload = unwrapData<unknown>((await api.get('/admin/usage', { params })) as unknown);
  const record = asRecord(payload);
  const pagination = asRecord(record?.pagination);
  const items = normalizeArray<ApiRecord>(payload).map(normalizeUsageLog);
  return {
    items,
    total: Number(getValue(pagination, 'total', 'Total') ?? getValue(record, 'total') ?? items.length ?? 0),
    page: Number(getValue(pagination, 'page', 'Page') ?? getValue(record, 'page') ?? params?.page ?? 1),
    pageSize: Number(
      getValue(pagination, 'page_size', 'pageSize', 'PageSize') ??
        getValue(record, 'page_size') ??
        params?.page_size ??
        items.length ??
        0
    ),
  };
}

export async function getAdminUsageStats(params?: Record<string, unknown>): Promise<AdminUsageStats> {
  const payload = unwrapData<unknown>((await api.get('/admin/usage/stats', { params })) as unknown);
  return normalizeUsageStats(payload);
}

export async function listAdminUsageCleanupTasks(
  params?: Record<string, unknown>
): Promise<PaginatedResult<AdminUsageCleanupTask>> {
  const payload = unwrapData<unknown>((await api.get('/admin/usage/cleanup-tasks', { params })) as unknown);
  const record = asRecord(payload);
  const pagination = asRecord(record?.pagination);
  const items = normalizeArray<ApiRecord>(payload).map(normalizeUsageCleanupTask);
  return {
    items,
    total: Number(getValue(pagination, 'total', 'Total') ?? getValue(record, 'total') ?? items.length ?? 0),
    page: Number(getValue(pagination, 'page', 'Page') ?? getValue(record, 'page') ?? params?.page ?? 1),
    pageSize: Number(
      getValue(pagination, 'page_size', 'pageSize', 'PageSize') ??
        getValue(record, 'page_size') ??
        params?.page_size ??
        items.length ??
        0
    ),
  };
}

export async function createAdminUsageCleanupTask(payload: {
  start_date: string;
  end_date: string;
  user_id?: number;
  api_key_id?: number;
  account_id?: number;
  group_id?: number;
  model?: string | null;
  request_type?: string | null;
  stream?: boolean | null;
  billing_type?: number | null;
  timezone?: string;
}): Promise<AdminUsageCleanupTask> {
  return normalizeUsageCleanupTask((await api.post('/admin/usage/cleanup-tasks', payload)) as unknown);
}

export async function cancelAdminUsageCleanupTask(
  id: number
): Promise<{ id: number; status: string; message?: string }> {
  return (await api.post(`/admin/usage/cleanup-tasks/${id}/cancel`)) as {
    id: number;
    status: string;
    message?: string;
  };
}
