'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import {
  createAdminChannel,
  deleteAdminChannel,
  getAdminChannel,
  listAdminChannels,
  listAdminGroups,
  updateAdminChannel,
  type AdminChannel,
  type AdminGroup,
} from '@/lib/admin-api';
import {
  fetchDomesticChannelModels,
  testDomesticChannelConnection,
  testDomesticChannelMessages,
  testDomesticChannelResponses,
  type DomesticChannelDiagnosticPayload,
} from '@/lib/admin-domestic-channel-api';
import {
  DomesticChannelFormModal,
  type DomesticChannelPayload,
  type DomesticChannelTestPayload,
} from '@/components/admin/domestic-channel-form-modal';

const PAGE_SIZE = 20;
const PROVIDER_OPTIONS = [
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'qwen', label: 'Qwen' },
  { key: 'doubao', label: 'Doubao' },
  { key: 'zhipu', label: 'Zhipu' },
  { key: 'openai_compat_domestic', label: 'OpenAI Compatible' },
  { key: 'custom_domestic', label: 'Custom Domestic' },
] as const;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function SimpleModal({
  open,
  title,
  children,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-[#111111]">
        <div className="border-b border-gray-200 px-7 py-6 dark:border-gray-800">
          <h3 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h3>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AdminDomesticChannelsPage() {
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
  const [deleteTarget, setDeleteTarget] = useState<AdminChannel | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

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
            provider_scope: 'domestic',
            sort_by: 'created_at',
            sort_order: 'desc',
          }),
          groups.length > 0
            ? Promise.resolve({ items: groups, total: groups.length, page: 1, pageSize: groups.length })
            : listAdminGroups({ page: 1, page_size: 500 }),
        ]);
        setChannels(channelResult.items);
        setGroups(groupResult.items);
        setPagination({
          page: channelResult.page || page,
          pageSize: channelResult.pageSize || PAGE_SIZE,
          total: channelResult.total,
        });
      } catch (loadError: unknown) {
        setError(getErrorMessage(loadError, '加载接口配置失败'));
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
    setShowModal(true);
    if (groups.length === 0) {
      try {
        const result = await listAdminGroups({ page: 1, page_size: 500 });
        setGroups(result.items);
      } catch {
        // ignore
      }
    }
  };

  const openEditModal = async (channel: AdminChannel) => {
    setError('');
    try {
      if (groups.length === 0) {
        const groupResult = await listAdminGroups({ page: 1, page_size: 500 });
        setGroups(groupResult.items);
      }
      const detail = await getAdminChannel(channel.id);
      setEditingChannel(detail);
      setShowModal(true);
    } catch (editError: unknown) {
      setError(getErrorMessage(editError, '加载接口详情失败'));
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingChannel(null);
  };

  const handleSubmit = async (payload: DomesticChannelPayload) => {
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      if (editingChannel) {
        await updateAdminChannel(editingChannel.id, payload);
        setSuccess('接口更新成功');
      } else {
        await createAdminChannel(payload);
        setSuccess('接口创建成功');
      }
      closeModal();
      await loadChannels(editingChannel ? pagination.page : 1);
    } catch (submitError: unknown) {
      throw new Error(getErrorMessage(submitError, editingChannel ? '更新接口失败' : '创建接口失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestConnection = async (payload: DomesticChannelTestPayload) => {
    return await testDomesticChannelConnection(payload);
  };

  const handleTestMessages = async (payload: DomesticChannelTestPayload) => {
    return await testDomesticChannelMessages(payload as DomesticChannelDiagnosticPayload);
  };

  const handleTestResponses = async (payload: DomesticChannelTestPayload) => {
    return await testDomesticChannelResponses(payload as DomesticChannelDiagnosticPayload);
  };

  const handleFetchModels = async (payload: DomesticChannelTestPayload) => {
    return await fetchDomesticChannelModels(payload as DomesticChannelDiagnosticPayload);
  };

  const handleToggleStatus = async (channel: AdminChannel) => {
    try {
      const nextStatus = channel.status === 'active' ? 'disabled' : 'active';
      await updateAdminChannel(channel.id, { status: nextStatus });
      setSuccess(nextStatus === 'active' ? '接口已启用' : '接口已停用');
      await loadChannels(pagination.page);
    } catch (statusError: unknown) {
      setError(getErrorMessage(statusError, '更新接口状态失败'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await deleteAdminChannel(deleteTarget.id);
      setSuccess('接口已删除');
      setDeleteTarget(null);
      await loadChannels(Math.max(1, pagination.page));
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError, '删除接口失败'));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">接口管理</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">独立维护国内官方 API 接口上游配置，模型会同步汇总到模型速览。</p>
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
              placeholder="搜索接口..."
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
              创建接口
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
          第 {pagination.page} / {totalPages} 页，共 {pagination.total} 个接口配置
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr className="text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">描述</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">分组</th>
                <th className="px-4 py-3 font-medium">Base URL</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    正在加载接口配置...
                  </td>
                </tr>
              ) : channels.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    暂无接口配置数据
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
                        {PROVIDER_OPTIONS.find((item) => item.key === (channel.provider_type || 'deepseek'))?.label ||
                          channel.provider_type ||
                          '接口配置'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                        {(channel.group_ids || []).length} 个分组
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs text-gray-500 dark:text-gray-400">
                      {(channel.provider_config?.base_url as string) || '-'}
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
            第 {pagination.page} / {totalPages} 页，共 {pagination.total} 个接口配置
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

      {showModal ? (
        <DomesticChannelFormModal
          key={editingChannel ? `edit-${editingChannel.id}` : 'create-domestic-channel'}
          open={showModal}
          channel={editingChannel}
          groups={groups}
          submitting={submitting}
          onClose={closeModal}
          onSubmit={handleSubmit}
          onTestConnection={handleTestConnection}
          onTestMessages={handleTestMessages}
          onTestResponses={handleTestResponses}
          onFetchModels={handleFetchModels}
        />
      ) : null}

      <SimpleModal open={Boolean(deleteTarget)} title="删除接口">
        <div className="space-y-5 px-7 py-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            确认删除接口 <span className="font-medium text-gray-900 dark:text-white">{deleteTarget?.name}</span> 吗？该操作不可撤销。
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
            {deleteSubmitting ? '删除中...' : '确认删除'}
          </button>
        </div>
      </SimpleModal>
    </div>
  );
}
