'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, Layers3, RefreshCw, Search } from 'lucide-react';
import { listAdminChannels, type AdminChannel } from '@/lib/admin-api';

const PAGE_SIZE = 200;
const SOURCE_TABS = [
  { key: 'all', label: '全部模型' },
  { key: 'subscription', label: '订阅管理' },
  { key: 'interface', label: '接口管理' },
  { key: 'shared', label: '双端共享' },
] as const;
const CAPABILITY_OPTIONS = [
  { key: 'all', label: '全部能力' },
  { key: 'chat', label: 'Chat' },
  { key: 'embeddings', label: 'Embeddings' },
  { key: 'rerank', label: 'Rerank' },
  { key: 'unknown', label: '未识别' },
] as const;

type ModelScope = 'subscription' | 'interface';
type CapabilityKey = 'chat' | 'embeddings' | 'rerank' | 'unknown';
type SourceTabKey = (typeof SOURCE_TABS)[number]['key'];

type AggregatedModel = {
  name: string;
  capabilities: CapabilityKey[];
  scopes: ModelScope[];
  sources: string[];
  sourceKinds: string[];
  providers: string[];
  pricingPlatforms: string[];
  aliases: string[];
  channelCount: number;
  usageCount: number;
  updatedAt?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function normalizeText(value: string | undefined | null) {
  return (value || '').trim();
}

function normalizeModelList(models?: string[]) {
  return Array.from(new Set((models || []).map((item) => item.trim()).filter(Boolean)));
}

function providerLabel(channel: AdminChannel, scope: ModelScope) {
  if (scope === 'interface') {
    return normalizeText(channel.provider_type) || 'custom';
  }
  const platforms = (channel.model_pricing || []).map((item) => normalizeText(item.platform)).filter(Boolean);
  if (platforms.length > 0) {
    return Array.from(new Set(platforms)).join(' / ');
  }
  const mappingPlatforms = Object.keys(channel.model_mapping || {}).map((item) => normalizeText(item)).filter(Boolean);
  if (mappingPlatforms.length > 0) {
    return mappingPlatforms.join(' / ');
  }
  return 'subscription';
}

function inferCapabilities(modelName: string): CapabilityKey[] {
  const lower = modelName.trim().toLowerCase();
  const capabilities = new Set<CapabilityKey>();
  if (lower.includes('embedding') || lower.startsWith('embo-')) {
    capabilities.add('embeddings');
  }
  if (lower.includes('rerank') || lower.includes('retrieval')) {
    capabilities.add('rerank');
  }
  if (
    lower.includes('chat') ||
    lower.includes('textgeneration') ||
    lower.includes('reasoner') ||
    lower.includes('gpt') ||
    lower.includes('claude') ||
    lower.includes('gemini') ||
    lower.includes('qwen') ||
    lower.includes('deepseek') ||
    lower.includes('glm') ||
    lower.includes('kimi') ||
    lower.includes('minimax') ||
    lower.includes('doubao')
  ) {
    capabilities.add('chat');
  }
  if (capabilities.size === 0) {
    capabilities.add('unknown');
  }
  return Array.from(capabilities).sort();
}

function capabilityBadgeClass(capability: CapabilityKey) {
  switch (capability) {
    case 'chat':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300';
    case 'embeddings':
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300';
    case 'rerank':
      return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/20 dark:text-violet-300';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300';
  }
}

function scopeBadgeClass(scope: ModelScope) {
  return scope === 'interface'
    ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300'
    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300';
}

async function listAllChannels(providerScope: 'overseas' | 'domestic') {
  const items: AdminChannel[] = [];
  let page = 1;
  while (true) {
    const result = await listAdminChannels({
      page,
      page_size: PAGE_SIZE,
      provider_scope: providerScope,
      sort_by: 'created_at',
      sort_order: 'desc',
    });
    items.push(...result.items);
    if (result.items.length === 0 || items.length >= result.total) {
      break;
    }
    page += 1;
  }
  return items;
}

function aggregateChannelModels(subscriptionChannels: AdminChannel[], interfaceChannels: AdminChannel[]) {
  const registry = new Map<
    string,
    {
      model: AggregatedModel;
      scopes: Set<ModelScope>;
      capabilities: Set<CapabilityKey>;
      sources: Set<string>;
      sourceKinds: Set<string>;
      providers: Set<string>;
      pricingPlatforms: Set<string>;
      aliases: Set<string>;
      channelIDs: Set<number>;
    }
  >();

  const appendModel = (
    rawModelName: string,
    channel: AdminChannel,
    scope: ModelScope,
    extra?: { alias?: string; pricingPlatform?: string }
  ) => {
    const modelName = normalizeText(rawModelName);
    if (!modelName) return;
    const key = modelName.toLowerCase();
    const existing = registry.get(key) || {
      model: {
        name: modelName,
        capabilities: [],
        scopes: [],
        sources: [],
        sourceKinds: [],
        providers: [],
        pricingPlatforms: [],
        aliases: [],
        channelCount: 0,
        usageCount: 0,
        updatedAt: channel.updated_at || channel.created_at,
      },
      scopes: new Set<ModelScope>(),
      capabilities: new Set<CapabilityKey>(),
      sources: new Set<string>(),
      sourceKinds: new Set<string>(),
      providers: new Set<string>(),
      pricingPlatforms: new Set<string>(),
      aliases: new Set<string>(),
      channelIDs: new Set<number>(),
    };

    existing.scopes.add(scope);
    inferCapabilities(modelName).forEach((capability) => existing.capabilities.add(capability));
    if (channel.name) existing.sources.add(channel.name);
    existing.sourceKinds.add(scope === 'interface' ? '接口管理' : '订阅管理');
    existing.providers.add(providerLabel(channel, scope));
    if (extra?.pricingPlatform) existing.pricingPlatforms.add(extra.pricingPlatform);
    if (extra?.alias) existing.aliases.add(extra.alias);
    existing.channelIDs.add(channel.id);
    const updatedAt = channel.updated_at || channel.created_at;
    if (updatedAt && (!existing.model.updatedAt || new Date(updatedAt) > new Date(existing.model.updatedAt))) {
      existing.model.updatedAt = updatedAt;
    }
    registry.set(key, existing);
  };

  const ingestChannels = (channels: AdminChannel[], scope: ModelScope) => {
    for (const channel of channels) {
      for (const pricing of channel.model_pricing || []) {
        for (const model of pricing.models || []) {
          appendModel(model, channel, scope, { pricingPlatform: normalizeText(pricing.platform) });
        }
      }
      for (const [mappingPlatform, mappings] of Object.entries(channel.model_mapping || {})) {
        for (const [alias, target] of Object.entries(mappings || {})) {
          appendModel(target, channel, scope, {
            alias: alias.trim(),
            pricingPlatform: mappingPlatform.trim(),
          });
        }
      }
    }
  };

  ingestChannels(subscriptionChannels, 'subscription');
  ingestChannels(interfaceChannels, 'interface');

  return Array.from(registry.values())
    .map((entry) => ({
      ...entry.model,
      capabilities: Array.from(entry.capabilities).sort(),
      scopes: Array.from(entry.scopes).sort(),
      sources: Array.from(entry.sources).sort(),
      sourceKinds: Array.from(entry.sourceKinds).sort(),
      providers: Array.from(entry.providers).sort(),
      pricingPlatforms: Array.from(entry.pricingPlatforms).sort(),
      aliases: Array.from(entry.aliases).sort(),
      channelCount: entry.channelIDs.size,
      usageCount:
        entry.channelIDs.size +
        entry.aliases.size +
        entry.pricingPlatforms.size +
        entry.providers.size,
    }))
    .sort((a, b) => {
      if (b.channelCount !== a.channelCount) return b.channelCount - a.channelCount;
      return a.name.localeCompare(b.name);
    });
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

export default function AdminModelMarketplacePage() {
  const [models, setModels] = useState<AggregatedModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<SourceTabKey>('all');
  const [keyword, setKeyword] = useState('');
  const [capability, setCapability] = useState<(typeof CAPABILITY_OPTIONS)[number]['key']>('all');

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [subscriptionChannels, interfaceChannels] = await Promise.all([
        listAllChannels('overseas'),
        listAllChannels('domestic'),
      ]);
      setModels(aggregateChannelModels(subscriptionChannels, interfaceChannels));
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError, '加载模型速览失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadModels();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadModels]);

  const tabCounts = useMemo(() => {
    const counts: Record<SourceTabKey, number> = {
      all: models.length,
      subscription: 0,
      interface: 0,
      shared: 0,
    };
    for (const model of models) {
      const hasSubscription = model.scopes.includes('subscription');
      const hasInterface = model.scopes.includes('interface');
      if (hasSubscription) counts.subscription += 1;
      if (hasInterface) counts.interface += 1;
      if (hasSubscription && hasInterface) counts.shared += 1;
    }
    return counts;
  }, [models]);

  const summary = useMemo(() => {
    const capabilityCount = {
      chat: 0,
      embeddings: 0,
      rerank: 0,
    };
    for (const model of models) {
      if (model.capabilities.includes('chat')) capabilityCount.chat += 1;
      if (model.capabilities.includes('embeddings')) capabilityCount.embeddings += 1;
      if (model.capabilities.includes('rerank')) capabilityCount.rerank += 1;
    }
    return capabilityCount;
  }, [models]);

  const filteredModels = useMemo(() => {
    const search = keyword.trim().toLowerCase();
    return models.filter((model) => {
      const matchesTab =
        activeTab === 'all' ||
        (activeTab === 'subscription' && model.scopes.includes('subscription')) ||
        (activeTab === 'interface' && model.scopes.includes('interface')) ||
        (activeTab === 'shared' && model.scopes.length > 1);
      if (!matchesTab) return false;

      const matchesCapability = capability === 'all' || model.capabilities.includes(capability);
      if (!matchesCapability) return false;

      if (!search) return true;
      const haystack = [
        model.name,
        model.sources.join(' '),
        model.providers.join(' '),
        model.pricingPlatforms.join(' '),
        model.aliases.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [activeTab, capability, keyword, models]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">模型速览</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            汇总展示订阅管理与接口管理中已配置的模型，让后台模型资产不再分散在两套页面里。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadModels()}
          className="inline-flex items-center gap-2 self-start rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新模型速览
        </button>
      </div>

      {(error || loading) && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            error
              ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
              : 'border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300'
          }`}
        >
          {error || '正在汇总订阅管理与接口管理里的模型速览数据...'}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="text-sm text-gray-500 dark:text-gray-400">模型总数</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">{models.length}</div>
          <div className="mt-2 text-xs text-gray-400">已聚合订阅管理与接口管理中的去重模型。</div>
        </div>
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="text-sm text-gray-500 dark:text-gray-400">Chat</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">{summary.chat}</div>
          <div className="mt-2 text-xs text-gray-400">按模型名模式推断的聊天模型。</div>
        </div>
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="text-sm text-gray-500 dark:text-gray-400">Embeddings</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">{summary.embeddings}</div>
          <div className="mt-2 text-xs text-gray-400">来自向量模型或含 embedding 关键字的模型</div>
        </div>
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="text-sm text-gray-500 dark:text-gray-400">双端共享</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">{tabCounts.shared}</div>
          <div className="mt-2 text-xs text-gray-400">同时出现在订阅管理和接口管理中的模型</div>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {SOURCE_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  activeTab === tab.key
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-gray-700 dark:bg-[#111111] dark:text-gray-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20 dark:hover:text-emerald-300'
                }`}
              >
                {tab.label} {tabCounts[tab.key]}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索模型、来源渠道或映射别名..."
                className="w-full rounded-2xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-[#111111] dark:text-white"
              />
            </div>
            <select
              value={capability}
              onChange={(e) => setCapability(e.target.value as (typeof CAPABILITY_OPTIONS)[number]['key'])}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-[#111111] dark:text-white"
            >
              {CAPABILITY_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {filteredModels.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-gray-400 xl:col-span-2">
            {loading ? '正在汇总模型...' : '当前筛选条件下没有可展示的模型'}
          </div>
        ) : (
          filteredModels.map((model) => (
            <div key={model.name} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{model.name}</h3>
                    {model.capabilities.map((item) => (
                      <span
                        key={`${model.name}-${item}`}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${capabilityBadgeClass(item)}`}
                      >
                        {item === 'unknown' ? '未识别' : item}
                      </span>
                    ))}
                    {model.scopes.map((item) => (
                      <span
                        key={`${model.name}-${item}`}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${scopeBadgeClass(item)}`}
                      >
                        {item === 'interface' ? '接口管理' : '订阅管理'}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1">
                      <Boxes className="h-3.5 w-3.5" />
                      {model.channelCount} 个来源配置
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Layers3 className="h-3.5 w-3.5" />
                      最近更新 {formatDate(model.updatedAt)}
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-3 text-right dark:bg-gray-900/40">
                  <div className="text-xs text-gray-500 dark:text-gray-400">聚合热度</div>
                  <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{model.usageCount}</div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/30">
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-200">来源配置</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {model.sources.slice(0, 8).map((source) => (
                      <span key={`${model.name}-${source}`} className="rounded-full bg-white px-2.5 py-1 text-[11px] text-gray-600 dark:bg-[#111111] dark:text-gray-300">
                        {source}
                      </span>
                    ))}
                    {model.sources.length > 8 ? (
                      <span className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-[11px] text-gray-400 dark:border-gray-700">
                        +{model.sources.length - 8}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/30">
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-200">平台 / Provider</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {model.providers.map((provider) => (
                      <span key={`${model.name}-${provider}`} className="rounded-full bg-white px-2.5 py-1 text-[11px] text-gray-600 dark:bg-[#111111] dark:text-gray-300">
                        {provider}
                      </span>
                    ))}
                    {model.pricingPlatforms.map((platform) => (
                      <span
                        key={`${model.name}-${platform}`}
                        className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400"
                      >
                        定价 {platform}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-200">映射别名</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {model.aliases.length > 0 ? (
                      model.aliases.slice(0, 12).map((alias) => (
                        <span
                          key={`${model.name}-${alias}`}
                          className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-600 dark:border-gray-700 dark:text-gray-300"
                        >
                          {alias}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-400">暂无映射别名</span>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-200">来源范围</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {model.sourceKinds.map((kind) => (
                      <span
                        key={`${model.name}-${kind}`}
                        className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-600 dark:border-gray-700 dark:text-gray-300"
                      >
                        {kind}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
