import { appLocales, localizePath } from '@/i18n/routing';
import type { AppLocale } from '@/store/locale';

export interface PublicNewsItem {
  id: number;
  title: string;
  content: string;
  starts_at?: string | null;
  ends_at?: string | null;
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

async function fetchPublicApi<T>(path: string): Promise<T> {
  const response = await fetch(`${getServerApiBaseUrl()}${path}`, {
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

export async function listPublicNewsServer() {
  return fetchPublicApi<PublicNewsItem[]>('/news');
}

export async function getPublicNewsDetailServer(id: number | string) {
  return fetchPublicApi<PublicNewsItem>(`/news/${id}`);
}

export function stripNewsContent(content: string) {
  return content
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
