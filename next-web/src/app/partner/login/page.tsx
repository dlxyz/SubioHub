"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  LogIn,
  Globe,
  Moon,
  Sun,
  Building2,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { localizePath } from "@/i18n/routing";
import { useI18n } from "@/i18n/use-i18n";
import { useAuthStore } from "@/store/auth";

const PARTNER_ROLES = new Set(["admin", "channel_partner"]);

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export default function PartnerLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((state) => state.login);
  const { availableLocales, locale, setLocale, t } = useI18n();
  const localizedHomePath = localizePath("/", locale);
  const localizedForgotPasswordPath = localizePath("/forgot-password", locale);
  const localizedRegisterPath = localizePath("/register", locale);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      return;
    }
    document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", "light");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const payload = (await api.post("/auth/login", { email, password })) as {
        access_token: string;
        user: {
          id: number;
          email: string;
          role: string;
          balance?: number;
        };
      };

      if (!PARTNER_ROLES.has(payload.user.role || "")) {
        setError(t("publicAuth.partnerLogin.roleDenied"));
        return;
      }

      login(payload.access_token, {
        id: payload.user.id,
        email: payload.user.email,
        role: payload.user.role,
        balance: payload.user.balance ?? 0,
      });

      const redirectTo = searchParams.get("redirect") || "/partner";
      if (typeof window !== "undefined") {
        window.location.replace(redirectTo);
        return;
      }
      router.replace(redirectTo);
    } catch (submitError: unknown) {
      setError(
        getErrorMessage(submitError, t("publicAuth.login.errorFallback")),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 dark:bg-[#121212] sm:px-6 lg:px-8">
      <div className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href={localizedHomePath}
            className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          >
            {t("publicAuth.common.backHome")}
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-gray-200 bg-white/80 px-3 py-2 text-gray-500 backdrop-blur dark:border-gray-800 dark:bg-[#171717]/80 dark:text-gray-300 sm:flex">
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
              {isDark ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-md space-y-8 rounded-xl border border-gray-100 bg-white p-8 shadow-lg dark:border-gray-700 dark:bg-gray-800">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
            <Building2 className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">
            {t("publicAuth.partnerLogin.title")}
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {t("publicAuth.partnerLogin.subtitle")}
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("publicAuth.common.email")}
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 bg-white py-2.5 pr-3 pl-10 text-gray-900 transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
                  placeholder={t("publicAuth.common.emailPlaceholder")}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t("publicAuth.common.password")}
                </label>
                <Link
                  href={localizedForgotPasswordPath}
                  className="text-xs font-medium text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-400"
                >
                  {t("publicAuth.login.forgotPassword")}
                </Link>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 bg-white py-2.5 pr-10 pl-10 text-gray-900 transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
                  placeholder={t("publicAuth.common.passwordPlaceholder")}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-500"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/30">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                    {error}
                  </h3>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="group relative flex w-full justify-center rounded-lg border border-transparent bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <LogIn className="mr-2 h-5 w-5" />
                {t("publicAuth.login.submit")}
              </>
            )}
          </button>

          <div className="space-y-3 text-center text-sm text-gray-500 dark:text-gray-400">
            <div>
              {t("publicAuth.login.noAccount")}{" "}
              <Link
                href={localizedRegisterPath}
                className="font-medium text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-400"
              >
                {t("publicAuth.login.goRegister")}
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
