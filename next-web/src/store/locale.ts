import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type AppLocale = 'zh-CN' | 'en-US';
export const LOCALE_STORAGE_KEY = 'subiohub-locale-storage';

export const AVAILABLE_LOCALES: Array<{
  code: AppLocale;
  shortLabel: string;
  name: string;
}> = [
  { code: 'zh-CN', shortLabel: 'CN ZH', name: '中文' },
  { code: 'en-US', shortLabel: 'EN US', name: 'English' },
];

interface LocaleState {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}

export function isAppLocale(value: string): value is AppLocale {
  return AVAILABLE_LOCALES.some((item) => item.code === value);
}

export function detectBrowserLocale(): AppLocale {
  if (typeof window === 'undefined') {
    return 'zh-CN';
  }

  const browserLocale = window.navigator.language || '';
  if (browserLocale.toLowerCase().startsWith('zh')) {
    return 'zh-CN';
  }
  return 'en-US';
}

export function getDefaultLocale(): AppLocale {
  if (typeof window === 'undefined') {
    return 'zh-CN';
  }

  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { locale?: string } };
      const persistedLocale = parsed?.state?.locale;
      if (persistedLocale && isAppLocale(persistedLocale)) {
        return persistedLocale;
      }
    }
  } catch {
    // Fall through to browser language detection.
  }

  return detectBrowserLocale();
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: getDefaultLocale(),
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: LOCALE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    }
  )
);

