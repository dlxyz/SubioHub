'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import {
  createAdminChannel,
  deleteAdminChannel,
  getAdminChannel,
  listAdminChannels,
  listAdminGroups,
  updateAdminChannel,
  type AdminChannel,
  type AdminGroup,
  type AdminChannelModelPricing,
  type AdminChannelPricingInterval,
} from '@/lib/admin-api';

const PAGE_SIZE = 20;
const PLATFORM_OPTIONS = [
  { key: 'anthropic', label: 'Anthropic', color: 'text-orange-600 dark:text-orange-300' },
  { key: 'openai', label: 'OpenAI', color: 'text-emerald-600 dark:text-emerald-300' },
  { key: 'gemini', label: 'Gemini', color: 'text-blue-600 dark:text-blue-300' },
  { key: 'antigravity', label: 'Antigravity', color: 'text-purple-600 dark:text-purple-300' },
] as const;

type ChannelFormState = {
  name: string;
  description: string;
  status: string;
  restrict_models: boolean;
  billing_model_source: string;
  apply_pricing_to_account_stats: boolean;
  selectedPlatforms: string[];
  platformGroupIds: Record<string, number[]>;
  modelMappings: Record<string, Array<{ source: string; target: string }>>;
  modelPricing: PricingFormEntry[];
};

type PricingFormEntry = {
  id?: number;
  platform: string;
  modelsText: string;
  billing_mode: 'token' | 'per_request' | 'image';
  input_price: string;
  output_price: string;
  cache_write_price: string;
  cache_read_price: string;
  image_output_price: string;
  per_request_price: string;
  intervals: AdminChannelPricingInterval[];
};

