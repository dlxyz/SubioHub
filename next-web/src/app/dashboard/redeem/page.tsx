'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BadgeCheck, Bolt, CheckCircle2, Clock3, CreditCard, Gift, Info, RefreshCw } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { getPublicSettings } from '@/lib/public-settings';
import { getCurrentUserProfile, getRedeemHistory, redeemCode, type RedeemHistoryItem } from '@/lib/user-payments';
import { useAuthStore } from '@/store/auth';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function isBalanceType(type: string) {
  return type === 'balance' || type === 'admin_balance';
}

function isSubscriptionType(type: string) {
  return type === 'subscription';
}

function isAdminAdjustment(type: string) {
  return type === 'admin_balance' || type === 'admin_concurrency';
}

function formatMoney(value?: number | null) {
  return `$${(value ?? 0).toFixed(2)}`;
}

function getHistoryTitle(item: RedeemHistoryItem, t: (key: string, params?: Record<string, string>) => string) {
  if (item.type === 'balance') return t('dashboard.pages.redeem.balanceAddedRedeem');
  if (item.type === 'admin_balance') return item.value >= 0 ? t('dashboard.pages.redeem.balanceAddedAdmin') : t('dashboard.pages.redeem.balanceDeductedAdmin');
  if (item.type === 'concurrency') return t('dashboard.pages.redeem.concurrencyAddedRedeem');
  if (item.type === 'admin_concurrency') return item.value >= 0 ? t('dashboard.pages.redeem.concurrencyAddedAdmin') : t('dashboard.pages.redeem.concurrencyReducedAdmin');
  if (item.type === 'subscription') return t('dashboard.pages.redeem.subscriptionAssigned');
  return t('dashboard.pages.redeem.unknown');
}

function formatHistoryValue(item: RedeemHistoryItem, t: (key: string, params?: Record<string, string>) => string) {
  if (isBalanceType(item.type)) {
    const sign = item.value >= 0 ? '+' : '';
    return `${sign}${formatMoney(item.value)}`;
  }
  if (isSubscriptionType(item.type)) {
    const days = item.validity_days || Math.round(item.value);
    return item.group?.name ? `${days}${t('dashboard.pages.redeem.days')} - ${item.group.name}` : `${days}${t('dashboard.pages.redeem.days')}`;
  }
  const sign = item.value >= 0 ? '+' : '';
  return `${sign}${item.value} ${t('dashboard.pages.redeem.requests')}`;
}

function getHistoryIcon(item: RedeemHistoryItem) {
  if (isBalanceType(item.type)) return CreditCard;
  if (isSubscriptionType(item.type)) return BadgeCheck;
  return Bolt;
}

function getHistoryBadgeClass(item: RedeemHistoryItem) {
  if (isBalanceType(item.type)) {
    return item.value >= 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300';
  }
  if (isSubscriptionType(item.type)) {
    return 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300';
  }
  return item.value >= 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
}

