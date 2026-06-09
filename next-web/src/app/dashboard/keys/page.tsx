'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Key, Plus, Copy, Trash2, Edit3, Search, RefreshCw } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { APIKeyFormModal } from '@/components/dashboard/api-key-form-modal';
import {
  createUserAPIKey,
  deleteUserAPIKey,
  listAvailableUserGroups,
  listUserAPIKeys,
  updateUserAPIKey,
  type UserAPIKey,
  type UserAPIKeyGroup,
} from '@/lib/user-api-keys';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function maskKey(value: string) {
  if (!value) return '';
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function buildStatusMeta(status: string, quota: number, quotaUsed: number, t: (key: string) => string) {
  if (status === 'inactive') {
    return {
      label: t('dashboard.pages.keys.inactive'),
      className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    };
  }
  if (quota > 0 && quotaUsed >= quota) {
    return {
      label: t('dashboard.pages.keys.exhausted'),
      className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };
  }
  return {
    label: t('dashboard.pages.keys.active'),
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  };
}

export default function KeysPage() {
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState('');
  const [keys, setKeys] = useState<UserAPIKey[]>([]);
  const [groups, setGroups] = useState<UserAPIKeyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedID, setCopiedID] = useState<number | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<UserAPIKey | null>(null);
  const [latestCreatedKey, setLatestCreatedKey] = useState('');

  const fetchGroups = useCallback(async () => {
    try {
      const result = await listAvailableUserGroups();
      setGroups(result);
    } catch (fetchError) {
      console.error('load available groups failed', fetchError);
    }
  }, []);

  const fetchKeys = useCallback(async (keyword: string, showRefreshing = false) => {
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const result = await listUserAPIKeys({
        page: 1,
        pageSize: 100,
        search: keyword,
      });
      setKeys(result.items);
    } catch (fetchError) {
      console.error('load user api keys failed', fetchError);
      setError(getErrorMessage(fetchError, t('dashboard.pages.keys.loadFailed')));
      setKeys([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchGroups();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchGroups]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchKeys(searchTerm);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [fetchKeys, searchTerm]);

  const groupMap = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);

  const openCreateModal = () => {
    setModalMode('create');
    setEditingKey(null);
    setModalOpen(true);
  };

  const openEditModal = (item: UserAPIKey) => {
    setModalMode('edit');
    setEditingKey(item);
    setModalOpen(true);
  };

  const handleCopy = async (item: UserAPIKey) => {
    try {
      await navigator.clipboard.writeText(item.key);
      setCopiedID(item.id);
      setSuccess(t('dashboard.pages.keys.copySuccess', { name: item.name }));
      window.setTimeout(() => setCopiedID((current) => (current === item.id ? null : current)), 2000);
    } catch (copyError) {
      setError(getErrorMessage(copyError, t('dashboard.pages.keys.copyFailed')));
    }
  };

  const handleDelete = async (item: UserAPIKey) => {
    const confirmed = window.confirm(t('dashboard.pages.keys.deleteConfirm', { name: item.name }));
    if (!confirmed) return;

    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await deleteUserAPIKey(item.id);
      setSuccess(t('dashboard.pages.keys.deleteSuccess'));
      setKeys((prev) => prev.filter((entry) => entry.id !== item.id));
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, t('dashboard.pages.keys.deleteFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (payload: {
    name: string;
    group_id: number | null;
    quota?: number;
    status?: 'active' | 'inactive';
  }) => {
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      if (modalMode === 'create') {
        const created = await createUserAPIKey({
          name: payload.name,
          group_id: payload.group_id,
          quota: payload.quota,
        });
        setLatestCreatedKey(created.key);
        setSuccess(t('dashboard.pages.keys.createSuccess'));
      } else if (editingKey) {
        await updateUserAPIKey(editingKey.id, {
          name: payload.name,
          group_id: payload.group_id,
          quota: payload.quota,
          status: payload.status,
        });
        setLatestCreatedKey('');
        setSuccess(t('dashboard.pages.keys.updateSuccess'));
      }

      setModalOpen(false);
      setEditingKey(null);
      await fetchKeys(searchTerm, true);
    } catch (submitError) {
      setError(
        getErrorMessage(
          submitError,
          modalMode === 'create' ? t('dashboard.pages.keys.createFailed') : t('dashboard.pages.keys.updateFailed')
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            <Key className="mr-2 h-6 w-6 text-blue-500" /> {t('dashboard.pages.keys.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.keys.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void fetchKeys(searchTerm, true)}
            disabled={refreshing || loading}
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-gray-200 dark:hover:bg-gray-900/50"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {t('dashboard.pages.keys.refresh')}
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" /> {t('dashboard.pages.keys.create')}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          {success}
        </div>
      ) : null}

      {latestCreatedKey ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
          <div className="font-medium">{t('dashboard.pages.keys.latestCreatedTitle')}</div>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="block rounded-lg bg-white px-3 py-2 font-mono text-xs text-gray-900 dark:bg-[#111111] dark:text-white">{latestCreatedKey}</code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(latestCreatedKey)}
              className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-medium text-blue-700 transition hover:bg-blue-100 dark:border-blue-800 dark:bg-[#111111] dark:text-blue-300 dark:hover:bg-blue-900/30"
            >
              <Copy className="mr-2 h-4 w-4" />
              {t('dashboard.pages.keys.copyNewKey')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder={t('dashboard.pages.keys.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="block w-full rounded-lg border border-gray-200 bg-white py-2 pr-3 pl-10 text-gray-900 transition-colors focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white sm:max-w-sm"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.keys.loading')}</div>
        ) : keys.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.keys.empty')}</div>
        ) : (
          <>
            <div className="block divide-y divide-gray-200 dark:divide-gray-800 sm:hidden">
              {keys.map((item) => {
                const statusMeta = buildStatusMeta(item.status, item.quota, item.quota_used, t);
                const group = item.group ?? (item.group_id != null ? groupMap.get(item.group_id) ?? null : null);
                return (
                  <div key={item.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">{item.name}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{group?.name || t('dashboard.pages.keys.unassignedGroup')}</div>
                      </div>
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2 text-sm font-mono text-gray-500 dark:bg-gray-900/50 dark:text-gray-400">
                      <span className="min-w-0 flex-1 truncate">{maskKey(item.key)}</span>
                      <button
                        type="button"
                        onClick={() => void handleCopy(item)}
                        className="text-gray-400 transition hover:text-gray-700 dark:hover:text-gray-200"
                        title={copiedID === item.id ? t('dashboard.pages.keys.copied') : t('dashboard.pages.keys.copy')}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span>{t('dashboard.pages.keys.quota')}: {item.quota > 0 ? formatMoney(item.quota) : t('dashboard.pages.keys.unlimited')}</span>
                      <span>{t('dashboard.pages.keys.used')}: {formatMoney(item.quota_used)}</span>
                      <span>{t('dashboard.pages.keys.createdAt')}: {formatDateTime(item.created_at)}</span>
                      <span>{t('dashboard.pages.keys.lastUsed')}: {formatDateTime(item.last_used_at)}</span>
                    </div>
                    <div className="flex justify-end gap-3 border-t border-gray-100 pt-2 dark:border-gray-800">
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        disabled={submitting}
                        className="text-blue-600 transition hover:text-blue-800 disabled:opacity-60 dark:text-blue-400 dark:hover:text-blue-300"
                        title={t('dashboard.pages.keys.edit')}
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(item)}
                        disabled={submitting}
                        className="text-red-600 transition hover:text-red-800 disabled:opacity-60 dark:text-red-400 dark:hover:text-red-300"
                        title={t('dashboard.pages.keys.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.keys.name')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.keys.key')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.keys.group')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.keys.quota')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.keys.used')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.keys.status')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.keys.lastUsed')}</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('dashboard.pages.keys.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-[#1A1A1A]">
                  {keys.map((item) => {
                    const statusMeta = buildStatusMeta(item.status, item.quota, item.quota_used, t);
                    const group = item.group ?? (item.group_id != null ? groupMap.get(item.group_id) ?? null : null);
                    return (
                      <tr key={item.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{item.name}</td>
                        <td className="px-6 py-4 text-sm font-mono text-gray-500 dark:text-gray-400">
                          <div className="flex items-center gap-2">
                            <span>{maskKey(item.key)}</span>
                            <button
                              type="button"
                              onClick={() => void handleCopy(item)}
                              className="text-gray-400 transition hover:text-gray-700 dark:hover:text-gray-200"
                              title={copiedID === item.id ? t('dashboard.pages.keys.copied') : t('dashboard.pages.keys.copy')}
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{group?.name || t('dashboard.pages.keys.unassignedGroup')}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{item.quota > 0 ? formatMoney(item.quota) : t('dashboard.pages.keys.unlimited')}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{formatMoney(item.quota_used)}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDateTime(item.last_used_at)}</td>
                        <td className="px-6 py-4 text-right text-sm font-medium">
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            disabled={submitting}
                            className="mr-4 text-blue-600 transition hover:text-blue-900 disabled:opacity-60 dark:text-blue-400 dark:hover:text-blue-300"
                            title={t('dashboard.pages.keys.edit')}
                          >
                            <Edit3 className="inline h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(item)}
                            disabled={submitting}
                            className="text-red-600 transition hover:text-red-900 disabled:opacity-60 dark:text-red-400 dark:hover:text-red-300"
                            title={t('dashboard.pages.keys.delete')}
                          >
                            <Trash2 className="inline h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {modalOpen ? (
        <APIKeyFormModal
          key={`${modalMode}-${editingKey?.id ?? 'new'}`}
          open={modalOpen}
          mode={modalMode}
          apiKey={editingKey}
          groups={groups}
          submitting={submitting}
          onClose={() => {
            setModalOpen(false);
            setEditingKey(null);
          }}
          onSubmit={handleSubmit}
        />
      ) : null}
    </div>
  );
}
