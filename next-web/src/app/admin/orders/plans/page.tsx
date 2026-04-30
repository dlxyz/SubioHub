'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  createAdminPaymentPlan,
  deleteAdminPaymentPlan,
  listAdminGroups,
  listAdminPaymentPlans,
  updateAdminPaymentPlan,
  type AdminGroup,
  type AdminSubscriptionPlan,
} from '@/lib/admin-api';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatCurrency(value?: number | null) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string) {
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

const INITIAL_FORM = {
  group_id: '',
  name: '',
  product_name: '',
  description: '',
  price: '',
  original_price: '',
  validity_days: '30',
  validity_unit: 'days',
  features: '',
  for_sale: true,
  sort_order: '0',
};

export default function AdminPaymentPlansPage() {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [plans, setPlans] = useState<AdminSubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [groupResult, planResult] = await Promise.all([
        listAdminGroups({ page: 1, page_size: 200 }),
        listAdminPaymentPlans(),
      ]);
      setGroups(groupResult.items);
      setPlans(planResult);
    } catch (error: unknown) {
      setError(getErrorMessage(error, '加载套餐管理数据失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  const groupMap = useMemo(() => {
    return new Map(groups.map((group) => [group.id, group]));
  }, [groups]);

  const resetForm = () => {
    setEditingPlanId(null);
    setForm(INITIAL_FORM);
  };

  const fillForm = (plan: AdminSubscriptionPlan) => {
    setEditingPlanId(plan.id);
    setForm({
      group_id: String(plan.group_id || ''),
      name: plan.name || '',
      product_name: plan.product_name || '',
      description: plan.description || '',
      price: String(plan.price ?? ''),
      original_price: plan.original_price != null ? String(plan.original_price) : '',
      validity_days: String(plan.validity_days || 30),
      validity_unit: plan.validity_unit || 'days',
      features: (plan.features || []).join('\n'),
      for_sale: Boolean(plan.for_sale),
      sort_order: String(plan.sort_order || 0),
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        group_id: Number(form.group_id || 0),
        name: form.name.trim(),
        product_name: form.product_name.trim() || undefined,
        description: form.description.trim(),
        price: Number(form.price || 0),
        original_price: form.original_price ? Number(form.original_price) : undefined,
        validity_days: Number(form.validity_days || 0),
        validity_unit: form.validity_unit,
        features: form.features.trim(),
        for_sale: form.for_sale,
        sort_order: Number(form.sort_order || 0),
      };

      if (editingPlanId) {
        await updateAdminPaymentPlan(editingPlanId, payload);
        setSuccess(`套餐 #${editingPlanId} 已更新`);
      } else {
        await createAdminPaymentPlan(payload);
        setSuccess('套餐创建成功');
      }

      resetForm();
      await loadData();
    } catch (error: unknown) {
      setError(getErrorMessage(error, editingPlanId ? '更新套餐失败' : '创建套餐失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleSale = async (plan: AdminSubscriptionPlan) => {
    setError('');
    setSuccess('');
    try {
      await updateAdminPaymentPlan(plan.id, { for_sale: !plan.for_sale });
      setSuccess(`套餐 #${plan.id} 已${plan.for_sale ? '下架' : '上架'}`);
      await loadData();
    } catch (error: unknown) {
      setError(getErrorMessage(error, '更新套餐上架状态失败'));
    }
  };

  const handleDelete = async (plan: AdminSubscriptionPlan) => {
    const confirmed = window.confirm(`确认删除套餐「${plan.name}」吗？`);
    if (!confirmed) return;

    setError('');
    setSuccess('');
    try {
      await deleteAdminPaymentPlan(plan.id);
      if (editingPlanId === plan.id) {
        resetForm();
      }
      setSuccess(`套餐 #${plan.id} 已删除`);
      await loadData();
    } catch (error: unknown) {
      setError(getErrorMessage(error, '删除套餐失败'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">套餐管理</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            管理套餐列表、创建编辑、上下架和删除操作。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            刷新列表
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            新建套餐
          </button>
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

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">套餐列表</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">按排序展示全部订阅套餐。</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40">
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3 font-medium">套餐</th>
                  <th className="px-4 py-3 font-medium">分组</th>
                  <th className="px-4 py-3 font-medium">价格</th>
                  <th className="px-4 py-3 font-medium">有效期</th>
                  <th className="px-4 py-3 font-medium">销售状态</th>
                  <th className="px-4 py-3 font-medium">排序</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                      正在加载套餐列表...
                    </td>
                  </tr>
                ) : plans.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                      暂无套餐数据
                    </td>
                  </tr>
                ) : (
                  plans.map((plan) => {
                    const group = groupMap.get(plan.group_id);
                    return (
                      <tr key={plan.id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-white">{plan.name}</div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {plan.product_name || '未设置商品名'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-gray-900 dark:text-white">{group?.name || `#${plan.group_id}`}</div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {group?.platform || '未识别平台'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-gray-900 dark:text-white">{formatCurrency(plan.price)}</div>
                          <div className="mt-1 text-xs text-gray-500 line-through dark:text-gray-400">
                            {plan.original_price ? formatCurrency(plan.original_price) : '-'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                          {plan.validity_days} {plan.validity_unit}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => void handleToggleSale(plan)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              plan.for_sale ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                plan.for_sale ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{plan.sort_order}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => fillForm(plan)}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800"
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(plan)}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700"
                            >
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
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingPlanId ? `编辑套餐 #${editingPlanId}` : '新建套餐'}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                当前先覆盖套餐核心字段和功能清单，后续可再补更多高级配置。
              </p>
            </div>
            {editingPlanId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                取消编辑
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">所属分组</label>
              <select
                required
                value={form.group_id}
                onChange={(e) => setForm((prev) => ({ ...prev, group_id: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
              >
                <option value="">选择分组</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} {group.platform ? `(${group.platform})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">套餐名称</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">商品名</label>
                <input
                  value={form.product_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, product_name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">描述</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">售价</label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">原价</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.original_price}
                  onChange={(e) => setForm((prev) => ({ ...prev, original_price: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">有效期数值</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={form.validity_days}
                  onChange={(e) => setForm((prev) => ({ ...prev, validity_days: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">有效期单位</label>
                <select
                  value={form.validity_unit}
                  onChange={(e) => setForm((prev) => ({ ...prev, validity_unit: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                >
                  <option value="days">days</option>
                  <option value="months">months</option>
                  <option value="years">years</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">排序</label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">功能清单</label>
              <textarea
                rows={6}
                value={form.features}
                onChange={(e) => setForm((prev) => ({ ...prev, features: e.target.value }))}
                placeholder={'每行一个功能，例如：\n不限模型调用\n优先通道\n专属客服'}
                className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.for_sale}
                onChange={(e) => setForm((prev) => ({ ...prev, for_sale: e.target.checked }))}
              />
              上架销售
            </label>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                重置
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60 dark:bg-white dark:text-gray-900"
              >
                {submitting ? '提交中' : editingPlanId ? '保存套餐' : '创建套餐'}
              </button>
            </div>
          </form>

          {editingPlanId && (
            <div className="mt-6 rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-900/40 dark:text-gray-300">
              <div>创建时间：{formatDate(plans.find((plan) => plan.id === editingPlanId)?.created_at)}</div>
              <div className="mt-2">
                当前功能数：{plans.find((plan) => plan.id === editingPlanId)?.features.length || 0}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
