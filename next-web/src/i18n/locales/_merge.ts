import type { MessageTree } from '@/i18n/schema';
import type { MessageSchema } from '@/i18n/messages';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function mergeMessages(base: MessageSchema, overrides: MessageTree): MessageSchema {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    const baseValue = result[key];
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      result[key] = mergeMessages(baseValue as MessageTree, value);
      continue;
    }
    result[key] = value;
  }

  return result as MessageSchema;
}
