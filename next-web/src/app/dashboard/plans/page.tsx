'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Check, ExternalLink, PackageCheck, QrCode, RefreshCw } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { cn } from '@/lib/utils';
import { createPaymentOrder, getCheckoutInfo, type CheckoutInfo, type CheckoutPlan, type CreateOrderResult } from '@/lib/user-payments';
import { listActiveUserSubscriptions, type UserSubscription } from '@/lib/user-subscriptions';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatMoney(value?: number | null) {
  return `$${(value ?? 0).toFixed(2)}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function platformLabel(platform: string) {
  switch (platform) {
    case 'openai':
      return 'OpenAI';
    case 'anthropic':
      return 'Anthropic';
    case 'gemini':
      return 'Gemini';
    case 'antigravity':
      return 'Antigravity';
    default:
      return platform || 'Default';
  }
}

function platformAccentBarClass(platform: string) {
  switch (platform) {
    case 'openai':
      return 'bg-emerald-500';
    case 'anthropic':
      return 'bg-orange-500';
    case 'gemini':
      return 'bg-blue-500';
    case 'antigravity':
      return 'bg-purple-500';
    default:
      return 'bg-gray-400';
  }
}

function platformBorderClass(platform: string) {
  switch (platform) {
    case 'openai':
      return 'border-emerald-200 dark:border-emerald-900/40';
    case 'anthropic':
      return 'border-orange-200 dark:border-orange-900/40';
    case 'gemini':
      return 'border-blue-200 dark:border-blue-900/40';
    case 'antigravity':
      return 'border-purple-200 dark:border-purple-900/40';
    default:
      return 'border-gray-200 dark:border-gray-800';
  }
}

function platformBadgeClass(platform: string) {
  switch (platform) {
    case 'openai':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
    case 'anthropic':
      return 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300';
    case 'gemini':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300';
    case 'antigravity':
      return 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300';
    default:
      return 'bg-gray-50 text-gray-700 dark:bg-gray-900/60 dark:text-gray-300';
  }
}

function platformTextClass(platform: string) {
  switch (platform) {
    case 'openai':
      return 'text-emerald-600 dark:text-emerald-300';
    case 'anthropic':
      return 'text-orange-600 dark:text-orange-300';
    case 'gemini':
      return 'text-blue-600 dark:text-blue-300';
    case 'antigravity':
      return 'text-purple-600 dark:text-purple-300';
    default:
      return 'text-gray-900 dark:text-white';
  }
}

function platformButtonClass(platform: string) {
  switch (platform) {
    case 'openai':
      return 'bg-emerald-600 hover:bg-emerald-700';
    case 'anthropic':
      return 'bg-orange-600 hover:bg-orange-700';
    case 'gemini':
      return 'bg-blue-600 hover:bg-blue-700';
    case 'antigravity':
      return 'bg-purple-600 hover:bg-purple-700';
    default:
      return 'bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200';
  }
}

function getMethodLabel(type: string) {
  switch (type) {
    case 'alipay':
      return 'Alipay';
    case 'wxpay':
      return 'WeChat Pay';
    case 'stripe':
      return 'Stripe';
    case 'easypay':
      return 'EasyPay';
    case 'alipay_direct':
      return 'Alipay Direct';
    case 'wxpay_direct':
      return 'WeChat Direct';
    default:
      return type;
  }
}

function getValiditySuffix(plan: CheckoutPlan, t: (key: string) => string) {
  const unit = plan.validity_unit || 'day';
  if (unit === 'month') return t('dashboard.pages.plans.perMonth');
  if (unit === 'year') return t('dashboard.pages.plans.perYear');
  return `${plan.validity_days}${t('dashboard.pages.plans.days')}`;
}

function PlanCard({
  plan,
  isRenewal,
  onSelect,
  t,
}: {
  plan: CheckoutPlan;
  isRenewal: boolean;
  onSelect: (plan: CheckoutPlan) => void;
  t: (key: string) => string;
}) {
  const platform = plan.group_platform || '';
  const discountText =
    plan.original_price && plan.original_price > 0
      ? `-${Math.max(0, Math.round((1 - plan.price / plan.original_price) * 100))}%`
      : '';
  const rateDisplay = `x${Number((plan.rate_multiplier ?? 1).toPrecision(10))}`;
  const modelScopeLabels = (plan.supported_model_scopes || []).map((scope) => {
    const labels: Record<string, string> = {
      claude: 'Claude',
      gemini_text: 'Gemini',
      gemini_image: 'Imagen',
    };
    return labels[scope] || scope;
  });

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border bg-white transition-all hover:-translate-y-0.5 hover:shadow-xl dark:bg-[#1A1A1A]',
        platformBorderClass(platform)
      )}
    >
      <div className={cn('h-1.5', platformAccentBarClass(platform))} />
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-bold text-gray-900 dark:text-white">{plan.name}</h3>
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', platformBadgeClass(platform))}>
                {platformLabel(platform)}
              </span>
            </div>
            {plan.description ? <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{plan.description}</p> : null}
          </div>
          <div className="shrink-0 text-right">
            <div className="flex items-baseline gap-1">
              <span className="text-xs text-gray-400 dark:text-gray-500">$</span>
              <span className={cn('text-2xl font-extrabold tracking-tight', platformTextClass(platform))}>{plan.price}</span>
            </div>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">/ {getValiditySuffix(plan, t)}</span>
            {plan.original_price ? (
              <div className="mt-0.5 flex items-center justify-end gap-1.5">
                <span className="text-xs text-gray-400 line-through dark:text-gray-500">${plan.original_price}</span>
                {discountText ? <span className="rounded bg-gray-900 px-1 py-0.5 text-[10px] font-semibold text-white dark:bg-white dark:text-gray-900">{discountText}</span> : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-900/40">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 dark:text-gray-500">{t('dashboard.pages.plans.rate')}</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{rateDisplay}</span>
          </div>
          {plan.daily_limit_usd != null ? (
            <div className="flex items-center justify-between">
              <span className="text-gray-400 dark:text-gray-500">{t('dashboard.pages.plans.dailyLimit')}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">${plan.daily_limit_usd}</span>
            </div>
          ) : null}
          {plan.weekly_limit_usd != null ? (
            <div className="flex items-center justify-between">
              <span className="text-gray-400 dark:text-gray-500">{t('dashboard.pages.plans.weeklyLimit')}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">${plan.weekly_limit_usd}</span>
            </div>
          ) : null}
          {plan.monthly_limit_usd != null ? (
            <div className="flex items-center justify-between">
              <span className="text-gray-400 dark:text-gray-500">{t('dashboard.pages.plans.monthlyLimit')}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">${plan.monthly_limit_usd}</span>
            </div>
          ) : null}
          {plan.daily_limit_usd == null && plan.weekly_limit_usd == null && plan.monthly_limit_usd == null ? (
            <div className="flex items-center justify-between">
              <span className="text-gray-400 dark:text-gray-500">{t('dashboard.pages.plans.quota')}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{t('dashboard.pages.plans.unlimited')}</span>
            </div>
          ) : null}
          {modelScopeLabels.length > 0 ? (
            <div className="col-span-2 flex items-center justify-between">
              <span className="text-gray-400 dark:text-gray-500">{t('dashboard.pages.plans.models')}</span>
              <div className="flex flex-wrap justify-end gap-1">
                {modelScopeLabels.map((scope) => (
                  <span key={scope} className="rounded bg-gray-200/80 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {scope}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {plan.features.length > 0 ? (
          <div className="mb-3 space-y-1">
            {plan.features.map((feature) => (
              <div key={feature} className="flex items-start gap-1.5">
                <Check className={cn('mt-0.5 h-3.5 w-3.5 flex-shrink-0', platformTextClass(platform))} />
                <span className="text-xs text-gray-600 dark:text-gray-300">{feature}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onSelect(plan)}
          className={cn('w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98]', platformButtonClass(platform))}
        >
          {isRenewal ? t('dashboard.pages.plans.renewNow') : t('dashboard.pages.plans.subscribeNow')}
        </button>
      </div>
    </div>
  );
}

const EMPTY_CHECKOUT: CheckoutInfo = {
  methods: {},
  global_min: 0,
  global_max: 0,
  plans: [],
  balance_disabled: false,
  balance_recharge_multiplier: 1,
  recharge_fee_rate: 0,
  help_text: '',
  help_image_url: '',
  stripe_publishable_key: '',
};

export default function DashboardPlansPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [checkout, setCheckout] = useState<CheckoutInfo>(EMPTY_CHECKOUT);
  const [activeSubscriptions, setActiveSubscriptions] = useState<UserSubscription[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<CheckoutPlan | null>(null);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [createdOrder, setCreatedOrder] = useState<CreateOrderResult | null>(null);

  const targetGroup = searchParams.get('group');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [checkoutResult, subscriptions] = await Promise.all([getCheckoutInfo(), listActiveUserSubscriptions()]);
      setCheckout(checkoutResult);
      setActiveSubscriptions(subscriptions);

      const availableMethods = Object.entries(checkoutResult.methods)
        .filter(([, method]) => method?.available !== false)
        .map(([key]) => key);
      setSelectedMethod((current) => (current && availableMethods.includes(current) ? current : availableMethods[0] || ''));

      if (targetGroup) {
        const matched = checkoutResult.plans.find((plan) => String(plan.group_id) === targetGroup);
        if (matched) {
          setSelectedPlan(matched);
        }
      }
    } catch (loadError) {
      console.error('load plans failed', loadError);
      setError(getErrorMessage(loadError, t('dashboard.pages.plans.loadFailed')));
      setCheckout(EMPTY_CHECKOUT);
      setActiveSubscriptions([]);
    } finally {
      setLoading(false);
    }
  }, [t, targetGroup]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const sortedPlans = useMemo(() => {
    const plans = [...checkout.plans];
    if (!targetGroup) return plans;
    return plans.sort((a, b) => {
      const aMatch = String(a.group_id) === targetGroup ? 1 : 0;
      const bMatch = String(b.group_id) === targetGroup ? 1 : 0;
      return bMatch - aMatch;
    });
  }, [checkout.plans, targetGroup]);

  const availableMethods = useMemo(() => {
    if (!selectedPlan) return [];
    return Object.entries(checkout.methods).filter(([, method]) => {
      if (!method || method.available === false) return false;
      if (method.single_min > 0 && selectedPlan.price < method.single_min) return false;
      if (method.single_max > 0 && selectedPlan.price > method.single_max) return false;
      return true;
    });
  }, [checkout.methods, selectedPlan]);

  useEffect(() => {
    if (!selectedPlan) return;
    if (!availableMethods.some(([key]) => key === selectedMethod)) {
      setSelectedMethod(availableMethods[0]?.[0] || '');
    }
  }, [availableMethods, selectedMethod, selectedPlan]);

  const feeRate = useMemo(() => {
    if (!selectedMethod) return 0;
    return checkout.methods[selectedMethod]?.fee_rate ?? checkout.recharge_fee_rate ?? 0;
  }, [checkout.methods, checkout.recharge_fee_rate, selectedMethod]);

  const feeAmount = useMemo(() => {
    if (!selectedPlan || feeRate <= 0) return 0;
    return Math.ceil(((selectedPlan.price * feeRate) / 100) * 100) / 100;
  }, [feeRate, selectedPlan]);

  const totalAmount = useMemo(() => {
    if (!selectedPlan) return 0;
    return Math.round((selectedPlan.price + feeAmount) * 100) / 100;
  }, [feeAmount, selectedPlan]);

  const handleCreateOrder = async () => {
    if (!selectedPlan || !selectedMethod) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const result = await createPaymentOrder({
        amount: selectedPlan.price,
        payment_type: selectedMethod,
        order_type: 'subscription',
        plan_id: selectedPlan.id,
      });
      setCreatedOrder(result);
      setSuccess(t('dashboard.pages.plans.orderCreated'));
      if (result.pay_url) {
        window.open(result.pay_url, '_blank', 'noopener,noreferrer');
      }
    } catch (createError) {
      console.error('create subscription order failed', createError);
      setError(getErrorMessage(createError, t('dashboard.pages.plans.orderFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            <PackageCheck className="mr-2 h-6 w-6 text-indigo-500" /> {t('dashboard.pages.plans.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.plans.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-gray-200 dark:hover:bg-gray-900/50"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('dashboard.pages.plans.refresh')}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          {success}
        </div>
      ) : null}

      {activeSubscriptions.length > 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="mb-3 text-sm font-medium text-gray-900 dark:text-white">{t('dashboard.pages.plans.activeSubscription')}</div>
          <div className="space-y-2">
            {activeSubscriptions.map((sub) => (
              <div key={sub.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2 dark:border-gray-800 dark:bg-[#111111]">
                <div className={cn('h-6 w-1 shrink-0 rounded-full', platformAccentBarClass(sub.group?.platform || ''))} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-gray-900 dark:text-white">{sub.group?.name || `Group #${sub.group_id}`}</span>
                    <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium', platformBadgeClass(sub.group?.platform || ''))}>
                      {platformLabel(sub.group?.platform || '')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-[11px] text-gray-400 dark:text-gray-500">
                    <span>{t('dashboard.pages.plans.rate')}: x{sub.group?.rate_multiplier ?? 1}</span>
                    <span>{t('dashboard.pages.plans.currentPlan')}</span>
                  </div>
                </div>
                <Link
                  href={`/dashboard/plans?group=${sub.group_id}`}
                  className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  {t('dashboard.pages.plans.renewNow')}
                </Link>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : sortedPlans.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('dashboard.pages.plans.noPlans')}</h3>
        </div>
      ) : selectedPlan ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={cn('rounded-md border px-2 py-0.5 text-xs font-medium', platformBadgeClass(selectedPlan.group_platform || ''))}>
                  {platformLabel(selectedPlan.group_platform || '')}
                </span>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{selectedPlan.name}</h3>
              </div>
              <div className="flex items-baseline gap-2">
                {selectedPlan.original_price ? <span className="text-sm text-gray-400 line-through dark:text-gray-500">${selectedPlan.original_price}</span> : null}
                <span className={cn('text-3xl font-bold', platformTextClass(selectedPlan.group_platform || ''))}>${selectedPlan.price}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">/ {getValiditySuffix(selectedPlan, t)}</span>
              </div>
              {selectedPlan.description ? <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{selectedPlan.description}</p> : null}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{t('dashboard.pages.plans.rate')}</span>
                  <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">x{selectedPlan.rate_multiplier ?? 1}</div>
                </div>
                {selectedPlan.daily_limit_usd != null ? (
                  <div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{t('dashboard.pages.plans.dailyLimit')}</span>
                    <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">${selectedPlan.daily_limit_usd}</div>
                  </div>
                ) : null}
                {selectedPlan.weekly_limit_usd != null ? (
                  <div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{t('dashboard.pages.plans.weeklyLimit')}</span>
                    <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">${selectedPlan.weekly_limit_usd}</div>
                  </div>
                ) : null}
                {selectedPlan.monthly_limit_usd != null ? (
                  <div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{t('dashboard.pages.plans.monthlyLimit')}</span>
                    <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">${selectedPlan.monthly_limit_usd}</div>
                  </div>
                ) : null}
                {selectedPlan.daily_limit_usd == null && selectedPlan.weekly_limit_usd == null && selectedPlan.monthly_limit_usd == null ? (
                  <div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{t('dashboard.pages.plans.quota')}</span>
                    <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">{t('dashboard.pages.plans.unlimited')}</div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
              <div className="mb-3 text-sm font-medium text-gray-900 dark:text-white">{t('dashboard.pages.plans.paymentMethod')}</div>
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t('dashboard.pages.plans.paymentMethodHint')}</p>
              {availableMethods.length === 0 ? (
                <div className="rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  {t('dashboard.pages.plans.noPaymentMethods')}
                </div>
              ) : (
                <div className="space-y-3">
                  {availableMethods.map(([key, method]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedMethod(key)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors',
                        selectedMethod === key
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                          : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900/50'
                      )}
                    >
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">{getMethodLabel(key)}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {t('dashboard.pages.plans.fee')}: {method.fee_rate}%
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
              <div className="mb-3 text-sm font-medium text-gray-900 dark:text-white">{t('dashboard.pages.plans.selectedPlan')}</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.plans.selectedPlan')}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{selectedPlan.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.plans.fee')}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formatMoney(feeAmount)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 pt-2 dark:border-gray-700">
                  <span className="font-medium text-gray-700 dark:text-gray-200">{t('dashboard.pages.plans.actualPay')}</span>
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-300">{formatMoney(totalAmount)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleCreateOrder()}
                disabled={!selectedMethod || submitting || availableMethods.length === 0}
                className="mt-5 flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? t('dashboard.pages.plans.creatingOrder') : t('dashboard.pages.plans.createOrder')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedPlan(null);
                  setCreatedOrder(null);
                }}
                className="mt-3 flex w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-[#111111] dark:text-gray-200 dark:hover:bg-gray-900/50"
              >
                {t('dashboard.pages.plans.backToPlans')}
              </button>
            </div>

            {createdOrder ? (
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
                <div className="mb-4 flex items-center">
                  <QrCode className="mr-2 h-5 w-5 text-emerald-500" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('dashboard.pages.plans.paymentInfo')}</h3>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.plans.orderId')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">#{createdOrder.order_id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.plans.payAmount')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{formatMoney(createdOrder.pay_amount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.plans.expiresAt')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{formatDateTime(createdOrder.expires_at)}</span>
                  </div>
                </div>

                {createdOrder.qr_code ? (
                  <div className="mt-5 rounded-xl border border-gray-200 p-4 text-center dark:border-gray-700">
                    <div className="mb-3 text-sm font-medium text-gray-900 dark:text-white">{t('dashboard.pages.plans.qrCode')}</div>
                    <img src={createdOrder.qr_code} alt={t('dashboard.pages.plans.qrCode')} className="mx-auto max-h-56 rounded-lg" />
                  </div>
                ) : (
                  <div className="mt-5 rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    {t('dashboard.pages.plans.noQrCode')}
                  </div>
                )}

                {createdOrder.pay_url ? (
                  <a
                    href={createdOrder.pay_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex w-full items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {t('dashboard.pages.plans.openPayment')}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className={cn('grid grid-cols-1 gap-5', sortedPlans.length <= 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')}>
          {sortedPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isRenewal={activeSubscriptions.some((subscription) => subscription.group_id === plan.group_id && subscription.status === 'active')}
              onSelect={(nextPlan) => {
                setSelectedPlan(nextPlan);
                setCreatedOrder(null);
                setError('');
                setSuccess('');
              }}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}
