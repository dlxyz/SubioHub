'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Columns3,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Shuffle,
  X,
} from 'lucide-react';
import {
  createAdminUser,
  deleteAdminUser,
  getAdminUserUsageStats,
  listAdminGroups,
  listAdminUserApiKeys,
  listAdminUserBalanceHistory,
  listAdminUsers,
  updateAdminUser,
  updateAdminUserBalance,
  type AdminGroup,
  type AdminUser,
  type AdminUserApiKey,
  type AdminUserBalanceHistoryResult,
  type AdminUserUsageStats,
} from '@/lib/admin-api';

const PAGE_SIZE = 20;
const VISIBLE_FILTERS_KEY = 'next-admin-users-visible-filters';
const FILTER_VALUES_KEY = 'next-admin-users-filter-values';
const HIDDEN_COLUMNS_KEY = 'next-admin-users-hidden-columns';
const SORT_STATE_KEY = 'next-admin-users-sort';

type ColumnKey =
  | 'id'
  | 'email'
  | 'role'
  | 'status'
  | 'balance'
  | 'usage'
  | 'concurrency'
  | 'group_name'
  | 'commission_rate'
  | 'commission_balance'
  | 'created_at';

type SortKey = 'id' | 'email' | 'role' | 'status' | 'balance' | 'concurrency' | 'created_at';

type FiltersState = {
  role: string;
  status: string;
  group: string;
};

type CreateFormState = {
  email: string;
  password: string;
  username: string;
  balance: string;
  concurrency: string;
};

type BalanceFormState = {
  amount: string;
  notes: string;
};

const DEFAULT_HIDDEN_COLUMNS: ColumnKey[] = ['group_name', 'commission_rate', 'commission_balance', 'created_at'];
const TOGGLEABLE_COLUMNS: Array<{ key: ColumnKey; label: string }> = [
  { key: 'id', label: 'ID' },
  { key: 'role', label: '角色' },
  { key: 'status', label: '状态' },
  { key: 'balance', label: '余额' },
  { key: 'usage', label: '用量' },
  { key: 'concurrency', label: '并发数' },
  { key: 'group_name', label: '分组' },
  { key: 'commission_rate', label: '返佣比例' },
  { key: 'commission_balance', label: '佣金余额' },
  { key: 'created_at', label: '创建时间' },
];
const BUILT_IN_FILTERS = [
  { key: 'role', label: '全部角色' },
  { key: 'status', label: '全部状态' },
  { key: 'group', label: '全部分组' },
] as const;

const EMPTY_CREATE_FORM: CreateFormState = {
  email: '',
  password: '',
  username: '',
  balance: '0',
  concurrency: '1',
};

const EMPTY_BALANCE_HISTORY: AdminUserBalanceHistoryResult = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  total_recharged: 0,
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
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

function formatCurrency(value?: number | null) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function readStoredArray<T>(key: string): T[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : null;
  } catch {
    return null;
  }
}

