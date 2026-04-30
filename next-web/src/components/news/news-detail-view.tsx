﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, Globe, Moon, Newspaper, Sun } from 'lucide-react';
import { getPublicNewsDetail, type PublicNewsItem } from '@/lib/news-api';
import { localizePath } from '@/i18n/routing';
import { useI18n } from '@/i18n/use-i18n';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatDate(value: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function NewsDetailView({ id }: { id: string }) {
  const { availableLocales, locale, setLocale, t } = useI18n();
  const [item, setItem] = useState<PublicNewsItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isDark, setIsDark] = useState(false);
  const localizedHomePath = localizePath('/', locale);
  const localizedNewsPath = localizePath('/news', locale);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    }, 0);

    void getPublicNewsDetail(id, { locale })
      .then((data) => {
        setItem(data);
        setError('');
      })
      .catch((err: unknown) => {
        setItem(null);
        setError(getErrorMessage(err, t('news.detail.loadFailed')));
      })
      .finally(() => {
        setLoading(false);
      });

    return () => window.clearTimeout(timer);
  }, [id, locale, t]);

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
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href={localizedHomePath} className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 shadow-sm">
              <span className="text-lg font-bold leading-none text-white">S</span>
            </div>
            <span className="text-xl font-bold tracking-tight">SubioHub</span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-gray-200 px-3 py-2 text-gray-500 dark:border-gray-800 dark:text-gray-300 sm:flex">
              <Globe className="h-4 w-4" />
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as 'zh-CN' | 'en-US')}
                className="bg-transparent text-sm font-medium outline-none"
              >
                {availableLocales.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.shortLabel}
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
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <Link
          href={localizedNewsPath}
          className="inline-flex items-center text-sm font-medium text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-400"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('news.detail.backToList')}
        </Link>

        {loading ? (
          <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-8 text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A] dark:text-gray-400">
            {t('news.detail.loading')}
          </div>
        ) : null}

        {!loading && error ? (
          <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {!loading && !error && item ? (
          <article className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A] sm:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-300">
              <Newspaper className="h-3.5 w-3.5" />
              {t('news.hero.badge')}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">{item.title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <CalendarDays className="h-4 w-4" />
              <span>
                {t('news.detail.updatedAt', {
                  date: formatDate(item.published_at || item.updated_at, locale),
                })}
              </span>
              {item.author_name ? <span>{item.author_name}</span> : null}
            </div>
            {item.summary ? (
              <p className="mt-4 text-base leading-7 text-gray-600 dark:text-gray-400">{item.summary}</p>
            ) : null}
            <div
              className="mt-8 text-sm leading-7 text-gray-700 dark:text-gray-300 [&_a]:text-blue-600 [&_a]:underline [&_img]:rounded-2xl [&_img]:max-w-full"
              dangerouslySetInnerHTML={{ __html: item.content }}
            />
          </article>
        ) : null}
      </main>
    </div>
  );
}
