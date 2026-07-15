"use client";

import { api } from "@/lib/api";
import type { AdminUser, PaginatedResult } from "@/lib/admin-api";

type ApiRecord = Record<string, unknown>;

function asRecord(payload: unknown): ApiRecord | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
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
  const hasEnvelope =
    record && ("code" in record || "message" in record) && "data" in record;
  return (hasEnvelope ? record?.data : payload) as T;
}

function normalizeArray<T>(payload: unknown): T[] {
  const unwrapped = unwrapData<unknown>(payload);
  if (Array.isArray(unwrapped)) return unwrapped as T[];
  const record = asRecord(unwrapped);
  const candidates = ["items", "data", "list", "results"];
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
    total: Number(
      getValue(record, "total", "count") ??
        getValue(pagination, "total", "Total") ??
        items.length ??
        0,
    ),
    page: Number(
      getValue(record, "page", "Page") ??
        getValue(pagination, "page", "Page") ??
        1,
    ),
    pageSize: Number(
      getValue(record, "page_size", "pageSize", "PageSize") ??
        getValue(pagination, "page_size", "pageSize", "PageSize") ??
        items.length ??
        0,
    ),
  };
}

export async function createPartnerAgent(payload: {
  email: string;
  password: string;
  username?: string;
  notes?: string;
}): Promise<AdminUser> {
  return (await api.post("/agent/agents", payload)) as AdminUser;
}

export async function listPartnerAgents(
  params?: Record<string, unknown>,
): Promise<PaginatedResult<AdminUser>> {
  const payload = (await api.get("/agent/agents", { params })) as unknown;
  return normalizePaginated<AdminUser>(payload);
}

export async function updatePartnerAgentRate(
  id: number,
  rate: number,
): Promise<{ message?: string }> {
  return (await api.post(`/agent/agents/${id}/rate`, { rate })) as {
    message?: string;
  };
}

export async function updatePartnerAgentStatus(
  id: number,
  status: "active" | "disabled",
): Promise<AdminUser> {
  return (await api.put(`/agent/agents/${id}/status`, { status })) as AdminUser;
}

export async function listPartnerDistributors(
  params?: Record<string, unknown>,
): Promise<PaginatedResult<AdminUser>> {
  const payload = (await api.get("/agent/distributors", { params })) as unknown;
  return normalizePaginated<AdminUser>(payload);
}
