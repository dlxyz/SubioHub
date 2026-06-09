'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownUp,
  ArrowUpRight,
  Cpu,
  Database,
  Layers3,
  Search,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from 'lucide-react';
import { localizePath } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { getPublicModelPlaza, type ModelPlazaModel, type ModelPlazaResponse } from '@/lib/model-plaza-api';
import { useI18n } from '@/i18n/use-i18n';

type ModelPlazaViewProps = {
  variant?: 'public' | 'dashboard';
};

type Translator = (key: string, params?: Record<string, string | number>) => string;
type SortKey = 'recommended' | 'name' | 'context' | 'priceAsc' | 'priceDesc';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function containsChinese(text: string) {
  return /[\u4e00-\u9fff]/.test(text);
}

function getCapabilityLabel(capability: string, t: Translator) {
  switch (capability) {
    case 'audio':
      return t('modelPlaza.capabilities.audio');
    case 'caching':
      return t('modelPlaza.capabilities.caching');
    case 'chat':
      return t('modelPlaza.capabilities.chat');
    case 'coding':
      return t('modelPlaza.capabilities.coding');
    case 'embedding':
      return t('modelPlaza.capabilities.embedding');
    case 'image':
      return t('modelPlaza.capabilities.image');
    case 'long-context':
      return t('modelPlaza.capabilities.longContext');
    case 'reasoning':
      return t('modelPlaza.capabilities.reasoning');
    case 'vision':
      return t('modelPlaza.capabilities.vision');
    default:
      return capability;
  }
}

function getPricingSourceLabel(source: string, t: Translator) {
  switch (source) {
    case 'dynamic':
      return t('modelPlaza.pricingSource.dynamic');
    case 'fallback':
      return t('modelPlaza.pricingSource.fallback');
    default:
      return t('modelPlaza.pricingSource.unavailable');
  }
}

function getModeLabel(mode: string, t: Translator) {
  switch (mode) {
    case 'audio':
      return t('modelPlaza.modes.audio');
    case 'embedding':
      return t('modelPlaza.modes.embedding');
    case 'image':
      return t('modelPlaza.modes.image');
    default:
      return t('modelPlaza.modes.chat');
  }
}

function getSourceLabel(sourceType: string, t: Translator) {
  switch (sourceType) {
    case 'subscription':
      return t('modelPlaza.sources.subscription');
    case 'shared':
      return t('modelPlaza.sources.shared');
    case 'interface':
    default:
      return t('modelPlaza.sources.interface');
  }
}

function getSourceBadgeClass(sourceType: string) {
  switch (sourceType) {
    case 'subscription':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
    case 'shared':
      return 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300';
    case 'interface':
    default:
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
  }
}

function buildLocalizedSummary(model: ModelPlazaModel, t: Translator) {
  const parts = [model.provider_label];
  for (const capability of model.capabilities || []) {
    if (capability !== 'chat') {
      parts.push(getCapabilityLabel(capability, t));
    }
  }

  const uniqueParts = Array.from(new Set(parts.filter(Boolean)));
  if (uniqueParts.length === 0) {
    return t('modelPlaza.summary.generic');
  }

  return t('modelPlaza.summary.suitableFor', { parts: uniqueParts.join(' / ') });
}

function getLocalizedSummary(model: ModelPlazaModel, locale: string, t: Translator) {
  if (locale === 'zh' && model.summary.trim()) {
    return model.summary;
  }

  if (model.summary.trim() && !containsChinese(model.summary)) {
    return model.summary;
  }

  return buildLocalizedSummary(model, t);
}

function formatPrice(value: number, t: Translator) {
  if (!value) {
    return t('modelPlaza.common.priceUnavailable');
  }
  if (value >= 1) {
    return `$${value.toFixed(2)}/MTok`;
  }
  if (value >= 0.01) {
    return `$${value.toFixed(3)}/MTok`;
  }
  return `$${value.toFixed(4)}/MTok`;
}

function formatThreshold(value: number) {
  if (!value) {
    return '-';
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  }
  return `${value}`;
}

