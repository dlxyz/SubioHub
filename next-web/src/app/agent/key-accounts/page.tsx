'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, HandCoins, RefreshCcw, Search, ShieldCheck, Users, Wallet } from 'lucide-react';
import { listAgentAffiliateCommissions, listAgentChannels, listAgentDistributors } from '@/lib/agent-api';
import type { AdminChannel, AdminCommissionLog, AdminUser } from '@/lib/admin-api';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatCurrency(value?: number | null) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatPercent(value?: number | null) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function buildPartnerHint(user: AdminUser) {
  if ((user.status || '').toLowerCase() === 'disabled') {
    return '当前伙伴已停用，先核对合作状态';
  }
  if (Number(user.commission_balance || 0) >= 100) {
    return '佣金沉淀较高，适合优先跟进转化';
  }
  if (Number(user.total_commission_earned || 0) >= 300) {
    return '累计贡献较高，可作为重点合作伙伴维护';
  }
  if (Number(user.commission_rate || 0) >= 0.15) {
    return '返佣比例较高，建议关注产出质量';
  }
  return '当前合作平稳，可持续观察转化表现';
}

export default function AgentKeyAccountsPage() {
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [commissions, setCommissions] = useState<AdminCommissionLog[]>([]);
  const [partners, setPartners] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async (keyword = search) => {
    setLoading(true);
    setError('');
    try {
      const [channelResult, commissionResult, distributorResult] = await Promise.all([
        listAgentChannels({ page: 1, page_size: 12 }),
        listAgentAffiliateCommissions({ page: 1, page_size: 20 }),
        listAgentDistributors({ page: 1, page_size: 50, search: keyword || undefined }),
      ]);
      setChannels(channelResult.items);
      setCommissions(commissionResult.items);
      setPartners(distributorResult.items);
    } catch (loadError) {
      setError(getErrorMessage(loadError, '加载代理大客户数据失败'));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await load(search);
  };

  const activePartners = useMemo(
    () => partners.filter((item) => (item.status || 'active').toLowerCase() !== 'disabled'),
    [partners]
  );
  const focusPartners = useMemo(
    () =>
      [...partners]
        .filter(
          (item) =>
            Number(item.total_commission_earned || 0) > 0 ||
            Number(item.commission_balance || 0) > 0 ||
            Number(item.commission_rate || 0) >= 0.1
        )
        .sort((a, b) => {
          const aScore = Number(a.total_commission_earned || 0) + Number(a.commission_balance || 0);
          const bScore = Number(b.total_commission_earned || 0) + Number(b.commission_balance || 0);
          return bScore - aScore;
        }),
    [partners]
  );
  const settledCount = useMemo(
    () => commissions.filter((item) => (item.status || '').toLowerCase() === 'settled').length,
    [commissions]
  );
  const totalPendingCommission = useMemo(
    () => partners.reduce((sum, item) => sum + Number(item.commission_balance || 0), 0),
    [partners]
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          客户合作看板
        </div>
        <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">代理客户合作概览</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">
          这里集中展示代理账号当前可见的合作伙伴、渠道数量和佣金表现，方便快速判断哪些客户值得优先维护、哪些合作对象需要持续跟进。
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <Building2 className="h-4 w-4 text-emerald-500" />
              渠道数量
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{channels.length}</div>
          </div>
          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <Users className="h-4 w-4 text-violet-500" />
              合作客户
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{partners.length}</div>
          </div>
          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <ShieldCheck className="h-4 w-4 text-amber-500" />
              重点客户
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{focusPartners.length}</div>
          </div>
          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <Wallet className="h-4 w-4 text-blue-500" />
              待处理佣金
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalPendingCommission)}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <form className="flex w-full flex-col gap-3 md:flex-row" onSubmit={handleSearch}>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索合作客户邮箱 / 用户名"
                  className="w-full rounded-2xl border border-gray-200 py-3 pl-9 pr-4 text-sm text-gray-900 outline-none transition focus:border-emerald-500 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                />
              </div>
              <button
                type="submit"
                className="rounded-2xl bg-gray-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-black dark:bg-white dark:text-gray-900"
              >
                搜索
              </button>
            </form>

            <button
              type="button"
              onClick={() => void load(search)}
              className="inline-flex items-center justify-center rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              刷新
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
            当前页面只展示代理账号能看到的客户合作数据，用来做日常维护和跟进判断，不涉及平台后台里的全局客户配置。
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">正在加载客户合作数据...</div>
          ) : focusPartners.length === 0 ? (
            <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">当前范围内暂无需要重点跟进的客户</div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <th className="px-3 py-3">合作客户</th>
                    <th className="px-3 py-3">状态</th>
                    <th className="px-3 py-3">返佣比例</th>
                    <th className="px-3 py-3">待结算佣金</th>
                    <th className="px-3 py-3">累计佣金贡献</th>
                    <th className="px-3 py-3">跟进建议</th>
                    <th className="px-3 py-3">合作时间</th>
                  </tr>
                </thead>
                <tbody>
                  {focusPartners.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 align-top dark:border-gray-800/70">
                      <td className="px-3 py-4">
                        <div className="font-medium text-gray-900 dark:text-white">{item.email}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.username || '未设置用户名'}</div>
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            (item.status || '').toLowerCase() === 'disabled'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          }`}
                        >
                          {(item.status || '').toLowerCase() === 'disabled' ? '已停用' : '合作正常'}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-gray-900 dark:text-white">{formatPercent(item.commission_rate)}</td>
                      <td className="px-3 py-4 text-gray-900 dark:text-white">{formatCurrency(item.commission_balance)}</td>
                      <td className="px-3 py-4 text-gray-900 dark:text-white">{formatCurrency(item.total_commission_earned)}</td>
                      <td className="px-3 py-4">
                        <div className="max-w-xs rounded-2xl bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-600 dark:bg-[#202020] dark:text-gray-300">
                          {buildPartnerHint(item)}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-gray-900 dark:text-white">{formatDate(item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
            <div className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
              <HandCoins className="h-5 w-5 text-violet-500" />
              客户合作摘要
            </div>
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-[#202020]">
                <div className="text-xs text-gray-500 dark:text-gray-400">活跃客户</div>
                <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{activePartners.length}</div>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-[#202020]">
                <div className="text-xs text-gray-500 dark:text-gray-400">最近佣金笔数</div>
                <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{commissions.length}</div>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-[#202020]">
                <div className="text-xs text-gray-500 dark:text-gray-400">已结算笔数</div>
                <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{settledCount}</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">最近合作动态</div>
            <div className="mt-4 space-y-3">
              {commissions.slice(0, 5).map((item) => (
                <div key={item.id} className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-[#202020]">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{item.reason || '合作佣金记录'}</div>
                    <div className="text-sm text-gray-900 dark:text-white">{formatCurrency(item.amount)}</div>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">状态 {(item.status || 'pending').toUpperCase()} · {formatDate(item.created_at)}</div>
                </div>
              ))}
              {commissions.length === 0 ? (
                <div className="rounded-2xl bg-gray-50 px-4 py-4 text-sm text-gray-500 dark:bg-[#202020] dark:text-gray-400">
                  暂无最近合作动态
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
