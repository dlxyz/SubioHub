﻿'use client';

import Link from 'next/link';
import { FileText, Globe, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import ModelPlazaView from '@/components/model-plaza/model-plaza-view';
import { localizePath } from '@/i18n/routing';
import { useI18n } from '@/i18n/use-i18n';

export default function ModelsPage() {
  const { isAuthenticated, user } = useAuthStore();
  const { availableLocales, locale, setLocale, t } = useI18n();
  const [isDark, setIsDark] = useState(false);
  const dashboardPath = user?.role === 'admin' ? '/admin/dashboard' : '/dashboard';
  const consoleEntryPath = isAuthenticated ? dashboardPath : '/login';
  const localizedHomePath = localizePath('/', locale);
  const localizedModelsPath = localizePath('/models', locale);
  const localizedLoginPath = localizePath('/login', locale);
  const localizedNewsPath = localizePath('/news', locale);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      return;
    }
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-[#121212] dark:text-white">
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/85 backdrop-blur-md dark:border-gray-800/60 dark:bg-[#121212]/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link href={localizedHomePath} className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 shadow-sm">
                <span className="text-lg font-bold leading-none text-white">S</span>
              </div>
              <span className="text-xl font-bold tracking-tight">SubioHub</span>
            </Link>

            <nav className="hidden items-center gap-6 md:flex">
              <Link href={localizedHomePath} className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                {t('dashboard.nav.home')}
              </Link>
              <Link href={localizedModelsPath} className="text-sm font-semibold text-gray-900 dark:text-white">
                {t('dashboard.nav.modelHub')}
              </Link>
              <Link href={localizedNewsPath} className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                {t('dashboard.nav.news')}
              </Link>
              <Link href={consoleEntryPath} className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                {t('dashboard.nav.console')}
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-gray-200 px-3 py-2 text-gray-500 dark:border-gray-800 dark:text-gray-300 sm:flex">
              <Globe className="h-4 w-4" />
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as 'zh-CN' | 'en-US')}
                className="bg-transparent text-sm font-medium outline-none"
              >
                {availableLocales.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.shortLabel}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link
              href="https://github.com/dlxyz/SubioHub"
              target="_blank"
              rel="noreferrer"
              className="hidden items-center rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 md:inline-flex"
            >
              <FileText className="mr-2 h-4 w-4" />
              {t('marketing.actions.viewDocs')}
            </Link>
            <Link
              href={isAuthenticated ? dashboardPath : localizedLoginPath}
              className="inline-flex items-center rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              {isAuthenticated ? t('marketing.actions.enterConsole') : t('marketing.actions.login')}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <ModelPlazaView variant="public" />
      </main>
    </div>
  );
}

