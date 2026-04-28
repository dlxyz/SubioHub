'use client';

import { useState } from 'react';
import { Settings, User, Mail, ShieldAlert, KeyRound, Smartphone } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useAuthStore } from '@/store/auth';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="space-y-6 max-w-4xl">
      {/* 头部 */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center">
          <Settings className="mr-2 h-6 w-6 text-gray-500 dark:text-gray-400" /> {t('dashboard.pages.settings.title')}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t('dashboard.pages.settings.subtitle')}
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-800">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('profile')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'profile'
                ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-700'
            }`}
          >
            <span className="flex items-center"><User className="mr-2 h-4 w-4" /> {t('dashboard.pages.settings.tabProfile')}</span>
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'security'
                ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-700'
            }`}
          >
            <span className="flex items-center"><ShieldAlert className="mr-2 h-4 w-4" /> {t('dashboard.pages.settings.tabSecurity')}</span>
          </button>
        </nav>
      </div>

      {/* Content Areas */}
      <div className="mt-8">
        {activeTab === 'profile' && (
          <div className="space-y-8">
            <div className="bg-white dark:bg-[#1A1A1A] shadow-sm rounded-xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
              <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white mb-6">{t('dashboard.pages.settings.basicInfo')}</h3>
              <div className="grid grid-cols-1 gap-y-6 sm:grid-cols-6 sm:gap-x-6">
                
                <div className="sm:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('dashboard.pages.settings.userId')}</label>
                  <div className="mt-1 flex rounded-md shadow-sm">
                    <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-gray-500 sm:text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      ID
                    </span>
                    <input
                      type="text"
                      disabled
                      value={user?.id || t('dashboard.common.notLoggedIn')}
                      className="block w-full min-w-0 flex-1 rounded-none rounded-r-md border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 disabled:bg-gray-100 dark:disabled:bg-gray-800"
                    />
                  </div>
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('dashboard.pages.settings.email')}</label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="email"
                      disabled
                      value={user?.email || 'admin@example.com'}
                      className="block w-full rounded-md border-gray-300 pl-10 px-3 py-2 focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 disabled:bg-gray-100 dark:disabled:bg-gray-800"
                    />
                  </div>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.settings.emailReadonly')}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-8">
            {/* 修改密码 */}
            <div className="bg-white dark:bg-[#1A1A1A] shadow-sm rounded-xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <KeyRound className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-4 flex-1">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('dashboard.pages.settings.passwordTitle')}</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {t('dashboard.pages.settings.passwordHint')}
                  </p>
                  <div className="mt-4">
                    <button className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700 transition-colors">
                      {t('dashboard.pages.settings.resetPassword')}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 双因素认证 */}
            <div className="bg-white dark:bg-[#1A1A1A] shadow-sm rounded-xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <Smartphone className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-4 flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('dashboard.pages.settings.twoFactor')}</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {t('dashboard.pages.settings.twoFactorHint')}
                    </p>
                  </div>
                  <div className="mt-4 sm:mt-0 sm:ml-6 shrink-0">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 mb-3 sm:mb-0 sm:mr-3">
                      {t('dashboard.pages.settings.notEnabled')}
                    </span>
                    <button className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                      {t('dashboard.pages.settings.enableNow')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
