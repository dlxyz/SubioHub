﻿'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, FileText, Globe, Moon, Newspaper, Sun } from 'lucide-react';
import { listPublicNews, type PublicNewsItem } from '@/lib/news-api';
import { localizePath } from '@/i18n/routing';
import { useI18n } from '@/i18n/use-i18n';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function stripContent(content: string) {
  return content.replace(/[#>*_`~-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildExcerpt(content: string, length = 160) {
  const plain = stripContent(content);
  if (plain.length <= length) {
    return plain;
  }
  return `${plain.slice(0, length).trim()}...`;
}

function formatDate(value: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function NewsListView() {
  const { availableLocales, locale, setLocale, t } = useI18n();
  const [items, setItems] = useState<PublicNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isDark, setIsDark] = useState(false);
  const localizedHomePath = localizePath('/', locale);
  const localizedModelsPath = localizePath('/models', locale);
  const localizedNewsPath = localizePath('/news', locale);
  const localizedLoginPath = localizePath('/login', locale);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    }, 0);

    void listPublicNews()
      .then((data) => {
        setItems(data);
        setError('');
      })
      .catch((err: unknown) => {
        setItems([]);
        setError(getErrorMessage(err, t('news.list.loadFailed')));
      })
      .finally(() => {
        setLoading(false);
      });

    return () => window.clearTimeout(timer);
  }, [t]);

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

  const displayItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        excerpt: buildExcerpt(item.content),
        detailPath: localizePath(`/news/${item.id}`, locale),
        createdAtLabel: formatDate(item.created_at, locale),
      })),
    [items, locale]
  );

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
              <Link href={localizedModelsPath} className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                {t('dashboard.nav.modelHub')}
              </Link>
              <Link href={localizedNewsPath} className="text-sm font-semibold text-gray-900 dark:text-white">
                {t('dashboard.nav.news')}
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
              href={localizedLoginPath}
              className="inline-flex items-center rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              {t('marketing.actions.login')}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <section className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6 shadow-sm dark:border-gray-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_rgba(17,24,39,0.92)_42%,_rgba(17,24,39,1)_100%)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/70 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-gray-900/60 dark:text-blue-300">
            <Newspaper className="h-3.5 w-3.5" />
            {t('news.hero.badge')}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
            {t('news.hero.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
            {t('news.hero.description')}
          </p>
        </section>

        <section className="mt-6 space-y-4">
          {loading ? (
            <div className="rounded-3xl border border-gray-200 bg-white p-8 text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A] dark:text-gray-400">
              {t('news.list.loading')}
            </div>
          ) : null}

          {!loading && error ? (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-200">
              {error}
            </div>
          ) : null}

          {!loading && !error && displayItems.length === 0 ? (
            <div className="rounded-3xl border border-gray-200 bg-white p-8 text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A] dark:text-gray-400">
              {t('news.list.empty')}
            </div>
          ) : null}

          {!loading &&
            !error &&
            displayItems.map((item) => (
              <article
                key={item.id}
                className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-[#1A1A1A]"
              >
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <CalendarDays className="h-4 w-4" />
                  <span>{t('news.list.publishedAt', { date: item.createdAtLabel })}</span>
                </div>
                <h2 className="mt-3 text-xl font-semibold text-gray-900 dark:text-white">
                  <Link href={item.detailPath} className="transition-colors hover:text-blue-600 dark:hover:text-blue-400">
                    {item.title}
                  </Link>
                </h2>
                <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-400">{item.excerpt}</p>
                <div className="mt-5">
                  <Link
                    href={item.detailPath}
                    className="inline-flex items-center text-sm font-medium text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-400"
                  >
                    {t('news.list.readMore')}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
        </section>

        <section className="mt-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
            <FileText className="h-4 w-4" />
            {t('news.footer.title')}
          </div>
          <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{t('news.footer.description')}</p>
        </section>
      </main>
    </div>
  );
}

