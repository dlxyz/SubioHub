'use client';

import { api } from '@/lib/api';

type ApiRecord = Record<string, unknown>;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type OpsQueryMode = 'auto' | 'raw' | 'preagg';
export type OpsTimeRange = '5m' | '30m' | '1h' | '6h' | '24h';
export type OpsLogTimeRange = OpsTimeRange | '7d' | '30d';

export interface AdminOpsDashboardQuery {
  time_range?: OpsTimeRange;
  start_time?: string;
  end_time?: string;
  platform?: string;
  group_id?: number | null;
  mode?: OpsQueryMode;
}

export interface AdminOpsPercentiles {
  p50_ms?: number | null;
  p90_ms?: number | null;
  p95_ms?: number | null;
  p99_ms?: number | null;
  avg_ms?: number | null;
  max_ms?: number | null;
}

export interface AdminOpsSystemMetricsSnapshot {
  id: number;
  created_at: string;
  window_minutes: number;
  cpu_usage_percent?: number | null;
  memory_used_mb?: number | null;
  memory_total_mb?: number | null;
  memory_usage_percent?: number | null;
  db_ok?: boolean | null;
  redis_ok?: boolean | null;
  db_max_open_conns?: number | null;
  redis_pool_size?: number | null;
  redis_conn_total?: number | null;
  redis_conn_idle?: number | null;
  db_conn_active?: number | null;
  db_conn_idle?: number | null;
  db_conn_waiting?: number | null;
  goroutine_count?: number | null;
  concurrency_queue_depth?: number | null;
  account_switch_count?: number | null;
}

export interface AdminOpsJobHeartbeat {
  job_name: string;
  last_run_at?: string | null;
  last_success_at?: string | null;
  last_error_at?: string | null;
  last_error?: string | null;
  last_duration_ms?: number | null;
  last_result?: string | null;
  updated_at: string;
}

export interface AdminOpsDashboardOverview {
  start_time: string;
  end_time: string;
  platform: string;
  group_id?: number | null;
  health_score?: number;
  system_metrics?: AdminOpsSystemMetricsSnapshot | null;
  job_heartbeats?: AdminOpsJobHeartbeat[] | null;
  success_count: number;
  error_count_total: number;
  business_limited_count: number;
  error_count_sla: number;
  request_count_total: number;
  request_count_sla: number;
  token_consumed: number;
  sla: number;
  error_rate: number;
  upstream_error_rate: number;
  upstream_error_count_excl_429_529: number;
  upstream_429_count: number;
  upstream_529_count: number;
  qps: {
    current: number;
    peak: number;
    avg: number;
  };
  tps: {
    current: number;
    peak: number;
    avg: number;
  };
  duration: AdminOpsPercentiles;
  ttft: AdminOpsPercentiles;
}

export interface AdminOpsThroughputTrendPoint {
  bucket_start: string;
  request_count: number;
  token_consumed: number;
  switch_count?: number;
  qps: number;
  tps: number;
}

export interface AdminOpsThroughputPlatformBreakdownItem {
  platform: string;
  request_count: number;
  token_consumed: number;
}

export interface AdminOpsThroughputGroupBreakdownItem {
  group_id: number;
  group_name: string;
  request_count: number;
  token_consumed: number;
}

export interface AdminOpsThroughputTrendResponse {
  bucket: string;
  points: AdminOpsThroughputTrendPoint[];
  by_platform?: AdminOpsThroughputPlatformBreakdownItem[];
  top_groups?: AdminOpsThroughputGroupBreakdownItem[];
}

export interface AdminOpsLatencyHistogramBucket {
  range: string;
  count: number;
}

export interface AdminOpsLatencyHistogramResponse {
  start_time: string;
  end_time: string;
  platform: string;
  group_id?: number | null;
  total_requests: number;
  buckets: AdminOpsLatencyHistogramBucket[];
}

export interface AdminOpsErrorTrendPoint {
  bucket_start: string;
  error_count_total: number;
  business_limited_count: number;
  error_count_sla: number;
  upstream_error_count_excl_429_529: number;
  upstream_429_count: number;
  upstream_529_count: number;
}

export interface AdminOpsErrorTrendResponse {
  bucket: string;
  points: AdminOpsErrorTrendPoint[];
}

export interface AdminOpsErrorDistributionItem {
  status_code: number;
  total: number;
  sla: number;
  business_limited: number;
}

export interface AdminOpsErrorDistributionResponse {
  total: number;
  items: AdminOpsErrorDistributionItem[];
}

export interface AdminOpsDashboardSnapshotResponse {
  generated_at: string;
  overview: AdminOpsDashboardOverview;
  throughput_trend: AdminOpsThroughputTrendResponse;
  error_trend: AdminOpsErrorTrendResponse;
}

export interface AdminOpsMetricThresholds {
  sla_percent_min?: number | null;
  ttft_p99_ms_max?: number | null;
  request_error_rate_percent_max?: number | null;
  upstream_error_rate_percent_max?: number | null;
}

export interface AdminOpsRuntimeLogConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  enable_sampling: boolean;
  sampling_initial: number;
  sampling_thereafter: number;
  caller: boolean;
  stacktrace_level: 'none' | 'error' | 'fatal';
  retention_days: number;
  source?: string;
  updated_at?: string;
  updated_by_user_id?: number;
}

export interface AdminOpsSystemLog {
  id: number;
  created_at: string;
  level: string;
  component: string;
  message: string;
  request_id?: string;
  client_request_id?: string;
  user_id?: number | null;
  account_id?: number | null;
  platform?: string;
  model?: string;
  extra?: Record<string, unknown>;
}

export interface AdminOpsSystemLogQuery {
  page?: number;
  page_size?: number;
  time_range?: OpsLogTimeRange;
  start_time?: string;
  end_time?: string;
  level?: string;
  component?: string;
  request_id?: string;
  client_request_id?: string;
  user_id?: number | null;
  account_id?: number | null;
  platform?: string;
  model?: string;
  q?: string;
}

export interface AdminOpsSystemLogCleanupRequest {
  start_time?: string;
  end_time?: string;
  level?: string;
  component?: string;
  request_id?: string;
  client_request_id?: string;
  user_id?: number | null;
  account_id?: number | null;
  platform?: string;
  model?: string;
  q?: string;
}

export interface AdminOpsSystemLogSinkHealth {
  queue_depth: number;
  queue_capacity: number;
  dropped_count: number;
  write_failed_count: number;
  written_count: number;
  avg_write_delay_ms: number;
  last_error?: string;
}

export type AdminOpsSeverity = 'P0' | 'P1' | 'P2' | 'P3' | string;
export type AdminOpsMetricType =
  | 'success_rate'
  | 'error_rate'
  | 'upstream_error_rate'
  | 'cpu_usage_percent'
  | 'memory_usage_percent'
  | 'concurrency_queue_depth'
  | 'group_available_accounts'
  | 'group_available_ratio'
  | 'group_rate_limit_ratio'
  | 'account_rate_limited_count'
  | 'account_error_count'
  | 'account_error_ratio'
  | 'overload_account_count';
export type AdminOpsOperator = '>' | '>=' | '<' | '<=' | '==' | '!=';
export type AdminOpsAlertEventStatus = 'firing' | 'resolved' | 'manual_resolved' | string;

export interface AdminOpsAlertRule {
  id?: number;
  name: string;
  description?: string;
  enabled: boolean;
  metric_type: AdminOpsMetricType;
  operator: AdminOpsOperator;
  threshold: number;
  window_minutes: number;
  sustained_minutes: number;
  severity: AdminOpsSeverity;
  cooldown_minutes: number;
  notify_email: boolean;
  filters?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  last_triggered_at?: string | null;
}

export interface AdminOpsAlertEvent {
  id: number;
  rule_id: number;
  severity: AdminOpsSeverity;
  status: AdminOpsAlertEventStatus;
  title?: string;
  description?: string;
  metric_value?: number;
  threshold_value?: number;
  dimensions?: Record<string, unknown>;
  fired_at: string;
  resolved_at?: string | null;
  email_sent: boolean;
  created_at: string;
}

export interface AdminOpsAlertEventsQuery {
  limit?: number;
  status?: string;
  severity?: string;
  email_sent?: boolean;
  time_range?: OpsLogTimeRange;
  start_time?: string;
  end_time?: string;
  before_fired_at?: string;
  before_id?: number;
  platform?: string;
  group_id?: number;
}

export interface AdminOpsCreateAlertSilencePayload {
  rule_id: number;
  platform: string;
  group_id?: number | null;
  region?: string | null;
  until: string;
  reason?: string;
}

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
  if (Array.isArray(unwrapped)) {
    return unwrapped as T[];
  }
  const record = asRecord(unwrapped);
  for (const key of ['items', 'data', 'list', 'results']) {
    const value = record?.[key];
    if (Array.isArray(value)) {
      return value as T[];
    }
  }
  return [];
}

function normalizePaginated<T>(payload: unknown): PaginatedResult<T> {
  const unwrapped = unwrapData<unknown>(payload);
  const record = asRecord(unwrapped);
  const pagination = asRecord(record?.pagination);
  const items = normalizeArray<T>(unwrapped);

  return {
    items,
    total: Number(getValue(record, 'total', 'count') ?? getValue(pagination, 'total', 'Total') ?? items.length ?? 0),
    page: Number(getValue(record, 'page', 'Page') ?? getValue(pagination, 'page', 'Page') ?? 1),
    pageSize: Number(
      getValue(record, 'page_size', 'pageSize', 'PageSize') ??
        getValue(pagination, 'page_size', 'pageSize', 'PageSize') ??
        items.length ??
        0
    ),
  };
}