function getComparablePrice(model: ModelPlazaModel) {
  const values = [model.input_price_per_mtok, model.output_price_per_mtok].filter((item) => item > 0);
  if (values.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return values.reduce((sum, item) => sum + item, 0);
}

function getRecommendationScore(model: ModelPlazaModel) {
  let score = 0;
  if (model.input_price_per_mtok > 0 || model.output_price_per_mtok > 0) score += 4;
  if (model.supports_prompt_caching) score += 3;
  if (model.supports_service_tier) score += 2;
  if ((model.capabilities || []).includes('reasoning')) score += 2;
  if ((model.capabilities || []).includes('vision')) score += 1;
  if (model.long_context_threshold >= 64000) score += 1;
  return score;
}

function matchesKeyword(model: ModelPlazaModel, keyword: string) {
  if (!keyword) return true;
  const haystack = [
    model.id,
    model.display_name,
    model.summary,
    model.provider_label,
    model.source_type,
    ...(model.source_scopes || []),
    model.mode,
    ...(model.capabilities || []),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(keyword);
}

export default function ModelPlazaView({ variant = 'public' }: ModelPlazaViewProps) {
  const { locale, t } = useI18n();
  const localizedNewsPath = localizePath('/news', locale);
  const [data, setData] = useState<ModelPlazaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeProvider, setActiveProvider] = useState('all');
  const [activeCapability, setActiveCapability] = useState('all');
  const [activeMode, setActiveMode] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('recommended');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getPublicModelPlaza();
      setData(response);
    } catch (err: unknown) {
      setData(null);
      setError(getErrorMessage(err, t('modelPlaza.common.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const allModels = data?.models || [];
  const keyword = search.trim().toLowerCase();

  const providerFilteredModels = useMemo(() => {
    return allModels.filter((model) => {
      const matchesProvider = activeProvider === 'all' || model.provider === activeProvider;
      return matchesProvider && matchesKeyword(model, keyword);
    });
  }, [activeProvider, allModels, keyword]);

  const modeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const model of providerFilteredModels) {
      const key = model.mode || 'chat';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [providerFilteredModels]);

  const modeFilteredModels = useMemo(() => {
    return providerFilteredModels.filter((model) => activeMode === 'all' || (model.mode || 'chat') === activeMode);
  }, [activeMode, providerFilteredModels]);

  const capabilityOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const model of modeFilteredModels) {
      for (const capability of model.capabilities || []) {
        counts.set(capability, (counts.get(capability) || 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [modeFilteredModels]);

  const filteredModels = useMemo(() => {
    const next = modeFilteredModels.filter((model) => {
      return activeCapability === 'all' || (model.capabilities || []).includes(activeCapability);
    });

    return [...next].sort((left, right) => {
      if (sortBy === 'name') {
        return left.display_name.localeCompare(right.display_name);
      }
      if (sortBy === 'context') {
        return right.long_context_threshold - left.long_context_threshold || left.display_name.localeCompare(right.display_name);
      }
      if (sortBy === 'priceAsc') {
        return getComparablePrice(left) - getComparablePrice(right) || left.display_name.localeCompare(right.display_name);
      }
      if (sortBy === 'priceDesc') {
        return getComparablePrice(right) - getComparablePrice(left) || left.display_name.localeCompare(right.display_name);
      }

      return (
        getRecommendationScore(right) - getRecommendationScore(left) ||
        right.long_context_threshold - left.long_context_threshold ||
        left.display_name.localeCompare(right.display_name)
      );
    });
  }, [activeCapability, modeFilteredModels, sortBy]);

  const filteredSummary = useMemo(() => {
    const providerSet = new Set<string>();
    let pricedCount = 0;
    let cacheReadyCount = 0;

    for (const model of filteredModels) {
      providerSet.add(model.provider);
      if (model.input_price_per_mtok > 0 || model.output_price_per_mtok > 0) {
        pricedCount += 1;
      }
      if (model.supports_prompt_caching) {
        cacheReadyCount += 1;
      }
    }

    return {
      providers: providerSet.size,
      priced: pricedCount,
      cacheReady: cacheReadyCount,
    };
  }, [filteredModels]);

  const stats = data?.stats;
  const providers = data?.providers || [];
  const pageTitle =
    variant === 'dashboard'
      ? t('modelPlaza.title')
      : data?.site_name
        ? t('modelPlaza.titleWithSite', { site: data.site_name })
        : t('modelPlaza.title');
  const pageDescription =
    variant === 'dashboard'
      ? t('modelPlaza.dashboardDescription')
      : data?.site_subtitle && !(locale === 'en' && containsChinese(data.site_subtitle))
        ? data.site_subtitle
        : t('modelPlaza.publicDescription');

  const sortOptions: Array<{ key: SortKey; label: string }> = [
    { key: 'recommended', label: t('modelPlaza.sortOptions.recommended') },
    { key: 'name', label: t('modelPlaza.sortOptions.name') },
    { key: 'context', label: t('modelPlaza.sortOptions.context') },
    { key: 'priceAsc', label: t('modelPlaza.sortOptions.priceAsc') },
    { key: 'priceDesc', label: t('modelPlaza.sortOptions.priceDesc') },
  ];

  const resetFilters = () => {
    setSearch('');
    setActiveProvider('all');
    setActiveCapability('all');
    setActiveMode('all');
    setSortBy('recommended');
  };

  return (
    <div className="space-y-6">
      <div
        className={cn(
          'rounded-3xl border p-6 shadow-sm',
          variant === 'dashboard'
            ? 'border-gray-200 bg-white dark:border-gray-800 dark:bg-[#1A1A1A]'
            : 'border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:border-gray-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_rgba(17,24,39,0.92)_42%,_rgba(17,24,39,1)_100%)]'
        )}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/70 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-gray-900/60 dark:text-blue-300">
              <Sparkles className="h-3.5 w-3.5" />
              {t('modelPlaza.heroBadge')}
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">{pageTitle}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">{pageDescription}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {variant === 'public' ? (
              <Link
                href={localizedNewsPath}
                className="inline-flex items-center rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {t('dashboard.nav.news')}
              </Link>
            ) : null}
            {data?.doc_url ? (
              <Link
                href={data.doc_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {t('modelPlaza.actions.viewDocs')}
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
            ) : null}
            <Link
              href="/dashboard/keys"
              className="inline-flex items-center rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              {t('modelPlaza.actions.getKey')}
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <StatCard label={t('modelPlaza.stats.totalModels')} value={`${stats?.total_models ?? 0}`} icon={Cpu} />
          <StatCard label={t('modelPlaza.stats.providers')} value={`${stats?.provider_count ?? 0}`} icon={Database} />
          <StatCard label={t('modelPlaza.stats.pricedModels')} value={`${stats?.priced_model_count ?? 0}`} icon={Sparkles} />
          <StatCard label={t('modelPlaza.stats.cachedModels')} value={`${stats?.cached_model_count ?? 0}`} icon={Zap} />
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1A1A1A]">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <Layers3 className="h-4 w-4 text-blue-500" />
            {t('modelPlaza.filters.allProviders', { count: allModels.length })}
          </div>

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <FilterChip
              active={activeProvider === 'all'}
              onClick={() => setActiveProvider('all')}
              label={t('modelPlaza.filters.allProviders', { count: allModels.length })}
            />
            {providers.map((provider) => (
              <FilterChip
                key={provider.id}
                active={activeProvider === provider.id}
                onClick={() => setActiveProvider(provider.id)}
                label={`${provider.label} (${provider.model_count})`}
              />
            ))}
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_220px_220px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('modelPlaza.searchPlaceholder')}
                className="h-11 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-11 pr-4 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:bg-white dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400"
              />
            </div>

            <ControlSelect
              icon={Sparkles}
              label={t('modelPlaza.filters.modeLabel')}
              value={activeMode}
              onChange={setActiveMode}
              options={[
                { key: 'all', label: t('modelPlaza.filters.allModes') },
                ...modeOptions.map(([mode, count]) => ({
                  key: mode,
                  label: `${getModeLabel(mode, t)} (${count})`,
                })),
              ]}
            />

            <ControlSelect
              icon={ArrowDownUp}
              label={t('modelPlaza.filters.sortLabel')}
              value={sortBy}
              onChange={(value) => setSortBy(value as SortKey)}
              options={sortOptions.map((item) => ({ key: item.key, label: item.label }))}
            />

            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {t('modelPlaza.actions.reset')}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterChip
              active={activeCapability === 'all'}
              onClick={() => setActiveCapability('all')}
              label={t('modelPlaza.filters.allCapabilities')}
              compact
            />
            {capabilityOptions.map(([capability, count]) => (
              <FilterChip
                key={capability}
                active={activeCapability === capability}
                onClick={() => setActiveCapability(capability)}
                label={`${getCapabilityLabel(capability, t)} (${count})`}
                compact
              />
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryPill label={t('modelPlaza.results.showing')} value={`${filteredModels.length}`} />
            <SummaryPill label={t('modelPlaza.results.providers')} value={`${filteredSummary.providers}`} />
            <SummaryPill label={t('modelPlaza.results.priced')} value={`${filteredSummary.priced}`} />
            <SummaryPill label={t('modelPlaza.results.cacheReady')} value={`${filteredSummary.cacheReady}`} />
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-950/40"
            >
              {t('modelPlaza.actions.reload')}
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className={cn('grid gap-4', variant === 'dashboard' ? 'xl:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3')}>
          {Array.from({ length: variant === 'dashboard' ? 4 : 6 }).map((_, index) => (
            <div
              key={index}
              className={cn(
                'animate-pulse rounded-3xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900',
                variant === 'dashboard' ? 'h-72' : 'h-80'
              )}
            />
          ))}
        </div>
      ) : null}

      {!loading && !error && filteredModels.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-[#1A1A1A]">
          <p className="text-lg font-medium text-gray-900 dark:text-white">{t('modelPlaza.empty.title')}</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('modelPlaza.empty.description')}</p>
        </div>
      ) : null}

      {!loading && filteredModels.length > 0 ? (
        <div className={cn('grid gap-4', variant === 'dashboard' ? 'xl:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3')}>
          {filteredModels.map((model) => (
            <ModelCard key={model.id} model={model} variant={variant} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Cpu;
}) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/70 p-4 backdrop-blur dark:border-gray-800 dark:bg-gray-950/50">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
        <Icon className="h-4 w-4 text-blue-500 dark:text-blue-400" />
      </div>
      <div className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/40">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

function ControlSelect({
  icon: Icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ key: string; label: string }>;
}) {
  return (
    <label className="flex h-11 items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 dark:border-gray-700 dark:bg-gray-900">
      <Icon className="h-4 w-4 text-gray-400" />
      <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none dark:text-white"
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterChip({
  active,
  compact = false,
  label,
  onClick,
}: {
  active: boolean;
  compact?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full border text-sm transition-colors',
        compact ? 'px-3 py-1.5' : 'px-4 py-2',
        active
          ? 'border-blue-600 bg-blue-600 text-white'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-white'
      )}
    >
      {label}
    </button>
  );
}

function ModelCard({
  model,
  variant,
}: {
  model: ModelPlazaModel;
  variant: 'public' | 'dashboard';
}) {
  const { locale, t } = useI18n();

  return (
    <div
      className={cn(
        'rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-[#1A1A1A]',
        variant === 'dashboard' ? 'xl:p-6' : ''
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
              {model.provider_label}
            </span>
            {model.source_type ? (
              <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', getSourceBadgeClass(model.source_type))}>
                {getSourceLabel(model.source_type, t)}
              </span>
            ) : null}
            <span className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
              {getModeLabel(model.mode || 'chat', t)}
            </span>
            {model.supports_prompt_caching ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                {t('modelPlaza.badges.promptCache')}
              </span>
            ) : null}
            {model.supports_service_tier ? (
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                {t('modelPlaza.badges.serviceTier')}
              </span>
            ) : null}
          </div>
          <h3 className="mt-4 truncate text-xl font-semibold text-gray-900 dark:text-white">{model.display_name}</h3>
          <p className="mt-1 truncate font-mono text-xs text-gray-500 dark:text-gray-400">{model.id}</p>
        </div>

        <span className="shrink-0 rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {getPricingSourceLabel(model.pricing_source, t)}
        </span>
      </div>

      <p className={cn('mt-4 text-sm leading-6 text-gray-600 dark:text-gray-400', variant === 'dashboard' ? 'min-h-16' : 'min-h-20')}>
        {getLocalizedSummary(model, locale, t)}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {model.capabilities.map((capability) => (
          <span
            key={capability}
            className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300"
          >
            {getCapabilityLabel(capability, t)}
          </span>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <PriceItem label={t('modelPlaza.prices.input')} value={formatPrice(model.input_price_per_mtok, t)} />
        <PriceItem label={t('modelPlaza.prices.output')} value={formatPrice(model.output_price_per_mtok, t)} />
        <PriceItem label={t('modelPlaza.prices.cacheRead')} value={formatPrice(model.cache_read_price_per_mtok, t)} />
        <PriceItem label={t('modelPlaza.prices.cacheWrite')} value={formatPrice(model.cache_write_price_per_mtok, t)} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <MetricCard label={t('modelPlaza.longContextThreshold')} value={formatThreshold(model.long_context_threshold)} />
        <MetricCard label={t('modelPlaza.modelMode')} value={getModeLabel(model.mode || 'chat', t)} />
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm dark:bg-gray-900">
      <div className="text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 font-medium text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

function PriceItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 px-3 py-3 dark:border-gray-800">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}
