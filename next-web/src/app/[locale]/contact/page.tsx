import type { Metadata } from 'next';
import ContactPage from '../../contact/page';
import { buildPublicMetadata } from '@/i18n/seo';
import { defaultLocale } from '@/i18n/messages';
import { isAppLocale } from '@/store/locale';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = isAppLocale(locale) ? locale : defaultLocale;

  return buildPublicMetadata({
    locale: safeLocale,
    pathname: '/contact',
    title: 'Contact Us',
    description: 'Contact SubioHub',
  });
}

export default ContactPage;
