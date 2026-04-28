import type { Metadata } from 'next';
import HomePage from '../page';
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
    pathname: '/',
    title: resolveSeoText(safeLocale, 'seo.home.title'),
    description: resolveSeoText(safeLocale, 'seo.home.description'),
  });
}

export default HomePage;
