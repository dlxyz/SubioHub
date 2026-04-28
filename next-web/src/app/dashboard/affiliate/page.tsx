'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users, Copy, ArrowRightLeft, DollarSign, Clock, CheckCircle2, TrendingUp } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';

interface AffiliateInfo {
  invite_code: string;
  commission_rate: number;
  commission_balance: number;
  total_commission_earned: number;
  pending_amount: number;
}

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
  const [isLoading, setIsLoading] = useState(true);
  const [isTransferring, setIsTransferring] = useState(false);
  const [copied, setCopied] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [error, setError] = useState('');

  const inviteCode = info?.invite_code || user?.invite_code || '';
  const inviteLink = typeof window !== 'undefined' 
    ? `${window.location.origin}/register?affiliate_code=${inviteCode}`
    : '';

  const fetchAffiliateInfo = useCallback(async () => {
    setError('');
    try {
      const res = (await api.get('/affiliate/info')) as AffiliateInfo;
      setInfo(res);
    } catch (error: unknown) {
      console.error(t('dashboard.pages.affiliate.fetchFailed'), error);
      setInfo(null);
      setError(getErrorMessage(error, t('dashboard.pages.affiliate.fetchFailed')));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchAffiliateInfo();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchAffiliateInfo]);

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
      await api.post('/affiliate/transfer', { amount });
      alert(t('dashboard.pages.affiliate.transferSuccess'));
      setTransferAmount('');
      // 刷新数据
      fetchAffiliateInfo();
      // 同步更新顶部的账户总余额（可选，或者重刷 UserInfo）
      if (user) {
        updateUser({ balance: (user.balance || 0) + amount });
      }
    } catch (error: unknown) {
      alert(getErrorMessage(error, t('dashboard.pages.affiliate.transferFailed')));
    } finally {
      setIsTransferring(false);
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

    </div>
  );
}
