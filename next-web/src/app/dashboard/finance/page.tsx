'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CreditCard, ExternalLink, Gift, QrCode, RefreshCw, Wallet } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import {
  createPaymentOrder,
  getCheckoutInfo,
  getCurrentUserProfile,
  getRedeemHistory,
  redeemCode,
  type CheckoutInfo,
  type CreateOrderResult,
} from '@/lib/user-payments';
import { useAuthStore } from '@/store/auth';

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

function getMethodLabel(type: string) {
  switch (type) {
    case 'alipay':
      return 'Alipay';
    case 'wxpay':
      return 'WeChat Pay';
    case 'alipay_direct':
      return 'Alipay Direct';
    case 'wxpay_direct':
      return 'WeChat Direct';
    case 'stripe':
      return 'Stripe';
    case 'easypay':
      return 'EasyPay';
    default:
      return type;
  }
}

const QUICK_AMOUNTS = [10, 20, 50, 100, 200, 500];

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

export default function FinancePage() {
  const { t } = useI18n();
  const { user, updateUser } = useAuthStore();
  const [redeemInput, setRedeemInput] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [rechargeLoading, setRechargeLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [checkout, setCheckout] = useState<CheckoutInfo>(EMPTY_CHECKOUT);
  const [amountInput, setAmountInput] = useState('50');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [recentRedeems, setRecentRedeems] = useState<
    Array<{ id: number; code: string; type: string; value: number; used_at?: string | null; created_at: string }>
  >([]);
  const [createdOrder, setCreatedOrder] = useState<CreateOrderResult | null>(null);

  const loadFinanceData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [checkoutResult, redeemHistory] = await Promise.all([getCheckoutInfo(), getRedeemHistory()]);
      setCheckout(checkoutResult);
      setRecentRedeems(redeemHistory);
      const methodKeys = Object.keys(checkoutResult.methods).filter((key) => checkoutResult.methods[key]?.available !== false);
      setSelectedMethod((current) => (current && methodKeys.includes(current) ? current : methodKeys[0] || ''));
    } catch (loadError) {
      console.error('load finance page failed', loadError);
      setError(getErrorMessage(loadError, t('dashboard.pages.finance.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadFinanceData();
  }, [loadFinanceData]);

  const amount = useMemo(() => {
    const parsed = Number(amountInput);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [amountInput]);

  const availableMethods = useMemo(
    () =>
      Object.entries(checkout.methods).filter(([, method]) => {
        if (!method || method.available === false) return false;
        if (amount <= 0) return true;
        if (method.single_min > 0 && amount < method.single_min) return false;
        if (method.single_max > 0 && amount > method.single_max) return false;
        return true;
      }),
    [amount, checkout.methods]
  );

  const selectedMethodMeta = selectedMethod ? checkout.methods[selectedMethod] : undefined;
  const effectiveFeeRate = selectedMethodMeta?.fee_rate ?? checkout.recharge_fee_rate ?? 0;
  const feeAmount = amount > 0 && effectiveFeeRate > 0 ? Math.ceil(amount * effectiveFeeRate) / 100 : 0;
  const actualPay = amount + feeAmount;
  const creditedAmount = amount * (checkout.balance_recharge_multiplier > 0 ? checkout.balance_recharge_multiplier : 1);
  const canCreateOrder = !checkout.balance_disabled && amount > 0 && !!selectedMethod && availableMethods.some(([key]) => key === selectedMethod);

  const refreshBalance = useCallback(async () => {
    try {
      const profile = await getCurrentUserProfile();
      updateUser({
        id: profile.id,
        email: profile.email,
        role: profile.role,
        balance: profile.balance,
        invite_code: profile.invite_code,
      });
    } catch (profileError) {
      console.error('refresh user profile failed', profileError);
    }
  }, [updateUser]);

  const handleRedeem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!redeemInput.trim()) return;

    setRedeemLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await redeemCode(redeemInput.trim().toUpperCase());
      setSuccess(t('dashboard.pages.finance.redeemSuccess'));
      setRedeemInput('');
      setRecentRedeems((current) => [result, ...current].slice(0, 10));
      await refreshBalance();
    } catch (redeemError) {
      console.error('redeem failed', redeemError);
      setError(getErrorMessage(redeemError, t('dashboard.pages.finance.redeemFailed')));
    } finally {
      setRedeemLoading(false);
    }
  };

  const handleCreateOrder = async () => {
    if (!canCreateOrder) return;

    setRechargeLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await createPaymentOrder({
        amount,
        payment_type: selectedMethod,
        order_type: 'balance',
      });
      setCreatedOrder(result);
      setSuccess(t('dashboard.pages.finance.paymentCreated'));
      if (result.pay_url) {
        window.open(result.pay_url, '_blank', 'noopener,noreferrer');
      }
    } catch (orderError) {
      console.error('create payment order failed', orderError);
      setError(getErrorMessage(orderError, t('dashboard.pages.finance.orderCreateFailed')));
    } finally {
      setRechargeLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            <Wallet className="mr-2 h-6 w-6 text-indigo-500" /> {t('dashboard.pages.finance.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.finance.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void refreshBalance();
            void loadFinanceData();
          }}
          className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-gray-200 dark:hover:bg-gray-900/50"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('dashboard.pages.finance.refreshBalance')}
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

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('dashboard.pages.finance.balanceTitle')}</h3>
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                {t('dashboard.pages.finance.currentBalance')}
              </span>
            </div>
            <div className="text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white">{formatMoney(user?.balance)}</div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.finance.balanceHint')}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
            <div className="mb-4 flex items-center">
              <Gift className="mr-2 h-5 w-5 text-purple-500" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('dashboard.pages.finance.redeemTitle')}</h3>
            </div>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.finance.redeemHint')}</p>
            <form onSubmit={handleRedeem} className="space-y-4">
              <input
                type="text"
                required
                value={redeemInput}
                onChange={(event) => setRedeemInput(event.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-4 py-3 font-mono text-sm uppercase tracking-widest text-gray-900 transition-colors placeholder:normal-case placeholder:tracking-normal focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder={t('dashboard.pages.finance.redeemPlaceholder')}
              />
              <button
                type="submit"
                disabled={redeemLoading || !redeemInput.trim()}
                className="flex w-full items-center justify-center rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
              >
                {redeemLoading ? t('dashboard.pages.finance.redeeming') : t('dashboard.pages.finance.redeemNow')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </button>
            </form>

            <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-800">
              <div className="mb-3 text-sm font-medium text-gray-900 dark:text-white">{t('dashboard.pages.finance.redeemHistory')}</div>
              <div className="space-y-3">
                {recentRedeems.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.finance.noRedeemHistory')}</div>
                ) : (
                  recentRedeems.slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-mono text-sm text-gray-900 dark:text-white">{item.code}</div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {t('dashboard.pages.finance.redeemedAt')}: {formatDateTime(item.used_at || item.created_at)}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">+{item.value}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
            <div className="mb-6 flex items-center">
              <CreditCard className="mr-2 h-5 w-5 text-blue-500" />
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('dashboard.pages.finance.onlineTopup')}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.finance.topupHint')}</p>
              </div>
            </div>

            {loading ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.keys.loading')}</div>
            ) : checkout.balance_disabled ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                {t('dashboard.pages.finance.balanceDisabled')}
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="mb-3 text-sm font-medium text-gray-900 dark:text-white">{t('dashboard.pages.finance.amountLabel')}</div>
                  <div className="grid grid-cols-3 gap-3">
                    {QUICK_AMOUNTS.map((quickAmount) => (
                      <button
                        key={quickAmount}
                        type="button"
                        onClick={() => setAmountInput(String(quickAmount))}
                        className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                          Number(amountInput) === quickAmount
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                            : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900/50'
                        }`}
                      >
                        ${quickAmount}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3">
                    <input
                      type="number"
                      min={checkout.global_min || 0}
                      max={checkout.global_max || undefined}
                      step="0.01"
                      value={amountInput}
                      onChange={(event) => setAmountInput(event.target.value)}
                      placeholder={t('dashboard.pages.finance.amountPlaceholder')}
                      className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {t('dashboard.pages.finance.availableRange', {
                        min: checkout.global_min ? `$${checkout.global_min}` : '$0',
                        max: checkout.global_max ? `$${checkout.global_max}` : '∞',
                      })}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="mb-3 text-sm font-medium text-gray-900 dark:text-white">{t('dashboard.pages.finance.paymentMethod')}</div>
                  <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t('dashboard.pages.finance.paymentMethodHint')}</p>
                  {availableMethods.length === 0 ? (
                    <div className="rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      {t('dashboard.pages.finance.noPaymentMethods')}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(checkout.methods).map(([key, method]) => {
                        const isAvailable = availableMethods.some(([availableKey]) => availableKey === key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => isAvailable && setSelectedMethod(key)}
                            disabled={!isAvailable}
                            className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                              selectedMethod === key
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                                : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900/50'
                            } ${!isAvailable ? 'cursor-not-allowed opacity-50' : ''}`}
                          >
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">{getMethodLabel(key)}</div>
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {method.fee_rate > 0 ? `${t('dashboard.pages.finance.fee')}: ${method.fee_rate}%` : t('dashboard.pages.finance.fee') + ': 0%'}
                              </div>
                            </div>
                            {!isAvailable ? (
                              <span className="text-xs text-amber-600 dark:text-amber-300">{t('dashboard.pages.finance.methodUnavailable')}</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.finance.amountLabel')}</span>
                      <span className="text-gray-900 dark:text-white">${amount.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.finance.fee')}</span>
                      <span className="text-gray-900 dark:text-white">${feeAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-200 pt-2 dark:border-gray-700">
                      <span className="font-medium text-gray-700 dark:text-gray-200">{t('dashboard.pages.finance.actualPay')}</span>
                      <span className="text-lg font-bold text-blue-600 dark:text-blue-300">${actualPay.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.finance.creditedBalance')}</span>
                      <span className="font-medium text-gray-900 dark:text-white">${creditedAmount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleCreateOrder()}
                  disabled={!canCreateOrder || rechargeLoading}
                  className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {rechargeLoading ? t('dashboard.pages.finance.creatingOrder') : t('dashboard.pages.finance.createOrder')}
                </button>
              </div>
            )}
          </div>

          {createdOrder ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
              <div className="mb-4 flex items-center">
                <QrCode className="mr-2 h-5 w-5 text-emerald-500" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('dashboard.pages.finance.paymentInfo')}</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.finance.orderId')}</span>
                  <span className="font-medium text-gray-900 dark:text-white">#{createdOrder.order_id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.finance.payAmount')}</span>
                  <span className="font-medium text-gray-900 dark:text-white">${createdOrder.pay_amount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.finance.expiresAt')}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formatDateTime(createdOrder.expires_at)}</span>
                </div>
              </div>

              {createdOrder.qr_code ? (
                <div className="mt-5 rounded-xl border border-gray-200 p-4 text-center dark:border-gray-700">
                  <div className="mb-3 text-sm font-medium text-gray-900 dark:text-white">{t('dashboard.pages.finance.qrCode')}</div>
                  <img src={createdOrder.qr_code} alt={t('dashboard.pages.finance.qrCode')} className="mx-auto max-h-56 rounded-lg" />
                </div>
              ) : (
                <div className="mt-5 rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  {t('dashboard.pages.finance.noQrCode')}
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
                  {t('dashboard.pages.finance.openPayment')}
                </a>
              ) : null}
            </div>
          ) : null}

          {(checkout.help_text || checkout.help_image_url) && !loading ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
              <div className="mb-4 text-sm font-medium text-gray-900 dark:text-white">{t('dashboard.pages.finance.helpTextTitle')}</div>
              {checkout.help_image_url ? (
                <img src={checkout.help_image_url} alt="" className="mb-4 max-h-52 rounded-lg object-contain" />
              ) : null}
              {checkout.help_text ? <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">{checkout.help_text}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
