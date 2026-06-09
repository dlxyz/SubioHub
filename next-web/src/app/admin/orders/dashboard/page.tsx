'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BadgePercent,
  Clock3,
  CreditCard,
  RefreshCcw,
  TrendingUp,
  Users,
} from 'lucide-react';
import { getAdminPaymentDashboard, type AdminPaymentDashboardStats } from '@/lib/admin-api';

const DAY_OPTIONS = [7, 30, 90] as const;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatCurrency(value?: number) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function formatShortDate(value: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function methodColor(type: string) {
  switch (type) {
    case 'alipay':
      return 'bg-blue-500';
    case 'wxpay':
      return 'bg-emerald-500';
    case 'stripe':
      return 'bg-purple-500';
    case 'alipay_direct':
      return 'bg-sky-500';
    case 'wxpay_direct':
      return 'bg-teal-500';
    case 'easypay':
      return 'bg-orange-500';
    default:
      return 'bg-gray-400';
  }
}

function paymentTypeLabel(type: string) {
  switch (type) {
    case 'alipay':
      return '支付宝';
    case 'wxpay':
      return '微信支付';
    case 'stripe':
      return 'Stripe';
    case 'alipay_direct':
      return '支付宝直连';
    case 'wxpay_direct':
      return '微信直连';
    case 'easypay':
      return 'EasyPay';
    default:
      return type || '-';
  }
}

function rankClass(index: number) {
  if (index === 0) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
  if (index === 1) return 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
  if (index === 2) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

function maxBy<T>(items: T[], selector: (item: T) => number) {
  return items.reduce((max, item) => Math.max(max, selector(item)), 0);
}

export default function AdminPaymentDashboardPage() {
  const [days, setDays] = useState<number>(30);
  const [stats, setStats] = useState<AdminPaymentDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getAdminPaymentDashboard(days);
      setStats(result);
    } catch (error: unknown) {
      setError(getErrorMessage(error, '加载支付看板失败'));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const peakAmount = useMemo(() => maxBy(stats?.daily_series || [], (item) => item.amount), [stats?.daily_series]);
  const peakMethodAmount = useMemo(
    () => maxBy(stats?.payment_methods || [], (item) => item.amount),
    [stats?.payment_methods]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">支付看板</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            查看时间维度切换、核心指标、收入趋势、支付方式分布和 Top 用户。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            {DAY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  days === option
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-[#1A1A1A] dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                {option} 天
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="inline-flex items-center rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">今日收入</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
                {loading ? '...' : formatCurrency(stats?.today_amount)}
              </p>
            </div>
            <TrendingUp className="h-6 w-6 text-emerald-500" />
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{days} 天总收入</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
                {loading ? '...' : formatCurrency(stats?.total_amount)}
              </p>
            </div>
            <CreditCard className="h-6 w-6 text-blue-500" />
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">今日订单数</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
                {loading ? '...' : stats?.today_count ?? 0}
              </p>
            </div>
            <Activity className="h-6 w-6 text-cyan-500" />
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">平均客单价</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
                {loading ? '...' : formatCurrency(stats?.avg_amount)}
              </p>
            </div>
            <BadgePercent className="h-6 w-6 text-purple-500" />
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">待支付订单</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
                {loading ? '...' : stats?.pending_orders ?? 0}
              </p>
            </div>
            <Clock3 className="h-6 w-6 text-amber-500" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">日收入趋势</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">按已支付订单统计近 {days} 天的收入与单量。</p>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">正在加载趋势数据...</div>
        ) : !stats?.daily_series?.length ? (
          <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">暂无趋势数据</div>
        ) : (
          <div className="mt-6">
            <div className="flex h-64 items-end gap-2 overflow-x-auto pb-4">
              {stats.daily_series.map((item) => {
                const height = peakAmount > 0 ? Math.max((item.amount / peakAmount) * 100, item.amount > 0 ? 8 : 2) : 2;
                return (
                  <div key={item.date} className="flex min-w-10 flex-1 flex-col items-center justify-end gap-2">
                    <div className="text-xs text-gray-500 dark:text-gray-400">{item.count}</div>
                    <div
                      className="w-full rounded-t-md bg-blue-500/80 transition-all"
                      style={{ height: `${height}%` }}
                      title={`${item.date} | ${formatCurrency(item.amount)} | ${item.count} 单`}
                    />
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">{formatShortDate(item.date)}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">柱高表示收入，柱顶数字表示订单数。</div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">支付方式分布</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">按支付方式统计收入金额与订单数量。</p>

          {loading ? (
            <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">正在加载支付方式数据...</div>
          ) : !stats?.payment_methods?.length ? (
            <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">暂无支付方式数据</div>
          ) : (
            <div className="mt-6 space-y-4">
              {stats.payment_methods.map((method) => {
                const width = peakMethodAmount > 0 ? (method.amount / peakMethodAmount) * 100 : 0;
                return (
                  <div key={method.type} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-3 w-3 rounded-full ${methodColor(method.type)}`} />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{paymentTypeLabel(method.type)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatCurrency(method.amount)}
                        </span>
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">({method.count} 单)</span>
                      </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className={`h-full rounded-full ${methodColor(method.type)}`}
                        style={{ width: `${Math.max(width, 4)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Top 用户</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">按支付金额排序的高价值用户。</p>
            </div>
            <Users className="h-5 w-5 text-gray-400" />
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">正在加载用户排行...</div>
          ) : !stats?.top_users?.length ? (
            <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">暂无排行数据</div>
          ) : (
            <div className="mt-6 space-y-3">
              {stats.top_users.map((user, index) => (
                <div
                  key={`${user.user_id}-${user.email}`}
                  className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3 dark:border-gray-800"
                >
                  <div className="flex items-center gap-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${rankClass(index)}`}>
                      {index + 1}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{user.email || `用户 #${user.user_id}`}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">用户 ID: {user.user_id}</div>
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(user.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
