'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  Copy,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Ticket,
  Trash2,
  X,
} from 'lucide-react';
import {
  batchDeleteAdminRedeemCodes,
  deleteAdminRedeemCode,
  exportAdminRedeemCodes,
  generateAdminRedeemCodes,
  listAdminGroups,
  listAdminRedeemCodes,
  type AdminGroup,
  type AdminRedeemCode,
} from '@/lib/admin-api';

const PAGE_SIZE = 20;

type RedeemFilters = {
  type: string;
  status: string;
};

type GenerateFormState = {
  type: 'balance' | 'concurrency' | 'subscription' | 'invitation';
  value: string;
  count: string;
  group_id: string;
  validity_days: string;
};

const DEFAULT_GENERATE_FORM: GenerateFormState = {
  type: 'balance',
  value: '10',
  count: '1',
  group_id: '',
  validity_days: '30',
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function ModalShell({
  open,
  title,
  onClose,
  maxWidth = 'max-w-2xl',
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  maxWidth?: string;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div className={`max-h-[92vh] w-full ${maxWidth} overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-[#111111]`}>
        <div className="flex items-center justify-between border-b border-gray-200 px-7 py-6 dark:border-gray-800">
          <h3 className="text-[32px] font-semibold tracking-[-0.03em] text-gray-900 dark:text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[calc(92vh-92px)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">{children}</label>;
}

function sortIndicator(active: boolean, order: 'asc' | 'desc') {
  return (
    <ArrowUpDown
      className={`h-4 w-4 transition ${active ? 'text-emerald-600 dark:text-emerald-300' : 'text-gray-300 dark:text-gray-600'} ${
        active && order === 'desc' ? 'rotate-180' : ''
      }`}
    />
  );
}

function redeemTypeLabel(type: string) {
  switch (type) {
    case 'balance':
      return '余额';
    case 'concurrency':
      return '并发数';
    case 'subscription':
      return '订阅';
    case 'invitation':
      return '邀请码';
    case 'admin_balance':
      return '余额（管理员）';
    case 'admin_concurrency':
      return '并发数（管理员）';
    default:
      return type || '-';
  }
}

function redeemTypeBadgeClass(type: string) {
  if (type === 'balance' || type === 'admin_balance') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300';
  }
  if (type === 'subscription') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300';
  }
  if (type === 'invitation') {
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300';
  }
  return 'bg-violet-100 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300';
}

function redeemStatusLabel(status: string) {
  switch (status) {
    case 'unused':
      return '未使用';
    case 'used':
      return '已使用';
    case 'expired':
      return '已过期';
    default:
      return status || '-';
  }
}

