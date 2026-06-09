import type { Metadata } from 'next';
import LoginPage from '../../login/page';
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
    pathname: '/login',
    title: resolveSeoText(safeLocale, 'seo.login.title'),
    description: resolveSeoText(safeLocale, 'seo.login.description'),
  });
}

export default LoginPage;
