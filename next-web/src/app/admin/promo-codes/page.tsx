'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  Copy,
  Eye,
  Gift,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  createAdminPromoCode,
  deleteAdminPromoCode,
  listAdminPromoCodes,
  listAdminPromoCodeUsages,
  updateAdminPromoCode,
  type AdminPromoCode,
  type AdminPromoCodeUsage,
} from '@/lib/admin-api';
import { useI18n } from '@/i18n/use-i18n';

const PAGE_SIZE = 20;
const USAGES_PAGE_SIZE = 20;

type PromoFilters = {
  status: string;
};

type PromoFormState = {
  code: string;
  bonus_amount: string;
  max_uses: string;
  status: 'active' | 'disabled';
  expires_at_str: string;
  notes: string;
};

const DEFAULT_CREATE_FORM: PromoFormState = {
  code: '',
  bonus_amount: '1',
  max_uses: '0',
  status: 'active',
  expires_at_str: '',
  notes: '',
};

const DEFAULT_EDIT_FORM: PromoFormState = {
  code: '',
  bonus_amount: '0',
  max_uses: '0',
  status: 'active',
  expires_at_str: '',
  notes: '',
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale);
}

function toDatetimeLocalValue(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toUnixSeconds(value: string) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.floor(timestamp / 1000);
}

function sortIndicator(active: boolean, order: 'asc' | 'desc') {
  return (
    <ArrowUpDown
      className={`h-4 w-4 transition ${active ? 'text-emerald-600 dark:text-emerald-300' : 'text-gray-300 dark:text-gray-600'} ${
        active && order === 'desc' ? 'rotate-180' : ''
      }`}
    />
  );
}

