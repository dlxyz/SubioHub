import type { Metadata } from 'next';
import PricingPage from '../../pricing/page';
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
    pathname: '/pricing',
    title: resolveSeoText(safeLocale, 'pricing.meta.title'),
    description: resolveSeoText(safeLocale, 'pricing.meta.description'),
  });
}

export default PricingPage;
