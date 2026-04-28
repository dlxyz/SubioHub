import type { Metadata } from 'next';
import NewsPage from '../../news/page';
import { buildPublicMetadata, resolveSeoText } from '@/i18n/seo';
import { isAppLocale } from '@/store/locale';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = isAppLocale(locale) ? locale : 'zh-CN';

  return buildPublicMetadata({
    locale: safeLocale,
    pathname: '/news',
    title: resolveSeoText(safeLocale, 'seo.news.title'),
    description: resolveSeoText(safeLocale, 'seo.news.description'),
  });
}

export default NewsPage;