export default function DashboardRedeemPage() {
  const { t } = useI18n();
  const { user, updateUser } = useAuthStore();
  const [redeemInput, setRedeemInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [history, setHistory] = useState<RedeemHistoryItem[]>([]);
  const [redeemResult, setRedeemResult] = useState<RedeemHistoryItem | null>(null);
  const [error, setError] = useState('');
  const [contactInfo, setContactInfo] = useState('');

  const refreshUserProfile = useCallback(async () => {
    const profile = await getCurrentUserProfile();
    updateUser({
      id: profile.id,
      email: profile.email,
      role: profile.role,
      balance: profile.balance,
      concurrency: profile.concurrency,
      invite_code: profile.invite_code,
    });
  }, [updateUser]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const result = await getRedeemHistory();
      setHistory(result);
    } catch (historyError) {
      console.error('load redeem history failed', historyError);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    void getPublicSettings()
      .then((settings) => setContactInfo(settings.contact_info || ''))
      .catch((settingsError) => {
        console.error('load public settings failed', settingsError);
      });
  }, [loadHistory]);

  const handleRedeem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!redeemInput.trim()) {
      setError(t('dashboard.pages.redeem.pleaseEnterCode'));
      return;
    }

    setSubmitting(true);
    setError('');
    setRedeemResult(null);

    try {
      const result = await redeemCode(redeemInput.trim());
      setRedeemResult(result);
      setRedeemInput('');
      await refreshUserProfile();
      await loadHistory();
    } catch (redeemError) {
      console.error('redeem code failed', redeemError);
      setError(getErrorMessage(redeemError, t('dashboard.pages.redeem.failedToRedeem')));
    } finally {
      setSubmitting(false);
    }
  };

  const rules = useMemo(
    () => [
      t('dashboard.pages.redeem.codeRule1'),
      t('dashboard.pages.redeem.codeRule2'),
      t('dashboard.pages.redeem.codeRule3'),
      t('dashboard.pages.redeem.codeRule4'),
    ],
    [t]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 px-6 py-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <CreditCard className="h-8 w-8 text-white" />
          </div>
          <p className="text-sm font-medium text-blue-100">{t('dashboard.pages.redeem.currentBalance')}</p>
          <p className="mt-2 text-4xl font-bold text-white">{formatMoney(user?.balance)}</p>
          <p className="mt-2 text-sm text-blue-100">
            {t('dashboard.pages.redeem.concurrency')}: {user?.concurrency || 0} {t('dashboard.pages.redeem.requests')}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
            <div className="p-6">
              <form onSubmit={handleRedeem} className="space-y-5">
                <div>
                  <label htmlFor="redeem-code" className="block text-sm font-medium text-gray-900 dark:text-white">
                    {t('dashboard.pages.redeem.redeemCodeLabel')}
                  </label>
                  <div className="relative mt-2">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                      <Gift className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="redeem-code"
                      value={redeemInput}
                      onChange={(event) => setRedeemInput(event.target.value)}
                      placeholder={t('dashboard.pages.redeem.redeemCodePlaceholder')}
                      disabled={submitting}
                      className="block w-full rounded-lg border border-gray-300 py-3 pl-12 pr-4 text-lg text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                    />
                  </div>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.redeem.redeemCodeHint')}</p>
                </div>

                <button
                  type="submit"
                  disabled={!redeemInput.trim() || submitting}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  {submitting ? t('dashboard.pages.redeem.redeeming') : t('dashboard.pages.redeem.redeemButton')}
                </button>
              </form>
            </div>
          </div>

          {redeemResult ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">{t('dashboard.pages.redeem.redeemSuccess')}</h3>
                    <div className="mt-3 space-y-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                      <p>{getHistoryTitle(redeemResult, t)}</p>
                      <p className="font-medium">{formatHistoryValue(redeemResult, t)}</p>
                      <p>{t('dashboard.pages.redeem.newBalance')}: <span className="font-semibold">{formatMoney(user?.balance)}</span></p>
                      <p>{t('dashboard.pages.redeem.newConcurrency')}: <span className="font-semibold">{user?.concurrency || 0} {t('dashboard.pages.redeem.requests')}</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 shadow-sm dark:border-red-900/50 dark:bg-red-950/30">
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/30">
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">{t('dashboard.pages.redeem.redeemFailed')}</h3>
                    <p className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-blue-200 bg-blue-50 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/20">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
                  <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300">{t('dashboard.pages.redeem.aboutCodes')}</h3>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-blue-700 dark:text-blue-400">
                    {rules.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                  {contactInfo ? (
                    <div className="mt-3 inline-flex items-center rounded-md bg-blue-200/60 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-800/40 dark:text-blue-200">
                      {contactInfo}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('dashboard.pages.redeem.recentActivity')}</h2>
          </div>
          <div className="p-6">
            {loadingHistory ? (
              <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                <RefreshCw className="h-5 w-5 animate-spin" />
              </div>
            ) : history.length > 0 ? (
              <div className="space-y-3">
                {history.map((item) => {
                  const Icon = getHistoryIcon(item);
                  return (
                    <div key={item.id} className="flex items-center justify-between rounded-xl bg-gray-50 p-4 dark:bg-[#111111]">
                      <div className="flex min-w-0 items-center gap-4">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${getHistoryBadgeClass(item)}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{getHistoryTitle(item, t)}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(item.used_at || item.created_at)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatHistoryValue(item, t)}</p>
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                          {isAdminAdjustment(item.type) ? t('dashboard.pages.redeem.adminAdjustment') : `${item.code.slice(0, 8)}...`}
                        </p>
                        {item.notes ? <p className="mt-1 max-w-[200px] truncate text-xs italic text-gray-500 dark:text-gray-400">{item.notes}</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-[#111111]">
                  <Clock3 className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.redeem.historyWillAppear')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
