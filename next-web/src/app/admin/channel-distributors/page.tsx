"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  HandCoins,
  RefreshCcw,
  Search,
  ShieldCheck,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import {
  listAdminUsers,
  updateAdminAffiliateUserRate,
  updateAdminUser,
  type AdminUser,
} from "@/lib/admin-api";

const PAGE_SIZE = 12;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatPercent(value?: number) {
  return `${((value || 0) * 100).toFixed(2)}%`;
}

function formatCurrency(value?: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getStatusBadgeClass(status?: string) {
  return status === "disabled"
    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
}

export default function AdminChannelDistributorsPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [channelPartners, setChannelPartners] = useState<AdminUser[]>([]);
  const [agents, setAgents] = useState<AdminUser[]>([]);
  const [candidateUsers, setCandidateUsers] = useState<AdminUser[]>([]);
  const [candidateChannelPartnerDrafts, setCandidateChannelPartnerDrafts] =
    useState<Record<number, string>>({});
  const [candidateAgentOwnerDrafts, setCandidateAgentOwnerDrafts] = useState<
    Record<number, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [ownerSavingId, setOwnerSavingId] = useState<number | null>(null);
  const [switchingId, setSwitchingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [rateDrafts, setRateDrafts] = useState<Record<number, string>>({});
  const [channelPartnerDrafts, setChannelPartnerDrafts] = useState<
    Record<number, string>
  >({});
  const [agentOwnerDrafts, setAgentOwnerDrafts] = useState<
    Record<number, string>
  >({});
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
  });

  const loadUsers = useCallback(
    async (page = 1, keyword = search) => {
      setLoading(true);
      setError("");
      try {
        const [result, channelPartnerResult, agentResult] = await Promise.all([
          listAdminUsers({
            page,
            page_size: PAGE_SIZE,
            role: "distributor",
            search: keyword || undefined,
          }),
          listAdminUsers({
            page: 1,
            page_size: 200,
            role: "channel_partner",
          }),
          listAdminUsers({
            page: 1,
            page_size: 200,
            role: "agent",
          }),
        ]);
        setUsers(result.items);
        setChannelPartners(channelPartnerResult.items);
        setAgents(agentResult.items);
        setPagination({
          total: result.total,
          page: result.page || page,
          pageSize: result.pageSize || PAGE_SIZE,
        });
        setRateDrafts((prev) => {
          const next = { ...prev };
          result.items.forEach((user) => {
            next[user.id] = ((user.commission_rate || 0) * 100).toFixed(2);
          });
          return next;
        });
        setChannelPartnerDrafts((prev) => {
          const next = { ...prev };
          result.items.forEach((user) => {
            next[user.id] = user.channel_partner_id
              ? String(user.channel_partner_id)
              : "";
          });
          return next;
        });
        setAgentOwnerDrafts((prev) => {
          const next = { ...prev };
          result.items.forEach((user) => {
            next[user.id] = user.agent_owner_id
              ? String(user.agent_owner_id)
              : "";
          });
          return next;
        });
      } catch (loadError: unknown) {
        setError(getErrorMessage(loadError, "加载分销角色用户失败"));
      } finally {
        setLoading(false);
      }
    },
    [search],
  );

  const loadCandidateUsers = useCallback(async (keyword: string) => {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
      setCandidateUsers([]);
      return;
    }
    setCandidateLoading(true);
    setError("");
    try {
      const result = await listAdminUsers({
        page: 1,
        page_size: 8,
        search: trimmedKeyword,
      });
      setCandidateUsers(
        result.items.filter(
          (user) => user.role !== "admin" && user.role !== "channel_partner",
        ),
      );
      setCandidateChannelPartnerDrafts((prev) => {
        const next = { ...prev };
        result.items.forEach((user) => {
          next[user.id] = user.channel_partner_id
            ? String(user.channel_partner_id)
            : "";
        });
        return next;
      });
      setCandidateAgentOwnerDrafts((prev) => {
        const next = { ...prev };
        result.items.forEach((user) => {
          next[user.id] = user.agent_owner_id
            ? String(user.agent_owner_id)
            : "";
        });
        return next;
      });
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError, "搜索用户失败"));
    } finally {
      setCandidateLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers(1, "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers]);

  const summary = useMemo(() => {
    const activeCount = users.filter(
      (user) => user.status !== "disabled",
    ).length;
    const boundCount = users.filter(
      (user) => Number(user.agent_owner_id || 0) > 0,
    ).length;
    const totalBalance = users.reduce(
      (sum, user) => sum + Number(user.commission_balance || 0),
      0,
    );
    const averageRate = users.length
      ? users.reduce(
          (sum, user) => sum + Number(user.commission_rate || 0),
          0,
        ) / users.length
      : 0;

    return {
      activeCount,
      boundCount,
      totalBalance,
      averageRate,
    };
  }, [users]);

  const totalPages = Math.max(
    1,
    Math.ceil((pagination.total || 0) / (pagination.pageSize || PAGE_SIZE)),
  );

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess("");
    await loadUsers(1, search);
  };

  const handleCandidateSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess("");
    await loadCandidateUsers(candidateSearch);
  };

  const handleRefresh = async () => {
    setSuccess("");
    await loadUsers(pagination.page, search);
  };

  const handleSaveRate = async (user: AdminUser) => {
    const draft = Number(rateDrafts[user.id]);
    if (Number.isNaN(draft) || draft < 0 || draft > 100) {
      setError("返佣比例必须在 0 到 100 之间");
      return;
    }

    setSavingId(user.id);
    setError("");
    setSuccess("");
    try {
      await updateAdminAffiliateUserRate(user.id, draft / 100);
      setUsers((prev) =>
        prev.map((item) =>
          item.id === user.id
            ? { ...item, commission_rate: draft / 100 }
            : item,
        ),
      );
      setSuccess(`已更新 ${user.email} 的分销返佣比例`);
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError, "更新返佣比例失败"));
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveOwners = async (user: AdminUser) => {
    const rawChannelPartnerID = channelPartnerDrafts[user.id] ?? "";
    const rawAgentOwnerID = agentOwnerDrafts[user.id] ?? "";
    const channelPartnerID = rawChannelPartnerID
      ? Number(rawChannelPartnerID)
      : 0;
    const agentOwnerID = rawAgentOwnerID ? Number(rawAgentOwnerID) : 0;

    if (
      rawChannelPartnerID &&
      (!Number.isFinite(channelPartnerID) || channelPartnerID <= 0)
    ) {
      setError("请选择有效的渠道主");
      return;
    }
    if (
      rawAgentOwnerID &&
      (!Number.isFinite(agentOwnerID) || agentOwnerID <= 0)
    ) {
      setError("请选择有效的代理人");
      return;
    }

    const selectedAgent = agents.find((item) => item.id === agentOwnerID);
    if (
      selectedAgent?.channel_partner_id &&
      channelPartnerID > 0 &&
      selectedAgent.channel_partner_id !== channelPartnerID
    ) {
      setError("所选代理人归属的渠道主与当前选择不一致，请重新确认");
      return;
    }

    setOwnerSavingId(user.id);
    setError("");
    setSuccess("");
    try {
      await updateAdminUser(user.id, {
        channel_partner_id: channelPartnerID,
        agent_owner_id: agentOwnerID,
      });
      setUsers((prev) =>
        prev.map((item) =>
          item.id === user.id
            ? {
                ...item,
                channel_partner_id:
                  channelPartnerID > 0 ? channelPartnerID : null,
                agent_owner_id: agentOwnerID > 0 ? agentOwnerID : null,
              }
            : item,
        ),
      );
      setSuccess(`已更新 ${user.email} 的层级归属`);
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError, "更新分销人员归属失败"));
    } finally {
      setOwnerSavingId(null);
    }
  };

  const handleToggleStatus = async (user: AdminUser) => {
    const nextStatus = user.status === "disabled" ? "active" : "disabled";
    setSwitchingId(user.id);
    setError("");
    setSuccess("");
    try {
      await updateAdminUser(user.id, { status: nextStatus });
      setUsers((prev) =>
        prev.map((item) =>
          item.id === user.id ? { ...item, status: nextStatus } : item,
        ),
      );
      setSuccess(
        nextStatus === "active" ? "分销角色用户已启用" : "分销角色用户已禁用",
      );
    } catch (switchError: unknown) {
      setError(getErrorMessage(switchError, "更新用户状态失败"));
    } finally {
      setSwitchingId(null);
    }
  };

  const handleSwitchRole = async (
    user: AdminUser,
    role: "user" | "agent" | "distributor",
  ) => {
    setSwitchingId(user.id);
    setError("");
    setSuccess("");
    try {
      const candidateChannelPartnerID = Number(
        candidateChannelPartnerDrafts[user.id] || user.channel_partner_id || 0,
      );
      const candidateAgentOwnerID = Number(
        candidateAgentOwnerDrafts[user.id] || user.agent_owner_id || 0,
      );
      const selectedAgent = agents.find(
        (item) => item.id === candidateAgentOwnerID,
      );
      if (
        role === "distributor" &&
        selectedAgent?.channel_partner_id &&
        candidateChannelPartnerID > 0 &&
        selectedAgent.channel_partner_id !== candidateChannelPartnerID
      ) {
        throw new Error("所选代理人归属的渠道主与当前选择不一致，请重新确认");
      }

      const payload: Record<string, unknown> = { role };
      if (role === "distributor") {
        payload.channel_partner_id =
          selectedAgent?.channel_partner_id || candidateChannelPartnerID > 0
            ? Number(
                selectedAgent?.channel_partner_id || candidateChannelPartnerID,
              )
            : 0;
        payload.agent_owner_id =
          candidateAgentOwnerID > 0 ? candidateAgentOwnerID : 0;
        payload.distributor_owner_id = 0;
      } else if (role === "agent") {
        payload.channel_partner_id =
          selectedAgent?.channel_partner_id || candidateChannelPartnerID > 0
            ? Number(
                selectedAgent?.channel_partner_id || candidateChannelPartnerID,
              )
            : 0;
        payload.agent_owner_id = 0;
        payload.distributor_owner_id = 0;
      } else if (role === "user") {
        payload.channel_partner_id = 0;
        payload.agent_owner_id = 0;
        payload.distributor_owner_id = 0;
      }

      const updated = await updateAdminUser(user.id, payload);
      if ((updated.role || "user") !== role) {
        throw new Error("角色切换未生效，请稍后刷新后重试");
      }
      setSuccess(
        role === "distributor"
          ? `已将 ${user.email} 设为分销角色`
          : role === "agent"
            ? `已将 ${user.email} 转为代理角色`
            : `已取消 ${user.email} 的分销角色`,
      );
      await loadUsers(1, search);
      await loadCandidateUsers(candidateSearch);
    } catch (switchError: unknown) {
      setError(getErrorMessage(switchError, "切换分销角色失败"));
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          分销人员管理
        </div>
        <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">
          后台分销人员管理
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">
          这页现在独立承接 `distributor`
          分销角色，和普通用户、渠道主、代理角色分开管理。当前支持查看分销角色用户列表、
          设置返佣比例、切换启停状态，并核对所属渠道主与代理归属。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/admin/channel-partners"
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            去渠道主管理
          </Link>
          <Link
            href="/admin/agent-management"
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            去代理人管理
          </Link>
          <Link
            href="/admin/affiliate"
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            去平台分销结算
          </Link>
          <Link
            href="/admin/dashboard"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            返回管理总览
          </Link>
        </div>
      </div>

      {(error || success) && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            error
              ? "border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
              : "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
          }`}
        >
          {error || success}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-5">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                分销角色用户数
              </div>
              <div className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
                {loading ? "..." : pagination.total}
              </div>
            </div>
            <Users className="h-6 w-6 text-blue-500" />
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                当前页启用数
              </div>
              <div className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
                {loading ? "..." : summary.activeCount}
              </div>
            </div>
            <ShieldCheck className="h-6 w-6 text-emerald-500" />
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                已绑定代理
              </div>
              <div className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
                {loading ? "..." : summary.boundCount}
              </div>
            </div>
            <HandCoins className="h-6 w-6 text-sky-500" />
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                当前页平均返佣
              </div>
              <div className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
                {loading ? "..." : formatPercent(summary.averageRate)}
              </div>
            </div>
            <HandCoins className="h-6 w-6 text-violet-500" />
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                当前页佣金余额
              </div>
              <div className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
                {loading ? "..." : formatCurrency(summary.totalBalance)}
              </div>
            </div>
            <Building2 className="h-6 w-6 text-amber-500" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={handleSearch}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索分销角色用户邮箱/用户名"
              className="w-full rounded-xl border border-gray-200 bg-transparent py-2.5 pr-4 pl-10 text-sm text-gray-900 outline-none transition focus:border-blue-400 dark:border-gray-700 dark:text-white"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            搜索
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            刷新
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              快捷设置分销角色
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              搜索普通用户、代理或分销用户后可快速调整；渠道主请在单独页面维护。
            </p>
          </div>
        </div>

        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={handleCandidateSearch}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={candidateSearch}
              onChange={(event) => setCandidateSearch(event.target.value)}
              placeholder="搜索要设为分销的用户"
              className="w-full rounded-xl border border-gray-200 bg-transparent py-2.5 pr-4 pl-10 text-sm text-gray-900 outline-none transition focus:border-amber-400 dark:border-gray-700 dark:text-white"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-600"
          >
            搜索用户
          </button>
        </form>

        <div className="mt-4 space-y-3">
          {candidateLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              正在搜索用户...
            </div>
          ) : candidateSearch.trim() && candidateUsers.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              没有搜索到可操作的普通用户、代理或分销用户
            </div>
          ) : null}

          {candidateUsers.map((user) => {
            const isDistributor = user.role === "distributor";
            const isAgent = user.role === "agent";
            return (
              <div
                key={user.id}
                className="flex flex-col gap-3 rounded-2xl border border-gray-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800"
              >
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {user.email}
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    当前角色: {user.role || "user"}，当前返佣:{" "}
                    {formatPercent(user.commission_rate)}
                  </div>
                </div>
                <div className="flex min-w-[300px] flex-col gap-2">
                  {!isDistributor ? (
                    <>
                      <select
                        value={candidateChannelPartnerDrafts[user.id] ?? ""}
                        onChange={(event) =>
                          setCandidateChannelPartnerDrafts((prev) => ({
                            ...prev,
                            [user.id]: event.target.value,
                          }))
                        }
                        className="rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-amber-400 dark:border-gray-700 dark:text-white"
                      >
                        <option value="">未绑定渠道主</option>
                        {channelPartners.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.email}
                          </option>
                        ))}
                      </select>
                      <select
                        value={candidateAgentOwnerDrafts[user.id] ?? ""}
                        onChange={(event) => {
                          const nextAgentOwnerID = event.target.value;
                          const selectedAgent = agents.find(
                            (item) => String(item.id) === nextAgentOwnerID,
                          );
                          setCandidateAgentOwnerDrafts((prev) => ({
                            ...prev,
                            [user.id]: nextAgentOwnerID,
                          }));
                          if (selectedAgent?.channel_partner_id) {
                            setCandidateChannelPartnerDrafts((prev) => ({
                              ...prev,
                              [user.id]: String(
                                selectedAgent.channel_partner_id,
                              ),
                            }));
                          }
                        }}
                        className="rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-amber-400 dark:border-gray-700 dark:text-white"
                      >
                        <option value="">未绑定代理</option>
                        {agents.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.email}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void handleSwitchRole(
                          user,
                          isDistributor ? "user" : "distributor",
                        )
                      }
                      disabled={switchingId === user.id}
                      className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-70 ${
                        isDistributor
                          ? "bg-red-500 hover:bg-red-600"
                          : "bg-emerald-500 hover:bg-emerald-600"
                      }`}
                    >
                      {switchingId === user.id ? (
                        "处理中..."
                      ) : isDistributor ? (
                        <>
                          <UserX className="mr-2 h-4 w-4" />
                          取消分销
                        </>
                      ) : (
                        <>
                          <UserPlus className="mr-2 h-4 w-4" />
                          {isAgent ? "转为分销并绑定" : "设为分销并绑定"}
                        </>
                      )}
                    </button>
                    {isDistributor && (
                      <button
                        type="button"
                        onClick={() => void handleSwitchRole(user, "agent")}
                        disabled={switchingId === user.id}
                        className="inline-flex items-center justify-center rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        转为代理
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.7fr,1fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                分销角色用户列表
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                这里只展示 `distributor` 角色的用户列表。
              </p>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              第 {pagination.page} / {totalPages} 页
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-3 py-3">用户</th>
                  <th className="px-3 py-3">状态</th>
                  <th className="px-3 py-3">渠道主</th>
                  <th className="px-3 py-3">所属代理</th>
                  <th className="px-3 py-3">修改归属</th>
                  <th className="px-3 py-3">佣金余额</th>
                  <th className="px-3 py-3">返佣比例</th>
                  <th className="px-3 py-3">注册时间</th>
                  <th className="px-3 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-8 text-center text-gray-500 dark:text-gray-400"
                    >
                      正在加载分销角色用户...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-8 text-center text-gray-500 dark:text-gray-400"
                    >
                      当前没有匹配的分销角色用户
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-gray-100 align-top dark:border-gray-800/70"
                    >
                      <td className="px-3 py-4">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {user.email}
                        </div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          用户名: {user.username || "-"} / ID: {user.id}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(user.status)}`}
                        >
                          {user.status === "disabled" ? "已禁用" : "已启用"}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-gray-500 dark:text-gray-400">
                        {user.channel_partner_id
                          ? channelPartners.find(
                              (item) => item.id === user.channel_partner_id,
                            )?.email || `#${user.channel_partner_id}`
                          : "-"}
                      </td>
                      <td className="px-3 py-4 text-gray-500 dark:text-gray-400">
                        {user.agent_owner_id
                          ? agents.find(
                              (item) => item.id === user.agent_owner_id,
                            )?.email || `#${user.agent_owner_id}`
                          : "-"}
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex min-w-[260px] flex-col gap-2">
                          <select
                            value={channelPartnerDrafts[user.id] ?? ""}
                            onChange={(event) =>
                              setChannelPartnerDrafts((prev) => ({
                                ...prev,
                                [user.id]: event.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-400 dark:border-gray-700 dark:text-white"
                          >
                            <option value="">未绑定渠道主</option>
                            {channelPartners.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.email}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-2">
                            <select
                              value={agentOwnerDrafts[user.id] ?? ""}
                              onChange={(event) => {
                                const nextAgentOwnerID = event.target.value;
                                const selectedAgent = agents.find(
                                  (item) =>
                                    String(item.id) === nextAgentOwnerID,
                                );
                                setAgentOwnerDrafts((prev) => ({
                                  ...prev,
                                  [user.id]: nextAgentOwnerID,
                                }));
                                if (selectedAgent?.channel_partner_id) {
                                  setChannelPartnerDrafts((prev) => ({
                                    ...prev,
                                    [user.id]: String(
                                      selectedAgent.channel_partner_id,
                                    ),
                                  }));
                                }
                              }}
                              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-400 dark:border-gray-700 dark:text-white"
                            >
                              <option value="">未绑定代理</option>
                              {agents.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.email}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => void handleSaveOwners(user)}
                              disabled={ownerSavingId === user.id}
                              className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-medium text-violet-600 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-violet-900/40 dark:text-violet-300 dark:hover:bg-violet-950/30"
                            >
                              {ownerSavingId === user.id ? "保存中..." : "保存"}
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-gray-900 dark:text-white">
                        {formatCurrency(user.commission_balance)}
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex min-w-[180px] items-center gap-2">
                          <input
                            value={rateDrafts[user.id] ?? ""}
                            onChange={(event) =>
                              setRateDrafts((prev) => ({
                                ...prev,
                                [user.id]: event.target.value,
                              }))
                            }
                            className="w-24 rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-400 dark:border-gray-700 dark:text-white"
                          />
                          <span className="text-gray-500 dark:text-gray-400">
                            %
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleSaveRate(user)}
                            disabled={savingId === user.id}
                            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {savingId === user.id ? "保存中..." : "保存"}
                          </button>
                        </div>
                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          当前值: {formatPercent(user.commission_rate)}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-gray-500 dark:text-gray-400">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(user)}
                            disabled={switchingId === user.id}
                            className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                              user.status === "disabled"
                                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                : "bg-red-600 text-white hover:bg-red-700"
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            {switchingId === user.id
                              ? "处理中..."
                              : user.status === "disabled"
                                ? "启用"
                                : "禁用"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSwitchRole(user, "agent")}
                            disabled={switchingId === user.id}
                            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            转为代理
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSwitchRole(user, "user")}
                            disabled={switchingId === user.id}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            设为普通用户
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              当前拆分原则
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
              <div>这里是 `admin` 视角的分销人员管理页。</div>
              <div>`agent` 下的分销目录继续承接代理自己的业务视角。</div>
              <div>原 `/admin/affiliate` 仍然只负责平台佣金结算与流水。</div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              后续待接字段
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
              <div>所属代理详情</div>
              <div>渠道邀请码 / 推广链接</div>
              <div>终端用户转化数据</div>
              <div>独立结算周期与生效时间</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
