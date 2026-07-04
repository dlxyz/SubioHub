'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Percent, RefreshCcw, Search, ShieldCheck, UserPlus, UserX, Users } from 'lucide-react';
import { listAdminUsers, updateAdminAffiliateUserRate, updateAdminUser, type AdminUser } from '@/lib/admin-api';

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

export default function AdminAgentManagementPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [switchingRoleId, setSwitchingRoleId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateUsers, setCandidateUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
  });
  const [rateDrafts, setRateDrafts] = useState<Record<number, string>>({});

  const loadUsers = useCallback(async (page = 1, keyword = search) => {
    setLoading(true);
    setError('');
    try {
      const result = await listAdminUsers({
        page,
        page_size: PAGE_SIZE,
        role: 'agent',
        search: keyword || undefined,
      });
      setUsers(result.items);
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
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError, '加载代理用户列表失败'));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers(1, '');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers]);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    setSuccess('');
    await loadUsers(1, search);
  };

  const handleRefresh = async () => {
    setSuccess('');
    await loadUsers(pagination.page, search);
  };

  const loadCandidateUsers = useCallback(async (keyword = candidateSearch) => {
    if (!keyword.trim()) {
      setCandidateUsers([]);
      return;
    }
    setCandidateLoading(true);
    setError('');
    try {
      const result = await listAdminUsers({
        page: 1,
        page_size: 8,
        search: keyword.trim(),
      });
      setCandidateUsers(result.items.filter((user) => user.role !== 'admin'));
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError, '加载候选用户失败'));
    } finally {
      setCandidateLoading(false);
    }
  }, [candidateSearch]);

  const handleSaveRate = async (user: AdminUser) => {
    const draft = Number(rateDrafts[user.id]);
    if (Number.isNaN(draft) || draft < 0 || draft > 100) {
      setError('提成百分比例必须在 0 到 100 之间');
      return;
    }

    setSavingId(user.id);
    setError('');
    setSuccess('');
    try {
      await updateAdminAffiliateUserRate(user.id, draft / 100);
      setSuccess(`代理用户 ${user.email} 的提成比例已更新为 ${draft.toFixed(2)}%`);
      setUsers((prev) =>
        prev.map((item) => (item.id === user.id ? { ...item, commission_rate: draft / 100 } : item))
      );
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError, '更新提成比例失败'));
    } finally {
      setSavingId(null);
    }
  };

  const handleCandidateSearch = async (e: FormEvent) => {
    e.preventDefault();
    setSuccess('');
    await loadCandidateUsers(candidateSearch);
  };

  const handleSwitchRole = async (user: AdminUser, role: 'user' | 'agent' | 'distributor') => {
    setSwitchingRoleId(user.id);
    setError('');
    setSuccess('');
    try {
      const updated = await updateAdminUser(user.id, { role });
      if ((updated.role || 'user') !== role) {
        throw new Error('角色切换未生效，请稍后刷新后重试');
      }
      setSuccess(
        role === 'agent'
          ? `已将 ${user.email} 设为代理`
          : role === 'distributor'
            ? `已将 ${user.email} 设为分销`
            : `已取消 ${user.email} 的代理角色`
      );
      await loadUsers(1, search);
      await loadCandidateUsers(candidateSearch);
    } catch (switchError: unknown) {
      setError(getErrorMessage(switchError, '切换代理角色失败'));
    } finally {
      setSwitchingRoleId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.pageSize || PAGE_SIZE)));
  const summary = useMemo(() => {
    const activeAgents = users.filter((user) => user.status !== 'disabled').length;
    const averageRate =
      users.length > 0
        ? users.reduce((sum, user) => sum + Number(user.commission_rate || 0), 0) / users.length
        : 0;
    return {
      activeAgents,
      averageRate,
    };
  }, [users]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">代理管理</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            这里只展示 `agent` 角色的用户列表，并可直接为代理用户设置提成百分比例。
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/users"
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            去用户管理
          </Link>
          <Link
            href="/admin/affiliate"
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            去分销管理
          </Link>
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

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">代理用户总数</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
                {loading ? '...' : pagination.total}
              </p>
            </div>
            <Users className="h-6 w-6 text-blue-500" />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">当前页活跃代理</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
                {loading ? '...' : summary.activeAgents}
              </p>
            </div>
            <ShieldCheck className="h-6 w-6 text-emerald-500" />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">当前页平均提成</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
                {loading ? '...' : formatPercent(summary.averageRate)}
              </p>
            </div>
            <Percent className="h-6 w-6 text-amber-500" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSearch}>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索代理邮箱/用户名"
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
            onClick={() => void handleRefresh()}
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
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">快捷设置代理角色</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              搜索非管理员用户后可直接设为代理；已是代理的用户也可在这里直接取消代理。
            </p>
          </div>
        </div>

        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={handleCandidateSearch}>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={candidateSearch}
              onChange={(e) => setCandidateSearch(e.target.value)}
              placeholder="搜索要设为代理的用户"
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
            <div className="text-sm text-gray-500 dark:text-gray-400">正在搜索用户...</div>
          ) : candidateSearch.trim() && candidateUsers.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">没有搜索到可操作的普通用户或代理用户</div>
          ) : null}

          {candidateUsers.map((user) => {
            const isAgent = user.role === 'agent';
            const isDistributor = user.role === 'distributor';
            return (
              <div
                key={user.id}
                className="flex flex-col gap-3 rounded-2xl border border-gray-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800"
              >
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">{user.email}</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    当前角色: {user.role || 'user'}，当前提成: {formatPercent(user.commission_rate)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSwitchRole(user, isAgent ? 'user' : 'agent')}
                  disabled={switchingRoleId === user.id}
                  className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-70 ${
                    isAgent ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'
                  }`}
                >
                  {switchingRoleId === user.id ? (
                    '处理中...'
                  ) : isAgent ? (
                    <>
                      <UserX className="mr-2 h-4 w-4" />
                      取消代理
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      {isDistributor ? '转为代理' : '设为代理'}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">代理用户</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">当前提成</th>
                <th className="px-4 py-3 font-medium">设置提成百分比</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                    正在加载代理用户列表...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                    暂无 agent 角色用户
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-t border-gray-100 dark:border-gray-800/70">
                    <td className="px-4 py-4 text-gray-900 dark:text-white">{user.id}</td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-gray-900 dark:text-white">{user.email}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {user.username || '未设置用户名'}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          user.status === 'disabled'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        }`}
                      >
                        {user.status || 'active'}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-medium text-gray-900 dark:text-white">
                      {formatPercent(user.commission_rate)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex max-w-[180px] items-center gap-2">
                        <input
                          value={rateDrafts[user.id] ?? '0.00'}
                          onChange={(e) =>
                            setRateDrafts((prev) => ({
                              ...prev,
                              [user.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-400 dark:border-gray-700 dark:text-white"
                        />
                        <span className="text-sm text-gray-500 dark:text-gray-400">%</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSaveRate(user)}
                          disabled={savingId === user.id}
                          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {savingId === user.id ? '保存中...' : '保存比例'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSwitchRole(user, 'user')}
                          disabled={switchingRoleId === user.id}
                          className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {switchingRoleId === user.id ? '处理中...' : '取消代理'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-4 text-sm text-gray-500 dark:border-gray-800/70 dark:text-gray-400">
          <div>
            第 {pagination.page} / {totalPages} 页，共 {pagination.total} 个代理用户
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadUsers(Math.max(1, pagination.page - 1), search)}
              disabled={pagination.page <= 1 || loading}
              className="rounded-xl border border-gray-200 px-3 py-2 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              上一页
            </button>
            <button
              type="button"
              onClick={() => void loadUsers(Math.min(totalPages, pagination.page + 1), search)}
              disabled={pagination.page >= totalPages || loading}
              className="rounded-xl border border-gray-200 px-3 py-2 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
