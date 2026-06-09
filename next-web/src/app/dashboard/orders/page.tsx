'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ReceiptText, RefreshCw, Wallet, X, Undo2 } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import {
  cancelMyOrder,
  getRefundEligibleProviders,
  listMyOrders,
  requestOrderRefund,
  type PaymentOrder,
} from '@/lib/user-payments';

const PAGE_SIZE = 20;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatMoney(value?: number | null) {
  return `$${(value ?? 0).toFixed(2)}`;
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function getStatusBadgeClass(status: PaymentOrder['status']) {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
    case 'PENDING':
    case 'PAID':
    case 'RECHARGING':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
    case 'REFUND_REQUESTED':
    case 'REFUNDING':
    case 'PARTIALLY_REFUNDED':
    case 'REFUNDED':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300';
    case 'FAILED':
    case 'REFUND_FAILED':
      return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300';
    case 'CANCELLED':
    case 'EXPIRED':
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-900/60 dark:text-gray-300';
  }
}

function OrderActionModal({
  open,
  title,
  description,
  submitting,
  confirmLabel,
  closeLabel,
  onClose,
  onConfirm,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  submitting: boolean;
  confirmLabel: string;
  closeLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  children?: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-[#171717]">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
            {description ? <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-60 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">{children}</div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {closeLabel}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={submitting}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? '...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardOrdersPage() {
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [refundEligibleProviders, setRefundEligibleProviders] = useState<Set<string>>(new Set());
  const [cancelTarget, setCancelTarget] = useState<PaymentOrder | null>(null);
  const [refundTarget, setRefundTarget] = useState<PaymentOrder | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('dashboard.pages.orders.all') },
      { value: 'PENDING', label: t('dashboard.pages.orders.statusPending') },
      { value: 'COMPLETED', label: t('dashboard.pages.orders.statusCompleted') },
      { value: 'FAILED', label: t('dashboard.pages.orders.statusFailed') },
      { value: 'REFUNDED', label: t('dashboard.pages.orders.statusRefunded') },
    ],
    [t]
  );

  const getStatusLabel = useCallback(
    (status: PaymentOrder['status']) => {
      switch (status) {
        case 'PENDING':
          return t('dashboard.pages.orders.statusPending');
        case 'PAID':
          return t('dashboard.pages.orders.statusPaid');
        case 'RECHARGING':
          return t('dashboard.pages.orders.statusRecharging');
        case 'COMPLETED':
          return t('dashboard.pages.orders.statusCompleted');
        case 'EXPIRED':
          return t('dashboard.pages.orders.statusExpired');
        case 'CANCELLED':
          return t('dashboard.pages.orders.statusCancelled');
        case 'FAILED':
          return t('dashboard.pages.orders.statusFailed');
        case 'REFUND_REQUESTED':
          return t('dashboard.pages.orders.statusRefundRequested');
        case 'REFUNDING':
          return t('dashboard.pages.orders.statusRefunding');
        case 'PARTIALLY_REFUNDED':
          return t('dashboard.pages.orders.statusPartiallyRefunded');
        case 'REFUNDED':
          return t('dashboard.pages.orders.statusRefunded');
        case 'REFUND_FAILED':
          return t('dashboard.pages.orders.statusRefundFailed');
        default:
          return status;
      }
    },
    [t]
  );

  const getPaymentMethodLabel = useCallback(
    (paymentType: string) => {
      switch (paymentType) {
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
          return paymentType;
      }
    },
    []
  );

  const getOrderTypeLabel = useCallback(
    (orderType: PaymentOrder['order_type']) => {
      switch (orderType) {
        case 'subscription':
          return t('dashboard.pages.orders.typeSubscription');
        case 'balance':
        default:
          return t('dashboard.pages.orders.typeBalance');
      }
    },
    [t]
  );

  const canRequestRefund = useCallback(
    (order: PaymentOrder) => {
      if (order.status !== 'COMPLETED') return false;
      if (!order.provider_instance_id) return false;
      return refundEligibleProviders.has(order.provider_instance_id);
    },
    [refundEligibleProviders]
  );

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listMyOrders({
        page,
        pageSize: PAGE_SIZE,
        status: statusFilter || undefined,
      });
      setOrders(result.items);
      setTotal(result.total);
    } catch (loadError) {
      console.error('load orders failed', loadError);
      setError(getErrorMessage(loadError, t('dashboard.pages.orders.loadFailed')));
      setOrders([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, t]);

  const loadRefundEligibility = useCallback(async () => {
    try {
      const providerIds = await getRefundEligibleProviders();
      setRefundEligibleProviders(new Set(providerIds));
    } catch (eligibilityError) {
      console.error('load refund eligible providers failed', eligibilityError);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    void loadRefundEligibility();
  }, [loadRefundEligibility]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const handleCancelOrder = async () => {
    if (!cancelTarget) return;
    setActionLoading(true);
    try {
      await cancelMyOrder(cancelTarget.id);
      setSuccess(t('dashboard.pages.orders.cancelSuccess'));
      setCancelTarget(null);
      await loadOrders();
    } catch (cancelError) {
      console.error('cancel order failed', cancelError);
      setError(getErrorMessage(cancelError, t('dashboard.pages.orders.cancelFailed')));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestRefund = async () => {
    if (!refundTarget || !refundReason.trim()) return;
    setActionLoading(true);
    try {
      await requestOrderRefund(refundTarget.id, refundReason.trim());
      setSuccess(t('dashboard.pages.orders.refundSuccess'));
      setRefundTarget(null);
      setRefundReason('');
      await loadOrders();
    } catch (refundError) {
      console.error('refund order failed', refundError);
      setError(getErrorMessage(refundError, t('dashboard.pages.orders.refundFailed')));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            <ReceiptText className="mr-2 h-6 w-6 text-indigo-500" /> {t('dashboard.pages.orders.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.orders.subtitle')}</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void loadOrders()}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-gray-200 dark:hover:bg-gray-900/50"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('dashboard.pages.orders.refresh')}
          </button>
          <Link
            href="/dashboard/finance"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Wallet className="mr-2 h-4 w-4" />
            {t('dashboard.pages.orders.topup')}
          </Link>
        </div>
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

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('dashboard.pages.orders.status')}</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
            >
              {statusOptions.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {t('dashboard.pages.orders.pageInfo', {
              page: String(page),
              pages: String(totalPages),
              total: String(total),
            })}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="block divide-y divide-gray-200 dark:divide-gray-800 lg:hidden">
          {loading ? (
            <div className="p-6 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.common.loading')}</div>
          ) : orders.length === 0 ? (
            <div className="p-6 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.orders.noOrders')}</div>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-sm text-gray-900 dark:text-white">#{order.id} / {order.out_trade_no}</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(order.created_at)}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(order.status)}`}>
                    {getStatusLabel(order.status)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.orders.amount')}</div>
                    <div className="font-medium text-gray-900 dark:text-white">{formatMoney(order.amount)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.orders.actualPaid')}</div>
                    <div className="font-medium text-gray-900 dark:text-white">{formatMoney(order.pay_amount)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.orders.type')}</div>
                    <div className="font-medium text-gray-900 dark:text-white">{getOrderTypeLabel(order.order_type)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.orders.paymentMethod')}</div>
                    <div className="font-medium text-gray-900 dark:text-white">{getPaymentMethodLabel(order.payment_type)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {order.status === 'PENDING' ? (
                    <button
                      type="button"
                      onClick={() => setCancelTarget(order)}
                      className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
                    >
                      <X className="mr-1.5 h-4 w-4" />
                      {t('dashboard.pages.orders.cancelOrder')}
                    </button>
                  ) : null}
                  {canRequestRefund(order) ? (
                    <button
                      type="button"
                      onClick={() => {
                        setRefundTarget(order);
                        setRefundReason('');
                      }}
                      className="inline-flex items-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300"
                    >
                      <Undo2 className="mr-1.5 h-4 w-4" />
                      {t('dashboard.pages.orders.requestRefund')}
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.orders.orderNo')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.orders.amount')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.orders.actualPaid')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.orders.paymentMethod')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.orders.type')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.orders.createdAt')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.orders.status')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.orders.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-[#1A1A1A]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">
                    {t('dashboard.common.loading')}
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">
                    {t('dashboard.pages.orders.noOrders')}
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                      <div className="font-medium">#{order.id}</div>
                      <div className="font-mono text-xs text-gray-500 dark:text-gray-400">{order.out_trade_no}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{formatMoney(order.amount)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{formatMoney(order.pay_amount)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{getPaymentMethodLabel(order.payment_type)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{getOrderTypeLabel(order.order_type)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      <div>{formatDateTime(order.created_at)}</div>
                      <div className="mt-1 text-xs">{t('dashboard.pages.orders.expiresAt')}: {formatDateTime(order.expires_at)}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex flex-wrap gap-2">
                        {order.status === 'PENDING' ? (
                          <button
                            type="button"
                            onClick={() => setCancelTarget(order)}
                            className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
                          >
                            <X className="mr-1.5 h-3.5 w-3.5" />
                            {t('dashboard.pages.orders.cancelOrder')}
                          </button>
                        ) : null}
                        {canRequestRefund(order) ? (
                          <button
                            type="button"
                            onClick={() => {
                              setRefundTarget(order);
                              setRefundReason('');
                            }}
                            className="inline-flex items-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300"
                          >
                            <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                            {t('dashboard.pages.orders.requestRefund')}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || loading}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-[#111111] dark:text-gray-200 dark:hover:bg-gray-900/50"
          >
            {t('dashboard.pages.orders.previousPage')}
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages || loading}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-[#111111] dark:text-gray-200 dark:hover:bg-gray-900/50"
          >
            {t('dashboard.pages.orders.nextPage')}
          </button>
        </div>
      </div>

      <OrderActionModal
        open={!!cancelTarget}
        title={t('dashboard.pages.orders.cancelOrder')}
        description={t('dashboard.pages.orders.cancelConfirm')}
        submitting={actionLoading}
        confirmLabel={t('dashboard.pages.orders.cancelOrder')}
        closeLabel={t('dashboard.pages.orders.close')}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancelOrder}
      >
        {cancelTarget ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-[#111111]">
            <div className="font-mono text-gray-900 dark:text-white">#{cancelTarget.id}</div>
            <div className="mt-1 text-gray-500 dark:text-gray-400">{cancelTarget.out_trade_no}</div>
          </div>
        ) : null}
      </OrderActionModal>

      <OrderActionModal
        open={!!refundTarget}
        title={t('dashboard.pages.orders.requestRefund')}
        description={refundTarget ? `#${refundTarget.id} / ${refundTarget.out_trade_no}` : ''}
        submitting={actionLoading}
        confirmLabel={t('dashboard.pages.orders.requestRefund')}
        closeLabel={t('dashboard.pages.orders.close')}
        onClose={() => {
          setRefundTarget(null);
          setRefundReason('');
        }}
        onConfirm={handleRequestRefund}
      >
        {refundTarget ? (
          <>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-[#111111]">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.orders.amount')}</span>
                <span className="font-medium text-gray-900 dark:text-white">{formatMoney(refundTarget.amount)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t('dashboard.pages.orders.actualPaid')}</span>
                <span className="font-medium text-gray-900 dark:text-white">{formatMoney(refundTarget.pay_amount)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('dashboard.pages.orders.refundReason')}</label>
              <textarea
                rows={4}
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
                placeholder={t('dashboard.pages.orders.refundReasonPlaceholder')}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
              />
            </div>
          </>
        ) : null}
      </OrderActionModal>
    </div>
  );
}
