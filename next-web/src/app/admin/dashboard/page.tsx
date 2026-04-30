'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Database,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Server,
  SquareArrowOutUpRight,
  Users,
  Wrench,
} from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import {
  checkAdminSystemUpdates,
  getAdminDashboardSnapshot,
  getAdminSystemVersion,
  performAdminSystemUpdate,
  restartAdminSystemService,
  rollbackAdminSystemUpdate,
  type AdminDashboardStats,
  type AdminSystemUpdateInfo,
} from '@/lib/admin-api';

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

function formatDateTime(value: string | undefined, locale: string) {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatDetailedDateTime(value: number, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function formatRetryAfter(targetMs: number, locale: string) {
  const diffMs = Math.max(0, targetMs - Date.now());
  const diffMinutes = Math.ceil(diffMs / 60000);

  if (diffMinutes <= 1) {
    return locale.startsWith('zh') ? '约 1 分钟后' : 'in about 1 minute';
  }
  if (diffMinutes < 60) {
    return locale.startsWith('zh') ? `约 ${diffMinutes} 分钟后` : `in about ${diffMinutes} minutes`;
  }

  const diffHours = Math.ceil(diffMinutes / 60);
  return locale.startsWith('zh') ? `约 ${diffHours} 小时后` : `in about ${diffHours} hours`;
}

function formatVersionError(message: string, locale: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const rateLimitMatch = message.match(/GitHub API rate limit reached; retry after reset time (\d{10,})/);
  if (rateLimitMatch) {
    const resetSeconds = Number(rateLimitMatch[1]);
    if (Number.isFinite(resetSeconds)) {
      const resetMs = resetSeconds * 1000;
      return t('admin.dashboard.version.rateLimitedAt', {
        time: formatDetailedDateTime(resetMs, locale),
        relative: formatRetryAfter(resetMs, locale),
      });
    }
    return t('admin.dashboard.version.rateLimited');
  }

  if (message.includes('GitHub API rate limit reached')) {
    return t('admin.dashboard.version.rateLimited');
  }
  if (message.includes('GitHub release check unauthorized (401)')) {
    return t('admin.dashboard.version.unauthorized');
  }
  if (message.includes('GitHub release check forbidden (403)')) {
    return t('admin.dashboard.version.forbidden');
  }

  return message;
}

export default function AdminDashboardPage() {
  const { locale, t } = useI18n();
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updateInfo, setUpdateInfo] = useState<AdminSystemUpdateInfo | null>(null);
  const [versionLoading, setVersionLoading] = useState(true);
  const [versionError, setVersionError] = useState('');
  const [versionNotice, setVersionNotice] = useState('');
  const [versionAction, setVersionAction] = useState<'check' | 'update' | 'rollback' | 'restart' | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const snapshot = await getAdminDashboardSnapshot();
      setStats(snapshot.stats || null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('admin.dashboard.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadVersion = useCallback(async (force = false) => {
    setVersionLoading(true);
    setVersionError('');
    try {
      const info = await checkAdminSystemUpdates(force);
      setUpdateInfo(info);
    } catch (err: unknown) {
      try {
        const version = await getAdminSystemVersion();
        setUpdateInfo({
          current_version: version.version,
          latest_version: version.version,
          has_update: false,
          build_type: 'unknown',
        });
      } catch {
        setUpdateInfo(null);
      }
      setVersionError(formatVersionError(getErrorMessage(err, t('admin.dashboard.version.loadFailed')), locale, t));
    } finally {
      setVersionLoading(false);
    }
  }, [locale, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
      void loadVersion(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDashboard, loadVersion]);

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

  const buildType = updateInfo?.build_type || 'unknown';
  const isReleaseBuild = buildType === 'release';
  const hasUpdate = Boolean(updateInfo?.has_update);
  const canRollback = isReleaseBuild;
  const releaseInfo = updateInfo?.release_info;

  const versionStatusLabel = versionLoading
    ? t('admin.dashboard.version.checking')
    : hasUpdate
      ? t('admin.dashboard.version.statusHasUpdate')
      : t('admin.dashboard.version.statusLatest');
  const upgradeMethodLabel = isReleaseBuild
    ? t('admin.dashboard.version.autoUpgrade')
    : t('admin.dashboard.version.manualUpgrade');

  const handleCheckUpdates = async () => {
    setVersionAction('check');
    setVersionNotice('');
    await loadVersion(true);
    setVersionAction(null);
  };

  const handlePerformUpdate = async () => {
    if (!hasUpdate) {
      return;
    }
    if (!window.confirm(t('admin.dashboard.version.confirmUpdate'))) {
      return;
    }
    setVersionAction('update');
    setVersionError('');
    setVersionNotice('');
    try {
      const result = await performAdminSystemUpdate();
      setVersionNotice(result.message || t('admin.dashboard.version.updateDone'));
      await loadVersion(true);
    } catch (err: unknown) {
      setVersionError(formatVersionError(getErrorMessage(err, t('admin.dashboard.version.updateFailed')), locale, t));
    } finally {
      setVersionAction(null);
    }
  };

  const handleRollback = async () => {
    if (!window.confirm(t('admin.dashboard.version.confirmRollback'))) {
      return;
    }
    setVersionAction('rollback');
    setVersionError('');
    setVersionNotice('');
    try {
      const result = await rollbackAdminSystemUpdate();
      setVersionNotice(result.message || t('admin.dashboard.version.rollbackDone'));
      await loadVersion(true);
    } catch (err: unknown) {
      setVersionError(formatVersionError(getErrorMessage(err, t('admin.dashboard.version.rollbackFailed')), locale, t));
    } finally {
      setVersionAction(null);
    }
  };

  const handleRestart = async () => {
    if (!window.confirm(t('admin.dashboard.version.confirmRestart'))) {
      return;
    }
    setVersionAction('restart');
    setVersionError('');
    setVersionNotice('');
    try {
      const result = await restartAdminSystemService();
      setVersionNotice(result.message || t('admin.dashboard.version.restartDone'));
    } catch (err: unknown) {
      setVersionError(formatVersionError(getErrorMessage(err, t('admin.dashboard.version.restartFailed')), locale, t));
    } finally {
      setVersionAction(null);
    }
  };

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
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {loading ? t('dashboard.common.loading') : card.sub}
                </p>
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

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('admin.dashboard.version.title')}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('admin.dashboard.version.subtitle')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleCheckUpdates()}
              disabled={versionAction !== null}
              className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${versionAction === 'check' ? 'animate-spin' : ''}`} />
              {versionAction === 'check' ? t('admin.dashboard.version.checking') : t('admin.dashboard.version.actions.check')}
            </button>
            <button
              type="button"
              onClick={() => void handlePerformUpdate()}
              disabled={versionAction !== null || !isReleaseBuild || !hasUpdate}
              className="inline-flex items-center rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-900"
            >
              <Wrench className="mr-2 h-4 w-4" />
              {versionAction === 'update' ? t('admin.dashboard.version.updating') : t('admin.dashboard.version.actions.update')}
            </button>
            <button
              type="button"
              onClick={() => void handleRollback()}
              disabled={versionAction !== null || !canRollback}
              className="inline-flex items-center rounded-lg border border-amber-200 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900/60 dark:text-amber-300 dark:hover:bg-amber-950/20"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {versionAction === 'rollback' ? t('admin.dashboard.version.rollingBack') : t('admin.dashboard.version.actions.rollback')}
            </button>
            <button
              type="button"
              onClick={() => void handleRestart()}
              disabled={versionAction !== null}
              className="inline-flex items-center rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-900/60 dark:text-blue-300 dark:hover:bg-blue-950/20"
            >
              <Server className="mr-2 h-4 w-4" />
              {versionAction === 'restart' ? t('admin.dashboard.version.restarting') : t('admin.dashboard.version.actions.restart')}
            </button>
          </div>
        </div>

        {versionError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {versionError}
          </div>
        ) : null}

        {versionNotice ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
            {versionNotice}
          </div>
        ) : null}

        {updateInfo?.warning ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
            {formatVersionError(updateInfo.warning, locale, t)}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('admin.dashboard.version.current')}
            </p>
            <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
              {versionLoading ? '...' : updateInfo?.current_version || '-'}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('admin.dashboard.version.latest')}
            </p>
            <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
              {versionLoading ? '...' : updateInfo?.latest_version || '-'}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('admin.dashboard.version.status')}
            </p>
            <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{versionStatusLabel}</p>
          </div>
          <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('admin.dashboard.version.method')}
            </p>
            <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{upgradeMethodLabel}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{t('admin.dashboard.version.buildType')}</p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {isReleaseBuild ? t('admin.dashboard.version.releaseBuildHint') : t('admin.dashboard.version.sourceBuildHint')}
            </p>
            <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
              {t('admin.dashboard.version.buildTypeValue', { value: buildType })}
            </p>
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
              {isReleaseBuild
                ? t('admin.dashboard.version.autoHint')
                : t('admin.dashboard.version.manualHint')}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{t('admin.dashboard.version.releaseNotes')}</p>
              {releaseInfo?.html_url ? (
                <a
                  href={releaseInfo.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
                >
                  {t('admin.dashboard.version.actions.openRelease')}
                  <SquareArrowOutUpRight className="ml-1 h-4 w-4" />
                </a>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {releaseInfo?.published_at
                ? t('admin.dashboard.version.releasePublishedAt', {
                    value: formatDateTime(releaseInfo.published_at, locale),
                  })
                : t('admin.dashboard.version.noReleaseInfo')}
            </p>
            <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm leading-6 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
              <div className="font-medium text-gray-900 dark:text-white">{releaseInfo?.name || updateInfo?.latest_version || '-'}</div>
              <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm">
                {releaseInfo?.body?.trim() || t('admin.dashboard.version.noReleaseInfo')}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
