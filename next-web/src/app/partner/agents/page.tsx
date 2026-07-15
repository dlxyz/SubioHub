"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  RefreshCcw,
  Search,
  ShieldAlert,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  createPartnerAgent,
  listPartnerAgents,
  updatePartnerAgentRate,
  updatePartnerAgentStatus,
} from "@/lib/partner-api";
import type { AdminUser } from "@/lib/admin-api";

const PAGE_SIZE = 10;

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
  return Number(value || 0).toFixed(2);
}

export default function PartnerAgentsPage() {
  const [agents, setAgents] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [rateDrafts, setRateDrafts] = useState<Record<number, string>>({});
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    username: "",
    notes: "",
  });

  const load = useCallback(
    async (page = 1, keyword = search) => {
      setLoading(true);
      setError(null);
      try {
        const result = await listPartnerAgents({
          page,
          page_size: PAGE_SIZE,
          search: keyword || undefined,
        });
        setAgents(result.items);
        setPagination({
          total: result.total,
          page: result.page || page,
          pageSize: result.pageSize || PAGE_SIZE,
        });
        setRateDrafts((prev) => {
          const next = { ...prev };
          result.items.forEach((item) => {
            next[item.id] = ((item.commission_rate || 0) * 100).toFixed(2);
          });
          return next;
        });
      } catch (loadError: unknown) {
        setError(getErrorMessage(loadError, "加载代理人列表失败"));
      } finally {
        setLoading(false);
      }
    },
    [search],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const handleCreateAgent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    setCreateSuccess("");
    try {
      await createPartnerAgent({
        email: createForm.email.trim(),
        password: createForm.password,
        username: createForm.username.trim() || undefined,
        notes: createForm.notes.trim() || undefined,
      });
      setCreateSuccess(`代理人 ${createForm.email.trim()} 创建成功`);
      setCreateForm({
        email: "",
        password: "",
        username: "",
        notes: "",
      });
      setShowCreateModal(false);
      await load(1, search);
    } catch (submitError: unknown) {
      setCreateError(getErrorMessage(submitError, "新增代理人失败"));
    } finally {
      setCreating(false);
    }
  };

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await load(1, search);
  };

  const handleRefresh = async () => {
    await load(pagination.page, search);
  };

  const handleSaveRate = async (userItem: AdminUser) => {
    const draft = Number(rateDrafts[userItem.id]);
    if (Number.isNaN(draft) || draft < 0 || draft > 100) {
      setError("代理人提成比例必须在 0 到 100 之间");
      return;
    }

    setSavingId(userItem.id);
    setError(null);
    setCreateSuccess("");
    try {
      await updatePartnerAgentRate(userItem.id, draft / 100);
      setAgents((prev) =>
        prev.map((item) =>
          item.id === userItem.id
            ? { ...item, commission_rate: draft / 100 }
            : item,
        ),
      );
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError, "更新代理人提成失败"));
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleStatus = async (userItem: AdminUser) => {
    const nextStatus = userItem.status === "disabled" ? "active" : "disabled";
    setSavingId(userItem.id);
    setError(null);
    try {
      const updated = await updatePartnerAgentStatus(userItem.id, nextStatus);
      setAgents((prev) =>
        prev.map((item) =>
          item.id === userItem.id ? { ...item, ...updated } : item,
        ),
      );
    } catch (statusError: unknown) {
      setError(getErrorMessage(statusError, "更新代理人状态失败"));
    } finally {
      setSavingId(null);
    }
  };

  const summary = useMemo(() => {
    const activeCount = agents.filter(
      (item) => (item.status || "active") !== "disabled",
    ).length;
    const totalBalance = agents.reduce(
      (sum, item) => sum + Number(item.commission_balance || 0),
      0,
    );
    const averageRate = agents.length
      ? agents.reduce(
          (sum, item) => sum + Number(item.commission_rate || 0),
          0,
        ) / agents.length
      : 0;
    return {
      activeCount,
      totalBalance,
      averageRate,
    };
  }, [agents]);

  const totalPages = Math.max(
    1,
    Math.ceil((pagination.total || 0) / (pagination.pageSize || PAGE_SIZE)),
  );

  return (
    <div className="space-y-6">
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-[#1A1A1A] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  添加代理人
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  创建后自动归属到当前渠道主名下。
                </div>
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => setShowCreateModal(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {createError ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                {createError}
              </div>
            ) : null}

            <form className="mt-6 grid gap-4" onSubmit={handleCreateAgent}>
              <label className="block">
                <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  邮箱
                </div>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      email: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                  placeholder="请输入邮箱"
                  disabled={creating}
                />
              </label>

              <label className="block">
                <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  用户名
                </div>
                <input
                  type="text"
                  value={createForm.username}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      username: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                  placeholder="可选"
                  disabled={creating}
                />
              </label>

              <label className="block">
                <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  初始密码
                </div>
                <input
                  type="password"
                  required
                  value={createForm.password}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      password: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                  placeholder="至少 6 位"
                  disabled={creating}
                />
              </label>

              <label className="block">
                <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  备注
                </div>
                <input
                  type="text"
                  value={createForm.notes}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      notes: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                  placeholder="可选"
                  disabled={creating}
                />
              </label>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? "创建中..." : "创建代理人"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
          渠道代理
        </div>
        <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">
          代理人管理
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">
          当前页面仅管理归属于当前渠道主的代理人账号，支持新增代理人、修改启停状态以及维护提成比例。
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <Users className="h-4 w-4 text-blue-500" />
              代理总数
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
              {loading ? "..." : pagination.total}
            </div>
          </div>
          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <ShieldAlert className="h-4 w-4 text-emerald-500" />
              当前页启用数
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
              {loading ? "..." : summary.activeCount}
            </div>
          </div>
          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <Building2 className="h-4 w-4 text-violet-500" />
              平均提成
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
              {loading ? "..." : formatPercent(summary.averageRate)}
            </div>
          </div>
          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <Building2 className="h-4 w-4 text-amber-500" />
              当前页佣金余额
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
              {loading ? "..." : formatCurrency(summary.totalBalance)}
            </div>
          </div>
        </div>

        {createSuccess ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
            {createSuccess}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-3xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A] dark:text-gray-400">
          正在加载代理人数据...
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-600 shadow-sm dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      ) : (
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                代理人列表
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                查看当前渠道主管辖的代理人状态、佣金余额和提成比例。
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <form
                className="flex w-full gap-2 sm:w-auto"
                onSubmit={handleSearch}
              >
                <div className="relative min-w-0 flex-1 sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索邮箱/用户名"
                    className="w-full rounded-2xl border border-gray-200 py-3 pl-9 pr-4 text-sm text-gray-900 outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-black dark:bg-white dark:text-gray-900"
                >
                  搜索
                </button>
              </form>
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex items-center justify-center rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                刷新
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateError("");
                  setShowCreateModal(true);
                }}
                className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                添加代理人
              </button>
            </div>
          </div>

          {agents.length === 0 ? (
            <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">
              当前还没有代理人
            </div>
          ) : (
            <>
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                      <th className="px-3 py-3">ID</th>
                      <th className="px-3 py-3">用户</th>
                      <th className="px-3 py-3">状态</th>
                      <th className="px-3 py-3">佣金余额</th>
                      <th className="px-3 py-3">提成比例</th>
                      <th className="px-3 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-gray-100 align-top dark:border-gray-800/70"
                      >
                        <td className="px-3 py-4 text-gray-900 dark:text-white">
                          {item.id}
                        </td>
                        <td className="px-3 py-4">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {item.email}
                          </div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {item.username || "未设置用户名"}
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              item.status === "disabled"
                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                            }`}
                          >
                            {item.status === "disabled" ? "已禁用" : "启用中"}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-gray-900 dark:text-white">
                          {formatCurrency(item.commission_balance)}
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={
                                rateDrafts[item.id] ??
                                ((item.commission_rate || 0) * 100).toFixed(2)
                              }
                              onChange={(event) =>
                                setRateDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: event.target.value,
                                }))
                              }
                              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 sm:w-28 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => void handleSaveRate(item)}
                              disabled={savingId === item.id}
                              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              保存
                            </button>
                          </div>
                          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            当前 {formatPercent(item.commission_rate)}
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(item)}
                            disabled={savingId === item.id}
                            className={`rounded-xl px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                              item.status === "disabled"
                                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300"
                                : "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300"
                            }`}
                          >
                            {item.status === "disabled" ? "启用" : "禁用"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  第 {pagination.page} / {totalPages} 页，共 {pagination.total}{" "}
                  个代理人
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pagination.page <= 1}
                    onClick={() => void load(pagination.page - 1, search)}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    disabled={pagination.page >= totalPages}
                    onClick={() => void load(pagination.page + 1, search)}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <Link
        href="/partner"
        className="inline-flex text-sm font-medium text-blue-600 transition hover:text-blue-700"
      >
        返回渠道后台首页
      </Link>
    </div>
  );
}
