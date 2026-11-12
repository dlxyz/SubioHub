'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  applyRelayModels,
  createRelayIntegration,
  deleteRelayIntegration,
  getRelayIntegration,
  listRelayIntegrations,
  previewRelayModels,
  syncRelayModels,
  testRelayIntegration,
  updateRelayIntegrationStatus,
  type RelayIntegration,
  type RelayIntegrationDetail,
  type RelayModel,
  type RelaySyncResult,
  type RelayTestResult,
} from '@/lib/admin-relay-api';

const PROVIDER_OPTIONS = [
  { key: 'openrouter', label: 'OpenRouter' },
  { key: 'siliconflow', label: '硅基流动 SiliconFlow' },
  { key: 'openai_compatible', label: 'OpenAI 兼容中转站' },
] as const;

const STATUS_LABEL: Record<string, string> = {
  active: '启用',
  disabled: '停用',
  error: '异常',
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function providerLabel(key: string) {
  return PROVIDER_OPTIONS.find((item) => item.key === key)?.label || key;
}

function formatDateTime(value?: string) {
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

function formatPrice(value?: number | null) {
  if (value === null || value === undefined) return '-';
  return `$${value}`;
}

interface CreateFormState {
  name: string;
  provider_key: string;
  base_url: string;
  api_key: string;
  api_style: 'chat_completions' | 'responses';
  group_name: string;
  rate_multiplier: string;
  concurrency: string;
  priority: string;
}

const EMPTY_FORM: CreateFormState = {
  name: '',
  provider_key: 'openrouter',
  base_url: '',
  api_key: '',
  api_style: 'chat_completions',
  group_name: '',
  rate_multiplier: '1',
  concurrency: '3',
  priority: '50',
};

export default function AdminRelayIntegrationsPage() {
  const [integrations, setIntegrations] = useState<RelayIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM);
  const [previewModels, setPreviewModels] = useState<RelayModel[]>([]);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [priceDraft, setPriceDraft] = useState<Record<string, { input: string; output: string }>>({});
  const [modelSearch, setModelSearch] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RelayIntegrationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<RelaySyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [testModel, setTestModel] = useState('');
  const [testResult, setTestResult] = useState<RelayTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RelayIntegration | null>(null);

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listRelayIntegrations();
      setIntegrations(result.items || []);
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError, '加载第三方接入失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setPreviewModels([]);
    setPreviewWarnings([]);
    setSelected({});
    setPriceDraft({});
    setModelSearch('');
    setStep(1);
    setError('');
    setSuccess('');
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (submitting) return;
    setCreateOpen(false);
  };

  const handlePreview = async () => {
    setPreviewing(true);
    setError('');
    try {
      const result = await previewRelayModels({
        provider_key: form.provider_key,
        base_url: form.base_url,
        api_key: form.api_key,
      });
      setPreviewModels(result.models || []);
      setPreviewWarnings(result.warnings || []);
      const nextSelected: Record<string, boolean> = {};
      const nextPrices: Record<string, { input: string; output: string }> = {};
      (result.models || []).forEach((model) => {
        nextSelected[model.id] = true;
        nextPrices[model.id] = {
          input: model.input_price !== null && model.input_price !== undefined ? String(model.input_price) : '',
          output: model.output_price !== null && model.output_price !== undefined ? String(model.output_price) : '',
        };
      });
      setSelected(nextSelected);
      setPriceDraft(nextPrices);
      setStep(2);
    } catch (previewError: unknown) {
      setError(getErrorMessage(previewError, '拉取第三方模型列表失败'));
    } finally {
      setPreviewing(false);
    }
  };

  const selectedModels = useMemo(() => {
    return previewModels
      .filter((model) => selected[model.id])
      .map((model) => {
        const draft = priceDraft[model.id];
        return {
          ...model,
          input_price: draft?.input ? Number(draft.input) : undefined,
          output_price: draft?.output ? Number(draft.output) : undefined,
        };
      });
  }, [previewModels, selected, priceDraft]);

  const missingPriceCount = selectedModels.filter(
    (model) =>
      model.input_price === undefined ||
      model.output_price === undefined ||
      Number.isNaN(model.input_price) ||
      Number.isNaN(model.output_price)
  ).length;

  const filteredPreviewModels = useMemo(() => {
    const keyword = modelSearch.trim().toLowerCase();
    if (!keyword) return previewModels;
    return previewModels.filter((model) => model.id.toLowerCase().includes(keyword));
  }, [previewModels, modelSearch]);

  const handleCreate = async () => {
    if (selectedModels.length === 0) {
      setError('请至少选择一个模型');
      return;
    }
    if (missingPriceCount > 0) {
      setError(`还有 ${missingPriceCount} 个已选模型未填写输入/输出价格（USD / token）`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await createRelayIntegration({
        name: form.name.trim(),
        provider_key: form.provider_key,
        base_url: form.base_url.trim(),
        api_key: form.api_key.trim(),
        api_style: form.api_style,
        group_name: form.group_name.trim() || undefined,
        rate_multiplier: Number(form.rate_multiplier) || 1,
        concurrency: Number(form.concurrency) || 3,
        priority: Number(form.priority) || 50,
        models: selectedModels.map((model) => ({
          ...model,
          input_price: model.input_price as number,
          output_price: model.output_price as number,
        })),
      });
      setSuccess(`第三方接入「${form.name.trim()}」创建成功`);
      setCreateOpen(false);
      await loadIntegrations();
    } catch (createError: unknown) {
      setError(getErrorMessage(createError, '创建第三方接入失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (id: number) => {
    setDetailId(id);
    setDetail(null);
    setSyncResult(null);
    setTestResult(null);
    setTestModel('');
    setDetailLoading(true);
    setError('');
    try {
      const result = await getRelayIntegration(id);
      setDetail(result);
      setTestModel(result.model_catalog[0]?.id || '');
    } catch (detailError: unknown) {
      setError(getErrorMessage(detailError, '加载接入详情失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailId(null);
    setDetail(null);
    setSyncResult(null);
    setTestResult(null);
  };

  const handleSync = async () => {
    if (!detailId) return;
    setSyncing(true);
    setError('');
    setSuccess('');
    try {
      const result = await syncRelayModels(detailId);
      setSyncResult(result);
      setDetail((prev) =>
        prev
          ? { ...prev, model_catalog: result.models, last_synced_at: result.last_synced_at }
          : prev
      );
      setSuccess(
        `同步完成：新增 ${result.added.length} 个，移除 ${result.removed.length} 个模型`
      );
    } catch (syncError: unknown) {
      setError(getErrorMessage(syncError, '同步模型失败'));
    } finally {
      setSyncing(false);
    }
  };

  const handleApplyModels = async () => {
    if (!detailId || !detail) return;
    setError('');
    setSuccess('');
    try {
      await applyRelayModels(
        detailId,
        detail.model_catalog.map((model) => ({
          ...model,
          input_price: model.input_price as number,
          output_price: model.output_price as number,
        }))
      );
      setSuccess('已把当前模型目录写入账号映射与渠道定价');
    } catch (applyError: unknown) {
      setError(getErrorMessage(applyError, '应用模型目录失败'));
    }
  };

  const handleTest = async () => {
    if (!detailId || !testModel) return;
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      const result = await testRelayIntegration(detailId, testModel);
      setTestResult(result);
    } catch (testError: unknown) {
      setError(getErrorMessage(testError, '测试请求失败'));
    } finally {
      setTesting(false);
    }
  };

  const handleToggleStatus = async (integration: RelayIntegration) => {
    setError('');
    setSuccess('');
    try {
      const next = integration.status === 'active' ? 'disabled' : 'active';
      await updateRelayIntegrationStatus(integration.id, next);
      setSuccess(`已${next === 'active' ? '启用' : '停用'}「${integration.name}」`);
      await loadIntegrations();
      if (detailId === integration.id) {
        await openDetail(integration.id);
      }
    } catch (statusError: unknown) {
      setError(getErrorMessage(statusError, '更新状态失败'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setError('');
    setSuccess('');
    try {
      await deleteRelayIntegration(deleteTarget.id);
      setSuccess(`已删除「${deleteTarget.name}」`);
      setDeleteTarget(null);
      if (detailId === deleteTarget.id) closeDetail();
      await loadIntegrations();
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError, '删除接入失败'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">第三方接入</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            使用统一网关地址 + API Key 一键接入 OpenRouter / 硅基流动等中转站，模型自动同步到渠道定价。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadIntegrations()}
            className="rounded-2xl border border-gray-200 px-3 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            title="刷新"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-600"
          >
            <Plus className="h-4 w-4" />
            新增接入
          </button>
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
          共 {integrations.length} 个第三方接入
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr className="text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">Base URL</th>
                <th className="px-4 py-3 font-medium">模型数</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">最后同步</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    正在加载第三方接入...
                  </td>
                </tr>
              ) : integrations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    暂无第三方接入，点击右上角「新增接入」开始
                  </td>
                </tr>
              ) : (
                integrations.map((integration) => (
                  <tr
                    key={integration.id}
                    className="border-t border-gray-100 align-top dark:border-gray-800"
                  >
                    <td className="px-4 py-4 font-medium text-gray-900 dark:text-white">
                      {integration.name}
                    </td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">
                      {providerLabel(integration.provider_key)}
                    </td>
                    <td className="max-w-[280px] break-all px-4 py-4 text-gray-500 dark:text-gray-400">
                      {integration.base_url}
                    </td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">
                      {integration.model_catalog?.length || 0}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          integration.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                        }`}
                      >
                        {STATUS_LABEL[integration.status] || integration.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">
                      {formatDateTime(integration.last_synced_at)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void openDetail(integration.id)}
                          className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          详情
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleStatus(integration)}
                          className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          {integration.status === 'active' ? '停用' : '启用'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(integration)}
                          className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-[#111111]">
            <div className="flex items-center justify-between border-b border-gray-200 px-7 py-5 dark:border-gray-800">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">新增第三方接入</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  步骤 {step} / 3 · {step === 1 ? '连接信息' : step === 2 ? '选择模型' : '确认创建'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreate}
                className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-7 py-6">
              {step === 1 && (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block text-gray-600 dark:text-gray-300">接入名称</span>
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="如 OpenRouter 主站"
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-400 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-gray-600 dark:text-gray-300">中转站类型</span>
                    <select
                      value={form.provider_key}
                      onChange={(e) => setForm({ ...form, provider_key: e.target.value })}
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-400 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                    >
                      {PROVIDER_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm md:col-span-2">
                    <span className="mb-1 block text-gray-600 dark:text-gray-300">
                      统一网关地址（必须 https）
                    </span>
                    <input
                      value={form.base_url}
                      onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                      placeholder="https://openrouter.ai/api/v1"
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-400 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                    />
                  </label>
                  <label className="text-sm md:col-span-2">
                    <span className="mb-1 block text-gray-600 dark:text-gray-300">API Key</span>
                    <input
                      value={form.api_key}
                      onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                      placeholder="sk-..."
                      type="password"
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-400 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-gray-600 dark:text-gray-300">API 风格</span>
                    <select
                      value={form.api_style}
                      onChange={(e) =>
                        setForm({ ...form, api_style: e.target.value as CreateFormState['api_style'] })
                      }
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-400 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                    >
                      <option value="chat_completions">Chat Completions（大多数中转站）</option>
                      <option value="responses">Responses（OpenAI 官方风格）</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-gray-600 dark:text-gray-300">分组名称（可选）</span>
                    <input
                      value={form.group_name}
                      onChange={(e) => setForm({ ...form, group_name: e.target.value })}
                      placeholder="留空则与接入名称一致"
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-400 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-gray-600 dark:text-gray-300">分组倍率</span>
                    <input
                      value={form.rate_multiplier}
                      onChange={(e) => setForm({ ...form, rate_multiplier: e.target.value })}
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-400 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-gray-600 dark:text-gray-300">账号并发</span>
                    <input
                      value={form.concurrency}
                      onChange={(e) => setForm({ ...form, concurrency: e.target.value })}
                      type="number"
                      min="1"
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-400 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-gray-600 dark:text-gray-300">账号优先级</span>
                    <input
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value })}
                      type="number"
                      min="1"
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-400 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                    />
                  </label>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative min-w-[240px] flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        placeholder="搜索模型 ID..."
                        className="w-full rounded-2xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-400 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                      />
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      已选 {selectedModels.length} / {previewModels.length}
                    </span>
                  </div>
                  {previewWarnings.length > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                      {previewWarnings.join('；')}
                    </div>
                  )}
                  <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                    {filteredPreviewModels.map((model) => {
                      const draft = priceDraft[model.id] || { input: '', output: '' };
                      return (
                        <div
                          key={model.id}
                          className="rounded-2xl border border-gray-200 p-3 dark:border-gray-800"
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={Boolean(selected[model.id])}
                              onChange={(e) =>
                                setSelected({ ...selected, [model.id]: e.target.checked })
                              }
                              className="mt-1 h-4 w-4"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="break-all text-sm font-medium text-gray-900 dark:text-white">
                                  {model.id}
                                </span>
                                {model.context_length ? (
                                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                    {model.context_length} ctx
                                  </span>
                                ) : null}
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                  价格来源：{model.price_source === 'upstream' ? '上游' : '手动'}
                                </span>
                              </div>
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                <label className="text-xs text-gray-500 dark:text-gray-400">
                                  输入价（USD / token）
                                  <input
                                    value={draft.input}
                                    onChange={(e) =>
                                      setPriceDraft({
                                        ...priceDraft,
                                        [model.id]: { ...draft, input: e.target.value },
                                      })
                                    }
                                    type="number"
                                    step="any"
                                    min="0"
                                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-emerald-400 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                                  />
                                </label>
                                <label className="text-xs text-gray-500 dark:text-gray-400">
                                  输出价（USD / token）
                                  <input
                                    value={draft.output}
                                    onChange={(e) =>
                                      setPriceDraft({
                                        ...priceDraft,
                                        [model.id]: { ...draft, output: e.target.value },
                                      })
                                    }
                                    type="number"
                                    step="any"
                                    min="0"
                                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-emerald-400 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                                  />
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {missingPriceCount > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      还有 {missingPriceCount} 个已选模型缺少价格，请补全后再继续。
                    </p>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4 text-sm">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                      <p className="text-xs text-gray-500 dark:text-gray-400">接入名称</p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-white">{form.name}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                      <p className="text-xs text-gray-500 dark:text-gray-400">中转站类型</p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-white">
                        {providerLabel(form.provider_key)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800 md:col-span-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Base URL</p>
                      <p className="mt-1 break-all font-medium text-gray-900 dark:text-white">
                        {form.base_url}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                    <p className="text-xs text-gray-500 dark:text-gray-400">将接入 {selectedModels.length} 个模型</p>
                    <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                      {selectedModels.map((model) => (
                        <span
                          key={model.id}
                          className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                        >
                          {model.id}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    创建后系统会自动生成：一个 standard 分组、一个 OpenAI API Key 账号、一个 standard 渠道。
                    API Key 保存在账号凭证中，不会写入接入表。
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 px-7 py-5 dark:border-gray-800">
              <button
                type="button"
                onClick={() => (step === 1 ? closeCreate() : setStep(step - 1))}
                className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <ArrowLeft className="h-4 w-4" />
                {step === 1 ? '取消' : '上一步'}
              </button>
              {step === 1 && (
                <button
                  type="button"
                  onClick={() => void handlePreview()}
                  disabled={previewing || !form.name.trim() || !form.base_url.trim() || !form.api_key.trim()}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {previewing ? '正在拉取模型...' : '下一步：拉取模型'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
              {step === 2 && (
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={selectedModels.length === 0 || missingPriceCount > 0}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  下一步：确认
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
              {step === 3 && (
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {submitting ? '正在创建...' : '确认创建'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {detailId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-[#111111]">
            <div className="flex items-center justify-between border-b border-gray-200 px-7 py-5 dark:border-gray-800">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {detail?.name || '接入详情'}
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {detail ? `${providerLabel(detail.provider_key)} · ${detail.base_url}` : '正在加载...'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-7 py-6">
              {detailLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">正在加载详情...</p>
              ) : detail ? (
                <>
                  <div className="grid gap-3 text-sm md:grid-cols-4">
                    <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                      <p className="text-xs text-gray-500 dark:text-gray-400">分组</p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-white">{detail.group_name || '-'}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                      <p className="text-xs text-gray-500 dark:text-gray-400">渠道</p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-white">{detail.channel_name || '-'}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                      <p className="text-xs text-gray-500 dark:text-gray-400">模型数</p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-white">{detail.model_catalog.length}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                      <p className="text-xs text-gray-500 dark:text-gray-400">最后同步</p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-white">
                        {formatDateTime(detail.last_synced_at)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        账号池（{detail.accounts.length}）
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSync()}
                          disabled={syncing}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                          同步模型
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleApplyModels()}
                          className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          应用当前模型目录
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead className="text-left text-gray-500 dark:text-gray-400">
                          <tr>
                            <th className="px-2 py-2 font-medium">账号</th>
                            <th className="px-2 py-2 font-medium">状态</th>
                            <th className="px-2 py-2 font-medium">可调度</th>
                            <th className="px-2 py-2 font-medium">并发</th>
                            <th className="px-2 py-2 font-medium">优先级</th>
                            <th className="px-2 py-2 font-medium">最后使用</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.accounts.map((account) => (
                            <tr key={account.id} className="border-t border-gray-100 dark:border-gray-800">
                              <td className="px-2 py-2 text-gray-900 dark:text-white">{account.name}</td>
                              <td className="px-2 py-2 text-gray-500 dark:text-gray-400">{account.status}</td>
                              <td className="px-2 py-2 text-gray-500 dark:text-gray-400">
                                {account.schedulable ? '是' : '否'}
                              </td>
                              <td className="px-2 py-2 text-gray-500 dark:text-gray-400">{account.concurrency}</td>
                              <td className="px-2 py-2 text-gray-500 dark:text-gray-400">{account.priority}</td>
                              <td className="px-2 py-2 text-gray-500 dark:text-gray-400">
                                {formatDateTime(account.last_used_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {syncResult && (
                    <div className="rounded-2xl border border-gray-200 p-4 text-xs dark:border-gray-800">
                      <p className="font-medium text-gray-900 dark:text-white">同步结果</p>
                      <p className="mt-2 text-emerald-600 dark:text-emerald-400">
                        新增：{syncResult.added.map((model) => model.id).join('、') || '无'}
                      </p>
                      <p className="mt-1 text-red-600 dark:text-red-400">
                        移除：{syncResult.removed.map((model) => model.id).join('、') || '无'}
                      </p>
                    </div>
                  )}

                  <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">连通性测试</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select
                        value={testModel}
                        onChange={(e) => setTestModel(e.target.value)}
                        className="min-w-[240px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white"
                      >
                        {detail.model_catalog.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.id}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleTest()}
                        disabled={testing || !testModel}
                        className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-black disabled:opacity-50 dark:bg-white dark:text-gray-900"
                      >
                        {testing ? '测试中...' : '发送 ping'}
                      </button>
                    </div>
                    {testResult && (
                      <div
                        className={`mt-3 rounded-xl px-3 py-2 text-xs ${
                          testResult.success
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                        }`}
                      >
                        <p>
                          {testResult.success ? '成功' : '失败'} · HTTP {testResult.status_code} ·{' '}
                          {testResult.duration_ms}ms
                        </p>
                        <p className="mt-1 break-all">{testResult.message}</p>
                        {testResult.response_preview && (
                          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all text-[11px]">
                            {testResult.response_preview}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">模型目录</p>
                    <div className="mt-2 max-h-56 overflow-y-auto">
                      <table className="min-w-full text-xs">
                        <thead className="text-left text-gray-500 dark:text-gray-400">
                          <tr>
                            <th className="px-2 py-1.5 font-medium">模型 ID</th>
                            <th className="px-2 py-1.5 font-medium">输入价</th>
                            <th className="px-2 py-1.5 font-medium">输出价</th>
                            <th className="px-2 py-1.5 font-medium">来源</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.model_catalog.map((model) => (
                            <tr key={model.id} className="border-t border-gray-100 dark:border-gray-800">
                              <td className="break-all px-2 py-1.5 text-gray-900 dark:text-white">{model.id}</td>
                              <td className="px-2 py-1.5 text-gray-500 dark:text-gray-400">
                                {formatPrice(model.input_price)}
                              </td>
                              <td className="px-2 py-1.5 text-gray-500 dark:text-gray-400">
                                {formatPrice(model.output_price)}
                              </td>
                              <td className="px-2 py-1.5 text-gray-500 dark:text-gray-400">
                                {model.price_source === 'upstream' ? '上游' : '手动'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">未找到详情</p>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-[28px] bg-white p-7 shadow-2xl dark:bg-[#111111]">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">删除第三方接入</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              确定删除「{deleteTarget.name}」吗？渠道和账号会被停用，历史数据保留。
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="rounded-2xl bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-600"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
