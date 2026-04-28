import type { Metadata } from 'next';
import ForgotPasswordPage from '../../forgot-password/page';
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
    pathname: '/forgot-password',
    title: resolveSeoText(safeLocale, 'seo.forgotPassword.title'),
    description: resolveSeoText(safeLocale, 'seo.forgotPassword.description'),
  });
}

export default ForgotPasswordPage;
