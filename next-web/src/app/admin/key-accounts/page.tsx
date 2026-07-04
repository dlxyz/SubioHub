'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Eye, RefreshCw, Search, ShieldCheck, Star, Wallet, X } from 'lucide-react';
import {
  getAdminSettings,
  syncAdminKeyAccounts,
  getAdminUserUsageStats,
  listAdminUserApiKeys,
  listAdminUserBalanceHistory,
  listAdminUsers,
  updateAdminUser,
  type AdminKeyAccountSyncResult,
  type AdminUser,
  type AdminUserApiKey,
  type SystemSettings,
  type AdminUserBalanceHistoryResult,
  type AdminUserUsageStats,
} from '@/lib/admin-api';

const PAGE_SIZE = 12;

type ScopeFilter = 'key' | 'all';
type KeyAccountLevel = 'standard' | 'vip' | 'enterprise';
type InsightFilter = 'all' | 'candidate' | 'review';

type KeyAccountPolicySettings = Pick<
  SystemSettings,
  | 'key_account_vip_recharge_threshold'
  | 'key_account_enterprise_recharge_threshold'
  | 'key_account_vip_monthly_cost_threshold'
  | 'key_account_enterprise_monthly_cost_threshold'
  | 'key_account_vip_default_discount_rate'
  | 'key_account_enterprise_default_discount_rate'
  | 'key_account_vip_default_rebate_rate'
  | 'key_account_enterprise_default_rebate_rate'
  | 'key_account_auto_upgrade_enabled'
  | 'key_account_auto_downgrade_enabled'
>;

type EditFormState = {
  is_key_account: boolean;
  key_account_level: KeyAccountLevel;
  key_account_discount_rate: string;
  key_account_rebate_rate: string;
  key_account_manager_notes: string;
};

const EMPTY_EDIT_FORM: EditFormState = {
  is_key_account: true,
  key_account_level: 'standard',
  key_account_discount_rate: '1.00',
  key_account_rebate_rate: '0.00',
  key_account_manager_notes: '',
};

