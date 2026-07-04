'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowRightLeft, Clock, DollarSign, ReceiptText } from 'lucide-react';
import { getAffiliateInfo, listAffiliateCommissionLogs, transferAffiliateCommission, type AffiliateCommissionLog, type AffiliateInfo } from '@/lib/user-affiliate';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatCurrency(amount: number | undefined) {
  return Number(amount || 0).toFixed(2);
}

export default function AgentWithdrawalsPage() {
  const [info, setInfo] = useState<AffiliateInfo | null>(null);
  const [logs, setLogs] = useState<AffiliateCommissionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [infoResult, logsResult] = await Promise.all([getAffiliateInfo(), listAffiliateCommissionLogs(1, 10)]);
      setInfo(infoResult);
      setLogs(logsResult.items);
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError, '加载提现数据失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('请输入大于 0 的划转金额');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await transferAffiliateCommission(parsedAmount);
      setSuccess('佣金划转成功');
      setAmount('');
      await loadData();
    } catch (transferError: unknown) {
      setError(getErrorMessage(transferError, '佣金划转失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          提现管理
        </div>
        <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">佣金提现管理</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
          查看当前可处理佣金、待结算金额和最近处理记录，并支持把佣金划转到账户余额。
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              可划转佣金
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
              {loading ? '...' : formatCurrency(info?.commission_balance)}
            </div>
          </div>

          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <Clock className="h-4 w-4 text-amber-500" />
              待结算
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
              {loading ? '...' : formatCurrency(info?.pending_amount)}
            </div>
          </div>

          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <ReceiptText className="h-4 w-4 text-blue-500" />
              累计收益
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
              {loading ? '...' : formatCurrency(info?.total_commission_earned)}
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          {success}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <ArrowRightLeft className="h-5 w-5 text-emerald-500" />
            佣金划转
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">输入要处理的金额，系统会将佣金余额划转到当前账户余额。</p>

          <form className="mt-6 space-y-4" onSubmit={handleTransfer}>
            <label className="block">
              <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">划转金额</div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-500 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                placeholder="请输入金额"
              />
            </label>

            <button
              type="submit"
              disabled={submitting || loading}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? '处理中...' : '确认划转'}
            </button>
          </form>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">处理记录</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">展示最近的佣金记录和处理状态。</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
              {logs.length} 条
            </span>
          </div>

          {loading ? (
            <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">正在加载处理记录...</div>
          ) : logs.length === 0 ? (
            <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">暂无处理记录</div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <th className="px-3 py-3">ID</th>
                    <th className="px-3 py-3">金额</th>
                    <th className="px-3 py-3">状态</th>
                    <th className="px-3 py-3">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800/70">
                      <td className="px-3 py-3 text-gray-900 dark:text-white">{item.id}</td>
                      <td className="px-3 py-3 text-gray-900 dark:text-white">{formatCurrency(item.amount)}</td>
                      <td className="px-3 py-3 text-gray-500 dark:text-gray-400">{item.status || '-'}</td>
                      <td className="px-3 py-3 text-gray-500 dark:text-gray-400">{item.reason || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Link href="/agent" className="inline-flex text-sm font-medium text-emerald-600 transition hover:text-emerald-700">
        返回代理后台首页
      </Link>
    </div>
  );
}
