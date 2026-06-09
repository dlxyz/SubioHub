'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  FileText,
  Gauge,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { cn } from '@/lib/utils';
import {
  getAdminSettings,
  listAdminGroups,
  type AdminGroup,
} from '@/lib/admin-api';
import {
  createAdminOpsAlertRule,
  createAdminOpsAlertSilence,
  cleanupAdminOpsSystemLogs,
  deleteAdminOpsAlertRule,
  getAdminOpsAlertEvent,
  getAdminOpsDashboardSnapshot,
  getAdminOpsErrorDistribution,
  getAdminOpsLatencyHistogram,
  getAdminOpsMetricThresholds,
  getAdminOpsRuntimeLogConfig,
  getAdminOpsSystemLogSinkHealth,
  listAdminOpsAlertEvents,
  listAdminOpsAlertRules,
  listAdminOpsSystemLogs,
  resetAdminOpsRuntimeLogConfig,
  type AdminOpsAlertEvent,
  type AdminOpsAlertEventsQuery,
  type AdminOpsAlertRule,
  type AdminOpsMetricType,
  type AdminOpsOperator,
  type AdminOpsSeverity,
  type AdminOpsDashboardQuery,
  type AdminOpsDashboardSnapshotResponse,
  type AdminOpsErrorDistributionResponse,
  type AdminOpsLatencyHistogramResponse,
  type AdminOpsMetricThresholds,
  type AdminOpsRuntimeLogConfig,
  type AdminOpsSystemLog,
  type AdminOpsSystemLogQuery,
  type AdminOpsSystemLogSinkHealth,
  type OpsLogTimeRange,
  type OpsQueryMode,
  type OpsTimeRange,
  updateAdminOpsAlertEventStatus,
  updateAdminOpsAlertRule,
  updateAdminOpsRuntimeLogConfig,
} from '@/lib/admin-ops-api';

type TabKey = 'overview' | 'alerts' | 'logs';
type MessageState = { type: 'success' | 'error'; text: string } | null;
type MetricGroup = 'system' | 'group' | 'account';

type LogFilters = {
  time_range: OpsLogTimeRange;
  start_time: string;
  end_time: string;
  level: string;
  component: string;
  request_id: string;
  client_request_id: string;
  user_id: string;
  account_id: string;
  platform: string;
  model: string;
  q: string;
};

type AlertRuleFilters = {
  group_id?: number;
};

type AlertRuleDraft = Omit<AdminOpsAlertRule, 'filters'> & {
  filters?: AlertRuleFilters;
};

type AlertEventFilters = {
  time_range: OpsLogTimeRange;
  severity: string;
  status: string;
  email_sent: '' | 'true' | 'false';
};

type MetricDefinition = {
  type: AdminOpsMetricType;
  group: MetricGroup;
  label: string;
  description: string;
  recommendedOperator: AdminOpsOperator;
  recommendedThreshold: number;
  unit?: string;
};

const DASHBOARD_TIME_RANGES: OpsTimeRange[] = ['5m', '30m', '1h', '6h', '24h'];
const LOG_TIME_RANGES: OpsLogTimeRange[] = ['5m', '30m', '1h', '6h', '24h', '7d', '30d'];
const QUERY_MODES: OpsQueryMode[] = ['auto', 'raw', 'preagg'];
const RUNTIME_LEVELS: AdminOpsRuntimeLogConfig['level'][] = ['debug', 'info', 'warn', 'error'];
const STACKTRACE_LEVELS: AdminOpsRuntimeLogConfig['stacktrace_level'][] = ['none', 'error', 'fatal'];
const PAGE_SIZE_OPTIONS = [20, 50, 100];

const EMPTY_HEALTH: AdminOpsSystemLogSinkHealth = {
  queue_depth: 0,
  queue_capacity: 0,
  dropped_count: 0,
  write_failed_count: 0,
  written_count: 0,
  avg_write_delay_ms: 0,
};

const EMPTY_RUNTIME_CONFIG: AdminOpsRuntimeLogConfig = {
  level: 'info',
  enable_sampling: false,
  sampling_initial: 100,
  sampling_thereafter: 100,
  caller: true,
  stacktrace_level: 'error',
  retention_days: 30,
};

const DEFAULT_LOG_FILTERS: LogFilters = {
  time_range: '1h',
  start_time: '',
  end_time: '',
  level: '',
  component: '',
  request_id: '',
  client_request_id: '',
  user_id: '',
  account_id: '',
  platform: '',
  model: '',
  q: '',
};

const DEFAULT_ALERT_EVENT_FILTERS: AlertEventFilters = {
  time_range: '24h',
  severity: '',
  status: '',
  email_sent: '',
};