const DEFAULT_KEY_ACCOUNT_SETTINGS: KeyAccountPolicySettings = {
  key_account_vip_recharge_threshold: 5000,
  key_account_enterprise_recharge_threshold: 20000,
  key_account_vip_monthly_cost_threshold: 3000,
  key_account_enterprise_monthly_cost_threshold: 10000,
  key_account_vip_default_discount_rate: 0.95,
  key_account_enterprise_default_discount_rate: 0.9,
  key_account_vip_default_rebate_rate: 0.05,
  key_account_enterprise_default_rebate_rate: 0.08,
  key_account_auto_upgrade_enabled: false,
  key_account_auto_downgrade_enabled: false,
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatCurrency(value?: number | null) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatPercent(value?: number | null) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function levelLabel(level?: string) {
  switch (level) {
    case 'vip':
      return 'VIP';
    case 'enterprise':
      return '企业';
    default:
      return '标准';
  }
}

function buildKeyAccountSettings(settings?: SystemSettings | null): KeyAccountPolicySettings {
  return {
    key_account_vip_recharge_threshold:
      settings?.key_account_vip_recharge_threshold ?? DEFAULT_KEY_ACCOUNT_SETTINGS.key_account_vip_recharge_threshold,
    key_account_enterprise_recharge_threshold:
      settings?.key_account_enterprise_recharge_threshold ??
      DEFAULT_KEY_ACCOUNT_SETTINGS.key_account_enterprise_recharge_threshold,
    key_account_vip_monthly_cost_threshold:
      settings?.key_account_vip_monthly_cost_threshold ?? DEFAULT_KEY_ACCOUNT_SETTINGS.key_account_vip_monthly_cost_threshold,
    key_account_enterprise_monthly_cost_threshold:
      settings?.key_account_enterprise_monthly_cost_threshold ??
      DEFAULT_KEY_ACCOUNT_SETTINGS.key_account_enterprise_monthly_cost_threshold,
    key_account_vip_default_discount_rate:
      settings?.key_account_vip_default_discount_rate ?? DEFAULT_KEY_ACCOUNT_SETTINGS.key_account_vip_default_discount_rate,
    key_account_enterprise_default_discount_rate:
      settings?.key_account_enterprise_default_discount_rate ??
      DEFAULT_KEY_ACCOUNT_SETTINGS.key_account_enterprise_default_discount_rate,
    key_account_vip_default_rebate_rate:
      settings?.key_account_vip_default_rebate_rate ?? DEFAULT_KEY_ACCOUNT_SETTINGS.key_account_vip_default_rebate_rate,
    key_account_enterprise_default_rebate_rate:
      settings?.key_account_enterprise_default_rebate_rate ??
      DEFAULT_KEY_ACCOUNT_SETTINGS.key_account_enterprise_default_rebate_rate,
    key_account_auto_upgrade_enabled:
      settings?.key_account_auto_upgrade_enabled ?? DEFAULT_KEY_ACCOUNT_SETTINGS.key_account_auto_upgrade_enabled,
    key_account_auto_downgrade_enabled:
      settings?.key_account_auto_downgrade_enabled ?? DEFAULT_KEY_ACCOUNT_SETTINGS.key_account_auto_downgrade_enabled,
  };
}

function resolveRecommendedLevel(user: AdminUser, monthlyCost: number, settings: KeyAccountPolicySettings): KeyAccountLevel {
  const totalRecharged = Number(user.total_recharged || 0);
  const hitEnterprise =
    totalRecharged >= Number(settings.key_account_enterprise_recharge_threshold || 0) ||
    monthlyCost >= Number(settings.key_account_enterprise_monthly_cost_threshold || 0);
  if (hitEnterprise) {
    return 'enterprise';
  }
  const hitVIP =
    totalRecharged >= Number(settings.key_account_vip_recharge_threshold || 0) ||
    monthlyCost >= Number(settings.key_account_vip_monthly_cost_threshold || 0);
  if (hitVIP) {
    return 'vip';
  }
  return 'standard';
}

function getPolicyDefaults(level: KeyAccountLevel, settings: KeyAccountPolicySettings) {
  if (level === 'enterprise') {
    return {
      discountRate: Number(settings.key_account_enterprise_default_discount_rate || 0.9),
      rebateRate: Number(settings.key_account_enterprise_default_rebate_rate || 0.08),
    };
  }
  if (level === 'vip') {
    return {
      discountRate: Number(settings.key_account_vip_default_discount_rate || 0.95),
      rebateRate: Number(settings.key_account_vip_default_rebate_rate || 0.05),
    };
  }
  return {
    discountRate: 1,
    rebateRate: 0,
  };
}

function buildHitTags(user: AdminUser, monthlyCost: number, settings: KeyAccountPolicySettings) {
  const totalRecharged = Number(user.total_recharged || 0);
  const tags: string[] = [];

  if (totalRecharged >= Number(settings.key_account_enterprise_recharge_threshold || 0)) {
    tags.push('企业充值达标');
  } else if (totalRecharged >= Number(settings.key_account_vip_recharge_threshold || 0)) {
    tags.push('VIP充值达标');
  }

  if (monthlyCost >= Number(settings.key_account_enterprise_monthly_cost_threshold || 0)) {
    tags.push('企业月消达标');
  } else if (monthlyCost >= Number(settings.key_account_vip_monthly_cost_threshold || 0)) {
    tags.push('VIP月消达标');
  }

  return tags;
}

function ModalShell({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-[#111111]">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5 dark:border-gray-800">
          <h3 className="text-2xl font-semibold tracking-[-0.03em] text-gray-900 dark:text-white">{title}</h3>
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
  return <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">{children}</label>;
}

export default function AdminKeyAccountsPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [keyAccountSettings, setKeyAccountSettings] = useState<KeyAccountPolicySettings>(DEFAULT_KEY_ACCOUNT_SETTINGS);
  const [usageByUser, setUsageByUser] = useState<Record<number, AdminUserUsageStats>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('key');
  const [insightFilter, setInsightFilter] = useState<InsightFilter>('all');
  const [level, setLevel] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stats, setStats] = useState({
    keyTotal: 0,
    vipTotal: 0,
    enterpriseTotal: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
  });
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(EMPTY_EDIT_FORM);
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailUsage, setDetailUsage] = useState<AdminUserUsageStats | null>(null);
  const [detailApiKeys, setDetailApiKeys] = useState<AdminUserApiKey[]>([]);
  const [detailBalanceHistory, setDetailBalanceHistory] = useState<AdminUserBalanceHistoryResult | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<AdminKeyAccountSyncResult | null>(null);

  const buildFilters = useCallback(
    (keyword = search, nextScope = scope, nextLevel = level, page = 1) => ({
      page,
      page_size: PAGE_SIZE,
      search: keyword || undefined,
      key_account_level: nextLevel || undefined,
      is_key_account: nextScope === 'key' ? true : undefined,
    }),
    [level, scope, search]
  );

  const loadUsers = useCallback(
    async (page = 1, keyword = search, nextScope = scope, nextLevel = level) => {
      setLoading(true);
      setError('');
      try {
        const [result, keyStats, vipStats, enterpriseStats, settingsResult] = await Promise.all([
          listAdminUsers(buildFilters(keyword, nextScope, nextLevel, page)),
          listAdminUsers({ page: 1, page_size: 1, is_key_account: true }),
          listAdminUsers({ page: 1, page_size: 1, is_key_account: true, key_account_level: 'vip' }),
          listAdminUsers({ page: 1, page_size: 1, is_key_account: true, key_account_level: 'enterprise' }),
          getAdminSettings(),
        ]);
        const usageEntries = await Promise.all(
          result.items.map(async (user) => {
            try {
              const usage = await getAdminUserUsageStats(user.id, { period: 'month' });
              return [user.id, usage] as const;
            } catch {
              return [user.id, {}] as const;
            }
          })
        );

        setUsers(result.items);
        setKeyAccountSettings(buildKeyAccountSettings(settingsResult));
        setUsageByUser(Object.fromEntries(usageEntries));
        setPagination({
          page: result.page || page,
          pageSize: result.pageSize || PAGE_SIZE,
          total: result.total,
        });
        setStats({
          keyTotal: keyStats.total,
          vipTotal: vipStats.total,
          enterpriseTotal: enterpriseStats.total,
        });
      } catch (loadError) {
        setError(getErrorMessage(loadError, '加载大客户数据失败'));
      } finally {
        setLoading(false);
      }
    },
    [buildFilters, level, scope, search]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers]);

  const openEditModal = (user: AdminUser) => {
    const monthlyCost = Number(usageByUser[user.id]?.total_cost || 0);
    const recommendedLevel = resolveRecommendedLevel(user, monthlyCost, keyAccountSettings);
    const preferredLevel = user.is_key_account
      ? ((user.key_account_level as KeyAccountLevel) || 'standard')
      : recommendedLevel;
    const defaults = getPolicyDefaults(preferredLevel, keyAccountSettings);
    setEditingUser(user);
    setEditForm({
      is_key_account: Boolean(user.is_key_account),
      key_account_level: preferredLevel,
      key_account_discount_rate: Number(user.key_account_discount_rate ?? defaults.discountRate).toFixed(2),
      key_account_rebate_rate: Number(user.key_account_rebate_rate ?? defaults.rebateRate).toFixed(2),
      key_account_manager_notes: user.key_account_manager_notes || '',
    });
  };

  const openDetailModal = async (user: AdminUser) => {
    setDetailUser(user);
    setDetailLoading(true);
    setDetailUsage(null);
    setDetailApiKeys([]);
    setDetailBalanceHistory(null);
    try {
      const [usage, apiKeys, balanceHistory] = await Promise.all([
        getAdminUserUsageStats(user.id, { period: 'month' }),
        listAdminUserApiKeys(user.id, { page: 1, page_size: 100 }),
        listAdminUserBalanceHistory(user.id, { page: 1, page_size: 20 }),
      ]);
      setDetailUsage(usage);
      setDetailApiKeys(apiKeys.items);
      setDetailBalanceHistory(balanceHistory);
    } catch (loadError) {
      setError(getErrorMessage(loadError, '加载大客户详情失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadUsers(1, search, scope, level);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingUser) return;

    const discount = Number(editForm.key_account_discount_rate);
    const rebate = Number(editForm.key_account_rebate_rate);
    if (Number.isNaN(discount) || discount < 0 || discount > 1) {
      setError('折扣系数必须在 0 到 1 之间');
      return;
    }
    if (Number.isNaN(rebate) || rebate < 0 || rebate > 1) {
      setError('返点比例必须在 0 到 1 之间');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updated = await updateAdminUser(editingUser.id, {
        is_key_account: editForm.is_key_account,
        key_account_level: editForm.key_account_level,
        key_account_discount_rate: discount,
        key_account_rebate_rate: rebate,
        key_account_manager_notes: editForm.key_account_manager_notes,
      });
      setUsers((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setSuccess(`${updated.email} 的大客户信息已更新`);
      setEditingUser(null);
      await loadUsers(pagination.page, search, scope, level);
    } catch (saveError) {
      setError(getErrorMessage(saveError, '保存大客户信息失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (user: AdminUser) => {
    const nextStatus = user.status === 'disabled' ? 'active' : 'disabled';
    setStatusSavingId(user.id);
    setError('');
    setSuccess('');
    try {
      const updated = await updateAdminUser(user.id, { status: nextStatus });
      setUsers((prev) => prev.map((item) => (item.id === user.id ? { ...item, ...updated } : item)));
      setSuccess(`${user.email} 已${nextStatus === 'active' ? '启用' : '禁用'}`);
      if (detailUser?.id === user.id) {
        setDetailUser((prev) => (prev ? { ...prev, ...updated } : prev));
      }
    } catch (toggleError) {
      setError(getErrorMessage(toggleError, '更新客户状态失败'));
    } finally {
      setStatusSavingId(null);
    }
  };

  const handleSyncKeyAccounts = async () => {
    setSyncing(true);
    setError('');
    setSuccess('');
    try {
      const result = await syncAdminKeyAccounts({ dry_run: false });
      setLastSyncResult(result);
      setSuccess(
        `同步完成：扫描 ${Number(result.scanned || 0)} 人，变更 ${Number(result.changed || 0)} 人，升级 ${Number(
          result.upgraded || 0
        )} 人，降级 ${Number(result.downgraded || 0)} 人`
      );
      await loadUsers(pagination.page, search, scope, level);
    } catch (syncError) {
      setError(getErrorMessage(syncError, '同步大客户等级失败'));
    } finally {
      setSyncing(false);
    }
  };

  const keyBalanceTotal = useMemo(
    () => users.filter((item) => item.is_key_account).reduce((sum, item) => sum + Number(item.balance || 0), 0),
    [users]
  );
  const latestRechargeRecord = useMemo(
    () =>
      detailBalanceHistory?.items?.find((item) => {
        const value = Number(item.value || 0);
        return value > 0;
      }) || null,
    [detailBalanceHistory]
  );
  const currentPageCandidates = useMemo(
    () =>
      users.filter((user) => {
        if (user.is_key_account) return false;
        const monthlyCost = Number(usageByUser[user.id]?.total_cost || 0);
        return resolveRecommendedLevel(user, monthlyCost, keyAccountSettings) !== 'standard';
      }),
    [keyAccountSettings, usageByUser, users]
  );
  const currentPageNeedReview = useMemo(
    () =>
      users.filter((user) => {
        if (!user.is_key_account) return false;
        const monthlyCost = Number(usageByUser[user.id]?.total_cost || 0);
        const recommendedLevel = resolveRecommendedLevel(user, monthlyCost, keyAccountSettings);
        return recommendedLevel !== 'standard' && recommendedLevel !== ((user.key_account_level as KeyAccountLevel) || 'standard');
      }),
    [keyAccountSettings, usageByUser, users]
  );
  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        if (insightFilter === 'candidate') {
          if (user.is_key_account) return false;
          const monthlyCost = Number(usageByUser[user.id]?.total_cost || 0);
          return resolveRecommendedLevel(user, monthlyCost, keyAccountSettings) !== 'standard';
        }
        if (insightFilter === 'review') {
          if (!user.is_key_account) return false;
          const monthlyCost = Number(usageByUser[user.id]?.total_cost || 0);
          const recommendedLevel = resolveRecommendedLevel(user, monthlyCost, keyAccountSettings);
          return recommendedLevel !== 'standard' && recommendedLevel !== ((user.key_account_level as KeyAccountLevel) || 'standard');
        }
        return true;
      }),
    [insightFilter, keyAccountSettings, usageByUser, users]
  );

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.pageSize || PAGE_SIZE)));

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          大客户管理
        </div>
        <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">高价值客户运营中心</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">
          统一管理大客户标记、等级、专属折扣、返点比例和运营备注。第一版先基于用户体系快速落地，便于后续再扩成更完整的大客户运营模块。
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <Building2 className="h-4 w-4 text-violet-500" />
              大客户总数
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{stats.keyTotal}</div>
          </div>
          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <Star className="h-4 w-4 text-amber-500" />
              VIP 客户
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{stats.vipTotal}</div>
          </div>
          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <ShieldCheck className="h-4 w-4 text-blue-500" />
              企业客户
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{stats.enterpriseTotal}</div>
          </div>
          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <Wallet className="h-4 w-4 text-emerald-500" />
              当前页总余额
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{formatCurrency(keyBalanceTotal)}</div>
          </div>
          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#202020]">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <Star className="h-4 w-4 text-violet-500" />
              当前页候选客户
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{currentPageCandidates.length}</div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <form className="flex w-full flex-col gap-3 md:flex-row" onSubmit={handleSearch}>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索邮箱 / 用户名 / 备注"
                className="w-full rounded-2xl border border-gray-200 py-3 pl-9 pr-4 text-sm text-gray-900 outline-none transition focus:border-amber-500 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
              />
            </div>
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as ScopeFilter)}
              className="rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-amber-500 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
            >
              <option value="key">仅看大客户</option>
              <option value="all">全部用户</option>
            </select>
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              className="rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-amber-500 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
            >
              <option value="">全部等级</option>
              <option value="standard">标准</option>
              <option value="vip">VIP</option>
              <option value="enterprise">企业</option>
            </select>
            <select
              value={insightFilter}
              onChange={(event) => setInsightFilter(event.target.value as InsightFilter)}
              className="rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-amber-500 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
            >
              <option value="all">全部视图</option>
              <option value="candidate">候选客户</option>
              <option value="review">待复核</option>
            </select>
            <button
              type="submit"
              className="rounded-2xl bg-gray-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-black dark:bg-white dark:text-gray-900"
            >
              搜索
            </button>
          </form>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleSyncKeyAccounts()}
              disabled={syncing}
              className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? '同步中...' : '立即同步大客户等级'}
            </button>
            <button
              type="button"
              onClick={() => void loadUsers(pagination.page, search, scope, level)}
              className="inline-flex items-center justify-center rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-900/40 dark:bg-violet-900/20">
            <div className="text-sm font-semibold text-violet-900 dark:text-violet-200">当前大客户定义标准</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-violet-900 dark:bg-[#1A1A1A]/70 dark:text-violet-100">
                VIP：累计充值 {formatCurrency(keyAccountSettings.key_account_vip_recharge_threshold)} / 月消费{' '}
                {formatCurrency(keyAccountSettings.key_account_vip_monthly_cost_threshold)}
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-violet-900 dark:bg-[#1A1A1A]/70 dark:text-violet-100">
                企业：累计充值 {formatCurrency(keyAccountSettings.key_account_enterprise_recharge_threshold)} / 月消费{' '}
                {formatCurrency(keyAccountSettings.key_account_enterprise_monthly_cost_threshold)}
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-violet-900 dark:bg-[#1A1A1A]/70 dark:text-violet-100">
                默认策略：VIP 折扣 {Number(keyAccountSettings.key_account_vip_default_discount_rate || 0).toFixed(2)} / 返点{' '}
                {formatPercent(keyAccountSettings.key_account_vip_default_rebate_rate)}
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-violet-900 dark:bg-[#1A1A1A]/70 dark:text-violet-100">
                自动规则：升级 {keyAccountSettings.key_account_auto_upgrade_enabled ? '开启' : '关闭'} / 降级{' '}
                {keyAccountSettings.key_account_auto_downgrade_enabled ? '开启' : '关闭'}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/40 dark:bg-amber-900/20">
            <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">当前页候选与复核</div>
            <div className="mt-2 text-xs text-amber-800 dark:text-amber-300">
              依据累计充值和当月用量成本做运营提示，不直接自动改客户等级。
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setInsightFilter('all')}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    insightFilter === 'all'
                      ? 'bg-amber-600 text-white'
                      : 'bg-white/80 text-amber-800 hover:bg-white dark:bg-[#1A1A1A]/70 dark:text-amber-200'
                  }`}
                >
                  全部
                </button>
                <button
                  type="button"
                  onClick={() => setInsightFilter('candidate')}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    insightFilter === 'candidate'
                      ? 'bg-amber-600 text-white'
                      : 'bg-white/80 text-amber-800 hover:bg-white dark:bg-[#1A1A1A]/70 dark:text-amber-200'
                  }`}
                >
                  候选客户
                </button>
                <button
                  type="button"
                  onClick={() => setInsightFilter('review')}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    insightFilter === 'review'
                      ? 'bg-amber-600 text-white'
                      : 'bg-white/80 text-amber-800 hover:bg-white dark:bg-[#1A1A1A]/70 dark:text-amber-200'
                  }`}
                >
                  待复核
                </button>
              </div>
              {currentPageCandidates.slice(0, 4).map((user) => {
                const monthlyCost = Number(usageByUser[user.id]?.total_cost || 0);
                const recommendedLevel = resolveRecommendedLevel(user, monthlyCost, keyAccountSettings);
                return (
                  <div key={user.id} className="rounded-2xl bg-white/80 px-4 py-3 text-sm dark:bg-[#1A1A1A]/70">
                    <div className="font-medium text-gray-900 dark:text-white">{user.email}</div>
                    <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                      推荐 {levelLabel(recommendedLevel)} · 累计充值 {formatCurrency(user.total_recharged)} · 月消费 {formatCurrency(monthlyCost)}
                    </div>
                  </div>
                );
              })}
              {currentPageCandidates.length === 0 ? (
                <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-gray-600 dark:bg-[#1A1A1A]/70 dark:text-gray-300">
                  当前页暂无新的候选客户
                </div>
              ) : null}
              <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-gray-700 dark:bg-[#1A1A1A]/70 dark:text-gray-300">
                待复核等级：{currentPageNeedReview.length} 人
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
            {success}
          </div>
        ) : null}
        {lastSyncResult ? (
          <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4 text-sm text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200">
            本次同步：候选 {Number(lastSyncResult.eligible || 0)} 人，设为大客户 {Number(lastSyncResult.promoted_to_key_account || 0)} 人，
            移出大客户 {Number(lastSyncResult.removed_from_key_account || 0)} 人，套用默认策略 {Number(lastSyncResult.applied_default_strategy || 0)} 人，
            失败 {Number(lastSyncResult.failed || 0)} 人
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">正在加载大客户数据...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">当前条件下暂无客户</div>
        ) : (
          <>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <th className="px-3 py-3">用户</th>
                    <th className="px-3 py-3">客户级别</th>
                    <th className="px-3 py-3">余额</th>
                    <th className="px-3 py-3">累计充值</th>
                    <th className="px-3 py-3">月消费</th>
                    <th className="px-3 py-3">标准命中</th>
                    <th className="px-3 py-3">返点</th>
                    <th className="px-3 py-3">折扣</th>
                    <th className="px-3 py-3">佣金</th>
                    <th className="px-3 py-3">注册时间</th>
                    <th className="px-3 py-3">状态</th>
                    <th className="px-3 py-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    (() => {
                      const monthlyCost = Number(usageByUser[user.id]?.total_cost || 0);
                      const recommendedLevel = resolveRecommendedLevel(user, monthlyCost, keyAccountSettings);
                      const hitTags = buildHitTags(user, monthlyCost, keyAccountSettings);
                      return (
                        <tr key={user.id} className="border-b border-gray-100 align-top dark:border-gray-800/70">
                          <td className="px-3 py-4">
                            <div className="font-medium text-gray-900 dark:text-white">{user.email}</div>
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{user.username || '未设置用户名'}</div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                              {user.is_key_account ? levelLabel(user.key_account_level) : '普通用户'}
                            </div>
                          </td>
                          <td className="px-3 py-4 text-gray-900 dark:text-white">{formatCurrency(user.balance)}</td>
                          <td className="px-3 py-4 text-gray-900 dark:text-white">{formatCurrency(user.total_recharged)}</td>
                          <td className="px-3 py-4 text-gray-900 dark:text-white">{formatCurrency(monthlyCost)}</td>
                          <td className="px-3 py-4">
                            <div className="flex flex-wrap gap-2">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                  recommendedLevel === 'enterprise'
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                    : recommendedLevel === 'vip'
                                      ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                                }`}
                              >
                                {recommendedLevel === 'standard' ? '暂未命中' : `推荐${levelLabel(recommendedLevel)}`}
                              </span>
                              {hitTags.map((tag) => (
                                <span
                                  key={`${user.id}-${tag}`}
                                  className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-4 text-gray-900 dark:text-white">{formatPercent(user.key_account_rebate_rate)}</td>
                          <td className="px-3 py-4 text-gray-900 dark:text-white">{formatPercent(1 - Number(user.key_account_discount_rate ?? 1))}</td>
                          <td className="px-3 py-4 text-gray-900 dark:text-white">{formatCurrency(user.total_commission_earned)}</td>
                          <td className="px-3 py-4 text-gray-900 dark:text-white">{formatDate(user.created_at)}</td>
                          <td className="px-3 py-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                user.status === 'disabled'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              }`}
                            >
                              {user.status === 'disabled' ? '已禁用' : '启用中'}
                            </span>
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void openDetailModal(user)}
                                className="inline-flex items-center rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                              >
                                <Eye className="mr-1.5 h-3.5 w-3.5" />
                                详情
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditModal(user)}
                                className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-violet-700"
                              >
                                编辑策略
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleToggleStatus(user)}
                                disabled={statusSavingId === user.id}
                                className={`rounded-xl px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                  user.status === 'disabled'
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300'
                                    : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300'
                                }`}
                              >
                                {user.status === 'disabled' ? '启用' : '禁用'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })()
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
              <div>
                第 {pagination.page} / {totalPages} 页，共 {pagination.total} 个客户，当前视图显示 {filteredUsers.length} 个
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => void loadUsers(pagination.page - 1, search, scope, level)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  上一页
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= totalPages}
                  onClick={() => void loadUsers(pagination.page + 1, search, scope, level)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <ModalShell open={Boolean(editingUser)} title="编辑大客户策略" onClose={() => setEditingUser(null)}>
        <form className="grid gap-5 px-6 py-6" onSubmit={handleSave}>
          <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-[#1A1A1A] dark:text-gray-300">
            当前用户：<span className="font-medium text-gray-900 dark:text-white">{editingUser?.email}</span>
          </div>

          <div className="rounded-3xl border border-gray-200 p-5 dark:border-gray-800">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">客户身份</div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">控制是否纳入大客户运营，以及当前客户归属等级。</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={editForm.is_key_account}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, is_key_account: event.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                />
                设为大客户
              </label>
              <div>
                <FieldLabel>客户等级</FieldLabel>
                <select
                  value={editForm.key_account_level}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      key_account_level: event.target.value as EditFormState['key_account_level'],
                    }))
                  }
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-violet-500 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                >
                  <option value="standard">标准</option>
                  <option value="vip">VIP</option>
                  <option value="enterprise">企业</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 p-5 dark:border-gray-800">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">专属优惠策略</div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">单独维护大客户的返点比例和折扣系数，便于做差异化报价。</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>返点比例</FieldLabel>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={editForm.key_account_rebate_rate}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, key_account_rebate_rate: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-violet-500 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                />
              </div>
              <div>
                <FieldLabel>折扣系数</FieldLabel>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={editForm.key_account_discount_rate}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, key_account_discount_rate: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-violet-500 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                />
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  当前相当于优惠 {formatPercent(1 - Number(editForm.key_account_discount_rate || 1))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 p-5 dark:border-gray-800">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">运营跟进</div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">记录客户经理、跟进状态、合作说明和特殊报价备注。</p>
            <div className="mt-4">
              <FieldLabel>运营备注</FieldLabel>
              <textarea
                value={editForm.key_account_manager_notes}
                onChange={(event) => setEditForm((prev) => ({ ...prev, key_account_manager_notes: event.target.value }))}
                className="min-h-28 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-violet-500 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                placeholder="客户经理、跟进状态、定价说明"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 dark:border-gray-800 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setEditingUser(null)}
              className="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? '保存中...' : '保存大客户策略'}
            </button>
          </div>
        </form>
      </ModalShell>

      <ModalShell open={Boolean(detailUser)} title="大客户详情" onClose={() => setDetailUser(null)}>
        <div className="grid gap-5 px-6 py-6">
          <div className="rounded-3xl border border-gray-200 p-5 dark:border-gray-800">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">{detailUser?.email}</div>
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detailUser?.username || '未设置用户名'}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-[#1A1A1A]">
                <div className="text-xs text-gray-500 dark:text-gray-400">客户状态</div>
                <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {detailUser?.status === 'disabled' ? '已禁用' : '启用中'}
                </div>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-[#1A1A1A]">
                <div className="text-xs text-gray-500 dark:text-gray-400">客户等级</div>
                <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{levelLabel(detailUser?.key_account_level)}</div>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-[#1A1A1A]">
                <div className="text-xs text-gray-500 dark:text-gray-400">账户余额</div>
                <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{formatCurrency(detailUser?.balance)}</div>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-[#1A1A1A]">
                <div className="text-xs text-gray-500 dark:text-gray-400">历史佣金</div>
                <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {formatCurrency(detailUser?.total_commission_earned)}
                </div>
              </div>
            </div>
          </div>

          {detailLoading ? (
            <div className="rounded-2xl border border-gray-200 px-4 py-6 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
              正在加载客户详情...
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-gray-50 px-4 py-4 dark:bg-[#1A1A1A]">
                  <div className="text-xs text-gray-500 dark:text-gray-400">月度请求数</div>
                  <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                    {Number(detailUsage?.total_requests || 0).toLocaleString()}
                  </div>
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-4 dark:bg-[#1A1A1A]">
                  <div className="text-xs text-gray-500 dark:text-gray-400">月度用量成本</div>
                  <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(detailUsage?.total_cost)}
                  </div>
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-4 dark:bg-[#1A1A1A]">
                  <div className="text-xs text-gray-500 dark:text-gray-400">累计充值</div>
                  <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(detailBalanceHistory?.total_recharged)}
                  </div>
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-4 dark:bg-[#1A1A1A]">
                  <div className="text-xs text-gray-500 dark:text-gray-400">API Keys</div>
                  <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{detailApiKeys.length}</div>
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-3xl border border-gray-200 p-5 dark:border-gray-800">
                  <div className="rounded-2xl bg-violet-50 px-4 py-4 dark:bg-violet-900/20">
                    <div className="text-xs text-violet-700 dark:text-violet-300">标准判定</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {detailUser
                        ? buildHitTags(detailUser, Number(detailUsage?.total_cost || 0), keyAccountSettings).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-medium text-violet-700 dark:bg-[#1A1A1A] dark:text-violet-200"
                            >
                              {tag}
                            </span>
                          ))
                        : null}
                      {detailUser &&
                      resolveRecommendedLevel(detailUser, Number(detailUsage?.total_cost || 0), keyAccountSettings) === 'standard' ? (
                        <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-[#1A1A1A] dark:text-gray-300">
                          暂未达到 VIP / 企业门槛
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-xs text-violet-700 dark:text-violet-300">
                      推荐等级：
                      {detailUser
                        ? levelLabel(resolveRecommendedLevel(detailUser, Number(detailUsage?.total_cost || 0), keyAccountSettings))
                        : '-'}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">专属策略</div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-[#1A1A1A]">
                      <div className="text-xs text-gray-500 dark:text-gray-400">返点比例</div>
                      <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                        {formatPercent(detailUser?.key_account_rebate_rate)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-[#1A1A1A]">
                      <div className="text-xs text-gray-500 dark:text-gray-400">折扣系数</div>
                      <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                        {Number(detailUser?.key_account_discount_rate ?? 1).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl bg-gray-50 px-4 py-4 dark:bg-[#1A1A1A]">
                    <div className="text-xs text-gray-500 dark:text-gray-400">运营备注</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-gray-900 dark:text-white">
                      {detailUser?.key_account_manager_notes || '暂无备注'}
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-gray-200 p-5 dark:border-gray-800">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">最近充值与余额记录</div>
                  <div className="mt-4 rounded-2xl bg-gray-50 px-4 py-4 dark:bg-[#1A1A1A]">
                    <div className="text-xs text-gray-500 dark:text-gray-400">最近一次正向充值</div>
                    <div className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                      {latestRechargeRecord ? `${formatCurrency(latestRechargeRecord.value)} · ${formatDate(latestRechargeRecord.created_at)}` : '暂无充值记录'}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{latestRechargeRecord?.notes || '无备注'}</div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {detailBalanceHistory?.items?.length ? (
                      detailBalanceHistory.items.slice(0, 5).map((item) => (
                        <div key={item.id} className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-[#1A1A1A]">
                          <div className="flex items-center justify-between gap-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{item.type || '余额记录'}</div>
                            <div className="text-sm text-gray-700 dark:text-gray-300">{formatCurrency(item.value)}</div>
                          </div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.notes || '无备注'}</div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl bg-gray-50 px-4 py-4 text-sm text-gray-500 dark:bg-[#1A1A1A] dark:text-gray-400">
                        暂无余额记录
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 p-5 dark:border-gray-800">
                <div className="text-sm font-semibold text-gray-900 dark:text-white">API Key 明细</div>
                <div className="mt-4 space-y-3">
                  {detailApiKeys.length ? (
                    detailApiKeys.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-2xl bg-gray-50 px-4 py-4 dark:bg-[#1A1A1A]">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{item.name || item.key}</div>
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              配额 {formatCurrency(item.quota)} / 已用 {formatCurrency(item.quota_used)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                item.status === 'disabled'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              }`}
                            >
                              {item.status === 'disabled' ? '已禁用' : '启用中'}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              最近使用 {formatDate(item.last_used_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl bg-gray-50 px-4 py-4 text-sm text-gray-500 dark:bg-[#1A1A1A] dark:text-gray-400">
                      暂无 API Key
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </ModalShell>
    </div>
  );
}
