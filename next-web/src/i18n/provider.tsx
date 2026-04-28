'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AVAILABLE_LOCALES,
  LOCALE_STORAGE_KEY,
  type AppLocale,
  useLocaleStore,
} from '@/store/locale';

type LocaleContextValue = {
  availableLocales: typeof AVAILABLE_LOCALES;
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
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

  useEffect(() => {
    document.documentElement.lang = locale;
    setLocaleStore(locale);
    persistLocale(locale);
  }, [locale, setLocaleStore]);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
  }, []);

  const value = useMemo(
    () => ({
      availableLocales: AVAILABLE_LOCALES,
      locale,
      setLocale,
    }),
    [locale, setLocale]
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
