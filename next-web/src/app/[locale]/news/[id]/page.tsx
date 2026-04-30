import type { Metadata } from 'next';
import NewsDetailPage from '../../../news/[id]/page';
import { buildPublicMetadata, resolveSeoText } from '@/i18n/seo';
import { buildNewsDescription, getPublicNewsDetailServer } from '@/lib/public-news-server';
import { isAppLocale } from '@/store/locale';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const safeLocale = isAppLocale(locale) ? locale : 'zh-CN';
  const listTitle = resolveSeoText(safeLocale, 'seo.news.title');
  const fallbackTitle = resolveSeoText(safeLocale, 'seo.news.detailTitle');
  const fallbackDescription = resolveSeoText(safeLocale, 'seo.news.description');

  try {
    const item = await getPublicNewsDetailServer(id, safeLocale);
    const description = buildNewsDescription(item.content) || fallbackDescription;

    return buildPublicMetadata({
      locale: safeLocale,
      pathname: `/news/${id}`,
      title: `${item.title} | ${listTitle}`,
      description,
      openGraphType: 'article',
    });
  } catch {
    return buildPublicMetadata({
      locale: safeLocale,
      pathname: `/news/${id}`,
      title: `${fallbackTitle} | ${listTitle}`,
      description: fallbackDescription,
      openGraphType: 'article',
    });
  }
}

export default NewsDetailPage;
