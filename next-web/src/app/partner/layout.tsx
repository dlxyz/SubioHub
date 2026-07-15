"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  User,
  UserPlus2,
  Users,
  X,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";

const PARTNER_ROLES = new Set(["admin", "channel_partner"]);

const partnerNavigation = [
  {
    title: "渠道主工作台",
    items: [
      {
        label: "渠道总览",
        href: "/partner",
        icon: LayoutDashboard,
        desc: "查看渠道主账号概览、佣金状态和快捷入口",
      },
      {
        label: "代理人管理",
        href: "/partner/agents",
        icon: UserPlus2,
        desc: "新增、管理和维护归属于当前渠道主的代理人",
      },
      {
        label: "分销人员",
        href: "/partner/distributors",
        icon: Users,
        desc: "查看归属于当前渠道主及下级代理人的分销人员",
      },
    ],
  },
] as const;

export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    if (!isAuthenticated) {
      router.replace(
        `/partner/login?redirect=${encodeURIComponent(pathname || "/partner")}`,
      );
      return;
    }
    if (!PARTNER_ROLES.has(user?.role || "")) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, mounted, pathname, router, user?.role]);

  const handleLogout = () => {
    logout();
    if (typeof window !== "undefined") {
      window.location.href = "/partner/login";
    }
  };

  const pageTitle =
    partnerNavigation
      .flatMap((section) => section.items)
      .find(
        (item) =>
          pathname === item.href ||
          (item.href !== "/partner" && pathname.startsWith(`${item.href}/`)),
      )?.label || "渠道后台";

  if (!mounted) {
    return <div className="min-h-screen bg-gray-50 dark:bg-[#121212]" />;
  }

  if (!isAuthenticated || !PARTNER_ROLES.has(user?.role || "")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 dark:bg-[#121212]">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            渠道后台加载中
          </h1>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            {!isAuthenticated
              ? "正在跳转到渠道主登录页。"
              : "当前账号没有渠道后台权限，正在返回个人后台。"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#121212]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-gray-200/70 bg-white/95 shadow-xl shadow-gray-200/40 backdrop-blur transition-transform duration-300 ease-in-out md:translate-x-0 dark:border-gray-800/70 dark:bg-[#161616]/95 dark:shadow-black/20",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-20 items-center justify-between border-b border-gray-200/70 px-5 dark:border-gray-800/70">
          <Link href="/partner" className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/20">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-bold tracking-tight text-gray-900 dark:text-white">
                Partner Console
              </div>
              <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                独立渠道主后台
              </div>
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
          {partnerNavigation.map((section) => (
            <div key={section.title}>
              <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                {section.title}
              </div>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/partner" &&
                      pathname.startsWith(`${item.href}/`));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        "group flex items-start rounded-2xl px-3 py-3 transition",
                        isActive
                          ? "bg-blue-50 text-blue-700 shadow-sm dark:bg-blue-500/10 dark:text-blue-300"
                          : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/60",
                      )}
                    >
                      <item.icon
                        className={cn(
                          "mt-0.5 mr-3 h-5 w-5 flex-shrink-0",
                          isActive
                            ? "text-blue-600 dark:text-blue-300"
                            : "text-gray-400 dark:text-gray-500",
                        )}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {item.label}
                        </div>
                        <div
                          className={cn(
                            "mt-0.5 line-clamp-2 text-xs",
                            isActive
                              ? "text-blue-700/80 dark:text-blue-300/80"
                              : "text-gray-500 dark:text-gray-400",
                          )}
                        >
                          {item.desc}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="space-y-2">
            <Link
              href="/dashboard"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center rounded-2xl border border-blue-200/70 px-3 py-3 text-sm font-medium text-blue-700 transition hover:bg-blue-50 dark:border-blue-500/20 dark:text-blue-300 dark:hover:bg-blue-500/10"
            >
              <User className="mr-3 h-5 w-5 text-blue-500" />
              <div>
                <div>个人后台</div>
                <div className="mt-0.5 text-xs text-blue-500/80 dark:text-blue-300/70">
                  切换到个人系统管理
                </div>
              </div>
            </Link>

            {user?.role === "admin" && (
              <Link
                href="/admin/dashboard"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center rounded-2xl border border-purple-200/70 px-3 py-3 text-sm font-medium text-purple-700 transition hover:bg-purple-50 dark:border-purple-500/20 dark:text-purple-300 dark:hover:bg-purple-500/10"
              >
                <ShieldCheck className="mr-3 h-5 w-5 text-purple-500" />
                <div>
                  <div>管理后台</div>
                  <div className="mt-0.5 text-xs text-purple-500/80 dark:text-purple-300/70">
                    切换到系统管理后台
                  </div>
                </div>
              </Link>
            )}
          </div>
        </nav>

        <div className="border-t border-gray-200/70 p-4 dark:border-gray-800/70">
          <div className="rounded-2xl bg-gray-50 p-3 dark:bg-[#1F1F1F]">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {user?.email || "channel_partner"}
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              角色: {user?.role || "channel_partner"}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-red-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-600"
          >
            <LogOut className="mr-2 h-4 w-4" />
            退出
          </button>
        </div>
      </aside>

      <div className="md:pl-72">
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-[#161616]/90">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 md:hidden dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {pageTitle}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  渠道主独立业务入口
                </div>
              </div>
            </div>

            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <User className="mr-2 h-4 w-4" />
              个人后台
            </Link>
          </div>
        </header>

        <main className="px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