const EMPTY_FORM: ChannelFormState = {
  name: '',
  description: '',
  status: 'active',
  restrict_models: false,
  billing_model_source: 'channel_mapped',
  apply_pricing_to_account_stats: false,
  selectedPlatforms: [],
  platformGroupIds: {},
  modelMappings: {},
  modelPricing: [],
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function toNullableNumber(value: string | number | null | undefined) {
  if (value === '' || value === null || value === undefined) return null;
  const next = Number(value);
  return Number.isNaN(next) ? null : next;
}

function perTokenToMTok(value: number | null | undefined) {
  if (value === null || value === undefined) return '';
  return String(Number((value * 1_000_000).toPrecision(10)));
}

function mTokToPerToken(value: string | number | null | undefined) {
  const next = toNullableNumber(value);
  if (next === null) return null;
  return Number((next / 1_000_000).toPrecision(10));
}

function apiPricingToForm(entry: AdminChannelModelPricing): PricingFormEntry {
  return {
    id: entry.id,
    platform: entry.platform,
    modelsText: (entry.models || []).join('\n'),
    billing_mode: (entry.billing_mode || 'token') as PricingFormEntry['billing_mode'],
    input_price: perTokenToMTok(entry.input_price),
    output_price: perTokenToMTok(entry.output_price),
    cache_write_price: perTokenToMTok(entry.cache_write_price),
    cache_read_price: perTokenToMTok(entry.cache_read_price),
    image_output_price: perTokenToMTok(entry.image_output_price),
    per_request_price: entry.per_request_price == null ? '' : String(entry.per_request_price),
    intervals: entry.intervals || [],
  };
}

function formPricingToApi(entry: PricingFormEntry): AdminChannelModelPricing {
  const models = Array.from(
    new Set(
      entry.modelsText
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

  return {
    id: entry.id,
    platform: entry.platform,
    models,
    billing_mode: entry.billing_mode,
    input_price: entry.billing_mode === 'token' ? mTokToPerToken(entry.input_price) : null,
    output_price: entry.billing_mode === 'token' ? mTokToPerToken(entry.output_price) : null,
    cache_write_price: entry.billing_mode === 'token' ? mTokToPerToken(entry.cache_write_price) : null,
    cache_read_price: entry.billing_mode === 'token' ? mTokToPerToken(entry.cache_read_price) : null,
    image_output_price: entry.billing_mode === 'token' ? mTokToPerToken(entry.image_output_price) : null,
    per_request_price: entry.billing_mode === 'token' ? null : toNullableNumber(entry.per_request_price),
    intervals: entry.intervals || [],
  };
}

function emptyPricingEntry(platform: string): PricingFormEntry {
  return {
    platform,
    modelsText: '',
    billing_mode: 'token',
    input_price: '',
    output_price: '',
    cache_write_price: '',
    cache_read_price: '',
    image_output_price: '',
    per_request_price: '',
    intervals: [],
  };
}

function apiMappingToRows(mapping?: Record<string, Record<string, string>>) {
  const result: Record<string, Array<{ source: string; target: string }>> = {};
  for (const [platform, entries] of Object.entries(mapping || {})) {
    result[platform] = Object.entries(entries || {}).map(([source, target]) => ({ source, target }));
  }
  return result;
}

function rowsToApiMapping(rows: Record<string, Array<{ source: string; target: string }>>) {
  const result: Record<string, Record<string, string>> = {};
  for (const [platform, items] of Object.entries(rows || {})) {
    const validItems = (items || []).filter((item) => item.source.trim() && item.target.trim());
    if (validItems.length > 0) {
      result[platform] = Object.fromEntries(validItems.map((item) => [item.source.trim(), item.target.trim()]));
    }
  }
  return result;
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
      <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-[#111111]">
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

export default function AdminChannelsPage() {
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
  });
  const [showModal, setShowModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<AdminChannel | null>(null);
  const [form, setForm] = useState<ChannelFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<AdminChannel | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const groupsByPlatform = useMemo(() => {
    const entries = PLATFORM_OPTIONS.map((platform) => [
      platform.key,
      groups.filter((group) => group.platform === platform.key),
    ]);
    return Object.fromEntries(entries) as Record<string, AdminGroup[]>;
  }, [groups]);

  const loadChannels = useCallback(
    async (page = 1, keyword = search, status = statusFilter) => {
      setLoading(true);
      setError('');
      try {
        const [channelResult, groupResult] = await Promise.all([
          listAdminChannels({
            page,
            page_size: PAGE_SIZE,
            search: keyword || undefined,
            status: status || undefined,
            sort_by: 'created_at',
            sort_order: 'desc',
          }),
          groups.length > 0 ? Promise.resolve({ items: groups, total: groups.length, page: 1, pageSize: groups.length }) : listAdminGroups({ page: 1, page_size: 200 }),
        ]);
        setChannels(channelResult.items);
        setGroups(groupResult.items);
        setPagination({
          page: channelResult.page || page,
          pageSize: channelResult.pageSize || PAGE_SIZE,
          total: channelResult.total,
        });
      } catch (loadError: unknown) {
        setError(getErrorMessage(loadError, '加载渠道失败'));
      } finally {
        setLoading(false);
      }
    },
    [groups, search, statusFilter]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadChannels(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadChannels]);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.pageSize || PAGE_SIZE)));

  const openCreateModal = async () => {
    setEditingChannel(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
    if (groups.length === 0) {
      try {
        const result = await listAdminGroups({ page: 1, page_size: 200 });
        setGroups(result.items);
      } catch {
        // ignore
      }
    }
  };

  const openEditModal = async (channel: AdminChannel) => {
    setError('');
    try {
      let nextGroups = groups;
      if (nextGroups.length === 0) {
        const groupResult = await listAdminGroups({ page: 1, page_size: 200 });
        nextGroups = groupResult.items;
        setGroups(groupResult.items);
      }
      const detail = await getAdminChannel(channel.id);
      const platformGroupIds = Object.fromEntries(PLATFORM_OPTIONS.map((platform) => [platform.key, [] as number[]])) as Record<string, number[]>;
      for (const groupId of detail.group_ids || []) {
        const targetGroup = nextGroups.find((group) => group.id === groupId);
        if (targetGroup?.platform) {
          platformGroupIds[targetGroup.platform] = [...(platformGroupIds[targetGroup.platform] || []), targetGroup.id];
        }
      }
      const mappedPlatforms = Object.keys(detail.model_mapping || {});
      const pricedPlatforms = (detail.model_pricing || []).map((item) => item.platform).filter(Boolean);
      const selectedPlatformSet = new Set<string>([
        ...PLATFORM_OPTIONS.map((platform) => platform.key).filter((platform) => (platformGroupIds[platform] || []).length > 0),
        ...mappedPlatforms,
        ...pricedPlatforms,
      ]);
      const selectedPlatforms = PLATFORM_OPTIONS.map((platform) => platform.key).filter((platform) => selectedPlatformSet.has(platform));
      setEditingChannel(detail);
      setForm({
        name: detail.name || '',
        description: detail.description || '',
        status: detail.status || 'active',
        restrict_models: Boolean(detail.restrict_models),
        billing_model_source: detail.billing_model_source || 'channel_mapped',
        apply_pricing_to_account_stats: Boolean(detail.apply_pricing_to_account_stats),
        selectedPlatforms,
        platformGroupIds,
        modelMappings: apiMappingToRows(detail.model_mapping),
        modelPricing: (detail.model_pricing || []).map(apiPricingToForm),
      });
      setShowModal(true);
    } catch (editError: unknown) {
      setError(getErrorMessage(editError, '加载渠道详情失败'));
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingChannel(null);
    setForm(EMPTY_FORM);
  };

  const togglePlatform = (platform: string) => {
    setForm((prev) => {
      const enabled = prev.selectedPlatforms.includes(platform);
      return {
        ...prev,
        selectedPlatforms: enabled ? prev.selectedPlatforms.filter((item) => item !== platform) : [...prev.selectedPlatforms, platform],
        platformGroupIds: enabled
          ? { ...prev.platformGroupIds, [platform]: [] }
          : { ...prev.platformGroupIds, [platform]: prev.platformGroupIds[platform] || [] },
        modelMappings: enabled
          ? { ...prev.modelMappings, [platform]: [] }
          : { ...prev.modelMappings, [platform]: prev.modelMappings[platform] || [] },
        modelPricing: enabled ? prev.modelPricing.filter((entry) => entry.platform !== platform) : prev.modelPricing,
      };
    });
  };

  const togglePlatformGroup = (platform: string, groupId: number) => {
    setForm((prev) => {
      const current = prev.platformGroupIds[platform] || [];
      return {
        ...prev,
        platformGroupIds: {
          ...prev.platformGroupIds,
          [platform]: current.includes(groupId) ? current.filter((item) => item !== groupId) : [...current, groupId],
        },
      };
    });
  };

  const addMappingRow = (platform: string) => {
    setForm((prev) => ({
      ...prev,
      modelMappings: {
        ...prev.modelMappings,
        [platform]: [...(prev.modelMappings[platform] || []), { source: '', target: '' }],
      },
    }));
  };

  const updateMappingRow = (platform: string, index: number, field: 'source' | 'target', value: string) => {
    setForm((prev) => ({
      ...prev,
      modelMappings: {
        ...prev.modelMappings,
        [platform]: (prev.modelMappings[platform] || []).map((item, itemIndex) =>
          itemIndex === index ? { ...item, [field]: value } : item
        ),
      },
    }));
  };

  const removeMappingRow = (platform: string, index: number) => {
    setForm((prev) => ({
      ...prev,
      modelMappings: {
        ...prev.modelMappings,
        [platform]: (prev.modelMappings[platform] || []).filter((_, itemIndex) => itemIndex !== index),
      },
    }));
  };

  const addPricingEntry = (platform: string) => {
    setForm((prev) => ({
      ...prev,
      modelPricing: [...prev.modelPricing, emptyPricingEntry(platform)],
    }));
  };

  const updatePricingEntry = (index: number, patch: Partial<PricingFormEntry>) => {
    setForm((prev) => ({
      ...prev,
      modelPricing: prev.modelPricing.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  };

  const removePricingEntry = (index: number) => {
    setForm((prev) => ({
      ...prev,
      modelPricing: prev.modelPricing.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const groupIds = form.selectedPlatforms.flatMap((platform) => form.platformGroupIds[platform] || []);
    if (!form.name.trim()) {
      setError('请输入渠道名称');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const modelPricing = form.modelPricing.map(formPricingToApi).filter((entry) => entry.models.length > 0);
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
        group_ids: groupIds,
        model_pricing: modelPricing,
        model_mapping: rowsToApiMapping(form.modelMappings),
        billing_model_source: form.billing_model_source,
        restrict_models: form.restrict_models,
        features_config: editingChannel?.features_config || {},
        apply_pricing_to_account_stats: form.apply_pricing_to_account_stats,
        account_stats_pricing_rules: editingChannel?.account_stats_pricing_rules || [],
      };

      if (editingChannel) {
        await updateAdminChannel(editingChannel.id, payload);
        setSuccess('渠道更新成功');
      } else {
        await createAdminChannel(payload);
        setSuccess('渠道创建成功');
      }

      closeModal();
      await loadChannels(editingChannel ? pagination.page : 1);
    } catch (submitError: unknown) {
      setError(getErrorMessage(submitError, editingChannel ? '更新渠道失败' : '创建渠道失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (channel: AdminChannel) => {
    try {
      const nextStatus = channel.status === 'active' ? 'disabled' : 'active';
      await updateAdminChannel(channel.id, { status: nextStatus });
      setSuccess(nextStatus === 'active' ? '渠道已启用' : '渠道已停用');
      await loadChannels(pagination.page);
    } catch (statusError: unknown) {
      setError(getErrorMessage(statusError, '更新渠道状态失败'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await deleteAdminChannel(deleteTarget.id);
      setSuccess('渠道已删除');
      setDeleteTarget(null);
      await loadChannels(Math.max(1, pagination.page));
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError, '删除渠道失败'));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">渠道管理</h2>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void loadChannels(1, search, statusFilter);
                }
              }}
              placeholder="搜索渠道..."
              className="w-full rounded-2xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-800 dark:bg-[#1A1A1A] dark:text-white"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-2xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">全部状态</option>
              <option value="active">启用</option>
              <option value="disabled">停用</option>
            </select>
            <button
              type="button"
              onClick={() => void loadChannels(1, search, statusFilter)}
              className="rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-black dark:bg-white dark:text-gray-900"
            >
              搜索
            </button>
            <button
              type="button"
              onClick={() => void loadChannels(pagination.page)}
              className="rounded-2xl border border-gray-200 px-3 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              title="刷新"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => void openCreateModal()}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-600"
            >
              <Plus className="h-4 w-4" />
              创建渠道
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
          第 {pagination.page} / {totalPages} 页，共 {pagination.total} 个渠道
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr className="text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">描述</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">分组</th>
                <th className="px-4 py-3 font-medium">定价</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    正在加载渠道...
                  </td>
                </tr>
              ) : channels.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    暂无渠道数据
                  </td>
                </tr>
              ) : (
                channels.map((channel) => (
                  <tr key={channel.id} className="border-t border-gray-100 align-top dark:border-gray-800">
                    <td className="px-4 py-4 font-medium text-gray-900 dark:text-white">{channel.name}</td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">{channel.description || '-'}</td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => void handleToggleStatus(channel)}
                        className={`relative inline-flex h-7 w-12 rounded-full transition ${
                          channel.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        title={channel.status === 'active' ? '点击停用' : '点击启用'}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                            channel.status === 'active' ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                        {(channel.group_ids || []).length} 个分组
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                        {(channel.model_pricing || []).length} 条定价
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">{formatDate(channel.created_at)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void openEditModal(channel)}
                          className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(channel)}
                          className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
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
        <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <div>
            第 {pagination.page} / {totalPages} 页，共 {pagination.total} 个渠道
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1 || loading}
              onClick={() => void loadChannels(pagination.page - 1)}
              className="rounded-2xl border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={pagination.page >= totalPages || loading}
              onClick={() => void loadChannels(pagination.page + 1)}
              className="rounded-2xl border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      <ModalShell open={showModal} title={editingChannel ? '编辑渠道' : '创建渠道'} onClose={closeModal}>
        <form onSubmit={handleSubmit}>
          <div className="border-b border-gray-200 px-7 pt-4 dark:border-gray-800">
            <div className="inline-flex border-b-2 border-emerald-500 px-3 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              基础设置
            </div>
          </div>
          <div className="space-y-6 px-7 py-6">
            <div>
              <FieldLabel>名称 *</FieldLabel>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="输入渠道名称"
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              />
            </div>

            <div>
              <FieldLabel>描述</FieldLabel>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="可选描述"
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              />
            </div>

            {editingChannel ? (
              <div>
                <FieldLabel>状态</FieldLabel>
                <select
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
                >
                  <option value="active">启用</option>
                  <option value="disabled">停用</option>
                </select>
              </div>
            ) : null}

            <div>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.restrict_models}
                  onChange={(e) => setForm((prev) => ({ ...prev, restrict_models: e.target.checked }))}
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">限制模型</span>
                  <span className="mt-1 block text-xs text-gray-400">开启后，仅允许模型定价列表中的模型，不在列表中的模型请求将被拒绝。</span>
                </span>
              </label>
            </div>

            <div>
              <FieldLabel>计费基准</FieldLabel>
              <select
                value={form.billing_model_source}
                onChange={(e) => setForm((prev) => ({ ...prev, billing_model_source: e.target.value }))}
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-5 py-4 text-base text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
              >
                <option value="channel_mapped">以渠道映射后的模型计费</option>
                <option value="requested">以请求模型计费</option>
                <option value="upstream">以上游最终模型计费</option>
              </select>
              <p className="mt-2 text-xs text-gray-400">控制使用哪个模型名称进行定价查找</p>
            </div>

            <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
              <FieldLabel>平台配置</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {PLATFORM_OPTIONS.map((platform) => {
                  const enabled = form.selectedPlatforms.includes(platform.key);
                  return (
                    <label
                      key={platform.key}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                        enabled
                          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                          : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => togglePlatform(platform.key)}
                        className="h-3.5 w-3.5 rounded border-gray-300"
                      />
                      <span className={platform.color}>{platform.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {form.selectedPlatforms.map((platform) => (
              <div key={platform} className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <div className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
                  {PLATFORM_OPTIONS.find((item) => item.key === platform)?.label} 分组
                </div>
                {groupsByPlatform[platform]?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {groupsByPlatform[platform].map((group) => (
                      <label
                        key={group.id}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                          (form.platformGroupIds[platform] || []).includes(group.id)
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={(form.platformGroupIds[platform] || []).includes(group.id)}
                          onChange={() => togglePlatformGroup(platform, group.id)}
                          className="h-3.5 w-3.5 rounded border-gray-300"
                        />
                        <span>{group.name}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                          {Number(group.rate_multiplier || 1).toFixed(1)}x
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 dark:text-gray-400">当前平台暂无可绑定分组</div>
                )}
              </div>
            ))}

            <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">模型映射</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">将请求模型映射到上游模型，按平台分别维护。</div>
                </div>
              </div>
              {form.selectedPlatforms.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">请先选择平台后再配置模型映射。</div>
              ) : (
                <div className="space-y-4">
                  {form.selectedPlatforms.map((platform) => (
                    <div key={platform} className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/40">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {PLATFORM_OPTIONS.find((item) => item.key === platform)?.label}
                        </div>
                        <button
                          type="button"
                          onClick={() => addMappingRow(platform)}
                          className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-white dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          添加映射
                        </button>
                      </div>
                      {(form.modelMappings[platform] || []).length === 0 ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400">暂无模型映射</div>
                      ) : (
                        <div className="space-y-2">
                          {(form.modelMappings[platform] || []).map((row, index) => (
                            <div key={`${platform}-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                              <input
                                value={row.source}
                                onChange={(e) => updateMappingRow(platform, index, 'source', e.target.value)}
                                placeholder="原模型名，如 claude-3-5-sonnet"
                                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                              />
                              <input
                                value={row.target}
                                onChange={(e) => updateMappingRow(platform, index, 'target', e.target.value)}
                                placeholder="映射后的模型名，如 claude-sonnet-4-20250514"
                                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                              />
                              <button
                                type="button"
                                onClick={() => removeMappingRow(platform, index)}
                                className="rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
                              >
                                删除
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">模型定价</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">按平台维护模型定价规则，支持 Token 和按次计费。</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {form.selectedPlatforms.map((platform) => (
                    <button
                      key={platform}
                      type="button"
                      onClick={() => addPricingEntry(platform)}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      新增 {PLATFORM_OPTIONS.find((item) => item.key === platform)?.label} 定价
                    </button>
                  ))}
                </div>
              </div>
              {form.modelPricing.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">暂无模型定价配置</div>
              ) : (
                <div className="space-y-4">
                  {form.modelPricing.map((entry, index) => (
                    <div key={`${entry.platform}-${index}`} className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/40">
                      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${PLATFORM_OPTIONS.find((item) => item.key === entry.platform)?.color || 'text-gray-700'}`}>
                            {PLATFORM_OPTIONS.find((item) => item.key === entry.platform)?.label || entry.platform}
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-500 dark:bg-[#111111] dark:text-gray-300">
                            {entry.billing_mode === 'token' ? 'Token' : entry.billing_mode === 'image' ? '图片按次' : '按次'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removePricingEntry(index)}
                          className="rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          删除定价
                        </button>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[1.5fr_220px]">
                        <div>
                          <FieldLabel>模型列表</FieldLabel>
                          <textarea
                            rows={4}
                            value={entry.modelsText}
                            onChange={(e) => updatePricingEntry(index, { modelsText: e.target.value })}
                            placeholder="每行一个模型，或使用逗号分隔，支持通配符 *"
                            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                          />
                        </div>
                        <div>
                          <FieldLabel>计费模式</FieldLabel>
                          <select
                            value={entry.billing_mode}
                            onChange={(e) =>
                              updatePricingEntry(index, {
                                billing_mode: e.target.value as PricingFormEntry['billing_mode'],
                              })
                            }
                            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                          >
                            <option value="token">Token</option>
                            <option value="per_request">按次</option>
                            <option value="image">图片按次</option>
                          </select>
                          {entry.intervals.length > 0 ? (
                            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">已保留 {entry.intervals.length} 个区间配置，本版暂不编辑区间。</p>
                          ) : null}
                        </div>
                      </div>

                      {entry.billing_mode === 'token' ? (
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                          <div>
                            <FieldLabel>输入价 ($/MTok)</FieldLabel>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={entry.input_price}
                              onChange={(e) => updatePricingEntry(index, { input_price: e.target.value })}
                              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                            />
                          </div>
                          <div>
                            <FieldLabel>输出价 ($/MTok)</FieldLabel>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={entry.output_price}
                              onChange={(e) => updatePricingEntry(index, { output_price: e.target.value })}
                              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                            />
                          </div>
                          <div>
                            <FieldLabel>缓存写入 ($/MTok)</FieldLabel>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={entry.cache_write_price}
                              onChange={(e) => updatePricingEntry(index, { cache_write_price: e.target.value })}
                              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                            />
                          </div>
                          <div>
                            <FieldLabel>缓存读取 ($/MTok)</FieldLabel>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={entry.cache_read_price}
                              onChange={(e) => updatePricingEntry(index, { cache_read_price: e.target.value })}
                              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                            />
                          </div>
                          <div>
                            <FieldLabel>图片输出 ($/MTok)</FieldLabel>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={entry.image_output_price}
                              onChange={(e) => updatePricingEntry(index, { image_output_price: e.target.value })}
                              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div>
                            <FieldLabel>{entry.billing_mode === 'image' ? '图片价格 ($)' : '单次价格 ($)'}</FieldLabel>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={entry.per_request_price}
                              onChange={(e) => updatePricingEntry(index, { per_request_price: e.target.value })}
                              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">将定价应用到账号统计</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">开启后，渠道定价也会参与账号统计口径。</div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      apply_pricing_to_account_stats: !prev.apply_pricing_to_account_stats,
                    }))
                  }
                  className={`relative inline-flex h-7 w-12 rounded-full transition ${
                    form.apply_pricing_to_account_stats ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                      form.apply_pricing_to_account_stats ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 px-7 py-5 dark:border-gray-800">
            <button
              type="button"
              onClick={closeModal}
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
              {submitting ? (editingChannel ? '保存中' : '创建中') : editingChannel ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </ModalShell>

      <ModalShell open={Boolean(deleteTarget)} title="删除渠道" onClose={() => setDeleteTarget(null)}>
        <div className="space-y-5 px-7 py-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            确认删除渠道 <span className="font-medium text-gray-900 dark:text-white">{deleteTarget?.name}</span> 吗？该操作不可撤销。
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
            onClick={() => void handleDelete()}
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
