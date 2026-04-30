'use client';

import { FormEvent, ReactNode, useEffect, useState } from 'react';
import {
  aiTranslateAdminNews,
  createAdminNews,
  deleteAdminNews,
  listAdminNews,
  type AdminNewsPost,
  type AdminNewsTranslation,
  updateAdminNews,
} from '@/lib/admin-api';
import { useI18n } from '@/i18n/use-i18n';

const NEWS_LOCALE_OPTIONS = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR', 'zh-TW', 'fr-FR', 'de-DE'];

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function getPrimaryTranslation(item: AdminNewsPost): AdminNewsTranslation | undefined {
  return (
    item.translations.find((translation) => translation.locale === item.default_locale) ||
    item.translations[0]
  );
}

function toUnixSeconds(value: string) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return Math.floor(date.getTime() / 1000);
}

function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) {
    return '-';
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getStatusLabel(status: string, t: (key: string, params?: Record<string, unknown>) => string) {
  const key = `admin.news.statusOptions.${status}`;
  const label = t(key);
  return label === key ? status : label;
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'published':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300';
    case 'draft':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300';
    case 'archived':
      return 'border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300';
  }
}

function hashText(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').slice(0, 8);
}

function generateSlugFromTitle(title: string) {
  const trimmed = title.trim();
  if (!trimmed) {
    return '';
  }

  const normalized = trimmed
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 72);

  if (normalized) {
    return normalized;
  }

  return `news-${hashText(trimmed)}`;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getContentPreview(value: string) {
  const plainText = stripHtml(value);
  if (plainText.length <= 160) {
    return plainText;
  }
  return `${plainText.slice(0, 160)}...`;
}

