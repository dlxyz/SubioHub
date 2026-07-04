'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, HandCoins, Network, Wallet } from 'lucide-react';
import { listAgentAffiliateCommissions, listAgentChannels } from '@/lib/agent-api';
import type { AdminChannel, AdminCommissionLog } from '@/lib/admin-api';

export default function AgentProxiesPage() {
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [commissions, setCommissions] = useState<AdminCommissionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const [channelResult, commissionResult] = await Promise.all([
          listAgentChannels({ page: 1, page_size: 10 }),
          listAgentAffiliateCommissions({ page: 1, page_size: 10 }),
        ]);
        if (active) {
          setChannels(channelResult.items);
          setCommissions(commissionResult.items);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : '加载销售统计失败');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const totalAmount = commissions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const settledCount = commissions.filter((item) => (item.status || '').toLowerCase() === 'settled').length;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          销售统计
        </div>
        <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">销售数据概览</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
          集中查看代理侧渠道数量、分销佣金和当前销售情况，便于快速掌握业务数据。
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <Network className="h-4 w-4 text-blue-500" />
              渠道数量
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{channels.length}</div>
          </div>

          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <HandCoins className="h-4 w-4 text-violet-500" />
              佣金记录
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{commissions.length}</div>
          </div>

          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <Wallet className="h-4 w-4 text-emerald-500" />
              已结算
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{settledCount}</div>
          </div>

          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <BarChart3 className="h-4 w-4 text-amber-500" />
              佣金金额
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{totalAmount.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        {loading ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">正在加载销售统计...</div>
        ) : error ? (
          <div className="text-sm text-red-500">{error}</div>
        ) : commissions.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">暂无销售记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-3 py-3">ID</th>
                  <th className="px-3 py-3">用户</th>
                  <th className="px-3 py-3">金额</th>
                  <th className="px-3 py-3">状态</th>
                  <th className="px-3 py-3">说明</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800/70">
                    <td className="px-3 py-3 text-gray-900 dark:text-white">{item.id}</td>
                    <td className="px-3 py-3 text-gray-900 dark:text-white">{item.user_id}</td>
                    <td className="px-3 py-3 text-gray-900 dark:text-white">{Number(item.amount || 0).toFixed(2)}</td>
                    <td className="px-3 py-3 text-gray-500 dark:text-gray-400">{item.status || '-'}</td>
                    <td className="px-3 py-3 text-gray-500 dark:text-gray-400">{item.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Link href="/agent" className="inline-flex text-sm font-medium text-amber-600 transition hover:text-amber-700">
        返回代理后台首页
      </Link>
    </div>
  );
}
