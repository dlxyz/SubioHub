'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { defaultLocale, messages } from '@/i18n/messages';
import { useLocaleContext } from '@/i18n/provider';
import { isLocalizedPublicPath, localizePath } from '@/i18n/routing';
import type { AppLocale } from '@/store/locale';

function getByPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, source);
}

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
}

export function useI18n() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { availableLocales, locale, setLocale: setLocaleState } = useLocaleContext();

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    const localized = getByPath(messages[locale], key);
    const fallback = getByPath(messages[defaultLocale], key);
    const value = typeof localized === 'string' ? localized : typeof fallback === 'string' ? fallback : key;
    return interpolate(value, params);
  }, [locale]);

  const tm = useCallback(<T = unknown,>(key: string): T => {
    const localized = getByPath(messages[locale], key);
    const fallback = getByPath(messages[defaultLocale], key);
    return (localized ?? fallback) as T;
  }, [locale]);

  const setLocale = useCallback(
    (value: AppLocale) => {
      setLocaleState(value);

      if (!pathname || !isLocalizedPublicPath(pathname)) {
        return;
      }

      const nextPath = localizePath(pathname, value);
      const nextQuery = searchParams.toString();
      const nextHref = nextQuery ? `${nextPath}?${nextQuery}` : nextPath;
      router.replace(nextHref, { scroll: false });
    },
    [pathname, router, searchParams, setLocaleState]
  );

  return useMemo(
    () => ({
      availableLocales,
      locale,
      setLocale,
      t,
      tm,
    }),
    [availableLocales, locale, setLocale, t, tm]
  );
}
