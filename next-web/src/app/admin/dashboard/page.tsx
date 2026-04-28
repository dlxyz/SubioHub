'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, Database, KeyRound, Server, Users } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { getAdminDashboardSnapshot, type AdminDashboardStats } from '@/lib/admin-api';

function formatNumber(value: number | undefined, locale: string) {
  return new Intl.NumberFormat(locale).format(Number(value || 0));
}

function formatCost(value?: number) {
  return Number(value || 0).toFixed(2);
}

function formatDuration(value?: number) {
  if (!value) return '0 ms';
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

export default function AdminDashboardPage() {
  const { locale, t } = useI18n();
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const snapshot = await getAdminDashboardSnapshot();
        setStats(snapshot.stats || null);
      } catch (err: unknown) {
        setError(err instanceof Error && err.message ? err.message : t('admin.dashboard.loadFailed'));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [t]);

  const cards = useMemo(
    () => [
      {
        title: t('admin.dashboard.cards.totalUsers'),
        value: formatNumber(stats?.total_users, locale),
        sub: t('admin.dashboard.cards.todayNewUsers', { value: formatNumber(stats?.today_new_users, locale) }),
        icon: Users,
        color: 'text-emerald-500',
      },
      {
        title: t('admin.dashboard.cards.apiKeys'),
        value: formatNumber(stats?.total_api_keys, locale),
        sub: t('admin.dashboard.cards.activeApiKeys', { value: formatNumber(stats?.active_api_keys, locale) }),
        icon: KeyRound,
        color: 'text-blue-500',
      },
      {
        title: t('admin.dashboard.cards.accounts'),
        value: formatNumber(stats?.total_accounts, locale),
        sub: t('admin.dashboard.cards.accountHealth', {
          normal: formatNumber(stats?.normal_accounts, locale),
          error: formatNumber(stats?.error_accounts, locale),
        }),
        icon: Server,
        color: 'text-purple-500',
      },
      {
        title: t('admin.dashboard.cards.requests'),
        value: formatNumber(stats?.today_requests, locale),
        sub: t('admin.dashboard.cards.totalRequests', { value: formatNumber(stats?.total_requests, locale) }),
        icon: Activity,
        color: 'text-orange-500',
      },
      {
        title: t('admin.dashboard.cards.tokens'),
        value: formatNumber(stats?.today_tokens, locale),
        sub: t('admin.dashboard.cards.totalTokens', { value: formatNumber(stats?.total_tokens, locale) }),
        icon: Database,
        color: 'text-cyan-500',
      },
      {
        title: t('admin.dashboard.cards.actualCost'),
        value: `$${formatCost(stats?.today_actual_cost)}`,
        sub: t('admin.dashboard.cards.totalCost', { value: formatCost(stats?.total_actual_cost) }),
        icon: Activity,
        color: 'text-rose-500',
      },
    ],
    [locale, stats, t]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('admin.dashboard.title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('admin.dashboard.subtitle')}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{card.title}</p>
                <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
                  {loading ? '...' : card.value}
                </p>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{loading ? t('dashboard.common.loading') : card.sub}</p>
              </div>
              <card.icon className={`h-6 w-6 ${card.color}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('admin.dashboard.panels.performance')}</h3>
          <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
            {loading ? '...' : formatDuration(stats?.average_duration_ms)}
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {loading
              ? t('dashboard.common.loading')
              : t('admin.dashboard.panels.activeUsers', { value: formatNumber(stats?.active_users, locale) })}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('admin.dashboard.panels.throughput')}</h3>
          <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
            {loading ? '...' : `${formatNumber(stats?.rpm, locale)} RPM`}
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {loading ? '...' : `${formatNumber(stats?.tpm, locale)} TPM`}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('admin.dashboard.panels.status')}</h3>
          <p className="mt-3 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {error ? t('admin.dashboard.panels.backendIssue') : t('admin.dashboard.panels.backendConnected')}
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('admin.dashboard.panels.backendHint')}</p>
        </div>
      </div>
    </div>
  );
}
