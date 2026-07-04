'use client';

import { api } from '@/lib/api';
import type { AdminChannel, AdminCommissionLog, AdminProxy, AdminUser, PaginatedResult } from '@/lib/admin-api';

type ApiRecord = Record<string, unknown>;

function asRecord(payload: unknown): ApiRecord | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  return payload as ApiRecord;
}

function getValue(record: ApiRecord | null, ...keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function unwrapData<T>(payload: unknown): T {
  const record = asRecord(payload);
  const hasEnvelope = record && ('code' in record || 'message' in record) && 'data' in record;
  return (hasEnvelope ? record?.data : payload) as T;
}

function normalizeArray<T>(payload: unknown): T[] {
  const unwrapped = unwrapData<unknown>(payload);
  if (Array.isArray(unwrapped)) return unwrapped as T[];
  const record = asRecord(unwrapped);
  const candidates = ['items', 'data', 'list', 'results'];
  for (const key of candidates) {
    const value = record?.[key];
    if (Array.isArray(value)) {
      return value as T[];
    }
  }
  return [];
}

function normalizePaginated<T>(payload: unknown): PaginatedResult<T> {
  const unwrapped = unwrapData<unknown>(payload);
  const items = normalizeArray<T>(unwrapped);
  const record = asRecord(unwrapped);
  const pagination = asRecord(record?.pagination);
  return {
    items,
    total: Number(getValue(record, 'total', 'count') ?? getValue(pagination, 'total', 'Total') ?? items.length ?? 0),
    page: Number(getValue(record, 'page', 'Page') ?? getValue(pagination, 'page', 'Page') ?? 1),
    pageSize: Number(
      getValue(record, 'page_size', 'pageSize', 'PageSize') ??
        getValue(pagination, 'page_size', 'pageSize', 'PageSize') ??
        items.length ??
        0
    ),
  };
}

function normalizeCommissionLog(payload: unknown): AdminCommissionLog {
  const record = asRecord(payload);
  const inviteeIDValue = getValue(record, 'invitee_id', 'InviteeID');
  return {
    id: Number(getValue(record, 'id', 'ID') ?? 0),
    user_id: Number(getValue(record, 'user_id', 'UserID') ?? 0),
    invitee_id: inviteeIDValue == null ? null : Number(inviteeIDValue),
    order_id: (getValue(record, 'order_id', 'OrderID') as number | null | undefined) ?? null,
    amount: Number(getValue(record, 'amount', 'Amount') ?? 0),
    status: String(getValue(record, 'status', 'Status') ?? ''),
    reason: String(getValue(record, 'reason', 'Reason') ?? ''),
    created_at: getValue(record, 'created_at', 'CreatedAt') as string | undefined,
    updated_at: getValue(record, 'updated_at', 'UpdatedAt') as string | undefined,
  };
}

export async function listAgentProxyPage(params?: Record<string, unknown>): Promise<PaginatedResult<AdminProxy>> {
  const payload = unwrapData<unknown>((await api.get('/agent/proxies', { params })) as unknown);
  return normalizePaginated<AdminProxy>(payload);
}

export async function listAgentChannels(params?: Record<string, unknown>): Promise<PaginatedResult<AdminChannel>> {
  const payload = (await api.get('/agent/channels', { params })) as unknown;
  return normalizePaginated<AdminChannel>(payload);
}

export async function listAgentAffiliateCommissions(
  params?: Record<string, unknown>
): Promise<PaginatedResult<AdminCommissionLog>> {
  const payload = unwrapData<unknown>((await api.get('/agent/affiliate/commissions', { params })) as unknown);
  const record = asRecord(payload);
  const pagination = asRecord(record?.pagination);
  const items = normalizeArray<ApiRecord>(payload).map(normalizeCommissionLog);
  return {
    items,
    total: Number(getValue(pagination, 'total', 'Total') ?? getValue(record, 'total') ?? items.length ?? 0),
    page: Number(getValue(pagination, 'page', 'Page') ?? getValue(record, 'page') ?? params?.page ?? 1),
    pageSize: Number(
      getValue(pagination, 'page_size', 'pageSize', 'PageSize') ??
        getValue(record, 'page_size') ??
        params?.page_size ??
        items.length ??
        0
    ),
  };
}

export async function createAgentDistributor(payload: {
  email: string;
  password: string;
  username?: string;
  notes?: string;
}): Promise<AdminUser> {
  return (await api.post('/agent/distributors', payload)) as AdminUser;
}

export async function listAgentDistributors(params?: Record<string, unknown>): Promise<PaginatedResult<AdminUser>> {
  const payload = (await api.get('/agent/distributors', { params })) as unknown;
  return normalizePaginated<AdminUser>(payload);
}

export async function updateAgentDistributorRate(id: number, rate: number): Promise<{ message?: string }> {
  return (await api.post(`/agent/distributors/${id}/rate`, { rate })) as { message?: string };
}

export async function updateAgentDistributorStatus(id: number, status: 'active' | 'disabled'): Promise<AdminUser> {
  return (await api.put(`/agent/distributors/${id}/status`, { status })) as AdminUser;
}
