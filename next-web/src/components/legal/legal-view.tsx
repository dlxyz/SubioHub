'use client';

import Link from 'next/link';
import { localizePath } from '@/i18n/routing';
import { useI18n } from '@/i18n/use-i18n';
import { getLegalDoc, type LegalKind } from './legal-content';

export default function LegalView({ kind }: { kind: LegalKind }) {
  const { locale, t } = useI18n();
  const doc = getLegalDoc(kind, locale);

  const homePath = localizePath('/', locale);
  const privacyPath = localizePath('/privacy', locale);
  const termsPath = localizePath('/terms', locale);
  const refundPath = localizePath('/refund', locale);
  const contactPath = localizePath('/contact', locale);

  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900 dark:bg-[#121212] dark:text-white">
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/85 backdrop-blur-md dark:border-gray-800/60 dark:bg-[#121212]/80">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href={homePath} className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 shadow-sm">
              <span className="text-lg font-bold leading-none text-white">S</span>
            </div>
            <span className="text-xl font-bold tracking-tight">SubioHub</span>
          </Link>
          <Link
            href={homePath}
            className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            {t('publicAuth.common.backHome')}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <h1 className="text-2xl font-bold sm:text-3xl">{doc.title}</h1>
        {doc.updated ? <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{doc.updated}</p> : null}
        <p className="mt-4 text-sm leading-7 text-gray-600 dark:text-gray-300">{doc.intro}</p>

        {doc.sections.map((section) => (
          <section key={section.heading} className="mt-8">
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            {section.body.map((paragraph, index) => (
              <p key={index} className="mt-3 text-sm leading-7 text-gray-600 dark:text-gray-300">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </main>

      <footer className="mt-auto border-t border-gray-100 py-8 dark:border-gray-800/60">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            <Link href={privacyPath} className="text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
              {t('legal.nav.privacy')}
            </Link>
            <Link href={termsPath} className="text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
              {t('legal.nav.terms')}
            </Link>
            <Link href={refundPath} className="text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
              {t('legal.nav.refund')}
            </Link>
            <Link href={contactPath} className="text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
              {t('legal.nav.contact')}
            </Link>
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            &copy; {new Date().getFullYear()} SubioHub.
          </p>
        </div>
      </footer>
    </div>
  );
}
