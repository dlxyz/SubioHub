'use client';

import { useState } from 'react';
import { BarChart3, Search, Filter, Calendar } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';

// 模拟调用日志数据
const mockUsage = [
  { id: 1, model: 'gpt-4-turbo', time: '2023-11-01 14:23:01', tokens: '4,231', cost: '$0.12', ip: '192.168.1.1' },
  { id: 2, model: 'claude-3-opus', time: '2023-11-01 14:15:22', tokens: '1,024', cost: '$0.05', ip: '192.168.1.2' },
  { id: 3, model: 'gpt-3.5-turbo', time: '2023-11-01 13:50:11', tokens: '512', cost: '$0.001', ip: '192.168.1.1' },
  { id: 4, model: 'gemini-pro', time: '2023-11-01 10:05:44', tokens: '8,901', cost: '$0.08', ip: '10.0.0.5' },
];

export default function UsagePage() {
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center">
            <BarChart3 className="mr-2 h-6 w-6 text-indigo-500" /> {t('dashboard.pages.usage.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('dashboard.pages.usage.subtitle')}
          </p>
        </div>
      </div>

      {/* 筛选工具栏 */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
          placeholder={t('dashboard.pages.usage.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-colors sm:text-sm"
          />
        </div>
        <button className="inline-flex items-center justify-center px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1A1A1A] text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <Calendar className="mr-2 h-4 w-4" /> {t('dashboard.pages.usage.dateRange')}
        </button>
        <button className="inline-flex items-center justify-center px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1A1A1A] text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <Filter className="mr-2 h-4 w-4" /> {t('dashboard.pages.usage.moreFilters')}
        </button>
      </div>

      {/* 列表区域 */}
      <div className="bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        
        {/* 移动端卡片视图 */}
        <div className="block sm:hidden divide-y divide-gray-200 dark:divide-gray-800">
          {mockUsage.map((log) => (
            <div key={log.id} className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-900 dark:text-white">{log.model}</span>
                <span className="text-sm font-medium text-green-600 dark:text-green-400">{log.cost}</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between">
                <span>{log.time}</span>
                <span>IP: {log.ip}</span>
              </div>
              <div className="text-xs bg-gray-50 dark:bg-gray-900/50 p-2 rounded text-gray-600 dark:text-gray-300">
                {t('dashboard.pages.usage.consumeTokens')}: <span className="font-mono">{log.tokens}</span>
              </div>
            </div>
          ))}
        </div>

        {/* PC端表格视图 */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.pages.usage.time')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.pages.usage.model')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.pages.usage.tokens')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.pages.usage.cost')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.pages.usage.requestIp')}</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-[#1A1A1A] divide-y divide-gray-200 dark:divide-gray-800">
              {mockUsage.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{log.time}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{log.model}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono">{log.tokens}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600 dark:text-green-400">{log.cost}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{log.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
