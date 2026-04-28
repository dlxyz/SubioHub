'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bot,
  BookOpen,
  ChevronDown,
  CreditCard,
  Gift,
  Home,
  Info,
  LayoutDashboard,
  Key,
  PackageCheck,
  BarChart3,
  ReceiptText,
  Wallet,
  Users,
  Settings,
  Shield,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

type NavigationItem = {
  key: string;
  href: string;
  icon: typeof LayoutDashboard;
  descKey?: string;
};

const navigationSections: Array<{ title: string; items: NavigationItem[] }> = [
  {
    title: 'dashboard.nav.sectionWorkspace',
    items: [
      { key: 'dashboard.nav.dashboard', href: '/dashboard', icon: LayoutDashboard, descKey: 'dashboard.navDesc.dashboard' },
      { key: 'dashboard.nav.modelHub', href: '/dashboard/models', icon: Bot, descKey: 'dashboard.navDesc.modelHub' },
      { key: 'dashboard.nav.plans', href: '/dashboard/plans', icon: PackageCheck, descKey: 'dashboard.navDesc.plans' },
    ],
  },
  {
    title: 'dashboard.nav.sectionDev',
    items: [
      { key: 'dashboard.nav.apiKeys', href: '/dashboard/keys', icon: Key, descKey: 'dashboard.navDesc.apiKeys' },
      { key: 'dashboard.nav.usage', href: '/dashboard/usage', icon: BarChart3, descKey: 'dashboard.navDesc.usage' },
      { key: 'dashboard.nav.docsCenter', href: '/dashboard/docs', icon: BookOpen, descKey: 'dashboard.navDesc.docsCenter' },
    ],
  },
  {
    title: 'dashboard.nav.sectionAccount',
    items: [
      { key: 'dashboard.nav.subscriptions', href: '/dashboard/subscriptions', icon: CreditCard, descKey: 'dashboard.navDesc.subscriptions' },
      { key: 'dashboard.nav.orders', href: '/dashboard/orders', icon: ReceiptText, descKey: 'dashboard.navDesc.orders' },
      { key: 'dashboard.nav.finance', href: '/dashboard/finance', icon: Wallet, descKey: 'dashboard.navDesc.finance' },
      { key: 'dashboard.nav.redeem', href: '/dashboard/redeem', icon: Gift, descKey: 'dashboard.navDesc.redeem' },
      { key: 'dashboard.nav.affiliate', href: '/dashboard/affiliate', icon: Users, descKey: 'dashboard.navDesc.affiliate' },
      { key: 'dashboard.nav.settings', href: '/dashboard/settings', icon: Settings, descKey: 'dashboard.navDesc.settings' },
      { key: 'dashboard.nav.aboutPlatform', href: '/dashboard/about', icon: Info, descKey: 'dashboard.navDesc.aboutPlatform' },
    ],
  },
];

