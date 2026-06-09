'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Coins,
  CreditCard,
  Gift,
  KeyRound,
  Loader2,
  RefreshCw,
  TimerReset,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useAuthStore } from '@/store/auth';
import {
  getUserDashboardModels,
  getUserDashboardStats,
  getUserDashboardTrend,
  listUserUsageLogs,
  type UserDashboardStats,
  type UserModelUsageStat,
  type UserUsageLog,
  type UserUsageTrendPoint,
} from '@/lib/user-usage';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatMoney(value?: number | null) {
  return `$${(value ?? 0).toFixed(4)}`;
}

function formatBalance(value?: number | null) {
  return `$${(value ?? 0).toFixed(2)}`;
}

function formatNumber(value?: number | null) {
  return (value ?? 0).toLocaleString();
}

function formatTokens(value?: number | null) {
  const safe = value ?? 0;
  if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1)}M`;
  if (safe >= 1_000) return `${(safe / 1_000).toFixed(1)}K`;
  return `${safe}`;
}

function formatDuration(value?: number | null) {
  if (value == null || Number.isNaN(value)) return '-';
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 2)}s`;
  return `${Math.round(value)}ms`;
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

function getLogTokens(log: UserUsageLog) {
  return log.input_tokens + log.output_tokens + log.cache_creation_tokens + log.cache_read_tokens;
}