function toDatetimeLocalValue(value?: string | null) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
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
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-[#111111]">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5 dark:border-gray-800">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {String.fromCharCode(0x5173, 0x95ed)}
          </button>
        </div>
        <div className="max-h-[calc(92vh-84px)] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

type NewsFormState = {
  slug: string;
  default_locale: string;
  status: string;
  title: string;
  summary: string;
  content: string;
  author_name: string;
  cover_image_url: string;
  published_at: string;
};

type NewsTranslationFormState = {
  locale: string;
  title: string;
  summary: string;
  content: string;
  seo_title: string;
  seo_description: string;
  translation_status: string;
};

type NewsEditFormState = {
  slug: string;
  default_locale: string;
  status: string;
  author_name: string;
  cover_image_url: string;
  published_at: string;
  translations: NewsTranslationFormState[];
};

const DEFAULT_FORM: NewsFormState = {
  slug: '',
  default_locale: 'zh-CN',
  status: 'published',
  title: '',
  summary: '',
  content: '',
  author_name: '',
  cover_image_url: '',
  published_at: '',
};

function sortTranslations(translations: NewsTranslationFormState[], defaultLocale: string) {
  return [...translations].sort((a, b) => {
    if (a.locale === defaultLocale) return -1;
    if (b.locale === defaultLocale) return 1;
    return a.locale.localeCompare(b.locale);
  });
}

function translationFormFromNewsTranslation(item: AdminNewsTranslation): NewsTranslationFormState {
  return {
    locale: item.locale,
    title: item.title || '',
    summary: item.summary || '',
    content: item.content || '',
    seo_title: item.seo_title || '',
    seo_description: item.seo_description || '',
    translation_status: item.translation_status || 'manual',
  };
}

function editFormFromNews(item: AdminNewsPost): NewsEditFormState {
  return {
    slug: item.slug,
    default_locale: item.default_locale,
    status: item.status,
    author_name: item.author_name || '',
    cover_image_url: item.cover_image_url || '',
    published_at: toDatetimeLocalValue(item.published_at),
    translations: sortTranslations(item.translations.map(translationFormFromNewsTranslation), item.default_locale),
  };
}

function getTranslationByLocale(translations: NewsTranslationFormState[], locale: string) {
  return translations.find((item) => item.locale === locale);
}

export default function AdminNewsPage() {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<AdminNewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [translatingLocale, setTranslatingLocale] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editSlugEdited, setEditSlugEdited] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminNewsPost | null>(null);
  const [selectedEditLocale, setSelectedEditLocale] = useState('zh-CN');
  const [newEditLocale, setNewEditLocale] = useState('en-US');
  const [aiSourceLocale, setAISourceLocale] = useState('zh-CN');
  const [form, setForm] = useState<NewsFormState>(DEFAULT_FORM);
  const [editForm, setEditForm] = useState<NewsEditFormState>({
    slug: '',
    default_locale: 'zh-CN',
    status: 'published',
    author_name: '',
    cover_image_url: '',
    published_at: '',
    translations: [],
  });

  const loadNews = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listAdminNews({ page: 1, page_size: 20 });
      setItems(result.items);
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('admin.news.loadFailed')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const result = await listAdminNews({ page: 1, page_size: 20 });
        if (cancelled) {
          return;
        }
        setItems(result.items);
        setError('');
      } catch (err: unknown) {
        if (cancelled) {
          return;
        }
        setError(getErrorMessage(err, t('admin.news.loadFailed')));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await createAdminNews({
        slug: form.slug,
        status: form.status,
        default_locale: form.default_locale,
        author_name: form.author_name || null,
        cover_image_url: form.cover_image_url || null,
        published_at: toUnixSeconds(form.published_at),
        translations: [
          {
            locale: form.default_locale,
            title: form.title,
            summary: form.summary,
            content: form.content,
            translation_status: 'manual',
          },
        ],
      });

      setForm((prev) => ({
        ...DEFAULT_FORM,
        default_locale: prev.default_locale,
      }));
      setSlugEdited(false);
      setSuccess(t('admin.news.messages.createSuccess'));
      await loadNews();
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('admin.news.createFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = (item: AdminNewsPost) => {
    setEditingItem(item);
    const nextForm = editFormFromNews(item);
    setEditForm(nextForm);
    setEditSlugEdited(false);
    setSelectedEditLocale(nextForm.default_locale);
    setAISourceLocale(nextForm.default_locale);
    setNewEditLocale(
      NEWS_LOCALE_OPTIONS.find((candidate) => !nextForm.translations.some((translation) => translation.locale === candidate)) ||
        'en-US'
    );
    setShowEditDialog(true);
    setError('');
    setSuccess('');
  };

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingItem) {
      return;
    }

    setUpdating(true);
    setError('');
    setSuccess('');
    try {
      await updateAdminNews(editingItem.id, {
        slug: editForm.slug,
        status: editForm.status,
        default_locale: editForm.default_locale,
        author_name: editForm.author_name || null,
        cover_image_url: editForm.cover_image_url || null,
        published_at: toUnixSeconds(editForm.published_at),
        translations: editForm.translations.map((translation) => ({
          locale: translation.locale,
          title: translation.title,
          summary: translation.summary,
          content: translation.content,
          seo_title: translation.seo_title || null,
          seo_description: translation.seo_description || null,
          translation_status: translation.translation_status || 'manual',
        })),
      });
      setSuccess(t('admin.news.messages.updateSuccess'));
      setShowEditDialog(false);
      setEditingItem(null);
      await loadNews();
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('admin.news.messages.updateFailed')));
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (item: AdminNewsPost) => {
    const confirmed = window.confirm(t('admin.news.messages.deleteConfirm', { title: item.slug }));
    if (!confirmed) {
      return;
    }

    setDeletingId(item.id);
    setError('');
    setSuccess('');
    try {
      await deleteAdminNews(item.id);
      setSuccess(t('admin.news.messages.deleteSuccess'));
      await loadNews();
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('admin.news.messages.deleteFailed')));
    } finally {
      setDeletingId(null);
    }
  };

  const selectedTranslation = getTranslationByLocale(editForm.translations, selectedEditLocale);

  const updateSelectedTranslation = (patch: Partial<NewsTranslationFormState>) => {
    setEditForm((prev) => ({
      ...prev,
      translations: prev.translations.map((translation) => {
        if (translation.locale !== selectedEditLocale) {
          return translation;
        }
        return {
          ...translation,
          ...patch,
        };
      }),
    }));
  };

  const addTranslationLocale = () => {
    const localeToAdd = newEditLocale.trim();
    if (!localeToAdd) {
      return;
    }
    if (editForm.translations.some((translation) => translation.locale === localeToAdd)) {
      setSelectedEditLocale(localeToAdd);
      return;
    }
    setEditForm((prev) => ({
      ...prev,
      translations: sortTranslations(
        [
          ...prev.translations,
          {
            locale: localeToAdd,
            title: '',
            summary: '',
            content: '',
            seo_title: '',
            seo_description: '',
            translation_status: 'manual',
          },
        ],
        prev.default_locale
      ),
    }));
    setSelectedEditLocale(localeToAdd);
  };

  const removeSelectedTranslation = () => {
    if (!selectedTranslation || selectedTranslation.locale === editForm.default_locale || editForm.translations.length <= 1) {
      return;
    }
    setEditForm((prev) => ({
      ...prev,
      translations: prev.translations.filter((translation) => translation.locale !== selectedTranslation.locale),
    }));
    setSelectedEditLocale(editForm.default_locale);
  };

  const handleAITranslate = async () => {
    if (!editingItem || !selectedTranslation) {
      return;
    }
    setTranslatingLocale(selectedTranslation.locale);
    setError('');
    setSuccess('');
    try {
      const result = await aiTranslateAdminNews(editingItem.id, selectedTranslation.locale, {
        source_locale: aiSourceLocale,
      });
      setEditForm((prev) => ({
        ...prev,
        translations: sortTranslations(
          prev.translations.map((translation) => {
            if (translation.locale !== result.translation.locale) {
              return translation;
            }
            return translationFormFromNewsTranslation(result.translation);
          }),
          prev.default_locale
        ),
      }));
      setSuccess(t('admin.news.messages.aiTranslateSuccess', { locale: selectedTranslation.locale }));
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('admin.news.messages.aiTranslateFailed')));
    } finally {
      setTranslatingLocale(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('admin.news.title')}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('admin.news.subtitle')}</p>
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

      <form
        onSubmit={handleCreate}
        className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]"
      >
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {t('admin.news.sections.create')}
          </h3>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">{t('admin.news.fields.slug')}</span>
            <div className="flex gap-2">
              <input
                required
                value={form.slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  setForm((prev) => ({ ...prev, slug: e.target.value }));
                }}
                placeholder="hello-test-news"
                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
              />
              <button
                type="button"
                onClick={() => {
                  setSlugEdited(false);
                  setForm((prev) => ({
                    ...prev,
                    slug: generateSlugFromTitle(prev.title),
                  }));
                }}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {t('admin.news.actions.regenerateSlug')}
              </button>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('admin.news.hints.slug')}</span>
          </label>
          <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">{t('admin.news.fields.locale')}</span>
            <select
              value={form.default_locale}
              onChange={(e) => setForm((prev) => ({ ...prev, default_locale: e.target.value }))}
              className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="zh-CN">zh-CN</option>
              <option value="en-US">en-US</option>
            </select>
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('admin.news.hints.locale')}</span>
          </label>
          <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">{t('admin.news.fields.status')}</span>
            <select
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
              className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="draft">{t('admin.news.statusOptions.draft')}</option>
              <option value="published">{t('admin.news.statusOptions.published')}</option>
              <option value="archived">{t('admin.news.statusOptions.archived')}</option>
            </select>
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('admin.news.hints.status')}</span>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">{t('admin.news.fields.title')}</span>
            <input
              required
              value={form.title}
              onChange={(e) => {
                const nextTitle = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  title: nextTitle,
                  slug: slugEdited ? prev.slug : generateSlugFromTitle(nextTitle),
                }));
              }}
              placeholder={t('admin.news.fields.title')}
              className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('admin.news.hints.title')}</span>
          </label>
          <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">{t('admin.news.fields.author')}</span>
            <input
              value={form.author_name}
              onChange={(e) => setForm((prev) => ({ ...prev, author_name: e.target.value }))}
              placeholder={t('admin.news.fields.author')}
              className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('admin.news.hints.author')}</span>
          </label>
          <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">{t('admin.news.fields.publishedAt')}</span>
            <input
              type="datetime-local"
              value={form.published_at}
              onChange={(e) => setForm((prev) => ({ ...prev, published_at: e.target.value }))}
              className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t('admin.news.hints.publishedAt')}
            </span>
          </label>
        </div>

        <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span className="font-medium">{t('admin.news.fields.cover')}</span>
          <input
            value={form.cover_image_url}
            onChange={(e) => setForm((prev) => ({ ...prev, cover_image_url: e.target.value }))}
            placeholder="https://example.com/news-cover.jpg"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('admin.news.hints.cover')}</span>
        </label>

        <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span className="font-medium">{t('admin.news.fields.summary')}</span>
          <textarea
            value={form.summary}
            onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
            placeholder={t('admin.news.fields.summary')}
            className="min-h-24 rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('admin.news.hints.summary')}</span>
        </label>

        <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span className="font-medium">{t('admin.news.fields.content')}</span>
          <textarea
            required
            value={form.content}
            onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
            placeholder={t('admin.news.fields.content')}
            className="min-h-40 rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('admin.news.hints.content')}</span>
        </label>

        <div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60 dark:bg-white dark:text-gray-900"
          >
            {submitting ? t('admin.news.creating') : t('admin.news.create')}
          </button>
        </div>
      </form>

      <div className="grid gap-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {t('admin.news.sections.list')}
          </h3>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A] dark:text-gray-400">
            {t('admin.news.loading')}
          </div>
        ) : null}

        {!loading && items.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A] dark:text-gray-400">
            {t('admin.news.empty')}
          </div>
        ) : null}

        {!loading && items.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50/80 dark:bg-gray-900/40">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3">{t('admin.news.table.title')}</th>
                  <th className="px-4 py-3">{t('admin.news.table.status')}</th>
                  <th className="px-4 py-3">{t('admin.news.table.locale')}</th>
                  <th className="px-4 py-3">{t('admin.news.table.author')}</th>
                  <th className="px-4 py-3">{t('admin.news.table.publishedAt')}</th>
                  <th className="px-4 py-3">{t('admin.news.table.updatedAt')}</th>
                  <th className="px-4 py-3">{t('admin.news.table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((item) => {
                  const primaryTranslation = getPrimaryTranslation(item);

                  return (
                    <tr key={item.id} className="align-top text-sm text-gray-700 dark:text-gray-300">
                      <td className="px-4 py-4">
                        <div className="min-w-[280px]">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {primaryTranslation?.title || item.slug}
                          </div>
                          {primaryTranslation?.summary ? (
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                              {primaryTranslation.summary}
                            </div>
                          ) : primaryTranslation?.content ? (
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                              {getContentPreview(primaryTranslation.content)}
                            </div>
                          ) : null}
                          <div className="mt-2 space-y-1 text-xs text-gray-400 dark:text-gray-500">
                            <div>{t('admin.news.meta.slug', { value: item.slug })}</div>
                            <div>{t('admin.news.meta.publicPath', { locale: item.default_locale, id: item.id })}</div>
                            <div>{t('admin.news.meta.translationCount', { count: item.translations.length })}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(item.status)}`}
                        >
                          {getStatusLabel(item.status, t)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-gray-500 dark:text-gray-400">{item.default_locale}</td>
                      <td className="px-4 py-4 text-xs text-gray-500 dark:text-gray-400">
                        {item.author_name || '-'}
                      </td>
                      <td className="px-4 py-4 text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(item.published_at, locale)}
                      </td>
                      <td className="px-4 py-4 text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(item.updated_at, locale)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditDialog(item)}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            {t('admin.news.actions.edit')}
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === item.id}
                            onClick={() => void handleDelete(item)}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                          >
                            {deletingId === item.id ? t('admin.news.actions.deleting') : t('admin.news.actions.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <ModalShell
        open={showEditDialog}
        title={t('admin.news.actions.edit')}
        onClose={() => {
          setShowEditDialog(false);
          setEditingItem(null);
        }}
      >
        <form onSubmit={handleUpdate} className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">{t('admin.news.fields.slug')}</span>
              <div className="flex gap-2">
                <input
                  required
                  value={editForm.slug}
                  onChange={(e) => {
                    setEditSlugEdited(true);
                    setEditForm((prev) => ({ ...prev, slug: e.target.value }));
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    setEditSlugEdited(false);
                    setEditForm((prev) => ({
                      ...prev,
                      slug: generateSlugFromTitle(prev.title),
                    }));
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  {t('admin.news.actions.regenerateSlug')}
                </button>
              </div>
            </label>
            <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">{t('admin.news.fields.locale')}</span>
              <select
                value={editForm.default_locale}
                onChange={(e) => {
                  const nextDefaultLocale = e.target.value;
                  setEditForm((prev) => ({
                    ...prev,
                    default_locale: nextDefaultLocale,
                    translations: sortTranslations(prev.translations, nextDefaultLocale),
                  }));
                  setAISourceLocale(nextDefaultLocale);
                }}
                className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
              >
                {editForm.translations.map((translation) => (
                  <option key={translation.locale} value={translation.locale}>
                    {translation.locale}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">{t('admin.news.fields.status')}</span>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
                className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
              >
                <option value="draft">{t('admin.news.statusOptions.draft')}</option>
                <option value="published">{t('admin.news.statusOptions.published')}</option>
                <option value="archived">{t('admin.news.statusOptions.archived')}</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">{t('admin.news.fields.title')}</span>
              <input
                required
                value={getTranslationByLocale(editForm.translations, editForm.default_locale)?.title || ''}
                onChange={(e) => {
                  const nextTitle = e.target.value;
                  setEditForm((prev) => ({
                    ...prev,
                    slug: editSlugEdited ? prev.slug : generateSlugFromTitle(nextTitle),
                    translations: prev.translations.map((translation) =>
                      translation.locale === prev.default_locale
                        ? {
                            ...translation,
                            title: nextTitle,
                          }
                        : translation
                    ),
                  }));
                }}
                className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
              />
            </label>
            <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">{t('admin.news.fields.author')}</span>
              <input
                value={editForm.author_name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, author_name: e.target.value }))}
                className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
              />
            </label>
            <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">{t('admin.news.fields.publishedAt')}</span>
              <input
                type="datetime-local"
                value={editForm.published_at}
                onChange={(e) => setEditForm((prev) => ({ ...prev, published_at: e.target.value }))}
                className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">{t('admin.news.fields.cover')}</span>
            <input
              value={editForm.cover_image_url}
              onChange={(e) => setEditForm((prev) => ({ ...prev, cover_image_url: e.target.value }))}
              className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </label>

          <div className="grid gap-4 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {t('admin.news.translationManager.title')}
                </h4>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.news.translationManager.subtitle')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={newEditLocale}
                  onChange={(e) => setNewEditLocale(e.target.value)}
                  className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                >
                  {NEWS_LOCALE_OPTIONS.map((localeCode) => (
                    <option key={localeCode} value={localeCode}>
                      {localeCode}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addTranslationLocale}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  {t('admin.news.actions.addTranslation')}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {editForm.translations.map((translation) => (
                <button
                  key={translation.locale}
                  type="button"
                  onClick={() => setSelectedEditLocale(translation.locale)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    selectedEditLocale === translation.locale
                      ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  {translation.locale}
                  {translation.locale === editForm.default_locale ? ` · ${t('admin.news.translationManager.defaultLocaleTag')}` : ''}
                </button>
              ))}
            </div>

            {selectedTranslation ? (
              <div className="grid gap-4">
                <div className="flex flex-col gap-3 rounded-xl bg-gray-50 p-4 dark:bg-gray-900/40">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {t('admin.news.translationManager.editingLocale', { locale: selectedTranslation.locale })}
                    </span>
                    <span className="rounded-full border border-gray-200 px-2 py-1 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      {t(`admin.news.translationStatus.${selectedTranslation.translation_status || 'manual'}`)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={aiSourceLocale}
                      onChange={(e) => setAISourceLocale(e.target.value)}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                    >
                      {editForm.translations.map((translation) => (
                        <option key={translation.locale} value={translation.locale}>
                          {t('admin.news.translationManager.sourceLocaleOption', { locale: translation.locale })}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={translatingLocale === selectedTranslation.locale || aiSourceLocale === selectedTranslation.locale}
                      onClick={() => void handleAITranslate()}
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
                    >
                      {translatingLocale === selectedTranslation.locale
                        ? t('admin.news.actions.aiTranslating')
                        : t('admin.news.actions.aiTranslate')}
                    </button>
                    <button
                      type="button"
                      disabled={
                        selectedTranslation.locale === editForm.default_locale || editForm.translations.length <= 1
                      }
                      onClick={removeSelectedTranslation}
                      className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      {t('admin.news.actions.removeTranslation')}
                    </button>
                  </div>
                </div>

                <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">{t('admin.news.fields.title')}</span>
                  <input
                    required
                    value={selectedTranslation.title}
                    onChange={(e) =>
                      updateSelectedTranslation({
                        title: e.target.value,
                        translation_status:
                          selectedTranslation.translation_status === 'ai_draft' ? 'reviewed' : selectedTranslation.translation_status,
                      })
                    }
                    className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                  />
                </label>

                <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">{t('admin.news.fields.summary')}</span>
                  <textarea
                    value={selectedTranslation.summary}
                    onChange={(e) =>
                      updateSelectedTranslation({
                        summary: e.target.value,
                        translation_status:
                          selectedTranslation.translation_status === 'ai_draft' ? 'reviewed' : selectedTranslation.translation_status,
                      })
                    }
                    className="min-h-24 rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">{t('admin.news.fields.seoTitle')}</span>
                    <input
                      value={selectedTranslation.seo_title}
                      onChange={(e) => updateSelectedTranslation({ seo_title: e.target.value })}
                      className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">{t('admin.news.fields.seoDescription')}</span>
                    <input
                      value={selectedTranslation.seo_description}
                      onChange={(e) => updateSelectedTranslation({ seo_description: e.target.value })}
                      className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                    />
                  </label>
                </div>

                <label className="grid gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">{t('admin.news.fields.content')}</span>
                  <textarea
                    required
                    value={selectedTranslation.content}
                    onChange={(e) =>
                      updateSelectedTranslation({
                        content: e.target.value,
                        translation_status:
                          selectedTranslation.translation_status === 'ai_draft' ? 'reviewed' : selectedTranslation.translation_status,
                      })
                    }
                    className="min-h-56 rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowEditDialog(false);
                setEditingItem(null);
              }}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {t('admin.news.actions.cancel')}
            </button>
            <button
              type="submit"
              disabled={updating}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60 dark:bg-white dark:text-gray-900"
            >
              {updating ? t('admin.news.actions.saving') : t('admin.news.actions.save')}
            </button>
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
