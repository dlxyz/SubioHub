'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Building2, Clock, DollarSign, HandCoins, ShieldCheck, UserCircle2, Wallet } from 'lucide-react';
import { getAffiliateInfo, type AffiliateInfo } from '@/lib/user-affiliate';
import { useAuthStore } from '@/store/auth';

function formatCurrency(amount?: number) {
  return Number(amount || 0).toFixed(2);
}

export default function AgentPage() {
  const { user } = useAuthStore();
  const [info, setInfo] = useState<AffiliateInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const sections = [
    {
      title: '销售统计',
      description: '查看渠道数量、佣金记录和当前代理侧销售概览。',
      href: '/agent/proxies',
      icon: ShieldCheck,
      accent: 'amber',
    },
    {
      title: '渠道分销',
      description: '统一查看渠道接入、分销流水与推广记录，作为代理侧的合并业务入口。',
      href: '/agent/channel-affiliate',
      icon: HandCoins,
      accent: 'violet',
    },
    {
      title: '大客户管理',
      description: '查看代理权限范围内的重点合作伙伴、佣金沉淀与重点跟进提示。',
      href: '/agent/key-accounts',
      icon: Building2,
      accent: 'emerald',
    },
  ] as const;

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const result = await getAffiliateInfo();
        if (active) {
          setInfo(result);
        }
      } catch {
        if (active) {
          setInfo(null);
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

  const profileItems = useMemo(
    () => [
      { label: '当前账号', value: user?.email || '-' },
      { label: '当前角色', value: user?.role || '-' },
      { label: '账户余额', value: loading ? '...' : formatCurrency(user?.balance) },
      { label: '邀请码', value: info?.invite_code || user?.invite_code || '-' },
    ],
    [info?.invite_code, loading, user?.balance, user?.email, user?.invite_code, user?.role]
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          代理中心
        </div>
        <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">代理总览</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
          统一查看当前代理账号的个人信息、佣金数据和业务入口，方便快速进入渠道分销相关操作。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <Wallet className="h-5 w-5 text-emerald-500" />
            佣金概览
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                <DollarSign className="h-4 w-4 text-violet-500" />
                总提成
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
                {loading ? '...' : formatCurrency(info?.total_commission_earned)}
              </div>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                <HandCoins className="h-4 w-4 text-amber-500" />
                可划转佣金
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
                {loading ? '...' : formatCurrency(info?.commission_balance)}
              </div>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                <Clock className="h-4 w-4 text-blue-500" />
                待结算
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
                {loading ? '...' : formatCurrency(info?.pending_amount)}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <UserCircle2 className="h-5 w-5 text-amber-500" />
            个人信息
          </div>
          <div className="mt-6 space-y-4">
            {profileItems.map((item) => (
              <div key={item.label} className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-[#202020]">
                <div className="text-xs text-gray-500 dark:text-gray-400">{item.label}</div>
                <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon;
          const accentClassMap: Record<string, string> = {
            amber:
              'hover:border-amber-300 dark:hover:border-amber-500/40 text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10',
            violet:
              'hover:border-violet-300 dark:hover:border-violet-500/40 text-violet-600 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/10',
            emerald:
              'hover:border-emerald-300 dark:hover:border-emerald-500/40 text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10',
          };

          return (
            <Link
              key={section.href}
              href={section.href}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-[#1A1A1A]"
            >
              <div
                className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${accentClassMap[section.accent]}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">{section.title}</div>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{section.description}</p>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/dashboard"
          className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-gray-800 dark:bg-[#1A1A1A] dark:hover:border-blue-500/40"
        >
          <div className="text-lg font-semibold text-gray-900 dark:text-white">切回个人后台</div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">返回原来的用户中心、API 密钥、调用日志和个人设置。</p>
        </Link>
      </div>
    </div>
  );
}