const headerNavigation = [
  { key: 'dashboard.nav.home', href: '/', icon: Home },
  { key: 'dashboard.nav.console', href: '/dashboard', icon: LayoutDashboard },
  { key: 'dashboard.nav.modelHub', href: '/dashboard/models', icon: Bot },
  { key: 'dashboard.nav.plans', href: '/dashboard/plans', icon: PackageCheck },
  { key: 'dashboard.nav.docs', href: '/dashboard/docs', icon: BookOpen },
  { key: 'dashboard.nav.about', href: '/dashboard/about', icon: Info },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { availableLocales, locale, setLocale, t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMounted(true);
      setIsDark(document.documentElement.classList.contains('dark'));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    if (!isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname || '/dashboard')}`);
    }
  }, [isAuthenticated, mounted, pathname, router]);

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

  const handleLogout = () => {
    logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  const displayName = !user?.email ? 'User' : user.email.split('@')[0] || user.email;
  const userInitials = displayName ? displayName.slice(0, 2).toUpperCase() : 'U';

  const topNavActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href === '/dashboard') {
      return pathname.startsWith('/dashboard') && !['/dashboard/models', '/dashboard/plans', '/dashboard/docs', '/dashboard/about'].includes(pathname);
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gray-50 dark:bg-[#121212]" />;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 dark:bg-[#121212]">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{t('dashboard.common.notLoggedIn')}</h1>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">正在跳转到登录页...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 transition-colors duration-300 dark:bg-[#121212]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(147,51,234,0.08),transparent_26%)] dark:bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.10),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(147,51,234,0.10),transparent_24%)]" />

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-gray-200/70 bg-white/95 shadow-xl shadow-gray-200/40 backdrop-blur md:translate-x-0 dark:border-gray-800/70 dark:bg-[#161616]/95 dark:shadow-black/20',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-20 items-center justify-between border-b border-gray-200/70 px-5 dark:border-gray-800/70">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 text-lg font-bold text-white shadow-lg shadow-blue-500/20">
              S
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-bold tracking-tight text-gray-900 dark:text-white">SubioHub</div>
              <div className="truncate text-xs text-gray-500 dark:text-gray-400">{t('dashboard.nav.userCenterTag')}</div>
            </div>
          </Link>
          <button
            className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 md:hidden dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
          {navigationSections.map((section) => (
            <div key={section.title}>
              <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                {t(section.title)}
              </div>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={() => {
                        setSidebarOpen(false);
                        setUserMenuOpen(false);
                      }}
                      className={cn(
                        'group flex items-start rounded-2xl px-3 py-3 transition',
                        isActive
                          ? 'bg-blue-50 text-blue-700 shadow-sm dark:bg-blue-500/10 dark:text-blue-400'
                          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/60'
                      )}
                    >
                      <item.icon
                        className={cn(
                          'mt-0.5 mr-3 h-5 w-5 flex-shrink-0',
                          isActive ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{t(item.key)}</div>
                        <div
                          className={cn(
                            'mt-0.5 line-clamp-2 text-xs',
                            isActive ? 'text-blue-600/80 dark:text-blue-300/80' : 'text-gray-500 dark:text-gray-400'
                          )}
                        >
                          {item.descKey ? t(item.descKey) : ''}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {user?.role === 'admin' && (
            <Link
              href="/admin/dashboard"
              onClick={() => {
                setSidebarOpen(false);
                setUserMenuOpen(false);
              }}
              className="flex items-center rounded-2xl border border-purple-200/70 px-3 py-3 text-sm font-medium text-purple-700 transition hover:bg-purple-50 dark:border-purple-500/20 dark:text-purple-300 dark:hover:bg-purple-500/10"
            >
              <Shield className="mr-3 h-5 w-5 text-purple-500" />
              <div>
                <div>{t('dashboard.nav.admin')}</div>
                <div className="mt-0.5 text-xs text-purple-500/80 dark:text-purple-300/70">{t('dashboard.nav.switchAdminHint')}</div>
              </div>
            </Link>
          )}
        </nav>

        <div className="border-t border-gray-200/70 p-4 dark:border-gray-800/70">
          <div className="rounded-2xl bg-gray-50 p-3 dark:bg-[#1F1F1F]">
            <div className="flex items-center px-1 py-1">
              <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-100 text-sm font-semibold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{displayName}</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user?.email || t('dashboard.common.notLoggedIn')}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-gray-200/80 bg-white px-3 py-2 text-sm dark:border-gray-800 dark:bg-[#181818]">
              <span className="text-gray-500 dark:text-gray-400">{t('dashboard.nav.balance')}</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-300">
                ${user?.balance?.toFixed(2) || '0.00'}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="mt-3 flex w-full items-center rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <LogOut className="mr-3 h-5 w-5" />
            {t('dashboard.nav.logout')}
            </button>
          </div>
        </div>
      </aside>

      <div className="relative flex min-h-screen flex-1 flex-col md:pl-72">
        <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/80 backdrop-blur-xl dark:border-gray-800/70 dark:bg-[#121212]/80">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 md:hidden dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-6 w-6" />
              </button>

              <Link href="/" className="flex min-w-0 items-center gap-2 md:hidden">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 text-sm font-bold text-white shadow-lg shadow-blue-500/20">
                  S
                </div>
                <span className="truncate text-base font-semibold text-gray-900 dark:text-white">SubioHub</span>
              </Link>

              <nav className="hidden items-center gap-1 lg:flex">
                {headerNavigation.map((item) => {
                  const active = topNavActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => {
                        setSidebarOpen(false);
                        setUserMenuOpen(false);
                      }}
                      className={cn(
                        'inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition',
                        active
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {t(item.key)}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="ml-4 flex items-center gap-2 sm:gap-3">
              <div className="hidden items-center rounded-xl border border-gray-200/80 bg-white px-2.5 py-1.5 dark:border-gray-800 dark:bg-[#171717] md:flex">
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value as 'zh-CN' | 'en-US')}
                  className="bg-transparent text-sm font-medium text-gray-600 outline-none dark:text-gray-300"
                >
                  {availableLocales.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.shortLabel}
                    </option>
                  ))}
                </select>
              </div>

              <div className="hidden items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 sm:flex dark:bg-emerald-900/20 dark:text-emerald-300">
                <Wallet className="h-4 w-4" />
                ${user?.balance?.toFixed(2) || '0.00'}
              </div>

              <button
                onClick={toggleTheme}
                className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  className="flex items-center gap-2 rounded-2xl p-1.5 transition hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 text-sm font-semibold text-white">
                    {userInitials}
                  </div>
                  <div className="hidden text-left md:block">
                    <div className="max-w-[140px] truncate text-sm font-medium text-gray-900 dark:text-white">{displayName}</div>
                    <div className="text-xs capitalize text-gray-500 dark:text-gray-400">{user?.role || 'user'}</div>
                  </div>
                  <ChevronDown className={cn('hidden h-4 w-4 text-gray-400 transition md:block', userMenuOpen && 'rotate-180')} />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl shadow-gray-200/60 dark:border-gray-800 dark:bg-[#171717] dark:shadow-black/30">
                    <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                      <div className="truncate text-sm font-medium text-gray-900 dark:text-white">{displayName}</div>
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400">{user?.email || '-'}</div>
                    </div>
                    <div className="p-2">
                      <Link
                        href="/dashboard/settings"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center rounded-xl px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        <Settings className="mr-3 h-4 w-4" />
                        {t('dashboard.nav.settings')}
                      </Link>
                      <Link
                        href="/dashboard/keys"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center rounded-xl px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        <Key className="mr-3 h-4 w-4" />
                        {t('dashboard.nav.apiKeys')}
                      </Link>
                      {user?.role === 'admin' ? (
                        <Link
                          href="/admin/dashboard"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center rounded-xl px-3 py-2 text-sm text-purple-700 transition hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-500/10"
                        >
                          <Shield className="mr-3 h-4 w-4" />
                          {t('dashboard.nav.admin')}
                        </Link>
                      ) : null}
                    </div>
                    <div className="border-t border-gray-100 p-2 dark:border-gray-800">
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center rounded-xl px-3 py-2 text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                      >
                        <LogOut className="mr-3 h-4 w-4" />
                        {t('dashboard.nav.logout')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