function TrendChart({
  data,
  t,
}: {
  data: UserUsageTrendPoint[];
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const safeData = data.length > 0 ? data : [{ date: '', actual_cost: 0, total_tokens: 0, requests: 0, input_tokens: 0, output_tokens: 0, cache_creation_tokens: 0, cache_read_tokens: 0, cost: 0 }];
  const width = 100;
  const height = 48;
  const maxCost = Math.max(...safeData.map((item) => item.actual_cost), 1);
  const maxTokens = Math.max(...safeData.map((item) => item.total_tokens), 1);

  const costPoints = safeData
    .map((item, index) => {
      const x = safeData.length === 1 ? width / 2 : (index / (safeData.length - 1)) * width;
      const y = height - (item.actual_cost / maxCost) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full">
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1="0"
              y1={height * ratio}
              x2={width}
              y2={height * ratio}
              stroke="currentColor"
              className="text-gray-200 dark:text-gray-700"
              strokeWidth="0.4"
            />
          ))}
          {safeData.map((item, index) => {
            const x = safeData.length === 1 ? width / 2 : (index / (safeData.length - 1)) * width;
            const barWidth = safeData.length === 1 ? 16 : Math.max(width / safeData.length - 1.5, 2);
            const barHeight = (item.total_tokens / maxTokens) * (height * 0.7);
            return (
              <rect
                key={`${item.date}-${index}`}
                x={Math.max(x - barWidth / 2, 0)}
                y={height - barHeight}
                width={barWidth}
                height={barHeight}
                rx="0.8"
                className="fill-blue-200 dark:fill-blue-900/50"
              />
            );
          })}
          <polyline
            fill="none"
            points={costPoints}
            stroke="currentColor"
            className="text-emerald-500"
            strokeWidth="1.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {safeData.map((item, index) => {
            const x = safeData.length === 1 ? width / 2 : (index / (safeData.length - 1)) * width;
            const y = height - (item.actual_cost / maxCost) * height;
            return <circle key={`point-${item.date}-${index}`} cx={x} cy={y} r="1.4" className="fill-emerald-500" />;
          })}
        </svg>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {safeData.slice(-3).map((item, index) => (
          <div key={`${item.date}-${index}`} className="rounded-2xl border border-gray-100 px-4 py-3 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">{item.date || t('dashboard.pages.home.noData')}</div>
            <div className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
              {t('dashboard.pages.home.requestsCount', { count: formatNumber(item.requests) })}
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('dashboard.pages.home.tokensCount', { count: formatTokens(item.total_tokens) })}
            </div>
            <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
              {t('dashboard.pages.home.costCount', { count: formatMoney(item.actual_cost) })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardHomePage() {
  const { user } = useAuthStore();
  const { t } = useI18n();
  const today = useMemo(() => new Date(), []);
  const defaultEndDate = useMemo(() => formatDateInput(today), [today]);
  const defaultStartDate = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() - 6);
    return formatDateInput(date);
  }, [today]);

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [granularity, setGranularity] = useState<'day' | 'hour'>('day');
  const [stats, setStats] = useState<UserDashboardStats | null>(null);
  const [trend, setTrend] = useState<UserUsageTrendPoint[]>([]);
  const [models, setModels] = useState<UserModelUsageStat[]>([]);
  const [recentUsage, setRecentUsage] = useState<UserUsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchDashboard = useCallback(
    async (showRefreshing = false) => {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      try {
        const [statsResult, trendResult, modelsResult, recentResult] = await Promise.all([
          getUserDashboardStats(),
          getUserDashboardTrend({ startDate, endDate, granularity }),
          getUserDashboardModels({ startDate, endDate }),
          listUserUsageLogs({ page: 1, pageSize: 5, startDate, endDate, sortBy: 'created_at', sortOrder: 'desc' }),
        ]);

        setStats(statsResult);
        setTrend(trendResult);
        setModels(modelsResult);
        setRecentUsage(recentResult.items);
      } catch (fetchError) {
        console.error('load dashboard failed', fetchError);
        setError(getErrorMessage(fetchError, t('dashboard.pages.home.loadFailed')));
        setStats(null);
        setTrend([]);
        setModels([]);
        setRecentUsage([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [endDate, granularity, startDate, t]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchDashboard();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [fetchDashboard]);

  const topModels = useMemo(() => models.slice(0, 6), [models]);
  const maxModelTokens = useMemo(() => Math.max(...topModels.map((item) => item.total_tokens), 1), [topModels]);

  const cards = [
    {
      title: t('dashboard.pages.home.balanceCard'),
      value: formatBalance(user?.balance),
      subValue: t('dashboard.pages.home.rechargeHint'),
      icon: Wallet,
      className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300',
      href: '/dashboard/finance',
      action: t('dashboard.pages.home.gotoRecharge'),
    },
    {
      title: t('dashboard.pages.home.apiKeysCard'),
      value: formatNumber(stats?.total_api_keys),
      subValue: t('dashboard.pages.home.activeKeys', { count: formatNumber(stats?.active_api_keys) }),
      icon: KeyRound,
      className: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300',
      href: '/dashboard/keys',
      action: t('dashboard.pages.home.gotoKeys'),
    },
    {
      title: t('dashboard.pages.home.todayRequestsCard'),
      value: formatNumber(stats?.today_requests),
      subValue: t('dashboard.pages.home.totalRequests', { count: formatNumber(stats?.total_requests) }),
      icon: Activity,
      className: 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300',
      href: '/dashboard/usage',
      action: t('dashboard.pages.home.gotoUsage'),
    },
    {
      title: t('dashboard.pages.home.todayCostCard'),
      value: formatMoney(stats?.today_actual_cost),
      subValue: t('dashboard.pages.home.totalCost', { count: formatMoney(stats?.total_actual_cost) }),
      icon: CreditCard,
      className: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300',
      href: '/dashboard/orders',
      action: t('dashboard.pages.home.gotoOrders'),
    },
    {
      title: t('dashboard.pages.home.todayTokensCard'),
      value: formatTokens(stats?.today_tokens),
      subValue: t('dashboard.pages.home.totalTokens', { count: formatTokens(stats?.total_tokens) }),
      icon: Coins,
      className: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300',
      href: '/dashboard/subscriptions',
      action: t('dashboard.pages.home.gotoSubscriptions'),
    },
    {
      title: t('dashboard.pages.home.performanceCard'),
      value: `${formatNumber(stats?.rpm)} RPM`,
      subValue: t('dashboard.pages.home.performanceHint', { count: formatNumber(stats?.tpm) }),
      icon: Zap,
      className: 'bg-pink-50 text-pink-600 dark:bg-pink-950/30 dark:text-pink-300',
      href: '/dashboard/plans',
      action: t('dashboard.pages.home.gotoPlans'),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {t('dashboard.pages.home.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.home.subtitle')}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-600 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-gray-300">
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full bg-transparent outline-none"
              aria-label={t('dashboard.pages.home.startDate')}
            />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-600 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-gray-300">
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full bg-transparent outline-none"
              aria-label={t('dashboard.pages.home.endDate')}
            />
          </label>
          <select
            value={granularity}
            onChange={(event) => setGranularity(event.target.value as 'day' | 'hour')}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-gray-200"
          >
            <option value="day">{t('dashboard.pages.home.day')}</option>
            <option value="hour">{t('dashboard.pages.home.hour')}</option>
          </select>
          <button
            type="button"
            onClick={() => void fetchDashboard(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-gray-200 dark:hover:bg-gray-900/50"
          >
            {loading || refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {t('dashboard.pages.home.refresh')}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{card.title}</div>
                  <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{loading ? '...' : card.value}</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{loading ? t('dashboard.pages.home.loading') : card.subValue}</div>
                </div>
                <div className={`rounded-xl p-3 ${card.className}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-5">
                <Link href={card.href} className="inline-flex items-center text-sm font-medium text-blue-600 transition hover:text-blue-500 dark:text-blue-400">
                  {card.action}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,1fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('dashboard.pages.home.trendTitle')}</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.home.trendHint')}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              {t('dashboard.pages.home.averageDuration', { count: formatDuration(stats?.average_duration_ms) })}
            </div>
          </div>
          {loading ? (
            <div className="mt-6 flex h-[300px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              {t('dashboard.pages.home.loading')}
            </div>
          ) : trend.length === 0 ? (
            <div className="mt-6 flex h-[300px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              {t('dashboard.pages.home.emptyTrend')}
            </div>
          ) : (
            <div className="mt-6">
              <TrendChart data={trend} t={t} />
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('dashboard.pages.home.modelsTitle')}</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.home.modelsHint')}</p>
            </div>
            <Link href="/dashboard/models" className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
              {t('dashboard.pages.home.viewModels')}
            </Link>
          </div>

          {loading ? (
            <div className="mt-6 flex h-72 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              {t('dashboard.pages.home.loading')}
            </div>
          ) : topModels.length === 0 ? (
            <div className="mt-6 flex h-72 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              {t('dashboard.pages.home.emptyModels')}
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {topModels.map((model) => (
                <div key={model.model} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900 dark:text-white">{model.model}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t('dashboard.pages.home.modelMeta', {
                          requests: formatNumber(model.requests),
                          tokens: formatTokens(model.total_tokens),
                        })}
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-medium text-emerald-600 dark:text-emerald-400">{formatMoney(model.actual_cost)}</div>
                      <div className="text-gray-500 dark:text-gray-400">{formatMoney(model.cost)}</div>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
                      style={{ width: `${Math.max((model.total_tokens / maxModelTokens) * 100, 6)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_340px]">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('dashboard.pages.home.recentTitle')}</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.home.recentHint')}</p>
            </div>
            <Link href="/dashboard/usage" className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
              {t('dashboard.pages.home.viewAllUsage')}
            </Link>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {loading ? (
              <div className="px-6 py-10 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.home.loading')}</div>
            ) : recentUsage.length === 0 ? (
              <div className="px-6 py-10 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.home.emptyUsage')}</div>
            ) : (
              recentUsage.map((log) => (
                <div key={log.id} className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">{log.model}</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(log.created_at)}</div>
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {t('dashboard.pages.home.recentMeta', {
                        tokens: formatTokens(getLogTokens(log)),
                        duration: formatDuration(log.duration_ms),
                      })}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatMoney(log.actual_cost)}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{log.api_key?.name || t('dashboard.pages.home.noApiKey')}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('dashboard.pages.home.quickActions')}</h2>
          </div>
          <div className="space-y-3 p-4">
            {[
              {
                href: '/dashboard/keys',
                title: t('dashboard.pages.home.actionCreateKey'),
                description: t('dashboard.pages.home.actionCreateKeyHint'),
                icon: KeyRound,
                iconClass: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300',
              },
              {
                href: '/dashboard/redeem',
                title: t('dashboard.pages.home.actionRedeem'),
                description: t('dashboard.pages.home.actionRedeemHint'),
                icon: Gift,
                iconClass: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300',
              },
              {
                href: '/dashboard/finance',
                title: t('dashboard.pages.home.actionTopup'),
                description: t('dashboard.pages.home.actionTopupHint'),
                icon: TimerReset,
                iconClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300',
              },
              {
                href: '/dashboard/subscriptions',
                title: t('dashboard.pages.home.actionSubscriptions'),
                description: t('dashboard.pages.home.actionSubscriptionsHint'),
                icon: TrendingUp,
                iconClass: 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300',
              },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center gap-4 rounded-2xl border border-gray-100 p-4 transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/40"
                >
                  <div className={`rounded-xl p-3 ${action.iconClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{action.title}</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{action.description}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
