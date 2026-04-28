'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, Plus, RefreshCw, RotateCcw, Search, Trash2, X } from 'lucide-react';
import {
  assignAdminSubscription,
  extendAdminSubscription,
  listAdminGroups,
  listAdminSubscriptions,
  listAdminUsers,
  resetAdminSubscriptionQuota,
  revokeAdminSubscription,
  type AdminGroup,
  type AdminSubscription,
  type AdminUser,
} from '@/lib/admin-api';

const PAGE_SIZE = 20;

type SubscriptionFilters = {
  status: string;
  group_id: string;
  platform: string;
};

type AssignFormState = {
  user_id: string;
  group_id: string;
  validity_days: string;
  notes: string;
};

type ResetFormState = {
  daily: boolean;
  weekly: boolean;
  monthly: boolean;
};

const EMPTY_ASSIGN_FORM: AssignFormState = {
  user_id: '',
  group_id: '',
  validity_days: '30',
  notes: '',
};

const EMPTY_RESET_FORM: ResetFormState = {
  daily: true,
  weekly: false,
  monthly: false,
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatDateTime(value?: string | null) {
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

function getProgressWidth(usage?: number, limit?: number | null) {
  if (!limit || limit <= 0) return '0%';
  return `${Math.min(100, Math.max(0, (Number(usage || 0) / limit) * 100))}%`;
}

function getProgressClass(usage?: number, limit?: number | null) {
  if (!limit || limit <= 0) return 'bg-gray-300';
  const ratio = Number(usage || 0) / limit;
  if (ratio >= 0.9) return 'bg-red-500';
  if (ratio >= 0.7) return 'bg-amber-500';
  return 'bg-emerald-500';
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

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filters, setFilters] = useState<SubscriptionFilters>({
    status: '',
    group_id: '',
    platform: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
  });

  const [filterUserKeyword, setFilterUserKeyword] = useState('');
  const [selectedFilterUser, setSelectedFilterUser] = useState<AdminUser | null>(null);
  const [filterUserResults, setFilterUserResults] = useState<AdminUser[]>([]);
  const [filterUserLoading, setFilterUserLoading] = useState(false);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState<AssignFormState>(EMPTY_ASSIGN_FORM);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignUserKeyword, setAssignUserKeyword] = useState('');
  const [assignUserResults, setAssignUserResults] = useState<AdminUser[]>([]);
  const [assignUserLoading, setAssignUserLoading] = useState(false);
  const [selectedAssignUser, setSelectedAssignUser] = useState<AdminUser | null>(null);

  const [extendTarget, setExtendTarget] = useState<AdminSubscription | null>(null);
  const [extendDays, setExtendDays] = useState('30');
  const [extendSubmitting, setExtendSubmitting] = useState(false);

  const [resetTarget, setResetTarget] = useState<AdminSubscription | null>(null);
  const [resetForm, setResetForm] = useState<ResetFormState>(EMPTY_RESET_FORM);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<AdminSubscription | null>(null);
  const [revokeSubmitting, setRevokeSubmitting] = useState(false);

  const loadSubscriptions = useCallback(
    async (page = 1, nextFilters = filters, nextSelectedUser = selectedFilterUser) => {
      setLoading(true);
      setError('');
      try {
        const [subscriptionResult, groupResult] = await Promise.all([
          listAdminSubscriptions({
            page,
            page_size: PAGE_SIZE,
            user_id: nextSelectedUser?.id,
            status: nextFilters.status || undefined,
            group_id: nextFilters.group_id ? Number(nextFilters.group_id) : undefined,
            platform: nextFilters.platform || undefined,
            sort_by: 'created_at',
            sort_order: 'desc',
          }),
          groups.length > 0 ? Promise.resolve({ items: groups, total: groups.length, page: 1, pageSize: groups.length }) : listAdminGroups({ page: 1, page_size: 200 }),
        ]);
        setSubscriptions(subscriptionResult.items);
        setGroups(groupResult.items);
        setPagination({
          page: subscriptionResult.page || page,
          pageSize: subscriptionResult.pageSize || PAGE_SIZE,
          total: subscriptionResult.total,
        });
      } catch (loadError: unknown) {
        setError(getErrorMessage(loadError, '加载订阅失败'));
      } finally {
        setLoading(false);
      }
    },
    [filters, groups, selectedFilterUser]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSubscriptions(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSubscriptions]);

  useEffect(() => {
    const keyword = filterUserKeyword.trim();
    if (!keyword) return;
    const timer = window.setTimeout(async () => {
      setFilterUserLoading(true);
      try {
        const result = await listAdminUsers({ page: 1, page_size: 10, search: keyword });
        setFilterUserResults(result.items);
      } catch {
        setFilterUserResults([]);
      } finally {
        setFilterUserLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [filterUserKeyword]);

  useEffect(() => {
    if (!showAssignModal) return;
    const keyword = assignUserKeyword.trim();
    if (!keyword) return;
    const timer = window.setTimeout(async () => {
      setAssignUserLoading(true);
      try {
        const result = await listAdminUsers({ page: 1, page_size: 10, search: keyword });
        setAssignUserResults(result.items);
      } catch {
        setAssignUserResults([]);
      } finally {
        setAssignUserLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [assignUserKeyword, showAssignModal]);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.pageSize || PAGE_SIZE)));

  const groupOptions = useMemo(
    () =>
      groups.map((group) => ({
        id: group.id,
        name: group.name,
        platform: group.platform,
      })),
    [groups]
  );

  const openAssignModal = async () => {
    setAssignForm(EMPTY_ASSIGN_FORM);
    setAssignUserKeyword('');
    setAssignUserResults([]);
    setSelectedAssignUser(null);
    setShowAssignModal(true);
    if (groups.length === 0) {
      try {
        const result = await listAdminGroups({ page: 1, page_size: 200 });
        setGroups(result.items);
      } catch {
        // ignore
      }
    }
  };

  const handleAssign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assignForm.user_id || !assignForm.group_id) {
      setError('请选择用户和订阅分组');
      return;
    }
    setAssignSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await assignAdminSubscription({
        user_id: Number(assignForm.user_id),
        group_id: Number(assignForm.group_id),
        validity_days: Number(assignForm.validity_days || 30),
        notes: assignForm.notes.trim() || undefined,
      });
      setSuccess('订阅分配成功');
      setShowAssignModal(false);
      await loadSubscriptions(1);
    } catch (assignError: unknown) {
      setError(getErrorMessage(assignError, '分配订阅失败'));
    } finally {
      setAssignSubmitting(false);
    }
  };

  const handleExtend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!extendTarget) return;
    setExtendSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await extendAdminSubscription(extendTarget.id, { days: Number(extendDays || 0) });
      setSuccess('订阅有效期已调整');
      setExtendTarget(null);
      setExtendDays('30');
      await loadSubscriptions(pagination.page);
    } catch (extendError: unknown) {
      setError(getErrorMessage(extendError, '调整订阅失败'));
    } finally {
      setExtendSubmitting(false);
    }
  };

  const handleResetQuota = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetTarget) return;
    if (!resetForm.daily && !resetForm.weekly && !resetForm.monthly) {
      setError('请至少选择一个要重置的额度窗口');
      return;
    }
    setResetSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await resetAdminSubscriptionQuota(resetTarget.id, resetForm);
      setSuccess('订阅额度已重置');
      setResetTarget(null);
      setResetForm(EMPTY_RESET_FORM);
      await loadSubscriptions(pagination.page);
    } catch (resetError: unknown) {
      setError(getErrorMessage(resetError, '重置订阅额度失败'));
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevokeSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await revokeAdminSubscription(revokeTarget.id);
      setSuccess('订阅已撤销');
      setRevokeTarget(null);
      await loadSubscriptions(pagination.page);
    } catch (revokeError: unknown) {
      setError(getErrorMessage(revokeError, '撤销订阅失败'));
    } finally {
      setRevokeSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">订阅管理</h2>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={filterUserKeyword}
              onChange={(e) => {
                setFilterUserKeyword(e.target.value);
                if (!e.target.value.trim()) {
                  setFilterUserResults([]);
                }
                if (!e.target.value.trim()) {
                  setSelectedFilterUser(null);
                  void loadSubscriptions(1, filters, null);
                }
              }}
              placeholder={selectedFilterUser ? selectedFilterUser.email || `用户 #${selectedFilterUser.id}` : '搜索用户邮箱 / 用户名'}
              className="w-full rounded-2xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-800 dark:bg-[#1A1A1A] dark:text-white"
            />
            {(filterUserResults.length > 0 || filterUserLoading) && !selectedFilterUser ? (
              <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-[#151515]">
                {filterUserLoading ? (
                  <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">正在搜索用户...</div>
                ) : (
                  filterUserResults.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setSelectedFilterUser(user);
                        setFilterUserKeyword(user.email || user.username || String(user.id));
                        setFilterUserResults([]);
                        void loadSubscriptions(1, filters, user);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <span className="font-medium text-gray-900 dark:text-white">{user.email}</span>
                      <span className="text-gray-400">#{user.id}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">全部状态</option>
              <option value="active">active</option>
              <option value="expired">expired</option>
              <option value="revoked">revoked</option>
            </select>
            <select
              value={filters.group_id}
              onChange={(e) => setFilters((prev) => ({ ...prev, group_id: e.target.value }))}
              className="rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">全部分组</option>
              {groupOptions.map((group) => (
                <option key={group.id} value={String(group.id)}>
                  {group.name}
                </option>
              ))}
            </select>
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
            <button
              type="button"
              onClick={() => void loadSubscriptions(1)}
              className="rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-black dark:bg-white dark:text-gray-900"
            >
              搜索
            </button>
            <button
              type="button"
              onClick={() => void loadSubscriptions(pagination.page)}
              className="rounded-2xl border border-gray-200 px-3 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              title="刷新"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => void openAssignModal()}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-600"
            >
              <Plus className="h-4 w-4" />
              分配订阅
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
          第 {pagination.page} / {totalPages} 页，共 {pagination.total} 条订阅
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr className="text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">用户</th>
                <th className="px-4 py-3 font-medium">分组</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">使用情况</th>
                <th className="px-4 py-3 font-medium">开始时间</th>
                <th className="px-4 py-3 font-medium">到期时间</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    正在加载订阅...
                  </td>
                </tr>
              ) : subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    暂无订阅数据
                  </td>
                </tr>
              ) : (
                subscriptions.map((subscription) => (
                  <tr key={subscription.id} className="border-t border-gray-100 align-top dark:border-gray-800">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300">
                          {(subscription.user?.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{subscription.user?.email || `用户 #${subscription.user_id}`}</div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subscription.user?.username || '-'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-gray-900 dark:text-white">{subscription.group?.name || `分组 #${subscription.group_id}`}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subscription.group?.platform || '-'}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          subscription.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : subscription.status === 'expired'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                        }`}
                      >
                        {subscription.status || '-'}
                      </span>
                    </td>
                    <td className="min-w-[280px] px-4 py-4">
                      <div className="space-y-2">
                        {subscription.group?.daily_limit_usd ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="w-10 text-gray-500 dark:text-gray-400">日</span>
                              <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-gray-700">
                                <div
                                  className={`h-1.5 rounded-full ${getProgressClass(subscription.daily_usage_usd, subscription.group.daily_limit_usd)}`}
                                  style={{ width: getProgressWidth(subscription.daily_usage_usd, subscription.group.daily_limit_usd) }}
                                />
                              </div>
                              <span className="w-24 text-right text-gray-500 dark:text-gray-400">
                                {formatCurrency(subscription.daily_usage_usd)} / {formatCurrency(subscription.group.daily_limit_usd)}
                              </span>
                            </div>
                          </div>
                        ) : null}
                        {subscription.group?.weekly_limit_usd ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="w-10 text-gray-500 dark:text-gray-400">周</span>
                              <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-gray-700">
                                <div
                                  className={`h-1.5 rounded-full ${getProgressClass(subscription.weekly_usage_usd, subscription.group.weekly_limit_usd)}`}
                                  style={{ width: getProgressWidth(subscription.weekly_usage_usd, subscription.group.weekly_limit_usd) }}
                                />
                              </div>
                              <span className="w-24 text-right text-gray-500 dark:text-gray-400">
                                {formatCurrency(subscription.weekly_usage_usd)} / {formatCurrency(subscription.group.weekly_limit_usd)}
                              </span>
                            </div>
                          </div>
                        ) : null}
                        {subscription.group?.monthly_limit_usd ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="w-10 text-gray-500 dark:text-gray-400">月</span>
                              <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-gray-700">
                                <div
                                  className={`h-1.5 rounded-full ${getProgressClass(subscription.monthly_usage_usd, subscription.group.monthly_limit_usd)}`}
                                  style={{ width: getProgressWidth(subscription.monthly_usage_usd, subscription.group.monthly_limit_usd) }}
                                />
                              </div>
                              <span className="w-24 text-right text-gray-500 dark:text-gray-400">
                                {formatCurrency(subscription.monthly_usage_usd)} / {formatCurrency(subscription.group.monthly_limit_usd)}
                              </span>
                            </div>
                          </div>
                        ) : null}
                        {!subscription.group?.daily_limit_usd &&
                        !subscription.group?.weekly_limit_usd &&
                        !subscription.group?.monthly_limit_usd ? (
                          <span className="text-xs text-gray-400 dark:text-gray-500">当前分组未配置订阅额度</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">{formatDateTime(subscription.starts_at)}</td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">{formatDateTime(subscription.expires_at)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setExtendTarget(subscription);
                            setExtendDays('30');
                          }}
                          className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          <CalendarClock className="h-3.5 w-3.5" />
                          调整时长
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResetTarget(subscription);
                            setResetForm(EMPTY_RESET_FORM);
                          }}
                          className="inline-flex items-center gap-1 rounded-xl border border-blue-200 px-3 py-2 text-xs font-medium text-blue-600 transition hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-400 dark:hover:bg-blue-950/30"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          重置额度
                        </button>
                        <button
                          type="button"
                          onClick={() => setRevokeTarget(subscription)}
                          className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          撤销
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
            第 {pagination.page} / {totalPages} 页，共 {pagination.total} 条订阅
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1 || loading}
              onClick={() => void loadSubscriptions(pagination.page - 1)}
              className="rounded-2xl border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={pagination.page >= totalPages || loading}
              onClick={() => void loadSubscriptions(pagination.page + 1)}
              className="rounded-2xl border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      <ModalShell open={showAssignModal} title="分配订阅" onClose={() => setShowAssignModal(false)}>
        <form onSubmit={handleAssign}>
          <div className="space-y-6 px-7 py-6">
            <div>
              <FieldLabel>用户</FieldLabel>
              <div className="relative">
                <input
                  value={assignUserKeyword}
                  onChange={(e) => {
                    setAssignUserKeyword(e.target.value);
                    if (!e.target.value.trim()) {
                      setAssignUserResults([]);
                    }
                    setSelectedAssignUser(null);
                    setAssignForm((prev) => ({ ...prev, user_id: '' }));
                  }}
                  placeholder="搜索用户邮箱 / 用户名"
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
                {assignUserLoading ? (
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">正在搜索用户...</div>
                ) : assignUserResults.length > 0 ? (
                  <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-[#151515]">
                    {assignUserResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => {
                          setSelectedAssignUser(user);
                          setAssignUserKeyword(user.email || user.username || String(user.id));
                          setAssignUserResults([]);
                          setAssignForm((prev) => ({ ...prev, user_id: String(user.id) }));
                        }}
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <span className="font-medium text-gray-900 dark:text-white">{user.email}</span>
                        <span className="text-gray-400">#{user.id}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {selectedAssignUser ? (
                <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">已选择：{selectedAssignUser.email}</p>
              ) : null}
            </div>

            <div>
              <FieldLabel>订阅分组</FieldLabel>
              <select
                value={assignForm.group_id}
                onChange={(e) => setAssignForm((prev) => ({ ...prev, group_id: e.target.value }))}
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              >
                <option value="">请选择分组</option>
                {groups
                  .filter((group) => group.subscription_type === 'subscription')
                  .map((group) => (
                    <option key={group.id} value={String(group.id)}>
                      {group.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>有效天数</FieldLabel>
                <input
                  type="number"
                  min="1"
                  value={assignForm.validity_days}
                  onChange={(e) => setAssignForm((prev) => ({ ...prev, validity_days: e.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
              </div>
              <div>
                <FieldLabel>备注</FieldLabel>
                <input
                  value={assignForm.notes}
                  onChange={(e) => setAssignForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="可选备注"
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 px-7 py-5 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setShowAssignModal(false)}
              className="rounded-2xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={assignSubmitting}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {assignSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {assignSubmitting ? '分配中' : '确认分配'}
            </button>
          </div>
        </form>
      </ModalShell>

      <ModalShell open={Boolean(extendTarget)} title="调整订阅时长" onClose={() => setExtendTarget(null)} maxWidth="max-w-xl">
        <form onSubmit={handleExtend}>
          <div className="space-y-6 px-7 py-6">
            <div className="text-sm text-gray-500 dark:text-gray-400">订阅用户：{extendTarget?.user?.email || `用户 #${extendTarget?.user_id}`}</div>
            <div>
              <FieldLabel>调整天数</FieldLabel>
              <input
                type="number"
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">支持负数，负数表示缩短有效期。</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 px-7 py-5 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setExtendTarget(null)}
              className="rounded-2xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={extendSubmitting}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {extendSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {extendSubmitting ? '提交中' : '确认调整'}
            </button>
          </div>
        </form>
      </ModalShell>

      <ModalShell open={Boolean(resetTarget)} title="重置订阅额度" onClose={() => setResetTarget(null)} maxWidth="max-w-xl">
        <form onSubmit={handleResetQuota}>
          <div className="space-y-5 px-7 py-6">
            <div className="text-sm text-gray-500 dark:text-gray-400">订阅用户：{resetTarget?.user?.email || `用户 #${resetTarget?.user_id}`}</div>
            <label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={resetForm.daily} onChange={(e) => setResetForm((prev) => ({ ...prev, daily: e.target.checked }))} />
              重置日额度
            </label>
            <label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={resetForm.weekly} onChange={(e) => setResetForm((prev) => ({ ...prev, weekly: e.target.checked }))} />
              重置周额度
            </label>
            <label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={resetForm.monthly} onChange={(e) => setResetForm((prev) => ({ ...prev, monthly: e.target.checked }))} />
              重置月额度
            </label>
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 px-7 py-5 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setResetTarget(null)}
              className="rounded-2xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={resetSubmitting}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {resetSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {resetSubmitting ? '重置中' : '确认重置'}
            </button>
          </div>
        </form>
      </ModalShell>

      <ModalShell open={Boolean(revokeTarget)} title="撤销订阅" onClose={() => setRevokeTarget(null)} maxWidth="max-w-lg">
        <div className="space-y-5 px-7 py-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            确认撤销订阅 <span className="font-medium text-gray-900 dark:text-white">#{revokeTarget?.id}</span> 吗？该操作会立即使订阅失效。
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 px-7 py-5 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setRevokeTarget(null)}
            className="rounded-2xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            取消
          </button>
          <button
            type="button"
            disabled={revokeSubmitting}
            onClick={() => void handleRevoke()}
            className="inline-flex items-center gap-2 rounded-2xl bg-red-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-60"
          >
            {revokeSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {revokeSubmitting ? '撤销中' : '确认撤销'}
          </button>
        </div>
      </ModalShell>
    </div>
  );
}
