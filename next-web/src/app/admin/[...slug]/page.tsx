'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useI18n } from '@/i18n/use-i18n';

function prettyName(value: string, locale: string) {
  if (locale === 'zh-CN') {
    return value
      .split('-')
      .map((part) => part.toUpperCase())
      .join(' / ');
  }
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function AdminPlaceholderPage() {
  const { locale, t } = useI18n();
  const params = useParams<{ slug?: string[] }>();
  const slug = params?.slug || [];
  const fullPath = `/admin/${slug.join('/')}`;
  const pageName = slug.map((item) => prettyName(item, locale)).join(' / ');

  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-[#1A1A1A]">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{pageName}</h2>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('admin.placeholder.description')}</p>

      <div className="mt-6 rounded-xl bg-gray-50 p-4 text-sm text-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
        <div>{t('admin.placeholder.currentRoute', { path: fullPath })}</div>
        <div className="mt-2">{t('admin.placeholder.routeHint')}</div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/dashboard"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t('admin.placeholder.backDashboard')}
        </Link>
        <Link
          href="/admin/users"
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {t('admin.placeholder.goUsers')}
        </Link>
        <Link
          href="/admin/orders"
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {t('admin.placeholder.goOrders')}
        </Link>
        <Link
          href="/admin/affiliate"
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {t('admin.placeholder.goAffiliate')}
        </Link>
      </div>
    </div>
  );
}
