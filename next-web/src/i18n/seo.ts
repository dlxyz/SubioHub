import type { Metadata } from 'next';
import { messages } from '@/i18n/messages';
import { appLocales, localizePath } from '@/i18n/routing';
import type { AppLocale } from '@/store/locale';

function getByPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, source);
}

export function resolveSeoText(locale: AppLocale, key: string) {
  const value = getByPath(messages[locale], key);
  return typeof value === 'string' ? value : key;
}

export function getMetadataBase() {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000';
  return new URL(origin);
}

export function buildLocaleAlternates(pathname: string) {
  return Object.fromEntries(appLocales.map((locale) => [locale, localizePath(pathname, locale)]));
}

export function buildPublicMetadata({
  locale,
  pathname,
  title,
  description,
  openGraphType = 'website',
}: {
  locale: AppLocale;
  pathname: string;
  title: string;
  description: string;
  openGraphType?: 'website' | 'article';
}): Metadata {
  const canonical = localizePath(pathname, locale);

  return {
    metadataBase: getMetadataBase(),
    title,
    description,
    alternates: {
      canonical,
      languages: buildLocaleAlternates(pathname),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      locale,
      type: openGraphType,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}
