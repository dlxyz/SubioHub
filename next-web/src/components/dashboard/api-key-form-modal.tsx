'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { UserAPIKey, UserAPIKeyGroup } from '@/lib/user-api-keys';

type Props = {
  open: boolean;
  mode: 'create' | 'edit';
  apiKey?: UserAPIKey | null;
  groups: UserAPIKeyGroup[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    group_id: number | null;
    quota?: number;
    status?: 'active' | 'inactive';
  }) => Promise<void>;
};

type FormState = {
  name: string;
  groupId: string;
  quota: string;
  status: 'active' | 'inactive';
};

const DEFAULT_FORM: FormState = {
  name: '',
  groupId: '',
  quota: '',
  status: 'active',
};

function getInitialForm(mode: 'create' | 'edit', apiKey?: UserAPIKey | null): FormState {
  if (mode === 'edit' && apiKey) {
    return {
      name: apiKey.name || '',
      groupId: apiKey.group_id != null ? String(apiKey.group_id) : '',
      quota: apiKey.quota > 0 ? String(apiKey.quota) : '',
      status: apiKey.status === 'inactive' ? 'inactive' : 'active',
    };
  }
  return DEFAULT_FORM;
}

function parseQuota(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

export function APIKeyFormModal({ open, mode, apiKey, groups, submitting, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<FormState>(() => getInitialForm(mode, apiKey));
  const [error, setError] = useState('');

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError('请输入密钥名称');
      return;
    }

    const quota = parseQuota(form.quota);
    if (form.quota.trim() && quota == null) {
      setError('额度必须是大于等于 0 的数字');
      return;
    }

    setError('');
    await onSubmit({
      name,
      group_id: form.groupId ? Number(form.groupId) : null,
      quota,
      status: mode === 'edit' ? form.status : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
      <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-[#171717]">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {mode === 'create' ? '创建 API 密钥' : '编辑 API 密钥'}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {mode === 'create' ? '创建一把新的用户调用密钥。' : '修改密钥名称、分组、额度和状态。'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-60 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="space-y-5 px-5 py-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">密钥名称</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="例如：测试环境 / 项目 A"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">绑定分组</label>
            <select
              value={form.groupId}
              onChange={(e) => setForm((prev) => ({ ...prev, groupId: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
            >
              {mode === 'create' || apiKey?.group_id == null ? <option value="">不绑定分组</option> : null}
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            {mode === 'edit' && apiKey?.group_id != null ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                当前接口暂不支持直接清空已绑定分组，如需调整可改绑到其他分组。
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">额度上限</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.quota}
                onChange={(e) => setForm((prev) => ({ ...prev, quota: e.target.value }))}
                placeholder="留空表示不限额"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
              />
            </div>

            {mode === 'edit' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">状态</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as 'active' | 'inactive' }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
                >
                  <option value="active">正常</option>
                  <option value="inactive">禁用</option>
                </select>
              </div>
            ) : (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
                创建后会自动生成一把新的 `sk-` 密钥。
              </div>
            )}
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? '提交中...' : mode === 'create' ? '创建密钥' : '保存修改'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
