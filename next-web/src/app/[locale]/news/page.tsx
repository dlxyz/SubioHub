import type { Metadata } from 'next';
import NewsPage from '../../news/page';
import { buildPublicMetadata, resolveSeoText } from '@/i18n/seo';
import { defaultLocale } from '@/i18n/messages';
import { isAppLocale } from '@/store/locale';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = isAppLocale(locale) ? locale : defaultLocale;

  return buildPublicMetadata({
    locale: safeLocale,
    pathname: '/news',
    title: resolveSeoText(safeLocale, 'seo.news.title'),
    description: resolveSeoText(safeLocale, 'seo.news.description'),
  });
}

export default NewsPage;