const ALERT_RULE_WINDOW_OPTIONS = [1, 5, 60];
const ALERT_EVENT_PAGE_SIZE = 10;
const ALERT_HISTORY_RANGE_OPTIONS: OpsLogTimeRange[] = ['7d', '30d'];
const ALERT_SILENCE_OPTIONS = ['1h', '24h', '7d'] as const;
const ALERT_SEVERITIES: AdminOpsSeverity[] = ['P0', 'P1', 'P2', 'P3'];
const ALERT_OPERATORS: AdminOpsOperator[] = ['>', '>=', '<', '<=', '==', '!='];
const GROUP_METRIC_TYPES = new Set<AdminOpsMetricType>([
  'group_available_accounts',
  'group_available_ratio',
  'group_rate_limit_ratio',
]);

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function parsePositiveInt(value: string) {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toRFC3339(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function durationToUntilRFC3339(duration: (typeof ALERT_SILENCE_OPTIONS)[number]) {
  const now = Date.now();
  if (duration === '1h') return new Date(now + 60 * 60 * 1000).toISOString();
  if (duration === '24h') return new Date(now + 24 * 60 * 60 * 1000).toISOString();
  return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
}

function getExtraString(extra: Record<string, unknown> | undefined, key: string) {
  if (!extra) return '';
  const value = extra[key];
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function formatSystemLogDetail(row: AdminOpsSystemLog) {
  const parts: string[] = [];
  const message = String(row.message || '').trim();
  if (message) parts.push(message);

  const extra = row.extra || {};
  const statusCode = getExtraString(extra, 'status_code');
  const latencyMs = getExtraString(extra, 'latency_ms');
  const method = getExtraString(extra, 'method');
  const path = getExtraString(extra, 'path');
  const clientIP = getExtraString(extra, 'client_ip');
  const protocol = getExtraString(extra, 'protocol');

  const accessParts: string[] = [];
  if (statusCode) accessParts.push(`status=${statusCode}`);
  if (latencyMs) accessParts.push(`latency_ms=${latencyMs}`);
  if (method) accessParts.push(`method=${method}`);
  if (path) accessParts.push(`path=${path}`);
  if (clientIP) accessParts.push(`ip=${clientIP}`);
  if (protocol) accessParts.push(`proto=${protocol}`);
  if (accessParts.length > 0) parts.push(accessParts.join(' '));

  const correlationParts: string[] = [];
  if (row.request_id) correlationParts.push(`req=${row.request_id}`);
  if (row.client_request_id) correlationParts.push(`client_req=${row.client_request_id}`);
  if (row.user_id != null) correlationParts.push(`user=${row.user_id}`);
  if (row.account_id != null) correlationParts.push(`acc=${row.account_id}`);
  if (row.platform) correlationParts.push(`platform=${row.platform}`);
  if (row.model) correlationParts.push(`model=${row.model}`);
  if (correlationParts.length > 0) parts.push(correlationParts.join(' '));

  const errors = getExtraString(extra, 'errors');
  if (errors) parts.push(`errors=${errors}`);
  const err = getExtraString(extra, 'err') || getExtraString(extra, 'error');
  if (err) parts.push(`error=${err}`);

  return parts.join('  ');
}

function getAlertDimensionString(event: AdminOpsAlertEvent | null | undefined, key: string) {
  const value = event?.dimensions?.[key];
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function formatAlertDimensionsSummary(event: AdminOpsAlertEvent) {
  const parts: string[] = [];
  const platform = getAlertDimensionString(event, 'platform');
  if (platform) parts.push(`platform=${platform}`);
  const groupId = event.dimensions?.group_id;
  if (groupId != null && groupId !== '') parts.push(`group_id=${String(groupId)}`);
  const region = getAlertDimensionString(event, 'region');
  if (region) parts.push(`region=${region}`);
  return parts.length > 0 ? parts.join(' ') : '-';
}

function formatAlertMetricValue(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '-';
}

function formatDurationMs(ms: number) {
  const safe = Math.max(0, Math.floor(ms));
  const seconds = Math.floor(safe / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function panelClassName() {
  return 'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]';
}

function fieldClassName() {
  return 'mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-[#121212] dark:text-white';
}

function buttonClassName(variant: 'primary' | 'secondary' | 'danger' = 'secondary') {
  if (variant === 'primary') {
    return 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60';
  }
  if (variant === 'danger') {
    return 'inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60';
  }
  return 'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800';
}

function MetricCard({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'good' | 'warn' | 'danger';
  hint?: string;
}) {
  const toneClassName =
    tone === 'good'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'danger'
          ? 'text-red-600 dark:text-red-400'
          : 'text-gray-900 dark:text-white';

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-[#121212]">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className={cn('mt-2 text-2xl font-semibold', toneClassName)}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</div> : null}
    </div>
  );
}

function SimpleBarList({
  items,
  emptyText,
}: {
  items: Array<{ label: string; value: number; meta?: string }>;
  emptyText: string;
}) {
  if (items.length === 0) {
    return <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">{emptyText}</div>;
  }

  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={`${item.label}-${item.meta || ''}`} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0 truncate text-gray-700 dark:text-gray-200">{item.label}</div>
            <div className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
              {item.value}
              {item.meta ? ` · ${item.meta}` : ''}
            </div>
          </div>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className="h-2 rounded-full bg-blue-500"
              style={{ width: `${Math.max((item.value / maxValue) * 100, item.value > 0 ? 6 : 0)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminOpsPage() {
  const { locale, t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [opsEnabled, setOpsEnabled] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);

  const [timeRange, setTimeRange] = useState<OpsTimeRange>('1h');
  const [platform, setPlatform] = useState('');
  const [groupIdInput, setGroupIdInput] = useState('');
  const [queryMode, setQueryMode] = useState<OpsQueryMode>('auto');

  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AdminOpsDashboardSnapshotResponse | null>(null);
  const [latencyHistogram, setLatencyHistogram] = useState<AdminOpsLatencyHistogramResponse | null>(null);
  const [errorDistribution, setErrorDistribution] = useState<AdminOpsErrorDistributionResponse | null>(null);
  const [thresholds, setThresholds] = useState<AdminOpsMetricThresholds | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [health, setHealth] = useState<AdminOpsSystemLogSinkHealth>(EMPTY_HEALTH);
  const [runtimeConfig, setRuntimeConfig] = useState<AdminOpsRuntimeLogConfig>(EMPTY_RUNTIME_CONFIG);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeSaving, setRuntimeSaving] = useState(false);

  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logs, setLogs] = useState<AdminOpsSystemLog[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [logFilters, setLogFilters] = useState<LogFilters>(DEFAULT_LOG_FILTERS);
  const [appliedLogFilters, setAppliedLogFilters] = useState<LogFilters>(DEFAULT_LOG_FILTERS);
  const logsMetaLoadedRef = useRef(false);

  const [alertRulesLoading, setAlertRulesLoading] = useState(false);
  const [alertRules, setAlertRules] = useState<AdminOpsAlertRule[]>([]);
  const [alertGroups, setAlertGroups] = useState<AdminGroup[]>([]);
  const [showRuleEditor, setShowRuleEditor] = useState(false);
  const [ruleDraft, setRuleDraft] = useState<AlertRuleDraft | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleDeleteId, setRuleDeleteId] = useState<number | null>(null);

  const [alertEventsLoading, setAlertEventsLoading] = useState(false);
  const [alertEventsLoadingMore, setAlertEventsLoadingMore] = useState(false);
  const [alertEvents, setAlertEvents] = useState<AdminOpsAlertEvent[]>([]);
  const [alertEventsHasMore, setAlertEventsHasMore] = useState(true);
  const [alertEventFilters, setAlertEventFilters] = useState<AlertEventFilters>(DEFAULT_ALERT_EVENT_FILTERS);
  const [selectedAlertEvent, setSelectedAlertEvent] = useState<AdminOpsAlertEvent | null>(null);
  const [selectedAlertEventLoading, setSelectedAlertEventLoading] = useState(false);
  const [alertEventActionLoading, setAlertEventActionLoading] = useState(false);
  const [alertHistoryLoading, setAlertHistoryLoading] = useState(false);
  const [alertHistoryRange, setAlertHistoryRange] = useState<OpsLogTimeRange>('7d');
  const [alertHistory, setAlertHistory] = useState<AdminOpsAlertEvent[]>([]);
  const [silenceDuration, setSilenceDuration] = useState<(typeof ALERT_SILENCE_OPTIONS)[number]>('1h');
  const alertsLoadedRef = useRef(false);

  const dashboardParams = useMemo<AdminOpsDashboardQuery>(() => {
    const groupId = parsePositiveInt(groupIdInput);
    return {
      time_range: timeRange,
      platform: platform.trim() || undefined,
      group_id: groupId ?? undefined,
      mode: queryMode,
    };
  }, [groupIdInput, platform, queryMode, timeRange]);

  const totalPages = Math.max(1, Math.ceil(totalLogs / pageSize));
  const overview = snapshot?.overview ?? null;
  const throughputTrend = snapshot?.throughput_trend ?? null;
  const errorTrend = snapshot?.error_trend ?? null;

  const formatNumber = useCallback(
    (value: number | null | undefined, maximumFractionDigits = 0) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value ?? 0),
    [locale]
  );

  const formatPercent = useCallback(
    (value: number | null | undefined) =>
      `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value ?? 0)}%`,
    [locale]
  );

  const formatDateTime = useCallback(
    (value: string | null | undefined) => {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return date.toLocaleString(locale);
    },
    [locale]
  );

  const loadSettings = useCallback(async () => {
    try {
      const settings = await getAdminSettings();
      const settingsRecord = settings as Record<string, unknown>;
      setOpsEnabled(settingsRecord.ops_monitoring_enabled !== false);
    } catch {
      setOpsEnabled(true);
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  const loadOverview = useCallback(async () => {
    if (!opsEnabled) return;

    setOverviewLoading(true);
    setOverviewError(null);

    try {
      const [snapshotData, latencyData, distributionData, thresholdData] = await Promise.all([
        getAdminOpsDashboardSnapshot(dashboardParams),
        getAdminOpsLatencyHistogram(dashboardParams),
        getAdminOpsErrorDistribution(dashboardParams),
        getAdminOpsMetricThresholds(),
      ]);

      setSnapshot(snapshotData);
      setLatencyHistogram(latencyData);
      setErrorDistribution(distributionData);
      setThresholds(thresholdData);
      setLastUpdated(new Date().toISOString());
    } catch (error) {
      setOverviewError(getErrorMessage(error, t('admin.ops.messages.loadOverviewFailed')));
    } finally {
      setOverviewLoading(false);
    }
  }, [dashboardParams, opsEnabled, t]);

  const loadLogMeta = useCallback(async () => {
    if (!opsEnabled) return;

    setRuntimeLoading(true);
    try {
      const [healthData, runtimeData] = await Promise.all([
        getAdminOpsSystemLogSinkHealth(),
        getAdminOpsRuntimeLogConfig(),
      ]);
      setHealth(healthData);
      setRuntimeConfig(runtimeData);
    } catch (error) {
      setMessage({
        type: 'error',
        text: getErrorMessage(error, t('admin.ops.logs.messages.loadMetaFailed')),
      });
    } finally {
      setRuntimeLoading(false);
    }
  }, [opsEnabled, t]);

  const loadLogs = useCallback(async () => {
    if (!opsEnabled) return;

    setLogsLoading(true);
    setLogsError(null);

    const query: AdminOpsSystemLogQuery = {
      page,
      page_size: pageSize,
      time_range: appliedLogFilters.time_range,
      start_time: toRFC3339(appliedLogFilters.start_time),
      end_time: toRFC3339(appliedLogFilters.end_time),
      level: appliedLogFilters.level.trim() || undefined,
      component: appliedLogFilters.component.trim() || undefined,
      request_id: appliedLogFilters.request_id.trim() || undefined,
      client_request_id: appliedLogFilters.client_request_id.trim() || undefined,
      user_id: parsePositiveInt(appliedLogFilters.user_id) ?? undefined,
      account_id: parsePositiveInt(appliedLogFilters.account_id) ?? undefined,
      platform: appliedLogFilters.platform.trim() || undefined,
      model: appliedLogFilters.model.trim() || undefined,
      q: appliedLogFilters.q.trim() || undefined,
    };

    try {
      const result = await listAdminOpsSystemLogs(query);
      setLogs(result.items);
      setTotalLogs(result.total);
    } catch (error) {
      setLogsError(getErrorMessage(error, t('admin.ops.logs.messages.loadFailed')));
    } finally {
      setLogsLoading(false);
    }
  }, [appliedLogFilters, opsEnabled, page, pageSize, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSettings();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSettings]);

  useEffect(() => {
    if (!settingsLoaded || !opsEnabled) return;
    const timer = window.setTimeout(() => {
      void loadOverview();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview, opsEnabled, settingsLoaded]);

  useEffect(() => {
    if (!settingsLoaded || !opsEnabled || activeTab !== 'logs') return;
    if (!logsMetaLoadedRef.current) {
      logsMetaLoadedRef.current = true;
      const metaTimer = window.setTimeout(() => {
        void loadLogMeta();
      }, 0);
      const logsTimer = window.setTimeout(() => {
        void loadLogs();
      }, 0);
      return () => {
        window.clearTimeout(metaTimer);
        window.clearTimeout(logsTimer);
      };
    }
    const timer = window.setTimeout(() => {
      void loadLogs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, loadLogMeta, loadLogs, opsEnabled, settingsLoaded]);

  const overviewCards = useMemo(() => {
    if (!overview) return [];

    const healthScore = overview.health_score ?? 0;
    const thresholdSla = thresholds?.sla_percent_min ?? null;
    const thresholdRequestError = thresholds?.request_error_rate_percent_max ?? null;
    const thresholdUpstreamError = thresholds?.upstream_error_rate_percent_max ?? null;

    return [
      {
        label: t('admin.ops.cards.healthScore'),
        value: formatNumber(healthScore, 2),
        tone: healthScore >= 90 ? 'good' : healthScore >= 75 ? 'warn' : 'danger',
        hint: t('admin.ops.cards.healthScoreHint'),
      },
      {
        label: t('admin.ops.cards.totalRequests'),
        value: formatNumber(overview.request_count_total),
        tone: 'default',
        hint: t('admin.ops.cards.totalRequestsHint'),
      },
      {
        label: t('admin.ops.cards.successRequests'),
        value: formatNumber(overview.success_count),
        tone: 'good',
        hint: t('admin.ops.cards.successRequestsHint'),
      },
      {
        label: t('admin.ops.cards.totalErrors'),
        value: formatNumber(overview.error_count_total),
        tone: overview.error_count_total > 0 ? 'danger' : 'default',
        hint: t('admin.ops.cards.totalErrorsHint'),
      },
      {
        label: t('admin.ops.cards.tokens'),
        value: formatNumber(overview.token_consumed),
        tone: 'default',
        hint: t('admin.ops.cards.tokensHint'),
      },
      {
        label: t('admin.ops.cards.sla'),
        value: formatPercent(overview.sla),
        tone: thresholdSla != null && overview.sla < thresholdSla ? 'danger' : 'good',
        hint:
          thresholdSla != null
            ? t('admin.ops.cards.slaThreshold', { value: formatPercent(thresholdSla) })
            : t('admin.ops.cards.slaHint'),
      },
      {
        label: t('admin.ops.cards.requestErrorRate'),
        value: formatPercent(overview.error_rate),
        tone:
          thresholdRequestError != null && overview.error_rate > thresholdRequestError ? 'danger' : 'default',
        hint:
          thresholdRequestError != null
            ? t('admin.ops.cards.requestErrorThreshold', { value: formatPercent(thresholdRequestError) })
            : t('admin.ops.cards.requestErrorHint'),
      },
      {
        label: t('admin.ops.cards.upstreamErrorRate'),
        value: formatPercent(overview.upstream_error_rate),
        tone:
          thresholdUpstreamError != null && overview.upstream_error_rate > thresholdUpstreamError
            ? 'danger'
            : 'default',
        hint:
          thresholdUpstreamError != null
            ? t('admin.ops.cards.upstreamErrorThreshold', { value: formatPercent(thresholdUpstreamError) })
            : t('admin.ops.cards.upstreamErrorHint'),
      },
    ] as Array<{
      label: string;
      value: string;
      tone: 'default' | 'good' | 'warn' | 'danger';
      hint: string;
    }>;
  }, [formatNumber, formatPercent, overview, t, thresholds]);

  const throughputItems = useMemo(() => {
    return (
      throughputTrend?.points.slice(-12).map((point) => ({
        label: formatDateTime(point.bucket_start),
        value: point.request_count,
        meta: `${t('admin.ops.trends.tokensShort')} ${formatNumber(point.token_consumed)}`,
      })) ?? []
    );
  }, [formatDateTime, formatNumber, t, throughputTrend?.points]);

  const errorTrendItems = useMemo(() => {
    return (
      errorTrend?.points.slice(-12).map((point) => ({
        label: formatDateTime(point.bucket_start),
        value: point.error_count_total,
        meta: `${t('admin.ops.trends.slaShort')} ${formatNumber(point.error_count_sla)}`,
      })) ?? []
    );
  }, [errorTrend?.points, formatDateTime, formatNumber, t]);

  const latencyItems = useMemo(() => {
    return (
      latencyHistogram?.buckets.map((bucket) => ({
        label: bucket.range,
        value: bucket.count,
        meta: t('admin.ops.trends.requestsShort'),
      })) ?? []
    );
  }, [latencyHistogram?.buckets, t]);

  const distributionItems = useMemo(() => {
    return (
      errorDistribution?.items.map((item) => ({
        label: `HTTP ${item.status_code}`,
        value: item.total,
        meta: `${t('admin.ops.trends.slaShort')} ${formatNumber(item.sla)}`,
      })) ?? []
    );
  }, [errorDistribution?.items, formatNumber, t]);

  const handleSaveRuntimeConfig = useCallback(async () => {
    setRuntimeSaving(true);
    setMessage(null);

    try {
      const saved = await updateAdminOpsRuntimeLogConfig(runtimeConfig);
      setRuntimeConfig(saved);
      setMessage({ type: 'success', text: t('admin.ops.logs.messages.runtimeSaved') });
      await loadLogMeta();
    } catch (error) {
      setMessage({
        type: 'error',
        text: getErrorMessage(error, t('admin.ops.logs.messages.runtimeSaveFailed')),
      });
    } finally {
      setRuntimeSaving(false);
    }
  }, [loadLogMeta, runtimeConfig, t]);

  const handleResetRuntimeConfig = useCallback(async () => {
    if (!window.confirm(t('admin.ops.logs.messages.runtimeResetConfirm'))) {
      return;
    }

    setRuntimeSaving(true);
    setMessage(null);

    try {
      const saved = await resetAdminOpsRuntimeLogConfig();
      setRuntimeConfig(saved);
      setMessage({ type: 'success', text: t('admin.ops.logs.messages.runtimeResetSuccess') });
      await loadLogMeta();
    } catch (error) {
      setMessage({
        type: 'error',
        text: getErrorMessage(error, t('admin.ops.logs.messages.runtimeResetFailed')),
      });
    } finally {
      setRuntimeSaving(false);
    }
  }, [loadLogMeta, t]);

  const handleCleanupLogs = useCallback(async () => {
    if (!window.confirm(t('admin.ops.logs.messages.cleanupConfirm'))) {
      return;
    }

    setMessage(null);

    try {
      const result = await cleanupAdminOpsSystemLogs({
        start_time: toRFC3339(appliedLogFilters.start_time),
        end_time: toRFC3339(appliedLogFilters.end_time),
        level: appliedLogFilters.level.trim() || undefined,
        component: appliedLogFilters.component.trim() || undefined,
        request_id: appliedLogFilters.request_id.trim() || undefined,
        client_request_id: appliedLogFilters.client_request_id.trim() || undefined,
        user_id: parsePositiveInt(appliedLogFilters.user_id) ?? undefined,
        account_id: parsePositiveInt(appliedLogFilters.account_id) ?? undefined,
        platform: appliedLogFilters.platform.trim() || undefined,
        model: appliedLogFilters.model.trim() || undefined,
        q: appliedLogFilters.q.trim() || undefined,
      });

      setMessage({
        type: 'success',
        text: t('admin.ops.logs.messages.cleanupSuccess', { count: result.deleted || 0 }),
      });
      setPage(1);
      await Promise.all([loadLogs(), loadLogMeta()]);
    } catch (error) {
      setMessage({
        type: 'error',
        text: getErrorMessage(error, t('admin.ops.logs.messages.cleanupFailed')),
      });
    }
  }, [appliedLogFilters, loadLogMeta, loadLogs, t]);

  const handleApplyLogFilters = useCallback(() => {
    setMessage(null);
    setPage(1);
    setAppliedLogFilters(logFilters);
  }, [logFilters]);

  const handleResetLogFilters = useCallback(() => {
    setMessage(null);
    setLogFilters(DEFAULT_LOG_FILTERS);
    setAppliedLogFilters(DEFAULT_LOG_FILTERS);
    setPage(1);
  }, []);

  const levelBadgeClass = useCallback((level: string) => {
    const normalized = String(level || '').toLowerCase();
    if (normalized === 'error' || normalized === 'fatal') {
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    }
    if (normalized === 'warn' || normalized === 'warning') {
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    }
    if (normalized === 'debug') {
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
  }, []);

  const metricDefinitions = useMemo<MetricDefinition[]>(
    () => [
      {
        type: 'success_rate',
        group: 'system',
        label: t('admin.ops.alertRules.metrics.successRate'),
        description: t('admin.ops.alertRules.metricDescriptions.successRate'),
        recommendedOperator: '<',
        recommendedThreshold: 99,
        unit: '%',
      },
      {
        type: 'error_rate',
        group: 'system',
        label: t('admin.ops.alertRules.metrics.errorRate'),
        description: t('admin.ops.alertRules.metricDescriptions.errorRate'),
        recommendedOperator: '>',
        recommendedThreshold: 1,
        unit: '%',
      },
      {
        type: 'upstream_error_rate',
        group: 'system',
        label: t('admin.ops.alertRules.metrics.upstreamErrorRate'),
        description: t('admin.ops.alertRules.metricDescriptions.upstreamErrorRate'),
        recommendedOperator: '>',
        recommendedThreshold: 1,
        unit: '%',
      },
      {
        type: 'cpu_usage_percent',
        group: 'system',
        label: t('admin.ops.alertRules.metrics.cpu'),
        description: t('admin.ops.alertRules.metricDescriptions.cpu'),
        recommendedOperator: '>',
        recommendedThreshold: 80,
        unit: '%',
      },
      {
        type: 'memory_usage_percent',
        group: 'system',
        label: t('admin.ops.alertRules.metrics.memory'),
        description: t('admin.ops.alertRules.metricDescriptions.memory'),
        recommendedOperator: '>',
        recommendedThreshold: 80,
        unit: '%',
      },
      {
        type: 'concurrency_queue_depth',
        group: 'system',
        label: t('admin.ops.alertRules.metrics.queueDepth'),
        description: t('admin.ops.alertRules.metricDescriptions.queueDepth'),
        recommendedOperator: '>',
        recommendedThreshold: 10,
      },
      {
        type: 'group_available_accounts',
        group: 'group',
        label: t('admin.ops.alertRules.metrics.groupAvailableAccounts'),
        description: t('admin.ops.alertRules.metricDescriptions.groupAvailableAccounts'),
        recommendedOperator: '<',
        recommendedThreshold: 1,
      },
      {
        type: 'group_available_ratio',
        group: 'group',
        label: t('admin.ops.alertRules.metrics.groupAvailableRatio'),
        description: t('admin.ops.alertRules.metricDescriptions.groupAvailableRatio'),
        recommendedOperator: '<',
        recommendedThreshold: 50,
        unit: '%',
      },
      {
        type: 'group_rate_limit_ratio',
        group: 'group',
        label: t('admin.ops.alertRules.metrics.groupRateLimitRatio'),
        description: t('admin.ops.alertRules.metricDescriptions.groupRateLimitRatio'),
        recommendedOperator: '>',
        recommendedThreshold: 10,
        unit: '%',
      },
      {
        type: 'account_rate_limited_count',
        group: 'account',
        label: t('admin.ops.alertRules.metrics.accountRateLimitedCount'),
        description: t('admin.ops.alertRules.metricDescriptions.accountRateLimitedCount'),
        recommendedOperator: '>',
        recommendedThreshold: 0,
      },
      {
        type: 'account_error_count',
        group: 'account',
        label: t('admin.ops.alertRules.metrics.accountErrorCount'),
        description: t('admin.ops.alertRules.metricDescriptions.accountErrorCount'),
        recommendedOperator: '>',
        recommendedThreshold: 0,
      },
      {
        type: 'account_error_ratio',
        group: 'account',
        label: t('admin.ops.alertRules.metrics.accountErrorRatio'),
        description: t('admin.ops.alertRules.metricDescriptions.accountErrorRatio'),
        recommendedOperator: '>',
        recommendedThreshold: 5,
        unit: '%',
      },
      {
        type: 'overload_account_count',
        group: 'account',
        label: t('admin.ops.alertRules.metrics.overloadAccountCount'),
        description: t('admin.ops.alertRules.metricDescriptions.overloadAccountCount'),
        recommendedOperator: '>',
        recommendedThreshold: 0,
      },
    ],
    [t]
  );

  const selectedMetricDefinition = useMemo(
    () => metricDefinitions.find((item) => item.type === ruleDraft?.metric_type) ?? null,
    [metricDefinitions, ruleDraft?.metric_type]
  );

  const isGroupMetricSelected = useMemo(
    () => (ruleDraft?.metric_type ? GROUP_METRIC_TYPES.has(ruleDraft.metric_type) : false),
    [ruleDraft?.metric_type]
  );

  const sortedAlertRules = useMemo(
    () => [...alertRules].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)),
    [alertRules]
  );

  const formatAlertStatusLabel = useCallback(
    (status: string | undefined) => {
      const normalized = String(status || '').trim().toLowerCase();
      if (!normalized) return '-';
      if (normalized === 'firing') return t('admin.ops.alertEvents.status.firing');
      if (normalized === 'resolved') return t('admin.ops.alertEvents.status.resolved');
      if (normalized === 'manual_resolved') return t('admin.ops.alertEvents.status.manualResolved');
      return normalized.toUpperCase();
    },
    [t]
  );

  const alertSeverityBadgeClass = useCallback((severity: string | undefined) => {
    const normalized = String(severity || '').trim().toLowerCase();
    if (normalized === 'p0' || normalized === 'critical') {
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    }
    if (normalized === 'p1' || normalized === 'warning') {
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    }
    if (normalized === 'p2' || normalized === 'info') {
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    }
    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }, []);

  const alertStatusBadgeClass = useCallback((status: string | undefined) => {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'firing') {
      return 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-500/30';
    }
    if (normalized === 'resolved') {
      return 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/30 dark:text-green-300 dark:ring-green-500/30';
    }
    if (normalized === 'manual_resolved') {
      return 'bg-slate-50 text-slate-700 ring-slate-600/20 dark:bg-slate-900/30 dark:text-slate-300 dark:ring-slate-500/30';
    }
    return 'bg-gray-50 text-gray-700 ring-gray-600/20 dark:bg-gray-900/30 dark:text-gray-300 dark:ring-gray-500/30';
  }, []);

  const formatAlertDurationLabel = useCallback(
    (event: AdminOpsAlertEvent) => {
      const firedAt = new Date(event.fired_at || event.created_at);
      if (Number.isNaN(firedAt.getTime())) return '-';
      if (event.resolved_at) {
        const resolvedAt = new Date(event.resolved_at);
        if (!Number.isNaN(resolvedAt.getTime())) {
          const prefix =
            String(event.status || '').toLowerCase() === 'manual_resolved'
              ? t('admin.ops.alertEvents.status.manualResolved')
              : t('admin.ops.alertEvents.status.resolved');
          return `${prefix} ${formatDurationMs(resolvedAt.getTime() - firedAt.getTime())}`;
        }
      }
      return `${t('admin.ops.alertEvents.status.firing')} ${formatDurationMs(Date.now() - firedAt.getTime())}`;
    },
    [t]
  );

  const createNewRuleDraft = useCallback(
    (): AlertRuleDraft => ({
      name: '',
      description: '',
      enabled: true,
      metric_type: 'error_rate',
      operator: '>',
      threshold: 1,
      window_minutes: 1,
      sustained_minutes: 2,
      severity: 'P1',
      cooldown_minutes: 10,
      notify_email: true,
    }),
    []
  );

  const getRuleValidationErrors = useCallback(
    (draft: AlertRuleDraft | null) => {
      const errors: string[] = [];
      if (!draft) return errors;
      if (!draft.name.trim()) errors.push(t('admin.ops.alertRules.validation.nameRequired'));
      if (!draft.metric_type) errors.push(t('admin.ops.alertRules.validation.metricRequired'));
      if (GROUP_METRIC_TYPES.has(draft.metric_type) && !draft.filters?.group_id) {
        errors.push(t('admin.ops.alertRules.validation.groupIdRequired'));
      }
      if (!draft.operator) errors.push(t('admin.ops.alertRules.validation.operatorRequired'));
      if (!(typeof draft.threshold === 'number' && Number.isFinite(draft.threshold))) {
        errors.push(t('admin.ops.alertRules.validation.thresholdRequired'));
      }
      if (!ALERT_RULE_WINDOW_OPTIONS.includes(draft.window_minutes)) {
        errors.push(t('admin.ops.alertRules.validation.windowRange'));
      }
      if (!(draft.sustained_minutes >= 1 && draft.sustained_minutes <= 1440)) {
        errors.push(t('admin.ops.alertRules.validation.sustainedRange'));
      }
      if (!(draft.cooldown_minutes >= 0 && draft.cooldown_minutes <= 1440)) {
        errors.push(t('admin.ops.alertRules.validation.cooldownRange'));
      }
      return errors;
    },
    [t]
  );

  const ruleValidationErrors = useMemo(() => getRuleValidationErrors(ruleDraft), [getRuleValidationErrors, ruleDraft]);

  const loadAlertRules = useCallback(async () => {
    setAlertRulesLoading(true);
    try {
      const [rules, groups] = await Promise.all([
        listAdminOpsAlertRules(),
        listAdminGroups({ page: 1, page_size: 200 }),
      ]);
      setAlertRules(rules);
      setAlertGroups(groups.items);
    } catch (error) {
      setMessage({
        type: 'error',
        text: getErrorMessage(error, t('admin.ops.alertRules.messages.loadFailed')),
      });
      setAlertRules([]);
    } finally {
      setAlertRulesLoading(false);
    }
  }, [t]);

  const buildAlertEventsQuery = useCallback(
    (overrides: Partial<AdminOpsAlertEventsQuery> = {}): AdminOpsAlertEventsQuery => {
      const query: AdminOpsAlertEventsQuery = {
        limit: ALERT_EVENT_PAGE_SIZE,
        time_range: alertEventFilters.time_range,
      };
      if (alertEventFilters.severity) query.severity = alertEventFilters.severity;
      if (alertEventFilters.status) query.status = alertEventFilters.status;
      if (alertEventFilters.email_sent === 'true') query.email_sent = true;
      if (alertEventFilters.email_sent === 'false') query.email_sent = false;
      return { ...query, ...overrides };
    },
    [alertEventFilters]
  );

  const loadAlertEvents = useCallback(async () => {
    setAlertEventsLoading(true);
    try {
      const items = await listAdminOpsAlertEvents(buildAlertEventsQuery());
      setAlertEvents(items);
      setAlertEventsHasMore(items.length === ALERT_EVENT_PAGE_SIZE);
    } catch (error) {
      setMessage({
        type: 'error',
        text: getErrorMessage(error, t('admin.ops.alertEvents.messages.loadFailed')),
      });
      setAlertEvents([]);
      setAlertEventsHasMore(false);
    } finally {
      setAlertEventsLoading(false);
    }
  }, [buildAlertEventsQuery, t]);

  const loadMoreAlertEvents = useCallback(async () => {
    if (alertEventsLoading || alertEventsLoadingMore || !alertEventsHasMore) return;
    const last = alertEvents[alertEvents.length - 1];
    if (!last) return;
    setAlertEventsLoadingMore(true);
    try {
      const items = await listAdminOpsAlertEvents(
        buildAlertEventsQuery({
          before_fired_at: last.fired_at || last.created_at,
          before_id: last.id,
        })
      );
      if (items.length === 0) {
        setAlertEventsHasMore(false);
      } else {
        setAlertEvents((current) => [...current, ...items]);
        if (items.length < ALERT_EVENT_PAGE_SIZE) setAlertEventsHasMore(false);
      }
    } catch {
      setAlertEventsHasMore(false);
    } finally {
      setAlertEventsLoadingMore(false);
    }
  }, [alertEvents, alertEventsHasMore, alertEventsLoading, alertEventsLoadingMore, buildAlertEventsQuery]);

  const loadAlertHistory = useCallback(
    async (event: AdminOpsAlertEvent | null) => {
      if (!event) {
        setAlertHistory([]);
        return;
      }
      setAlertHistoryLoading(true);
      try {
        const platform = getAlertDimensionString(event, 'platform');
        const groupIdValue = event.dimensions?.group_id;
        const groupId =
          typeof groupIdValue === 'number'
            ? groupIdValue
            : typeof groupIdValue === 'string'
              ? Number.parseInt(groupIdValue, 10)
              : undefined;
        const items = await listAdminOpsAlertEvents({
          limit: 20,
          time_range: alertHistoryRange,
          platform: platform || undefined,
          group_id: Number.isFinite(groupId) && groupId && groupId > 0 ? groupId : undefined,
        });
        setAlertHistory(
          items.filter((item) => {
            if (item.rule_id !== event.rule_id) return false;
            const p1 = getAlertDimensionString(item, 'platform');
            const p2 = getAlertDimensionString(event, 'platform');
            if ((p1 || '') !== (p2 || '')) return false;
            return (item.dimensions?.group_id ?? null) === (event.dimensions?.group_id ?? null);
          })
        );
      } catch {
        setAlertHistory([]);
      } finally {
        setAlertHistoryLoading(false);
      }
    },
    [alertHistoryRange]
  );

  const openCreateRule = useCallback(() => {
    setEditingRuleId(null);
    setRuleDraft(createNewRuleDraft());
    setShowRuleEditor(true);
  }, [createNewRuleDraft]);

  const openEditRule = useCallback((rule: AdminOpsAlertRule) => {
    setEditingRuleId(rule.id ?? null);
    setRuleDraft(JSON.parse(JSON.stringify(rule)) as AlertRuleDraft);
    setShowRuleEditor(true);
  }, []);

  const closeRuleEditor = useCallback(() => {
    setShowRuleEditor(false);
    setEditingRuleId(null);
    setRuleDraft(null);
  }, []);

  const handleSaveRule = useCallback(async () => {
    if (!ruleDraft) return;
    const errors = getRuleValidationErrors(ruleDraft);
    if (errors.length > 0) {
      setMessage({ type: 'error', text: errors[0] });
      return;
    }
    setRuleSaving(true);
    setMessage(null);
    try {
      const payload: AlertRuleDraft = {
        ...ruleDraft,
        name: ruleDraft.name.trim(),
        description: ruleDraft.description?.trim() || '',
        filters:
          GROUP_METRIC_TYPES.has(ruleDraft.metric_type) && ruleDraft.filters?.group_id
            ? { group_id: ruleDraft.filters.group_id }
            : undefined,
      };
      if (editingRuleId) {
        await updateAdminOpsAlertRule(editingRuleId, payload);
      } else {
        await createAdminOpsAlertRule(payload);
      }
      await loadAlertRules();
      closeRuleEditor();
      setMessage({
        type: 'success',
        text: t(editingRuleId ? 'admin.ops.alertRules.messages.saveSuccess' : 'admin.ops.alertRules.messages.createSuccess'),
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: getErrorMessage(error, t('admin.ops.alertRules.messages.saveFailed')),
      });
    } finally {
      setRuleSaving(false);
    }
  }, [closeRuleEditor, editingRuleId, getRuleValidationErrors, loadAlertRules, ruleDraft, t]);

  const handleDeleteRule = useCallback(
    async (rule: AdminOpsAlertRule) => {
      if (!rule.id) return;
      if (!window.confirm(t('admin.ops.alertRules.messages.deleteConfirm'))) return;
      setRuleDeleteId(rule.id);
      setMessage(null);
      try {
        await deleteAdminOpsAlertRule(rule.id);
        await loadAlertRules();
        setMessage({ type: 'success', text: t('admin.ops.alertRules.messages.deleteSuccess') });
      } catch (error) {
        setMessage({
          type: 'error',
          text: getErrorMessage(error, t('admin.ops.alertRules.messages.deleteFailed')),
        });
      } finally {
        setRuleDeleteId(null);
      }
    },
    [loadAlertRules, t]
  );

  const openAlertEventDetail = useCallback(
    async (event: AdminOpsAlertEvent) => {
      setSelectedAlertEvent(event);
      setSelectedAlertEventLoading(true);
      try {
        const detail = await getAdminOpsAlertEvent(event.id);
        setSelectedAlertEvent(detail);
        await loadAlertHistory(detail);
      } catch (error) {
        setMessage({
          type: 'error',
          text: getErrorMessage(error, t('admin.ops.alertEvents.messages.detailFailed')),
        });
      } finally {
        setSelectedAlertEventLoading(false);
      }
    },
    [loadAlertHistory, t]
  );

  const handleManualResolveAlert = useCallback(async () => {
    if (!selectedAlertEvent) return;
    setAlertEventActionLoading(true);
    try {
      await updateAdminOpsAlertEventStatus(selectedAlertEvent.id, 'manual_resolved');
      const detail = await getAdminOpsAlertEvent(selectedAlertEvent.id);
      setSelectedAlertEvent(detail);
      await Promise.all([loadAlertEvents(), loadAlertHistory(detail)]);
      setMessage({ type: 'success', text: t('admin.ops.alertEvents.messages.manualResolveSuccess') });
    } catch (error) {
      setMessage({
        type: 'error',
        text: getErrorMessage(error, t('admin.ops.alertEvents.messages.manualResolveFailed')),
      });
    } finally {
      setAlertEventActionLoading(false);
    }
  }, [loadAlertEvents, loadAlertHistory, selectedAlertEvent, t]);

  const handleSilenceAlert = useCallback(async () => {
    if (!selectedAlertEvent) return;
    setAlertEventActionLoading(true);
    try {
      const platform = getAlertDimensionString(selectedAlertEvent, 'platform');
      const region = getAlertDimensionString(selectedAlertEvent, 'region');
      const groupIdValue = selectedAlertEvent.dimensions?.group_id;
      const groupId =
        typeof groupIdValue === 'number'
          ? groupIdValue
          : typeof groupIdValue === 'string'
            ? Number.parseInt(groupIdValue, 10)
            : undefined;
      await createAdminOpsAlertSilence({
        rule_id: selectedAlertEvent.rule_id,
        platform,
        group_id: Number.isFinite(groupId) && groupId && groupId > 0 ? groupId : undefined,
        region: region || undefined,
        until: durationToUntilRFC3339(silenceDuration),
        reason: `silence from UI (${silenceDuration})`,
      });
      setMessage({ type: 'success', text: t('admin.ops.alertEvents.messages.silenceSuccess') });
    } catch (error) {
      setMessage({
        type: 'error',
        text: getErrorMessage(error, t('admin.ops.alertEvents.messages.silenceFailed')),
      });
    } finally {
      setAlertEventActionLoading(false);
    }
  }, [selectedAlertEvent, silenceDuration, t]);

  useEffect(() => {
    if (!settingsLoaded || !opsEnabled || activeTab !== 'alerts') return;
    if (!alertsLoadedRef.current) {
      alertsLoadedRef.current = true;
      const timer = window.setTimeout(() => {
        void Promise.all([loadAlertRules(), loadAlertEvents()]);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [activeTab, loadAlertEvents, loadAlertRules, opsEnabled, settingsLoaded]);

  useEffect(() => {
    if (!settingsLoaded || !opsEnabled || activeTab !== 'alerts' || !alertsLoadedRef.current) return;
    const timer = window.setTimeout(() => {
      void loadAlertEvents();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, alertEventFilters, loadAlertEvents, opsEnabled, settingsLoaded]);

  useEffect(() => {
    if (!selectedAlertEvent) return;
    const timer = window.setTimeout(() => {
      void loadAlertHistory(selectedAlertEvent);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [alertHistoryRange, loadAlertHistory, selectedAlertEvent]);

  if (!settingsLoaded) {
    return (
      <div className={panelClassName()}>
        <div className="text-sm text-gray-500 dark:text-gray-400">{t('admin.ops.loading')}</div>
      </div>
    );
  }

  if (!opsEnabled) {
    return (
      <div className={panelClassName()}>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('admin.ops.disabledTitle')}</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('admin.ops.disabledDescription')}</p>
        <div className="mt-6">
          <Link href="/admin/settings" className={buttonClassName('primary')}>
            <Settings className="h-4 w-4" />
            {t('admin.ops.goSettings')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className={panelClassName()}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                {activeTab === 'overview' ? (
                  <Gauge className="h-5 w-5" />
                ) : activeTab === 'alerts' ? (
                  <Bell className="h-5 w-5" />
                ) : (
                  <FileText className="h-5 w-5" />
                )}
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">{t('admin.ops.title')}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('admin.ops.subtitle')}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition',
                activeTab === 'alerts'
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'
              )}
              onClick={() => setActiveTab('alerts')}
            >
              {t('admin.ops.tabs.alerts')}
            </button>
            <button
              type="button"
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition',
                activeTab === 'overview'
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'
              )}
              onClick={() => setActiveTab('overview')}
            >
              {t('admin.ops.tabs.overview')}
            </button>
            <button
              type="button"
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition',
                activeTab === 'logs'
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'
              )}
              onClick={() => setActiveTab('logs')}
            >
              {t('admin.ops.tabs.logs')}
            </button>
          </div>
        </div>
      </section>

      {message ? (
        <div
          className={cn(
            'rounded-2xl border px-4 py-3 text-sm',
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300'
          )}
        >
          {message.text}
        </div>
      ) : null}

      {activeTab === 'overview' ? (
        <>
          <section className={panelClassName()}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.filters.timeRange')}
                <select
                  value={timeRange}
                  onChange={(event) => setTimeRange(event.target.value as OpsTimeRange)}
                  className={fieldClassName()}
                >
                  {DASHBOARD_TIME_RANGES.map((item) => (
                    <option key={item} value={item}>
                      {t(`admin.ops.timeRanges.${item}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.filters.platform')}
                <input
                  value={platform}
                  onChange={(event) => setPlatform(event.target.value)}
                  className={fieldClassName()}
                  placeholder={t('admin.ops.filters.platformPlaceholder')}
                />
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.filters.groupId')}
                <input
                  value={groupIdInput}
                  onChange={(event) => setGroupIdInput(event.target.value)}
                  className={fieldClassName()}
                  placeholder={t('admin.ops.filters.groupIdPlaceholder')}
                />
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.filters.queryMode')}
                <select
                  value={queryMode}
                  onChange={(event) => setQueryMode(event.target.value as OpsQueryMode)}
                  className={fieldClassName()}
                >
                  {QUERY_MODES.map((item) => (
                    <option key={item} value={item}>
                      {t(`admin.ops.queryModes.${item}`)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-col justify-end">
                <button type="button" className={buttonClassName('primary')} onClick={() => void loadOverview()}>
                  <RefreshCw className={cn('h-4 w-4', overviewLoading && 'animate-spin')} />
                  {t('admin.ops.actions.refresh')}
                </button>
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.ops.lastUpdated')}: {formatDateTime(lastUpdated)}
                </div>
              </div>
            </div>
          </section>

          {overviewError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              {overviewError}
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {overviewCards.map((card) => (
              <MetricCard
                key={card.label}
                label={card.label}
                value={card.value}
                tone={card.tone}
                hint={card.hint}
              />
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-3">
            <div className={panelClassName()}>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('admin.ops.qps.title')}</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <MetricCard label={t('admin.ops.common.current')} value={formatNumber(overview?.qps.current, 2)} />
                <MetricCard label={t('admin.ops.common.peak')} value={formatNumber(overview?.qps.peak, 2)} />
                <MetricCard label={t('admin.ops.common.avg')} value={formatNumber(overview?.qps.avg, 2)} />
              </div>
            </div>

            <div className={panelClassName()}>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('admin.ops.tps.title')}</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <MetricCard label={t('admin.ops.common.current')} value={formatNumber(overview?.tps.current, 2)} />
                <MetricCard label={t('admin.ops.common.peak')} value={formatNumber(overview?.tps.peak, 2)} />
                <MetricCard label={t('admin.ops.common.avg')} value={formatNumber(overview?.tps.avg, 2)} />
              </div>
            </div>

            <div className={panelClassName()}>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('admin.ops.thresholds.title')}</h3>
              <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
                <div className="flex items-center justify-between gap-3">
                  <span>{t('admin.ops.thresholds.sla')}</span>
                  <span>{thresholds?.sla_percent_min != null ? formatPercent(thresholds.sla_percent_min) : '-'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{t('admin.ops.thresholds.ttftP99')}</span>
                  <span>
                    {thresholds?.ttft_p99_ms_max != null
                      ? t('admin.ops.common.msValue', { value: formatNumber(thresholds.ttft_p99_ms_max, 2) })
                      : '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{t('admin.ops.thresholds.requestError')}</span>
                  <span>
                    {thresholds?.request_error_rate_percent_max != null
                      ? formatPercent(thresholds.request_error_rate_percent_max)
                      : '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{t('admin.ops.thresholds.upstreamError')}</span>
                  <span>
                    {thresholds?.upstream_error_rate_percent_max != null
                      ? formatPercent(thresholds.upstream_error_rate_percent_max)
                      : '-'}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <div className={panelClassName()}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('admin.ops.duration.title')}</h3>
                <div className="text-xs text-gray-500 dark:text-gray-400">{t('admin.ops.duration.durationLabel')}</div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <MetricCard label="P50" value={formatNumber(overview?.duration.p50_ms, 2)} />
                <MetricCard label="P95" value={formatNumber(overview?.duration.p95_ms, 2)} />
                <MetricCard label="P99" value={formatNumber(overview?.duration.p99_ms, 2)} />
                <MetricCard label={t('admin.ops.common.avg')} value={formatNumber(overview?.duration.avg_ms, 2)} />
                <MetricCard label={t('admin.ops.common.max')} value={formatNumber(overview?.duration.max_ms, 2)} />
                <MetricCard label="P90" value={formatNumber(overview?.duration.p90_ms, 2)} />
              </div>
            </div>

            <div className={panelClassName()}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('admin.ops.ttft.title')}</h3>
                <div className="text-xs text-gray-500 dark:text-gray-400">{t('admin.ops.ttft.durationLabel')}</div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <MetricCard label="P50" value={formatNumber(overview?.ttft.p50_ms, 2)} />
                <MetricCard label="P95" value={formatNumber(overview?.ttft.p95_ms, 2)} />
                <MetricCard label="P99" value={formatNumber(overview?.ttft.p99_ms, 2)} />
                <MetricCard label={t('admin.ops.common.avg')} value={formatNumber(overview?.ttft.avg_ms, 2)} />
                <MetricCard label={t('admin.ops.common.max')} value={formatNumber(overview?.ttft.max_ms, 2)} />
                <MetricCard label="P90" value={formatNumber(overview?.ttft.p90_ms, 2)} />
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <div className={panelClassName()}>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('admin.ops.trends.throughput')}</h3>
              <div className="mt-4">
                <SimpleBarList items={throughputItems} emptyText={t('admin.ops.empty')} />
              </div>
            </div>

            <div className={panelClassName()}>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('admin.ops.trends.errorTrend')}</h3>
              <div className="mt-4">
                <SimpleBarList items={errorTrendItems} emptyText={t('admin.ops.empty')} />
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <div className={panelClassName()}>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('admin.ops.trends.latency')}</h3>
              <div className="mt-4">
                <SimpleBarList items={latencyItems} emptyText={t('admin.ops.empty')} />
              </div>
            </div>

            <div className={panelClassName()}>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {t('admin.ops.trends.errorDistribution')}
              </h3>
              <div className="mt-4">
                <SimpleBarList items={distributionItems} emptyText={t('admin.ops.empty')} />
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <div className={panelClassName()}>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('admin.ops.system.title')}</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <MetricCard label={t('admin.ops.system.cpu')} value={formatPercent(overview?.system_metrics?.cpu_usage_percent)} />
                <MetricCard
                  label={t('admin.ops.system.memory')}
                  value={formatPercent(overview?.system_metrics?.memory_usage_percent)}
                  hint={
                    overview?.system_metrics?.memory_used_mb != null && overview?.system_metrics?.memory_total_mb != null
                      ? `${formatNumber(overview.system_metrics.memory_used_mb, 2)} / ${formatNumber(
                          overview.system_metrics.memory_total_mb,
                          2
                        )} MB`
                      : undefined
                  }
                />
                <MetricCard
                  label={t('admin.ops.system.db')}
                  value={overview?.system_metrics?.db_ok ? t('admin.ops.common.normal') : t('admin.ops.common.abnormal')}
                  tone={overview?.system_metrics?.db_ok ? 'good' : 'danger'}
                />
                <MetricCard
                  label={t('admin.ops.system.redis')}
                  value={
                    overview?.system_metrics?.redis_ok ? t('admin.ops.common.normal') : t('admin.ops.common.abnormal')
                  }
                  tone={overview?.system_metrics?.redis_ok ? 'good' : 'danger'}
                />
                <MetricCard
                  label={t('admin.ops.system.goroutines')}
                  value={formatNumber(overview?.system_metrics?.goroutine_count)}
                />
                <MetricCard
                  label={t('admin.ops.system.queueDepth')}
                  value={formatNumber(overview?.system_metrics?.concurrency_queue_depth)}
                />
              </div>
            </div>

            <div className={panelClassName()}>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('admin.ops.jobs.title')}</h3>
              <div className="mt-4 space-y-3">
                {overview?.job_heartbeats?.length ? (
                  overview.job_heartbeats.map((item) => (
                    <div key={item.job_name} className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{item.job_name}</div>
                      <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                        <div>
                          {t('admin.ops.jobs.lastRun')}: {formatDateTime(item.last_run_at)}
                        </div>
                        <div>
                          {t('admin.ops.jobs.lastSuccess')}: {formatDateTime(item.last_success_at)}
                        </div>
                        <div>
                          {t('admin.ops.jobs.lastError')}: {formatDateTime(item.last_error_at)}
                        </div>
                        <div>
                          {t('admin.ops.jobs.duration')}:{' '}
                          {item.last_duration_ms != null
                            ? t('admin.ops.common.msValue', { value: formatNumber(item.last_duration_ms, 2) })
                            : '-'}
                        </div>
                        <div>
                          {t('admin.ops.jobs.result')}: {item.last_result || '-'}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    {t('admin.ops.empty')}
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      ) : activeTab === 'alerts' ? (
        <>
          <section className={panelClassName()}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('admin.ops.alertRules.title')}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('admin.ops.alertRules.description')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={buttonClassName('primary')} onClick={openCreateRule}>
                  <Plus className="h-4 w-4" />
                  {t('admin.ops.alertRules.actions.create')}
                </button>
                <button type="button" className={buttonClassName()} onClick={() => void loadAlertRules()}>
                  <RefreshCw className={cn('h-4 w-4', alertRulesLoading && 'animate-spin')} />
                  {t('admin.ops.actions.refresh')}
                </button>
              </div>
            </div>

            {alertRulesLoading ? (
              <div className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {t('admin.ops.alertRules.loading')}
              </div>
            ) : sortedAlertRules.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {t('admin.ops.alertRules.empty')}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-[#121212]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {t('admin.ops.alertRules.table.name')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {t('admin.ops.alertRules.table.metric')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {t('admin.ops.alertRules.table.severity')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {t('admin.ops.alertRules.table.enabled')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {t('admin.ops.alertRules.table.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {sortedAlertRules.map((rule) => (
                      <tr key={rule.id ?? rule.name} className="align-top">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{rule.name}</div>
                          {rule.description ? (
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{rule.description}</div>
                          ) : null}
                          {rule.updated_at ? (
                            <div className="mt-1 text-[11px] text-gray-400">{formatDateTime(rule.updated_at)}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                          <span className="font-mono">{rule.metric_type}</span>
                          <span className="mx-2 text-gray-400">{rule.operator}</span>
                          <span className="font-mono">{rule.threshold}</span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', alertSeverityBadgeClass(rule.severity))}>
                            {rule.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                          {rule.enabled ? t('admin.ops.alertRules.enabled') : t('admin.ops.alertRules.disabled')}
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          <div className="flex justify-end gap-2">
                            <button type="button" className={buttonClassName()} onClick={() => openEditRule(rule)}>
                              {t('admin.ops.alertRules.actions.edit')}
                            </button>
                            <button
                              type="button"
                              className={buttonClassName('danger')}
                              disabled={ruleDeleteId === rule.id}
                              onClick={() => void handleDeleteRule(rule)}
                            >
                              {ruleDeleteId === rule.id ? t('admin.ops.alertRules.actions.deleting') : t('admin.ops.alertRules.actions.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {showRuleEditor && ruleDraft ? (
              <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-[#121212]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-white">
                      {editingRuleId ? t('admin.ops.alertRules.editTitle') : t('admin.ops.alertRules.createTitle')}
                    </h4>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('admin.ops.alertRules.editorHint')}</p>
                  </div>
                  <button type="button" className={buttonClassName()} onClick={closeRuleEditor}>
                    <X className="h-4 w-4" />
                    {t('admin.ops.alertRules.actions.cancel')}
                  </button>
                </div>

                {ruleValidationErrors.length > 0 ? (
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                    {ruleValidationErrors[0]}
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-gray-600 dark:text-gray-300 md:col-span-2">
                    {t('admin.ops.alertRules.form.name')}
                    <input
                      value={ruleDraft.name}
                      onChange={(event) => setRuleDraft((current) => (current ? { ...current, name: event.target.value } : current))}
                      className={fieldClassName()}
                    />
                  </label>

                  <label className="text-sm text-gray-600 dark:text-gray-300 md:col-span-2">
                    {t('admin.ops.alertRules.form.description')}
                    <input
                      value={ruleDraft.description || ''}
                      onChange={(event) => setRuleDraft((current) => (current ? { ...current, description: event.target.value } : current))}
                      className={fieldClassName()}
                    />
                  </label>

                  <label className="text-sm text-gray-600 dark:text-gray-300">
                    {t('admin.ops.alertRules.form.metric')}
                    <select
                      value={ruleDraft.metric_type}
                      onChange={(event) => {
                        const metricType = event.target.value as AdminOpsMetricType;
                        const def = metricDefinitions.find((item) => item.type === metricType);
                        setRuleDraft((current) =>
                          current
                            ? {
                                ...current,
                                metric_type: metricType,
                                operator: def?.recommendedOperator ?? current.operator,
                                threshold: def?.recommendedThreshold ?? current.threshold,
                                filters: GROUP_METRIC_TYPES.has(metricType) ? current.filters : undefined,
                              }
                            : current
                        );
                      }}
                      className={fieldClassName()}
                    >
                      {(['system', 'group', 'account'] as MetricGroup[]).map((group) => (
                        <optgroup key={group} label={t(`admin.ops.alertRules.metricGroups.${group}`)}>
                          {metricDefinitions
                            .filter((item) => item.group === group)
                            .map((item) => (
                              <option key={item.type} value={item.type}>
                                {item.label}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                    {selectedMetricDefinition ? (
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {selectedMetricDefinition.description}
                      </div>
                    ) : null}
                  </label>

                  <label className="text-sm text-gray-600 dark:text-gray-300">
                    {t('admin.ops.alertRules.form.operator')}
                    <select
                      value={ruleDraft.operator}
                      onChange={(event) =>
                        setRuleDraft((current) =>
                          current ? { ...current, operator: event.target.value as AdminOpsOperator } : current
                        )
                      }
                      className={fieldClassName()}
                    >
                      {ALERT_OPERATORS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm text-gray-600 dark:text-gray-300 md:col-span-2">
                    {t('admin.ops.alertRules.form.groupId')}
                    <select
                      value={ruleDraft.filters?.group_id ?? ''}
                      onChange={(event) =>
                        setRuleDraft((current) =>
                          current
                            ? {
                                ...current,
                                filters: event.target.value
                                  ? { group_id: Number(event.target.value) }
                                  : undefined,
                              }
                            : current
                        )
                      }
                      className={fieldClassName()}
                      disabled={!isGroupMetricSelected}
                    >
                      <option value="">{t('admin.ops.alertRules.form.allGroups')}</option>
                      {alertGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {isGroupMetricSelected
                        ? t('admin.ops.alertRules.form.groupRequired')
                        : t('admin.ops.alertRules.form.groupOptional')}
                    </div>
                  </label>

                  <label className="text-sm text-gray-600 dark:text-gray-300">
                    {t('admin.ops.alertRules.form.threshold')}
                    <input
                      type="number"
                      value={ruleDraft.threshold}
                      onChange={(event) =>
                        setRuleDraft((current) =>
                          current ? { ...current, threshold: Number(event.target.value || 0) } : current
                        )
                      }
                      className={fieldClassName()}
                    />
                  </label>

                  <label className="text-sm text-gray-600 dark:text-gray-300">
                    {t('admin.ops.alertRules.form.severity')}
                    <select
                      value={ruleDraft.severity}
                      onChange={(event) =>
                        setRuleDraft((current) =>
                          current ? { ...current, severity: event.target.value as AdminOpsSeverity } : current
                        )
                      }
                      className={fieldClassName()}
                    >
                      {ALERT_SEVERITIES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm text-gray-600 dark:text-gray-300">
                    {t('admin.ops.alertRules.form.window')}
                    <select
                      value={ruleDraft.window_minutes}
                      onChange={(event) =>
                        setRuleDraft((current) =>
                          current ? { ...current, window_minutes: Number(event.target.value) } : current
                        )
                      }
                      className={fieldClassName()}
                    >
                      {ALERT_RULE_WINDOW_OPTIONS.map((item) => (
                        <option key={item} value={item}>
                          {item}m
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm text-gray-600 dark:text-gray-300">
                    {t('admin.ops.alertRules.form.sustained')}
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      value={ruleDraft.sustained_minutes}
                      onChange={(event) =>
                        setRuleDraft((current) =>
                          current ? { ...current, sustained_minutes: Number(event.target.value || 1) } : current
                        )
                      }
                      className={fieldClassName()}
                    />
                  </label>

                  <label className="text-sm text-gray-600 dark:text-gray-300">
                    {t('admin.ops.alertRules.form.cooldown')}
                    <input
                      type="number"
                      min={0}
                      max={1440}
                      value={ruleDraft.cooldown_minutes}
                      onChange={(event) =>
                        setRuleDraft((current) =>
                          current ? { ...current, cooldown_minutes: Number(event.target.value || 0) } : current
                        )
                      }
                      className={fieldClassName()}
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-[#1A1A1A] dark:text-gray-200">
                    <span>{t('admin.ops.alertRules.form.enabled')}</span>
                    <input
                      type="checkbox"
                      checked={ruleDraft.enabled}
                      onChange={(event) =>
                        setRuleDraft((current) => (current ? { ...current, enabled: event.target.checked } : current))
                      }
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-[#1A1A1A] dark:text-gray-200">
                    <span>{t('admin.ops.alertRules.form.notifyEmail')}</span>
                    <input
                      type="checkbox"
                      checked={ruleDraft.notify_email}
                      onChange={(event) =>
                        setRuleDraft((current) =>
                          current ? { ...current, notify_email: event.target.checked } : current
                        )
                      }
                    />
                  </label>
                </div>

                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button type="button" className={buttonClassName()} onClick={closeRuleEditor}>
                    {t('admin.ops.alertRules.actions.cancel')}
                  </button>
                  <button type="button" className={buttonClassName('primary')} disabled={ruleSaving} onClick={() => void handleSaveRule()}>
                    <Save className="h-4 w-4" />
                    {ruleSaving ? t('admin.ops.alertRules.actions.saving') : t('admin.ops.alertRules.actions.save')}
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className={panelClassName()}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('admin.ops.alertEvents.title')}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.description')}</p>
              </div>
              <button type="button" className={buttonClassName()} onClick={() => void loadAlertEvents()}>
                <RefreshCw className={cn('h-4 w-4', alertEventsLoading && 'animate-spin')} />
                {t('admin.ops.actions.refresh')}
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.alertEvents.filters.timeRange')}
                <select
                  value={alertEventFilters.time_range}
                  onChange={(event) =>
                    setAlertEventFilters((current) => ({ ...current, time_range: event.target.value as OpsLogTimeRange }))
                  }
                  className={fieldClassName()}
                >
                  {LOG_TIME_RANGES.map((item) => (
                    <option key={item} value={item}>
                      {t(`admin.ops.timeRanges.${item}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.alertEvents.filters.severity')}
                <select
                  value={alertEventFilters.severity}
                  onChange={(event) =>
                    setAlertEventFilters((current) => ({ ...current, severity: event.target.value }))
                  }
                  className={fieldClassName()}
                >
                  <option value="">{t('admin.ops.alertEvents.filters.all')}</option>
                  {ALERT_SEVERITIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.alertEvents.filters.status')}
                <select
                  value={alertEventFilters.status}
                  onChange={(event) =>
                    setAlertEventFilters((current) => ({ ...current, status: event.target.value }))
                  }
                  className={fieldClassName()}
                >
                  <option value="">{t('admin.ops.alertEvents.filters.all')}</option>
                  <option value="firing">{t('admin.ops.alertEvents.status.firing')}</option>
                  <option value="resolved">{t('admin.ops.alertEvents.status.resolved')}</option>
                  <option value="manual_resolved">{t('admin.ops.alertEvents.status.manualResolved')}</option>
                </select>
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.alertEvents.filters.email')}
                <select
                  value={alertEventFilters.email_sent}
                  onChange={(event) =>
                    setAlertEventFilters((current) => ({
                      ...current,
                      email_sent: event.target.value as AlertEventFilters['email_sent'],
                    }))
                  }
                  className={fieldClassName()}
                >
                  <option value="">{t('admin.ops.alertEvents.filters.all')}</option>
                  <option value="true">{t('admin.ops.alertEvents.table.emailSent')}</option>
                  <option value="false">{t('admin.ops.alertEvents.table.emailIgnored')}</option>
                </select>
              </label>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              {alertEventsLoading ? (
                <div className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                  {t('admin.ops.alertEvents.loading')}
                </div>
              ) : alertEvents.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                  {t('admin.ops.alertEvents.empty')}
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-[#121212]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.time')}</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.severity')}</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.platform')}</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.ruleId')}</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.title')}</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.duration')}</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.dimensions')}</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.email')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {alertEvents.map((event) => (
                      <tr
                        key={event.id}
                        className="cursor-pointer align-top hover:bg-gray-50 dark:hover:bg-gray-900/30"
                        onClick={() => void openAlertEventDetail(event)}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{formatDateTime(event.fired_at || event.created_at)}</td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', alertSeverityBadgeClass(event.severity))}>
                              {event.severity}
                            </span>
                            <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', alertStatusBadgeClass(event.status))}>
                              {formatAlertStatusLabel(event.status)}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{getAlertDimensionString(event, 'platform') || '-'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-200">#{event.rule_id}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                          <div className="font-medium">{event.title || '-'}</div>
                          {event.description ? <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{event.description}</div> : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatAlertDurationLabel(event)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{formatAlertDimensionsSummary(event)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-200">
                          {event.email_sent ? t('admin.ops.alertEvents.table.emailSent') : t('admin.ops.alertEvents.table.emailIgnored')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {alertEventsHasMore && alertEvents.length > 0 ? (
              <div className="mt-4 flex justify-center">
                <button type="button" className={buttonClassName()} disabled={alertEventsLoadingMore} onClick={() => void loadMoreAlertEvents()}>
                  <RefreshCw className={cn('h-4 w-4', alertEventsLoadingMore && 'animate-spin')} />
                  {alertEventsLoadingMore ? t('admin.ops.alertEvents.actions.loadingMore') : t('admin.ops.alertEvents.actions.loadMore')}
                </button>
              </div>
            ) : null}

            {selectedAlertEvent ? (
              <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-[#121212]">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', alertSeverityBadgeClass(selectedAlertEvent.severity))}>
                        {selectedAlertEvent.severity}
                      </span>
                      <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', alertStatusBadgeClass(selectedAlertEvent.status))}>
                        {formatAlertStatusLabel(selectedAlertEvent.status)}
                      </span>
                    </div>
                    <h4 className="mt-2 text-base font-semibold text-gray-900 dark:text-white">
                      {selectedAlertEvent.title || t('admin.ops.alertEvents.detail.title')}
                    </h4>
                    {selectedAlertEvent.description ? (
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{selectedAlertEvent.description}</p>
                    ) : null}
                  </div>
                  <button type="button" className={buttonClassName()} onClick={() => setSelectedAlertEvent(null)}>
                    <X className="h-4 w-4" />
                    {t('admin.ops.alertEvents.actions.close')}
                  </button>
                </div>

                {selectedAlertEventLoading ? (
                  <div className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.detail.loading')}</div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label={t('admin.ops.alertEvents.detail.firedAt')} value={formatDateTime(selectedAlertEvent.fired_at || selectedAlertEvent.created_at)} />
                  <MetricCard label={t('admin.ops.alertEvents.detail.resolvedAt')} value={formatDateTime(selectedAlertEvent.resolved_at)} />
                  <MetricCard label={t('admin.ops.alertEvents.detail.ruleId')} value={`#${selectedAlertEvent.rule_id}`} />
                  <MetricCard label={t('admin.ops.alertEvents.detail.metric')} value={`${formatAlertMetricValue(selectedAlertEvent.metric_value)} / ${formatAlertMetricValue(selectedAlertEvent.threshold_value)}`} />
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-[#1A1A1A] dark:text-gray-200">
                  <div className="font-medium">{t('admin.ops.alertEvents.detail.dimensions')}</div>
                  <div className="mt-2 whitespace-pre-wrap break-all text-xs text-gray-500 dark:text-gray-400">
                    {formatAlertDimensionsSummary(selectedAlertEvent)}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <select
                    value={silenceDuration}
                    onChange={(event) => setSilenceDuration(event.target.value as (typeof ALERT_SILENCE_OPTIONS)[number])}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                  >
                    {ALERT_SILENCE_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {t(`admin.ops.timeRanges.${item}`)}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={buttonClassName()} disabled={alertEventActionLoading} onClick={() => void handleSilenceAlert()}>
                    <Bell className="h-4 w-4" />
                    {t('admin.ops.alertEvents.actions.silence')}
                  </button>
                  <button type="button" className={buttonClassName('primary')} disabled={alertEventActionLoading} onClick={() => void handleManualResolveAlert()}>
                    <CheckCircle2 className="h-4 w-4" />
                    {t('admin.ops.alertEvents.actions.manualResolve')}
                  </button>
                </div>

                <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#1A1A1A]">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h5 className="text-sm font-semibold text-gray-900 dark:text-white">{t('admin.ops.alertEvents.detail.historyTitle')}</h5>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.detail.historyHint')}</p>
                    </div>
                    <select
                      value={alertHistoryRange}
                      onChange={(event) => setAlertHistoryRange(event.target.value as OpsLogTimeRange)}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#121212] dark:text-white"
                    >
                      {ALERT_HISTORY_RANGE_OPTIONS.map((item) => (
                        <option key={item} value={item}>
                          {t(`admin.ops.timeRanges.${item}`)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {alertHistoryLoading ? (
                    <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.detail.historyLoading')}</div>
                  ) : alertHistory.length === 0 ? (
                    <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.detail.historyEmpty')}</div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                        <thead className="bg-gray-50 dark:bg-[#121212]">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.time')}</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.status')}</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.metric')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {alertHistory.map((item) => (
                            <tr key={item.id}>
                              <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatDateTime(item.fired_at || item.created_at)}</td>
                              <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatAlertStatusLabel(item.status)}</td>
                              <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                                {formatAlertMetricValue(item.metric_value)} / {formatAlertMetricValue(item.threshold_value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <>
          {logsError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              {logsError}
            </div>
          ) : null}

          <section className={panelClassName()}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('admin.ops.logs.title')}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('admin.ops.logs.subtitle')}</p>
              </div>
              <button type="button" className={buttonClassName()} onClick={() => void loadLogMeta()}>
                <RefreshCw className={cn('h-4 w-4', runtimeLoading && 'animate-spin')} />
                {t('admin.ops.logs.actions.refreshHealth')}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                label={t('admin.ops.logs.health.queue')}
                value={`${formatNumber(health.queue_depth)} / ${formatNumber(health.queue_capacity)}`}
              />
              <MetricCard label={t('admin.ops.logs.health.written')} value={formatNumber(health.written_count)} />
              <MetricCard
                label={t('admin.ops.logs.health.dropped')}
                value={formatNumber(health.dropped_count)}
                tone={health.dropped_count > 0 ? 'warn' : 'default'}
              />
              <MetricCard
                label={t('admin.ops.logs.health.failed')}
                value={formatNumber(health.write_failed_count)}
                tone={health.write_failed_count > 0 ? 'danger' : 'default'}
              />
              <MetricCard
                label={t('admin.ops.logs.health.delay')}
                value={t('admin.ops.common.msValue', { value: formatNumber(health.avg_write_delay_ms, 2) })}
              />
            </div>

            {health.last_error ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                {t('admin.ops.logs.health.lastError')}: {health.last_error}
              </div>
            ) : null}
          </section>

          <section className={panelClassName()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('admin.ops.logs.runtime.title')}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('admin.ops.logs.runtime.subtitle')}</p>
              </div>
              {runtimeLoading ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">{t('admin.ops.loading')}</div>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.logs.runtime.level')}
                <select
                  value={runtimeConfig.level}
                  onChange={(event) =>
                    setRuntimeConfig((current) => ({
                      ...current,
                      level: event.target.value as AdminOpsRuntimeLogConfig['level'],
                    }))
                  }
                  className={fieldClassName()}
                >
                  {RUNTIME_LEVELS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.logs.runtime.stacktrace')}
                <select
                  value={runtimeConfig.stacktrace_level}
                  onChange={(event) =>
                    setRuntimeConfig((current) => ({
                      ...current,
                      stacktrace_level: event.target.value as AdminOpsRuntimeLogConfig['stacktrace_level'],
                    }))
                  }
                  className={fieldClassName()}
                >
                  {STACKTRACE_LEVELS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.logs.runtime.samplingInitial')}
                <input
                  type="number"
                  min={1}
                  value={runtimeConfig.sampling_initial}
                  onChange={(event) =>
                    setRuntimeConfig((current) => ({
                      ...current,
                      sampling_initial: Number(event.target.value || 1),
                    }))
                  }
                  className={fieldClassName()}
                />
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.logs.runtime.samplingThereafter')}
                <input
                  type="number"
                  min={1}
                  value={runtimeConfig.sampling_thereafter}
                  onChange={(event) =>
                    setRuntimeConfig((current) => ({
                      ...current,
                      sampling_thereafter: Number(event.target.value || 1),
                    }))
                  }
                  className={fieldClassName()}
                />
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.logs.runtime.retentionDays')}
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={runtimeConfig.retention_days}
                  onChange={(event) =>
                    setRuntimeConfig((current) => ({
                      ...current,
                      retention_days: Number(event.target.value || 1),
                    }))
                  }
                  className={fieldClassName()}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={runtimeConfig.caller}
                    onChange={(event) =>
                      setRuntimeConfig((current) => ({
                        ...current,
                        caller: event.target.checked,
                      }))
                    }
                  />
                  {t('admin.ops.logs.runtime.caller')}
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={runtimeConfig.enable_sampling}
                    onChange={(event) =>
                      setRuntimeConfig((current) => ({
                        ...current,
                        enable_sampling: event.target.checked,
                      }))
                    }
                  />
                  {t('admin.ops.logs.runtime.sampling')}
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={buttonClassName('primary')} disabled={runtimeSaving} onClick={() => void handleSaveRuntimeConfig()}>
                  <Save className="h-4 w-4" />
                  {runtimeSaving ? t('admin.ops.logs.runtime.saving') : t('admin.ops.logs.runtime.save')}
                </button>
                <button type="button" className={buttonClassName()} disabled={runtimeSaving} onClick={() => void handleResetRuntimeConfig()}>
                  <RotateCcw className="h-4 w-4" />
                  {t('admin.ops.logs.runtime.reset')}
                </button>
              </div>
            </div>
          </section>

          <section className={panelClassName()}>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('admin.ops.logs.filters.title')}</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.logs.filters.timeRange')}
                <select
                  value={logFilters.time_range}
                  onChange={(event) =>
                    setLogFilters((current) => ({
                      ...current,
                      time_range: event.target.value as OpsLogTimeRange,
                    }))
                  }
                  className={fieldClassName()}
                >
                  {LOG_TIME_RANGES.map((item) => (
                    <option key={item} value={item}>
                      {t(`admin.ops.timeRanges.${item}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.logs.filters.startTime')}
                <input
                  type="datetime-local"
                  value={logFilters.start_time}
                  onChange={(event) =>
                    setLogFilters((current) => ({ ...current, start_time: event.target.value }))
                  }
                  className={fieldClassName()}
                />
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.logs.filters.endTime')}
                <input
                  type="datetime-local"
                  value={logFilters.end_time}
                  onChange={(event) =>
                    setLogFilters((current) => ({ ...current, end_time: event.target.value }))
                  }
                  className={fieldClassName()}
                />
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.logs.filters.level')}
                <select
                  value={logFilters.level}
                  onChange={(event) => setLogFilters((current) => ({ ...current, level: event.target.value }))}
                  className={fieldClassName()}
                >
                  <option value="">{t('admin.ops.logs.filters.allLevels')}</option>
                  {RUNTIME_LEVELS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.logs.filters.component')}
                <input
                  value={logFilters.component}
                  onChange={(event) => setLogFilters((current) => ({ ...current, component: event.target.value }))}
                  className={fieldClassName()}
                  placeholder={t('admin.ops.logs.filters.componentPlaceholder')}
                />
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.logs.filters.requestId')}
                <input
                  value={logFilters.request_id}
                  onChange={(event) => setLogFilters((current) => ({ ...current, request_id: event.target.value }))}
                  className={fieldClassName()}
                />
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.logs.filters.clientRequestId')}
                <input
                  value={logFilters.client_request_id}
                  onChange={(event) =>
                    setLogFilters((current) => ({ ...current, client_request_id: event.target.value }))
                  }
                  className={fieldClassName()}
                />
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.logs.filters.userId')}
                <input
                  value={logFilters.user_id}
                  onChange={(event) => setLogFilters((current) => ({ ...current, user_id: event.target.value }))}
                  className={fieldClassName()}
                />
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.logs.filters.accountId')}
                <input
                  value={logFilters.account_id}
                  onChange={(event) => setLogFilters((current) => ({ ...current, account_id: event.target.value }))}
                  className={fieldClassName()}
                />
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.logs.filters.platform')}
                <input
                  value={logFilters.platform}
                  onChange={(event) => setLogFilters((current) => ({ ...current, platform: event.target.value }))}
                  className={fieldClassName()}
                />
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300">
                {t('admin.ops.logs.filters.model')}
                <input
                  value={logFilters.model}
                  onChange={(event) => setLogFilters((current) => ({ ...current, model: event.target.value }))}
                  className={fieldClassName()}
                />
              </label>

              <label className="text-sm text-gray-600 dark:text-gray-300 xl:col-span-2">
                {t('admin.ops.logs.filters.keyword')}
                <input
                  value={logFilters.q}
                  onChange={(event) => setLogFilters((current) => ({ ...current, q: event.target.value }))}
                  className={fieldClassName()}
                  placeholder={t('admin.ops.logs.filters.keywordPlaceholder')}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={buttonClassName('primary')} onClick={handleApplyLogFilters}>
                <Search className="h-4 w-4" />
                {t('admin.ops.logs.actions.search')}
              </button>
              <button type="button" className={buttonClassName()} onClick={handleResetLogFilters}>
                <RotateCcw className="h-4 w-4" />
                {t('admin.ops.logs.actions.reset')}
              </button>
              <button type="button" className={buttonClassName('danger')} onClick={() => void handleCleanupLogs()}>
                <Trash2 className="h-4 w-4" />
                {t('admin.ops.logs.actions.cleanup')}
              </button>
              <button type="button" className={buttonClassName()} onClick={() => void loadLogs()}>
                <RefreshCw className={cn('h-4 w-4', logsLoading && 'animate-spin')} />
                {t('admin.ops.actions.refresh')}
              </button>
            </div>
          </section>

          <section className={panelClassName()}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('admin.ops.logs.table.title')}</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">{t('admin.ops.logs.table.pageSize')}</span>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPage(1);
                    setPageSize(Number(event.target.value));
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#121212] dark:text-white"
                >
                  {PAGE_SIZE_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
              {logsLoading ? (
                <div className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">{t('admin.ops.logs.table.loading')}</div>
              ) : logs.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">{t('admin.ops.logs.table.empty')}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                    <thead className="bg-gray-50 dark:bg-[#121212]">
                      <tr>
                        <th className="w-[190px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          {t('admin.ops.logs.table.time')}
                        </th>
                        <th className="w-[100px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          {t('admin.ops.logs.table.level')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          {t('admin.ops.logs.table.detail')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {logs.map((row) => (
                        <tr key={row.id} className="align-top">
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                            {formatDateTime(row.created_at)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', levelBadgeClass(row.level))}>
                              {row.level}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200 whitespace-normal break-all">
                            {formatSystemLogDetail(row)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {t('admin.ops.logs.table.pageInfo', {
                  page,
                  totalPages,
                  total: totalLogs,
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={buttonClassName()}
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  {t('admin.ops.logs.table.prev')}
                </button>
                <button
                  type="button"
                  className={buttonClassName()}
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  {t('admin.ops.logs.table.next')}
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
