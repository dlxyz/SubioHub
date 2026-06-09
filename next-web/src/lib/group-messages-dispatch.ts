import type { OpenAIMessagesDispatchModelConfig } from '@/lib/admin-api';

export type MessagesDispatchMappingRow = {
  id: string;
  claude_model: string;
  target_model: string;
};

export type MessagesDispatchFormState = {
  opus_mapped_model: string;
  sonnet_mapped_model: string;
  haiku_mapped_model: string;
  exact_model_mappings: MessagesDispatchMappingRow[];
};

export type MessagesDispatchPresetKind = 'domestic' | 'overseas';

export type MessagesDispatchPreset = {
  kind: MessagesDispatchPresetKind;
  label: string;
  description: string;
  defaultMappedModel: string;
  config: MessagesDispatchFormState;
};

function createRowID() {
  return `mapping-${Math.random().toString(36).slice(2, 10)}`;
}

export function createMessagesDispatchMappingRow(
  initial?: Partial<Pick<MessagesDispatchMappingRow, 'claude_model' | 'target_model'>>
): MessagesDispatchMappingRow {
  return {
    id: createRowID(),
    claude_model: initial?.claude_model || '',
    target_model: initial?.target_model || '',
  };
}

function cloneMessagesDispatchFormState(state: MessagesDispatchFormState): MessagesDispatchFormState {
  return {
    opus_mapped_model: state.opus_mapped_model,
    sonnet_mapped_model: state.sonnet_mapped_model,
    haiku_mapped_model: state.haiku_mapped_model,
    exact_model_mappings: state.exact_model_mappings.map((row) => createMessagesDispatchMappingRow(row)),
  };
}

const OVERSEAS_PRESET: MessagesDispatchPreset = {
  kind: 'overseas',
  label: '海外推荐',
  description: '适合 OpenAI 海外兼容链路，默认使用 GPT 系列模型。',
  defaultMappedModel: 'gpt-5.3-codex',
  config: {
    opus_mapped_model: 'gpt-5.4',
    sonnet_mapped_model: 'gpt-5.3-codex',
    haiku_mapped_model: 'gpt-5.4-mini',
    exact_model_mappings: [],
  },
};

const DOMESTIC_PRESET: MessagesDispatchPreset = {
  kind: 'domestic',
  label: '国内推荐',
  description: '适合 DeepSeek 等国内 OpenAI 兼容上游，默认使用 DeepSeek v4 系列模型。',
  defaultMappedModel: 'deepseek-v4-flash',
  config: {
    opus_mapped_model: 'deepseek-v4-pro',
    sonnet_mapped_model: 'deepseek-v4-flash',
    haiku_mapped_model: 'deepseek-v4-flash',
    exact_model_mappings: [],
  },
};

export function getRecommendedMessagesDispatchPresetKind(routingProfile?: string): MessagesDispatchPresetKind {
  return routingProfile === 'domestic' ? 'domestic' : 'overseas';
}

export function getMessagesDispatchPreset(kind: MessagesDispatchPresetKind): MessagesDispatchPreset {
  const preset = kind === 'domestic' ? DOMESTIC_PRESET : OVERSEAS_PRESET;
  return {
    ...preset,
    config: cloneMessagesDispatchFormState(preset.config),
  };
}

export function createDefaultMessagesDispatchFormState(kind: MessagesDispatchPresetKind = 'overseas'): MessagesDispatchFormState {
  return getMessagesDispatchPreset(kind).config;
}

export function isMessagesDispatchFormStateEquivalent(
  left: MessagesDispatchFormState,
  right: MessagesDispatchFormState
): boolean {
  const normalizeExactMappings = (rows: MessagesDispatchMappingRow[]) =>
    rows
      .map((row) => [row.claude_model.trim(), row.target_model.trim()] as const)
      .filter(([claudeModel, targetModel]) => claudeModel || targetModel)
      .sort(([leftClaude, leftTarget], [rightClaude, rightTarget]) =>
        `${leftClaude}:${leftTarget}`.localeCompare(`${rightClaude}:${rightTarget}`)
      );

  return (
    left.opus_mapped_model.trim() === right.opus_mapped_model.trim() &&
    left.sonnet_mapped_model.trim() === right.sonnet_mapped_model.trim() &&
    left.haiku_mapped_model.trim() === right.haiku_mapped_model.trim() &&
    JSON.stringify(normalizeExactMappings(left.exact_model_mappings)) ===
      JSON.stringify(normalizeExactMappings(right.exact_model_mappings))
  );
}

export function messagesDispatchConfigToFormState(
  config?: OpenAIMessagesDispatchModelConfig | null,
  presetKind: MessagesDispatchPresetKind = 'overseas'
): MessagesDispatchFormState {
  const defaults = createDefaultMessagesDispatchFormState(presetKind);
  const exactMappings = Object.entries(config?.exact_model_mappings || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([claude_model, target_model]) => createMessagesDispatchMappingRow({ claude_model, target_model }));

  return {
    opus_mapped_model: config?.opus_mapped_model?.trim() || defaults.opus_mapped_model,
    sonnet_mapped_model: config?.sonnet_mapped_model?.trim() || defaults.sonnet_mapped_model,
    haiku_mapped_model: config?.haiku_mapped_model?.trim() || defaults.haiku_mapped_model,
    exact_model_mappings: exactMappings,
  };
}

export function messagesDispatchFormStateToConfig(state: MessagesDispatchFormState): OpenAIMessagesDispatchModelConfig {
  const exactModelMappings = Object.fromEntries(
    state.exact_model_mappings
      .map((row) => [row.claude_model.trim(), row.target_model.trim()] as const)
      .filter(([claudeModel, targetModel]) => claudeModel && targetModel)
  );

  return {
    opus_mapped_model: state.opus_mapped_model.trim(),
    sonnet_mapped_model: state.sonnet_mapped_model.trim(),
    haiku_mapped_model: state.haiku_mapped_model.trim(),
    exact_model_mappings: exactModelMappings,
  };
}
