'use client';

import { useState } from 'react';
import { Key, Plus, Copy, Trash2, Edit3, Search } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';

// 模拟数据，后续对接后端 API
const mockKeys = [
  { id: 1, name: 'Default Key', key: 'sk-fasd8f7...a89df', quota: 'unlimited', used: '$12.50', status: 'active', created: '2023-10-01' },
  { id: 2, name: 'Project A', key: 'sk-9a8s7d...h23jk', quota: '$50.00', used: '$49.99', status: 'exhausted', created: '2023-10-15' },
  { id: 3, name: 'Test Token', key: 'sk-zxcvbn...m1234', quota: '$10.00', used: '$1.20', status: 'active', created: '2023-11-02' },
];

export default function KeysPage() {
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState('');

  const displayQuota = (quota: string) => (quota === 'unlimited' ? t('dashboard.pages.keys.unlimited') : quota);
  const displayStatus = (status: string) =>
    status === 'active' ? t('dashboard.pages.keys.active') : t('dashboard.pages.keys.exhausted');

  return (
    <div className="space-y-6">
      {/* 头部标题与操作 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center">
            <Key className="mr-2 h-6 w-6 text-blue-500" /> {t('dashboard.pages.keys.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('dashboard.pages.keys.subtitle')}
          </p>
        </div>
        <button className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shrink-0 shadow-sm">
          <Plus className="mr-2 h-4 w-4" /> {t('dashboard.pages.keys.create')}
        </button>
      </div>

      {/* 搜索与过滤 */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder={t('dashboard.pages.keys.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="block w-full sm:max-w-xs pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
        />
      </div>

      {/* 列表区域 (PC端表格，手机端卡片) */}
      <div className="bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        {/* 移动端卡片视图 (sm:hidden) */}
        <div className="block sm:hidden divide-y divide-gray-200 dark:divide-gray-800">
          {mockKeys.map((item) => (
            <div key={item.id} className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <span className="font-medium text-gray-900 dark:text-white">{item.name}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  item.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {displayStatus(item.status)}
                </span>
              </div>
              <div className="flex items-center text-sm font-mono text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 p-2 rounded">
                {item.key}
                <button className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>{t('dashboard.pages.keys.quota')}: {displayQuota(item.quota)}</span>
                <span>{t('dashboard.pages.keys.used')}: {item.used}</span>
              </div>
              <div className="pt-2 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
                <button className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"><Edit3 className="h-4 w-4" /></button>
                <button className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>

        {/* PC端表格视图 (hidden sm:block) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.pages.keys.name')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.pages.keys.key')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.pages.keys.quota')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.pages.keys.used')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.pages.keys.status')}</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.pages.keys.actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-[#1A1A1A] divide-y divide-gray-200 dark:divide-gray-800">
              {mockKeys.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono flex items-center gap-2">
                    {item.key}
                    <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title={t('dashboard.pages.keys.copy')}><Copy className="h-4 w-4" /></button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{displayQuota(item.quota)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{item.used}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      item.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {displayStatus(item.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-4" title={t('dashboard.pages.keys.edit')}><Edit3 className="h-4 w-4 inline" /></button>
                    <button className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300" title={t('dashboard.pages.keys.delete')}><Trash2 className="h-4 w-4 inline" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
