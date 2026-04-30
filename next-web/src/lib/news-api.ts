import { api } from '@/lib/api';

export interface PublicNewsItem {
  id: number;
  slug: string;
  locale: string;
  fallback_locale?: string | null;
  title: string;
  summary: string;
  content: string;
  seo_title?: string | null;
  seo_description?: string | null;
  cover_image_url?: string | null;
  author_name?: string | null;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
}

type NewsQueryOptions = {
  locale?: string;
};

export async function listPublicNews(options?: NewsQueryOptions) {
  return (await api.get('/news', {
    params: options?.locale ? { locale: options.locale } : undefined,
  })) as PublicNewsItem[];
}

export async function getPublicNewsDetail(id: number | string, options?: NewsQueryOptions) {
  return (await api.get(`/news/${id}`, {
    params: options?.locale ? { locale: options.locale } : undefined,
  })) as PublicNewsItem;
}
