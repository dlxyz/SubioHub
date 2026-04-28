import type { MetadataRoute } from 'next';
import { getMetadataBase } from '@/i18n/seo';
import { appLocales, localizePath } from '@/i18n/routing';
import { listPublicNewsServer } from '@/lib/public-news-server';
import type { AppLocale } from '@/store/locale';

const publicStaticPaths = [
  '/',
  '/models',
  '/news',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
] as const;

function toAbsoluteUrl(pathname: string) {
  return new URL(pathname, getMetadataBase()).toString();
}

function buildLanguageAlternates(pathname: string) {
  return Object.fromEntries(
    appLocales.map((locale) => [locale, toAbsoluteUrl(localizePath(pathname, locale as AppLocale))])
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const path of publicStaticPaths) {
    for (const locale of appLocales) {
      entries.push({
        url: toAbsoluteUrl(localizePath(path, locale as AppLocale)),
        lastModified: now,
        alternates: {
          languages: buildLanguageAlternates(path),
        },
      });
    }
  }

  try {
    const newsItems = await listPublicNewsServer();
    for (const item of newsItems) {
      const detailPath = `/news/${item.id}`;
      const lastModified = new Date(item.updated_at || item.created_at);

      for (const locale of appLocales) {
        entries.push({
          url: toAbsoluteUrl(localizePath(detailPath, locale as AppLocale)),
          lastModified,
          alternates: {
            languages: buildLanguageAlternates(detailPath),
          },
        });
      }
    }
  } catch {
    // Keep sitemap available even if the public news API is temporarily unavailable.
  }

  return entries;
}
