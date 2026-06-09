import type { AppLocale } from '@/store/locale';
import ar from '@/i18n/locales/ar';
import en from '@/i18n/locales/en';
import es from '@/i18n/locales/es';
import id from '@/i18n/locales/id';
import ja from '@/i18n/locales/ja';
import ko from '@/i18n/locales/ko';
import pt from '@/i18n/locales/pt';
import ru from '@/i18n/locales/ru';
import th from '@/i18n/locales/th';
import vi from '@/i18n/locales/vi';
import zh from '@/i18n/locales/zh';
import type { MessageTree } from '@/i18n/schema';

export type MessageSchema = MessageTree;

export const messages: Record<AppLocale, MessageSchema> = {
  zh,
  en,
  es,
  vi,
  ar,
  id,
  pt,
  ja,
  ko,
  th,
  ru,
};

export const defaultLocale: AppLocale = 'zh';
