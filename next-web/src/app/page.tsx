'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { Play, FileText, Copy, Menu, X, Sun, Moon, Globe } from 'lucide-react';
import { localizePath } from '@/i18n/routing';
import { useI18n } from '@/i18n/use-i18n';

export default function HomePage() {
  const { isAuthenticated, user } = useAuthStore();
  const { availableLocales, locale, setLocale, t } = useI18n();
  const [isDark, setIsDark] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const dashboardPath = user?.role === 'admin' ? '/admin/dashboard' : '/dashboard';
  const consoleEntryPath = isAuthenticated ? dashboardPath : '/login';
  const localizedHomePath = localizePath('/', locale);
  const localizedModelsPath = localizePath('/models', locale);
  const localizedLoginPath = localizePath('/login', locale);
  const localizedRegisterPath = localizePath('/register', locale);
  const localizedNewsPath = localizePath('/news', locale);
  const serverAddress = mounted ? window.location.origin : 'https://api.subio.com';

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMounted(true);
      setIsDark(document.documentElement.classList.contains('dark'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    if (newDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleCopyBaseURL = () => {
    navigator.clipboard.writeText(serverAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#121212] overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-gray-100 dark:border-gray-800/60 bg-white/80 dark:bg-[#121212]/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-6 md:gap-8">
              {/* Logo */}
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center shadow-sm">
                  <span className="text-white font-bold text-lg leading-none">S</span>
                </div>
                <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                  SubioHub
                </span>
              </div>

              {/* Desktop Nav Links */}
              <nav className="hidden md:flex items-center gap-6">
                <Link href={localizedHomePath} className="text-sm font-semibold text-gray-900 dark:text-white">
                  {t('dashboard.nav.home')}
                </Link>
                <Link href={consoleEntryPath} className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                  {t('dashboard.nav.console')}
                </Link>
                <Link href={localizedModelsPath} className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                  {t('dashboard.nav.modelHub')}
                </Link>
                <Link href={localizedNewsPath} className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                  {t('dashboard.nav.news')}
                </Link>
                <Link href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                  {t('dashboard.nav.docs')}
                </Link>
                <Link href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                  {t('dashboard.nav.about')}
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-gray-200 px-3 py-2 text-gray-500 dark:border-gray-800 dark:text-gray-300 sm:flex">
                <Globe className="h-4 w-4" />
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value as 'zh-CN' | 'en-US')}
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
                className="h-9 w-9 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white transition-colors"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              <div className="hidden h-4 w-px bg-gray-200 dark:bg-gray-800 md:block" />

              {/* 移动端汉堡按钮 */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden h-9 w-9 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white transition-colors"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>

              {/* PC 端登录区 */}
              <div className="hidden md:flex items-center">
                {isAuthenticated ? (
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-medium text-sm">
                      {user?.email?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Link
                      href={localizedLoginPath}
                      className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-2"
                    >
                      {t('marketing.actions.login')}
                    </Link>
                    <Link
                      href={localizedRegisterPath}
                      className="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                    >
                      {t('marketing.actions.register')}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 移动端下拉菜单 */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 dark:border-gray-800/60 bg-white dark:bg-[#121212] px-4 py-4 shadow-lg absolute w-full">
            <nav className="flex flex-col gap-4">
              <Link href={localizedHomePath} className="text-sm font-semibold text-gray-900 dark:text-white">{t('dashboard.nav.home')}</Link>
              <Link href={consoleEntryPath} className="text-sm font-medium text-gray-600 dark:text-gray-300">{t('dashboard.nav.console')}</Link>
              <Link href={localizedModelsPath} className="text-sm font-medium text-gray-600 dark:text-gray-300">{t('dashboard.nav.modelHub')}</Link>
              <Link href={localizedNewsPath} className="text-sm font-medium text-gray-600 dark:text-gray-300">{t('dashboard.nav.news')}</Link>
              <Link href="#" className="text-sm font-medium text-gray-600 dark:text-gray-300">{t('dashboard.nav.docs')}</Link>
              <Link href="#" className="text-sm font-medium text-gray-600 dark:text-gray-300">{t('dashboard.nav.about')}</Link>

              <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-gray-500 dark:border-gray-800 dark:text-gray-300">
                <Globe className="h-4 w-4" />
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value as 'zh-CN' | 'en-US')}
                  className="w-full bg-transparent text-sm font-medium outline-none"
                >
                  {availableLocales.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.shortLabel}
                    </option>
                  ))}
                </select>
              </div>

              <div className="h-px bg-gray-100 dark:bg-gray-800 my-2"></div>

              {isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-medium text-sm">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {user?.email || 'User'}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Link
                    href={localizedLoginPath}
                    className="inline-flex justify-center w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
                  >
                    {t('marketing.actions.loginNow')}
                  </Link>
                  <Link
                    href={localizedRegisterPath}
                    className="inline-flex justify-center w-full rounded-md border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    {t('marketing.actions.register')}
                  </Link>
                </div>
              )}
            </nav>
          </div>
        )}
      </header>

      {/* Main Banner */}
      <div className="relative w-full min-h-[500px] md:min-h-[600px] lg:min-h-[700px] flex items-center justify-center border-b border-gray-100 dark:border-gray-800/50">
        {/* Decorative blur balls similar to new-api */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/20 dark:bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-500/20 dark:bg-teal-500/10 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="relative z-10 flex flex-col items-center justify-center text-center max-w-4xl mx-auto px-4 py-20">
          <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-gray-900 dark:text-white leading-tight tracking-wider mb-6">
            {t('marketing.hero.titleLead')}
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
              {t('marketing.hero.titleHighlight')}
            </span>
          </h1>

          <p className="text-base md:text-lg lg:text-xl text-gray-500 dark:text-gray-400 mt-4 md:mt-6 max-w-xl">
            {t('marketing.hero.subtitle')}
          </p>

          {/* Base URL Input Box */}
          <div className="mt-8 flex items-center justify-between w-full max-w-[500px] bg-gray-100/80 dark:bg-gray-800/80 rounded-full px-6 py-3 shadow-sm border border-gray-200 dark:border-gray-700 backdrop-blur-sm transition-all hover:shadow-md">
            <span className="text-gray-600 dark:text-gray-300 font-mono text-sm sm:text-base">
              {serverAddress}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-blue-500 dark:text-blue-400 font-mono text-sm sm:text-base hidden sm:inline-block">
                {t('marketing.hero.endpointExample')}
              </span>
              <button
                onClick={handleCopyBaseURL}
                className="flex items-center justify-center h-8 w-8 rounded-full bg-gray-200/80 dark:bg-gray-700/80 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                title={t('marketing.actions.copyBaseUrl')}
              >
                {copied ? <span className="text-[10px] font-medium">{t('marketing.actions.copied')}</span> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-10 flex flex-row gap-4 justify-center items-center">
            <Link
              href={isAuthenticated ? dashboardPath : localizedRegisterPath}
              className="inline-flex items-center justify-center rounded-full bg-blue-600 px-8 py-3 text-base font-medium text-white hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20"
            >
              <Play className="h-5 w-5 mr-2 fill-current" />
              {t('marketing.actions.getApiKey')}
            </Link>
            
            <a
              href="https://github.com/dlxyz/SubioHub"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-3 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
            >
              <FileText className="h-5 w-5 mr-2" />
              {t('marketing.actions.viewDocs')}
            </a>
          </div>

          {/* Supported Providers Section */}
          <div className="mt-20 md:mt-24 w-full">
            <div className="flex items-center mb-8 justify-center">
              <p className="text-lg md:text-xl font-light text-gray-400 dark:text-gray-500 tracking-wide">
                {t('marketing.hero.providersTitle')}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 md:gap-8 max-w-4xl mx-auto px-4 opacity-70 grayscale dark:grayscale-0 dark:opacity-80">
              {/* 这里使用文字或极简徽标代替缺失的商业图标库 */}
              <div className="font-bold text-xl text-gray-800 dark:text-gray-200">OpenAI</div>
              <div className="font-bold text-xl text-gray-800 dark:text-gray-200">Claude</div>
              <div className="font-bold text-xl text-gray-800 dark:text-gray-200">Gemini</div>
              <div className="font-bold text-xl text-gray-800 dark:text-gray-200">Midjourney</div>
              <div className="font-bold text-xl text-gray-800 dark:text-gray-200">DeepSeek</div>
              <div className="font-bold text-xl text-gray-800 dark:text-gray-200">Qwen</div>
              <div className="font-bold text-xl text-gray-800 dark:text-gray-200">Zhipu</div>
              <div className="font-bold text-xl text-blue-600 dark:text-blue-400 ml-4">30+</div>
            </div>
          </div>
        </div>
      </div>

      <footer className="py-8 text-center mt-auto">
        <p className="text-sm text-gray-400 dark:text-gray-500">
          &copy; {new Date().getFullYear()} SubioHub. {t('marketing.footer.tagline')}
        </p>
      </footer>
    </div>
  );
}

