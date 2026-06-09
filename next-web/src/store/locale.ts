import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type AppLocale = 'zh' | 'en' | 'es' | 'vi' | 'ar' | 'id' | 'pt' | 'ja' | 'ko' | 'th' | 'ru';
export const LOCALE_STORAGE_KEY = 'subiohub-locale-storage';
const RTL_LOCALES: ReadonlySet<AppLocale> = new Set(['ar']);

const LEGACY_LOCALE_MAP: Record<string, AppLocale> = {
  'zh-cn': 'zh',
  'en-us': 'en',
};

export const AVAILABLE_LOCALES: Array<{
  code: AppLocale;
  shortLabel: string;
  name: string;
}> = [
  { code: 'zh', shortLabel: 'ZH', name: '中文' },
  { code: 'en', shortLabel: 'EN', name: 'English' },
  { code: 'es', shortLabel: 'ES', name: 'Español' },
  { code: 'vi', shortLabel: 'VI', name: 'Tiếng Việt' },
  { code: 'ar', shortLabel: 'AR', name: 'العربية' },
  { code: 'id', shortLabel: 'ID', name: 'Bahasa Indonesia' },
  { code: 'pt', shortLabel: 'PT', name: 'Português' },
  { code: 'ja', shortLabel: 'JA', name: '日本語' },
  { code: 'ko', shortLabel: 'KO', name: '한국어' },
  { code: 'th', shortLabel: 'TH', name: 'ไทย' },
  { code: 'ru', shortLabel: 'RU', name: 'Русский' },
];

interface LocaleState {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}

export function normalizeAppLocale(value: string): AppLocale | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const legacyMapped = LEGACY_LOCALE_MAP[normalized];
  if (legacyMapped) {
    return legacyMapped;
  }

  const directMatch = AVAILABLE_LOCALES.find((item) => item.code === normalized);
  if (directMatch) {
    return directMatch.code;
  }

  if (normalized.startsWith('zh')) return 'zh';
  if (normalized.startsWith('en')) return 'en';
  if (normalized.startsWith('es')) return 'es';
  if (normalized.startsWith('vi')) return 'vi';
  if (normalized.startsWith('ar')) return 'ar';
  if (normalized.startsWith('id')) return 'id';
  if (normalized.startsWith('pt')) return 'pt';
  if (normalized.startsWith('ja')) return 'ja';
  if (normalized.startsWith('ko')) return 'ko';
  if (normalized.startsWith('th')) return 'th';
  if (normalized.startsWith('ru')) return 'ru';

  return null;
}

export function isAppLocale(value: string): value is AppLocale {
  return normalizeAppLocale(value) !== null;
}

export function isRtlLocale(locale: AppLocale) {
  return RTL_LOCALES.has(locale);
}

export function detectBrowserLocale(): AppLocale {
  if (typeof window === 'undefined') {
    return 'zh';
  }

  const browserLocale = window.navigator.language || '';
  return normalizeAppLocale(browserLocale) || 'en';
}

export function getDefaultLocale(): AppLocale {
  if (typeof window === 'undefined') {
    return 'zh';
  }

  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { locale?: string } };
      const persistedLocale = parsed?.state?.locale;
      const normalized = persistedLocale ? normalizeAppLocale(persistedLocale) : null;
      if (normalized) {
        return normalized;
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

