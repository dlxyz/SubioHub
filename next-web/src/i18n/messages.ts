import type { AppLocale } from '@/store/locale';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';

export const messages = {
  'zh-CN': zhCN,
  'en-US': enUS,
} as const;

export type MessageSchema = typeof zhCN;

export const defaultLocale: AppLocale = 'zh-CN';
