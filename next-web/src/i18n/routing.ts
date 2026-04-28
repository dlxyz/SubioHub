import { defaultLocale } from '@/i18n/messages';
import { AVAILABLE_LOCALES, type AppLocale, isAppLocale } from '@/store/locale';

export const appLocales = AVAILABLE_LOCALES.map((item) => item.code);

export const publicRoutePrefixes = [
  '/',
  '/models',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/news',
] as const;

export function isLocaleSegment(value: string): value is AppLocale {
  return isAppLocale(value);
}

export function stripLocalePrefix(pathname: string) {
  const segments = pathname.split('/');
  const locale = segments[1];

  if (!isLocaleSegment(locale)) {
    return pathname || '/';
  }

  const stripped = `/${segments.slice(2).join('/')}`.replace(/\/+/g, '/');
  return stripped === '/' ? '/' : stripped.replace(/\/$/, '') || '/';
}

export function localizePath(pathname: string, locale: AppLocale) {
  const normalized = stripLocalePrefix(pathname);
  if (normalized === '/') {
    return `/${locale}`;
  }
  return `/${locale}${normalized}`;
}

export function isLocalizedPublicPath(pathname: string) {
  const stripped = stripLocalePrefix(pathname);
  return publicRoutePrefixes.some((prefix) => {
    if (prefix === '/') {
      return stripped === '/';
    }
    return stripped === prefix || stripped.startsWith(`${prefix}/`);
  });
}

export function maybeLocalizePublicPath(pathname: string, locale: AppLocale = defaultLocale) {
  if (!isLocalizedPublicPath(pathname)) {
    return pathname;
  }
  return localizePath(pathname, locale);
}
