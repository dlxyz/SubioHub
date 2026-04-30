'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  cancelAdminUsageCleanupTask,
  createAdminUsageCleanupTask,
  getAdminUsageStats,
  listAdminGroups,
  listAdminUsageCleanupTasks,
  listAdminUsageLogs,
  type AdminGroup,
  type AdminUsageCleanupTask,
  type AdminUsageLog,
  type AdminUsageStats,
} from '@/lib/admin-api';

const PAGE_SIZE = 20;
const CLEANUP_PAGE_SIZE = 10;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatCurrency(value?: number) {
  return `$${Number(value || 0).toFixed(4)}`;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function statusClass(status: string) {
  switch (status.toLowerCase()) {
    case 'done':
    case 'completed':
    case 'succeeded':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'running':
    case 'processing':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'pending':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    case 'failed':
    case 'error':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    case 'canceled':
    case 'cancelled':
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
}

export default function AdminUsagePage() {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [stats, setStats] = useState<AdminUsageStats | null>(null);
  const [logs, setLogs] = useState<AdminUsageLog[]>([]);
  const [cleanupTasks, setCleanupTasks] = useState<AdminUsageCleanupTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleanupLoading, setCleanupLoading] = useState(true);
  const [submittingCleanup, setSubmittingCleanup] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filters, setFilters] = useState({
    period: 'today',
    start_date: '',
    end_date: '',
    user_id: '',
    api_key_id: '',
    account_id: '',
    group_id: '',
    model: '',
    request_type: '',
    billing_mode: '',
    stream: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
  });
  const [cleanupPagination, setCleanupPagination] = useState({
    page: 1,
    pageSize: CLEANUP_PAGE_SIZE,
    total: 0,
  });
  const [cleanupForm, setCleanupForm] = useState({
    start_date: '',
    end_date: '',
    user_id: '',
    api_key_id: '',
    account_id: '',
    group_id: '',
    model: '',
    request_type: '',
    stream: '',
    billing_type: '',
  });

  const buildUsageParams = useCallback(
    (page = 1) => ({
      page,
      page_size: PAGE_SIZE,
      exact_total: true,
      period: filters.start_date && filters.end_date ? undefined : filters.period,
      start_date: filters.start_date || undefined,
      end_date: filters.end_date || undefined,
      user_id: filters.user_id || undefined,
      api_key_id: filters.api_key_id || undefined,
      account_id: filters.account_id || undefined,
      group_id: filters.group_id || undefined,
      model: filters.model || undefined,
      request_type: filters.request_type || undefined,
      billing_mode: filters.billing_mode || undefined,
      stream: filters.stream === '' ? undefined : filters.stream === 'true',
      sort_by: 'created_at',
      sort_order: 'desc',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
    [filters]
  );

  const loadUsage = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError('');
      try {
        const params = buildUsageParams(page);
        const [groupResult, statsResult, logsResult] = await Promise.all([
          groups.length ? Promise.resolve({ items: groups }) : listAdminGroups({ page: 1, page_size: 200 }),
          getAdminUsageStats(params),
          listAdminUsageLogs(params),
        ]);
        setGroups(groupResult.items);
        setStats(statsResult);
        setLogs(logsResult.items);
        setPagination({
          page: logsResult.page || page,
          pageSize: logsResult.pageSize || PAGE_SIZE,
          total: logsResult.total,
        });
      } catch (error: unknown) {
        setError(getErrorMessage(error, '加载调用记录失败'));
      } finally {
        setLoading(false);
      }
    },
    [buildUsageParams, groups]
  );

  const loadCleanupTasks = useCallback(async (page = 1) => {
    setCleanupLoading(true);
    try {
      const result = await listAdminUsageCleanupTasks({
        page,
        page_size: CLEANUP_PAGE_SIZE,
      });
      setCleanupTasks(result.items);
      setCleanupPagination({
        page: result.page || page,
        pageSize: result.pageSize || CLEANUP_PAGE_SIZE,
        total: result.total,
      });
    } catch (error: unknown) {
      setError(getErrorMessage(error, '加载清理任务失败'));
    } finally {
      setCleanupLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsage();
      void loadCleanupTasks();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCleanupTasks, loadUsage]);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.pageSize || PAGE_SIZE)));
  const cleanupPages = Math.max(
    1,
    Math.ceil((cleanupPagination.total || 0) / (cleanupPagination.pageSize || CLEANUP_PAGE_SIZE))
  );

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    setSuccess('');
    await loadUsage(1);
  };

  const handleReset = async () => {
    setFilters({
      period: 'today',
      start_date: '',
      end_date: '',
      user_id: '',
      api_key_id: '',
      account_id: '',
      group_id: '',
      model: '',
      request_type: '',
      billing_mode: '',
      stream: '',
    });
    setSuccess('');
    await Promise.all([loadUsage(1), loadCleanupTasks(1)]);
  };

  const handleCreateCleanupTask = async (e: FormEvent) => {
    e.preventDefault();
    setSubmittingCleanup(true);
    setError('');
    setSuccess('');
    try {
      await createAdminUsageCleanupTask({
        start_date: cleanupForm.start_date,
        end_date: cleanupForm.end_date,
        user_id: cleanupForm.user_id ? Number(cleanupForm.user_id) : undefined,
        api_key_id: cleanupForm.api_key_id ? Number(cleanupForm.api_key_id) : undefined,
        account_id: cleanupForm.account_id ? Number(cleanupForm.account_id) : undefined,
        group_id: cleanupForm.group_id ? Number(cleanupForm.group_id) : undefined,
        model: cleanupForm.model || undefined,
        request_type: cleanupForm.request_type || undefined,
        stream: cleanupForm.stream === '' ? undefined : cleanupForm.stream === 'true',
        billing_type: cleanupForm.billing_type ? Number(cleanupForm.billing_type) : undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setSuccess('调用记录清理任务已创建');
      setCleanupForm({
        start_date: '',
        end_date: '',
        user_id: '',
        api_key_id: '',
        account_id: '',
        group_id: '',
        model: '',
        request_type: '',
        stream: '',
        billing_type: '',
      });
      await loadCleanupTasks(1);
    } catch (error: unknown) {
      setError(getErrorMessage(error, '创建清理任务失败'));
    } finally {
      setSubmittingCleanup(false);
    }
  };

  const handleCancelCleanupTask = async (task: AdminUsageCleanupTask) => {
    setError('');
    setSuccess('');
    try {
      await cancelAdminUsageCleanupTask(task.id);
      setSuccess(`清理任务 #${task.id} 已取消`);
      await loadCleanupTasks(cleanupPagination.page);
    } catch (error: unknown) {
      setError(getErrorMessage(error, '取消清理任务失败'));
    }
  };

  const logSummary = useMemo(
    () => ({
      totalCost: logs.reduce((sum, item) => sum + Number(item.total_cost || 0), 0),
      totalActualCost: logs.reduce((sum, item) => sum + Number(item.actual_cost || 0), 0),
      avgLatency:
        logs.length > 0
          ? logs.reduce((sum, item) => sum + Number(item.duration_ms || 0), 0) / Math.max(logs.length, 1)
          : 0,
    }),
    [logs]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">调用记录</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            查看调用统计、关键筛选、日志列表与清理任务入口。
          </p>
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="text-sm text-gray-500 dark:text-gray-400">请求总数</div>
          <div className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
            {loading ? '...' : stats?.total_requests ?? 0}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="text-sm text-gray-500 dark:text-gray-400">总 Tokens</div>
          <div className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
            {loading ? '...' : stats?.total_tokens ?? 0}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="text-sm text-gray-500 dark:text-gray-400">用户成本</div>
          <div className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
            {loading ? '...' : formatCurrency(stats?.total_cost)}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="text-sm text-gray-500 dark:text-gray-400">实际成本</div>
          <div className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
            {loading ? '...' : formatCurrency(stats?.total_actual_cost)}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="text-sm text-gray-500 dark:text-gray-400">平均耗时</div>
          <div className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
            {loading ? '...' : `${Math.round(stats?.average_duration_ms ?? 0)} ms`}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <form onSubmit={handleSearch} className="grid gap-3 lg:grid-cols-5">
          <select
            value={filters.period}
            onChange={(e) => setFilters((prev) => ({ ...prev, period: e.target.value }))}
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
          >
            <option value="today">今天</option>
            <option value="week">近 7 天</option>
            <option value="month">近 30 天</option>
          </select>
          <input
            type="date"
            value={filters.start_date}
            onChange={(e) => setFilters((prev) => ({ ...prev, start_date: e.target.value }))}
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <input
            type="date"
            value={filters.end_date}
            onChange={(e) => setFilters((prev) => ({ ...prev, end_date: e.target.value }))}
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <input
            value={filters.user_id}
            onChange={(e) => setFilters((prev) => ({ ...prev, user_id: e.target.value }))}
            placeholder="用户 ID"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <input
            value={filters.api_key_id}
            onChange={(e) => setFilters((prev) => ({ ...prev, api_key_id: e.target.value }))}
            placeholder="API Key ID"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <input
            value={filters.account_id}
            onChange={(e) => setFilters((prev) => ({ ...prev, account_id: e.target.value }))}
            placeholder="账号 ID"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <select
            value={filters.group_id}
            onChange={(e) => setFilters((prev) => ({ ...prev, group_id: e.target.value }))}
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
          >
            <option value="">全部分组</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <input
            value={filters.model}
            onChange={(e) => setFilters((prev) => ({ ...prev, model: e.target.value }))}
            placeholder="模型名"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <select
            value={filters.request_type}
            onChange={(e) => setFilters((prev) => ({ ...prev, request_type: e.target.value }))}
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
          >
            <option value="">全部请求类型</option>
            <option value="chat_completions">chat_completions</option>
            <option value="responses">responses</option>
            <option value="embeddings">embeddings</option>
            <option value="images">images</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={filters.billing_mode}
              onChange={(e) => setFilters((prev) => ({ ...prev, billing_mode: e.target.value }))}
              className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
            >
              <option value="">全部计费模式</option>
              <option value="token">token</option>
              <option value="image">image</option>
            </select>
            <select
              value={filters.stream}
              onChange={(e) => setFilters((prev) => ({ ...prev, stream: e.target.value }))}
              className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
            >
              <option value="">全部流式</option>
              <option value="true">stream</option>
              <option value="false">non-stream</option>
            </select>
          </div>
          <div className="flex gap-3 lg:col-span-5">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              查询记录
            </button>
            <button
              type="button"
              onClick={() => void handleReset()}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              重置筛选
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">调用日志</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                当前页用户成本 {formatCurrency(logSummary.totalCost)}，实际成本 {formatCurrency(logSummary.totalActualCost)}，
                平均耗时 {Math.round(logSummary.avgLatency)} ms。
              </p>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              第 {pagination.page} / {totalPages} 页，共 {pagination.total} 条
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr className="text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">时间</th>
                <th className="px-4 py-3 font-medium">用户 / Key</th>
                <th className="px-4 py-3 font-medium">模型</th>
                <th className="px-4 py-3 font-medium">分组 / 账号</th>
                <th className="px-4 py-3 font-medium">Tokens</th>
                <th className="px-4 py-3 font-medium">成本</th>
                <th className="px-4 py-3 font-medium">耗时</th>
                <th className="px-4 py-3 font-medium">来源</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                    正在加载调用日志...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                    当前筛选条件下暂无调用记录
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(log.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900 dark:text-white">{log.user?.email || `用户 #${log.user_id}`}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Key: {log.api_key?.name || log.api_key_id || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900 dark:text-white">{log.model}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {log.upstream_model ? `上游 ${log.upstream_model}` : log.request_type}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900 dark:text-white">{log.group?.name || log.group_id || '-'}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        账号: {log.account?.name || log.account_id || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900 dark:text-white">{log.input_tokens + log.output_tokens}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        In {log.input_tokens} / Out {log.output_tokens}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900 dark:text-white">{formatCurrency(log.total_cost)}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        实际 {formatCurrency(log.actual_cost)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900 dark:text-white">{log.duration_ms ?? '-'} ms</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        首字 {log.first_token_ms ?? '-'} ms
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900 dark:text-white">{log.billing_mode || '-'}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {log.stream ? 'stream' : 'non-stream'} | IP {log.ip_address || '-'}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <div>
            第 {pagination.page} / {totalPages} 页，共 {pagination.total} 条
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1 || loading}
              onClick={() => void loadUsage(pagination.page - 1)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={pagination.page >= totalPages || loading}
              onClick={() => void loadUsage(pagination.page + 1)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">创建清理任务</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            用于批量清理指定时间范围和筛选条件下的调用记录，请谨慎操作。
          </p>

          <form onSubmit={handleCreateCleanupTask} className="mt-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <input
                required
                type="date"
                value={cleanupForm.start_date}
                onChange={(e) => setCleanupForm((prev) => ({ ...prev, start_date: e.target.value }))}
                className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
              />
              <input
                required
                type="date"
                value={cleanupForm.end_date}
                onChange={(e) => setCleanupForm((prev) => ({ ...prev, end_date: e.target.value }))}
                className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
              />
              <input
                value={cleanupForm.user_id}
                onChange={(e) => setCleanupForm((prev) => ({ ...prev, user_id: e.target.value }))}
                placeholder="用户 ID"
                className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
              />
              <input
                value={cleanupForm.api_key_id}
                onChange={(e) => setCleanupForm((prev) => ({ ...prev, api_key_id: e.target.value }))}
                placeholder="API Key ID"
                className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
              />
              <input
                value={cleanupForm.account_id}
                onChange={(e) => setCleanupForm((prev) => ({ ...prev, account_id: e.target.value }))}
                placeholder="账号 ID"
                className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
              />
              <select
                value={cleanupForm.group_id}
                onChange={(e) => setCleanupForm((prev) => ({ ...prev, group_id: e.target.value }))}
                className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
              >
                <option value="">全部分组</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <input
                value={cleanupForm.model}
                onChange={(e) => setCleanupForm((prev) => ({ ...prev, model: e.target.value }))}
                placeholder="模型名"
                className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
              />
              <select
                value={cleanupForm.request_type}
                onChange={(e) => setCleanupForm((prev) => ({ ...prev, request_type: e.target.value }))}
                className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
              >
                <option value="">全部请求类型</option>
                <option value="chat_completions">chat_completions</option>
                <option value="responses">responses</option>
                <option value="embeddings">embeddings</option>
                <option value="images">images</option>
              </select>
              <select
                value={cleanupForm.stream}
                onChange={(e) => setCleanupForm((prev) => ({ ...prev, stream: e.target.value }))}
                className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
              >
                <option value="">全部流式</option>
                <option value="true">stream</option>
                <option value="false">non-stream</option>
              </select>
              <input
                value={cleanupForm.billing_type}
                onChange={(e) => setCleanupForm((prev) => ({ ...prev, billing_type: e.target.value }))}
                placeholder="计费类型"
                className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
              />
            </div>
            <button
              type="submit"
              disabled={submittingCleanup}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {submittingCleanup ? '提交中' : '创建清理任务'}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">清理任务</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">查看任务执行状态并可取消未完成任务。</p>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              第 {cleanupPagination.page} / {cleanupPages} 页
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {cleanupLoading ? (
              <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">正在加载清理任务...</div>
            ) : cleanupTasks.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">暂无清理任务</div>
            ) : (
              cleanupTasks.map((task) => (
                <div key={task.id} className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-gray-900 dark:text-white">任务 #{task.id}</div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(task.status)}`}>
                          {task.status}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        创建于 {formatDate(task.created_at)}，已删除 {task.deleted_rows} 条
                      </div>
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        范围：{formatDate(task.filters.start_time)} 至 {formatDate(task.filters.end_time)}
                      </div>
                      {(task.filters.model || task.filters.user_id || task.filters.group_id) && (
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          条件：用户 {task.filters.user_id || '-'} / 分组 {task.filters.group_id || '-'} / 模型{' '}
                          {task.filters.model || '-'}
                        </div>
                      )}
                      {task.error_message && (
                        <div className="mt-2 text-xs text-red-600 dark:text-red-400">{task.error_message}</div>
                      )}
                    </div>
                    {['pending', 'running'].includes(task.status.toLowerCase()) && (
                      <button
                        type="button"
                        onClick={() => void handleCancelCleanupTask(task)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        取消任务
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              disabled={cleanupPagination.page <= 1 || cleanupLoading}
              onClick={() => void loadCleanupTasks(cleanupPagination.page - 1)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={cleanupPagination.page >= cleanupPages || cleanupLoading}
              onClick={() => void loadCleanupTasks(cleanupPagination.page + 1)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
