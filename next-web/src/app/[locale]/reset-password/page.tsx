import type { Metadata } from 'next';
import ResetPasswordPage from '../../reset-password/page';
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
    pathname: '/reset-password',
    title: resolveSeoText(safeLocale, 'seo.resetPassword.title'),
    description: resolveSeoText(safeLocale, 'seo.resetPassword.description'),
  });
}

export default ResetPasswordPage;