export async function getAdminOpsDashboardSnapshot(
  params: AdminOpsDashboardQuery
): Promise<AdminOpsDashboardSnapshotResponse> {
  return unwrapData<AdminOpsDashboardSnapshotResponse>(
    (await api.get('/admin/ops/dashboard/snapshot-v2', { params })) as unknown
  );
}

export async function getAdminOpsLatencyHistogram(
  params: AdminOpsDashboardQuery
): Promise<AdminOpsLatencyHistogramResponse> {
  return unwrapData<AdminOpsLatencyHistogramResponse>(
    (await api.get('/admin/ops/dashboard/latency-histogram', { params })) as unknown
  );
}

export async function getAdminOpsErrorDistribution(
  params: AdminOpsDashboardQuery
): Promise<AdminOpsErrorDistributionResponse> {
  return unwrapData<AdminOpsErrorDistributionResponse>(
    (await api.get('/admin/ops/dashboard/error-distribution', { params })) as unknown
  );
}

export async function getAdminOpsMetricThresholds(): Promise<AdminOpsMetricThresholds> {
  return unwrapData<AdminOpsMetricThresholds>(
    (await api.get('/admin/ops/settings/metric-thresholds')) as unknown
  );
}

export async function getAdminOpsRuntimeLogConfig(): Promise<AdminOpsRuntimeLogConfig> {
  return unwrapData<AdminOpsRuntimeLogConfig>(
    (await api.get('/admin/ops/runtime/logging')) as unknown
  );
}

export async function updateAdminOpsRuntimeLogConfig(
  payload: AdminOpsRuntimeLogConfig
): Promise<AdminOpsRuntimeLogConfig> {
  return unwrapData<AdminOpsRuntimeLogConfig>(
    (await api.put('/admin/ops/runtime/logging', payload)) as unknown
  );
}

export async function resetAdminOpsRuntimeLogConfig(): Promise<AdminOpsRuntimeLogConfig> {
  return unwrapData<AdminOpsRuntimeLogConfig>(
    (await api.post('/admin/ops/runtime/logging/reset')) as unknown
  );
}

export async function listAdminOpsSystemLogs(
  params: AdminOpsSystemLogQuery
): Promise<PaginatedResult<AdminOpsSystemLog>> {
  const payload = (await api.get('/admin/ops/system-logs', { params })) as unknown;
  return normalizePaginated<AdminOpsSystemLog>(payload);
}

export async function cleanupAdminOpsSystemLogs(
  payload: AdminOpsSystemLogCleanupRequest
): Promise<{ deleted: number }> {
  return unwrapData<{ deleted: number }>(
    (await api.post('/admin/ops/system-logs/cleanup', payload)) as unknown
  );
}

export async function getAdminOpsSystemLogSinkHealth(): Promise<AdminOpsSystemLogSinkHealth> {
  return unwrapData<AdminOpsSystemLogSinkHealth>(
    (await api.get('/admin/ops/system-logs/health')) as unknown
  );
}

export async function listAdminOpsAlertRules(): Promise<AdminOpsAlertRule[]> {
  return normalizeArray<AdminOpsAlertRule>((await api.get('/admin/ops/alert-rules')) as unknown);
}

export async function createAdminOpsAlertRule(payload: AdminOpsAlertRule): Promise<AdminOpsAlertRule> {
  return unwrapData<AdminOpsAlertRule>((await api.post('/admin/ops/alert-rules', payload)) as unknown);
}

export async function updateAdminOpsAlertRule(id: number, payload: AdminOpsAlertRule): Promise<AdminOpsAlertRule> {
  return unwrapData<AdminOpsAlertRule>((await api.put(`/admin/ops/alert-rules/${id}`, payload)) as unknown);
}

export async function deleteAdminOpsAlertRule(id: number): Promise<{ deleted?: boolean }> {
  return unwrapData<{ deleted?: boolean }>((await api.delete(`/admin/ops/alert-rules/${id}`)) as unknown) || {};
}

export async function listAdminOpsAlertEvents(
  params: AdminOpsAlertEventsQuery
): Promise<AdminOpsAlertEvent[]> {
  return normalizeArray<AdminOpsAlertEvent>((await api.get('/admin/ops/alert-events', { params })) as unknown);
}

export async function getAdminOpsAlertEvent(id: number): Promise<AdminOpsAlertEvent> {
  return unwrapData<AdminOpsAlertEvent>((await api.get(`/admin/ops/alert-events/${id}`)) as unknown);
}

export async function updateAdminOpsAlertEventStatus(
  id: number,
  status: 'resolved' | 'manual_resolved'
): Promise<{ updated?: boolean }> {
  return unwrapData<{ updated?: boolean }>(
    (await api.put(`/admin/ops/alert-events/${id}/status`, { status })) as unknown
  ) || {};
}

export async function createAdminOpsAlertSilence(
  payload: AdminOpsCreateAlertSilencePayload
): Promise<Record<string, unknown>> {
  return unwrapData<Record<string, unknown>>(
    (await api.post('/admin/ops/alert-silences', payload)) as unknown
  ) || {};
}
