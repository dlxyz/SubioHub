'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import {
  batchSetAdminGroupRateMultipliers,
  clearAdminGroupRateMultipliers,
  createAdminGroup,
  deleteAdminGroup,
  listAdminGroupCapacitySummary,
  listAdminGroupRateMultipliers,
  listAdminGroups,
  listAdminGroupUsageSummary,
  listAdminUsers,
  updateAdminGroup,
  type AdminGroup,
  type AdminGroupCapacitySummary,
  type AdminGroupRateMultiplierEntry,
  type AdminGroupUsageSummary,
  type AdminUser,
} from '@/lib/admin-api';

const PAGE_SIZE = 20;

type LocalRateEntry = AdminGroupRateMultiplierEntry;

type GroupFilters = {
  platform: string;
  status: string;
  is_exclusive: string;
};

type GroupFormState = {
  name: string;
  description: string;
  platform: string;
  rate_multiplier: string;
  is_exclusive: boolean;
  subscription_type: string;
  claude_code_only: boolean;
  fallback_group_id: string;
  fallback_group_id_on_invalid_request: string;
  require_oauth_only: boolean;
  require_privacy_set: boolean;
  model_routing_enabled: boolean;
};

const DEFAULT_GROUP_FORM: GroupFormState = {
  name: '',
  description: '',
  platform: 'anthropic',
  rate_multiplier: '1',
  is_exclusive: false,
  subscription_type: 'standard',
  claude_code_only: false,
  fallback_group_id: '',
  fallback_group_id_on_invalid_request: '',
  require_oauth_only: false,
  require_privacy_set: false,
  model_routing_enabled: false,
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatCurrency(value?: number | null) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function getPlatformLabel(platform?: string) {
  if (platform === 'anthropic') return 'Anthropic';
  if (platform === 'openai') return 'OpenAI';
  if (platform === 'gemini') return 'Gemini';
  if (platform === 'antigravity') return 'Antigravity';
  return platform || '-';
}

function getPlatformBadgeClass(platform?: string) {
  if (platform === 'anthropic') return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
  if (platform === 'openai') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  if (platform === 'antigravity') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
  return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
}

function getBillingLabel(group: AdminGroup) {
  return group.subscription_type === 'subscription' ? '订阅' : '标准（余额）';
}

function toGroupForm(group: AdminGroup): GroupFormState {
  return {
    name: group.name || '',
    description: group.description || '',
    platform: group.platform || 'anthropic',
    rate_multiplier: String(group.rate_multiplier ?? 1),
    is_exclusive: Boolean(group.is_exclusive),
    subscription_type: group.subscription_type || 'standard',
    claude_code_only: Boolean(group.claude_code_only),
    fallback_group_id: group.fallback_group_id ? String(group.fallback_group_id) : '',
    fallback_group_id_on_invalid_request: group.fallback_group_id_on_invalid_request
      ? String(group.fallback_group_id_on_invalid_request)
      : '',
    require_oauth_only: Boolean(group.require_oauth_only),
    require_privacy_set: Boolean(group.require_privacy_set),
    model_routing_enabled: Boolean(group.model_routing_enabled),
  };
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

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [allGroups, setAllGroups] = useState<AdminGroup[]>([]);
  const [usageMap, setUsageMap] = useState<Record<number, AdminGroupUsageSummary>>({});
  const [capacityMap, setCapacityMap] = useState<Record<number, AdminGroupCapacitySummary>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rateLoading, setRateLoading] = useState(false);
  const [clearingRates, setClearingRates] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<GroupFilters>({
    platform: '',
    status: '',
    is_exclusive: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
  });
  const [sortState, setSortState] = useState<{ key: string; order: 'asc' | 'desc' }>({
    key: 'sort_order',
    order: 'asc',
  });
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AdminGroup | null>(null);
  const [groupForm, setGroupForm] = useState<GroupFormState>(DEFAULT_GROUP_FORM);
  const [deleteTarget, setDeleteTarget] = useState<AdminGroup | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [rateTarget, setRateTarget] = useState<AdminGroup | null>(null);
  const [rateEntries, setRateEntries] = useState<AdminGroupRateMultiplierEntry[]>([]);
  const [rateDraftEntries, setRateDraftEntries] = useState<LocalRateEntry[]>([]);
  const [rateSaving, setRateSaving] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [userSearchResults, setUserSearchResults] = useState<AdminUser[]>([]);
  const [selectedRateUser, setSelectedRateUser] = useState<AdminUser | null>(null);
  const [newRateValue, setNewRateValue] = useState('');
  const [batchFactor, setBatchFactor] = useState('');

  const cloneRateEntries = useCallback((entries: AdminGroupRateMultiplierEntry[]) => entries.map((entry) => ({ ...entry })), []);

  const loadGroups = useCallback(
    async (page = 1, nextSearch = search, nextFilters = filters, nextSort = sortState) => {
      setLoading(true);
      setError('');
      try {
        const [groupResult, usageResult, capacityResult, allGroupResult] = await Promise.all([
          listAdminGroups({
            page,
            page_size: PAGE_SIZE,
            search: nextSearch || undefined,
            platform: nextFilters.platform || undefined,
            status: nextFilters.status || undefined,
            is_exclusive: nextFilters.is_exclusive === '' ? undefined : nextFilters.is_exclusive === 'true',
            sort_by: nextSort.key,
            sort_order: nextSort.order,
          }),
          listAdminGroupUsageSummary(),
          listAdminGroupCapacitySummary(),
          listAdminGroups({ page: 1, page_size: 200, sort_by: 'sort_order', sort_order: 'asc' }),
        ]);

        setGroups(groupResult.items);
        setAllGroups(allGroupResult.items);
        setPagination({
          page: groupResult.page || page,
          pageSize: groupResult.pageSize || PAGE_SIZE,
          total: groupResult.total,
        });
        setUsageMap(Object.fromEntries(usageResult.map((item) => [item.group_id, item])));
        setCapacityMap(Object.fromEntries(capacityResult.map((item) => [item.group_id, item])));
      } catch (loadError: unknown) {
        setError(getErrorMessage(loadError, '加载分组失败'));
      } finally {
        setLoading(false);
      }
    },
    [filters, search, sortState]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadGroups(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadGroups]);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.pageSize || PAGE_SIZE)));

  const availableFallbackGroups = useMemo(
    () =>
      allGroups.filter((group) => {
        if (editingGroup && group.id === editingGroup.id) return false;
        return group.platform === groupForm.platform && group.subscription_type !== 'subscription';
      }),
    [allGroups, editingGroup, groupForm.platform]
  );

  const openCreateModal = () => {
    setEditingGroup(null);
    setGroupForm(DEFAULT_GROUP_FORM);
    setShowGroupModal(true);
  };

  const openEditModal = (group: AdminGroup) => {
    setEditingGroup(group);
    setGroupForm(toGroupForm(group));
    setShowGroupModal(true);
  };

  const closeGroupModal = () => {
    setShowGroupModal(false);
    setEditingGroup(null);
    setGroupForm(DEFAULT_GROUP_FORM);
  };

  const handleSubmitGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        name: groupForm.name.trim(),
        description: groupForm.description.trim() || undefined,
        platform: groupForm.platform,
        rate_multiplier: Number(groupForm.rate_multiplier || 1),
        is_exclusive: groupForm.is_exclusive,
        subscription_type: groupForm.subscription_type,
        claude_code_only: groupForm.claude_code_only,
        fallback_group_id: groupForm.fallback_group_id ? Number(groupForm.fallback_group_id) : null,
        fallback_group_id_on_invalid_request: groupForm.fallback_group_id_on_invalid_request
          ? Number(groupForm.fallback_group_id_on_invalid_request)
          : null,
        require_oauth_only: groupForm.require_oauth_only,
        require_privacy_set: groupForm.require_privacy_set,
        model_routing_enabled: groupForm.model_routing_enabled,
      };

      if (editingGroup) {
        await updateAdminGroup(editingGroup.id, payload);
        setSuccess('分组更新成功');
      } else {
        await createAdminGroup(payload);
        setSuccess('分组创建成功');
      }

      closeGroupModal();
      await loadGroups(editingGroup ? pagination.page : 1);
    } catch (submitError: unknown) {
      setError(getErrorMessage(submitError, editingGroup ? '更新分组失败' : '创建分组失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (group: AdminGroup) => {
    try {
      const nextStatus = group.status === 'inactive' ? 'active' : 'inactive';
      await updateAdminGroup(group.id, { status: nextStatus });
      setSuccess(nextStatus === 'active' ? '分组已启用' : '分组已停用');
      await loadGroups(pagination.page);
    } catch (statusError: unknown) {
      setError(getErrorMessage(statusError, '更新分组状态失败'));
    }
  };

  const handleDeleteGroup = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await deleteAdminGroup(deleteTarget.id);
      setSuccess('分组已删除');
      setDeleteTarget(null);
      await loadGroups(Math.max(1, pagination.page));
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError, '删除分组失败'));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const openRateModal = async (group: AdminGroup) => {
    setRateTarget(group);
    setRateEntries([]);
    setRateDraftEntries([]);
    setUserSearchQuery('');
    setUserSearchResults([]);
    setSelectedRateUser(null);
    setNewRateValue('');
    setBatchFactor('');
    setRateLoading(true);
    try {
      const result = await listAdminGroupRateMultipliers(group.id);
      setRateEntries(result);
      setRateDraftEntries(cloneRateEntries(result));
    } catch (rateError: unknown) {
      setError(getErrorMessage(rateError, '加载专属倍率失败'));
      setRateTarget(null);
    } finally {
      setRateLoading(false);
    }
  };

  const closeRateModal = () => {
    setRateTarget(null);
    setRateEntries([]);
    setRateDraftEntries([]);
    setUserSearchQuery('');
    setUserSearchResults([]);
    setSelectedRateUser(null);
    setNewRateValue('');
    setBatchFactor('');
  };

  const handleClearRateMultipliers = async () => {
    if (!rateTarget) return;
    setClearingRates(true);
    setError('');
    setSuccess('');
    try {
      await clearAdminGroupRateMultipliers(rateTarget.id);
      setRateEntries([]);
      setRateDraftEntries([]);
      setSuccess('专属倍率已清空');
    } catch (clearError: unknown) {
      setError(getErrorMessage(clearError, '清空专属倍率失败'));
    } finally {
      setClearingRates(false);
    }
  };

  const hasRateChanges = useMemo(() => {
    if (rateDraftEntries.length !== rateEntries.length) return true;
    const serverMap = new Map(rateEntries.map((entry) => [entry.user_id, entry.rate_multiplier]));
    return rateDraftEntries.some((entry) => serverMap.get(entry.user_id) !== entry.rate_multiplier);
  }, [rateDraftEntries, rateEntries]);

  useEffect(() => {
    if (!rateTarget) return;
    const keyword = userSearchQuery.trim();
    if (!keyword) return;

    const timer = window.setTimeout(async () => {
      setUserSearchLoading(true);
      try {
        const result = await listAdminUsers({ page: 1, page_size: 10, search: keyword });
        setUserSearchResults(result.items);
      } catch {
        setUserSearchResults([]);
      } finally {
        setUserSearchLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [rateTarget, userSearchQuery]);

  const handleSelectRateUser = (user: AdminUser) => {
    setSelectedRateUser(user);
    setUserSearchQuery(user.email || user.username || String(user.id));
    setUserSearchResults([]);
  };

  const handleAddRateEntry = () => {
    if (!selectedRateUser) return;
    const nextRate = Number(newRateValue);
    if (!Number.isFinite(nextRate) || nextRate < 0) {
      setError('请输入有效倍率');
      return;
    }

    const nextEntry: LocalRateEntry = {
      user_id: selectedRateUser.id,
      user_name: selectedRateUser.username || '',
      user_email: selectedRateUser.email,
      user_notes: selectedRateUser.notes || '',
      user_status: selectedRateUser.status || 'active',
      rate_multiplier: nextRate,
    };

    setRateDraftEntries((prev) => {
      const index = prev.findIndex((entry) => entry.user_id === selectedRateUser.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = nextEntry;
        return next;
      }
      return [...prev, nextEntry];
    });
    setSelectedRateUser(null);
    setUserSearchQuery('');
    setUserSearchResults([]);
    setNewRateValue('');
  };

  const handleUpdateRateValue = (userId: number, value: string) => {
    const nextRate = Number(value);
    if (!Number.isFinite(nextRate) || nextRate < 0) return;
    setRateDraftEntries((prev) =>
      prev.map((entry) => (entry.user_id === userId ? { ...entry, rate_multiplier: nextRate } : entry))
    );
  };

  const handleRemoveRateEntry = (userId: number) => {
    setRateDraftEntries((prev) => prev.filter((entry) => entry.user_id !== userId));
  };

  const handleApplyBatchFactor = () => {
    const factor = Number(batchFactor);
    if (!Number.isFinite(factor) || factor <= 0) {
      setError('请输入大于 0 的批量倍率');
      return;
    }
    setRateDraftEntries((prev) =>
      prev.map((entry) => ({
        ...entry,
        rate_multiplier: Number((((entry.rate_multiplier ?? 1) * factor)).toFixed(6)),
      }))
    );
    setBatchFactor('');
  };

  const handleRevertRateChanges = () => {
    setRateDraftEntries(cloneRateEntries(rateEntries));
    setBatchFactor('');
    setUserSearchQuery('');
    setUserSearchResults([]);
    setSelectedRateUser(null);
    setNewRateValue('');
  };

  const handleSaveRateEntries = async () => {
    if (!rateTarget) return;
    setRateSaving(true);
    setError('');
    setSuccess('');
    try {
      await batchSetAdminGroupRateMultipliers(
        rateTarget.id,
        rateDraftEntries.map((entry) => ({
          user_id: entry.user_id,
          rate_multiplier: Number(entry.rate_multiplier),
        }))
      );
      setRateEntries(cloneRateEntries(rateDraftEntries));
      setSuccess('专属倍率已保存');
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError, '保存专属倍率失败'));
    } finally {
      setRateSaving(false);
    }
  };

  const handleSearch = async () => {
    await loadGroups(1, search, filters, sortState);
  };

  const handleSortToggle = async () => {
    const nextSort = {
      key: sortState.key,
      order: sortState.order === 'asc' ? 'desc' : 'asc',
    } as const;
    setSortState(nextSort);
    await loadGroups(1, search, filters, nextSort);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">分组管理</h2>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void handleSearch();
                }
              }}
              placeholder="搜索分组..."
              className="w-full rounded-2xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-800 dark:bg-[#1A1A1A] dark:text-white"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={filters.platform}
              onChange={(e) => setFilters((prev) => ({ ...prev, platform: e.target.value }))}
              className="rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">全部平台</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="antigravity">Antigravity</option>
            </select>
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">全部状态</option>
              <option value="active">启用</option>
              <option value="inactive">停用</option>
            </select>
            <select
              value={filters.is_exclusive}
              onChange={(e) => setFilters((prev) => ({ ...prev, is_exclusive: e.target.value }))}
              className="rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">全部分组</option>
              <option value="false">公开</option>
              <option value="true">专属</option>
            </select>
            <button
              type="button"
              onClick={() => void handleSearch()}
              className="rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-black dark:bg-white dark:text-gray-900"
            >
              搜索
            </button>
            <button
              type="button"
              onClick={() => void loadGroups(pagination.page)}
              className="rounded-2xl border border-gray-200 px-3 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              title="刷新"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => void handleSortToggle()}
              className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <ArrowUpDown className="h-4 w-4" />
              排序
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-600"
            >
              <Plus className="h-4 w-4" />
              创建分组
            </button>
          </div>
        </div>
      </div>

      {(error || success) && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            error
              ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
              : 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
          }`}
        >
          {error || success}
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="border-b border-gray-100 px-5 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          第 {pagination.page} / {totalPages} 页，共 {pagination.total} 个分组
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr className="text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">平台</th>
                <th className="px-4 py-3 font-medium">计费类型</th>
                <th className="px-4 py-3 font-medium">费率倍数</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">账号数</th>
                <th className="px-4 py-3 font-medium">容量</th>
                <th className="px-4 py-3 font-medium">用量</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    正在加载分组...
                  </td>
                </tr>
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    暂无分组数据
                  </td>
                </tr>
              ) : (
                groups.map((group) => {
                  const usage = usageMap[group.id];
                  const capacity = capacityMap[group.id];
                  const availableAccounts = Math.max(
                    0,
                    Number(group.active_account_count || 0) - Number(group.rate_limited_account_count || 0)
                  );

                  return (
                    <tr key={group.id} className="border-t border-gray-100 align-top dark:border-gray-800">
                      <td className="px-4 py-4">
                        <div className="font-medium text-gray-900 dark:text-white">{group.name}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{group.description || '-'}</div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getPlatformBadgeClass(
                            group.platform
                          )}`}
                        >
                          {getPlatformLabel(group.platform)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1 text-xs">
                          <div className="font-medium text-gray-700 dark:text-gray-300">{getBillingLabel(group)}</div>
                          {group.subscription_type === 'subscription' ? (
                            <div className="text-gray-500 dark:text-gray-400">
                              {group.daily_limit_usd || group.weekly_limit_usd || group.monthly_limit_usd
                                ? [
                                    group.daily_limit_usd ? `$${group.daily_limit_usd}/日` : null,
                                    group.weekly_limit_usd ? `$${group.weekly_limit_usd}/周` : null,
                                    group.monthly_limit_usd ? `$${group.monthly_limit_usd}/月` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')
                                : '不限额'}
                            </div>
                          ) : (
                            <div className="text-gray-500 dark:text-gray-400">按余额扣费</div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-gray-700 dark:text-gray-300">{Number(group.rate_multiplier || 1).toFixed(1)}x</td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            group.is_exclusive
                              ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {group.is_exclusive ? '专属' : '公开'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                          <div>可用: {availableAccounts}</div>
                          <div>总量: {Number(group.account_count || 0)}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                          <div>
                            并发: {Number(capacity?.concurrency_used || 0)} / {Number(capacity?.concurrency_max || 0)}
                          </div>
                          <div>
                            会话: {Number(capacity?.sessions_used || 0)} / {Number(capacity?.sessions_max || 0)}
                          </div>
                          <div>
                            RPM: {Number(capacity?.rpm_used || 0)} / {Number(capacity?.rpm_max || 0)}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                          <div>今日 {formatCurrency(usage?.today_cost)}</div>
                          <div>累计 {formatCurrency(usage?.total_cost)}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            group.status === 'inactive'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          }`}
                        >
                          {group.status === 'inactive' ? '停用' : '启用'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(group)}
                            className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => void openRateModal(group)}
                            className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            专属倍率
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(group)}
                            className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                              group.status === 'inactive'
                                ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-950/30'
                                : 'border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-900/40 dark:text-orange-300 dark:hover:bg-orange-950/30'
                            }`}
                          >
                            {group.status === 'inactive' ? '启用' : '停用'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(group)}
                            className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <div>
            第 {pagination.page} / {totalPages} 页，共 {pagination.total} 个分组
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1 || loading}
              onClick={() => void loadGroups(pagination.page - 1)}
              className="rounded-2xl border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={pagination.page >= totalPages || loading}
              onClick={() => void loadGroups(pagination.page + 1)}
              className="rounded-2xl border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      <ModalShell
        open={showGroupModal}
        title={editingGroup ? '编辑分组' : '创建分组'}
        onClose={closeGroupModal}
        maxWidth="max-w-4xl"
      >
        <form onSubmit={handleSubmitGroup}>
          <div className="space-y-6 px-7 py-6">
            <div>
              <FieldLabel>分组名称</FieldLabel>
              <input
                required
                value={groupForm.name}
                onChange={(e) => setGroupForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="请输入分组名称"
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              />
            </div>

            <div>
              <FieldLabel>描述</FieldLabel>
              <textarea
                rows={3}
                value={groupForm.description}
                onChange={(e) => setGroupForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="可选描述"
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>平台</FieldLabel>
                <select
                  value={groupForm.platform}
                  onChange={(e) => setGroupForm((prev) => ({ ...prev, platform: e.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Gemini</option>
                  <option value="antigravity">Antigravity</option>
                </select>
              </div>
              <div>
                <FieldLabel>费率倍数</FieldLabel>
                <input
                  type="number"
                  step="0.1"
                  value={groupForm.rate_multiplier}
                  onChange={(e) => setGroupForm((prev) => ({ ...prev, rate_multiplier: e.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">1.0 = 标准费率，0.5 = 半价，2.0 = 双倍</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>计费类型</FieldLabel>
                <select
                  value={groupForm.subscription_type}
                  onChange={(e) => setGroupForm((prev) => ({ ...prev, subscription_type: e.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                >
                  <option value="standard">标准（余额）</option>
                  <option value="subscription">订阅</option>
                </select>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">标准计费从用户余额扣除，订阅模式使用配额限制。</p>
              </div>
              <div>
                <FieldLabel>专属分组</FieldLabel>
                <button
                  type="button"
                  onClick={() => setGroupForm((prev) => ({ ...prev, is_exclusive: !prev.is_exclusive }))}
                  className="flex w-full items-center justify-between rounded-2xl border border-gray-200 px-5 py-4 text-left dark:border-gray-700"
                >
                  <span className="text-base text-gray-900 dark:text-white">{groupForm.is_exclusive ? '专属' : '公开'}</span>
                  <span
                    className={`relative inline-flex h-7 w-12 rounded-full transition ${
                      groupForm.is_exclusive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                        groupForm.is_exclusive ? 'left-6' : 'left-1'
                      }`}
                    />
                  </span>
                </button>
              </div>
            </div>

            {groupForm.platform === 'anthropic' && (
              <>
                <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-base font-medium text-gray-900 dark:text-white">Claude Code 客户端限制</div>
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        开启后仅允许 Claude Code 客户端使用该分组。
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGroupForm((prev) => ({ ...prev, claude_code_only: !prev.claude_code_only }))}
                      className={`relative inline-flex h-7 w-12 rounded-full transition ${
                        groupForm.claude_code_only ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                          groupForm.claude_code_only ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div>
                  <FieldLabel>无效请求兜底分组</FieldLabel>
                  <select
                    value={groupForm.fallback_group_id_on_invalid_request}
                    onChange={(e) =>
                      setGroupForm((prev) => ({ ...prev, fallback_group_id_on_invalid_request: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                  >
                    <option value="">不兜底</option>
                    {availableFallbackGroups.map((group) => (
                      <option key={group.id} value={String(group.id)}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">仅当上游明确返回 prompt too long 等错误时才会触发。</p>
                </div>
              </>
            )}

            {(groupForm.platform === 'anthropic' || groupForm.platform === 'openai' || groupForm.platform === 'antigravity') && (
              <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <div className="text-base font-medium text-gray-900 dark:text-white">账号过滤控制</div>
                <div className="mt-4 space-y-4">
                  <button
                    type="button"
                    onClick={() => setGroupForm((prev) => ({ ...prev, require_oauth_only: !prev.require_oauth_only }))}
                    className="flex w-full items-center justify-between gap-4 rounded-2xl border border-gray-200 px-4 py-3 text-left dark:border-gray-700"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">仅允许 OAuth 账号</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{groupForm.require_oauth_only ? '已启用' : '未启用'}</div>
                    </div>
                    <span
                      className={`relative inline-flex h-7 w-12 rounded-full transition ${
                        groupForm.require_oauth_only ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                          groupForm.require_oauth_only ? 'left-6' : 'left-1'
                        }`}
                      />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupForm((prev) => ({ ...prev, require_privacy_set: !prev.require_privacy_set }))}
                    className="flex w-full items-center justify-between gap-4 rounded-2xl border border-gray-200 px-4 py-3 text-left dark:border-gray-700"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">仅允许隐私保护已设置的账号</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{groupForm.require_privacy_set ? '已启用' : '未启用'}</div>
                    </div>
                    <span
                      className={`relative inline-flex h-7 w-12 rounded-full transition ${
                        groupForm.require_privacy_set ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                          groupForm.require_privacy_set ? 'left-6' : 'left-1'
                        }`}
                      />
                    </span>
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-base font-medium text-gray-900 dark:text-white">模型路由配置</div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">启用后，配置的路由规则才会生效。</div>
                </div>
                <button
                  type="button"
                  onClick={() => setGroupForm((prev) => ({ ...prev, model_routing_enabled: !prev.model_routing_enabled }))}
                  className={`relative inline-flex h-7 w-12 rounded-full transition ${
                    groupForm.model_routing_enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                      groupForm.model_routing_enabled ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 px-7 py-5 dark:border-gray-800">
            <button
              type="button"
              onClick={closeGroupModal}
              className="rounded-2xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? (editingGroup ? '保存中' : '创建中') : editingGroup ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </ModalShell>

      <ModalShell open={Boolean(rateTarget)} title="专属倍率" onClose={closeRateModal} maxWidth="max-w-5xl">
        <div className="space-y-5 px-7 py-6">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-gray-900/40 dark:text-gray-300">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getPlatformBadgeClass(rateTarget?.platform)}`}>
              {getPlatformLabel(rateTarget?.platform)}
            </span>
            <span className="text-gray-400">|</span>
            <span className="font-medium text-gray-900 dark:text-white">{rateTarget?.name}</span>
            <span className="text-gray-400">|</span>
            <span>默认倍率：{Number(rateTarget?.rate_multiplier || 1).toFixed(2)}x</span>
          </div>
          <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
            <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">添加用户专属倍率</h4>
            <div className="grid gap-3 md:grid-cols-[1fr_120px_auto]">
              <div className="relative">
                <input
                  value={userSearchQuery}
                  onChange={(e) => {
                    setUserSearchQuery(e.target.value);
                    setSelectedRateUser(null);
                    if (!e.target.value.trim()) {
                      setUserSearchResults([]);
                    }
                  }}
                  placeholder="搜索用户邮箱 / 用户名"
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
                {userSearchLoading ? (
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">正在搜索用户...</div>
                ) : userSearchResults.length > 0 ? (
                  <div className="absolute left-0 right-0 top-full z-10 mt-2 max-h-56 overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-[#151515]">
                    {userSearchResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleSelectRateUser(user)}
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <span className="text-gray-400">#{user.id}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{user.username || user.email}</span>
                        {user.username ? <span className="text-xs text-gray-400">{user.email}</span> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <input
                type="number"
                min="0"
                step="0.001"
                value={newRateValue}
                onChange={(e) => setNewRateValue(e.target.value)}
                placeholder="1.0"
                className="rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              />
              <button
                type="button"
                onClick={handleAddRateEntry}
                disabled={!selectedRateUser || !newRateValue}
                className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
              >
                添加
              </button>
            </div>

            {rateDraftEntries.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">批量调整</span>
                <span className="text-xs text-gray-400">×</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={batchFactor}
                  onChange={(e) => setBatchFactor(e.target.value)}
                  placeholder="0.5"
                  className="w-24 rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-center text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleApplyBatchFactor}
                  disabled={!batchFactor}
                  className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-black disabled:opacity-60 dark:bg-white dark:text-gray-900"
                >
                  应用倍率
                </button>
                <button
                  type="button"
                  disabled={clearingRates}
                  onClick={() => void handleClearRateMultipliers()}
                  className="ml-auto rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  {clearingRates ? '清空中' : '清空全部'}
                </button>
              </div>
            ) : null}
          </div>

          {rateLoading ? (
            <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">正在加载专属倍率...</div>
          ) : rateDraftEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              暂无用户设置专属倍率
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
              <div className="max-h-[420px] overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/70">
                    <tr className="text-left text-gray-500 dark:text-gray-400">
                      <th className="px-4 py-3 font-medium">用户邮箱</th>
                      <th className="px-4 py-3 font-medium">ID</th>
                      <th className="px-4 py-3 font-medium">用户名</th>
                      <th className="px-4 py-3 font-medium">备注</th>
                      <th className="px-4 py-3 font-medium">状态</th>
                      <th className="px-4 py-3 font-medium">倍率</th>
                      <th className="px-4 py-3 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateDraftEntries.map((entry) => (
                      <tr key={entry.user_id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{entry.user_email}</td>
                        <td className="px-4 py-3 text-gray-400 dark:text-gray-500">{entry.user_id}</td>
                        <td className="px-4 py-3 text-gray-900 dark:text-white">{entry.user_name || '-'}</td>
                        <td className="max-w-[180px] truncate px-4 py-3 text-gray-500 dark:text-gray-400" title={entry.user_notes || ''}>
                          {entry.user_notes || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              entry.user_status === 'active'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {entry.user_status || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={entry.rate_multiplier}
                            onChange={(e) => handleUpdateRateValue(entry.user_id, e.target.value)}
                            className="w-24 rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-center text-sm font-medium text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleRemoveRateEntry(entry.user_id)}
                            className="rounded-xl border border-red-200 p-2 text-red-600 transition hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
            {hasRateChanges ? (
              <>
                <span className="text-xs text-amber-600 dark:text-amber-400">有未保存的修改</span>
                <button
                  type="button"
                  onClick={handleRevertRateChanges}
                  className="text-xs font-medium text-emerald-600 transition hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                >
                  撤销修改
                </button>
              </>
            ) : null}
            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={closeRateModal}
                className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                关闭
              </button>
              {hasRateChanges ? (
                <button
                  type="button"
                  disabled={rateSaving}
                  onClick={() => void handleSaveRateEntries()}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
                >
                  {rateSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {rateSaving ? '保存中' : '保存'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={Boolean(deleteTarget)} title="删除分组" onClose={() => setDeleteTarget(null)} maxWidth="max-w-lg">
        <div className="space-y-5 px-7 py-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            确认删除分组 <span className="font-medium text-gray-900 dark:text-white">{deleteTarget?.name}</span> 吗？该操作不可撤销。
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 px-7 py-5 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
            className="rounded-2xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            取消
          </button>
          <button
            type="button"
            disabled={deleteSubmitting}
            onClick={() => void handleDeleteGroup()}
            className="inline-flex items-center gap-2 rounded-2xl bg-red-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-60"
          >
            {deleteSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {deleteSubmitting ? '删除中' : '确认删除'}
          </button>
        </div>
      </ModalShell>
    </div>
  );
}