function redeemStatusBadgeClass(status: string) {
  if (status === 'unused') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300';
  }
  if (status === 'used') {
    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
  return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300';
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatRedeemValue(code: AdminRedeemCode) {
  if (code.type === 'balance' || code.type === 'admin_balance') {
    return `$${Number(code.value || 0).toFixed(2)}`;
  }
  if (code.type === 'subscription') {
    const days = code.validity_days || 30;
    const groupName = code.group?.name ? ` (${code.group.name})` : '';
    return `${days} 天${groupName}`;
  }
  if (code.type === 'invitation') {
    return '注册邀请码';
  }
  return String(code.value ?? '-');
}

export default function AdminRedeemPage() {
  const [codes, setCodes] = useState<AdminRedeemCode[]>([]);
  const [subscriptionGroups, setSubscriptionGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<RedeemFilters>({ type: '', status: '' });
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [sortState, setSortState] = useState<{ key: string; order: 'asc' | 'desc' }>({
    key: 'id',
    order: 'desc',
  });
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [generateForm, setGenerateForm] = useState<GenerateFormState>(DEFAULT_GENERATE_FORM);
  const [generatedCodes, setGeneratedCodes] = useState<AdminRedeemCode[]>([]);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeleteUnusedDialog, setShowDeleteUnusedDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminRedeemCode | null>(null);
  const [deleting, setDeleting] = useState(false);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.pageSize || PAGE_SIZE)));

  const generatedCodesText = useMemo(() => generatedCodes.map((item) => item.code).join('\n'), [generatedCodes]);

  const subscriptionOptions = useMemo(
    () => subscriptionGroups.filter((group) => group.subscription_type === 'subscription'),
    [subscriptionGroups]
  );

  const loadCodes = useCallback(
    async (page = 1, nextSearch = search, nextFilters = filters, nextSort = sortState) => {
      setLoading(true);
      setError('');
      try {
        const result = await listAdminRedeemCodes({
          page,
          page_size: pagination.pageSize,
          search: nextSearch || undefined,
          type: nextFilters.type || undefined,
          status: nextFilters.status || undefined,
          sort_by: nextSort.key,
          sort_order: nextSort.order,
        });
        setCodes(result.items);
        setPagination((prev) => ({
          ...prev,
          page: result.page || page,
          pageSize: result.pageSize || prev.pageSize,
          total: result.total || 0,
        }));
      } catch (loadError: unknown) {
        setError(getErrorMessage(loadError, '加载兑换码列表失败'));
      } finally {
        setLoading(false);
      }
    },
    [filters, pagination.pageSize, search, sortState]
  );

  const loadSubscriptionGroups = useCallback(async () => {
    try {
      const result = await listAdminGroups({ page: 1, page_size: 200 });
      setSubscriptionGroups(result.items);
    } catch {
      // Keep silent; group options are optional unless generating subscription codes.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCodes(1, search, filters, sortState);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [filters, loadCodes, search, sortState]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSubscriptionGroups();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSubscriptionGroups]);

  const handleSort = (key: string) => {
    setSortState((prev) => ({
      key,
      order: prev.key === key && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      setError('复制失败，请手动复制');
    }
  };

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(generatedCodesText);
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      setError('复制失败，请手动复制');
    }
  };

  const handleDownloadGenerated = () => {
    const blob = new Blob([generatedCodesText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `redeem-codes-${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCodes = async () => {
    setExporting(true);
    setError('');
    setSuccess('');
    try {
      const blob = await exportAdminRedeemCodes({
        search: search || undefined,
        type: filters.type || undefined,
        status: filters.status || undefined,
        sort_by: sortState.key,
        sort_order: sortState.order,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `redeem-codes-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setSuccess('兑换码 CSV 已导出');
    } catch (exportError: unknown) {
      setError(getErrorMessage(exportError, '导出兑换码失败'));
    } finally {
      setExporting(false);
    }
  };

  const resetGenerateState = () => {
    setShowGenerateDialog(false);
    setGenerateForm(DEFAULT_GENERATE_FORM);
  };

  const handleGenerateCodes = async (event: FormEvent) => {
    event.preventDefault();
    const count = Number(generateForm.count);
    const value = Number(generateForm.value);
    const validityDays = Number(generateForm.validity_days);
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      setError('数量必须在 1 到 100 之间');
      return;
    }
    if (generateForm.type === 'subscription' && !generateForm.group_id) {
      setError('订阅兑换码必须选择分组');
      return;
    }
    if (generateForm.type !== 'invitation' && !Number.isFinite(value)) {
      setError('请输入有效的面值');
      return;
    }
    if (generateForm.type === 'subscription' && (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 365)) {
      setError('订阅有效期必须在 1 到 365 天之间');
      return;
    }

    setGenerating(true);
    setError('');
    setSuccess('');
    try {
      const result = await generateAdminRedeemCodes({
        count,
        type: generateForm.type,
        value: generateForm.type === 'invitation' ? 0 : value,
        group_id: generateForm.type === 'subscription' ? Number(generateForm.group_id) : undefined,
        validity_days: generateForm.type === 'subscription' ? validityDays : undefined,
      });
      setGeneratedCodes(result);
      setShowGenerateDialog(false);
      setShowResultDialog(true);
      setGenerateForm(DEFAULT_GENERATE_FORM);
      setSuccess(`已生成 ${result.length} 个兑换码`);
      await loadCodes(1);
    } catch (generateError: unknown) {
      setError(getErrorMessage(generateError, '生成兑换码失败'));
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenDelete = (code: AdminRedeemCode) => {
    setDeleteTarget(code);
    setShowDeleteDialog(true);
  };

  const handleDeleteCode = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    setSuccess('');
    try {
      await deleteAdminRedeemCode(deleteTarget.id);
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      setSuccess('兑换码已删除');
      await loadCodes(pagination.page);
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError, '删除兑换码失败'));
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteUnusedCodes = async () => {
    setDeleting(true);
    setError('');
    setSuccess('');
    try {
      const result = await listAdminRedeemCodes({
        page: 1,
        page_size: 1000,
        status: 'unused',
        search: search || undefined,
        type: filters.type || undefined,
        sort_by: sortState.key,
        sort_order: sortState.order,
      });
      const ids = result.items.map((item) => item.id);
      if (ids.length === 0) {
        setSuccess('当前没有未使用兑换码');
        setShowDeleteUnusedDialog(false);
        return;
      }
      const deleteResult = await batchDeleteAdminRedeemCodes(ids);
      setShowDeleteUnusedDialog(false);
      setSuccess(`已删除 ${deleteResult.deleted} 个未使用兑换码`);
      await loadCodes(1);
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError, '删除未使用兑换码失败'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-[linear-gradient(135deg,rgba(232,250,245,0.92),rgba(238,246,252,0.92))] p-5 shadow-sm ring-1 ring-gray-200/70 dark:bg-[#161616] dark:ring-gray-800">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="搜索兑换码或邮箱..."
                className="h-12 w-full rounded-2xl border border-white/70 bg-white/85 pl-10 pr-4 text-sm text-gray-700 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#101010] dark:text-white"
              />
            </div>
            <select
              value={filters.type}
              onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
              className="h-12 min-w-[140px] rounded-2xl border border-white/70 bg-white/85 px-4 text-sm text-gray-700 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#101010] dark:text-white"
            >
              <option value="">全部类型</option>
              <option value="balance">余额</option>
              <option value="concurrency">并发数</option>
              <option value="subscription">订阅</option>
              <option value="invitation">邀请码</option>
            </select>
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="h-12 min-w-[140px] rounded-2xl border border-white/70 bg-white/85 px-4 text-sm text-gray-700 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#101010] dark:text-white"
            >
              <option value="">全部状态</option>
              <option value="unused">未使用</option>
              <option value="used">已使用</option>
              <option value="expired">已过期</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void loadCodes(pagination.page)}
              disabled={loading}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-[#121212] dark:text-gray-200 dark:hover:bg-gray-900"
              title="刷新"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => void handleExportCodes()}
              disabled={exporting}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-[#121212] dark:text-gray-200 dark:hover:bg-gray-900"
            >
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              导出 CSV
            </button>
            <button
              type="button"
              onClick={() => setShowGenerateDialog(true)}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-500 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600"
            >
              <Plus className="mr-2 h-4 w-4" />
              生成兑换码
            </button>
          </div>
        </div>
      </section>

      {(error || success) && (
        <div className="space-y-3">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/20 dark:text-emerald-300">
              {success}
            </div>
          )}
        </div>
      )}

      <section className="overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#111111]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-[#171717] dark:text-gray-400">
              <tr>
                <th className="px-4 py-4 text-left">兑换码</th>
                <th className="px-4 py-4 text-left">
                  <button type="button" onClick={() => handleSort('type')} className="inline-flex items-center gap-2">
                    类型
                    {sortIndicator(sortState.key === 'type', sortState.order)}
                  </button>
                </th>
                <th className="px-4 py-4 text-left">
                  <button type="button" onClick={() => handleSort('value')} className="inline-flex items-center gap-2">
                    面值
                    {sortIndicator(sortState.key === 'value', sortState.order)}
                  </button>
                </th>
                <th className="px-4 py-4 text-left">
                  <button type="button" onClick={() => handleSort('status')} className="inline-flex items-center gap-2">
                    状态
                    {sortIndicator(sortState.key === 'status', sortState.order)}
                  </button>
                </th>
                <th className="px-4 py-4 text-left">使用者</th>
                <th className="px-4 py-4 text-left">
                  <button type="button" onClick={() => handleSort('used_at')} className="inline-flex items-center gap-2">
                    使用时间
                    {sortIndicator(sortState.key === 'used_at', sortState.order)}
                  </button>
                </th>
                <th className="px-4 py-4 text-left">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {!loading &&
                codes.map((code) => (
                  <tr key={code.id} className="align-top text-gray-700 dark:text-gray-200">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm text-gray-900 dark:text-gray-100">{code.code}</code>
                        <button
                          type="button"
                          onClick={() => void handleCopyCode(code.code)}
                          className={`rounded-lg p-1 transition ${
                            copiedCode === code.code
                              ? 'text-emerald-600 dark:text-emerald-300'
                              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300'
                          }`}
                          title={copiedCode === code.code ? '已复制' : '复制'}
                        >
                          {copiedCode === code.code ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${redeemTypeBadgeClass(code.type)}`}>
                        {redeemTypeLabel(code.type)}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-medium text-gray-900 dark:text-white">{formatRedeemValue(code)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${redeemStatusBadgeClass(code.status)}`}>
                        {redeemStatusLabel(code.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">{code.user?.email || (code.used_by ? `用户 #${code.used_by}` : '-')}</td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">{formatDateTime(code.used_at)}</td>
                    <td className="px-4 py-4">
                      {code.status === 'unused' ? (
                        <button
                          type="button"
                          onClick={() => handleOpenDelete(code)}
                          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                          删除
                        </button>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {loading ? (
          <div className="flex items-center justify-center px-6 py-20 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            正在加载兑换码列表...
          </div>
        ) : codes.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-600">
              <Ticket className="h-9 w-9" />
            </div>
            <div className="text-2xl font-semibold text-gray-900 dark:text-white">暂无数据</div>
            <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">生成第一批兑换码后，这里会显示兑换码列表与使用状态。</div>
            <button
              type="button"
              onClick={() => setShowGenerateDialog(true)}
              className="mt-8 inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-500 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600"
            >
              <Plus className="mr-2 h-4 w-4" />
              生成兑换码
            </button>
          </div>
        ) : (
          <div className="space-y-4 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <div>
                第 {pagination.page} / {totalPages} 页，共 {pagination.total} 条记录
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadCodes(Math.max(1, pagination.page - 1))}
                  disabled={pagination.page <= 1}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
                >
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() => void loadCodes(Math.min(totalPages, pagination.page + 1))}
                  disabled={pagination.page >= totalPages}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
                >
                  下一页
                </button>
              </div>
            </div>

            {filters.status === 'unused' ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowDeleteUnusedDialog(true)}
                  className="inline-flex items-center rounded-2xl bg-red-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-red-600"
                >
                  删除全部未使用
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <ModalShell open={showGenerateDialog} title="生成兑换码" onClose={resetGenerateState} maxWidth="max-w-3xl">
        <form onSubmit={handleGenerateCodes} className="space-y-5 px-6 py-6">
          <div>
            <FieldLabel>类型</FieldLabel>
            <select
              value={generateForm.type}
              onChange={(e) =>
                setGenerateForm((prev) => {
                  const nextType = e.target.value as GenerateFormState['type'];
                  let nextValue = prev.value;
                  if (nextType === 'invitation') {
                    nextValue = '0';
                  } else if (prev.type === 'invitation' && prev.value === '0') {
                    nextValue = '10';
                  }
                  return {
                    ...prev,
                    type: nextType,
                    value: nextValue,
                  };
                })
              }
              className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            >
              <option value="balance">余额</option>
              <option value="concurrency">并发数</option>
              <option value="subscription">订阅</option>
              <option value="invitation">邀请码</option>
            </select>
          </div>

          {generateForm.type !== 'subscription' && generateForm.type !== 'invitation' ? (
            <div>
              <FieldLabel>{generateForm.type === 'balance' ? '金额 ($)' : '面值'}</FieldLabel>
              <input
                type="number"
                step={generateForm.type === 'balance' ? '0.01' : '1'}
                min={generateForm.type === 'balance' ? '0.01' : '1'}
                value={generateForm.value}
                onChange={(e) => setGenerateForm((prev) => ({ ...prev, value: e.target.value }))}
                className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              />
            </div>
          ) : null}

          {generateForm.type === 'invitation' ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-300">
              邀请码用于限制用户注册，使用后会自动标记为已使用。
            </div>
          ) : null}

          {generateForm.type === 'subscription' ? (
            <>
              <div>
                <FieldLabel>选择分组</FieldLabel>
                <select
                  value={generateForm.group_id}
                  onChange={(e) => setGenerateForm((prev) => ({ ...prev, group_id: e.target.value }))}
                  className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                >
                  <option value="">请选择订阅分组</option>
                  {subscriptionOptions.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                      {group.platform ? ` · ${group.platform}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>有效期（天）</FieldLabel>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={generateForm.validity_days}
                  onChange={(e) => setGenerateForm((prev) => ({ ...prev, validity_days: e.target.value }))}
                  className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
              </div>
            </>
          ) : null}

          <div>
            <FieldLabel>数量</FieldLabel>
            <input
              type="number"
              min="1"
              max="100"
              value={generateForm.count}
              onChange={(e) => setGenerateForm((prev) => ({ ...prev, count: e.target.value }))}
              className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
            <button
              type="button"
              onClick={resetGenerateState}
              className="rounded-2xl border border-gray-200 px-5 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={generating}
              className="inline-flex items-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              生成
            </button>
          </div>
        </form>
      </ModalShell>

      <ModalShell open={showResultDialog} title="生成成功" onClose={() => setShowResultDialog(false)} maxWidth="max-w-3xl">
        <div className="space-y-5 px-6 py-6">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/30 dark:bg-emerald-900/20">
            <div className="text-base font-medium text-emerald-700 dark:text-emerald-300">已成功创建 {generatedCodes.length} 个兑换码</div>
            <div className="mt-1 text-sm text-emerald-700/90 dark:text-emerald-300/90">建议立即复制或下载保存，便于分发给用户。</div>
          </div>
          <textarea
            readOnly
            value={generatedCodesText}
            rows={Math.min(Math.max(generatedCodes.length, 4), 10)}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 font-mono text-sm text-gray-800 outline-none dark:border-gray-700 dark:bg-[#161616] dark:text-gray-200"
          />
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
            <button
              type="button"
              onClick={() => void handleCopyAll()}
              className={`inline-flex items-center rounded-2xl px-5 py-3 text-sm font-medium transition ${
                copiedAll
                  ? 'bg-emerald-500 text-white'
                  : 'border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900'
              }`}
            >
              {copiedAll ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copiedAll ? '已复制' : '复制全部'}
            </button>
            <button
              type="button"
              onClick={handleDownloadGenerated}
              className="inline-flex items-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600"
            >
              <Download className="mr-2 h-4 w-4" />
              下载
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={showDeleteDialog} title="删除兑换码" onClose={() => setShowDeleteDialog(false)} maxWidth="max-w-xl">
        <div className="space-y-5 px-6 py-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">确定删除兑换码 `{deleteTarget?.code}` 吗？此操作不可撤销。</p>
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setShowDeleteDialog(false)}
              className="rounded-2xl border border-gray-200 px-5 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteCode()}
              disabled={deleting}
              className="inline-flex items-center rounded-2xl bg-red-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-60"
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              删除
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={showDeleteUnusedDialog} title="删除全部未使用" onClose={() => setShowDeleteUnusedDialog(false)} maxWidth="max-w-xl">
        <div className="space-y-5 px-6 py-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">确定要删除当前筛选结果中的全部未使用兑换码吗？此操作无法撤销。</p>
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setShowDeleteUnusedDialog(false)}
              className="rounded-2xl border border-gray-200 px-5 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteUnusedCodes()}
              disabled={deleting}
              className="inline-flex items-center rounded-2xl bg-red-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-60"
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              删除全部
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
