'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, UserPlus, Gift, Key, Globe, Moon, Sun, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { getPublicSettings, type PublicSettings } from '@/lib/public-settings';
import Link from 'next/link';
import { localizePath } from '@/i18n/routing';
import { useI18n } from '@/i18n/use-i18n';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { availableLocales, locale, setLocale, t } = useI18n();
  const localizedHomePath = localizePath('/', locale);
  const localizedLoginPath = localizePath('/login', locale);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [affiliateCode, setAffiliateCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [hasSentCode, setHasSentCode] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isDark, setIsDark] = useState(false);
  const [publicSettings, setPublicSettings] = useState<PublicSettings | null>(null);

  const emailVerifyEnabled = Boolean(publicSettings?.email_verify_enabled);
  const promoCodeEnabled = publicSettings?.promo_code_enabled ?? true;
  const invitationCodeEnabled = publicSettings?.invitation_code_enabled ?? true;

  useEffect(() => {
    let isMounted = true;
    const timer = window.setTimeout(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    }, 0);

    void getPublicSettings()
      .then((settings) => {
        if (isMounted) {
          setPublicSettings(settings);
        }
      })
      .catch(() => {
        if (isMounted) {
          setPublicSettings(null);
        }
      });

    const code = searchParams.get('affiliate_code');
    if (code) {
      const codeTimer = window.setTimeout(() => {
        setAffiliateCode(code);
      }, 0);

      return () => {
        isMounted = false;
        window.clearTimeout(timer);
        window.clearTimeout(codeTimer);
      };
    }

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [searchParams]);

  useEffect(() => {
    if (codeCooldown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCodeCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [codeCooldown]);

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

  const handleSendVerifyCode = async () => {
    if (!email.trim()) {
      setError(t('publicAuth.register.enterEmailFirst'));
      return;
    }

    setError('');
    setSuccessMsg('');
    setIsSendingCode(true);

    try {
      const result = (await api.post('/auth/send-verify-code', { email })) as {
        countdown?: number;
      };
      const countdown = Number(result?.countdown ?? 60);
      setCodeCooldown(Number.isFinite(countdown) && countdown > 0 ? countdown : 60);
      setHasSentCode(true);
      setSuccessMsg(t('publicAuth.register.sendCodeSuccess'));
    } catch (error: unknown) {
      setError(getErrorMessage(error, t('publicAuth.register.sendCodeFallback')));
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      // 密码长度校验等基础前端逻辑
      if (password.length < 6) {
        throw new Error(t('publicAuth.register.passwordTooShort'));
      }

      await api.post('/auth/register', { 
        email, 
        password,
        verify_code: verifyCode || undefined,
        promo_code: promoCode || undefined,
        affiliate_code: affiliateCode || undefined
      });
      
      setSuccessMsg(t('publicAuth.register.success'));
      setTimeout(() => {
        router.push(localizedLoginPath);
      }, 1500);

    } catch (error: unknown) {
      setError(getErrorMessage(error, t('publicAuth.register.errorFallback')));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#121212] py-12 px-4 sm:px-6 lg:px-8">
      <div className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href={localizedHomePath} className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
            {t('publicAuth.common.backHome')}
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-gray-200 bg-white/80 px-3 py-2 text-gray-500 backdrop-blur dark:border-gray-800 dark:bg-[#171717]/80 dark:text-gray-300 sm:flex">
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
        </div>
      </div>
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t('publicAuth.register.title')}
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {t('publicAuth.register.subtitle')}
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-4">
            {emailVerifyEnabled ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-200">
                {t('publicAuth.register.verifyHint')}
              </div>
            ) : null}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('publicAuth.common.email')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white sm:text-sm transition-colors"
                  placeholder={t('publicAuth.common.emailPlaceholder')}
                  disabled={isLoading}
                />
              </div>
            </div>

            {emailVerifyEnabled ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('publicAuth.common.verificationCode')}
                </label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <ShieldCheck className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      required={emailVerifyEnabled}
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white sm:text-sm transition-colors"
                      placeholder={t('publicAuth.common.verificationCodePlaceholder')}
                      disabled={isLoading}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendVerifyCode}
                    disabled={isLoading || isSendingCode || codeCooldown > 0}
                    className="shrink-0 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    {isSendingCode ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : codeCooldown > 0 ? (
                      `${codeCooldown}s`
                    ) : (
                      t(hasSentCode ? 'publicAuth.common.resendCode' : 'publicAuth.common.sendCode')
                    )}
                  </button>
                </div>
              </div>
            ) : null}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('publicAuth.common.password')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white sm:text-sm transition-colors"
                  placeholder={t('publicAuth.register.passwordPlaceholder')}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-500"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {invitationCodeEnabled ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('publicAuth.register.inviteCode')} <span className="text-xs text-gray-400 font-normal">({t('publicAuth.common.optional')})</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Key className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={affiliateCode}
                    onChange={(e) => setAffiliateCode(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white sm:text-sm transition-colors"
                    placeholder={t('publicAuth.register.invitePlaceholder')}
                    disabled={isLoading}
                  />
                </div>
              </div>
            ) : null}

            {promoCodeEnabled ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('publicAuth.register.promoCode')} <span className="text-xs text-gray-400 font-normal">({t('publicAuth.common.optional')})</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Gift className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white sm:text-sm transition-colors"
                    placeholder={t('publicAuth.register.promoPlaceholder')}
                    disabled={isLoading}
                  />
                </div>
              </div>
            ) : null}

          </div>

          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/30 p-4 border border-red-200 dark:border-red-800">
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

          {successMsg && (
            <div className="rounded-lg bg-green-50 dark:bg-green-900/30 p-4 border border-green-200 dark:border-green-800">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800 dark:text-green-200">
                    {successMsg}
                  </h3>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <UserPlus className="h-5 w-5 mr-2" />
                {t('publicAuth.register.submit')}
              </>
            )}
          </button>

          <div className="text-center text-sm text-gray-500 dark:text-gray-400">
            {t('publicAuth.register.hasAccount')}{' '}
            <Link
              href={localizedLoginPath}
              className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 transition-colors"
            >
              {t('publicAuth.register.goLogin')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
