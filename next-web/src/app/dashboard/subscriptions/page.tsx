'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CreditCard, RefreshCw } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { cn } from '@/lib/utils';
import {
  getUserSubscriptionProgress,
  getUserSubscriptionSummary,
  listActiveUserSubscriptions,
  type SubscriptionProgressInfo,
  type UserSubscription,
} from '@/lib/user-subscriptions';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatMoney(value?: number | null) {
  return `$${(value ?? 0).toFixed(2)}`;
}

function formatDateOnly(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
}

function platformLabel(platform: string) {
  switch (platform) {
    case 'openai':
      return 'OpenAI';
    case 'anthropic':
      return 'Anthropic';
    case 'gemini':
      return 'Gemini';
    case 'antigravity':
      return 'Antigravity';
    default:
      return platform || 'Default';
  }
}

function platformBorderClass(platform: string) {
  switch (platform) {
    case 'openai':
      return 'border-emerald-200 dark:border-emerald-900/40';
    case 'anthropic':
      return 'border-orange-200 dark:border-orange-900/40';
    case 'gemini':
      return 'border-blue-200 dark:border-blue-900/40';
    case 'antigravity':
      return 'border-purple-200 dark:border-purple-900/40';
    default:
      return 'border-gray-200 dark:border-gray-800';
  }
}

function platformBadgeClass(platform: string) {
  switch (platform) {
    case 'openai':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300';
    case 'anthropic':
      return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300';
    case 'gemini':
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300';
    case 'antigravity':
      return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-300';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300';
  }
}

function platformButtonClass(platform: string) {
  switch (platform) {
    case 'openai':
      return 'bg-emerald-600 hover:bg-emerald-700';
    case 'anthropic':
      return 'bg-orange-600 hover:bg-orange-700';
    case 'gemini':
      return 'bg-blue-600 hover:bg-blue-700';
    case 'antigravity':
      return 'bg-purple-600 hover:bg-purple-700';
    default:
      return 'bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200';
  }
}

function platformAccentDotClass(platform: string) {
  switch (platform) {
    case 'openai':
      return 'bg-emerald-500';
    case 'anthropic':
      return 'bg-orange-500';
    case 'gemini':
      return 'bg-blue-500';
    case 'antigravity':
      return 'bg-purple-500';
    default:
      return 'bg-gray-400';
  }
}

function getProgressBarClass(percentage: number) {
  if (percentage >= 90) return 'bg-red-500';
  if (percentage >= 70) return 'bg-orange-500';
  return 'bg-green-500';
}