function readStoredObject<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function generatePassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
  let password = '';
  for (let index = 0; index < length; index += 1) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function maskApiKey(value?: string) {
  if (!value) return '-';
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function normalizeAllowedGroupIds(input?: AdminUser['allowed_groups']) {
  if (!Array.isArray(input)) return [];
  if (input.length === 0) return [];
  if (typeof input[0] === 'number') {
    return (input as number[]).map((item) => Number(item)).filter((item) => Number.isFinite(item));
  }
  return (input as Array<{ id: number; name: string }>).map((item) => Number(item.id)).filter((item) => Number.isFinite(item));
}

function renderGroupNames(user: AdminUser, groups: AdminGroup[]) {
  if (user.group_name) return user.group_name;
  const ids = normalizeAllowedGroupIds(user.allowed_groups);
  if (ids.length === 0) return '-';
  const names = ids
    .map((id) => groups.find((group) => group.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.join('、') : ids.join(', ');
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
      <div className={`w-full ${maxWidth} overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-[#111111]`}>
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
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">{children}</label>;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState(() => readStoredObject<{ search?: string }>(FILTER_VALUES_KEY)?.search || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showColumnPanel, setShowColumnPanel] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [visibleFilters, setVisibleFilters] = useState<Set<string>>(
    () => new Set(readStoredArray<string>(VISIBLE_FILTERS_KEY) || [])
  );
  const [hiddenColumns, setHiddenColumns] = useState<Set<ColumnKey>>(
    () => new Set(readStoredArray<ColumnKey>(HIDDEN_COLUMNS_KEY) || DEFAULT_HIDDEN_COLUMNS)
  );
  const [filters, setFilters] = useState<FiltersState>(() => {
    const stored = readStoredObject<FiltersState & { search?: string }>(FILTER_VALUES_KEY);
    return {
      role: stored?.role || '',
      status: stored?.status || '',
      group: stored?.group || '',
    };
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
  });
  const [sortState, setSortState] = useState<{ key: SortKey; order: 'asc' | 'desc' }>(() => {
    const stored = readStoredObject<{ key?: SortKey; order?: 'asc' | 'desc' }>(SORT_STATE_KEY);
    return stored?.key && stored?.order ? { key: stored.key, order: stored.order } : { key: 'created_at', order: 'desc' };
  });
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [balanceTarget, setBalanceTarget] = useState<AdminUser | null>(null);
  const [balanceOperation, setBalanceOperation] = useState<'add' | 'subtract'>('add');
  const [balanceForm, setBalanceForm] = useState<BalanceFormState>({ amount: '', notes: '' });
  const [balanceSubmitting, setBalanceSubmitting] = useState(false);
  const [groupTarget, setGroupTarget] = useState<AdminUser | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const [apiKeysTarget, setApiKeysTarget] = useState<AdminUser | null>(null);
  const [apiKeys, setApiKeys] = useState<AdminUserApiKey[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<AdminUser | null>(null);
  const [historyData, setHistoryData] = useState<AdminUserBalanceHistoryResult>(EMPTY_BALANCE_HISTORY);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [usageStats, setUsageStats] = useState<Record<number, AdminUserUsageStats>>({});

  const persistPreferences = useCallback(
    (
      nextFilters = filters,
      nextSearch = search,
      nextVisibleFilters = visibleFilters,
      nextHiddenColumns = hiddenColumns,
      nextSortState = sortState
    ) => {
      try {
        localStorage.setItem(VISIBLE_FILTERS_KEY, JSON.stringify([...nextVisibleFilters]));
        localStorage.setItem(
          FILTER_VALUES_KEY,
          JSON.stringify({
            ...nextFilters,
            search: nextSearch,
          })
        );
        localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify([...nextHiddenColumns]));
        localStorage.setItem(SORT_STATE_KEY, JSON.stringify(nextSortState));
      } catch (saveError) {
        console.error('保存用户页本地偏好失败', saveError);
      }
    },
    [filters, hiddenColumns, search, sortState, visibleFilters]
  );

  const loadUsers = useCallback(
    async (page = 1, keyword = search, nextFilters = filters, nextSort = sortState) => {
      setLoading(true);
      setError('');
      try {
        const [userResult, groupResult] = await Promise.all([
          listAdminUsers({
            page,
            page_size: PAGE_SIZE,
            search: keyword || undefined,
            role: nextFilters.role || undefined,
            status: nextFilters.status || undefined,
            group_name: nextFilters.group || undefined,
            include_subscriptions: false,
            sort_by: nextSort.key,
            sort_order: nextSort.order,
          }),
          groups.length > 0 ? Promise.resolve({ items: groups, total: groups.length, page: 1, pageSize: groups.length }) : listAdminGroups({ page: 1, page_size: 200 }),
        ]);

        setUsers(userResult.items);
        setGroups(groupResult.items);
        setUsageStats({});
        setPagination({
          page: userResult.page || page,
          pageSize: userResult.pageSize || PAGE_SIZE,
          total: userResult.total,
        });

        if (userResult.items.length > 0) {
          const usageEntries = await Promise.all(
            userResult.items.map(async (user) => {
              try {
                const stats = await getAdminUserUsageStats(user.id, { period: 'month' });
                return [user.id, stats] as const;
              } catch {
                return [user.id, {}] as const;
              }
            })
          );
          setUsageStats(Object.fromEntries(usageEntries));
        }
      } catch (loadError: unknown) {
        setError(getErrorMessage(loadError, '加载用户列表失败'));
      } finally {
        setLoading(false);
      }
    },
    [filters, groups, search, sortState]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers]);

  const openCreateModal = () => {
    setCreateForm(EMPTY_CREATE_FORM);
    setShowCreateModal(true);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await createAdminUser({
        email: createForm.email.trim(),
        password: createForm.password,
        username: createForm.username.trim() || undefined,
        balance: Number(createForm.balance || 0),
        concurrency: Number(createForm.concurrency || 1),
      });
      setSuccess('用户创建成功');
      setShowCreateModal(false);
      setCreateForm(EMPTY_CREATE_FORM);
      await loadUsers(1);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError, '创建用户失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: AdminUser) => {
    try {
      const nextStatus = user.status === 'disabled' ? 'active' : 'disabled';
      await updateAdminUser(user.id, { status: nextStatus });
      setSuccess(nextStatus === 'active' ? '用户已启用' : '用户已禁用');
      await loadUsers(pagination.page);
    } catch (updateError: unknown) {
      setError(getErrorMessage(updateError, '更新用户状态失败'));
    }
  };

  const openBalanceModal = (user: AdminUser, operation: 'add' | 'subtract') => {
    setBalanceTarget(user);
    setBalanceOperation(operation);
    setBalanceForm({
      amount: '',
      notes: operation === 'add' ? '管理员充值' : '管理员退款',
    });
  };

  const handleSubmitBalance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!balanceTarget) return;
    const amount = Number(balanceForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('请输入大于 0 的金额');
      return;
    }

    setBalanceSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await updateAdminUserBalance(balanceTarget.id, {
        balance: amount,
        operation: balanceOperation,
        notes: balanceForm.notes.trim() || undefined,
      });
      setSuccess(balanceOperation === 'add' ? '充值成功' : '退款成功');
      setBalanceTarget(null);
      await loadUsers(pagination.page);
    } catch (balanceError: unknown) {
      setError(getErrorMessage(balanceError, balanceOperation === 'add' ? '充值失败' : '退款失败'));
    } finally {
      setBalanceSubmitting(false);
    }
  };

  const openGroupModal = (user: AdminUser) => {
    setGroupTarget(user);
    setSelectedGroupIds(normalizeAllowedGroupIds(user.allowed_groups));
  };

  const handleToggleGroupSelection = (groupId: number) => {
    setSelectedGroupIds((prev) => (prev.includes(groupId) ? prev.filter((item) => item !== groupId) : [...prev, groupId]));
  };

  const handleSaveGroups = async () => {
    if (!groupTarget) return;
    setGroupSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await updateAdminUser(groupTarget.id, { allowed_groups: selectedGroupIds });
      setSuccess('用户分组已更新');
      setGroupTarget(null);
      await loadUsers(pagination.page);
    } catch (groupError: unknown) {
      setError(getErrorMessage(groupError, '更新用户分组失败'));
    } finally {
      setGroupSubmitting(false);
    }
  };

  const openApiKeysModal = async (user: AdminUser) => {
    setApiKeysTarget(user);
    setApiKeys([]);
    setApiKeysLoading(true);
    try {
      const result = await listAdminUserApiKeys(user.id, { page: 1, page_size: 100 });
      setApiKeys(result.items);
    } catch (apiKeyError: unknown) {
      setError(getErrorMessage(apiKeyError, '加载用户 API 密钥失败'));
      setApiKeysTarget(null);
    } finally {
      setApiKeysLoading(false);
    }
  };

  const openHistoryModal = async (user: AdminUser) => {
    setHistoryTarget(user);
    setHistoryData(EMPTY_BALANCE_HISTORY);
    setHistoryLoading(true);
    try {
      const result = await listAdminUserBalanceHistory(user.id, { page: 1, page_size: 20 });
      setHistoryData(result);
    } catch (historyError: unknown) {
      setError(getErrorMessage(historyError, '加载充值记录失败'));
      setHistoryTarget(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await deleteAdminUser(deleteTarget.id);
      setSuccess('用户已删除');
      setDeleteTarget(null);
      await loadUsers(Math.max(1, pagination.page));
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError, '删除用户失败'));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const toggleBuiltInFilter = (key: (typeof BUILT_IN_FILTERS)[number]['key']) => {
    const nextVisibleFilters = new Set(visibleFilters);
    const nextFilters = { ...filters };
    if (nextVisibleFilters.has(key)) {
      nextVisibleFilters.delete(key);
      nextFilters[key] = '';
    } else {
      nextVisibleFilters.add(key);
    }
    setVisibleFilters(nextVisibleFilters);
    setFilters(nextFilters);
    persistPreferences(nextFilters, search, nextVisibleFilters);
  };

  const toggleColumn = (key: ColumnKey) => {
    const nextHiddenColumns = new Set(hiddenColumns);
    if (nextHiddenColumns.has(key)) {
      nextHiddenColumns.delete(key);
    } else {
      nextHiddenColumns.add(key);
    }
    setHiddenColumns(nextHiddenColumns);
    persistPreferences(filters, search, visibleFilters, nextHiddenColumns);
  };

  const handleSearch = async () => {
    setSuccess('');
    persistPreferences(filters, search);
    await loadUsers(1, search, filters, sortState);
  };

  const handleReset = async () => {
    const nextFilters = { role: '', status: '', group: '' };
    const nextVisibleFilters = new Set<string>();
    setSearch('');
    setFilters(nextFilters);
    setVisibleFilters(nextVisibleFilters);
    setSuccess('');
    persistPreferences(nextFilters, '', nextVisibleFilters);
    await loadUsers(1, '', nextFilters, sortState);
  };

  const handleSort = async (key: SortKey) => {
    const nextSort: { key: SortKey; order: 'asc' | 'desc' } =
      sortState.key === key
        ? { key, order: sortState.order === 'asc' ? 'desc' : 'asc' }
        : { key, order: 'desc' };
    setSortState(nextSort);
    persistPreferences(filters, search, visibleFilters, hiddenColumns, nextSort);
    await loadUsers(1, search, filters, nextSort);
  };

  const isColumnVisible = (key: ColumnKey) => !hiddenColumns.has(key);

  const sortIndicator = (key: SortKey) => {
    if (sortState.key !== key) return '';
    return sortState.order === 'asc' ? ' ↑' : ' ↓';
  };

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.pageSize || PAGE_SIZE)));

  const visibleColumnCount = useMemo(
    () => TOGGLEABLE_COLUMNS.filter((column) => !hiddenColumns.has(column.key)).length + 2,
    [hiddenColumns]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">用户管理</h2>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void handleSearch();
                }
              }}
              placeholder="邮箱/用户名/备注/分组 模糊搜索"
              className="w-full rounded-2xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-800 dark:bg-[#1A1A1A] dark:text-white"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSearch()}
              className="rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-black dark:bg-white dark:text-gray-900"
            >
              搜索
            </button>
            <button
              type="button"
              onClick={() => void loadUsers(pagination.page)}
              className="rounded-2xl border border-gray-200 px-3 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              title="刷新"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setShowFilterPanel((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <Filter className="h-4 w-4" />
              筛选设置
            </button>
            <button
              type="button"
              onClick={() => setShowColumnPanel((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <Columns3 className="h-4 w-4" />
              列设置
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-600"
            >
              <Plus className="h-4 w-4" />
              创建用户
            </button>
          </div>
        </div>
      </div>

      {showFilterPanel && (
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex flex-wrap gap-2">
            {BUILT_IN_FILTERS.map((filter) => {
              const enabled = visibleFilters.has(filter.key);
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => toggleBuiltInFilter(filter.key)}
                  className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                    enabled
                      ? 'bg-emerald-500 text-white'
                      : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {visibleFilters.has('role') && (
              <select
                value={filters.role}
                onChange={(e) => setFilters((prev) => ({ ...prev, role: e.target.value }))}
                className="rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
              >
                <option value="">全部角色</option>
                <option value="admin">admin</option>
                <option value="user">user</option>
              </select>
            )}
            {visibleFilters.has('status') && (
              <select
                value={filters.status}
                onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                className="rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
              >
                <option value="">全部状态</option>
                <option value="active">active</option>
                <option value="disabled">disabled</option>
              </select>
            )}
            {visibleFilters.has('group') && (
              <select
                value={filters.group}
                onChange={(e) => setFilters((prev) => ({ ...prev, group: e.target.value }))}
                className="rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
              >
                <option value="">全部分组</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.name}>
                    {group.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleSearch()}
              className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600"
            >
              应用筛选
            </button>
            <button
              type="button"
              onClick={() => void handleReset()}
              className="rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              重置筛选
            </button>
          </div>
        </div>
      )}

      {showColumnPanel && (
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">列设置</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">邮箱和操作列固定显示，其余字段支持按需勾选并自动保存。</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {TOGGLEABLE_COLUMNS.map((column) => (
              <label key={column.key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={isColumnVisible(column.key)} onChange={() => toggleColumn(column.key)} />
                {column.label}
              </label>
            ))}
          </div>
        </div>
      )}

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
          当前显示 {visibleColumnCount} 列，第 {pagination.page} / {totalPages} 页，共 {pagination.total} 个用户
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr className="text-left text-gray-500 dark:text-gray-400">
                {isColumnVisible('id') && (
                  <th className="cursor-pointer px-4 py-3 font-medium" onClick={() => void handleSort('id')}>
                    ID{sortIndicator('id')}
                  </th>
                )}
                <th className="cursor-pointer px-4 py-3 font-medium" onClick={() => void handleSort('email')}>
                  用户{sortIndicator('email')}
                </th>
                {isColumnVisible('role') && (
                  <th className="cursor-pointer px-4 py-3 font-medium" onClick={() => void handleSort('role')}>
                    角色{sortIndicator('role')}
                  </th>
                )}
                {isColumnVisible('status') && (
                  <th className="cursor-pointer px-4 py-3 font-medium" onClick={() => void handleSort('status')}>
                    状态{sortIndicator('status')}
                  </th>
                )}
                {isColumnVisible('balance') && (
                  <th className="cursor-pointer px-4 py-3 font-medium" onClick={() => void handleSort('balance')}>
                    余额{sortIndicator('balance')}
                  </th>
                )}
                {isColumnVisible('usage') && <th className="px-4 py-3 font-medium">用量</th>}
                {isColumnVisible('concurrency') && (
                  <th className="cursor-pointer px-4 py-3 font-medium" onClick={() => void handleSort('concurrency')}>
                    并发数{sortIndicator('concurrency')}
                  </th>
                )}
                {isColumnVisible('group_name') && <th className="px-4 py-3 font-medium">分组</th>}
                {isColumnVisible('commission_rate') && <th className="px-4 py-3 font-medium">返佣比例</th>}
                {isColumnVisible('commission_balance') && <th className="px-4 py-3 font-medium">佣金余额</th>}
                {isColumnVisible('created_at') && (
                  <th className="cursor-pointer px-4 py-3 font-medium" onClick={() => void handleSort('created_at')}>
                    创建时间{sortIndicator('created_at')}
                  </th>
                )}
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    正在加载用户列表...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    暂无用户数据
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-t border-gray-100 align-top dark:border-gray-800">
                    {isColumnVisible('id') && <td className="px-4 py-4 text-gray-900 dark:text-white">{user.id}</td>}
                    <td className="px-4 py-4 text-gray-900 dark:text-white">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300">
                          {(user.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{user.email}</div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {user.username?.trim() ? user.username : '未设置用户名'}
                          </div>
                          {user.notes?.trim() ? (
                            <div className="mt-1 line-clamp-1 text-xs text-gray-400 dark:text-gray-500">{user.notes}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    {isColumnVisible('role') && (
                      <td className="px-4 py-4 text-gray-500 dark:text-gray-400">{user.role || 'user'}</td>
                    )}
                    {isColumnVisible('status') && (
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            user.status === 'disabled'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          }`}
                        >
                          {user.status || 'active'}
                        </span>
                      </td>
                    )}
                    {isColumnVisible('balance') && (
                      <td className="px-4 py-4 text-gray-900 dark:text-white">{formatCurrency(user.balance)}</td>
                    )}
                    {isColumnVisible('usage') && (
                      <td className="px-4 py-4">
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          <div>本月 {formatCurrency(usageStats[user.id]?.total_cost)}</div>
                          <div className="mt-1">请求 {Number(usageStats[user.id]?.total_requests || 0)}</div>
                        </div>
                      </td>
                    )}
                    {isColumnVisible('concurrency') && (
                      <td className="px-4 py-4 text-gray-500 dark:text-gray-400">{user.concurrency ?? 0}</td>
                    )}
                    {isColumnVisible('group_name') && (
                      <td className="px-4 py-4 text-gray-500 dark:text-gray-400">{renderGroupNames(user, groups)}</td>
                    )}
                    {isColumnVisible('commission_rate') && (
                      <td className="px-4 py-4 text-gray-500 dark:text-gray-400">
                        {Number(user.commission_rate || 0).toFixed(2)}%
                      </td>
                    )}
                    {isColumnVisible('commission_balance') && (
                      <td className="px-4 py-4 text-gray-900 dark:text-white">{formatCurrency(user.commission_balance)}</td>
                    )}
                    {isColumnVisible('created_at') && (
                      <td className="px-4 py-4 text-gray-500 dark:text-gray-400">{formatDate(user.created_at)}</td>
                    )}
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleToggleStatus(user)}
                          className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                            user.status === 'disabled'
                              ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-950/30'
                              : 'border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-900/40 dark:text-orange-300 dark:hover:bg-orange-950/30'
                          }`}
                        >
                          {user.status === 'disabled' ? '启用' : '禁用'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void openApiKeysModal(user)}
                          className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          API 密钥
                        </button>
                        <button
                          type="button"
                          onClick={() => openGroupModal(user)}
                          className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          分组
                        </button>
                        <button
                          type="button"
                          onClick={() => openBalanceModal(user, 'add')}
                          className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-600 transition hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                        >
                          充值
                        </button>
                        <button
                          type="button"
                          onClick={() => openBalanceModal(user, 'subtract')}
                          className="rounded-xl border border-amber-200 px-3 py-2 text-xs font-medium text-amber-600 transition hover:bg-amber-50 dark:border-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-950/30"
                        >
                          退款
                        </button>
                        <button
                          type="button"
                          onClick={() => void openHistoryModal(user)}
                          className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          记录
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(user)}
                          className="rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          删除
                        </button>
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
            第 {pagination.page} / {totalPages} 页，共 {pagination.total} 个用户
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1 || loading}
              onClick={() => void loadUsers(pagination.page - 1)}
              className="rounded-2xl border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={pagination.page >= totalPages || loading}
              onClick={() => void loadUsers(pagination.page + 1)}
              className="rounded-2xl border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      <ModalShell open={showCreateModal} title="创建用户" onClose={() => setShowCreateModal(false)} maxWidth="max-w-3xl">
        <form onSubmit={handleCreate}>
          <div className="space-y-6 px-7 py-6">
            <div>
              <FieldLabel>邮箱</FieldLabel>
              <input
                required
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="请输入邮箱"
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              />
            </div>
            <div>
              <FieldLabel>密码</FieldLabel>
              <div className="flex gap-3">
                <input
                  required
                  value={createForm.password}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="请输入密码"
                  className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setCreateForm((prev) => ({ ...prev, password: generatePassword() }))}
                  className="inline-flex items-center justify-center rounded-2xl border border-gray-200 px-5 py-4 text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  title="生成随机密码"
                >
                  <Shuffle className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div>
              <FieldLabel>用户名</FieldLabel>
              <input
                value={createForm.username}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, username: e.target.value }))}
                placeholder="请输入用户名（选填）"
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>余额</FieldLabel>
                <input
                  type="number"
                  step="0.01"
                  value={createForm.balance}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, balance: e.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
              </div>
              <div>
                <FieldLabel>并发数</FieldLabel>
                <input
                  type="number"
                  min="1"
                  value={createForm.concurrency}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, concurrency: e.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 px-7 py-5 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
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
              {submitting ? '创建中' : '创建'}
            </button>
          </div>
        </form>
      </ModalShell>

      <ModalShell
        open={Boolean(balanceTarget)}
        title={balanceOperation === 'add' ? '用户充值' : '用户退款'}
        onClose={() => setBalanceTarget(null)}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSubmitBalance}>
          <div className="space-y-5 px-7 py-6">
            <div className="text-sm text-gray-500 dark:text-gray-400">目标用户：{balanceTarget?.email}</div>
            <div>
              <FieldLabel>{balanceOperation === 'add' ? '充值金额' : '退款金额'}</FieldLabel>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={balanceForm.amount}
                onChange={(e) => setBalanceForm((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="请输入金额"
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              />
            </div>
            <div>
              <FieldLabel>备注</FieldLabel>
              <textarea
                rows={3}
                value={balanceForm.notes}
                onChange={(e) => setBalanceForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="请输入操作备注"
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 px-7 py-5 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setBalanceTarget(null)}
              className="rounded-2xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={balanceSubmitting}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {balanceSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {balanceSubmitting ? '提交中' : '确认'}
            </button>
          </div>
        </form>
      </ModalShell>

      <ModalShell
        open={Boolean(groupTarget)}
        title="用户分组"
        onClose={() => setGroupTarget(null)}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-5 px-7 py-6">
          <div className="text-sm text-gray-500 dark:text-gray-400">为用户 `{groupTarget?.email}` 选择允许访问的分组。</div>
          <div className="grid gap-3 md:grid-cols-2">
            {groups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                暂无分组数据
              </div>
            ) : (
              groups.map((group) => (
                <label
                  key={group.id}
                  className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition ${
                    selectedGroupIds.includes(group.id)
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  <span>{group.name}</span>
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.includes(group.id)}
                    onChange={() => handleToggleGroupSelection(group.id)}
                  />
                </label>
              ))
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 px-7 py-5 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setGroupTarget(null)}
            className="rounded-2xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            取消
          </button>
          <button
            type="button"
            disabled={groupSubmitting}
            onClick={() => void handleSaveGroups()}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {groupSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {groupSubmitting ? '保存中' : '保存'}
          </button>
        </div>
      </ModalShell>

      <ModalShell
        open={Boolean(apiKeysTarget)}
        title="用户 API 密钥"
        onClose={() => setApiKeysTarget(null)}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-5 px-7 py-6">
          <div className="text-sm text-gray-500 dark:text-gray-400">用户：{apiKeysTarget?.email}</div>
          {apiKeysLoading ? (
            <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">正在加载 API 密钥...</div>
          ) : apiKeys.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              暂无 API 密钥
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/40">
                  <tr className="text-left text-gray-500 dark:text-gray-400">
                    <th className="px-4 py-3 font-medium">名称</th>
                    <th className="px-4 py-3 font-medium">密钥</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">额度</th>
                    <th className="px-4 py-3 font-medium">最后使用</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((apiKey) => (
                    <tr key={apiKey.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{apiKey.name || `Key #${apiKey.id}`}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{maskApiKey(apiKey.key)}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{apiKey.status || '-'}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {formatCurrency(apiKey.quota_used)} / {apiKey.quota ? formatCurrency(apiKey.quota) : '不限'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(apiKey.last_used_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ModalShell>

      <ModalShell
        open={Boolean(historyTarget)}
        title="充值记录"
        onClose={() => setHistoryTarget(null)}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-5 px-7 py-6">
          <div className="flex flex-col gap-2 text-sm text-gray-500 dark:text-gray-400 md:flex-row md:items-center md:justify-between">
            <span>用户：{historyTarget?.email}</span>
            <span>累计充值：{formatCurrency(historyData.total_recharged)}</span>
          </div>
          {historyLoading ? (
            <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">正在加载充值记录...</div>
          ) : historyData.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              暂无充值记录
            </div>
          ) : (
            <div className="space-y-3">
              {historyData.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-gray-200 px-5 py-4 text-sm dark:border-gray-800"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {item.type || 'balance'} / {item.status || '-'}
                    </div>
                    <div className="text-gray-500 dark:text-gray-400">{formatDate(item.created_at)}</div>
                  </div>
                  <div className="mt-2 grid gap-2 text-gray-600 dark:text-gray-300 md:grid-cols-3">
                    <div>金额：{formatCurrency(item.value)}</div>
                    <div>编码：{item.code || '-'}</div>
                    <div>使用时间：{formatDate(item.used_at)}</div>
                  </div>
                  {item.notes ? <div className="mt-2 text-gray-500 dark:text-gray-400">备注：{item.notes}</div> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </ModalShell>

      <ModalShell open={Boolean(deleteTarget)} title="删除用户" onClose={() => setDeleteTarget(null)} maxWidth="max-w-lg">
        <div className="space-y-5 px-7 py-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            确认删除用户 <span className="font-medium text-gray-900 dark:text-white">{deleteTarget?.email}</span> 吗？该操作不可撤销。
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
            onClick={() => void handleDeleteUser()}
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
