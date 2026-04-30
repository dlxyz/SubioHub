'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  Box,
  ChartColumn,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Gauge,
  Gift,
  Globe,
  HandCoins,
  KeyRound,
  LayoutDashboard,
  Menu,
  Moon,
  Newspaper,
  Settings,
  Shield,
  Sun,
  Ticket,
  User,
  UserCog,
  Users,
  Wallet,
  WalletCards,
  X,
} from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

type NavItem = {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavItem[];
};

type NavSection = {
  titleKey?: string;
  items: NavItem[];
};

const adminSections: NavSection[] = [
  {
    titleKey: 'admin.nav.sectionManage',
    items: [
      { labelKey: 'admin.nav.dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
      { labelKey: 'admin.nav.ops', href: '/admin/ops', icon: Gauge },
      { labelKey: 'admin.nav.users', href: '/admin/users', icon: Users },
      { labelKey: 'admin.nav.groups', href: '/admin/groups', icon: UserCog },
      { labelKey: 'admin.nav.channels', href: '/admin/channels', icon: Box },
      { labelKey: 'admin.nav.subscriptions', href: '/admin/subscriptions', icon: CreditCard },
      { labelKey: 'admin.nav.accounts', href: '/admin/accounts', icon: Globe },
      { labelKey: 'admin.nav.announcements', href: '/admin/announcements', icon: Bell },
      { labelKey: 'admin.nav.news', href: '/admin/news', icon: Newspaper },
      { labelKey: 'admin.nav.proxies', href: '/admin/proxies', icon: Shield },
      { labelKey: 'admin.nav.redeem', href: '/admin/redeem', icon: Ticket },
      { labelKey: 'admin.nav.promoCodes', href: '/admin/promo-codes', icon: Gift },
      {
        labelKey: 'admin.nav.orders',
        href: '/admin/orders',
        icon: WalletCards,
        children: [
          { labelKey: 'admin.nav.paymentDashboard', href: '/admin/orders/dashboard', icon: CreditCard },
          { labelKey: 'admin.nav.ordersManagement', href: '/admin/orders', icon: WalletCards },
          { labelKey: 'admin.nav.plans', href: '/admin/orders/plans', icon: CreditCard },
        ],
      },
      { labelKey: 'admin.nav.usage', href: '/admin/usage', icon: ChartColumn },
      { labelKey: 'admin.nav.affiliate', href: '/admin/affiliate', icon: HandCoins },
      { labelKey: 'admin.nav.settings', href: '/admin/settings', icon: Settings },
    ],
  },
  {
    titleKey: 'admin.nav.sectionAccount',
    items: [
      { labelKey: 'admin.nav.userOverview', href: '/dashboard', icon: LayoutDashboard },
      { labelKey: 'admin.nav.apiKeys', href: '/dashboard/keys', icon: KeyRound },
      { labelKey: 'admin.nav.userUsage', href: '/dashboard/usage', icon: ChartColumn },
      { labelKey: 'admin.nav.wallet', href: '/dashboard/finance', icon: Wallet },
      { labelKey: 'admin.nav.invite', href: '/dashboard/affiliate', icon: HandCoins },
      { labelKey: 'admin.nav.profile', href: '/dashboard/settings', icon: User },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { availableLocales, locale, setLocale, t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});

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
      router.replace('/login');
      return;
    }
    if (user?.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [mounted, isAuthenticated, router, user?.role]);

  const isItemActive = (item: NavItem) => {
    if (item.children?.length) {
      return item.children.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`));
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  const pageTitle = (() => {
    for (const section of adminSections) {
      for (const item of section.items) {
        if (item.children?.length) {
          const child = item.children.find(
            (entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`)
          );
          if (child) {
            return t(child.labelKey);
          }
        }
        if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
          return t(item.labelKey);
        }
      }
    }
    return t('admin.layout.titleFallback');
  })();

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const toggleMenu = (href: string) => {
    setExpandedMenus((prev) => ({
      ...prev,
      [href]: !prev[href],
    }));
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gray-50 dark:bg-[#121212]" />;
  }

  if (!isAuthenticated || user?.role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 dark:bg-[#121212]">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{t('admin.layout.checking')}</h1>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{t('admin.layout.redirecting')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#121212] transition-colors duration-300">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-gray-200 bg-white transition-transform duration-300 ease-in-out dark:border-gray-800/60 dark:bg-[#1A1A1A] md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4 dark:border-gray-800/60">
          <Link href="/admin/dashboard" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-500 to-purple-500 text-white shadow-sm">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white">SubioHub Admin</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{t('admin.layout.brandTag')}</div>
            </div>
          </Link>
          <button
            className="text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-6">
          <div className="space-y-6">
            {adminSections.map((section) => (
              <div key={section.titleKey || 'default'} className="space-y-1">
                {section.titleKey && (
                  <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {t(section.titleKey)}
                  </div>
                )}

                {section.items.map((item) => {
                  const isActive = isItemActive(item);

                  if (item.children?.length) {
                    const isExpanded = expandedMenus[item.href] ?? isActive;
                    return (
                      <div key={item.href} className="space-y-1">
                        <button
                          type="button"
                          onClick={() => toggleMenu(item.href)}
                          aria-expanded={isExpanded}
                          className={cn(
                            'flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                              : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/50'
                          )}
                        >
                          <item.icon
                            className={cn(
                              'mr-3 h-5 w-5 flex-shrink-0',
                              isActive ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                            )}
                          />
                          <span className="flex-1">{t(item.labelKey)}</span>
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 transition-transform',
                              isExpanded ? 'rotate-0 text-gray-400 dark:text-gray-500' : '-rotate-90 text-gray-300 dark:text-gray-600'
                            )}
                          />
                        </button>

                        {isExpanded ? (
                          <div className="ml-4 space-y-1 border-l border-gray-200 pl-3 dark:border-gray-800">
                            {item.children.map((child) => {
                              const isChildActive =
                                pathname === child.href || pathname.startsWith(`${child.href}/`);
                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  onClick={() => setSidebarOpen(false)}
                                  className={cn(
                                    'flex items-center rounded-lg px-3 py-2 text-sm transition-colors',
                                    isChildActive
                                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/50'
                                  )}
                                >
                                  <child.icon
                                    className={cn(
                                      'mr-3 h-4 w-4 flex-shrink-0',
                                      isChildActive ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                                    )}
                                  />
                                  <span className="flex-1">{t(child.labelKey)}</span>
                                  <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                                </Link>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        'flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/50'
                      )}
                    >
                      <item.icon
                        className={cn(
                          'mr-3 h-5 w-5 flex-shrink-0',
                          isActive ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                        )}
                      />
                      <span className="flex-1">{t(item.labelKey)}</span>
                      <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        <div className="border-t border-gray-200 p-4 dark:border-gray-800/60">
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/40">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{user.email}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('admin.layout.role')}: {user.role || 'admin'}
            </p>
          </div>
          <div className="mt-3 flex gap-2">
            <Link
              href="/dashboard"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-center text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/60"
            >
              {t('admin.layout.userSide')}
            </Link>
            <button
              onClick={handleLogout}
              className="flex-1 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
            >
              {t('admin.layout.logout')}
            </button>
          </div>
        </div>
      </aside>

      <div className="min-h-screen md:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white/80 px-4 backdrop-blur-md dark:border-gray-800/60 dark:bg-[#121212]/80 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{pageTitle}</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('admin.layout.migrationHint')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-2 text-gray-500 dark:border-gray-800 dark:text-gray-300">
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
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