function isExpired(code: AdminPromoCode) {
  if (!code.expires_at) return false;
  const expiresAt = new Date(code.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt < Date.now();
}

function isMaxUsed(code: AdminPromoCode) {
  return code.max_uses > 0 && code.used_count >= code.max_uses;
}

function promoStatusLabel(code: AdminPromoCode, t: (key: string) => string) {
  if (isExpired(code)) return t('admin.promoCodes.states.expired');
  if (isMaxUsed(code)) return t('admin.promoCodes.states.maxUsed');
  return code.status === 'active' ? t('admin.promoCodes.states.active') : t('admin.promoCodes.states.disabled');
}

function promoStatusBadgeClass(code: AdminPromoCode) {
  if (isExpired(code)) {
    return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300';
  }
  if (isMaxUsed(code)) {
    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
  return code.status === 'active'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
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

function ActionIconButton({
  title,
  className,
  onClick,
  children,
}: {
  title: string;
  className: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center justify-center rounded-xl p-2 transition ${className}`}
    >
      {children}
    </button>
  );
}

export default function AdminPromoCodesPage() {
  const { locale, t } = useI18n();
  const [codes, setCodes] = useState<AdminPromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [usagesLoading, setUsagesLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [filters, setFilters] = useState<PromoFilters>({ status: '' });
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [sortState, setSortState] = useState<{ key: string; order: 'asc' | 'desc' }>({
    key: 'created_at',
    order: 'desc',
  });
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showUsagesDialog, setShowUsagesDialog] = useState(false);
  const [createForm, setCreateForm] = useState<PromoFormState>(DEFAULT_CREATE_FORM);
  const [editForm, setEditForm] = useState<PromoFormState>(DEFAULT_EDIT_FORM);
  const [editingCode, setEditingCode] = useState<AdminPromoCode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminPromoCode | null>(null);
  const [viewingCode, setViewingCode] = useState<AdminPromoCode | null>(null);
  const [usages, setUsages] = useState<AdminPromoCodeUsage[]>([]);
  const [usagesPagination, setUsagesPagination] = useState({ page: 1, pageSize: USAGES_PAGE_SIZE, total: 0 });

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.pageSize || PAGE_SIZE)));
  const usageTotalPages = Math.max(
    1,
    Math.ceil((usagesPagination.total || 0) / (usagesPagination.pageSize || USAGES_PAGE_SIZE))
  );

  const loadCodes = useCallback(
    async (page = 1, nextSearch = search, nextFilters = filters, nextSort = sortState) => {
      setLoading(true);
      setError('');
      try {
        const result = await listAdminPromoCodes({
          page,
          page_size: pagination.pageSize,
          search: nextSearch || undefined,
          status: nextFilters.status || undefined,
          sort_by: nextSort.key,
          sort_order: nextSort.order,
        });
        setCodes(result.items);
        setPagination((prev) => ({
          ...prev,
          page: result.page || page,
          pageSize: result.pageSize || prev.pageSize,
          total: result.total || 0,
        }));
      } catch (loadError: unknown) {
        setError(getErrorMessage(loadError, t('admin.promoCodes.messages.loadFailed')));
      } finally {
        setLoading(false);
      }
    },
    [filters, pagination.pageSize, search, sortState, t]
  );

  const loadUsages = useCallback(
    async (codeId: number, page = 1) => {
      setUsagesLoading(true);
      setError('');
      try {
        const result = await listAdminPromoCodeUsages(codeId, {
          page,
          page_size: usagesPagination.pageSize,
        });
        setUsages(result.items);
        setUsagesPagination((prev) => ({
          ...prev,
          page: result.page || page,
          pageSize: result.pageSize || prev.pageSize,
          total: result.total || 0,
        }));
      } catch (loadError: unknown) {
        setError(getErrorMessage(loadError, t('admin.promoCodes.messages.loadUsagesFailed')));
      } finally {
        setUsagesLoading(false);
      }
    },
    [t, usagesPagination.pageSize]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCodes(1, search, filters, sortState);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [filters, loadCodes, search, sortState]);

  const handleSort = (key: string) => {
    setSortState((prev) => ({
      key,
      order: prev.key === key && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleCopy = async (text: string, successMessage = t('admin.promoCodes.actions.copied')) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(text);
      setSuccess(successMessage);
      window.setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      setError(t('admin.promoCodes.actions.copyFailed'));
    }
  };

  const resetCreateDialog = () => {
    setCreateForm(DEFAULT_CREATE_FORM);
    setShowCreateDialog(false);
  };

  const resetEditDialog = () => {
    setEditingCode(null);
    setEditForm(DEFAULT_EDIT_FORM);
    setShowEditDialog(false);
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const bonusAmount = Number(createForm.bonus_amount);
    const maxUses = Number(createForm.max_uses);
    if (!Number.isFinite(bonusAmount) || bonusAmount < 0) {
      setError(t('admin.promoCodes.messages.amountInvalid'));
      return;
    }
    if (!Number.isInteger(maxUses) || maxUses < 0) {
      setError(t('admin.promoCodes.messages.maxUsesInvalid'));
      return;
    }

    setCreating(true);
    setError('');
    setSuccess('');
    try {
      await createAdminPromoCode({
        code: createForm.code.trim() || undefined,
        bonus_amount: bonusAmount,
        max_uses: maxUses,
        expires_at: toUnixSeconds(createForm.expires_at_str),
        notes: createForm.notes.trim() || undefined,
      });
      resetCreateDialog();
      setSuccess(t('admin.promoCodes.messages.createSuccess'));
      await loadCodes(1);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError, t('admin.promoCodes.messages.createFailed')));
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEdit = (code: AdminPromoCode) => {
    setEditingCode(code);
    setEditForm({
      code: code.code,
      bonus_amount: String(code.bonus_amount ?? 0),
      max_uses: String(code.max_uses ?? 0),
      status: code.status === 'disabled' ? 'disabled' : 'active',
      expires_at_str: toDatetimeLocalValue(code.expires_at),
      notes: code.notes || '',
    });
    setShowEditDialog(true);
  };

  const handleUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingCode) return;

    const bonusAmount = Number(editForm.bonus_amount);
    const maxUses = Number(editForm.max_uses);
    if (!Number.isFinite(bonusAmount) || bonusAmount < 0) {
      setError(t('admin.promoCodes.messages.amountInvalid'));
      return;
    }
    if (!Number.isInteger(maxUses) || maxUses < 0) {
      setError(t('admin.promoCodes.messages.maxUsesInvalid'));
      return;
    }

    setUpdating(true);
    setError('');
    setSuccess('');
    try {
      await updateAdminPromoCode(editingCode.id, {
        code: editForm.code.trim(),
        bonus_amount: bonusAmount,
        max_uses: maxUses,
        status: editForm.status,
        expires_at: editForm.expires_at_str ? toUnixSeconds(editForm.expires_at_str) : 0,
        notes: editForm.notes,
      });
      resetEditDialog();
      setSuccess(t('admin.promoCodes.messages.updateSuccess'));
      await loadCodes(pagination.page);
    } catch (updateError: unknown) {
      setError(getErrorMessage(updateError, t('admin.promoCodes.messages.updateFailed')));
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenDelete = (code: AdminPromoCode) => {
    setDeleteTarget(code);
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    setError('');
    setSuccess('');
    try {
      await deleteAdminPromoCode(deleteTarget.id);
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      setSuccess(t('admin.promoCodes.messages.deleteSuccess'));
      await loadCodes(pagination.page);
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError, t('admin.promoCodes.messages.deleteFailed')));
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyRegisterLink = async (code: AdminPromoCode) => {
    const registerLink = `${window.location.origin}/register?promo=${encodeURIComponent(code.code)}`;
    await handleCopy(registerLink, t('admin.promoCodes.actions.registerLinkCopied'));
  };

  const handleOpenUsages = async (code: AdminPromoCode) => {
    setViewingCode(code);
    setUsages([]);
    setUsagesPagination((prev) => ({ ...prev, page: 1, total: 0 }));
    setShowUsagesDialog(true);
    await loadUsages(code.id, 1);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-[linear-gradient(135deg,rgba(232,250,245,0.92),rgba(238,246,252,0.92))] p-5 shadow-sm ring-1 ring-gray-200/70 dark:bg-[#161616] dark:ring-gray-800">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('admin.promoCodes.searchPlaceholder')}
                className="h-12 w-full rounded-2xl border border-white/70 bg-white/85 pl-10 pr-4 text-sm text-gray-700 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#101010] dark:text-white"
              />
            </div>
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="h-12 min-w-[140px] rounded-2xl border border-white/70 bg-white/85 px-4 text-sm text-gray-700 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#101010] dark:text-white"
            >
              <option value="">{t('admin.promoCodes.allStatus')}</option>
              <option value="active">{t('admin.promoCodes.active')}</option>
              <option value="disabled">{t('admin.promoCodes.disabled')}</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void loadCodes(pagination.page)}
              disabled={loading}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-[#121212] dark:text-gray-200 dark:hover:bg-gray-900"
              title={t('admin.promoCodes.refresh')}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setShowCreateDialog(true)}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-500 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('admin.promoCodes.create')}
            </button>
          </div>
        </div>
      </section>

      {(error || success) && (
        <div className="space-y-3">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/20 dark:text-emerald-300">
              {success}
            </div>
          )}
        </div>
      )}

      <section className="overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#111111]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-[#171717] dark:text-gray-400">
              <tr>
                <th className="px-4 py-4 text-left">{t('admin.promoCodes.table.code')}</th>
                <th className="px-4 py-4 text-left">
                  <button type="button" onClick={() => handleSort('bonus_amount')} className="inline-flex items-center gap-2">
                    {t('admin.promoCodes.table.bonusAmount')}
                    {sortIndicator(sortState.key === 'bonus_amount', sortState.order)}
                  </button>
                </th>
                <th className="px-4 py-4 text-left">{t('admin.promoCodes.table.usage')}</th>
                <th className="px-4 py-4 text-left">
                  <button type="button" onClick={() => handleSort('status')} className="inline-flex items-center gap-2">
                    {t('admin.promoCodes.table.status')}
                    {sortIndicator(sortState.key === 'status', sortState.order)}
                  </button>
                </th>
                <th className="px-4 py-4 text-left">
                  <button type="button" onClick={() => handleSort('expires_at')} className="inline-flex items-center gap-2">
                    {t('admin.promoCodes.table.expiresAt')}
                    {sortIndicator(sortState.key === 'expires_at', sortState.order)}
                  </button>
                </th>
                <th className="px-4 py-4 text-left">
                  <button type="button" onClick={() => handleSort('created_at')} className="inline-flex items-center gap-2">
                    {t('admin.promoCodes.table.createdAt')}
                    {sortIndicator(sortState.key === 'created_at', sortState.order)}
                  </button>
                </th>
                <th className="px-4 py-4 text-left">{t('admin.promoCodes.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {!loading &&
                codes.map((code) => (
                  <tr key={code.id} className="align-top text-gray-700 dark:text-gray-200">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm text-gray-900 dark:text-gray-100">{code.code}</code>
                        <button
                          type="button"
                          onClick={() => void handleCopy(code.code)}
                          className={`rounded-lg p-1 transition ${
                            copiedCode === code.code
                              ? 'text-emerald-600 dark:text-emerald-300'
                              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300'
                          }`}
                          title={copiedCode === code.code ? t('admin.promoCodes.actions.copied') : t('admin.promoCodes.actions.copy')}
                        >
                          {copiedCode === code.code ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-medium text-gray-900 dark:text-white">${Number(code.bonus_amount || 0).toFixed(2)}</td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">
                      {code.used_count} / {code.max_uses === 0 ? '∞' : code.max_uses}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${promoStatusBadgeClass(code)}`}>
                        {promoStatusLabel(code, t)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">
                      {code.expires_at ? formatDateTime(code.expires_at, locale) : t('admin.promoCodes.states.neverExpires')}
                    </td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400">{formatDateTime(code.created_at, locale)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1">
                        <ActionIconButton
                          title={t('admin.promoCodes.actions.copyRegisterLink')}
                          onClick={() => void handleCopyRegisterLink(code)}
                          className="text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
                        >
                          <Link2 className="h-4 w-4" />
                        </ActionIconButton>
                        <ActionIconButton
                          title={t('admin.promoCodes.actions.viewUsages')}
                          onClick={() => void handleOpenUsages(code)}
                          className="text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-300"
                        >
                          <Eye className="h-4 w-4" />
                        </ActionIconButton>
                        <ActionIconButton
                          title={t('admin.promoCodes.actions.edit')}
                          onClick={() => handleOpenEdit(code)}
                          className="text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                        >
                          <Pencil className="h-4 w-4" />
                        </ActionIconButton>
                        <ActionIconButton
                          title={t('admin.promoCodes.actions.delete')}
                          onClick={() => handleOpenDelete(code)}
                          className="text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </ActionIconButton>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {loading ? (
          <div className="flex items-center justify-center px-6 py-20 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('admin.promoCodes.loadingList')}
          </div>
        ) : codes.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-600">
              <Gift className="h-9 w-9" />
            </div>
            <div className="text-2xl font-semibold text-gray-900 dark:text-white">{t('admin.promoCodes.emptyTitle')}</div>
            <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('admin.promoCodes.emptyDescription')}</div>
            <button
              type="button"
              onClick={() => setShowCreateDialog(true)}
              className="mt-8 inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-500 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('admin.promoCodes.create')}
            </button>
          </div>
        ) : (
          <div className="border-t border-gray-100 px-6 py-4 dark:border-gray-800">
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <div>
                {t('admin.promoCodes.pageInfo', {
                  page: pagination.page,
                  totalPages,
                  total: pagination.total,
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadCodes(Math.max(1, pagination.page - 1))}
                  disabled={pagination.page <= 1}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
                >
                  {t('admin.promoCodes.prevPage')}
                </button>
                <button
                  type="button"
                  onClick={() => void loadCodes(Math.min(totalPages, pagination.page + 1))}
                  disabled={pagination.page >= totalPages}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
                >
                  {t('admin.promoCodes.nextPage')}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <ModalShell open={showCreateDialog} title={t('admin.promoCodes.dialogs.createTitle')} onClose={resetCreateDialog} maxWidth="max-w-3xl">
        <form onSubmit={handleCreate} className="space-y-5 px-6 py-6">
          <div>
            <FieldLabel>
              {t('admin.promoCodes.form.code')} <span className="text-xs font-normal text-gray-400">{t('admin.promoCodes.form.autoGenerateHint')}</span>
            </FieldLabel>
            <input
              value={createForm.code}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
              placeholder={t('admin.promoCodes.form.codePlaceholder')}
              className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 font-mono text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>{t('admin.promoCodes.form.bonusAmount')}</FieldLabel>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={createForm.bonus_amount}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, bonus_amount: e.target.value }))}
              className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>
              {t('admin.promoCodes.form.maxUses')} <span className="text-xs font-normal text-gray-400">{t('admin.promoCodes.form.unlimitedHint')}</span>
            </FieldLabel>
            <input
              type="number"
              min="0"
              value={createForm.max_uses}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, max_uses: e.target.value }))}
              className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>
              {t('admin.promoCodes.form.expiresAt')} <span className="text-xs font-normal text-gray-400">{t('admin.promoCodes.form.optionalHint')}</span>
            </FieldLabel>
            <input
              type="datetime-local"
              value={createForm.expires_at_str}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, expires_at_str: e.target.value }))}
              className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>
              {t('admin.promoCodes.form.notes')} <span className="text-xs font-normal text-gray-400">{t('admin.promoCodes.form.optionalHint')}</span>
            </FieldLabel>
            <textarea
              rows={3}
              value={createForm.notes}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder={t('admin.promoCodes.form.notesPlaceholder')}
              className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            />
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
            <button
              type="button"
              onClick={resetCreateDialog}
              className="rounded-2xl border border-gray-200 px-5 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
            >
              {t('admin.promoCodes.form.cancel')}
            </button>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('admin.promoCodes.form.confirmCreate')}
            </button>
          </div>
        </form>
      </ModalShell>

      <ModalShell open={showEditDialog} title={t('admin.promoCodes.dialogs.editTitle')} onClose={resetEditDialog} maxWidth="max-w-3xl">
        <form onSubmit={handleUpdate} className="space-y-5 px-6 py-6">
          <div>
            <FieldLabel>{t('admin.promoCodes.form.code')}</FieldLabel>
            <input
              value={editForm.code}
              onChange={(e) => setEditForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
              className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 font-mono text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>{t('admin.promoCodes.form.bonusAmount')}</FieldLabel>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={editForm.bonus_amount}
              onChange={(e) => setEditForm((prev) => ({ ...prev, bonus_amount: e.target.value }))}
              className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>
              {t('admin.promoCodes.form.maxUses')} <span className="text-xs font-normal text-gray-400">{t('admin.promoCodes.form.unlimitedHint')}</span>
            </FieldLabel>
            <input
              type="number"
              min="0"
              value={editForm.max_uses}
              onChange={(e) => setEditForm((prev) => ({ ...prev, max_uses: e.target.value }))}
              className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>{t('admin.promoCodes.form.status')}</FieldLabel>
            <select
              value={editForm.status}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, status: e.target.value as PromoFormState['status'] }))
              }
              className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            >
              <option value="active">{t('admin.promoCodes.active')}</option>
              <option value="disabled">{t('admin.promoCodes.disabled')}</option>
            </select>
          </div>
          <div>
            <FieldLabel>
              {t('admin.promoCodes.form.expiresAt')} <span className="text-xs font-normal text-gray-400">{t('admin.promoCodes.form.optionalHint')}</span>
            </FieldLabel>
            <input
              type="datetime-local"
              value={editForm.expires_at_str}
              onChange={(e) => setEditForm((prev) => ({ ...prev, expires_at_str: e.target.value }))}
              className="h-12 w-full rounded-2xl border border-gray-200 bg-transparent px-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <FieldLabel>
              {t('admin.promoCodes.form.notes')} <span className="text-xs font-normal text-gray-400">{t('admin.promoCodes.form.optionalHint')}</span>
            </FieldLabel>
            <textarea
              rows={3}
              value={editForm.notes}
              onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:text-white"
            />
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
            <button
              type="button"
              onClick={resetEditDialog}
              className="rounded-2xl border border-gray-200 px-5 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
            >
              {t('admin.promoCodes.form.cancel')}
            </button>
            <button
              type="submit"
              disabled={updating}
              className="inline-flex items-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {updating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('admin.promoCodes.form.confirmSave')}
            </button>
          </div>
        </form>
      </ModalShell>

      <ModalShell
        open={showUsagesDialog}
        title={
          viewingCode
            ? t('admin.promoCodes.dialogs.usagesTitleWithCode', { code: viewingCode.code })
            : t('admin.promoCodes.dialogs.usagesTitle')
        }
        onClose={() => setShowUsagesDialog(false)}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-5 px-6 py-6">
          {usagesLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('admin.promoCodes.usages.loading')}
            </div>
          ) : usages.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">{t('admin.promoCodes.usages.empty')}</div>
          ) : (
            <>
              <div className="space-y-3">
                {usages.map((usage) => (
                  <div
                    key={usage.id}
                    className="flex items-center justify-between rounded-2xl border border-gray-200 p-4 dark:border-gray-800"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {usage.user?.email || t('admin.promoCodes.usages.userFallback', { id: usage.user_id })}
                      </div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(usage.used_at, locale)}</div>
                    </div>
                    <div className="text-sm font-medium text-emerald-600 dark:text-emerald-300">
                      +${Number(usage.bonus_amount || 0).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 pt-5 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <div>
                  {t('admin.promoCodes.pageInfo', {
                    page: usagesPagination.page,
                    totalPages: usageTotalPages,
                    total: usagesPagination.total,
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => viewingCode && void loadUsages(viewingCode.id, Math.max(1, usagesPagination.page - 1))}
                    disabled={usagesPagination.page <= 1}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
                  >
                    {t('admin.promoCodes.prevPage')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      viewingCode && void loadUsages(viewingCode.id, Math.min(usageTotalPages, usagesPagination.page + 1))
                    }
                    disabled={usagesPagination.page >= usageTotalPages}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
                  >
                    {t('admin.promoCodes.nextPage')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </ModalShell>

      <ModalShell open={showDeleteDialog} title={t('admin.promoCodes.dialogs.deleteTitle')} onClose={() => setShowDeleteDialog(false)} maxWidth="max-w-xl">
        <div className="space-y-5 px-6 py-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t('admin.promoCodes.dialogs.deleteMessage', { code: deleteTarget?.code || '' })}
          </p>
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setShowDeleteDialog(false)}
              className="rounded-2xl border border-gray-200 px-5 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
            >
              {t('admin.promoCodes.form.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="inline-flex items-center rounded-2xl bg-red-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-60"
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('admin.promoCodes.form.confirmDelete')}
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
