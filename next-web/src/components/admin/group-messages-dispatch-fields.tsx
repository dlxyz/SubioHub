import { ArrowRight, Plus, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { getMessagesDispatchPreset, type MessagesDispatchFormState, type MessagesDispatchPresetKind } from '@/lib/group-messages-dispatch';

type Props = {
  supported: boolean;
  enabled: boolean;
  platformLabel: string;
  routingProfile: string;
  defaultMappedModel: string;
  config: MessagesDispatchFormState;
  recommendedPresetKind: MessagesDispatchPresetKind;
  modelOptions: {
    defaultMappedModel: string[];
    opus: string[];
    sonnet: string[];
    haiku: string[];
    exactTarget: string[];
  };
  onToggleEnabled: () => void;
  onApplyPreset: (preset: MessagesDispatchPresetKind) => void;
  onChangeDefaultMappedModel: (value: string) => void;
  onChangeFamilyModel: (
    key: 'opus_mapped_model' | 'sonnet_mapped_model' | 'haiku_mapped_model',
    value: string
  ) => void;
  onAddExactMapping: () => void;
  onUpdateExactMapping: (id: string, key: 'claude_model' | 'target_model', value: string) => void;
  onRemoveExactMapping: (id: string) => void;
};

export function GroupMessagesDispatchFields({
  supported,
  enabled,
  platformLabel,
  routingProfile,
  defaultMappedModel,
  config,
  recommendedPresetKind,
  modelOptions,
  onToggleEnabled,
  onApplyPreset,
  onChangeDefaultMappedModel,
  onChangeFamilyModel,
  onAddExactMapping,
  onUpdateExactMapping,
  onRemoveExactMapping,
}: Props) {
  const domesticPreset = getMessagesDispatchPreset('domestic');
  const overseasPreset = getMessagesDispatchPreset('overseas');
  const recommendedPreset = getMessagesDispatchPreset(recommendedPresetKind);
  const examplePreset = recommendedPresetKind === 'domestic' ? domesticPreset : overseasPreset;
  const allConfiguredModels = [
    defaultMappedModel,
    config.opus_mapped_model,
    config.sonnet_mapped_model,
    config.haiku_mapped_model,
    ...config.exact_model_mappings.flatMap((row) => [row.target_model]),
  ]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const hasOverseasModelInDomesticGroup =
    routingProfile === 'domestic' &&
    allConfiguredModels.some((value) =>
      value.startsWith('gpt-') || value.startsWith('claude-') || value.startsWith('gemini') || value.startsWith('o1') || value.startsWith('o3')
    );

  const renderSuggestionButtons = (options: string[], onSelect: (value: string) => void) => {
    const suggestions = options.filter(Boolean).slice(0, 6);
    if (suggestions.length === 0) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestions.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSelect(option)}
            className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-300 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/20 dark:hover:text-indigo-300"
          >
            {option}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-base font-medium text-gray-900 dark:text-white">OpenAI Messages 调度配置</div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            管理 `Anthropic /v1/messages` 请求如何映射到 OpenAI 或国内 OpenAI 兼容模型。
          </div>
        </div>
        <button
          type="button"
          onClick={supported ? onToggleEnabled : undefined}
          disabled={!supported}
          className={`relative inline-flex h-7 w-12 rounded-full transition ${
            enabled ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'
          } ${supported ? '' : 'cursor-not-allowed opacity-60'}`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
              enabled ? 'left-6' : 'left-1'
            }`}
          />
        </button>
      </div>

      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {!supported
          ? `当前主调度平台是 ${platformLabel}，后端仅允许 OpenAI 分组配置这套 /v1/messages 映射规则。`
          : enabled
            ? '已开启 /v1/messages 调度，可继续配置模型映射。'
            : '关闭后，该分组不会接收 /v1/messages 请求。'}
      </p>

      {supported && enabled ? (
        <div className="mt-5 space-y-5">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium">推荐预设</div>
                <div className="mt-1 text-xs leading-6 text-emerald-700 dark:text-emerald-300">
                  当前分组是
                  {routingProfile === 'domestic' ? ' `国内渠道组` ' : routingProfile === 'mixed' ? ' `混合组` ' : ' `海外主调度组` '}
                  ，推荐先套用
                  {` ${recommendedPreset.label} `}
                  配置。
                  {recommendedPresetKind === 'domestic'
                    ? '国内上游通常应填写 `deepseek-* / qwen-* / glm-* / doubao-*` 这类模型，不要继续填 `gpt-* / claude-*`。'
                    : '海外 OpenAI 兼容链路可以继续使用 GPT 系列默认值。'}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onApplyPreset('domestic')}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition ${
                    recommendedPresetKind === 'domestic'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-white text-emerald-700 hover:bg-emerald-100 dark:bg-[#171717] dark:text-emerald-300 dark:hover:bg-emerald-950/30'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  套用国内推荐
                </button>
                <button
                  type="button"
                  onClick={() => onApplyPreset('overseas')}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition ${
                    recommendedPresetKind === 'overseas'
                      ? 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white'
                      : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-[#171717] dark:text-slate-300 dark:hover:bg-slate-900/40'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  套用海外推荐
                </button>
              </div>
            </div>
          </div>

          {hasOverseasModelInDomesticGroup ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
              <div className="flex items-center gap-2 font-medium">
                <TriangleAlert className="h-4 w-4" />
                当前是国内渠道组，但映射里仍有海外模型名
              </div>
              <div className="mt-1 text-xs leading-6">
                这类配置会让国内上游直接拒绝请求。建议点击上方 `套用国内推荐`，或手动改成 `deepseek-v4-pro / deepseek-v4-flash`
                这类国内模型。
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-300">
            精确映射优先于家族映射；如果都没命中，则再回退到 `默认兜底模型`。
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-gray-800">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div className="text-sm font-medium text-gray-900 dark:text-white">家族映射</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                按 `opus / sonnet / haiku` 系列设置默认转发模型。
              </div>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Opus 映射模型</label>
                <input
                  type="text"
                  value={config.opus_mapped_model}
                  onChange={(e) => onChangeFamilyModel('opus_mapped_model', e.target.value)}
                  list="messages-dispatch-opus-options"
                  placeholder={`例如 ${examplePreset.config.opus_mapped_model}`}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-indigo-400 dark:border-gray-700 dark:text-white"
                />
                <datalist id="messages-dispatch-opus-options">
                  {modelOptions.opus.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                {renderSuggestionButtons(modelOptions.opus, (value) => onChangeFamilyModel('opus_mapped_model', value))}
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Sonnet 映射模型</label>
                <input
                  type="text"
                  value={config.sonnet_mapped_model}
                  onChange={(e) => onChangeFamilyModel('sonnet_mapped_model', e.target.value)}
                  list="messages-dispatch-sonnet-options"
                  placeholder={`例如 ${examplePreset.config.sonnet_mapped_model}`}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-indigo-400 dark:border-gray-700 dark:text-white"
                />
                <datalist id="messages-dispatch-sonnet-options">
                  {modelOptions.sonnet.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                {renderSuggestionButtons(modelOptions.sonnet, (value) => onChangeFamilyModel('sonnet_mapped_model', value))}
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Haiku 映射模型</label>
                <input
                  type="text"
                  value={config.haiku_mapped_model}
                  onChange={(e) => onChangeFamilyModel('haiku_mapped_model', e.target.value)}
                  list="messages-dispatch-haiku-options"
                  placeholder={`例如 ${examplePreset.config.haiku_mapped_model}`}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-indigo-400 dark:border-gray-700 dark:text-white"
                />
                <datalist id="messages-dispatch-haiku-options">
                  {modelOptions.haiku.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                {renderSuggestionButtons(modelOptions.haiku, (value) => onChangeFamilyModel('haiku_mapped_model', value))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-gray-800">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div className="text-sm font-medium text-gray-900 dark:text-white">默认兜底模型</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                当请求进入 OpenAI 转发链但没有命中精确映射/家族映射时，使用该模型作为最终兜底。
              </div>
            </div>
            <div className="p-4">
              <input
                type="text"
                value={defaultMappedModel}
                onChange={(e) => onChangeDefaultMappedModel(e.target.value)}
                list="messages-dispatch-default-options"
                placeholder={`例如 ${examplePreset.defaultMappedModel}`}
                className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-indigo-400 dark:border-gray-700 dark:text-white"
              />
              <datalist id="messages-dispatch-default-options">
                {modelOptions.defaultMappedModel.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              {renderSuggestionButtons(modelOptions.defaultMappedModel, onChangeDefaultMappedModel)}
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/50">
            <div className="border-b border-indigo-200 bg-indigo-50/80 px-4 py-3 dark:border-indigo-900/50 dark:bg-indigo-950/20">
              <div className="text-sm font-medium text-indigo-900 dark:text-indigo-100">精确模型映射</div>
              <div className="mt-1 text-xs text-indigo-700/90 dark:text-indigo-300/90">
                用于将特定 `claude-*` 模型精确映射到指定的目标模型，优先级高于家族映射。小白场景通常只要先套用上方推荐预设即可。
              </div>
            </div>
            <div className="space-y-3 p-4">
              {config.exact_model_mappings.length === 0 ? (
                <button
                  type="button"
                  onClick={onAddExactMapping}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-indigo-200 px-4 py-4 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-900/50 dark:text-indigo-300 dark:hover:bg-indigo-950/20"
                >
                  <Plus className="h-4 w-4" />
                  新增精确映射
                </button>
              ) : (
                <>
                  {config.exact_model_mappings.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#171717]"
                    >
                      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] md:items-start">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Claude 模型</label>
                          <input
                            type="text"
                            value={row.claude_model}
                            onChange={(e) => onUpdateExactMapping(row.id, 'claude_model', e.target.value)}
                            placeholder="例如 claude-sonnet-4-20250514"
                            className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-indigo-400 dark:border-gray-700 dark:text-white"
                          />
                        </div>
                        <div className="hidden pt-10 text-indigo-300 dark:text-indigo-700 md:flex">
                          <ArrowRight className="h-4 w-4" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">目标模型</label>
                          <input
                            type="text"
                            value={row.target_model}
                            onChange={(e) => onUpdateExactMapping(row.id, 'target_model', e.target.value)}
                            list="messages-dispatch-exact-target-options"
                            placeholder={`例如 ${examplePreset.config.sonnet_mapped_model}`}
                            className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-indigo-400 dark:border-gray-700 dark:text-white"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveExactMapping(row.id)}
                          className="mt-8 inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20 dark:hover:text-red-400"
                          title="删除映射"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={onAddExactMapping}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 bg-white py-3 text-sm font-medium text-gray-500 transition hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 dark:border-gray-700 dark:bg-[#171717] dark:text-gray-400 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/20 dark:hover:text-indigo-300"
                  >
                    <Plus className="h-4 w-4" />
                    继续新增映射
                  </button>
                </>
              )}
              <datalist id="messages-dispatch-exact-target-options">
                {modelOptions.exactTarget.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
          </div>
        </div>
      ) : !supported ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="font-medium">当前分组不可编辑 Messages 映射</div>
          <div className="mt-1">
            要启用这套配置，需要把该分组的 `主调度平台` 改为 `OpenAI`。如果你只是想区分国内/海外，请继续使用 `用途 / 路由类型`。
          </div>
        </div>
      ) : null}
    </div>
  );
}
