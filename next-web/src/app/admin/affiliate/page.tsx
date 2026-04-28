'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Coins,
  RefreshCcw,
  Search,
  Shield,
  Wallet,
} from 'lucide-react';
import {
  getAdminSettings,
  listAdminAffiliateCommissions,
  listAdminUsers,
  settleAdminAffiliateCommission,
  updateAdminAffiliateUserRate,
  type AdminCommissionLog,
  type SystemSettings,
  type AdminUser,
} from '@/lib/admin-api';

function formatCurrency(value?: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'settled':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'pending':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    case 'transferred':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'cancelled':
    case 'reversed':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

const PAGE_SIZE = 20;

export default function AdminAffiliatePage() {
  const [commissions, setCommissions] = useState<AdminCommissionLog[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [userLoading, setUserLoading] = useState(true);
  const [settlingId, setSettlingId] = useState<number | null>(null);
  const [savingRateId, setSavingRateId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    userId: '',
  });
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
  });
  const [userSearch, setUserSearch] = useState('');
  const [rateDrafts, setRateDrafts] = useState<Record<number, string>>({});

  const loadCommissions = useCallback(async (nextPage = 1, nextFilters = filters) => {
    setLoading(true);
    setError('');
    try {
      const result = await listAdminAffiliateCommissions({
        page: nextPage,
        page_size: PAGE_SIZE,
        status: nextFilters.status || undefined,
        user_id: nextFilters.userId || undefined,
      });
      setCommissions(result.items);
      setPagination({
        total: result.total,
        page: result.page || nextPage,
        pageSize: result.pageSize || PAGE_SIZE,
      });
    } catch (error: unknown) {
      setError(getErrorMessage(error, '加载佣金流水失败'));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadUsers = useCallback(async (keyword = '') => {
    setUserLoading(true);
    setError('');
    try {
      const result = await listAdminUsers({
        page: 1,
        page_size: 12,
        search: keyword || undefined,
      });
      setUsers(result.items);
      setRateDrafts((prev) => {
        const next = { ...prev };
        result.items.forEach((user) => {
          next[user.id] = ((user.commission_rate || 0) * 100).toFixed(2);
        });
        return next;
      });
    } catch (error: unknown) {
      setError(getErrorMessage(error, '加载返佣用户列表失败'));
    } finally {
      setUserLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const result = await getAdminSettings();
      setSettings(result);
    } catch (error: unknown) {
      setError(getErrorMessage(error, '加载分销结算设置失败'));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCommissions();
      void loadUsers();
      void loadSettings();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadCommissions, loadUsers, loadSettings]);

  const summary = useMemo(() => {
    const pendingCount = commissions.filter((item) => item.status === 'pending').length;
    const settledAmount = commissions
      .filter((item) => item.status === 'settled')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const pendingAmount = commissions
      .filter((item) => item.status === 'pending')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return {
      pendingCount,
      settledAmount,
      pendingAmount,
    };
  }, [commissions]);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.pageSize || PAGE_SIZE)));

  const handleFilterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSuccess('');
    await loadCommissions(1, filters);
  };

  const handleResetFilters = async () => {
    const nextFilters = { status: '', userId: '' };
    setFilters(nextFilters);
    setSuccess('');
    await loadCommissions(1, nextFilters);
  };

  const handleSettle = async (commission: AdminCommissionLog) => {
    if (settings?.affiliate_manual_payout_settlement_enabled === false) {
      setError('系统已关闭“手动打款后结算”，请先前往系统设置开启后再操作');
      return;
    }
    setSettlingId(commission.id);
    setError('');
    setSuccess('');
    try {
      await settleAdminAffiliateCommission(commission.id);
      setSuccess(`佣金流水 #${commission.id} 已手动结算`);
      await loadCommissions(pagination.page, filters);
      await loadUsers(userSearch);
    } catch (error: unknown) {
      setError(getErrorMessage(error, '结算佣金失败'));
    } finally {
      setSettlingId(null);
    }
  };

  const handleUserSearch = async (e: FormEvent) => {
    e.preventDefault();
    setSuccess('');
    await loadUsers(userSearch);
  };

  const handleSaveRate = async (user: AdminUser) => {
    const draft = Number(rateDrafts[user.id]);
    if (Number.isNaN(draft) || draft < 0 || draft > 100) {
      setError('返佣比例必须在 0 到 100 之间');
      return;
    }

    setSavingRateId(user.id);
    setError('');
    setSuccess('');
    try {
      await updateAdminAffiliateUserRate(user.id, draft / 100);
      setSuccess(`用户 ${user.email} 的返佣比例已更新为 ${draft.toFixed(2)}%`);
      await loadUsers(userSearch);
    } catch (error: unknown) {
      setError(getErrorMessage(error, '更新返佣比例失败'));
    } finally {
      setSavingRateId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">分销管理</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            管理全站佣金流水、手动结算冻结佣金，并为指定用户配置专属返佣比例。
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

      {settings?.affiliate_manual_payout_settlement_enabled === false ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
          当前已关闭“手动打款后结算”，分销流水页仅可查看，不能执行手动结算。请前往系统设置中的“分销结算”开启该功能。
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">当前筛选总数</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
                {loading ? '...' : pagination.total}
              </p>
            </div>
            <Coins className="h-6 w-6 text-blue-500" />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">待结算笔数</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
                {loading ? '...' : summary.pendingCount}
              </p>
            </div>
            <Wallet className="h-6 w-6 text-amber-500" />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">当前页待结算金额</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
                {loading ? '...' : formatCurrency(summary.pendingAmount)}
              </p>
            </div>
            <RefreshCcw className="h-6 w-6 text-orange-500" />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">当前页已结算金额</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
                {loading ? '...' : formatCurrency(summary.settledAmount)}
              </p>
            </div>
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">佣金流水</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              支持按受益人 ID 和状态筛选，并对 `pending` 状态流水执行人工结算。
            </p>
          </div>

          <form onSubmit={handleFilterSubmit} className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap">
            <input
              value={filters.userId}
              onChange={(e) => setFilters((prev) => ({ ...prev, userId: e.target.value }))}
              placeholder="按受益人 ID 筛选"
              className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
            >
              <option value="">全部状态</option>
              <option value="pending">pending</option>
              <option value="settled">settled</option>
              <option value="transferred">transferred</option>
              <option value="cancelled">cancelled</option>
              <option value="reversed">reversed</option>
            </select>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Search className="mr-2 h-4 w-4" />
              筛选
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              重置
            </button>
          </form>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40">
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3 font-medium">流水 ID</th>
                  <th className="px-4 py-3 font-medium">受益人</th>
                  <th className="px-4 py-3 font-medium">下级用户</th>
                  <th className="px-4 py-3 font-medium">订单</th>
                  <th className="px-4 py-3 font-medium">金额</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">来源</th>
                  <th className="px-4 py-3 font-medium">创建时间</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                      正在加载佣金流水...
                    </td>
                  </tr>
                ) : commissions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                      当前筛选条件下暂无佣金流水
                    </td>
                  </tr>
                ) : (
                  commissions.map((item) => (
                    <tr key={item.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">#{item.id}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{item.user_id}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{item.invitee_id ?? '-'}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{item.order_id ?? '-'}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{formatCurrency(item.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="max-w-xs px-4 py-3 text-gray-500 dark:text-gray-400">{item.reason || '-'}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(item.created_at)}</td>
                      <td className="px-4 py-3">
                        {item.status === 'pending' ? (
                          <button
                            onClick={() => handleSettle(item)}
                            disabled={settlingId === item.id || settings?.affiliate_manual_payout_settlement_enabled === false}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {settlingId === item.id ? '结算中' : '手动结算'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500">无需操作</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <div>
            第 {pagination.page} / {totalPages} 页，共 {pagination.total} 条
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1 || loading}
              onClick={() => loadCommissions(pagination.page - 1, filters)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={pagination.page >= totalPages || loading}
              onClick={() => loadCommissions(pagination.page + 1, filters)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">专属返佣比例</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              搜索指定用户后直接调整 `commission_rate`，用于大客户或核心代理差异化配置。
            </p>
          </div>

          <form onSubmit={handleUserSearch} className="flex flex-col gap-3 sm:flex-row">
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="搜索邮箱或用户关键字"
              className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-gray-900"
            >
              <Search className="mr-2 h-4 w-4" />
              查询用户
            </button>
          </form>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40">
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3 font-medium">用户</th>
                  <th className="px-4 py-3 font-medium">角色</th>
                  <th className="px-4 py-3 font-medium">账户余额</th>
                  <th className="px-4 py-3 font-medium">佣金余额</th>
                  <th className="px-4 py-3 font-medium">返佣比例</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {userLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                      正在加载用户返佣信息...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                      没有匹配到用户
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{user.email}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">用户 ID: {user.id}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{user.role || 'user'}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{formatCurrency(user.balance)}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">
                        {formatCurrency(user.commission_balance)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex w-40 items-center rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
                          <Shield className="mr-2 h-4 w-4 text-purple-500" />
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={rateDrafts[user.id] ?? '0.00'}
                            onChange={(e) =>
                              setRateDrafts((prev) => ({
                                ...prev,
                                [user.id]: e.target.value,
                              }))
                            }
                            className="w-full bg-transparent text-sm text-gray-900 outline-none dark:text-white"
                          />
                          <span className="ml-2 text-gray-500 dark:text-gray-400">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleSaveRate(user)}
                          disabled={savingRateId === user.id}
                          className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-60"
                        >
                          {savingRateId === user.id ? '保存中' : '保存比例'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
