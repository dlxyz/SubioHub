import { appLocales, localizePath } from '@/i18n/routing';
import type { AppLocale } from '@/store/locale';

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

function unwrapSuccessEnvelope(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  const hasEnvelope = ('code' in record || 'message' in record) && 'data' in record;
  return hasEnvelope ? record.data : payload;
}

function getServerApiBaseUrl() {
  const explicitApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (explicitApiUrl) {
    return explicitApiUrl.replace(/\/$/, '');
  }

  const serverOrigin =
    process.env.NEXT_SERVER_API_ORIGIN?.trim() ||
    (process.env.NODE_ENV === 'development' ? 'http://localhost:8080' : undefined);
  if (serverOrigin) {
    return `${serverOrigin.replace(/\/$/, '')}/api/v1`;
  }

  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000';
  return `${siteOrigin.replace(/\/$/, '')}/api/v1`;
}

async function fetchPublicApi<T>(path: string, locale?: string): Promise<T> {
  const url = new URL(`${getServerApiBaseUrl()}${path}`);
  if (locale) {
    url.searchParams.set('locale', locale);
  }

  const response = await fetch(url.toString(), {
    next: {
      revalidate: 300,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  return unwrapSuccessEnvelope(payload) as T;
}

export async function listPublicNewsServer(locale?: string) {
  return fetchPublicApi<PublicNewsItem[]>('/news', locale);
}

export async function getPublicNewsDetailServer(id: number | string, locale?: string) {
  return fetchPublicApi<PublicNewsItem>(`/news/${id}`, locale);
}

export function stripNewsContent(content: string) {
  return content
    .replace(/<[^>]+>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[#>*_\-\[\]\(\)!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildNewsDescription(content: string, maxLength = 160) {
  const plain = stripNewsContent(content);
  if (plain.length <= maxLength) {
    return plain;
  }
  return `${plain.slice(0, maxLength).trim()}...`;
}

export function buildNewsAlternates(id: number | string) {
  return Object.fromEntries(
    appLocales.map((locale) => [locale, localizePath(`/news/${id}`, locale as AppLocale)])
  );
}
