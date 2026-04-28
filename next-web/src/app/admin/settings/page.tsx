'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteAdminAPIKey,
  deleteAdminPaymentProvider,
  getAdminAPIKeyStatus,
  getAdminSettings,
  listAdminGroups,
  listAdminPaymentProviders,
  regenerateAdminAPIKey,
  sendAdminTestEmail,
  testAdminSMTPConnection,
  updateAdminPaymentProvider,
  updateAdminSettings,
  createAdminPaymentProvider,
  type AdminAPIKeyStatus,
  type AdminGroup,
  type AdminCreatePaymentProviderPayload,
  type DefaultSubscriptionSetting,
  type AdminPaymentProviderInstance,
  type SystemSettings,
} from '@/lib/admin-api';
import {
  extractBaseUrl,
  getProviderTypeOptions,
  PAYMENT_MODE_POPUP,
  PAYMENT_MODE_QRCODE,
  PROVIDER_CALLBACK_PATHS,
  PROVIDER_CONFIG_FIELDS,
  PROVIDER_WEBHOOK_PATHS,
  PROVIDER_SUPPORTED_TYPES,
  type PaymentProviderOption,
} from '@/lib/payment-provider-config';
import { useI18n } from '@/i18n/use-i18n';

type SettingsForm = {
  registration_enabled: boolean;
  email_verify_enabled: boolean;
  promo_code_enabled: boolean;
  password_reset_enabled: boolean;
  invitation_code_enabled: boolean;
  totp_enabled: boolean;
  frontend_url: string;
  registration_email_suffix_whitelist_text: string;
  site_name: string;
  site_logo: string;
  site_subtitle: string;
  api_base_url: string;
  contact_info: string;
  doc_url: string;
  home_content: string;
  hide_ccs_import_button: boolean;
  purchase_subscription_enabled: boolean;
  purchase_subscription_url: string;
  table_default_page_size: string;
  table_page_size_options_text: string;
  smtp_host: string;
  smtp_port: string;
  smtp_username: string;
  smtp_password: string;
  smtp_from_email: string;
  smtp_from_name: string;
  smtp_use_tls: boolean;
  default_concurrency: string;
  default_balance: string;
  default_subscriptions: DefaultSubscriptionSetting[];
  enable_model_fallback: boolean;
  fallback_model_anthropic: string;
  fallback_model_openai: string;
  fallback_model_gemini: string;
  fallback_model_antigravity: string;
  enable_identity_patch: boolean;
  identity_patch_prompt: string;
  allow_ungrouped_key_scheduling: boolean;
  backend_mode_enabled: boolean;
  enable_fingerprint_unification: boolean;
  enable_metadata_passthrough: boolean;
  enable_cch_signing: boolean;
  web_search_emulation_enabled: boolean;
  payment_enabled: boolean;
  payment_min_amount: string;
  payment_max_amount: string;
  payment_daily_limit: string;
  payment_order_timeout_minutes: string;
  payment_max_pending_orders: string;
  payment_enabled_types: string[];
  payment_balance_disabled: boolean;
  payment_balance_recharge_multiplier: string;
  payment_recharge_fee_rate: string;
  payment_load_balance_strategy: string;
  payment_product_name_prefix: string;
  payment_product_name_suffix: string;
  payment_help_image_url: string;
  payment_help_text: string;
  payment_cancel_rate_limit_enabled: boolean;
  payment_cancel_rate_limit_max: string;
  payment_cancel_rate_limit_window: string;
  payment_cancel_rate_limit_unit: string;
  payment_cancel_rate_limit_window_mode: string;
  balance_low_notify_enabled: boolean;
  balance_low_notify_threshold: string;
  balance_low_notify_recharge_url: string;
  account_quota_notify_enabled: boolean;
  affiliate_auto_settlement_enabled: boolean;
  affiliate_manual_payout_settlement_enabled: boolean;
  test_email_target: string;
};

type ProviderFormState = {
  provider_key: string;
  name: string;
  supported_types: string[];
  enabled: boolean;
  payment_mode: string;
  refund_enabled: boolean;
  allow_user_refund: boolean;
  config: Record<string, string>;
  limits: string;
  notify_base_url: string;
  return_base_url: string;
};

const PAYMENT_TYPES = [
  { value: 'alipay', label: '支付宝' },
  { value: 'wxpay', label: '微信支付' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'alipay_direct', label: '支付宝直连' },
  { value: 'wxpay_direct', label: '微信直连' },
  { value: 'easypay', label: 'EasyPay' },
];

const PROVIDER_KEY_OPTIONS: PaymentProviderOption[] = [
  { value: 'easypay', label: 'EasyPay' },
  { value: 'alipay', label: '支付宝' },
  { value: 'wxpay', label: '微信支付' },
  { value: 'stripe', label: 'Stripe' },
];

