'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AVAILABLE_LOCALES,
  LOCALE_STORAGE_KEY,
  normalizeAppLocale,
  type AppLocale,
  useLocaleStore,
} from '@/store/locale';
import { getPublicSettings } from '@/lib/public-settings';

type LocaleContextValue = {
  availableLocales: typeof AVAILABLE_LOCALES;
  locale: AppLocale;
  setLocale: (locale: string) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function persistLocale(locale: AppLocale) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    LOCALE_STORAGE_KEY,
    JSON.stringify({
      state: { locale },
      version: 0,
    })
  );
}

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: AppLocale;
}) {
  const setLocaleStore = useLocaleStore((state) => state.setLocale);
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);
  const [enabledLocales, setEnabledLocales] = useState<typeof AVAILABLE_LOCALES>(AVAILABLE_LOCALES);

  useEffect(() => {
    document.documentElement.lang = locale;
    setLocaleStore(locale);
    persistLocale(locale);
  }, [locale, setLocaleStore]);

  // 按后台「前台显示语言」配置过滤语言切换器；未配置时展示全部语言。
  useEffect(() => {
    let cancelled = false;
    void getPublicSettings()
      .then((settings) => {
        if (cancelled) {
          return;
        }
        const configured = settings.site_enabled_locales;
        const codes =
          Array.isArray(configured) && configured.length > 0
            ? configured
            : AVAILABLE_LOCALES.map((item) => item.code);
        const filtered = AVAILABLE_LOCALES.filter((item) => codes.includes(item.code));
        if (filtered.length === 0) {
          return;
        }
        setEnabledLocales(filtered);
        setLocaleState((current) =>
          filtered.some((item) => item.code === current) ? current : filtered[0].code
        );
      })
      .catch(() => {
        // 公开设置不可用时保留全部语言，避免影响页面渲染。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((nextLocale: string) => {
    const normalized = normalizeAppLocale(nextLocale);
    if (!normalized) {
      return;
    }
    setLocaleState(normalized);
  }, []);

  const value = useMemo(
    () => ({
      availableLocales: enabledLocales,
      locale,
      setLocale,
    }),
    [enabledLocales, locale, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocaleContext() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocaleContext must be used within LocaleProvider');
  }
  return context;
}
