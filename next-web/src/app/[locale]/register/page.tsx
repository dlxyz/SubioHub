import type { Metadata } from 'next';
import RegisterPage from '../../register/page';
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
    pathname: '/register',
    title: resolveSeoText(safeLocale, 'seo.register.title'),
    description: resolveSeoText(safeLocale, 'seo.register.description'),
  });
}

export default RegisterPage;
