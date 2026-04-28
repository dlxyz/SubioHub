'use client';

import { useAuthStore } from '@/store/auth';
import { useI18n } from '@/i18n/use-i18n';
import { CreditCard, Activity, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

export default function DashboardHomePage() {
  const { user } = useAuthStore();
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          {t('dashboard.pages.home.title')}
        </h1>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Card 1: 账户余额 */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.pages.home.subtitle')}</h3>
            <CreditCard className="h-5 w-5 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="mt-4 flex items-baseline text-3xl font-semibold text-gray-900 dark:text-white">
            ${user?.balance?.toFixed(2) || '0.00'}
          </div>
          <div className="mt-4 flex items-center text-sm">
            <Link 
              href="/dashboard/finance"
              className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors"
            >
              {t('dashboard.pages.home.gotoRecharge')} <ArrowUpRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Card 2: API 状态 */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.pages.home.apiStatus')}</h3>
            <Activity className="h-5 w-5 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="mt-4 flex items-center">
            <span className="flex h-3 w-3 rounded-full bg-green-500 mr-2"></span>
            <span className="text-xl font-semibold text-gray-900 dark:text-white">{t('dashboard.pages.home.healthy')}</span>
          </div>
          <div className="mt-5 flex items-center text-sm">
            <Link 
              href="/dashboard/usage"
              className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors"
            >
              {t('dashboard.pages.home.gotoUsage')} <ArrowUpRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
      
      {/* 预留图表区域 */}
      <div className="mt-8 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-sm h-96 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.home.chartPlaceholder')}</p>
      </div>
    </div>
  );
}
