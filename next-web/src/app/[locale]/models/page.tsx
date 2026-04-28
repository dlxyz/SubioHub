import type { Metadata } from 'next';
import ModelsPage from '../../models/page';
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
    pathname: '/models',
    title: resolveSeoText(safeLocale, 'seo.models.title'),
    description: resolveSeoText(safeLocale, 'seo.models.description'),
  });
}

export default ModelsPage;
