'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  createAdminAnnouncement,
  listAdminAnnouncements,
  type AdminAnnouncement,
} from '@/lib/admin-api';

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    content: '',
    status: 'published',
    notify_mode: 'inbox',
  });

  const loadAnnouncements = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listAdminAnnouncements({ page: 1, page_size: 20 });
      setAnnouncements(result.items);
    } catch (err: any) {
      setError(err.message || '加载公告失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await createAdminAnnouncement(form);
      setForm({ title: '', content: '', status: 'published', notify_mode: 'inbox' });
      await loadAnnouncements();
    } catch (err: any) {
      setError(err.message || '创建公告失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">公告管理</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">先覆盖公告列表和基础发布能力。</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <input
            required
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="公告标题"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <input
            value={form.status}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            placeholder="状态"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
          <input
            value={form.notify_mode}
            onChange={(e) => setForm((prev) => ({ ...prev, notify_mode: e.target.value }))}
            placeholder="通知方式"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
          />
        </div>
        <textarea
          required
          value={form.content}
          onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
          placeholder="公告内容"
          className="min-h-36 rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
        />
        <div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60 dark:bg-white dark:text-gray-900"
          >
            {submitting ? '发布中' : '发布公告'}
          </button>
        </div>
      </form>

      <div className="grid gap-4">
        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A] dark:text-gray-400">
            正在加载公告列表...
          </div>
        ) : announcements.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A] dark:text-gray-400">
            暂无公告数据
          </div>
        ) : (
          announcements.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{item.title}</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    状态: {item.status || '-'} | 通知方式: {item.notify_mode || '-'}
                  </p>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{item.created_at || '-'}</div>
              </div>
              <div className="mt-4 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                {item.content}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
