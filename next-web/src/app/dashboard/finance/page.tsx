'use client';

import { useState } from 'react';
import { Wallet, Gift, CreditCard, ArrowRight } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useAuthStore } from '@/store/auth';

export default function FinancePage() {
  const { user } = useAuthStore();
  const { t } = useI18n();
  const [redeemCode, setRedeemCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRedeem = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // TODO: 调用后端兑换接口
    setTimeout(() => {
      setIsLoading(false);
      alert(t('dashboard.pages.finance.redeemNotReady'));
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center">
            <Wallet className="mr-2 h-6 w-6 text-indigo-500" /> {t('dashboard.pages.finance.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('dashboard.pages.finance.subtitle')}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 余额卡片 */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-sm flex flex-col justify-center">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('dashboard.pages.finance.balanceTitle')}</h3>
            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
              {t('dashboard.common.enough')}
            </span>
          </div>
          <div className="flex items-baseline text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            ${user?.balance?.toFixed(2) || '0.00'}
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {t('dashboard.pages.finance.balanceHint')}
          </p>
        </div>

        {/* 卡密兑换 */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-sm">
          <div className="flex items-center mb-4">
            <Gift className="h-5 w-5 text-purple-500 mr-2" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('dashboard.pages.finance.redeemTitle')}</h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            {t('dashboard.pages.finance.redeemHint')}
          </p>
          <form onSubmit={handleRedeem} className="space-y-4">
            <div>
              <label htmlFor="code" className="sr-only">{t('dashboard.pages.finance.redeemTitle')}</label>
              <input
                type="text"
                id="code"
                required
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:ring-blue-500 sm:text-sm font-mono uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal transition-colors"
                placeholder={t('dashboard.pages.finance.redeemPlaceholder')}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !redeemCode}
              className="w-full flex justify-center items-center rounded-lg bg-gray-900 dark:bg-white px-4 py-3 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isLoading ? t('dashboard.pages.finance.redeeming') : t('dashboard.pages.finance.redeemNow')} <ArrowRight className="ml-2 h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {/* 在线充值预留区域 */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-sm mt-6">
        <div className="flex items-center mb-6">
          <CreditCard className="h-5 w-5 text-blue-500 mr-2" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('dashboard.pages.finance.onlineTopup')}</h3>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[10, 20, 50, 100].map((amount) => (
            <button
              key={amount}
              className="relative rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-transparent px-6 py-8 text-center hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 focus:outline-none transition-all group"
            >
              <span className="block text-2xl font-bold text-gray-900 dark:text-white">${amount}</span>
              <span className="mt-1 block text-sm font-medium text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                {t('dashboard.pages.finance.topupNow')}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