function buildEmptyProviderForm(providerKey = 'easypay'): ProviderFormState {
  const configDefaults = Object.fromEntries(
    (PROVIDER_CONFIG_FIELDS[providerKey] || [])
      .filter((field) => field.defaultValue)
      .map((field) => [field.key, field.defaultValue || ''])
  );

  return {
    provider_key: providerKey,
    name: '',
    supported_types: [...(PROVIDER_SUPPORTED_TYPES[providerKey] || [])],
    enabled: true,
    payment_mode: providerKey === 'easypay' ? PAYMENT_MODE_QRCODE : '',
    refund_enabled: false,
    allow_user_refund: false,
    config: configDefaults,
    limits: '',
    notify_base_url: '',
    return_base_url: '',
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function parseNumberList(text: string) {
  return text
    .split(/[,\n]/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function parseStringList(text: string) {
  return text
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildForm(settings: SystemSettings): SettingsForm {
  return {
    registration_enabled: Boolean(settings.registration_enabled),
    email_verify_enabled: Boolean(settings.email_verify_enabled),
    promo_code_enabled: Boolean(settings.promo_code_enabled),
    password_reset_enabled: Boolean(settings.password_reset_enabled),
    invitation_code_enabled: Boolean(settings.invitation_code_enabled),
    totp_enabled: Boolean(settings.totp_enabled),
    frontend_url: String(settings.frontend_url || ''),
    registration_email_suffix_whitelist_text: (settings.registration_email_suffix_whitelist || []).join('\n'),
    site_name: String(settings.site_name || ''),
    site_logo: String(settings.site_logo || ''),
    site_subtitle: String(settings.site_subtitle || ''),
    api_base_url: String(settings.api_base_url || ''),
    contact_info: String(settings.contact_info || ''),
    doc_url: String(settings.doc_url || ''),
    home_content: String(settings.home_content || ''),
    hide_ccs_import_button: Boolean(settings.hide_ccs_import_button),
    purchase_subscription_enabled: Boolean(settings.purchase_subscription_enabled),
    purchase_subscription_url: String(settings.purchase_subscription_url || ''),
    table_default_page_size: String(settings.table_default_page_size ?? 20),
    table_page_size_options_text: (settings.table_page_size_options || []).join(', '),
    smtp_host: String(settings.smtp_host || ''),
    smtp_port: String(settings.smtp_port ?? 587),
    smtp_username: String(settings.smtp_username || ''),
    smtp_password: '',
    smtp_from_email: String(settings.smtp_from_email || ''),
    smtp_from_name: String(settings.smtp_from_name || ''),
    smtp_use_tls: Boolean(settings.smtp_use_tls),
    default_concurrency: String(settings.default_concurrency ?? 1),
    default_balance: String(settings.default_balance ?? 0),
    default_subscriptions: Array.isArray(settings.default_subscriptions) ? settings.default_subscriptions : [],
    enable_model_fallback: Boolean(settings.enable_model_fallback),
    fallback_model_anthropic: String(settings.fallback_model_anthropic || ''),
    fallback_model_openai: String(settings.fallback_model_openai || ''),
    fallback_model_gemini: String(settings.fallback_model_gemini || ''),
    fallback_model_antigravity: String(settings.fallback_model_antigravity || ''),
    enable_identity_patch: Boolean(settings.enable_identity_patch),
    identity_patch_prompt: String(settings.identity_patch_prompt || ''),
    allow_ungrouped_key_scheduling: Boolean(settings.allow_ungrouped_key_scheduling),
    backend_mode_enabled: Boolean(settings.backend_mode_enabled),
    enable_fingerprint_unification: Boolean(settings.enable_fingerprint_unification),
    enable_metadata_passthrough: Boolean(settings.enable_metadata_passthrough),
    enable_cch_signing: Boolean(settings.enable_cch_signing),
    web_search_emulation_enabled: Boolean(settings.web_search_emulation_enabled),
    payment_enabled: Boolean(settings.payment_enabled),
    payment_min_amount: String(settings.payment_min_amount ?? 1),
    payment_max_amount: String(settings.payment_max_amount ?? 0),
    payment_daily_limit: String(settings.payment_daily_limit ?? 0),
    payment_order_timeout_minutes: String(settings.payment_order_timeout_minutes ?? 30),
    payment_max_pending_orders: String(settings.payment_max_pending_orders ?? 3),
    payment_enabled_types: Array.isArray(settings.payment_enabled_types) ? settings.payment_enabled_types : [],
    payment_balance_disabled: Boolean(settings.payment_balance_disabled),
    payment_balance_recharge_multiplier: String(settings.payment_balance_recharge_multiplier ?? 1),
    payment_recharge_fee_rate: String(settings.payment_recharge_fee_rate ?? 0),
    payment_load_balance_strategy: String(settings.payment_load_balance_strategy || 'random'),
    payment_product_name_prefix: String(settings.payment_product_name_prefix || ''),
    payment_product_name_suffix: String(settings.payment_product_name_suffix || ''),
    payment_help_image_url: String(settings.payment_help_image_url || ''),
    payment_help_text: String(settings.payment_help_text || ''),
    payment_cancel_rate_limit_enabled: Boolean(settings.payment_cancel_rate_limit_enabled),
    payment_cancel_rate_limit_max: String(settings.payment_cancel_rate_limit_max ?? 3),
    payment_cancel_rate_limit_window: String(settings.payment_cancel_rate_limit_window ?? 24),
    payment_cancel_rate_limit_unit: String(settings.payment_cancel_rate_limit_unit || 'hour'),
    payment_cancel_rate_limit_window_mode: String(settings.payment_cancel_rate_limit_window_mode || 'rolling'),
    balance_low_notify_enabled: Boolean(settings.balance_low_notify_enabled),
    balance_low_notify_threshold: String(settings.balance_low_notify_threshold ?? 0),
    balance_low_notify_recharge_url: String(settings.balance_low_notify_recharge_url || ''),
    account_quota_notify_enabled: Boolean(settings.account_quota_notify_enabled),
    affiliate_auto_settlement_enabled: Boolean(settings.affiliate_auto_settlement_enabled),
    affiliate_manual_payout_settlement_enabled: Boolean(settings.affiliate_manual_payout_settlement_enabled ?? true),
    test_email_target: '',
  };
}

function SummaryCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">{children}</label>;
}

function ModalShell({
  open,
  title,
  onClose,
  maxWidth = 'max-w-3xl',
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  maxWidth?: string;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div className={`max-h-[92vh] w-full ${maxWidth} overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-[#111111]`}>
        <div className="flex items-center justify-between border-b border-gray-200 px-7 py-6 dark:border-gray-800">
          <h3 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[calc(92vh-88px)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [providers, setProviders] = useState<AdminPaymentProviderInstance[]>([]);
  const [apiKeyStatus, setApiKeyStatus] = useState<AdminAPIKeyStatus | null>(null);
  const [generatedApiKey, setGeneratedApiKey] = useState('');
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerDeletingId, setProviderDeletingId] = useState<number | null>(null);
  const [smtpTesting, setSMTPTesting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [apiKeyBusy, setAPIKeyBusy] = useState(false);
  const [showProviderDialog, setShowProviderDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AdminPaymentProviderInstance | null>(null);
  const [providerForm, setProviderForm] = useState<ProviderFormState>(() => buildEmptyProviderForm());
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadSettingsData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [settingsResult, groupsResult, apiKeyResult] = await Promise.all([
        getAdminSettings(),
        listAdminGroups({ page: 1, page_size: 200 }),
        getAdminAPIKeyStatus(),
      ]);
      setSettings(settingsResult);
      setGroups(groupsResult.items);
      setApiKeyStatus(apiKeyResult);
      setForm(buildForm(settingsResult));
    } catch (error: unknown) {
      setError(getErrorMessage(error, t('admin.settings.messages.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true);
    try {
      const result = await listAdminPaymentProviders();
      setProviders(result);
    } catch (providerError: unknown) {
      setError(getErrorMessage(providerError, t('admin.settings.messages.providersLoadFailed')));
    } finally {
      setProvidersLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSettingsData();
      void loadProviders();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProviders, loadSettingsData]);

  const groupMap = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const enabledProviderKeyOptions = useMemo(
    () => PROVIDER_KEY_OPTIONS.filter((option) => form?.payment_enabled_types.includes(option.value)),
    [form?.payment_enabled_types]
  );
  const providerTypeOptions = useMemo<PaymentProviderOption[]>(
    () => [
      { value: 'alipay', label: '支付宝' },
      { value: 'wxpay', label: '微信支付' },
      { value: 'card', label: '银行卡' },
      { value: 'link', label: 'Link' },
    ],
    []
  );
  const currentProviderFields = useMemo(
    () => PROVIDER_CONFIG_FIELDS[providerForm.provider_key] || [],
    [providerForm.provider_key]
  );
  const currentProviderTypeOptions = useMemo(
    () => getProviderTypeOptions(providerForm.provider_key, providerTypeOptions),
    [providerForm.provider_key, providerTypeOptions]
  );
  const currentProviderCallbackPaths = useMemo(
    () => PROVIDER_CALLBACK_PATHS[providerForm.provider_key] || null,
    [providerForm.provider_key]
  );
  const currentProviderWebhookUrl = useMemo(() => {
    if (providerForm.provider_key !== 'stripe' || typeof window === 'undefined') {
      return '';
    }
    return `${window.location.origin}${PROVIDER_WEBHOOK_PATHS.stripe}`;
  }, [providerForm.provider_key]);

  const summary = useMemo(() => {
    if (!form || !settings) return [];
    return [
      {
        label: t('admin.settings.summary.registration'),
        value: form.registration_enabled ? t('admin.settings.summary.enabled') : t('admin.settings.summary.disabled'),
      },
      {
        label: t('admin.settings.summary.emailVerify'),
        value: form.email_verify_enabled ? t('admin.settings.summary.enabled') : t('admin.settings.summary.disabled'),
      },
      {
        label: t('admin.settings.summary.payment'),
        value: form.payment_enabled ? t('admin.settings.summary.enabled') : t('admin.settings.summary.disabled'),
      },
      { label: t('admin.settings.summary.paymentTypes'), value: form.payment_enabled_types.join(' / ') || t('admin.settings.summary.notConfigured') },
      { label: t('admin.settings.summary.siteName'), value: form.site_name || t('admin.settings.summary.notSet') },
      { label: t('admin.settings.summary.defaultConcurrency'), value: form.default_concurrency || '1' },
      {
        label: t('admin.settings.summary.smtpPassword'),
        value: settings.smtp_password_configured ? t('admin.settings.summary.configured') : t('admin.settings.summary.notConfigured'),
      },
      {
        label: t('admin.settings.summary.adminApiKey'),
        value: apiKeyStatus?.exists ? apiKeyStatus.masked_key || t('admin.settings.summary.existed') : t('admin.settings.summary.notGenerated'),
      },
    ];
  }, [apiKeyStatus, form, settings, t]);

  const updateForm = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const setProviderFormField = <K extends keyof ProviderFormState>(key: K, value: ProviderFormState[K]) => {
    setProviderForm((prev) => ({ ...prev, [key]: value }));
  };

  const togglePaymentType = (value: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const exists = prev.payment_enabled_types.includes(value);
      return {
        ...prev,
        payment_enabled_types: exists
          ? prev.payment_enabled_types.filter((item) => item !== value)
          : [...prev.payment_enabled_types, value],
      };
    });
  };

  const disableProvidersByType = useCallback(
    async (providerKey: string) => {
      const matching = providers.filter((provider) => provider.provider_key === providerKey && provider.enabled);
      for (const provider of matching) {
        await updateAdminPaymentProvider(provider.id, { enabled: false });
      }
      if (matching.length > 0) {
        await loadProviders();
      }
    },
    [loadProviders, providers]
  );

  const handleTogglePaymentType = async (value: string) => {
    const exists = form?.payment_enabled_types.includes(value);
    togglePaymentType(value);
    if (exists) {
      try {
        await disableProvidersByType(value);
      } catch (providerError: unknown) {
        setError(getErrorMessage(providerError, t('admin.settings.messages.disableProviderFailed')));
      }
    }
  };

  const resetProviderForm = useCallback(
    (providerKey?: string) => {
      const nextKey = providerKey || enabledProviderKeyOptions[0]?.value || PROVIDER_KEY_OPTIONS[0].value;
      setProviderForm(buildEmptyProviderForm(nextKey));
      setEditingProvider(null);
    },
    [enabledProviderKeyOptions]
  );

  const syncProviderFormForKey = useCallback((providerKey: string) => {
    setProviderForm((prev) => {
      const nextConfig = Object.fromEntries(
        (PROVIDER_CONFIG_FIELDS[providerKey] || []).map((field) => [field.key, prev.config[field.key] || field.defaultValue || ''])
      );
      return {
        ...prev,
        provider_key: providerKey,
        supported_types: [...(PROVIDER_SUPPORTED_TYPES[providerKey] || [])],
        payment_mode: providerKey === 'easypay' ? prev.payment_mode || PAYMENT_MODE_QRCODE : '',
        config: nextConfig,
        notify_base_url: '',
        return_base_url: '',
      };
    });
  }, []);

  const openCreateProviderDialog = () => {
    resetProviderForm();
    setShowProviderDialog(true);
  };

  const openEditProviderDialog = (provider: AdminPaymentProviderInstance) => {
    const callbackPaths = PROVIDER_CALLBACK_PATHS[provider.provider_key] || null;
    setEditingProvider(provider);
    setProviderForm({
      provider_key: provider.provider_key,
      name: provider.name,
      supported_types: provider.supported_types || [],
      enabled: provider.enabled,
      payment_mode: provider.payment_mode || (provider.provider_key === 'easypay' ? PAYMENT_MODE_QRCODE : ''),
      refund_enabled: provider.refund_enabled,
      allow_user_refund: provider.allow_user_refund,
      config: Object.fromEntries(
        Object.entries(provider.config || {}).filter(([key]) => key !== 'notifyUrl' && key !== 'returnUrl')
      ),
      limits: provider.limits || '',
      notify_base_url:
        callbackPaths?.notifyUrl && provider.config?.notifyUrl
          ? extractBaseUrl(provider.config.notifyUrl, callbackPaths.notifyUrl)
          : '',
      return_base_url:
        callbackPaths?.returnUrl && provider.config?.returnUrl
          ? extractBaseUrl(provider.config.returnUrl, callbackPaths.returnUrl)
          : '',
    });
    setShowProviderDialog(true);
  };

  const handleSaveProvider = async () => {
    const providerFields = PROVIDER_CONFIG_FIELDS[providerForm.provider_key] || [];
    if (!providerForm.name.trim()) {
      setError(t('admin.settings.messages.providerNameRequired'));
      return;
    }

    for (const field of providerFields) {
      if (field.optional) continue;
      const value = providerForm.config[field.key]?.trim();
      if (!value) {
        setError(t('admin.settings.messages.providerFieldRequired', { field: field.label }));
        return;
      }
    }

    const config: Record<string, string> = {};
    for (const [key, value] of Object.entries(providerForm.config)) {
      const trimmed = value.trim();
      if (!trimmed || trimmed === '••••••••') continue;
      config[key] = trimmed;
    }

    const callbackPaths = PROVIDER_CALLBACK_PATHS[providerForm.provider_key] || null;
    if (callbackPaths?.notifyUrl) {
      const notifyBase = providerForm.notify_base_url.trim() || (typeof window !== 'undefined' ? window.location.origin : '');
      if (!notifyBase) {
        setError(t('admin.settings.messages.notifyBaseUrlRequired'));
        return;
      }
      config.notifyUrl = `${notifyBase}${callbackPaths.notifyUrl}`;
    }
    if (callbackPaths?.returnUrl) {
      const returnBase = providerForm.return_base_url.trim() || (typeof window !== 'undefined' ? window.location.origin : '');
      if (!returnBase) {
        setError(t('admin.settings.messages.returnBaseUrlRequired'));
        return;
      }
      config.returnUrl = `${returnBase}${callbackPaths.returnUrl}`;
    }

    const payload: AdminCreatePaymentProviderPayload = {
      provider_key: providerForm.provider_key,
      name: providerForm.name.trim(),
      supported_types: providerForm.supported_types,
      enabled: providerForm.enabled,
      payment_mode: providerForm.provider_key === 'easypay' ? providerForm.payment_mode || PAYMENT_MODE_QRCODE : '',
      refund_enabled: providerForm.refund_enabled,
      allow_user_refund: providerForm.refund_enabled ? providerForm.allow_user_refund : false,
      config,
      limits: providerForm.limits.trim(),
    };

    setProviderSaving(true);
    setError('');
    setSuccess('');
    try {
      if (editingProvider) {
        await updateAdminPaymentProvider(editingProvider.id, payload);
      } else {
        await createAdminPaymentProvider(payload);
      }
      await loadProviders();
      setShowProviderDialog(false);
      resetProviderForm();
      setSuccess(t(editingProvider ? 'admin.settings.messages.providerUpdated' : 'admin.settings.messages.providerCreated'));
    } catch (providerError: unknown) {
      setError(
        getErrorMessage(
          providerError,
          t(editingProvider ? 'admin.settings.messages.providerUpdateFailed' : 'admin.settings.messages.providerCreateFailed')
        )
      );
    } finally {
      setProviderSaving(false);
    }
  };

  const handleDeleteProvider = async (provider: AdminPaymentProviderInstance) => {
    const confirmed = window.confirm(t('admin.settings.messages.providerDeleteConfirm', { name: provider.name }));
    if (!confirmed) return;

    setProviderDeletingId(provider.id);
    setError('');
    setSuccess('');
    try {
      await deleteAdminPaymentProvider(provider.id);
      await loadProviders();
      setSuccess(t('admin.settings.messages.providerDeleted'));
    } catch (providerError: unknown) {
      setError(getErrorMessage(providerError, t('admin.settings.messages.providerDeleteFailed')));
    } finally {
      setProviderDeletingId(null);
    }
  };

  const addDefaultSubscription = () => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            default_subscriptions: [...prev.default_subscriptions, { group_id: 0, validity_days: 30 }],
          }
        : prev
    );
  };

  const updateDefaultSubscription = (index: number, patch: Partial<DefaultSubscriptionSetting>) => {
    setForm((prev) => {
      if (!prev) return prev;
      const next = [...prev.default_subscriptions];
      next[index] = { ...next[index], ...patch };
      return { ...prev, default_subscriptions: next };
    });
  };

  const removeDefaultSubscription = (index: number) => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            default_subscriptions: prev.default_subscriptions.filter((_, idx) => idx !== index),
          }
        : prev
    );
  };

  const handleSave = async () => {
    if (!form || !settings) return;

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload: Record<string, unknown> = {
        ...settings,
        registration_enabled: form.registration_enabled,
        email_verify_enabled: form.email_verify_enabled,
        promo_code_enabled: form.promo_code_enabled,
        password_reset_enabled: form.password_reset_enabled,
        invitation_code_enabled: form.invitation_code_enabled,
        totp_enabled: form.totp_enabled,
        frontend_url: form.frontend_url.trim(),
        registration_email_suffix_whitelist: parseStringList(form.registration_email_suffix_whitelist_text),
        site_name: form.site_name.trim(),
        site_logo: form.site_logo.trim(),
        site_subtitle: form.site_subtitle.trim(),
        api_base_url: form.api_base_url.trim(),
        contact_info: form.contact_info.trim(),
        doc_url: form.doc_url.trim(),
        home_content: form.home_content,
        hide_ccs_import_button: form.hide_ccs_import_button,
        purchase_subscription_enabled: form.purchase_subscription_enabled,
        purchase_subscription_url: form.purchase_subscription_url.trim(),
        table_default_page_size: Number(form.table_default_page_size || 20),
        table_page_size_options: parseNumberList(form.table_page_size_options_text),
        smtp_host: form.smtp_host.trim(),
        smtp_port: Number(form.smtp_port || 587),
        smtp_username: form.smtp_username.trim(),
        smtp_password: form.smtp_password.trim(),
        smtp_from_email: form.smtp_from_email.trim(),
        smtp_from_name: form.smtp_from_name.trim(),
        smtp_use_tls: form.smtp_use_tls,
        default_concurrency: Number(form.default_concurrency || 1),
        default_balance: Number(form.default_balance || 0),
        default_subscriptions: form.default_subscriptions.filter((item) => item.group_id > 0 && item.validity_days > 0),
        enable_model_fallback: form.enable_model_fallback,
        fallback_model_anthropic: form.fallback_model_anthropic.trim(),
        fallback_model_openai: form.fallback_model_openai.trim(),
        fallback_model_gemini: form.fallback_model_gemini.trim(),
        fallback_model_antigravity: form.fallback_model_antigravity.trim(),
        enable_identity_patch: form.enable_identity_patch,
        identity_patch_prompt: form.identity_patch_prompt,
        allow_ungrouped_key_scheduling: form.allow_ungrouped_key_scheduling,
        backend_mode_enabled: form.backend_mode_enabled,
        enable_fingerprint_unification: form.enable_fingerprint_unification,
        enable_metadata_passthrough: form.enable_metadata_passthrough,
        enable_cch_signing: form.enable_cch_signing,
        web_search_emulation_enabled: form.web_search_emulation_enabled,
        payment_enabled: form.payment_enabled,
        payment_min_amount: Number(form.payment_min_amount || 0),
        payment_max_amount: Number(form.payment_max_amount || 0),
        payment_daily_limit: Number(form.payment_daily_limit || 0),
        payment_order_timeout_minutes: Number(form.payment_order_timeout_minutes || 30),
        payment_max_pending_orders: Number(form.payment_max_pending_orders || 3),
        payment_enabled_types: form.payment_enabled_types,
        payment_balance_disabled: form.payment_balance_disabled,
        payment_balance_recharge_multiplier: Number(form.payment_balance_recharge_multiplier || 1),
        payment_recharge_fee_rate: Number(form.payment_recharge_fee_rate || 0),
        payment_load_balance_strategy: form.payment_load_balance_strategy.trim(),
        payment_product_name_prefix: form.payment_product_name_prefix,
        payment_product_name_suffix: form.payment_product_name_suffix,
        payment_help_image_url: form.payment_help_image_url.trim(),
        payment_help_text: form.payment_help_text,
        payment_cancel_rate_limit_enabled: form.payment_cancel_rate_limit_enabled,
        payment_cancel_rate_limit_max: Number(form.payment_cancel_rate_limit_max || 0),
        payment_cancel_rate_limit_window: Number(form.payment_cancel_rate_limit_window || 0),
        payment_cancel_rate_limit_unit: form.payment_cancel_rate_limit_unit.trim(),
        payment_cancel_rate_limit_window_mode: form.payment_cancel_rate_limit_window_mode.trim(),
        balance_low_notify_enabled: form.balance_low_notify_enabled,
        balance_low_notify_threshold: Number(form.balance_low_notify_threshold || 0),
        balance_low_notify_recharge_url: form.balance_low_notify_recharge_url.trim(),
        account_quota_notify_enabled: form.account_quota_notify_enabled,
        affiliate_auto_settlement_enabled: form.affiliate_auto_settlement_enabled,
        affiliate_manual_payout_settlement_enabled: form.affiliate_manual_payout_settlement_enabled,
      };

      const updated = await updateAdminSettings(payload);
      setSettings(updated);
      setForm(buildForm(updated));
      setSuccess(t('admin.settings.messages.saveSuccess'));
    } catch (error: unknown) {
      setError(getErrorMessage(error, t('admin.settings.messages.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const handleTestSMTP = async () => {
    if (!form) return;
    setSMTPTesting(true);
    setError('');
    setSuccess('');
    try {
      const result = await testAdminSMTPConnection({
        smtp_host: form.smtp_host.trim(),
        smtp_port: Number(form.smtp_port || 587),
        smtp_username: form.smtp_username.trim(),
        smtp_password: form.smtp_password.trim(),
        smtp_use_tls: form.smtp_use_tls,
      });
      setSuccess(result.message || t('admin.settings.messages.smtpTestSuccess'));
    } catch (error: unknown) {
      setError(getErrorMessage(error, t('admin.settings.messages.smtpTestFailed')));
    } finally {
      setSMTPTesting(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!form) return;
    setSendingEmail(true);
    setError('');
    setSuccess('');
    try {
      const result = await sendAdminTestEmail({
        email: form.test_email_target.trim(),
        smtp_host: form.smtp_host.trim(),
        smtp_port: Number(form.smtp_port || 587),
        smtp_username: form.smtp_username.trim(),
        smtp_password: form.smtp_password.trim(),
        smtp_from_email: form.smtp_from_email.trim(),
        smtp_from_name: form.smtp_from_name.trim(),
        smtp_use_tls: form.smtp_use_tls,
      });
      setSuccess(result.message || t('admin.settings.messages.testMailSent'));
    } catch (error: unknown) {
      setError(getErrorMessage(error, t('admin.settings.messages.testMailFailed')));
    } finally {
      setSendingEmail(false);
    }
  };

  const handleRegenerateAPIKey = async () => {
    setAPIKeyBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await regenerateAdminAPIKey();
      const status = await getAdminAPIKeyStatus();
      setApiKeyStatus(status);
      setGeneratedApiKey(result.key || '');
      setSuccess(t('admin.settings.messages.apiKeyRegenerated'));
    } catch (error: unknown) {
      setError(getErrorMessage(error, t('admin.settings.messages.apiKeyGenerateFailed')));
    } finally {
      setAPIKeyBusy(false);
    }
  };

  const handleDeleteAPIKey = async () => {
    const confirmed = window.confirm(t('admin.settings.messages.apiKeyDeleteConfirm'));
    if (!confirmed) return;
    setAPIKeyBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await deleteAdminAPIKey();
      setApiKeyStatus({ exists: false });
      setGeneratedApiKey('');
      setSuccess(result.message || t('admin.settings.messages.apiKeyDeleted'));
    } catch (error: unknown) {
      setError(getErrorMessage(error, t('admin.settings.messages.apiKeyDeleteFailed')));
    } finally {
      setAPIKeyBusy(false);
    }
  };

  if (!form) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A] dark:text-gray-400">
        {loading ? t('admin.settings.loading') : t('admin.settings.unavailable')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('admin.settings.title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('admin.settings.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? t('admin.settings.saving') : t('admin.settings.save')}
        </button>
      </div>

      {(error || success) && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            error
              ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
              : 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
          }`}
        >
          {error || success}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]"
          >
            <div className="text-sm text-gray-500 dark:text-gray-400">{item.label}</div>
            <div className="mt-3 break-all text-base font-semibold text-gray-900 dark:text-white">{item.value}</div>
          </div>
        ))}
      </div>

      <SummaryCard title={t('admin.settings.sections.registrationSecurity')}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.registration_enabled}
              onChange={(e) => updateForm('registration_enabled', e.target.checked)}
            />
            开启注册
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.email_verify_enabled}
              onChange={(e) => updateForm('email_verify_enabled', e.target.checked)}
            />
            开启邮箱验证
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.password_reset_enabled}
              onChange={(e) => updateForm('password_reset_enabled', e.target.checked)}
            />
            开启密码重置
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.promo_code_enabled}
              onChange={(e) => updateForm('promo_code_enabled', e.target.checked)}
            />
            开启折扣码
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.invitation_code_enabled}
              onChange={(e) => updateForm('invitation_code_enabled', e.target.checked)}
            />
            开启邀请码
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.totp_enabled}
              onChange={(e) => updateForm('totp_enabled', e.target.checked)}
            />
            开启双因素认证
          </label>
        </div>
        <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-900/40 dark:text-gray-300">
          TOTP 加密密钥状态：{settings?.totp_encryption_key_configured ? '已配置' : '未配置'}
        </div>
        <div>
          <FieldLabel>前端地址</FieldLabel>
          <input
            value={form.frontend_url}
            onChange={(e) => updateForm('frontend_url', e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
        </div>
        <div>
          <FieldLabel>注册邮箱后缀白名单</FieldLabel>
          <textarea
            rows={4}
            value={form.registration_email_suffix_whitelist_text}
            onChange={(e) => updateForm('registration_email_suffix_whitelist_text', e.target.value)}
            placeholder={'每行一个域名，例如：\nqq.com\ngmail.com'}
            className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
        </div>
      </SummaryCard>

      <SummaryCard title={t('admin.settings.sections.siteInfo')}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel>站点名称</FieldLabel>
            <input
              value={form.site_name}
              onChange={(e) => updateForm('site_name', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>站点副标题</FieldLabel>
            <input
              value={form.site_subtitle}
              onChange={(e) => updateForm('site_subtitle', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>站点 Logo</FieldLabel>
            <input
              value={form.site_logo}
              onChange={(e) => updateForm('site_logo', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>API Base URL</FieldLabel>
            <input
              value={form.api_base_url}
              onChange={(e) => updateForm('api_base_url', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>文档地址</FieldLabel>
            <input
              value={form.doc_url}
              onChange={(e) => updateForm('doc_url', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>联系方式</FieldLabel>
            <input
              value={form.contact_info}
              onChange={(e) => updateForm('contact_info', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>默认分页大小</FieldLabel>
            <input
              type="number"
              value={form.table_default_page_size}
              onChange={(e) => updateForm('table_default_page_size', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>分页选项</FieldLabel>
            <input
              value={form.table_page_size_options_text}
              onChange={(e) => updateForm('table_page_size_options_text', e.target.value)}
              placeholder="例如：10,20,50,100"
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
        </div>
        <div>
          <FieldLabel>首页内容</FieldLabel>
          <textarea
            rows={5}
            value={form.home_content}
            onChange={(e) => updateForm('home_content', e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.hide_ccs_import_button}
              onChange={(e) => updateForm('hide_ccs_import_button', e.target.checked)}
            />
            隐藏 CCS 导入按钮
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.purchase_subscription_enabled}
              onChange={(e) => updateForm('purchase_subscription_enabled', e.target.checked)}
            />
            开启订阅购买入口
          </label>
        </div>
        <div>
          <FieldLabel>订阅购买地址</FieldLabel>
          <input
            value={form.purchase_subscription_url}
            onChange={(e) => updateForm('purchase_subscription_url', e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
        </div>
      </SummaryCard>

      <SummaryCard title={t('admin.settings.sections.smtpMail')}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel>SMTP Host</FieldLabel>
            <input
              value={form.smtp_host}
              onChange={(e) => updateForm('smtp_host', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>SMTP Port</FieldLabel>
            <input
              type="number"
              value={form.smtp_port}
              onChange={(e) => updateForm('smtp_port', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>SMTP 用户名</FieldLabel>
            <input
              value={form.smtp_username}
              onChange={(e) => updateForm('smtp_username', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>SMTP 密码</FieldLabel>
            <input
              type="password"
              value={form.smtp_password}
              onChange={(e) => updateForm('smtp_password', e.target.value)}
              placeholder={settings?.smtp_password_configured ? '留空则保留原密码' : ''}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>发件邮箱</FieldLabel>
            <input
              value={form.smtp_from_email}
              onChange={(e) => updateForm('smtp_from_email', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>发件人名称</FieldLabel>
            <input
              value={form.smtp_from_name}
              onChange={(e) => updateForm('smtp_from_name', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={form.smtp_use_tls}
            onChange={(e) => updateForm('smtp_use_tls', e.target.checked)}
          />
          使用 TLS
        </label>
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
          <input
            value={form.test_email_target}
            onChange={(e) => updateForm('test_email_target', e.target.value)}
            placeholder="测试邮件接收地址"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <button
            type="button"
            onClick={() => void handleTestSMTP()}
            disabled={smtpTesting}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {smtpTesting ? '测试中' : '测试 SMTP'}
          </button>
          <button
            type="button"
            onClick={() => void handleSendTestEmail()}
            disabled={sendingEmail}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60 dark:bg-white dark:text-gray-900"
          >
            {sendingEmail ? '发送中' : '发送测试邮件'}
          </button>
        </div>
      </SummaryCard>

      <SummaryCard title={t('admin.settings.sections.defaultUser')}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel>默认并发</FieldLabel>
            <input
              type="number"
              min="1"
              value={form.default_concurrency}
              onChange={(e) => updateForm('default_concurrency', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>默认余额</FieldLabel>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.default_balance}
              onChange={(e) => updateForm('default_balance', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <FieldLabel>默认订阅</FieldLabel>
            <button
              type="button"
              onClick={addDefaultSubscription}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              添加默认订阅
            </button>
          </div>
          {form.default_subscriptions.length === 0 ? (
            <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
              当前未配置默认订阅。
            </div>
          ) : (
            form.default_subscriptions.map((item, index) => (
              <div key={`${item.group_id}-${index}`} className="grid gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 md:grid-cols-[1fr_140px_auto]">
                <select
                  value={item.group_id}
                  onChange={(e) => updateDefaultSubscription(index, { group_id: Number(e.target.value) })}
                  className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                >
                  <option value={0}>选择分组</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name} {group.platform ? `(${group.platform})` : ''}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={item.validity_days}
                  onChange={(e) => updateDefaultSubscription(index, { validity_days: Number(e.target.value) })}
                  className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => removeDefaultSubscription(index)}
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
                >
                  删除
                </button>
                {item.group_id > 0 && groupMap.get(item.group_id) && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 md:col-span-3">
                    当前分组：{groupMap.get(item.group_id)?.name}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </SummaryCard>

      <SummaryCard title={t('admin.settings.sections.paymentBasic')}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.payment_enabled}
              onChange={(e) => updateForm('payment_enabled', e.target.checked)}
            />
            开启支付系统
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.payment_balance_disabled}
              onChange={(e) => updateForm('payment_balance_disabled', e.target.checked)}
            />
            禁用余额支付
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <FieldLabel>最低充值金额</FieldLabel>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.payment_min_amount}
              onChange={(e) => updateForm('payment_min_amount', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>最高充值金额</FieldLabel>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.payment_max_amount}
              onChange={(e) => updateForm('payment_max_amount', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>每日限额</FieldLabel>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.payment_daily_limit}
              onChange={(e) => updateForm('payment_daily_limit', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>订单超时分钟</FieldLabel>
            <input
              type="number"
              min="1"
              value={form.payment_order_timeout_minutes}
              onChange={(e) => updateForm('payment_order_timeout_minutes', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>最大待支付订单</FieldLabel>
            <input
              type="number"
              min="0"
              value={form.payment_max_pending_orders}
              onChange={(e) => updateForm('payment_max_pending_orders', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>余额充值倍率</FieldLabel>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.payment_balance_recharge_multiplier}
              onChange={(e) => updateForm('payment_balance_recharge_multiplier', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>充值手续费率</FieldLabel>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.payment_recharge_fee_rate}
              onChange={(e) => updateForm('payment_recharge_fee_rate', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>负载均衡策略</FieldLabel>
            <input
              value={form.payment_load_balance_strategy}
              onChange={(e) => updateForm('payment_load_balance_strategy', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
        </div>
        <div>
          <FieldLabel>可用支付方式</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_TYPES.map((item) => {
              const enabled = form.payment_enabled_types.includes(item.value);
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => void handleTogglePaymentType(item.value)}
                  className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                    enabled
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">服务商管理</div>
              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">管理支付服务商实例，新增后即可承载对应支付方式。</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadProviders()}
                disabled={providersLoading}
                className="inline-flex items-center rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${providersLoading ? 'animate-spin' : ''}`} />
                刷新
              </button>
              <button
                type="button"
                onClick={openCreateProviderDialog}
                disabled={enabledProviderKeyOptions.length === 0}
                className="inline-flex items-center rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
              >
                <Plus className="mr-2 h-4 w-4" />
                添加服务商
              </button>
            </div>
          </div>

          {enabledProviderKeyOptions.length === 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
              请先启用至少一种支付方式，再添加对应服务商。
            </div>
          ) : null}

          {providersLoading ? (
            <div className="mt-4 flex items-center justify-center rounded-2xl border border-dashed border-gray-200 px-6 py-12 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在加载支付服务商...
            </div>
          ) : providers.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-gray-200 px-6 py-12 text-center dark:border-gray-700">
              <div className="text-base font-medium text-gray-900 dark:text-white">暂无服务商实例</div>
              <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">启用服务商标识后，可在这里新增 EasyPay、支付宝、微信支付或 Stripe 实例。</div>
              <button
                type="button"
                onClick={openCreateProviderDialog}
                disabled={enabledProviderKeyOptions.length === 0}
                className="mt-5 inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
              >
                <Plus className="mr-2 h-4 w-4" />
                添加服务商
              </button>
            </div>
          ) : (
            <div className="mt-4 grid gap-4">
              {providers.map((provider) => (
                <div key={provider.id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-gray-900 dark:text-white">{provider.name}</div>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          {PROVIDER_KEY_OPTIONS.find((option) => option.value === provider.provider_key)?.label || provider.provider_key}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs ${
                            provider.enabled
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                          }`}
                        >
                          {provider.enabled ? '已启用' : '已停用'}
                        </span>
                        {provider.refund_enabled ? (
                          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                            支持退款{provider.allow_user_refund ? ' / 用户可发起' : ''}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        支持方式：{provider.supported_types?.join(' / ') || '未配置'}
                        {provider.payment_mode ? ` | 模式：${provider.payment_mode}` : ''}
                        {typeof provider.sort_order === 'number' ? ` | 排序：${provider.sort_order}` : ''}
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {Object.entries(provider.config || {}).map(([key, value]) => (
                          <div key={key} className="rounded-xl bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900/40">
                            <div className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">{key}</div>
                            <div className="mt-1 break-all font-mono text-gray-700 dark:text-gray-200">{value || '-'}</div>
                          </div>
                        ))}
                      </div>
                      {provider.limits ? (
                        <div className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:bg-gray-900/40 dark:text-gray-300">
                          限额配置：<code className="break-all font-mono">{provider.limits}</code>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditProviderDialog(provider)}
                        className="inline-flex items-center rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteProvider(provider)}
                        disabled={providerDeletingId === provider.id}
                        className="inline-flex items-center rounded-xl bg-red-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-60"
                      >
                        {providerDeletingId === provider.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel>商品名前缀</FieldLabel>
            <input
              value={form.payment_product_name_prefix}
              onChange={(e) => updateForm('payment_product_name_prefix', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>商品名后缀</FieldLabel>
            <input
              value={form.payment_product_name_suffix}
              onChange={(e) => updateForm('payment_product_name_suffix', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>帮助图片地址</FieldLabel>
            <input
              value={form.payment_help_image_url}
              onChange={(e) => updateForm('payment_help_image_url', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>取消限流单位</FieldLabel>
            <input
              value={form.payment_cancel_rate_limit_unit}
              onChange={(e) => updateForm('payment_cancel_rate_limit_unit', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
        </div>
        <div>
          <FieldLabel>支付帮助文本</FieldLabel>
          <textarea
            rows={4}
            value={form.payment_help_text}
            onChange={(e) => updateForm('payment_help_text', e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.payment_cancel_rate_limit_enabled}
              onChange={(e) => updateForm('payment_cancel_rate_limit_enabled', e.target.checked)}
            />
            开启取消订单限流
          </label>
          <div className="grid grid-cols-3 gap-3">
            <input
              type="number"
              value={form.payment_cancel_rate_limit_max}
              onChange={(e) => updateForm('payment_cancel_rate_limit_max', e.target.value)}
              placeholder="最大次数"
              className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
            <input
              type="number"
              value={form.payment_cancel_rate_limit_window}
              onChange={(e) => updateForm('payment_cancel_rate_limit_window', e.target.value)}
              placeholder="窗口"
              className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
            <input
              value={form.payment_cancel_rate_limit_window_mode}
              onChange={(e) => updateForm('payment_cancel_rate_limit_window_mode', e.target.value)}
              placeholder="模式"
              className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
        </div>
      </SummaryCard>

      <SummaryCard title="分销结算">
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
          自动结算用于在冻结期结束后自动把 `pending` 佣金转为 `settled`；手动打款后结算用于管理员线下完成打款后，再到分销管理页手动确认结算。
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.affiliate_auto_settlement_enabled}
              onChange={(e) => updateForm('affiliate_auto_settlement_enabled', e.target.checked)}
            />
            开启自动结算
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.affiliate_manual_payout_settlement_enabled}
              onChange={(e) => updateForm('affiliate_manual_payout_settlement_enabled', e.target.checked)}
            />
            开启手动打款后结算
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-gray-900/40 dark:text-gray-300">
            当前自动结算状态：{form.affiliate_auto_settlement_enabled ? '已开启' : '已关闭'}
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-gray-900/40 dark:text-gray-300">
            当前手动打款后结算状态：{form.affiliate_manual_payout_settlement_enabled ? '已开启' : '已关闭'}
          </div>
        </div>
        {!form.affiliate_auto_settlement_enabled && !form.affiliate_manual_payout_settlement_enabled ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
            当前两种结算方式都已关闭，新的冻结佣金将继续停留在 `pending` 状态，需先开启至少一种结算方式再处理。
          </div>
        ) : null}
      </SummaryCard>

      <SummaryCard title={t('admin.settings.sections.gatewayNotice')}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.enable_model_fallback}
              onChange={(e) => updateForm('enable_model_fallback', e.target.checked)}
            />
            开启模型回退
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.enable_identity_patch}
              onChange={(e) => updateForm('enable_identity_patch', e.target.checked)}
            />
            开启身份补丁
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.allow_ungrouped_key_scheduling}
              onChange={(e) => updateForm('allow_ungrouped_key_scheduling', e.target.checked)}
            />
            允许未分组 Key 调度
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.backend_mode_enabled}
              onChange={(e) => updateForm('backend_mode_enabled', e.target.checked)}
            />
            开启 Backend Mode
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.enable_fingerprint_unification}
              onChange={(e) => updateForm('enable_fingerprint_unification', e.target.checked)}
            />
            开启指纹统一
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.enable_metadata_passthrough}
              onChange={(e) => updateForm('enable_metadata_passthrough', e.target.checked)}
            />
            开启 Metadata 透传
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.enable_cch_signing}
              onChange={(e) => updateForm('enable_cch_signing', e.target.checked)}
            />
            开启 CCH Signing
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.web_search_emulation_enabled}
              onChange={(e) => updateForm('web_search_emulation_enabled', e.target.checked)}
            />
            开启 Web Search Emulation
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.balance_low_notify_enabled}
              onChange={(e) => updateForm('balance_low_notify_enabled', e.target.checked)}
            />
            开启余额告警
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.account_quota_notify_enabled}
              onChange={(e) => updateForm('account_quota_notify_enabled', e.target.checked)}
            />
            开启账户额度告警
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <input
            value={form.fallback_model_anthropic}
            onChange={(e) => updateForm('fallback_model_anthropic', e.target.value)}
            placeholder="Anthropic 回退模型"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <input
            value={form.fallback_model_openai}
            onChange={(e) => updateForm('fallback_model_openai', e.target.value)}
            placeholder="OpenAI 回退模型"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <input
            value={form.fallback_model_gemini}
            onChange={(e) => updateForm('fallback_model_gemini', e.target.value)}
            placeholder="Gemini 回退模型"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <input
            value={form.fallback_model_antigravity}
            onChange={(e) => updateForm('fallback_model_antigravity', e.target.value)}
            placeholder="Antigravity 回退模型"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <input
            value={form.balance_low_notify_threshold}
            onChange={(e) => updateForm('balance_low_notify_threshold', e.target.value)}
            placeholder="余额告警阈值"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <input
            value={form.balance_low_notify_recharge_url}
            onChange={(e) => updateForm('balance_low_notify_recharge_url', e.target.value)}
            placeholder="余额告警充值链接"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
        </div>
        <div>
          <FieldLabel>身份补丁提示词</FieldLabel>
          <textarea
            rows={4}
            value={form.identity_patch_prompt}
            onChange={(e) => updateForm('identity_patch_prompt', e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
        </div>
      </SummaryCard>

      <SummaryCard title={t('admin.settings.sections.adminApiKey')}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            当前状态：{apiKeyStatus?.exists ? apiKeyStatus.masked_key || '已存在' : '未生成'}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void handleRegenerateAPIKey()}
              disabled={apiKeyBusy}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60 dark:bg-white dark:text-gray-900"
            >
              {apiKeyBusy ? '处理中' : apiKeyStatus?.exists ? '重新生成' : '生成 API Key'}
            </button>
            {apiKeyStatus?.exists && (
              <button
                type="button"
                onClick={() => void handleDeleteAPIKey()}
                disabled={apiKeyBusy}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                删除
              </button>
            )}
          </div>
        </div>
        {generatedApiKey && (
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-900/40">
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">本次生成的完整 Key</div>
            <div className="mt-2 break-all font-mono text-sm text-gray-900 dark:text-white">{generatedApiKey}</div>
          </div>
        )}
      </SummaryCard>

      <ModalShell
        open={showProviderDialog}
        title={editingProvider ? '编辑支付服务商' : '添加支付服务商'}
        onClose={() => {
          setShowProviderDialog(false);
          resetProviderForm();
        }}
      >
        <div className="space-y-5 px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>服务商名称</FieldLabel>
              <input
                value={providerForm.name}
                onChange={(e) => setProviderFormField('name', e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
              />
            </div>
            <div>
              <FieldLabel>服务商类型</FieldLabel>
              <select
                value={providerForm.provider_key}
                disabled={Boolean(editingProvider)}
                onChange={(e) => syncProviderFormForKey(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm disabled:opacity-60 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
              >
                {(editingProvider ? PROVIDER_KEY_OPTIONS : enabledProviderKeyOptions).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={providerForm.enabled}
                onChange={(e) => setProviderFormField('enabled', e.target.checked)}
              />
              启用服务商
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={providerForm.refund_enabled}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setProviderForm((prev) => ({
                    ...prev,
                    refund_enabled: checked,
                    allow_user_refund: checked ? prev.allow_user_refund : false,
                  }));
                }}
              />
              支持退款
            </label>
            {providerForm.refund_enabled ? (
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={providerForm.allow_user_refund}
                  onChange={(e) => setProviderFormField('allow_user_refund', e.target.checked)}
                />
                允许用户发起退款
              </label>
            ) : null}
          </div>

          {providerForm.provider_key === 'easypay' ? (
            <div>
              <FieldLabel>支付模式</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: PAYMENT_MODE_QRCODE, label: '扫码' },
                  { value: PAYMENT_MODE_POPUP, label: '弹窗' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setProviderFormField('payment_mode', option.value)}
                    className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                      providerForm.payment_mode === option.value
                        ? 'bg-blue-600 text-white'
                        : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {currentProviderTypeOptions.length > 0 ? (
            <div>
              <FieldLabel>支持的支付方式</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {currentProviderTypeOptions.map((option) => {
                  const selected = providerForm.supported_types.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setProviderForm((prev) => ({
                          ...prev,
                          supported_types: selected
                            ? prev.supported_types.filter((item) => item !== option.value)
                            : [...prev.supported_types, option.value],
                        }))
                      }
                      className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                        selected
                          ? 'bg-blue-600 text-white'
                          : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="space-y-4 border-t border-gray-200 pt-5 dark:border-gray-800">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">服务商配置</div>
            <div className="grid gap-4 md:grid-cols-2">
              {currentProviderFields.map((field) => (
                <div key={field.key} className={field.sensitive && field.key.toLowerCase().includes('key') ? 'md:col-span-2' : ''}>
                  <FieldLabel>
                    {field.label}
                    {field.optional ? <span className="ml-1 text-xs text-gray-400">（可选）</span> : null}
                  </FieldLabel>
                  {field.sensitive && field.key.toLowerCase().includes('key') ? (
                    <textarea
                      rows={3}
                      value={providerForm.config[field.key] || ''}
                      onChange={(e) =>
                        setProviderForm((prev) => ({
                          ...prev,
                          config: { ...prev.config, [field.key]: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 font-mono text-sm dark:border-gray-700 dark:text-white"
                    />
                  ) : (
                    <input
                      type={field.sensitive ? 'password' : 'text'}
                      value={providerForm.config[field.key] || ''}
                      placeholder={field.defaultValue || ''}
                      onChange={(e) =>
                        setProviderForm((prev) => ({
                          ...prev,
                          config: { ...prev.config, [field.key]: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                    />
                  )}
                </div>
              ))}
            </div>

            {currentProviderCallbackPaths ? (
              <div className="grid gap-4 md:grid-cols-2">
                {currentProviderCallbackPaths.notifyUrl ? (
                  <div>
                    <FieldLabel>通知回调基础地址</FieldLabel>
                    <div className="flex">
                      <input
                        value={providerForm.notify_base_url}
                        onChange={(e) => setProviderFormField('notify_base_url', e.target.value)}
                        placeholder={typeof window !== 'undefined' ? window.location.origin : ''}
                        className="min-w-0 flex-1 rounded-l-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                      />
                      <span className="inline-flex items-center rounded-r-lg border border-l-0 border-gray-200 bg-gray-50 px-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
                        {currentProviderCallbackPaths.notifyUrl}
                      </span>
                    </div>
                  </div>
                ) : null}
                {currentProviderCallbackPaths.returnUrl ? (
                  <div>
                    <FieldLabel>返回地址基础域名</FieldLabel>
                    <div className="flex">
                      <input
                        value={providerForm.return_base_url}
                        onChange={(e) => setProviderFormField('return_base_url', e.target.value)}
                        placeholder={typeof window !== 'undefined' ? window.location.origin : ''}
                        className="min-w-0 flex-1 rounded-l-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                      />
                      <span className="inline-flex items-center rounded-r-lg border border-l-0 border-gray-200 bg-gray-50 px-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
                        {currentProviderCallbackPaths.returnUrl}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {currentProviderWebhookUrl ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
                Stripe Webhook 地址：<code className="break-all font-mono">{currentProviderWebhookUrl}</code>
              </div>
            ) : null}

            <div>
              <FieldLabel>限额配置 JSON</FieldLabel>
              <textarea
                rows={4}
                value={providerForm.limits}
                onChange={(e) => setProviderFormField('limits', e.target.value)}
                placeholder='例如：{"alipay":{"singleMin":10,"singleMax":500}}'
                className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 font-mono text-sm dark:border-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
            <button
              type="button"
              onClick={() => {
                setShowProviderDialog(false);
                resetProviderForm();
              }}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSaveProvider()}
              disabled={providerSaving}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {providerSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingProvider ? '保存修改' : '创建服务商'}
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
