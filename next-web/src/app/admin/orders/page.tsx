'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  cancelAdminPaymentOrder,
  getAdminPaymentOrder,
  listAdminPaymentOrders,
  refundAdminPaymentOrder,
  retryAdminPaymentOrder,
  type AdminOrderAuditLog,
  type AdminPaymentOrder,
} from '@/lib/admin-api';
import { useI18n } from '@/i18n/use-i18n';

const PAGE_SIZE = 20;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatCurrency(value?: number) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function formatDate(value: string | undefined, locale: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getStatusClass(status: string) {
  switch (status) {
    case 'COMPLETED':
    case 'PAID':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'PENDING':
    case 'RECHARGING':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    case 'FAILED':
    case 'REFUND_FAILED':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED':
    case 'REFUND_REQUESTED':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
}

function getOrderTypeLabel(orderType: string | undefined, t: (key: string) => string) {
  switch (orderType) {
    case 'subscription':
      return t('admin.orders.orderTypes.subscription');
    case 'balance':
      return t('admin.orders.orderTypes.balance');
    default:
      return orderType || '-';
  }
}

function getPaymentTypeLabel(paymentType: string | undefined, t: (key: string) => string) {
  switch (paymentType) {
    case 'alipay':
      return t('admin.orders.paymentTypes.alipay');
    case 'wxpay':
      return t('admin.orders.paymentTypes.wxpay');
    case 'stripe':
      return t('admin.orders.paymentTypes.stripe');
    case 'easypay':
      return t('admin.orders.paymentTypes.easypay');
    case 'alipay_direct':
      return t('admin.orders.paymentTypes.alipayDirect');
    case 'wxpay_direct':
      return t('admin.orders.paymentTypes.wxpayDirect');
    default:
      return paymentType || '-';
  }
}

export default function AdminOrdersPage() {
  const { locale, t } = useI18n();
  const [orders, setOrders] = useState<AdminPaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    paymentType: '',
    orderType: '',
    userId: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
  });
  const [selectedOrder, setSelectedOrder] = useState<AdminPaymentOrder | null>(null);
  const [auditLogs, setAuditLogs] = useState<AdminOrderAuditLog[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [refundForm, setRefundForm] = useState({
    amount: '',
    reason: '',
    deductBalance: false,
    force: false,
  });

  const loadOrders = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError('');
      try {
        const result = await listAdminPaymentOrders({
          page,
          page_size: PAGE_SIZE,
          keyword: search || undefined,
          status: filters.status || undefined,
          payment_type: filters.paymentType || undefined,
          order_type: filters.orderType || undefined,
          user_id: filters.userId || undefined,
        });
        setOrders(result.items);
        setPagination({
          page: result.page || page,
          pageSize: result.pageSize || PAGE_SIZE,
          total: result.total,
        });
      } catch (error: unknown) {
        setError(getErrorMessage(error, t('admin.orders.messages.loadFailed')));
      } finally {
        setLoading(false);
      }
    },
    [filters.orderType, filters.paymentType, filters.status, filters.userId, search, t]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOrders();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadOrders]);

  const summary = useMemo(() => {
    const totalAmount = orders.reduce((sum, order) => sum + Number(order.pay_amount || 0), 0);
    const pendingCount = orders.filter((order) => order.status === 'PENDING').length;
    const refundCount = orders.filter((order) =>
      ['REFUND_REQUESTED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'REFUND_FAILED'].includes(order.status)
    ).length;
    return { totalAmount, pendingCount, refundCount };
  }, [orders]);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.pageSize || PAGE_SIZE)));

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    setSuccess('');
    await loadOrders(1);
  };

  const handleReset = async () => {
    setSearch('');
    setFilters({ status: '', paymentType: '', orderType: '', userId: '' });
    setSuccess('');
    setLoading(true);
    try {
      const result = await listAdminPaymentOrders({ page: 1, page_size: PAGE_SIZE });
      setOrders(result.items);
      setPagination({
        page: result.page || 1,
        pageSize: result.pageSize || PAGE_SIZE,
        total: result.total,
      });
      setError('');
    } catch (error: unknown) {
      setError(getErrorMessage(error, t('admin.orders.messages.resetFailed')));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetail = async (order: AdminPaymentOrder) => {
    setShowDetail(true);
    setSelectedOrder(order);
    setAuditLogs([]);
    setDetailLoading(true);
    setError('');
    try {
      const result = await getAdminPaymentOrder(order.id);
      setSelectedOrder(result.order);
      setAuditLogs(result.auditLogs);
    } catch (error: unknown) {
      setError(getErrorMessage(error, t('admin.orders.messages.detailFailed')));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCancel = async (order: AdminPaymentOrder) => {
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const result = await cancelAdminPaymentOrder(order.id);
      setSuccess(result.message || t('admin.orders.messages.cancelSuccess', { id: order.id }));
      await loadOrders(pagination.page);
      if (selectedOrder?.id === order.id) {
        await handleOpenDetail(order);
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error, t('admin.orders.messages.cancelFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = async (order: AdminPaymentOrder) => {
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const result = await retryAdminPaymentOrder(order.id);
      setSuccess(result.message || t('admin.orders.messages.retrySuccess', { id: order.id }));
      await loadOrders(pagination.page);
      if (selectedOrder?.id === order.id) {
        await handleOpenDetail(order);
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error, t('admin.orders.messages.retryFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  const openRefund = (order: AdminPaymentOrder) => {
    setSelectedOrder(order);
    setRefundForm({
      amount: String(order.refund_amount || order.pay_amount || order.amount || 0),
      reason: '',
      deductBalance: false,
      force: false,
    });
    setShowRefund(true);
  };

  const handleRefund = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await refundAdminPaymentOrder(selectedOrder.id, {
        amount: Number(refundForm.amount || 0),
        reason: refundForm.reason,
        deduct_balance: refundForm.deductBalance,
        force: refundForm.force,
      });
      setShowRefund(false);
      setSuccess(t('admin.orders.messages.refundSuccess', { id: selectedOrder.id }));
      await loadOrders(pagination.page);
    } catch (error: unknown) {
      setError(getErrorMessage(error, t('admin.orders.messages.refundFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('admin.orders.title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('admin.orders.subtitle')}
          </p>
        </div>
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
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('admin.orders.summary.total')}</p>
          <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">{pagination.total}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('admin.orders.summary.paidAmount')}</p>
          <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
            {formatCurrency(summary.totalAmount)}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('admin.orders.summary.pending')}</p>
          <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">{summary.pendingCount}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('admin.orders.summary.refund')}</p>
          <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">{summary.refundCount}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <form onSubmit={handleSearch} className="grid gap-3 lg:grid-cols-5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.orders.filters.searchPlaceholder')}
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <input
            value={filters.userId}
            onChange={(e) => setFilters((prev) => ({ ...prev, userId: e.target.value }))}
            placeholder={t('admin.orders.filters.userIdPlaceholder')}
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
          >
            <option value="">{t('admin.orders.filters.allStatus')}</option>
            <option value="PENDING">PENDING</option>
            <option value="PAID">PAID</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="FAILED">FAILED</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="REFUND_REQUESTED">REFUND_REQUESTED</option>
            <option value="PARTIALLY_REFUNDED">PARTIALLY_REFUNDED</option>
            <option value="REFUNDED">REFUNDED</option>
            <option value="REFUND_FAILED">REFUND_FAILED</option>
          </select>
          <select
            value={filters.paymentType}
            onChange={(e) => setFilters((prev) => ({ ...prev, paymentType: e.target.value }))}
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
          >
            <option value="">{t('admin.orders.filters.allPaymentMethods')}</option>
            <option value="alipay">{t('admin.orders.paymentTypes.alipay')}</option>
            <option value="wxpay">{t('admin.orders.paymentTypes.wxpay')}</option>
            <option value="stripe">{t('admin.orders.paymentTypes.stripe')}</option>
            <option value="easypay">{t('admin.orders.paymentTypes.easypay')}</option>
          </select>
          <select
            value={filters.orderType}
            onChange={(e) => setFilters((prev) => ({ ...prev, orderType: e.target.value }))}
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
          >
            <option value="">{t('admin.orders.filters.allOrderTypes')}</option>
            <option value="balance">{t('admin.orders.orderTypes.balance')}</option>
            <option value="subscription">{t('admin.orders.orderTypes.subscription')}</option>
          </select>
          <div className="flex gap-3 lg:col-span-5">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t('admin.orders.filters.search')}
            </button>
            <button
              type="button"
              onClick={() => void handleReset()}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {t('admin.orders.filters.reset')}
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr className="text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">{t('admin.orders.table.order')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.orders.table.user')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.orders.table.type')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.orders.table.paymentMethod')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.orders.table.amount')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.orders.table.status')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.orders.table.createdAt')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.orders.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                    {t('admin.orders.loading')}
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                    {t('admin.orders.empty')}
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">#{order.id}</div>
                      <div className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
                        {order.out_trade_no || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900 dark:text-white">{order.user_email || order.user_name || '-'}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.orders.table.userId')}: {order.user_id}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{getOrderTypeLabel(order.order_type, t)}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {getPaymentTypeLabel(order.payment_type, t)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900 dark:text-white">{formatCurrency(order.amount)}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t('admin.orders.table.actualPaid')} {formatCurrency(order.pay_amount)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClass(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(order.created_at, locale)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => void handleOpenDetail(order)}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800"
                        >
                          {t('admin.orders.actions.detail')}
                        </button>
                        {order.status === 'PENDING' && (
                          <button
                            onClick={() => void handleCancel(order)}
                            disabled={submitting}
                            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs text-white hover:bg-amber-600 disabled:opacity-60"
                          >
                            {t('admin.orders.actions.cancel')}
                          </button>
                        )}
                        {order.status === 'FAILED' && (
                          <button
                            onClick={() => void handleRetry(order)}
                            disabled={submitting}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-60"
                          >
                            {t('admin.orders.actions.retry')}
                          </button>
                        )}
                        {['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUND_REQUESTED', 'REFUND_FAILED'].includes(order.status) && (
                          <button
                            onClick={() => openRefund(order)}
                            disabled={submitting}
                            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs text-white hover:bg-rose-700 disabled:opacity-60"
                          >
                            {t('admin.orders.actions.refund')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {t('admin.orders.pageInfo', { page: pagination.page, totalPages, total: pagination.total })}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1 || loading}
              onClick={() => void loadOrders(pagination.page - 1)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {t('admin.orders.prevPage')}
            </button>
            <button
              type="button"
              disabled={pagination.page >= totalPages || loading}
              onClick={() => void loadOrders(pagination.page + 1)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {t('admin.orders.nextPage')}
            </button>
          </div>
        </div>
      </div>

      {showDetail && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#111111]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{t('admin.orders.details.title', { id: selectedOrder.id })}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {t('admin.orders.details.orderNo')} {selectedOrder.out_trade_no || '-'}
                </p>
              </div>
              <button
                onClick={() => setShowDetail(false)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {t('admin.orders.actions.close')}
              </button>
            </div>

            {detailLoading ? (
              <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">{t('admin.orders.details.loading')}</div>
            ) : (
              <div className="mt-6 space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="text-xs text-gray-500 dark:text-gray-400">{t('admin.orders.details.user')}</div>
                    <div className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                      {selectedOrder.user_email || selectedOrder.user_name || '-'}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.orders.table.userId')}: {selectedOrder.user_id}</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="text-xs text-gray-500 dark:text-gray-400">{t('admin.orders.table.status')}</div>
                    <div className="mt-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClass(selectedOrder.status)}`}
                      >
                        {selectedOrder.status}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="text-xs text-gray-500 dark:text-gray-400">{t('admin.orders.details.paymentMethod')}</div>
                    <div className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                      {getPaymentTypeLabel(selectedOrder.payment_type, t)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="text-xs text-gray-500 dark:text-gray-400">{t('admin.orders.details.orderAmount')}</div>
                    <div className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                      {formatCurrency(selectedOrder.amount)}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.orders.table.actualPaid')} {formatCurrency(selectedOrder.pay_amount)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="text-xs text-gray-500 dark:text-gray-400">{t('admin.orders.details.feeRate')}</div>
                    <div className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                      {Number(selectedOrder.fee_rate || 0).toFixed(2)}%
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="text-xs text-gray-500 dark:text-gray-400">{t('admin.orders.details.orderType')}</div>
                    <div className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                      {getOrderTypeLabel(selectedOrder.order_type, t)}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="text-xs text-gray-500 dark:text-gray-400">{t('admin.orders.details.createdAt')}</div>
                    <div className="mt-2 text-sm text-gray-900 dark:text-white">
                      {formatDate(selectedOrder.created_at, locale)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="text-xs text-gray-500 dark:text-gray-400">{t('admin.orders.details.expiresAt')}</div>
                    <div className="mt-2 text-sm text-gray-900 dark:text-white">
                      {formatDate(selectedOrder.expires_at, locale)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="text-xs text-gray-500 dark:text-gray-400">{t('admin.orders.details.paidAt')}</div>
                    <div className="mt-2 text-sm text-gray-900 dark:text-white">{formatDate(selectedOrder.paid_at, locale)}</div>
                  </div>
                </div>

                {(selectedOrder.failed_reason ||
                  selectedOrder.refund_reason ||
                  selectedOrder.refund_request_reason ||
                  selectedOrder.payment_trade_no) && (
                  <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('admin.orders.details.extra')}</h4>
                    <div className="mt-3 grid gap-3 text-sm text-gray-600 dark:text-gray-300">
                      {selectedOrder.payment_trade_no && <div>{t('admin.orders.details.paymentTradeNo', { value: selectedOrder.payment_trade_no })}</div>}
                      {selectedOrder.failed_reason && <div>{t('admin.orders.details.failedReason', { value: selectedOrder.failed_reason })}</div>}
                      {selectedOrder.refund_reason && <div>{t('admin.orders.details.refundReason', { value: selectedOrder.refund_reason })}</div>}
                      {selectedOrder.refund_request_reason && <div>{t('admin.orders.details.refundRequestReason', { value: selectedOrder.refund_request_reason })}</div>}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('admin.orders.details.auditLogs')}</h4>
                  {auditLogs.length === 0 ? (
                    <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">{t('admin.orders.details.noAuditLogs')}</div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {auditLogs.map((log) => (
                        <div key={log.id} className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div className="font-medium text-gray-900 dark:text-white">{log.action}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{formatDate(log.created_at, locale)}</div>
                          </div>
                          {log.detail && (
                            <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{log.detail}</div>
                          )}
                          {log.operator && (
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.orders.details.operator', { value: log.operator })}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showRefund && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#111111]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{t('admin.orders.refundDialog.title')}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('admin.orders.refundDialog.order', { id: selectedOrder.id })}</p>
              </div>
              <button
                onClick={() => setShowRefund(false)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {t('admin.orders.actions.close')}
              </button>
            </div>

            <form onSubmit={handleRefund} className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">{t('admin.orders.refundDialog.amount')}</label>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={refundForm.amount}
                  onChange={(e) => setRefundForm((prev) => ({ ...prev, amount: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">{t('admin.orders.refundDialog.reason')}</label>
                <textarea
                  required
                  rows={3}
                  value={refundForm.reason}
                  onChange={(e) => setRefundForm((prev) => ({ ...prev, reason: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={refundForm.deductBalance}
                  onChange={(e) => setRefundForm((prev) => ({ ...prev, deductBalance: e.target.checked }))}
                />
                {t('admin.orders.refundDialog.deductBalance')}
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={refundForm.force}
                  onChange={(e) => setRefundForm((prev) => ({ ...prev, force: e.target.checked }))}
                />
                {t('admin.orders.refundDialog.force')}
              </label>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowRefund(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {t('admin.orders.refundDialog.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {submitting ? t('admin.orders.actions.submitting') : t('admin.orders.actions.confirmRefund')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
