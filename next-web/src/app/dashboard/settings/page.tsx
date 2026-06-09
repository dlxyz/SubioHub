'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  Settings,
  ShieldAlert,
  Smartphone,
  User,
  Wallet,
  Zap,
} from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { getPublicSettings } from '@/lib/public-settings';
import {
  changeUserPassword,
  disableTotp,
  enableTotp,
  getTotpStatus,
  getTotpVerificationMethod,
  getUserProfile,
  initiateTotpSetup,
  removeNotifyEmail,
  sendNotifyEmailCode,
  sendTotpVerifyCode,
  toggleNotifyEmail,
  type TotpSetupResult,
  type TotpStatus,
  type TotpVerificationMethod,
  type UserProfile,
  updateUserProfile,
  verifyNotifyEmail,
} from '@/lib/user-profile';
import { useAuthStore } from '@/store/auth';

type Notice = {
  type: 'success' | 'error';
  text: string;
};

function formatCurrency(value?: number) {
  return `$${(value || 0).toFixed(2)}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatUnixTime(value?: number) {
  if (!value) return '-';
  return new Date(value * 1000).toLocaleString();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function NoticeBanner({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        notice.type === 'error'
          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300'
      }`}
    >
      {notice.text}
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const { user, updateUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [totpStatus, setTotpStatus] = useState<TotpStatus | null>(null);
  const [contactInfo, setContactInfo] = useState('');
  const [balanceNotifyFeatureEnabled, setBalanceNotifyFeatureEnabled] = useState(false);
  const [systemDefaultThreshold, setSystemDefaultThreshold] = useState(0);

  const [profileNotice, setProfileNotice] = useState<Notice | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<Notice | null>(null);
  const [securityNotice, setSecurityNotice] = useState<Notice | null>(null);

  const [username, setUsername] = useState('');
  const [balanceNotifyEnabled, setBalanceNotifyEnabled] = useState(false);
  const [balanceNotifyThreshold, setBalanceNotifyThreshold] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifyCode, setNotifyCode] = useState('');
  const [notifyCodeSent, setNotifyCodeSent] = useState(false);
  const [notifyCooldown, setNotifyCooldown] = useState(0);
  const [sendingNotifyCode, setSendingNotifyCode] = useState(false);
  const [verifyingNotifyEmail, setVerifyingNotifyEmail] = useState(false);
  const [togglingEmail, setTogglingEmail] = useState('');
  const [removingEmail, setRemovingEmail] = useState('');

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [totpFlow, setTotpFlow] = useState<'idle' | 'setup' | 'disable'>('idle');
  const [totpMethod, setTotpMethod] = useState<TotpVerificationMethod['method']>('password');
  const [loadingTotpMethod, setLoadingTotpMethod] = useState(false);
  const [totpVerificationValue, setTotpVerificationValue] = useState('');
  const [totpCodeCooldown, setTotpCodeCooldown] = useState(0);
  const [sendingTotpCode, setSendingTotpCode] = useState(false);
  const [setupResult, setSetupResult] = useState<TotpSetupResult | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [submittingTotp, setSubmittingTotp] = useState(false);

  const applyProfile = useCallback(
    (nextProfile: UserProfile) => {
      setProfile(nextProfile);
      setUsername(nextProfile.username || '');
      setBalanceNotifyEnabled(nextProfile.balance_notify_enabled ?? false);
      setBalanceNotifyThreshold(
        nextProfile.balance_notify_threshold != null ? String(nextProfile.balance_notify_threshold) : ''
      );
      updateUser({
        balance: nextProfile.balance,
        concurrency: nextProfile.concurrency,
        invite_code: nextProfile.invite_code,
        email: nextProfile.email,
      });
    },
    [updateUser]
  );

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [profileResult, publicSettings, totpResult] = await Promise.all([
        getUserProfile(),
        getPublicSettings(),
        getTotpStatus(),
      ]);
      applyProfile(profileResult);
      setTotpStatus(totpResult);
      setContactInfo(publicSettings.contact_info || '');
      setBalanceNotifyFeatureEnabled(publicSettings.balance_low_notify_enabled ?? false);
      setSystemDefaultThreshold(publicSettings.balance_low_notify_threshold ?? 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('dashboard.pages.settings.loadFailed');
      setProfileNotice({ type: 'error', text: message });
    } finally {
      setLoading(false);
    }
  }, [applyProfile, t]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (notifyCooldown <= 0) return;
    const timer = window.setTimeout(() => setNotifyCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [notifyCooldown]);

  useEffect(() => {
    if (totpCodeCooldown <= 0) return;
    const timer = window.setTimeout(() => setTotpCodeCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [totpCodeCooldown]);

  const resetTotpFlow = () => {
    setTotpFlow('idle');
    setTotpVerificationValue('');
    setSetupResult(null);
    setTotpCode('');
    setSecurityNotice(null);
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim()) {
      setProfileNotice({ type: 'error', text: t('dashboard.pages.settings.usernameRequired') });
      return;
    }

    setSavingProfile(true);
    setProfileNotice(null);
    try {
      const thresholdValue =
        balanceNotifyThreshold.trim() === '' ? null : Number.parseFloat(balanceNotifyThreshold.trim());
      const updated = await updateUserProfile({
        username: username.trim(),
        balance_notify_enabled: balanceNotifyEnabled,
        balance_notify_threshold:
          thresholdValue == null || Number.isNaN(thresholdValue) ? null : Math.max(0, thresholdValue),
      });
      applyProfile(updated);
      setProfileNotice({ type: 'success', text: t('dashboard.pages.settings.profileSaved') });
    } catch (error) {
      setProfileNotice({
        type: 'error',
        text: error instanceof Error ? error.message : t('dashboard.pages.settings.profileSaveFailed'),
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSendNotifyCode = async () => {
    if (!isValidEmail(notifyEmail.trim())) {
      setProfileNotice({ type: 'error', text: t('dashboard.pages.settings.invalidEmail') });
      return;
    }
    setSendingNotifyCode(true);
    setProfileNotice(null);
    try {
      await sendNotifyEmailCode(notifyEmail.trim());
      setNotifyCodeSent(true);
      setNotifyCooldown(60);
      setProfileNotice({ type: 'success', text: t('dashboard.pages.settings.codeSent') });
    } catch (error) {
      setProfileNotice({
        type: 'error',
        text: error instanceof Error ? error.message : t('dashboard.pages.settings.sendCodeFailed'),
      });
    } finally {
      setSendingNotifyCode(false);
    }
  };

  const handleVerifyNotifyEmail = async () => {
    if (!notifyCode.trim() || notifyCode.trim().length !== 6) {
      setProfileNotice({ type: 'error', text: t('dashboard.pages.settings.codeInvalid') });
      return;
    }
    setVerifyingNotifyEmail(true);
    setProfileNotice(null);
    try {
      const updated = await verifyNotifyEmail(notifyEmail.trim(), notifyCode.trim());
      applyProfile(updated);
      setNotifyEmail('');
      setNotifyCode('');
      setNotifyCodeSent(false);
      setNotifyCooldown(0);
      setProfileNotice({ type: 'success', text: t('dashboard.pages.settings.notifyEmailVerified') });
    } catch (error) {
      setProfileNotice({
        type: 'error',
        text: error instanceof Error ? error.message : t('dashboard.pages.settings.verifyFailed'),
      });
    } finally {
      setVerifyingNotifyEmail(false);
    }
  };

  const handleToggleNotifyEmail = async (email: string, disabled: boolean) => {
    setTogglingEmail(email);
    setProfileNotice(null);
    try {
      const updated = await toggleNotifyEmail(email, disabled);
      applyProfile(updated);
      setProfileNotice({ type: 'success', text: t('dashboard.pages.settings.notifyEmailUpdated') });
    } catch (error) {
      setProfileNotice({
        type: 'error',
        text: error instanceof Error ? error.message : t('dashboard.pages.settings.notifyEmailUpdateFailed'),
      });
    } finally {
      setTogglingEmail('');
    }
  };

  const handleRemoveNotifyEmail = async (email: string) => {
    setRemovingEmail(email);
    setProfileNotice(null);
    try {
      const updated = await removeNotifyEmail(email);
      applyProfile(updated);
      setProfileNotice({ type: 'success', text: t('dashboard.pages.settings.notifyEmailRemoved') });
    } catch (error) {
      setProfileNotice({
        type: 'error',
        text: error instanceof Error ? error.message : t('dashboard.pages.settings.notifyEmailRemoveFailed'),
      });
    } finally {
      setRemovingEmail('');
    }
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ type: 'error', text: t('dashboard.pages.settings.passwordMismatch') });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordNotice({ type: 'error', text: t('dashboard.pages.settings.passwordTooShort') });
      return;
    }
    setSavingPassword(true);
    setPasswordNotice(null);
    try {
      await changeUserPassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice({ type: 'success', text: t('dashboard.pages.settings.passwordSaved') });
    } catch (error) {
      setPasswordNotice({
        type: 'error',
        text: error instanceof Error ? error.message : t('dashboard.pages.settings.passwordSaveFailed'),
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleStartTotpFlow = async (flow: 'setup' | 'disable') => {
    setLoadingTotpMethod(true);
    setSecurityNotice(null);
    try {
      const method = await getTotpVerificationMethod();
      setTotpMethod(method.method);
      setTotpFlow(flow);
      setTotpVerificationValue('');
      setSetupResult(null);
      setTotpCode('');
    } catch (error) {
      setSecurityNotice({
        type: 'error',
        text: error instanceof Error ? error.message : t('dashboard.pages.settings.totpMethodLoadFailed'),
      });
    } finally {
      setLoadingTotpMethod(false);
    }
  };

  const handleSendTotpCode = async () => {
    setSendingTotpCode(true);
    setSecurityNotice(null);
    try {
      await sendTotpVerifyCode();
      setTotpCodeCooldown(60);
      setSecurityNotice({ type: 'success', text: t('dashboard.pages.settings.codeSent') });
    } catch (error) {
      setSecurityNotice({
        type: 'error',
        text: error instanceof Error ? error.message : t('dashboard.pages.settings.sendCodeFailed'),
      });
    } finally {
      setSendingTotpCode(false);
    }
  };

  const handleInitiateTotpSetup = async () => {
    if (totpMethod === 'email' && totpVerificationValue.trim().length !== 6) {
      setSecurityNotice({ type: 'error', text: t('dashboard.pages.settings.codeInvalid') });
      return;
    }
    if (totpMethod === 'password' && !totpVerificationValue.trim()) {
      setSecurityNotice({ type: 'error', text: t('dashboard.pages.settings.passwordRequired') });
      return;
    }
    setSubmittingTotp(true);
    setSecurityNotice(null);
    try {
      const result = await initiateTotpSetup(
        totpMethod === 'email'
          ? { email_code: totpVerificationValue.trim() }
          : { password: totpVerificationValue.trim() }
      );
      setSetupResult(result);
      setSecurityNotice({ type: 'success', text: t('dashboard.pages.settings.totpSecretReady') });
    } catch (error) {
      setSecurityNotice({
        type: 'error',
        text: error instanceof Error ? error.message : t('dashboard.pages.settings.totpSetupFailed'),
      });
    } finally {
      setSubmittingTotp(false);
    }
  };

  const handleEnableTotp = async () => {
    if (!setupResult || totpCode.trim().length !== 6) {
      setSecurityNotice({ type: 'error', text: t('dashboard.pages.settings.codeInvalid') });
      return;
    }
    setSubmittingTotp(true);
    setSecurityNotice(null);
    try {
      await enableTotp({
        totp_code: totpCode.trim(),
        setup_token: setupResult.setup_token,
      });
      setTotpStatus(await getTotpStatus());
      resetTotpFlow();
      setSecurityNotice({ type: 'success', text: t('dashboard.pages.settings.totpEnabledSuccess') });
    } catch (error) {
      setSecurityNotice({
        type: 'error',
        text: error instanceof Error ? error.message : t('dashboard.pages.settings.totpEnableFailed'),
      });
    } finally {
      setSubmittingTotp(false);
    }
  };

  const handleDisableTotp = async () => {
    if (totpMethod === 'email' && totpVerificationValue.trim().length !== 6) {
      setSecurityNotice({ type: 'error', text: t('dashboard.pages.settings.codeInvalid') });
      return;
    }
    if (totpMethod === 'password' && !totpVerificationValue.trim()) {
      setSecurityNotice({ type: 'error', text: t('dashboard.pages.settings.passwordRequired') });
      return;
    }
    setSubmittingTotp(true);
    setSecurityNotice(null);
    try {
      await disableTotp(
        totpMethod === 'email'
          ? { email_code: totpVerificationValue.trim() }
          : { password: totpVerificationValue.trim() }
      );
      setTotpStatus(await getTotpStatus());
      resetTotpFlow();
      setSecurityNotice({ type: 'success', text: t('dashboard.pages.settings.totpDisabledSuccess') });
    } catch (error) {
      setSecurityNotice({
        type: 'error',
        text: error instanceof Error ? error.message : t('dashboard.pages.settings.totpDisableFailed'),
      });
    } finally {
      setSubmittingTotp(false);
    }
  };

  const handleCopy = async (value: string, successText: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setSecurityNotice({ type: 'success', text: successText });
    } catch {
      setSecurityNotice({ type: 'error', text: t('dashboard.pages.settings.copyFailed') });
    }
  };

  const extraEmails = profile?.balance_notify_extra_emails || [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          <Settings className="mr-2 h-6 w-6 text-gray-500 dark:text-gray-400" />
          {t('dashboard.pages.settings.title')}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.settings.subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-center gap-3">
            <Wallet className="h-5 w-5 text-emerald-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('dashboard.pages.settings.balanceCard')}
            </span>
          </div>
          <div className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
            {loading ? '...' : formatCurrency(profile?.balance ?? user?.balance)}
          </div>
        </div>
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-amber-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('dashboard.pages.settings.concurrencyCard')}
            </span>
          </div>
          <div className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
            {loading ? '...' : profile?.concurrency ?? user?.concurrency ?? 0}
          </div>
        </div>
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-blue-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('dashboard.pages.settings.memberSinceCard')}
            </span>
          </div>
          <div className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">
            {loading ? '...' : formatDateTime(profile?.created_at)}
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-800">
        <nav className="-mb-px flex gap-8">
          <button
            onClick={() => setActiveTab('profile')}
            className={`whitespace-nowrap border-b-2 px-1 pb-4 text-sm font-medium transition-colors ${
              activeTab === 'profile'
                ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span className="flex items-center">
              <User className="mr-2 h-4 w-4" />
              {t('dashboard.pages.settings.tabProfile')}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`whitespace-nowrap border-b-2 px-1 pb-4 text-sm font-medium transition-colors ${
              activeTab === 'security'
                ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span className="flex items-center">
              <ShieldAlert className="mr-2 h-4 w-4" />
              {t('dashboard.pages.settings.tabSecurity')}
            </span>
          </button>
        </nav>
      </div>

      {activeTab === 'profile' ? (
        <div className="space-y-6">
          <NoticeBanner notice={profileNotice} />

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('dashboard.pages.settings.basicInfo')}
            </h3>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/40">
                <div className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.pages.settings.userId')}</div>
                <div className="mt-2 text-base font-medium text-gray-900 dark:text-white">{profile?.id || '-'}</div>
              </div>
              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/40">
                <div className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.pages.settings.email')}</div>
                <div className="mt-2 flex items-center gap-2 text-base font-medium text-gray-900 dark:text-white">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <span>{profile?.email || user?.email || '-'}</span>
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('dashboard.pages.settings.emailReadonly')}
                </div>
              </div>
              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/40">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {t('dashboard.pages.settings.inviteCode')}
                </div>
                <div className="mt-2 text-base font-medium text-gray-900 dark:text-white">
                  {profile?.invite_code || user?.invite_code || '-'}
                </div>
              </div>
              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/40">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {t('dashboard.pages.settings.accountStatus')}
                </div>
                <div className="mt-2 text-base font-medium text-gray-900 dark:text-white">{profile?.status || '-'}</div>
              </div>
            </div>
          </div>

          {contactInfo ? (
            <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5 text-blue-900 shadow-sm dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-100">
              <div className="text-sm font-medium">{t('dashboard.pages.settings.contactSupport')}</div>
              <div className="mt-1 text-sm">{contactInfo}</div>
            </div>
          ) : null}

          <form
            onSubmit={handleSaveProfile}
            className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('dashboard.pages.settings.profileTitle')}
            </h3>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('dashboard.pages.settings.username')}
                </label>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={t('dashboard.pages.settings.usernamePlaceholder')}
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-blue-400 dark:border-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('dashboard.pages.settings.notifyThreshold')}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={balanceNotifyThreshold}
                  onChange={(event) => setBalanceNotifyThreshold(event.target.value)}
                  placeholder={
                    systemDefaultThreshold > 0
                      ? `${t('dashboard.pages.settings.systemDefault')} ${formatCurrency(systemDefaultThreshold)}`
                      : t('dashboard.pages.settings.notifyThresholdPlaceholder')
                  }
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-blue-400 dark:border-gray-700 dark:text-white"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {t('dashboard.pages.settings.notifyThresholdHint')}
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-900/40">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {t('dashboard.pages.settings.notifyEnabled')}
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {balanceNotifyFeatureEnabled
                    ? t('dashboard.pages.settings.notifyDescription')
                    : t('dashboard.pages.settings.notifyFeatureDisabled')}
                </div>
              </div>
              <label className="inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={balanceNotifyEnabled}
                  disabled={!balanceNotifyFeatureEnabled}
                  onChange={(event) => setBalanceNotifyEnabled(event.target.checked)}
                />
                <span className="relative h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-blue-600 peer-disabled:opacity-50 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
              </label>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {savingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {savingProfile ? t('dashboard.pages.settings.savingProfile') : t('dashboard.pages.settings.saveProfile')}
              </button>
            </div>
          </form>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('dashboard.pages.settings.notifyEmailsTitle')}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('dashboard.pages.settings.notifyEmailsDescription')}
            </p>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {t('dashboard.pages.settings.primaryEmail')}
                </div>
                <div className="mt-2 text-sm font-medium text-gray-900 dark:text-white">{profile?.email || '-'}</div>
              </div>

              {extraEmails.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  {t('dashboard.pages.settings.notifyEmailEmpty')}
                </div>
              ) : (
                extraEmails.map((entry) => (
                  <div
                    key={entry.email}
                    className="flex flex-col gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-700 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{entry.email}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {entry.verified
                          ? t('dashboard.pages.settings.verified')
                          : t('dashboard.pages.settings.unverified')}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleToggleNotifyEmail(entry.email, !entry.disabled)}
                        disabled={togglingEmail === entry.email}
                        className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        {togglingEmail === entry.email
                          ? t('dashboard.pages.settings.processing')
                          : entry.disabled
                            ? t('dashboard.pages.settings.enableEmail')
                            : t('dashboard.pages.settings.disableEmail')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemoveNotifyEmail(entry.email)}
                        disabled={removingEmail === entry.email}
                        className="rounded-xl border border-red-200 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/20"
                      >
                        {removingEmail === entry.email
                          ? t('dashboard.pages.settings.processing')
                          : t('dashboard.pages.settings.removeEmail')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 grid gap-4 rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/40 md:grid-cols-[1fr,220px,auto]">
              <input
                type="email"
                value={notifyEmail}
                onChange={(event) => setNotifyEmail(event.target.value)}
                placeholder={t('dashboard.pages.settings.notifyEmailPlaceholder')}
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-blue-400 dark:border-gray-700 dark:text-white"
              />
              <input
                value={notifyCode}
                onChange={(event) => setNotifyCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t('dashboard.pages.settings.verifyCode')}
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-blue-400 dark:border-gray-700 dark:text-white"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleSendNotifyCode()}
                  disabled={sendingNotifyCode || (notifyCooldown > 0 && notifyCodeSent)}
                  className="rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {sendingNotifyCode
                    ? t('dashboard.pages.settings.sendingCode')
                    : notifyCooldown > 0
                      ? `${t('dashboard.pages.settings.resendCode')} (${notifyCooldown}s)`
                      : t('dashboard.pages.settings.sendCode')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleVerifyNotifyEmail()}
                  disabled={!notifyCodeSent || verifyingNotifyEmail}
                  className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {verifyingNotifyEmail
                    ? t('dashboard.pages.settings.verifying')
                    : t('dashboard.pages.settings.addAndVerify')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <NoticeBanner notice={passwordNotice} />
          <NoticeBanner notice={securityNotice} />

          <form
            onSubmit={handleChangePassword}
            className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]"
          >
            <div className="flex items-start gap-4">
              <KeyRound className="mt-1 h-6 w-6 text-gray-400" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('dashboard.pages.settings.passwordTitle')}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {t('dashboard.pages.settings.passwordHint')}
                </p>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(event) => setOldPassword(event.target.value)}
                    placeholder={t('dashboard.pages.settings.currentPassword')}
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-blue-400 dark:border-gray-700 dark:text-white"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder={t('dashboard.pages.settings.newPassword')}
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-blue-400 dark:border-gray-700 dark:text-white"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder={t('dashboard.pages.settings.confirmPassword')}
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-blue-400 dark:border-gray-700 dark:text-white"
                  />
                </div>
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {t('dashboard.pages.settings.passwordLengthHint')}
                </div>
                <div className="mt-5 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="inline-flex items-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {savingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {savingPassword
                      ? t('dashboard.pages.settings.savingPassword')
                      : t('dashboard.pages.settings.resetPassword')}
                  </button>
                </div>
              </div>
            </div>
          </form>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
            <div className="flex items-start gap-4">
              <Smartphone className="mt-1 h-6 w-6 text-gray-400" />
              <div className="flex-1">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {t('dashboard.pages.settings.twoFactor')}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {t('dashboard.pages.settings.twoFactorHint')}
                    </p>
                  </div>
                  {totpStatus?.feature_enabled === false ? (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      <AlertTriangle className="mr-1.5 h-4 w-4" />
                      {t('dashboard.pages.settings.totpFeatureDisabled')}
                    </span>
                  ) : totpStatus?.enabled ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                      {t('dashboard.pages.settings.totpEnabled')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      {t('dashboard.pages.settings.notEnabled')}
                    </span>
                  )}
                </div>

                <div className="mt-5 rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/40">
                  {totpStatus?.feature_enabled === false ? (
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      {t('dashboard.pages.settings.totpFeatureDisabledHint')}
                    </div>
                  ) : totpStatus?.enabled ? (
                    <div className="space-y-3">
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        {t('dashboard.pages.settings.totpEnabledAt')} {formatUnixTime(totpStatus.enabled_at)}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleStartTotpFlow('disable')}
                        disabled={loadingTotpMethod}
                        className="rounded-2xl border border-red-200 px-4 py-2.5 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/20"
                      >
                        {loadingTotpMethod && totpFlow !== 'disable'
                          ? t('dashboard.pages.settings.processing')
                          : t('dashboard.pages.settings.disableNow')}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        {t('dashboard.pages.settings.totpNotEnabledHint')}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleStartTotpFlow('setup')}
                        disabled={loadingTotpMethod}
                        className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                      >
                        {loadingTotpMethod && totpFlow !== 'setup'
                          ? t('dashboard.pages.settings.processing')
                          : t('dashboard.pages.settings.enableNow')}
                      </button>
                    </div>
                  )}
                </div>

                {totpFlow !== 'idle' ? (
                  <div className="mt-5 rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {totpFlow === 'setup'
                          ? t('dashboard.pages.settings.totpSetupTitle')
                          : t('dashboard.pages.settings.totpDisableTitle')}
                      </div>
                      <button
                        type="button"
                        onClick={resetTotpFlow}
                        className="text-xs text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        {t('dashboard.pages.settings.cancel')}
                      </button>
                    </div>

                    <div className="mt-4 space-y-4">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {totpMethod === 'email'
                          ? t('dashboard.pages.settings.totpMethodEmailHint')
                          : t('dashboard.pages.settings.totpMethodPasswordHint')}
                      </div>

                      <div className="flex flex-col gap-3 lg:flex-row">
                        <input
                          type={totpMethod === 'email' ? 'text' : 'password'}
                          value={totpVerificationValue}
                          onChange={(event) =>
                            setTotpVerificationValue(
                              totpMethod === 'email'
                                ? event.target.value.replace(/\D/g, '').slice(0, 6)
                                : event.target.value
                            )
                          }
                          placeholder={
                            totpMethod === 'email'
                              ? t('dashboard.pages.settings.verifyCode')
                              : t('dashboard.pages.settings.currentPassword')
                          }
                          className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-blue-400 dark:border-gray-700 dark:text-white"
                        />
                        {totpMethod === 'email' ? (
                          <button
                            type="button"
                            onClick={() => void handleSendTotpCode()}
                            disabled={sendingTotpCode || totpCodeCooldown > 0}
                            className="rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            {sendingTotpCode
                              ? t('dashboard.pages.settings.sendingCode')
                              : totpCodeCooldown > 0
                                ? `${t('dashboard.pages.settings.resendCode')} (${totpCodeCooldown}s)`
                                : t('dashboard.pages.settings.sendCode')}
                          </button>
                        ) : null}
                      </div>

                      {totpFlow === 'setup' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleInitiateTotpSetup()}
                            disabled={submittingTotp}
                            className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                          >
                            {submittingTotp
                              ? t('dashboard.pages.settings.processing')
                              : t('dashboard.pages.settings.generateSecret')}
                          </button>

                          {setupResult ? (
                            <div className="space-y-4 rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/40">
                              <div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {t('dashboard.pages.settings.manualSecret')}
                                </div>
                                <div className="mt-2 flex flex-col gap-2 lg:flex-row">
                                  <input
                                    readOnly
                                    value={setupResult.secret}
                                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleCopy(
                                        setupResult.secret,
                                        t('dashboard.pages.settings.secretCopied')
                                      )
                                    }
                                    className="inline-flex items-center rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                                  >
                                    <Copy className="mr-2 h-4 w-4" />
                                    {t('dashboard.pages.settings.copySecret')}
                                  </button>
                                </div>
                              </div>

                              <div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {t('dashboard.pages.settings.secretUri')}
                                </div>
                                <textarea
                                  readOnly
                                  value={setupResult.qr_code_url}
                                  rows={3}
                                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                                />
                                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                  {t('dashboard.pages.settings.qrHint')}
                                </div>
                              </div>

                              <div className="flex flex-col gap-3 lg:flex-row">
                                <input
                                  value={totpCode}
                                  onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                                  placeholder={t('dashboard.pages.settings.totpCode')}
                                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleEnableTotp()}
                                  disabled={submittingTotp}
                                  className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                                >
                                  {submittingTotp
                                    ? t('dashboard.pages.settings.processing')
                                    : t('dashboard.pages.settings.confirmEnable')}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleDisableTotp()}
                          disabled={submittingTotp}
                          className="rounded-2xl border border-red-200 px-4 py-2.5 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/20"
                        >
                          {submittingTotp
                            ? t('dashboard.pages.settings.processing')
                            : t('dashboard.pages.settings.confirmDisable')}
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
