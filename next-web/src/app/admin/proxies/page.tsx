'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  batchCreateAdminProxies,
  batchDeleteAdminProxies,
  checkAdminProxyQuality,
  createAdminProxy,
  deleteAdminProxy,
  exportAdminProxyData,
  getAdminProxyAccounts,
  importAdminProxyData,
  listAdminProxyPage,
  testAdminProxy,
  updateAdminProxy,
  type AdminCreateProxyPayload,
  type AdminProxy,
  type AdminProxyAccountSummary,
  type AdminProxyDataPayload,
  type AdminProxyQualityCheckResult,
  type AdminUpdateProxyPayload,
} from '@/lib/admin-api';

const PAGE_SIZE = 20;

type ProxyFilters = {
  protocol: string;
  status: string;
};

type ProxyFormState = {
  name: string;
  protocol: string;
  host: string;
  port: string;
  username: string;
  password: string;
  status: string;
};

type BatchParsedProxy = {
  protocol: string;
  host: string;
  port: number;
  username: string;
  password: string;
};

const DEFAULT_PROXY_FORM: ProxyFormState = {
  name: '',
  protocol: 'http',
  host: '',
  port: '8080',
  username: '',
  password: '',
  status: 'active',
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function ModalShell({
  open,
  title,
  onClose,
  maxWidth = 'max-w-3xl',
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

function buildProxyUrl(proxy: AdminProxy) {
  const protocol = proxy.protocol || 'http';
  const host = proxy.host || '';
  const port = proxy.port || 0;
  const user = proxy.username ? encodeURIComponent(proxy.username) : '';
  const pass = proxy.password ? encodeURIComponent(proxy.password) : '';
  let auth = '';
  if (user && pass) auth = `${user}:${pass}@`;
  else if (user) auth = `${user}@`;
  else if (pass) auth = `:${pass}@`;
  return `${protocol}://${auth}${host}:${port}`;
}

function formatLocation(proxy: AdminProxy) {
  const items = [proxy.country, proxy.city].filter(Boolean);
  return items.length > 0 ? items.join(' · ') : '-';
}

function qualityBadgeClass(status?: string) {
  if (status === 'healthy') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300';
  if (status === 'warn') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300';
  if (status === 'challenge') return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300';
  if (status === 'failed') return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300';
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
}

function qualityBadgeText(status?: string) {
  if (status === 'healthy') return '健康';
  if (status === 'warn') return '警告';
  if (status === 'challenge') return '拦截';
  if (status === 'failed') return '失败';
  return '-';
}

function qualityItemStatusText(status?: string) {
  if (status === 'pass') return '通过';
  if (status === 'warn') return '警告';
  if (status === 'challenge') return '拦截';
  return '失败';
}

function parseProxyLine(line: string): BatchParsedProxy | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(https?|socks5h?):\/\/(?:([^:@]+):([^@]+)@)?([^:]+):(\d+)$/i);
  if (!match) return null;
  const [, protocol, username, password, host, portText] = match;
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return {
    protocol: protocol.toLowerCase(),
    host: host.trim(),
    port,
    username: username?.trim() || '',
    password: password?.trim() || '',
  };
}

export default function AdminProxiesPage() {
  const [proxies, setProxies] = useState<AdminProxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<ProxyFilters>({ protocol: '', status: '' });
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [sortState, setSortState] = useState<{ key: string; order: 'asc' | 'desc' }>({
    key: 'id',
    order: 'desc',
  });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [visiblePasswordIds, setVisiblePasswordIds] = useState<number[]>([]);
  const [testingIds, setTestingIds] = useState<number[]>([]);
  const [qualityCheckingIds, setQualityCheckingIds] = useState<number[]>([]);
  const [batchTesting, setBatchTesting] = useState(false);
  const [batchQualityChecking, setBatchQualityChecking] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createMode, setCreateMode] = useState<'standard' | 'batch'>('standard');
  const [createForm, setCreateForm] = useState<ProxyFormState>(DEFAULT_PROXY_FORM);
  const [batchInput, setBatchInput] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminProxy | null>(null);
  const [editForm, setEditForm] = useState<ProxyFormState>(DEFAULT_PROXY_FORM);
  const [editPasswordDirty, setEditPasswordDirty] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminProxy | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [qualityTarget, setQualityTarget] = useState<AdminProxy | null>(null);
  const [qualityReport, setQualityReport] = useState<AdminProxyQualityCheckResult | null>(null);
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [accountsTarget, setAccountsTarget] = useState<AdminProxy | null>(null);
  const [accountsList, setAccountsList] = useState<AdminProxyAccountSummary[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [showAccountsModal, setShowAccountsModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importInput, setImportInput] = useState('');
  const [importing, setImporting] = useState(false);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.pageSize || PAGE_SIZE)));

  const batchParsed = useMemo(() => {
    const lines = batchInput.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const seen = new Set<string>();
    const valid: BatchParsedProxy[] = [];
    let invalid = 0;
    let duplicate = 0;
    for (const line of lines) {
      const parsed = parseProxyLine(line);
      if (!parsed) {
        invalid += 1;
        continue;
      }
      const key = `${parsed.protocol}|${parsed.host}|${parsed.port}|${parsed.username}|${parsed.password}`;
      if (seen.has(key)) {
        duplicate += 1;
        continue;
      }
      seen.add(key);
      valid.push(parsed);
    }
    return { total: lines.length, valid, invalid, duplicate };
  }, [batchInput]);

  const loadProxies = useCallback(
    async (page = 1, nextSearch = search, nextFilters = filters, nextSort = sortState) => {
      setLoading(true);
      setError('');
      try {
        const result = await listAdminProxyPage({
          page,
          page_size: pagination.pageSize,
          search: nextSearch || undefined,
          protocol: nextFilters.protocol || undefined,
          status: nextFilters.status || undefined,
          sort_by: nextSort.key,
          sort_order: nextSort.order,
        });
        setProxies(result.items);
        setPagination((prev) => ({
          ...prev,
          page: result.page || page,
          pageSize: result.pageSize || prev.pageSize,
          total: result.total || 0,
        }));
      } catch (loadError: unknown) {
        setError(getErrorMessage(loadError, '加载代理列表失败'));
      } finally {
        setLoading(false);
      }
    },
    [filters, pagination.pageSize, search, sortState]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProxies(1, search, filters, sortState);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [filters, loadProxies, search, sortState]);

  const allVisibleSelected = proxies.length > 0 && proxies.every((proxy) => selectedIds.includes(proxy.id));

  const startTestingProxy = (id: number) => setTestingIds((prev) => Array.from(new Set([...prev, id])));
  const stopTestingProxy = (id: number) => setTestingIds((prev) => prev.filter((item) => item !== id));
  const startQualityCheckingProxy = (id: number) => setQualityCheckingIds((prev) => Array.from(new Set([...prev, id])));
  const stopQualityCheckingProxy = (id: number) => setQualityCheckingIds((prev) => prev.filter((item) => item !== id));

  const applyLatencyResult = useCallback(
    (
      proxyId: number,
      result: {
        success: boolean;
        latency_ms?: number;
        message?: string;
        ip_address?: string;
        country?: string;
        country_code?: string;
        region?: string;
        city?: string;
      }
    ) => {
      setProxies((prev) =>
        prev.map((proxy) => {
          if (proxy.id !== proxyId) return proxy;
          if (result.success) {
            return {
              ...proxy,
              latency_status: 'success',
              latency_ms: result.latency_ms,
              latency_message: result.message,
              ip_address: result.ip_address,
              country: result.country,
              country_code: result.country_code,
              region: result.region,
              city: result.city,
            };
          }
          return {
            ...proxy,
            latency_status: 'failed',
            latency_ms: null,
            latency_message: result.message,
          };
        })
      );
    },
    []
  );

  const applyQualityResult = useCallback((proxyId: number, result: AdminProxyQualityCheckResult) => {
    const status =
      result.challenge_count > 0 ? 'challenge' : result.failed_count > 0 ? 'failed' : result.warn_count > 0 ? 'warn' : 'healthy';
    setProxies((prev) =>
      prev.map((proxy) =>
        proxy.id === proxyId
          ? {
              ...proxy,
              quality_status: status,
              quality_score: result.score,
              quality_grade: result.grade,
              quality_summary: result.summary,
              quality_checked: result.checked_at,
            }
          : proxy
      )
    );
  }, []);

  const runProxyTest = useCallback(
    async (proxyId: number, notify = true) => {
      startTestingProxy(proxyId);
      try {
        const result = await testAdminProxy(proxyId);
        applyLatencyResult(proxyId, result);
        if (notify) {
          setSuccess(result.success ? `代理测试成功${result.latency_ms ? `，延迟 ${result.latency_ms}ms` : ''}` : result.message);
          if (!result.success) setError(result.message || '代理测试失败');
        }
        return result;
      } catch (testError: unknown) {
        const message = getErrorMessage(testError, '代理测试失败');
        applyLatencyResult(proxyId, { success: false, message });
        if (notify) setError(message);
        return null;
      } finally {
        stopTestingProxy(proxyId);
      }
    },
    [applyLatencyResult]
  );

  const handleQualityCheck = useCallback(
    async (proxy: AdminProxy) => {
      startQualityCheckingProxy(proxy.id);
      try {
        const result = await checkAdminProxyQuality(proxy.id);
        setQualityTarget(proxy);
        setQualityReport(result);
        setShowQualityModal(true);
        applyQualityResult(proxy.id, result);
        applyLatencyResult(proxy.id, {
          success: true,
          latency_ms: result.base_latency_ms,
          message: result.summary,
          ip_address: result.exit_ip,
          country: result.country,
          country_code: result.country_code,
        });
        setSuccess(`质量检测完成：评分 ${result.score} / 等级 ${result.grade}`);
      } catch (qualityError: unknown) {
        setError(getErrorMessage(qualityError, '代理质量检测失败'));
      } finally {
        stopQualityCheckingProxy(proxy.id);
      }
    },
    [applyLatencyResult, applyQualityResult]
  );

  const fetchAllFilteredProxyIds = useCallback(async () => {
    const ids: number[] = [];
    let page = 1;
    let totalPagesForFetch = 1;
    while (page <= totalPagesForFetch) {
      const result = await listAdminProxyPage({
        page,
        page_size: 200,
        search: search || undefined,
        protocol: filters.protocol || undefined,
        status: filters.status || undefined,
        sort_by: sortState.key,
        sort_order: sortState.order,
      });
      ids.push(...result.items.map((item) => item.id));
      totalPagesForFetch = Math.max(1, Math.ceil((result.total || 0) / (result.pageSize || 200)));
      page += 1;
    }
    return ids;
  }, [filters.protocol, filters.status, search, sortState.key, sortState.order]);

  const handleBatchTest = async () => {
    if (batchTesting) return;
    setBatchTesting(true);
    setError('');
    setSuccess('');
    try {
      const ids = selectedIds.length > 0 ? selectedIds : await fetchAllFilteredProxyIds();
      if (ids.length === 0) {
        setError('当前没有可测试的代理');
        return;
      }
      const concurrency = 5;
      let index = 0;
      const worker = async () => {
        while (index < ids.length) {
          const id = ids[index];
          index += 1;
          await runProxyTest(id, false);
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()));
      setSuccess(`已完成 ${ids.length} 个代理的连通性测试`);
      await loadProxies(pagination.page);
    } catch (batchError: unknown) {
      setError(getErrorMessage(batchError, '批量测试代理失败'));
    } finally {
      setBatchTesting(false);
    }
  };

  const handleBatchQualityCheck = async () => {
    if (batchQualityChecking) return;
    setBatchQualityChecking(true);
    setError('');
    setSuccess('');
    try {
      const ids = selectedIds.length > 0 ? selectedIds : await fetchAllFilteredProxyIds();
      if (ids.length === 0) {
        setError('当前没有可检测的代理');
        return;
      }
      const concurrency = 3;
      let index = 0;
      let healthy = 0;
      let warn = 0;
      let challenge = 0;
      let failed = 0;
      const worker = async () => {
        while (index < ids.length) {
          const currentId = ids[index];
          index += 1;
          startQualityCheckingProxy(currentId);
          try {
            const result = await checkAdminProxyQuality(currentId);
            applyQualityResult(currentId, result);
            if (result.challenge_count > 0) challenge += 1;
            else if (result.failed_count > 0) failed += 1;
            else if (result.warn_count > 0) warn += 1;
            else healthy += 1;
          } catch {
            failed += 1;
          } finally {
            stopQualityCheckingProxy(currentId);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()));
      setSuccess(`批量质检完成：共 ${ids.length} 个，健康 ${healthy}，警告 ${warn}，拦截 ${challenge}，失败 ${failed}`);
      await loadProxies(pagination.page);
    } catch (batchError: unknown) {
      setError(getErrorMessage(batchError, '批量质量检测失败'));
    } finally {
      setBatchQualityChecking(false);
    }
  };

  const resetCreateState = () => {
    setShowCreateModal(false);
    setCreateMode('standard');
    setCreateForm(DEFAULT_PROXY_FORM);
    setBatchInput('');
  };

  const resetEditState = () => {
    setShowEditModal(false);
    setEditTarget(null);
    setEditForm(DEFAULT_PROXY_FORM);
    setEditPasswordDirty(false);
  };

  const normalizeProxyPayload = (form: ProxyFormState): AdminCreateProxyPayload => ({
    name: form.name.trim(),
    protocol: form.protocol,
    host: form.host.trim(),
    port: Number(form.port),
    username: form.username.trim() || null,
    password: form.password.trim() || null,
  });

  const validateProxyForm = (form: ProxyFormState) => {
    if (!form.name.trim()) return '请输入代理名称';
    if (!form.host.trim()) return '请输入主机地址';
    const port = Number(form.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return '请输入有效端口（1-65535）';
    return '';
  };

  const handleCreateProxy = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateProxyForm(createForm);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await createAdminProxy(normalizeProxyPayload(createForm));
      resetCreateState();
      setSuccess('代理已创建');
      await loadProxies(1);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError, '创建代理失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchCreate = async () => {
    if (batchParsed.valid.length === 0) {
      setError('没有可导入的有效代理');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const result = await batchCreateAdminProxies(batchParsed.valid);
      resetCreateState();
      setSuccess(`快捷导入完成：创建 ${result.created} 个，跳过 ${result.skipped} 个`);
      await loadProxies(1);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError, '批量导入代理失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (proxy: AdminProxy) => {
    setEditTarget(proxy);
    setEditForm({
      name: proxy.name || '',
      protocol: proxy.protocol || 'http',
      host: proxy.host || '',
      port: String(proxy.port || 8080),
      username: proxy.username || '',
      password: proxy.password || '',
      status: proxy.status || 'active',
    });
    setEditPasswordDirty(false);
    setShowEditModal(true);
  };

  const handleUpdateProxy = async (event: FormEvent) => {
    event.preventDefault();
    if (!editTarget) return;
    const validationError = validateProxyForm(editForm);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const payload: AdminUpdateProxyPayload = {
        name: editForm.name.trim(),
        protocol: editForm.protocol,
        host: editForm.host.trim(),
        port: Number(editForm.port),
        username: editForm.username.trim() || null,
        status: editForm.status,
      };
      if (editPasswordDirty) {
        payload.password = editForm.password.trim() || null;
      }
      await updateAdminProxy(editTarget.id, payload);
      resetEditState();
      setSuccess('代理已更新');
      await loadProxies(pagination.page);
    } catch (updateError: unknown) {
      setError(getErrorMessage(updateError, '更新代理失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDelete = (proxy: AdminProxy) => {
    if ((proxy.account_count || 0) > 0) {
      setError('该代理已被账号使用，无法直接删除');
      return;
    }
    setDeleteTarget(proxy);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await deleteAdminProxy(deleteTarget.id);
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
      setSelectedIds((prev) => prev.filter((id) => id !== deleteTarget.id));
      setSuccess('代理已删除');
      await loadProxies(pagination.page);
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError, '删除代理失败'));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) {
      setShowBatchDeleteConfirm(false);
      return;
    }
    setDeleteSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const result = await batchDeleteAdminProxies(selectedIds);
      setSelectedIds([]);
      setShowBatchDeleteConfirm(false);
      setSuccess(`批量删除完成：删除 ${result.deleted_ids.length} 个，跳过 ${result.skipped.length} 个`);
      await loadProxies(pagination.page);
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError, '批量删除代理失败'));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleExportData = async () => {
    try {
      const data = await exportAdminProxyData(
        selectedIds.length > 0
          ? { ids: selectedIds }
          : {
              filters: {
                protocol: filters.protocol || undefined,
                status: filters.status || undefined,
                search: search || undefined,
                sort_by: sortState.key,
                sort_order: sortState.order,
              },
            }
      );
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.href = url;
      link.download = `subiohub-proxies-${stamp}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setSuccess('代理数据已导出');
    } catch (exportError: unknown) {
      setError(getErrorMessage(exportError, '导出代理数据失败'));
    }
  };

  const handleImportData = async () => {
    if (!importInput.trim()) {
      setError('请先粘贴要导入的 JSON 数据');
      return;
    }
    setImporting(true);
    setError('');
    setSuccess('');
    try {
      const parsed = JSON.parse(importInput) as AdminProxyDataPayload;
      const result = await importAdminProxyData({ data: parsed });
      setShowImportModal(false);
      setImportInput('');
      setSuccess(`导入完成：新建 ${result.proxy_created || 0} 个，复用 ${result.proxy_reused || 0} 个，失败 ${result.proxy_failed || 0} 个`);
      await loadProxies(1);
    } catch (importError: unknown) {
      setError(getErrorMessage(importError, '导入代理数据失败，请检查 JSON 格式'));
    } finally {
      setImporting(false);
    }
  };

  const handleOpenAccounts = async (proxy: AdminProxy) => {
    setAccountsTarget(proxy);
    setAccountsList([]);
    setAccountsLoading(true);
    setShowAccountsModal(true);
    try {
      const result = await getAdminProxyAccounts(proxy.id);
      setAccountsList(result);
    } catch (accountsError: unknown) {
      setError(getErrorMessage(accountsError, '加载代理关联账号失败'));
    } finally {
      setAccountsLoading(false);
    }
  };

  const togglePasswordVisible = (id: number) => {
    setVisiblePasswordIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleCopyProxyUrl = async (proxy: AdminProxy) => {
    try {
      await navigator.clipboard.writeText(buildProxyUrl(proxy));
      setSuccess('代理地址已复制');
    } catch {
      setError('复制失败，请手动复制');
    }
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...proxies.map((proxy) => proxy.id)])));
      return;
    }
    setSelectedIds((prev) => prev.filter((id) => !proxies.some((proxy) => proxy.id === id)));
  };

  const toggleRowSelected = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => Array.from(new Set([...prev, id])));
      return;
    }
    setSelectedIds((prev) => prev.filter((item) => item !== id));
  };

  const handleSort = (key: string) => {
    setSortState((prev) => ({
      key,
      order: prev.key === key && prev.order === 'asc' ? 'desc' : 'asc',
    }));
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
                placeholder="搜索代理..."
                className="h-12 w-full rounded-2xl border border-white/70 bg-white/85 pl-10 pr-4 text-sm text-gray-700 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#101010] dark:text-white"
              />
            </div>
            <select
              value={filters.protocol}
              onChange={(e) => setFilters((prev) => ({ ...prev, protocol: e.target.value }))}
              className="h-12 min-w-[150px] rounded-2xl border border-white/70 bg-white/85 px-4 text-sm text-gray-700 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#101010] dark:text-white"
            >
              <option value="">全部协议</option>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="socks5">SOCKS5</option>
              <option value="socks5h">SOCKS5H</option>
            </select>
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="h-12 min-w-[140px] rounded-2xl border border-white/70 bg-white/85 px-4 text-sm text-gray-700 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#101010] dark:text-white"
            >
              <option value="">全部状态</option>
              <option value="active">启用</option>
              <option value="inactive">停用</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void loadProxies(pagination.page)}
              disabled={loading}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-[#121212] dark:text-gray-200 dark:hover:bg-gray-900"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
            <button
              type="button"
              onClick={() => void handleBatchTest()}
              disabled={batchTesting || loading}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-[#121212] dark:text-gray-200 dark:hover:bg-gray-900"
            >
              {batchTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              测试连接
            </button>
            <button
              type="button"
              onClick={() => void handleBatchQualityCheck()}
              disabled={batchQualityChecking || loading}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-[#121212] dark:text-gray-200 dark:hover:bg-gray-900"
            >
              {batchQualityChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shield className="mr-2 h-4 w-4" />}
              批量质量检测
            </button>
            <button
              type="button"
              onClick={() => setShowBatchDeleteConfirm(true)}
              disabled={selectedIds.length === 0}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-rose-400 px-4 text-sm font-medium text-white transition hover:bg-rose-500 disabled:opacity-60"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              删除
            </button>
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-[#121212] dark:text-gray-200 dark:hover:bg-gray-900"
            >
              <Upload className="mr-2 h-4 w-4" />
              导入
            </button>
            <button
              type="button"
              onClick={() => void handleExportData()}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-[#121212] dark:text-gray-200 dark:hover:bg-gray-900"
            >
              <Download className="mr-2 h-4 w-4" />
              导出
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-500 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600"
            >
              <Plus className="mr-2 h-4 w-4" />
              添加代理
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
                <th className="px-4 py-4 text-left">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
                  />
                </th>
                <th className="px-4 py-4 text-left">
                  <button type="button" onClick={() => handleSort('name')} className="inline-flex items-center gap-2">
                    名称
                    {sortIndicator(sortState.key === 'name', sortState.order)}
                  </button>
                </th>
                <th className="px-4 py-4 text-left">
                  <button type="button" onClick={() => handleSort('protocol')} className="inline-flex items-center gap-2">
                    协议
                    {sortIndicator(sortState.key === 'protocol', sortState.order)}
                  </button>
                </th>
                <th className="px-4 py-4 text-left">地址</th>
                <th className="px-4 py-4 text-left">认证</th>
                <th className="px-4 py-4 text-left">地理位置</th>
                <th className="px-4 py-4 text-left">
                  <button type="button" onClick={() => handleSort('account_count')} className="inline-flex items-center gap-2">
                    账号数
                    {sortIndicator(sortState.key === 'account_count', sortState.order)}
                  </button>
                </th>
                <th className="px-4 py-4 text-left">延迟</th>
                <th className="px-4 py-4 text-left">
                  <button type="button" onClick={() => handleSort('status')} className="inline-flex items-center gap-2">
                    状态
                    {sortIndicator(sortState.key === 'status', sortState.order)}
                  </button>
                </th>
                <th className="px-4 py-4 text-left">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {!loading &&
                proxies.map((proxy) => {
                  const isPasswordVisible = visiblePasswordIds.includes(proxy.id);
                  const isTesting = testingIds.includes(proxy.id);
                  const isQualityChecking = qualityCheckingIds.includes(proxy.id);
                  return (
                    <tr key={proxy.id} className="align-top text-gray-700 dark:text-gray-200">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(proxy.id)}
                          onChange={(e) => toggleRowSelected(proxy.id, e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="px-4 py-4 font-medium text-gray-900 dark:text-white">{proxy.name}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${proxy.protocol?.startsWith('socks5') ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                          {(proxy.protocol || '-').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <code className="rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            {proxy.host}:{proxy.port}
                          </code>
                          <button
                            type="button"
                            onClick={() => void handleCopyProxyUrl(proxy)}
                            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-emerald-600 dark:hover:bg-gray-800 dark:hover:text-emerald-300"
                            title="复制代理地址"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {proxy.username || proxy.password ? (
                          <div className="flex items-center gap-2 text-xs">
                            <div className="space-y-1">
                              {proxy.username ? <div>{proxy.username}</div> : null}
                              {proxy.password ? (
                                <div className="font-mono text-gray-500 dark:text-gray-400">
                                  {isPasswordVisible ? proxy.password : '••••••'}
                                </div>
                              ) : null}
                            </div>
                            {proxy.password ? (
                              <button
                                type="button"
                                onClick={() => togglePasswordVisible(proxy.id)}
                                className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                              >
                                {isPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4">{formatLocation(proxy)}</td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => void handleOpenAccounts(proxy)}
                          className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-emerald-300 dark:hover:bg-gray-700"
                        >
                          {proxy.account_count || 0} 个
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          {typeof proxy.latency_ms === 'number' ? (
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${proxy.latency_ms < 200 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'}`}>
                              {proxy.latency_ms}ms
                            </span>
                          ) : proxy.latency_status === 'failed' ? (
                            <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-900/20 dark:text-red-300">
                              检测失败
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                          {typeof proxy.quality_score === 'number' ? (
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                              <span>质检 {proxy.quality_grade || '-'} / {proxy.quality_score}</span>
                              <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${qualityBadgeClass(proxy.quality_status)}`}>
                                {qualityBadgeText(proxy.quality_status)}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            proxy.status === 'active'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                          }`}
                        >
                          {proxy.status === 'active' ? '启用' : '停用'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void runProxyTest(proxy.id)}
                            disabled={isTesting}
                            className="rounded-xl p-2 text-gray-500 transition hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-60 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
                            title="测试连接"
                          >
                            {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleQualityCheck(proxy)}
                            disabled={isQualityChecking}
                            className="rounded-xl p-2 text-gray-500 transition hover:bg-blue-50 hover:text-blue-600 disabled:opacity-60 dark:hover:bg-blue-900/20 dark:hover:text-blue-300"
                            title="质量检测"
                          >
                            {isQualityChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(proxy)}
                            className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                            title="编辑"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDelete(proxy)}
                            className="rounded-xl p-2 text-gray-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                            title="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {loading ? (
          <div className="flex items-center justify-center px-6 py-20 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            正在加载代理列表...
          </div>
        ) : proxies.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-600">
              <Shield className="h-9 w-9" />
            </div>
            <div className="text-2xl font-semibold text-gray-900 dark:text-white">暂无代理</div>
            <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">添加您的第一个代理以开始使用。</div>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="mt-8 inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-500 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600"
            >
              <Plus className="mr-2 h-4 w-4" />
              添加代理
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <div>
              第 {pagination.page} / {totalPages} 页，共 {pagination.total} 条记录
              {selectedIds.length > 0 ? `，已选中 ${selectedIds.length} 条` : ''}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadProxies(Math.max(1, pagination.page - 1))}
                disabled={pagination.page <= 1}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
              >
                上一页
              </button>
              <button
                type="button"
                onClick={() => void loadProxies(Math.min(totalPages, pagination.page + 1))}
                disabled={pagination.page >= totalPages}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </section>

      <ModalShell open={showCreateModal} title="添加代理" onClose={resetCreateState}>
        <div className="px-6 py-6">
          <div className="mb-6 flex border-b border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setCreateMode('standard')}
              className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition ${
                createMode === 'standard'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-300'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <Plus className="mr-2 inline h-4 w-4" />
              标准添加
            </button>
            <button
              type="button"
              onClick={() => setCreateMode('batch')}
              className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition ${
                createMode === 'batch'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-300'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <Upload className="mr-2 inline h-4 w-4" />
              快捷添加
            </button>
          </div>

          {createMode === 'standard' ? (
            <form onSubmit={handleCreateProxy} className="space-y-5">
              <div>
                <FieldLabel>名称</FieldLabel>
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="请输入代理名称"
                  className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
              </div>
              <div>
                <FieldLabel>协议</FieldLabel>
                <select
                  value={createForm.protocol}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, protocol: e.target.value }))}
                  className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                >
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                  <option value="socks5">SOCKS5</option>
                  <option value="socks5h">SOCKS5H</option>
                </select>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <FieldLabel>主机</FieldLabel>
                  <input
                    value={createForm.host}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, host: e.target.value }))}
                    placeholder="请输入主机地址"
                    className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <FieldLabel>端口</FieldLabel>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={createForm.port}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, port: e.target.value }))}
                    className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <FieldLabel>用户名（可选）</FieldLabel>
                <input
                  value={createForm.username}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, username: e.target.value }))}
                  placeholder="可选认证信息"
                  className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
              </div>
              <div>
                <FieldLabel>密码（可选）</FieldLabel>
                <input
                  value={createForm.password}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="可选认证信息"
                  className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
                <button
                  type="button"
                  onClick={resetCreateState}
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  创建
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-5">
              <div>
                <FieldLabel>代理列表</FieldLabel>
                <textarea
                  rows={10}
                  value={batchInput}
                  onChange={(e) => setBatchInput(e.target.value)}
                  placeholder={`每行输入一个代理，支持以下格式：\n\nsocks5://user:pass@192.168.1.1:1080\nhttp://192.168.1.1:8080\nhttps://user:pass@proxy.example.com:443`}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-4 font-mono text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  支持 http、https、socks5 协议，格式：协议://[用户名:密码@]主机:端口
                </p>
              </div>

              {batchParsed.total > 0 ? (
                <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                  有效 {batchParsed.valid.length} 条，格式错误 {batchParsed.invalid} 条，重复 {batchParsed.duplicate} 条
                </div>
              ) : null}

              <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
                <button
                  type="button"
                  onClick={resetCreateState}
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void handleBatchCreate()}
                  disabled={submitting || batchParsed.valid.length === 0}
                  className="inline-flex items-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  导入 {batchParsed.valid.length} 个代理
                </button>
              </div>
            </div>
          )}
        </div>
      </ModalShell>

      <ModalShell open={showEditModal} title="编辑代理" onClose={resetEditState}>
        <form onSubmit={handleUpdateProxy} className="space-y-5 px-6 py-6">
          <div>
            <FieldLabel>名称</FieldLabel>
            <input
              value={editForm.name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
              className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>协议</FieldLabel>
            <select
              value={editForm.protocol}
              onChange={(e) => setEditForm((prev) => ({ ...prev, protocol: e.target.value }))}
              className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            >
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="socks5">SOCKS5</option>
              <option value="socks5h">SOCKS5H</option>
            </select>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>主机</FieldLabel>
              <input
                value={editForm.host}
                onChange={(e) => setEditForm((prev) => ({ ...prev, host: e.target.value }))}
                className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              />
            </div>
            <div>
              <FieldLabel>端口</FieldLabel>
              <input
                type="number"
                min={1}
                max={65535}
                value={editForm.port}
                onChange={(e) => setEditForm((prev) => ({ ...prev, port: e.target.value }))}
                className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              />
            </div>
          </div>
          <div>
            <FieldLabel>用户名（可选）</FieldLabel>
            <input
              value={editForm.username}
              onChange={(e) => setEditForm((prev) => ({ ...prev, username: e.target.value }))}
              className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>密码（可选，留空可清空）</FieldLabel>
            <input
              value={editForm.password}
              onChange={(e) => {
                setEditForm((prev) => ({ ...prev, password: e.target.value }));
                setEditPasswordDirty(true);
              }}
              className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>状态</FieldLabel>
            <select
              value={editForm.status}
              onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
              className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            >
              <option value="active">启用</option>
              <option value="inactive">停用</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
            <button
              type="button"
              onClick={resetEditState}
              className="rounded-2xl border border-gray-200 px-5 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              保存
            </button>
          </div>
        </form>
      </ModalShell>

      <ModalShell open={showImportModal} title="导入代理数据" onClose={() => setShowImportModal(false)} maxWidth="max-w-4xl">
        <div className="space-y-5 px-6 py-6">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-300">
            粘贴由代理管理“导出”得到的 JSON 数据，系统会按代理键去重并尽量复用已有代理。
          </div>
          <textarea
            rows={16}
            value={importInput}
            onChange={(e) => setImportInput(e.target.value)}
            placeholder="请粘贴导出的代理 JSON..."
            className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-4 font-mono text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
          />
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setShowImportModal(false)}
              className="rounded-2xl border border-gray-200 px-5 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleImportData()}
              disabled={importing}
              className="inline-flex items-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              开始导入
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={showQualityModal} title="质量检测报告" onClose={() => setShowQualityModal(false)} maxWidth="max-w-5xl">
        <div className="space-y-5 px-6 py-6">
          {qualityReport ? (
            <>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{qualityTarget?.name || '-'}</div>
                    <div className="mt-1 text-sm text-gray-700 dark:text-gray-200">{qualityReport.summary}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-semibold text-gray-900 dark:text-white">{qualityReport.score}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">等级 {qualityReport.grade}</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-xs text-gray-600 dark:text-gray-300 md:grid-cols-2">
                  <div>出口 IP：{qualityReport.exit_ip || '-'}</div>
                  <div>国家：{qualityReport.country || '-'}</div>
                  <div>基础延迟：{typeof qualityReport.base_latency_ms === 'number' ? `${qualityReport.base_latency_ms}ms` : '-'}</div>
                  <div>检测时间：{qualityReport.checked_at ? new Date(qualityReport.checked_at * 1000).toLocaleString() : '-'}</div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-[#171717] dark:text-gray-400">
                    <tr>
                      <th className="px-4 py-3 text-left">目标</th>
                      <th className="px-4 py-3 text-left">状态</th>
                      <th className="px-4 py-3 text-left">HTTP</th>
                      <th className="px-4 py-3 text-left">延迟</th>
                      <th className="px-4 py-3 text-left">消息</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {qualityReport.items.map((item) => (
                      <tr key={`${item.target}-${item.status}`} className="text-gray-700 dark:text-gray-200">
                        <td className="px-4 py-3">{item.target}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${qualityBadgeClass(item.status === 'pass' ? 'healthy' : item.status)}`}>
                            {qualityItemStatusText(item.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">{item.http_status || '-'}</td>
                        <td className="px-4 py-3">{typeof item.latency_ms === 'number' ? `${item.latency_ms}ms` : '-'}</td>
                        <td className="px-4 py-3">{item.message || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">暂无检测报告</div>
          )}
          <div className="flex justify-end border-t border-gray-200 pt-5 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setShowQualityModal(false)}
              className="rounded-2xl border border-gray-200 px-5 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
            >
              关闭
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={showAccountsModal} title={`代理关联账号${accountsTarget ? ` · ${accountsTarget.name}` : ''}`} onClose={() => setShowAccountsModal(false)} maxWidth="max-w-4xl">
        <div className="px-6 py-6">
          {accountsLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在加载关联账号...
            </div>
          ) : accountsList.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">当前没有账号绑定这个代理。</div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-[#171717] dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 text-left">账号名称</th>
                    <th className="px-4 py-3 text-left">平台 / 类型</th>
                    <th className="px-4 py-3 text-left">备注</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {accountsList.map((account) => (
                    <tr key={account.id} className="text-gray-700 dark:text-gray-200">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{account.name}</td>
                      <td className="px-4 py-3">{account.platform} / {account.type}</td>
                      <td className="px-4 py-3">{account.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-5 flex justify-end border-t border-gray-200 pt-5 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setShowAccountsModal(false)}
              className="rounded-2xl border border-gray-200 px-5 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
            >
              关闭
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={showDeleteConfirm} title="删除代理" onClose={() => setShowDeleteConfirm(false)} maxWidth="max-w-xl">
        <div className="space-y-5 px-6 py-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">确定删除代理 `{deleteTarget?.name}` 吗？此操作不可撤销。</p>
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-2xl border border-gray-200 px-5 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmDelete()}
              disabled={deleteSubmitting}
              className="inline-flex items-center rounded-2xl bg-red-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-60"
            >
              {deleteSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              删除
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={showBatchDeleteConfirm} title="批量删除代理" onClose={() => setShowBatchDeleteConfirm(false)} maxWidth="max-w-xl">
        <div className="space-y-5 px-6 py-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">确定删除已选中的 {selectedIds.length} 个代理吗？已被账号使用的代理会被后端自动跳过。</p>
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setShowBatchDeleteConfirm(false)}
              className="rounded-2xl border border-gray-200 px-5 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleBatchDelete()}
              disabled={deleteSubmitting}
              className="inline-flex items-center rounded-2xl bg-red-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-60"
            >
              {deleteSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              删除
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}

