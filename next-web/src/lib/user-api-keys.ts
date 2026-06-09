import { api } from '@/lib/api';

export type UserAPIKeyGroup = {
  id: number;
  name: string;
  platform: string;
  routing_profile?: string;
  status: string;
};

export type UserAPIKey = {
  id: number;
  user_id: number;
  key: string;
  name: string;
  group_id?: number | null;
  status: string;
  quota: number;
  quota_used: number;
  expires_at?: string | null;
  last_used_at?: string | null;
  created_at: string;
  updated_at: string;
  group?: UserAPIKeyGroup | null;
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type ListUserAPIKeysParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
};

export type CreateUserAPIKeyPayload = {
  name: string;
  group_id?: number | null;
  quota?: number;
  expires_in_days?: number;
};

export type UpdateUserAPIKeyPayload = {
  name?: string;
  group_id?: number | null;
  status?: 'active' | 'inactive';
  quota?: number;
  expires_at?: string;
};

type ApiListPayload<T> = {
  items?: T[];
  total?: number;
  page?: number;
  page_size?: number;
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

export async function listUserAPIKeys(params: ListUserAPIKeysParams = {}): Promise<PaginatedResult<UserAPIKey>> {
  const payload = (await api.get<ApiListPayload<UserAPIKey>>('/keys', {
    params: {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
      search: params.search?.trim() || undefined,
      status: params.status || undefined,
    },
  })) as unknown;
  return normalizePaginated<UserAPIKey>(payload);
}

export async function listAvailableUserGroups(): Promise<UserAPIKeyGroup[]> {
  const payload = (await api.get<UserAPIKeyGroup[]>('/groups/available')) as unknown;
  return Array.isArray(payload) ? (payload as UserAPIKeyGroup[]) : [];
}

export async function createUserAPIKey(payload: CreateUserAPIKeyPayload): Promise<UserAPIKey> {
  return (await api.post<UserAPIKey>('/keys', payload)) as UserAPIKey;
}

export async function updateUserAPIKey(id: number, payload: UpdateUserAPIKeyPayload): Promise<UserAPIKey> {
  return (await api.put<UserAPIKey>(`/keys/${id}`, payload)) as UserAPIKey;
}

export async function deleteUserAPIKey(id: number): Promise<{ message?: string }> {
  const payload = (await api.delete<{ message?: string }>(`/keys/${id}`)) as unknown;
  const record = asRecord(payload);
  return record ? { message: typeof record.message === 'string' ? record.message : undefined } : {};
}
