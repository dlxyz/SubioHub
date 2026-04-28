import { notFound } from 'next/navigation';
import { LocaleProvider } from '@/i18n/provider';
import { appLocales } from '@/i18n/routing';
import { isAppLocale } from '@/store/locale';

export const dynamicParams = false;

export function generateStaticParams() {
  return appLocales.map((locale) => ({ locale }));
}

export default async function LocalizedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isAppLocale(locale)) {
    notFound();
  }

  return <LocaleProvider key={locale} initialLocale={locale}>{children}</LocaleProvider>;
}
