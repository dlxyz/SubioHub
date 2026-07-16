"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  UserCircle,
  Users,
} from "lucide-react";
import { listPartnerAgents, listPartnerDistributors } from "@/lib/partner-api";
import type { AdminUser, PaginatedResult } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

function formatAgentLabel(
  id: number | null | undefined,
  agentMap: Map<number, AdminUser>,
): string {
  if (id == null) return "";
  const agent = agentMap.get(id);
  if (agent) {
    return agent.email;
  }
  return `Agent #${id}`;
}

export default function PartnerDistributorsPage() {
  const [data, setData] = useState<PaginatedResult<AdminUser>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [agentMap, setAgentMap] = useState<Map<number, AdminUser>>(new Map());
  const mountRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, unknown> = {
        page,
        page_size: PAGE_SIZE,
      };
      if (committedSearch.trim()) {
        params.search = committedSearch.trim();
      }
      if (statusFilter) {
        params.status = statusFilter;
      }
      const result = await listPartnerDistributors(params);
      setData(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "获取分销人员列表失败";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, committedSearch, statusFilter]);

  useEffect(() => {
    if (mountRef.current) {
      void load();
    } else {
      mountRef.current = true;
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, committedSearch, statusFilter]);

  // Load all agents once for name resolution
  useEffect(() => {
    void listPartnerAgents({ page: 1, page_size: 1000 }).then((result) => {
      const map = new Map<number, AdminUser>();
      result.items.forEach((agent) => {
        map.set(agent.id, agent);
      });
      setAgentMap(map);
    }).catch(() => { /* silently ignore */ });
  }, []);

  const handleSearch = () => {
    setCommittedSearch(searchInput);
    setPage(1);
  };

  const handleRefresh = () => {
    setSearchInput("");
    setCommittedSearch("");
    setStatusFilter("");
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            分销人员管理
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            查看归属于本渠道主及下级代理人的所有分销人员
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          刷新
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索邮箱或用户名..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-gray-200 dark:placeholder:text-gray-500"
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="appearance-none rounded-xl border border-gray-200 bg-white px-4 py-2.5 pr-10 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-gray-200"
          >
            <option value="">全部状态</option>
            <option value="active">启用</option>
            <option value="disabled">禁用</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
        <button
          onClick={handleSearch}
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          搜索
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        {error && (
          <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/30">
              <tr>
                <th className="px-6 py-4 font-medium text-gray-600 dark:text-gray-400">
                  分销人员
                </th>
                <th className="px-6 py-4 font-medium text-gray-600 dark:text-gray-400">
                  所属代理人
                </th>
                <th className="px-6 py-4 font-medium text-gray-600 dark:text-gray-400">
                  状态
                </th>
                <th className="px-6 py-4 font-medium text-gray-600 dark:text-gray-400">
                  返佣比例
                </th>
                <th className="px-6 py-4 font-medium text-gray-600 dark:text-gray-400">
                  创建时间
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading && data.items.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-gray-400"
                  >
                    <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin" />
                    加载中...
                  </td>
                </tr>
              ) : data.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Users className="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
                    <p className="text-gray-500 dark:text-gray-400">
                      暂无分销人员
                    </p>
                  </td>
                </tr>
              ) : (
                data.items.map((user) => (
                  <tr
                    key={user.id}
                    className="transition hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                          <UserCircle className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {user.username || user.email}
                          </div>
                          <div className="text-xs text-gray-400">
                            ID: {user.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                      {user.agent_owner_id ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800">
                          {formatAgentLabel(user.agent_owner_id, agentMap)}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
                          user.status === "active"
                            ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400"
                            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
                        )}
                      >
                        {user.status === "active" ? "启用" : "禁用"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                      {user.commission_rate != null
                        ? `${user.commission_rate}%`
                        : "-"}
                    </td>
                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString("zh-CN")
                        : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 dark:border-gray-800">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              共 {data.total} 条，第 {page} / {totalPages} 页
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={cn(
                      "rounded-lg px-3 py-1 text-sm font-medium transition",
                      page === pageNum
                        ? "bg-blue-600 text-white"
                        : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
