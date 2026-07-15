"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Clock,
  DollarSign,
  HandCoins,
  UserCircle2,
  UserPlus2,
  Wallet,
} from "lucide-react";
import { getAffiliateInfo, type AffiliateInfo } from "@/lib/user-affiliate";
import { listPartnerAgents } from "@/lib/partner-api";
import { useAuthStore } from "@/store/auth";

function formatCurrency(amount?: number) {
  return Number(amount || 0).toFixed(2);
}

export default function PartnerPage() {
  const { user } = useAuthStore();
  const [info, setInfo] = useState<AffiliateInfo | null>(null);
  const [agentTotal, setAgentTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [affiliateInfo, agentResult] = await Promise.all([
          getAffiliateInfo(),
          listPartnerAgents({ page: 1, page_size: 1 }),
        ]);
        if (!active) {
          return;
        }
        setInfo(affiliateInfo);
        setAgentTotal(agentResult.total || agentResult.items.length);
      } catch {
        if (!active) {
          return;
        }
        setInfo(null);
        setAgentTotal(0);
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
      { label: "当前账号", value: user?.email || "-" },
      { label: "当前角色", value: user?.role || "-" },
      {
        label: "账户余额",
        value: loading ? "..." : formatCurrency(user?.balance),
      },
      { label: "邀请码", value: info?.invite_code || user?.invite_code || "-" },
    ],
    [
      info?.invite_code,
      loading,
      user?.balance,
      user?.email,
      user?.invite_code,
      user?.role,
    ],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
          渠道中心
        </div>
        <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">
          渠道主总览
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
          这里独立承接渠道主的登录入口与业务目录，优先提供代理人管理能力，后续再逐步补齐下属代理统计与分润管理。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <Wallet className="h-5 w-5 text-emerald-500" />
            渠道收益概览
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                <DollarSign className="h-4 w-4 text-violet-500" />
                总提成
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
                {loading
                  ? "..."
                  : formatCurrency(info?.total_commission_earned)}
              </div>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                <HandCoins className="h-4 w-4 text-amber-500" />
                可划转佣金
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
                {loading ? "..." : formatCurrency(info?.commission_balance)}
              </div>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                <Clock className="h-4 w-4 text-blue-500" />
                待结算
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
                {loading ? "..." : formatCurrency(info?.pending_amount)}
              </div>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                <UserPlus2 className="h-4 w-4 text-cyan-500" />
                代理人数
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
                {loading ? "..." : agentTotal}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <UserCircle2 className="h-5 w-5 text-blue-500" />
            个人信息
          </div>
          <div className="mt-6 space-y-4">
            {profileItems.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-[#202020]"
              >
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {item.label}
                </div>
                <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/partner/agents"
          className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-gray-800 dark:bg-[#1A1A1A] dark:hover:border-blue-500/40"
        >
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
            代理人管理
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            新增代理人、调整状态和提成比例，维护当前渠道主名下的代理团队。
          </p>
        </Link>

        <Link
          href="/dashboard"
          className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-emerald-300 hover:shadow-md dark:border-gray-800 dark:bg-[#1A1A1A] dark:hover:border-emerald-500/40"
        >
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
            <HandCoins className="h-5 w-5" />
          </div>
          <div className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
            切回个人后台
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            继续管理个人资料、API 密钥、调用日志和个人账户功能。
          </p>
        </Link>
      </div>
    </div>
  );
}