function formatRemainingTime(seconds: number | null | undefined, t: (key: string, params?: Record<string, string>) => string) {
  if (!seconds || seconds <= 0) {
    return t('dashboard.pages.subscriptions.windowNotActive');
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${Math.max(1, minutes)}m`;
}

function formatExpirationText(
  expiresAt: string | null | undefined,
  daysRemaining: number | null | undefined,
  t: (key: string, params?: Record<string, string>) => string
) {
  if (!expiresAt) return t('dashboard.pages.subscriptions.noExpiration');
  const dateText = formatDateOnly(expiresAt);
  if (daysRemaining == null) return dateText;
  if (daysRemaining < 0) return t('dashboard.pages.subscriptions.statusExpired');
  if (daysRemaining === 0) return `${dateText} (${t('dashboard.pages.subscriptions.today')})`;
  if (daysRemaining === 1) return `${dateText} (${t('dashboard.pages.subscriptions.tomorrow')})`;
  return `${t('dashboard.pages.subscriptions.daysRemaining', { days: String(daysRemaining) })} (${dateText})`;
}

function getExpirationClass(daysRemaining: number | null | undefined) {
  if (daysRemaining == null) return 'text-gray-700 dark:text-gray-300';
  if (daysRemaining <= 0) return 'font-medium text-red-600 dark:text-red-400';
  if (daysRemaining <= 3) return 'text-red-600 dark:text-red-400';
  if (daysRemaining <= 7) return 'text-orange-600 dark:text-orange-400';
  return 'text-gray-700 dark:text-gray-300';
}

type ProgressMap = Map<number, SubscriptionProgressInfo['progress']>;

export default function DashboardSubscriptionsPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [summary, setSummary] = useState<{ active_count: number; total_used_usd: number } | null>(null);
  const [progressMap, setProgressMap] = useState<ProgressMap>(new Map());

  const loadSubscriptions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [activeSubscriptions, progressItems, summaryResult] = await Promise.all([
        listActiveUserSubscriptions(),
        getUserSubscriptionProgress(),
        getUserSubscriptionSummary(),
      ]);

      const nextProgressMap: ProgressMap = new Map();
      for (const item of progressItems) {
        if (item.subscription?.id) {
          nextProgressMap.set(item.subscription.id, item.progress);
        }
      }

      setSubscriptions(activeSubscriptions);
      setProgressMap(nextProgressMap);
      setSummary(summaryResult);
    } catch (loadError) {
      console.error('load subscriptions failed', loadError);
      setError(getErrorMessage(loadError, t('dashboard.pages.subscriptions.failedToLoad')));
      setSubscriptions([]);
      setProgressMap(new Map());
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadSubscriptions();
  }, [loadSubscriptions]);

  const summaryCards = useMemo(
    () => [
      {
        title: t('dashboard.pages.subscriptions.activeCount'),
        value: String(summary?.active_count ?? subscriptions.length),
      },
      {
        title: t('dashboard.pages.subscriptions.totalUsed'),
        value: formatMoney(summary?.total_used_usd ?? 0),
      },
    ],
    [subscriptions.length, summary, t]
  );

  const getStatusLabel = useCallback(
    (status: UserSubscription['status']) => {
      switch (status) {
        case 'active':
          return t('dashboard.pages.subscriptions.statusActive');
        case 'expired':
          return t('dashboard.pages.subscriptions.statusExpired');
        case 'revoked':
        default:
          return t('dashboard.pages.subscriptions.statusRevoked');
      }
    },
    [t]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            <CreditCard className="mr-2 h-6 w-6 text-indigo-500" /> {t('dashboard.pages.subscriptions.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.subscriptions.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadSubscriptions()}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-gray-200 dark:hover:bg-gray-900/50"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('dashboard.pages.subscriptions.refresh')}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {summaryCards.map((item) => (
          <div key={item.title} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
            <div className="text-sm text-gray-500 dark:text-gray-400">{item.title}</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{item.value}</div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('dashboard.pages.subscriptions.summaryHint')}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : subscriptions.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-[#111111]">
            <CreditCard className="h-8 w-8 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">{t('dashboard.pages.subscriptions.emptyTitle')}</h3>
          <p className="mx-auto max-w-xl text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.subscriptions.emptyDescription')}</p>
          <Link
            href="/dashboard/plans"
            className="mt-5 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            {t('dashboard.pages.subscriptions.goPlans')}
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {subscriptions.map((subscription) => {
            const platform = subscription.group?.platform || '';
            const progress = progressMap.get(subscription.id) || null;
            const expirationText = formatExpirationText(subscription.expires_at, progress?.days_remaining, t);

            const progressSections = [
              {
                key: 'daily',
                label: t('dashboard.pages.subscriptions.daily'),
                used: progress?.daily?.used ?? subscription.daily_usage_usd,
                limit: progress?.daily?.limit ?? subscription.group?.daily_limit_usd ?? null,
                percentage: progress?.daily?.percentage ?? 0,
                resetInSeconds: progress?.daily?.reset_in_seconds,
              },
              {
                key: 'weekly',
                label: t('dashboard.pages.subscriptions.weekly'),
                used: progress?.weekly?.used ?? subscription.weekly_usage_usd,
                limit: progress?.weekly?.limit ?? subscription.group?.weekly_limit_usd ?? null,
                percentage: progress?.weekly?.percentage ?? 0,
                resetInSeconds: progress?.weekly?.reset_in_seconds,
              },
              {
                key: 'monthly',
                label: t('dashboard.pages.subscriptions.monthly'),
                used: progress?.monthly?.used ?? subscription.monthly_usage_usd,
                limit: progress?.monthly?.limit ?? subscription.group?.monthly_limit_usd ?? null,
                percentage: progress?.monthly?.percentage ?? 0,
                resetInSeconds: progress?.monthly?.reset_in_seconds,
              },
            ].filter((item) => item.limit != null && item.limit > 0);

            return (
              <div
                key={subscription.id}
                className={cn(
                  'overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-[#1A1A1A]',
                  platformBorderClass(platform)
                )}
              >
                <div className="flex items-center justify-between border-b border-gray-100 p-4 dark:border-gray-800">
                  <div className="flex items-center gap-3">
                    <div className={cn('h-1.5 w-1.5 shrink-0 rounded-full', platformAccentDotClass(platform))} />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {subscription.group?.name || `Group #${subscription.group_id}`}
                        </h3>
                        <span className={cn('rounded-md border px-2 py-0.5 text-[11px] font-medium', platformBadgeClass(platform))}>
                          {platformLabel(platform)}
                        </span>
                      </div>
                      {subscription.group?.description ? (
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subscription.group.description}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        subscription.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : subscription.status === 'expired'
                            ? 'bg-gray-100 text-gray-600 dark:bg-gray-900/60 dark:text-gray-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      )}
                    >
                      {getStatusLabel(subscription.status)}
                    </span>
                    {subscription.status === 'active' ? (
                      <Link
                        href={`/dashboard/plans?tab=subscription&group=${subscription.group_id}`}
                        className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors', platformButtonClass(platform))}
                      >
                        {t('dashboard.pages.subscriptions.renewNow')}
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-4 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.subscriptions.expires')}</span>
                    <span className={cn('text-right', getExpirationClass(progress?.days_remaining))}>{expirationText}</span>
                  </div>

                  {progressSections.length > 0 ? (
                    progressSections.map((section) => (
                      <div key={section.key} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{section.label}</span>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {formatMoney(section.used)} / {formatMoney(section.limit)}
                          </span>
                        </div>
                        <div className="relative h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                          <div
                            className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-300', getProgressBarClass(section.percentage))}
                            style={{ width: `${Math.min(section.percentage, 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('dashboard.pages.subscriptions.resetIn', {
                            time: formatRemainingTime(section.resetInSeconds, t),
                          })}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 py-6 dark:from-emerald-900/20 dark:to-teal-900/20">
                      <div className="flex items-center gap-3">
                        <span className="text-4xl text-emerald-600 dark:text-emerald-400">∞</span>
                        <div>
                          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{t('dashboard.pages.subscriptions.unlimited')}</p>
                          <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">{t('dashboard.pages.subscriptions.unlimitedDesc')}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
