'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Calendar, Clock3, Coins, RefreshCw, Search, WalletCards } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { listUserAPIKeys, type UserAPIKey } from '@/lib/user-api-keys';
import { getUserUsageStats, listUserUsageLogs, type UserUsageLog, type UserUsageStats } from '@/lib/user-usage';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatDuration(value?: number | null) {
  if (value == null || Number.isNaN(value)) return '-';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} s`;
}

function formatMoney(value?: number | null) {
  return `$${(value ?? 0).toFixed(4)}`;
}

function formatNumber(value?: number | null) {
  return (value ?? 0).toLocaleString();
}

function getLogTokens(log: UserUsageLog) {
  return log.input_tokens + log.output_tokens + log.cache_creation_tokens + log.cache_read_tokens;
}

const PAGE_SIZE = 20;

export default function UsagePage() {
  const { t } = useI18n();
  const today = useMemo(() => new Date(), []);
  const defaultEndDate = useMemo(() => formatDateInput(today), [today]);
  const defaultStartDate = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() - 6);
    return formatDateInput(date);
  }, [today]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApiKeyId, setSelectedApiKeyId] = useState('');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [page, setPage] = useState(1);

  const [apiKeys, setApiKeys] = useState<UserAPIKey[]>([]);
  const [logs, setLogs] = useState<UserUsageLog[]>([]);
  const [stats, setStats] = useState<UserUsageStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [statsError, setStatsError] = useState('');

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedApiKey = selectedApiKeyId ? Number(selectedApiKeyId) : undefined;

  const fetchApiKeys = useCallback(async () => {
    try {
      const result = await listUserAPIKeys({ page: 1, pageSize: 100 });
      setApiKeys(result.items);
    } catch (fetchError) {
      console.error('load usage api keys failed', fetchError);
    }
  }, []);

  const fetchUsage = useCallback(
    async (showRefreshing = false) => {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');
      setStatsError('');

      try {
        const [logsResult, statsResult] = await Promise.all([
          listUserUsageLogs({
            page,
            pageSize: PAGE_SIZE,
            apiKeyId: selectedApiKey,
            model: searchTerm,
            startDate,
            endDate,
          }),
          getUserUsageStats({
            apiKeyId: selectedApiKey,
            startDate,
            endDate,
          }),
        ]);

        setLogs(logsResult.items);
        setTotal(logsResult.total);
        setStats(statsResult);
      } catch (fetchError) {
        console.error('load usage data failed', fetchError);
        const message = getErrorMessage(fetchError, t('dashboard.pages.usage.loadFailed'));
        setError(message);
        setStatsError(message);
        setLogs([]);
        setStats(null);
        setTotal(0);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [endDate, page, searchTerm, selectedApiKey, startDate, t]
  );

  useEffect(() => {
    void fetchApiKeys();
  }, [fetchApiKeys]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedApiKeyId, startDate, endDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchUsage();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [fetchUsage]);

  const statsCards = [
    {
      title: t('dashboard.pages.usage.requests'),
      value: formatNumber(stats?.total_requests),
      icon: BarChart3,
      className: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
      subValue: t('dashboard.pages.usage.totalCount', { count: formatNumber(total) }),
    },
    {
      title: t('dashboard.pages.usage.tokens'),
      value: formatNumber(stats?.total_tokens),
      icon: Coins,
      className: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
      subValue: `${t('dashboard.pages.usage.totalInputTokens')}: ${formatNumber(stats?.total_input_tokens)} / ${t('dashboard.pages.usage.totalOutputTokens')}: ${formatNumber(stats?.total_output_tokens)}`,
    },
    {
      title: t('dashboard.pages.usage.cost'),
      value: formatMoney(stats?.total_actual_cost),
      icon: WalletCards,
      className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
      subValue: `${t('dashboard.pages.usage.totalCacheTokens')}: ${formatNumber(stats?.total_cache_tokens)}`,
    },
    {
      title: t('dashboard.pages.usage.averageDuration'),
      value: formatDuration(stats?.average_duration_ms),
      icon: Clock3,
      className: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300',
      subValue: `${formatDateTime(startDate)} - ${formatDateTime(endDate)}`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            <BarChart3 className="mr-2 h-6 w-6 text-indigo-500" /> {t('dashboard.pages.usage.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.usage.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchUsage(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-gray-200 dark:hover:bg-gray-900/50"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {t('dashboard.pages.usage.refresh')}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statsCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
              <div className="flex items-start gap-4">
                <div className={`rounded-xl p-3 ${card.className}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-500 dark:text-gray-400">{card.title}</div>
                  <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{card.value}</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{statsError || card.subValue}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_220px_180px_180px_auto]">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t('dashboard.pages.usage.searchPlaceholder')}
              className="block w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-colors focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
            />
          </div>

          <select
            value={selectedApiKeyId}
            onChange={(event) => setSelectedApiKeyId(event.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
          >
            <option value="">{t('dashboard.pages.usage.allApiKeys')}</option>
            {apiKeys.map((key) => (
              <option key={key.id} value={key.id}>
                {key.name}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-600 dark:border-gray-700 dark:bg-[#111111] dark:text-gray-300">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full bg-transparent text-sm outline-none"
              aria-label={t('dashboard.pages.usage.startDate')}
            />
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-600 dark:border-gray-700 dark:bg-[#111111] dark:text-gray-300">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full bg-transparent text-sm outline-none"
              aria-label={t('dashboard.pages.usage.endDate')}
            />
          </label>

          <button
            type="button"
            onClick={() => void fetchUsage(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-[#111111] dark:text-gray-200 dark:hover:bg-gray-900/50"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {t('dashboard.pages.usage.refresh')}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          <span>{t('dashboard.pages.usage.pageInfo', { page: String(page), pages: String(totalPages) })}</span>
          <span>{t('dashboard.pages.usage.totalCount', { count: formatNumber(total) })}</span>
        </div>

        <div className="block divide-y divide-gray-200 dark:divide-gray-800 sm:hidden">
          {loading ? (
            <div className="p-6 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.keys.loading')}</div>
          ) : logs.length === 0 ? (
            <div className="p-6 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.usage.empty')}</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">{log.model}</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(log.created_at)}</div>
                  </div>
                  <div className="text-right text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    {formatMoney(log.actual_cost)}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <div>
                    {t('dashboard.pages.usage.tokens')}: <span className="font-medium text-gray-700 dark:text-gray-200">{formatNumber(getLogTokens(log))}</span>
                  </div>
                  <div>
                    {t('dashboard.pages.usage.duration')}: <span className="font-medium text-gray-700 dark:text-gray-200">{formatDuration(log.duration_ms)}</span>
                  </div>
                  <div>
                    {t('dashboard.pages.usage.keyName')}: <span className="font-medium text-gray-700 dark:text-gray-200">{log.api_key?.name || '-'}</span>
                  </div>
                  <div>
                    {t('dashboard.pages.usage.stream')}: <span className="font-medium text-gray-700 dark:text-gray-200">{log.stream ? t('dashboard.pages.usage.yes') : t('dashboard.pages.usage.no')}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.usage.time')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.usage.model')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.usage.keyName')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.usage.tokens')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.usage.cost')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.usage.firstToken')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.usage.duration')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.usage.stream')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-[#1A1A1A]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">
                    {t('dashboard.pages.keys.loading')}
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">
                    {t('dashboard.pages.usage.empty')}
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDateTime(log.created_at)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{log.model}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{log.api_key?.name || '-'}</td>
                    <td className="px-6 py-4 text-sm font-mono text-gray-500 dark:text-gray-400">{formatNumber(getLogTokens(log))}</td>
                    <td className="px-6 py-4 text-sm font-medium text-emerald-600 dark:text-emerald-400">{formatMoney(log.actual_cost)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDuration(log.first_token_ms)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDuration(log.duration_ms)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{log.stream ? t('dashboard.pages.usage.yes') : t('dashboard.pages.usage.no')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || loading}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-[#111111] dark:text-gray-200 dark:hover:bg-gray-900/50"
          >
            {t('dashboard.pages.usage.previousPage')}
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages || loading}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-[#111111] dark:text-gray-200 dark:hover:bg-gray-900/50"
          >
            {t('dashboard.pages.usage.nextPage')}
          </button>
        </div>
      </div>
    </div>
  );
}
