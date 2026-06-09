'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Power, RefreshCw, Search, TestTube2 } from 'lucide-react';
import { listAdminAccounts, testAdminAccount, updateAdminAccount, type AdminAccount } from '@/lib/admin-api';

const PAGE_SIZE = 20;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

export default function AdminAccountsPage() {
  const [items, setItems] = useState<AdminAccount[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = useCallback(async (targetPage = page) => {
    setLoading(true);
    setError('');
    try {
      const result = await listAdminAccounts({
        page: targetPage,
        page_size: PAGE_SIZE,
        keyword: search || undefined,
        status: status || undefined,
        sort_by: 'created_at',
        sort_order: 'desc',
      });
      setItems(result.items || []);
      setPage(result.page || targetPage);
      setTotal(result.total || 0);
    } catch (e) {
      setError(getErrorMessage(e, '加载账号列表失败'));
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    void loadData(1);
  }, [loadData]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleToggle = async (account: AdminAccount) => {
    const nextStatus = account.status === 'active' ? 'inactive' : 'active';
    setBusyId(account.id);
    setError('');
    setSuccess('');
    try {
      await updateAdminAccount(account.id, { status: nextStatus });
      setSuccess(nextStatus === 'active' ? '账号已启用' : '账号已停用');
      await loadData(page);
    } catch (e) {
      setError(getErrorMessage(e, '更新账号状态失败'));
    } finally {
      setBusyId(null);
    }
  };

  const handleTest = async (account: AdminAccount) => {
    setTestingId(account.id);
    setError('');
    setSuccess('');
    try {
      const result = await testAdminAccount(account.id) as { message?: string };
      setSuccess(result.message || `账号 ${account.name || account.id} 测试完成`);
    } catch (e) {
      setError(getErrorMessage(e, '测试账号失败'));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">账号管理</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">先恢复为稳定版，保留列表、筛选、启停和测试功能，避免后台继续点开报错。</p>
        </div>
        <button type="button" onClick={() => void loadData(page)} className="inline-flex items-center gap-2 self-start rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
        </button>
      </div>

      {(error || success) && <div className={`rounded-2xl px-4 py-3 text-sm ${error ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300' : 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>{error || success}</div>}

      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索账号名、平台、备注或分组" className="w-full rounded-2xl border border-gray-200 bg-transparent py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-400 dark:border-gray-700 dark:text-white" />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white">
              <option value="">全部状态</option>
              <option value="active">启用</option>
              <option value="inactive">停用</option>
              <option value="disabled">禁用</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void loadData(1)} className="rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-gray-900">搜索</button>
            <button type="button" onClick={() => { setSearch(''); setStatus(''); setSuccess(''); }} className="rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">重置</button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40">
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3 font-medium">账号</th>
                  <th className="px-4 py-3 font-medium">平台</th>
                  <th className="px-4 py-3 font-medium">类型</th>
                  <th className="px-4 py-3 font-medium">分组</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">调度</th>
                  <th className="px-4 py-3 font-medium">最近使用</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">正在加载账号列表...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">当前筛选条件下暂无账号</td></tr>
                ) : items.map((account) => (
                  <tr key={account.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-4 py-3"><div className="font-medium text-gray-900 dark:text-white">{account.name || `#${account.id}`}</div><div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{account.notes || `ID: ${account.id}`}</div></td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{account.platform || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{account.type || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{account.group_name || account.group || '-'}</td>
                    <td className="px-4 py-3"><span className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">{account.status || 'unknown'}</span></td>
                    <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${account.schedulable === false ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300' : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300'}`}>{account.schedulable === false ? '暂停调度' : '可调度'}</span></td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(account.last_used_at || account.created_at)}</td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void handleTest(account)} disabled={testingId === account.id} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">{testingId === account.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube2 className="h-3.5 w-3.5" />}{testingId === account.id ? '测试中...' : '测试'}</button>
                      <button type="button" onClick={() => void handleToggle(account)} disabled={busyId === account.id} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60">{busyId === account.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}{busyId === account.id ? '处理中...' : account.status === 'active' ? '停用' : '启用'}</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <div>第 {page} / {totalPages} 页，共 {total} 个账号</div>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => void loadData(page - 1)} className="rounded-lg border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">上一页</button>
            <button type="button" disabled={page >= totalPages || loading} onClick={() => void loadData(page + 1)} className="rounded-lg border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">下一页</button>
          </div>
        </div>
      </div>
    </div>
  );
}