'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Coins, FileText, Globe, Moon, ShieldCheck, Sun, Wallet } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { localizePath } from '@/i18n/routing';
import { useI18n } from '@/i18n/use-i18n';
import {
  PRICING_BILLING_KEYS,
  PRICING_FAQ_KEYS,
  PRICING_HIGHLIGHT_KEYS,
  RECHARGE_MAX_USD,
  RECHARGE_MIN_USD,
  RECHARGE_TIERS,
} from '@/lib/pricing-content';

const highlightIcons = [ShieldCheck, Wallet, Coins];

export default function PricingView() {
  const { isAuthenticated, user } = useAuthStore();
  const { availableLocales, locale, setLocale, t } = useI18n();
  const [isDark, setIsDark] = useState(false);

  const rangeParams = { min: RECHARGE_MIN_USD, max: RECHARGE_MAX_USD };
  const dashboardPath = user?.role === 'admin' ? '/admin/dashboard' : '/dashboard';
  const consoleEntryPath = isAuthenticated ? dashboardPath : localizePath('/login', locale);
  const localizedHomePath = localizePath('/', locale);
  const localizedModelsPath = localizePath('/models', locale);
  const localizedPricingPath = localizePath('/pricing', locale);
  const localizedNewsPath = localizePath('/news', locale);
  const localizedRegisterPath = localizePath('/register', locale);
  const localizedLoginPath = localizePath('/login', locale);
  const localizedPrivacyPath = localizePath('/privacy', locale);
  const localizedTermsPath = localizePath('/terms', locale);
  const localizedRefundPath = localizePath('/refund', locale);
  const localizedContactPath = localizePath('/contact', locale);
  const startPath = isAuthenticated ? dashboardPath : localizedRegisterPath;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      return;
    }
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-[#121212] dark:text-white">
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/85 backdrop-blur-md dark:border-gray-800/60 dark:bg-[#121212]/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link href={localizedHomePath} className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 shadow-sm">
                <span className="text-lg font-bold leading-none text-white">S</span>
              </div>
              <span className="text-xl font-bold tracking-tight">SubioHub</span>
            </Link>

            <nav className="hidden items-center gap-6 md:flex">
              <Link href={localizedHomePath} className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                {t('dashboard.nav.home')}
              </Link>
              <Link href={localizedModelsPath} className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                {t('dashboard.nav.modelHub')}
              </Link>
              <Link href={localizedPricingPath} className="text-sm font-semibold text-gray-900 dark:text-white">
                {t('dashboard.nav.pricing')}
              </Link>
              <Link href={localizedNewsPath} className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                {t('dashboard.nav.news')}
              </Link>
              <Link href={consoleEntryPath} className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                {t('dashboard.nav.console')}
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-gray-200 px-3 py-2 text-gray-500 dark:border-gray-800 dark:text-gray-300 sm:flex">
              <Globe className="h-4 w-4" />
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className="bg-transparent text-sm font-medium outline-none"
              >
                {availableLocales.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.shortLabel}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link
              href="https://github.com/dlxyz/SubioHub"
              target="_blank"
              rel="noreferrer"
              className="hidden items-center rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 md:inline-flex"
            >
              <FileText className="mr-2 h-4 w-4" />
              {t('marketing.actions.viewDocs')}
            </Link>
            <Link
              href={isAuthenticated ? dashboardPath : localizedLoginPath}
              className="inline-flex items-center rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              {isAuthenticated ? t('marketing.actions.enterConsole') : t('marketing.actions.login')}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        {/* Hero */}
        <section className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
            {t('pricing.hero.badge')}
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{t('pricing.hero.title')}</h1>
          <p className="mt-5 text-base text-gray-600 dark:text-gray-400 sm:text-lg">{t('pricing.hero.subtitle')}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={startPath}
              className="inline-flex w-full items-center justify-center rounded-full bg-blue-600 px-7 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 sm:w-auto"
            >
              {t('pricing.hero.primaryCta')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              href={localizedModelsPath}
              className="inline-flex w-full items-center justify-center rounded-full border border-gray-200 bg-white px-7 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 sm:w-auto"
            >
              {t('pricing.hero.secondaryCta')}
            </Link>
          </div>
        </section>

        {/* Highlights */}
        <section className="mt-14 grid gap-4 sm:grid-cols-3">
          {PRICING_HIGHLIGHT_KEYS.map((key, index) => {
            const Icon = highlightIcons[index] ?? Coins;
            return (
              <div
                key={key}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900/40"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-base font-semibold">{t(`pricing.highlights.${key}.title`)}</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                  {t(`pricing.highlights.${key}.description`)}
                </p>
              </div>
            );
          })}
        </section>

        {/* Recharge tiers */}
        <section className="mt-14 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900/40 sm:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">{t('pricing.recharge.title')}</h2>
              <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">{t('pricing.recharge.subtitle')}</p>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('pricing.currencyNote')}</span>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="py-3 pr-4 font-medium">{t('pricing.recharge.columns.amount')}</th>
                  <th className="py-3 pr-4 font-medium">{t('pricing.recharge.columns.credited')}</th>
                  <th className="py-3 pr-4 font-medium">{t('pricing.recharge.columns.fee')}</th>
                  <th className="py-3 font-medium">{t('pricing.recharge.columns.pay')}</th>
                </tr>
              </thead>
              <tbody>
                {RECHARGE_TIERS.map((tier) => (
                  <tr key={tier.amount} className="border-b border-gray-100 last:border-0 dark:border-gray-800/60">
                    <td className="py-3 pr-4 font-medium">${tier.amount.toFixed(2)}</td>
                    <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">${tier.credited.toFixed(2)}</td>
                    <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">${tier.fee.toFixed(2)}</td>
                    <td className="py-3 font-semibold text-gray-900 dark:text-white">${tier.pay.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-6 space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-600 dark:text-emerald-400" />
              <span>{t('pricing.recharge.minMax', rangeParams)}</span>
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-600 dark:text-emerald-400" />
              <span>{t('pricing.recharge.customAmount')}</span>
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-600 dark:text-emerald-400" />
              <span>{t('pricing.recharge.sameBenefits')}</span>
            </li>
          </ul>
        </section>

        {/* Billing details */}
        <section className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900/40 sm:p-8">
            <h2 className="text-xl font-semibold">{t('pricing.billing.title')}</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
              {PRICING_BILLING_KEYS.map((key) => (
                <li key={key} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-blue-600 dark:text-blue-400" />
                  <span>{t(`pricing.billing.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900/40 sm:p-8">
            <h2 className="text-xl font-semibold">{t('pricing.faq.title')}</h2>
            <dl className="mt-4 space-y-4">
              {PRICING_FAQ_KEYS.map((key) => (
                <div key={key}>
                  <dt className="text-sm font-medium text-gray-900 dark:text-white">
                    {t(`pricing.faq.${key}.question`)}
                  </dt>
                  <dd className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
                    {t(`pricing.faq.${key}.answer`, rangeParams)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* CTA */}
        <section className="mt-12 overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-center text-white sm:p-10">
          <h2 className="text-2xl font-semibold">{t('pricing.cta.title')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-blue-100">{t('pricing.cta.description')}</p>
          <Link
            href={startPath}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-white px-7 py-3 text-sm font-medium text-blue-700 shadow-sm transition-colors hover:bg-blue-50"
          >
            {t('pricing.cta.button')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </section>
      </main>

      <footer className="border-t border-gray-100 py-8 text-center dark:border-gray-800/60">
        <div className="mb-4 flex flex-wrap justify-center gap-x-6 gap-y-2">
          <Link href={localizedPricingPath} className="text-sm text-gray-400 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-white">
            {t('legal.nav.pricing')}
          </Link>
          <Link href={localizedTermsPath} className="text-sm text-gray-400 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-white">
            {t('legal.nav.terms')}
          </Link>
          <Link href={localizedRefundPath} className="text-sm text-gray-400 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-white">
            {t('legal.nav.refund')}
          </Link>
          <Link href={localizedPrivacyPath} className="text-sm text-gray-400 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-white">
            {t('legal.nav.privacy')}
          </Link>
          <Link href={localizedContactPath} className="text-sm text-gray-400 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-white">
            {t('legal.nav.contact')}
          </Link>
        </div>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          &copy; {new Date().getFullYear()} SubioHub. {t('marketing.footer.tagline')}
        </p>
      </footer>
    </div>
  );
}
