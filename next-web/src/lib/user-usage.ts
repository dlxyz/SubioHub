import { api } from '@/lib/api';

export type UserUsageLog = {
  id: number;
  user_id: number;
  api_key_id: number;
  request_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_cost: number;
  actual_cost: number;
  duration_ms: number;
  first_token_ms?: number | null;
  stream: boolean;
  ip_address?: string | null;
  created_at: string;
  api_key?: {
    id: number;
    name: string;
  } | null;
};

export type UserUsageStats = {
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_tokens: number;
  total_tokens: number;
  total_cost: number;
  total_actual_cost: number;
  average_duration_ms: number;
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type ListUserUsageParams = {
  page?: number;
  pageSize?: number;
  apiKeyId?: number;
  model?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

export type UserDashboardStats = {
  total_api_keys: number;
  active_api_keys: number;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  total_tokens: number;
  total_cost: number;
  total_actual_cost: number;
  today_requests: number;
  today_input_tokens: number;
  today_output_tokens: number;
  today_cache_creation_tokens: number;
  today_cache_read_tokens: number;
  today_tokens: number;
  today_cost: number;
  today_actual_cost: number;
  average_duration_ms: number;
  rpm: number;
  tpm: number;
};

export type UserUsageTrendPoint = {
  date: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  cost: number;
  actual_cost: number;
};

export type UserModelUsageStat = {
  model: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  cost: number;
  actual_cost: number;
  account_cost: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizePaginated<T>(payload: unknown): PaginatedResult<T> {
  const record = asRecord(payload);
  const items = Array.isArray(record?.items) ? (record.items as T[]) : [];
  return {
    items,
    total: Number(record?.total ?? items.length ?? 0),
    page: Number(record?.page ?? 1),
    pageSize: Number(record?.page_size ?? items.length ?? 0),
  };
}

export async function listUserUsageLogs(params: ListUserUsageParams = {}): Promise<PaginatedResult<UserUsageLog>> {
  const payload = (await api.get('/usage', {
    params: {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
      api_key_id: params.apiKeyId || undefined,
      model: params.model?.trim() || undefined,
      start_date: params.startDate || undefined,
      end_date: params.endDate || undefined,
      sort_by: params.sortBy || 'created_at',
      sort_order: params.sortOrder || 'desc',
    },
  })) as unknown;

  return normalizePaginated<UserUsageLog>(payload);
}

export async function getUserUsageStats(params: {
  apiKeyId?: number;
  startDate?: string;
  endDate?: string;
} = {}): Promise<UserUsageStats> {
  const payload = (await api.get('/usage/stats', {
    params: {
      api_key_id: params.apiKeyId || undefined,
      start_date: params.startDate || undefined,
      end_date: params.endDate || undefined,
    },
  })) as unknown;

  const record = asRecord(payload);
  return {
    total_requests: Number(record?.total_requests ?? 0),
    total_input_tokens: Number(record?.total_input_tokens ?? 0),
    total_output_tokens: Number(record?.total_output_tokens ?? 0),
    total_cache_tokens: Number(record?.total_cache_tokens ?? 0),
    total_tokens: Number(record?.total_tokens ?? 0),
    total_cost: Number(record?.total_cost ?? 0),
    total_actual_cost: Number(record?.total_actual_cost ?? 0),
    average_duration_ms: Number(record?.average_duration_ms ?? 0),
  };
}

export async function getUserDashboardStats(): Promise<UserDashboardStats> {
  const payload = (await api.get('/usage/dashboard/stats')) as unknown;
  const record = asRecord(payload);
  return {
    total_api_keys: Number(record?.total_api_keys ?? 0),
    active_api_keys: Number(record?.active_api_keys ?? 0),
    total_requests: Number(record?.total_requests ?? 0),
    total_input_tokens: Number(record?.total_input_tokens ?? 0),
    total_output_tokens: Number(record?.total_output_tokens ?? 0),
    total_cache_creation_tokens: Number(record?.total_cache_creation_tokens ?? 0),
    total_cache_read_tokens: Number(record?.total_cache_read_tokens ?? 0),
    total_tokens: Number(record?.total_tokens ?? 0),
    total_cost: Number(record?.total_cost ?? 0),
    total_actual_cost: Number(record?.total_actual_cost ?? 0),
    today_requests: Number(record?.today_requests ?? 0),
    today_input_tokens: Number(record?.today_input_tokens ?? 0),
    today_output_tokens: Number(record?.today_output_tokens ?? 0),
    today_cache_creation_tokens: Number(record?.today_cache_creation_tokens ?? 0),
    today_cache_read_tokens: Number(record?.today_cache_read_tokens ?? 0),
    today_tokens: Number(record?.today_tokens ?? 0),
    today_cost: Number(record?.today_cost ?? 0),
    today_actual_cost: Number(record?.today_actual_cost ?? 0),
    average_duration_ms: Number(record?.average_duration_ms ?? 0),
    rpm: Number(record?.rpm ?? 0),
    tpm: Number(record?.tpm ?? 0),
  };
}

export async function getUserDashboardTrend(params: {
  startDate?: string;
  endDate?: string;
  granularity?: 'day' | 'hour';
} = {}): Promise<UserUsageTrendPoint[]> {
  const payload = (await api.get('/usage/dashboard/trend', {
    params: {
      start_date: params.startDate || undefined,
      end_date: params.endDate || undefined,
      granularity: params.granularity || 'day',
    },
  })) as unknown;

  const record = asRecord(payload);
  return Array.isArray(record?.trend) ? (record.trend as UserUsageTrendPoint[]) : [];
}

export async function getUserDashboardModels(params: {
  startDate?: string;
  endDate?: string;
} = {}): Promise<UserModelUsageStat[]> {
  const payload = (await api.get('/usage/dashboard/models', {
    params: {
      start_date: params.startDate || undefined,
      end_date: params.endDate || undefined,
    },
  })) as unknown;

  const record = asRecord(payload);
  return Array.isArray(record?.models) ? (record.models as UserModelUsageStat[]) : [];
}
