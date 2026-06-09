'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  Copy,
  ArrowRightLeft,
  DollarSign,
  Clock,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  ReceiptText,
} from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useAuthStore } from '@/store/auth';
import {
  getAffiliateInfo,
  listAffiliateCommissionLogs,
  transferAffiliateCommission,
  type AffiliateCommissionLog,
  type AffiliateInfo,
} from '@/lib/user-affiliate';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export default function AffiliatePage() {
  const { user, updateUser } = useAuthStore();
  const { t } = useI18n();
  const [info, setInfo] = useState<AffiliateInfo | null>(null);
  const [logs, setLogs] = useState<AffiliateCommissionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [isTransferring, setIsTransferring] = useState(false);
  const [copied, setCopied] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [error, setError] = useState('');
  const [logsError, setLogsError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const PAGE_SIZE = 10;

  const inviteCode = info?.invite_code || user?.invite_code || '';
  const inviteLink = typeof window !== 'undefined' 
    ? `${window.location.origin}/register?affiliate_code=${inviteCode}`
    : '';

  const fetchAffiliateInfo = useCallback(async () => {
    setError('');
    try {
      const res = await getAffiliateInfo();
      setInfo(res);
    } catch (error: unknown) {
      console.error(t('dashboard.pages.affiliate.fetchFailed'), error);
      setInfo(null);
      setError(getErrorMessage(error, t('dashboard.pages.affiliate.fetchFailed')));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const fetchLogs = useCallback(
    async (targetPage = page) => {
      setLogsLoading(true);
      setLogsError('');
      try {
        const result = await listAffiliateCommissionLogs(targetPage, PAGE_SIZE);
        setLogs(result.items);
        setPage(result.page);
        setTotal(result.total);
      } catch (error: unknown) {
        console.error(t('dashboard.pages.affiliate.logsFetchFailed'), error);
        setLogs([]);
        setLogsError(getErrorMessage(error, t('dashboard.pages.affiliate.logsFetchFailed')));
      } finally {
        setLogsLoading(false);
      }
    },
    [page, t]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchAffiliateInfo();
      void fetchLogs(1);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchAffiliateInfo, fetchLogs]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount <= 0) return;

    setIsTransferring(true);
    try {
      await transferAffiliateCommission(amount);
      setTransferAmount('');
      await Promise.all([fetchAffiliateInfo(), fetchLogs(1)]);
      if (user) {
        updateUser({ balance: (user.balance || 0) + amount });
      }
      window.alert(t('dashboard.pages.affiliate.transferSuccess'));
    } catch (error: unknown) {
      window.alert(getErrorMessage(error, t('dashboard.pages.affiliate.transferFailed')));
    } finally {
      setIsTransferring(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const getStatusLabel = (status: string) => {
    const key = `dashboard.pages.affiliate.status.${status}` as const;
    const fallbackMap: Record<string, string> = {
      pending: 'Pending',
      settled: 'Settled',
      transferred: 'Transferred',
      cancelled: 'Cancelled',
      reversed: 'Reversed',
    };
    const translated = t(key);
    return translated === key ? fallbackMap[status] || status : translated;
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'settled':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300';
      case 'pending':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300';
      case 'transferred':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300';
      case 'cancelled':
      case 'reversed':
        return 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center">
            <Users className="mr-2 h-6 w-6 text-purple-500" /> {t('dashboard.pages.affiliate.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('dashboard.pages.affiliate.subtitle')}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* 专属邀请链接 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 border border-blue-100 dark:border-blue-800/50 shadow-sm">
        <div className="mb-4 rounded-lg bg-white/80 p-4 dark:bg-gray-900/40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                {t('dashboard.pages.affiliate.inviteCodeTitle')}
              </h4>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('dashboard.pages.affiliate.inviteCodeHint')}
              </p>
            </div>
            <button
              onClick={handleCopyCode}
              disabled={!inviteCode}
              className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-2 text-xs font-medium text-blue-700 shadow-sm hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:bg-gray-900 dark:text-blue-300 dark:hover:bg-gray-800"
            >
              <Copy className="mr-2 h-4 w-4" />
              {t('dashboard.pages.affiliate.copyCode')}
            </button>
          </div>
          <div className="mt-3 rounded-lg border border-dashed border-blue-200 bg-white px-4 py-3 font-mono text-base font-semibold tracking-[0.2em] text-blue-700 dark:border-blue-800 dark:bg-gray-950 dark:text-blue-300">
            {inviteCode || '--------'}
          </div>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {t('dashboard.pages.affiliate.inviteTitle')}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {t('dashboard.pages.affiliate.inviteHintPrefix')}
          <span className="font-bold text-blue-600 dark:text-blue-400">{info ? (info.commission_rate * 100).toFixed(0) : '10'}%</span>
          {t('dashboard.pages.affiliate.inviteHintSuffix')}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative rounded-md shadow-sm">
            <input
              type="text"
              readOnly
              value={inviteLink}
              className="block w-full rounded-lg border-gray-300 dark:border-gray-600 pl-4 pr-12 py-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 sm:text-sm font-mono truncate"
            />
          </div>
          <button
            onClick={handleCopyLink}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors shrink-0"
          >
            {copied ? <CheckCircle2 className="h-5 w-5 mr-2" /> : <Copy className="h-5 w-5 mr-2" />}
            {copied ? t('dashboard.pages.affiliate.copied') : t('dashboard.pages.affiliate.copyLink')}
          </button>
        </div>
      </div>

      {/* 数据看板 */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* 可划转余额 */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.pages.affiliate.transferable')}</h3>
            <DollarSign className="h-5 w-5 text-green-500" />
          </div>
          <div className="mt-4 flex items-baseline text-4xl font-bold text-gray-900 dark:text-white">
            ${isLoading ? '...' : info?.commission_balance?.toFixed(2)}
          </div>
        </div>

        {/* 冻结中 */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.pages.affiliate.pending')}</h3>
            <Clock className="h-5 w-5 text-orange-500" />
          </div>
          <div className="mt-4 flex items-baseline text-4xl font-bold text-gray-900 dark:text-white">
            ${isLoading ? '...' : info?.pending_amount?.toFixed(2)}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('dashboard.pages.affiliate.pendingHint')}</p>
        </div>

        {/* 累计收益 */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-sm sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.pages.affiliate.totalEarned')}</h3>
            <TrendingUp className="h-5 w-5 text-purple-500" />
          </div>
          <div className="mt-4 flex items-baseline text-4xl font-bold text-gray-900 dark:text-white">
            ${isLoading ? '...' : info?.total_commission_earned?.toFixed(2)}
          </div>
        </div>
      </div>

      {/* 划转操作区 */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-sm mt-6">
        <div className="flex items-center mb-6">
          <ArrowRightLeft className="h-5 w-5 text-blue-500 mr-2" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('dashboard.pages.affiliate.transferTitle')}</h3>
        </div>
        
        <form onSubmit={handleTransfer} className="flex flex-col sm:flex-row gap-4 max-w-2xl">
          <div className="flex-1">
            <div className="relative rounded-md shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <span className="text-gray-500 sm:text-sm">$</span>
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={info?.commission_balance || 0}
                required
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                className="block w-full rounded-lg border-gray-300 dark:border-gray-600 pl-7 pr-12 py-3 focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="0.00"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <button
                  type="button"
                  onClick={() => setTransferAmount(info?.commission_balance?.toString() || '')}
                  className="text-xs font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
                >
                  {t('dashboard.pages.affiliate.transferAll')}
                </button>
              </div>
            </div>
          </div>
          
          <button
            type="submit"
            disabled={isTransferring || !transferAmount || parseFloat(transferAmount) <= 0}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg border border-transparent bg-gray-900 dark:bg-white px-6 py-3 text-sm font-medium text-white dark:text-gray-900 shadow-sm hover:bg-gray-800 dark:hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isTransferring ? t('dashboard.pages.affiliate.transferProcessing') : t('dashboard.pages.affiliate.transferConfirm')}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center">
              <ReceiptText className="mr-2 h-5 w-5 text-purple-500" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                {t('dashboard.pages.affiliate.logsTitle')}
              </h3>
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('dashboard.pages.affiliate.logsHint')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchLogs(page)}
            disabled={logsLoading}
            className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${logsLoading ? 'animate-spin' : ''}`} />
            {t('dashboard.pages.affiliate.refreshLogs')}
          </button>
        </div>

        {logsError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {logsError}
          </div>
        ) : null}

        <div className="mt-5 hidden overflow-x-auto lg:block">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr className="text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">{t('dashboard.pages.affiliate.logAmount')}</th>
                <th className="px-4 py-3 font-medium">{t('dashboard.pages.affiliate.logStatus')}</th>
                <th className="px-4 py-3 font-medium">{t('dashboard.pages.affiliate.logInvitee')}</th>
                <th className="px-4 py-3 font-medium">{t('dashboard.pages.affiliate.logOrder')}</th>
                <th className="px-4 py-3 font-medium">{t('dashboard.pages.affiliate.logReason')}</th>
                <th className="px-4 py-3 font-medium">{t('dashboard.pages.affiliate.logCreatedAt')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {logsLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                    {t('dashboard.pages.affiliate.logsLoading')}
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                    {t('dashboard.pages.affiliate.logsEmpty')}
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="align-top">
                    <td className="px-4 py-4 font-medium text-gray-900 dark:text-white">
                      {log.amount >= 0 ? '+' : ''}
                      ${log.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClass(log.status)}`}>
                        {getStatusLabel(log.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">
                      {log.invitee_id ? `#${log.invitee_id}` : '-'}
                    </td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">
                      {log.order_id ? `#${log.order_id}` : '-'}
                    </td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">{log.reason || '-'}</td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">
                      {log.created_at ? new Date(log.created_at).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 space-y-3 lg:hidden">
          {logsLoading ? (
            <div className="rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {t('dashboard.pages.affiliate.logsLoading')}
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {t('dashboard.pages.affiliate.logsEmpty')}
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-base font-semibold text-gray-900 dark:text-white">
                    {log.amount >= 0 ? '+' : ''}${log.amount.toFixed(2)}
                  </div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClass(log.status)}`}>
                    {getStatusLabel(log.status)}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-sm text-gray-500 dark:text-gray-400">
                  <div>{t('dashboard.pages.affiliate.logReason')}: {log.reason || '-'}</div>
                  <div>{t('dashboard.pages.affiliate.logInvitee')}: {log.invitee_id ? `#${log.invitee_id}` : '-'}</div>
                  <div>{t('dashboard.pages.affiliate.logOrder')}: {log.order_id ? `#${log.order_id}` : '-'}</div>
                  <div>{t('dashboard.pages.affiliate.logCreatedAt')}: {log.created_at ? new Date(log.created_at).toLocaleString() : '-'}</div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {t('dashboard.pages.affiliate.pagination', {
              page,
              totalPages,
              total,
            })}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void fetchLogs(page - 1)}
              disabled={page <= 1 || logsLoading}
              className="rounded-lg border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {t('dashboard.pages.affiliate.prevPage')}
            </button>
            <button
              type="button"
              onClick={() => void fetchLogs(page + 1)}
              disabled={page >= totalPages || logsLoading}
              className="rounded-lg border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {t('dashboard.pages.affiliate.nextPage')}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
