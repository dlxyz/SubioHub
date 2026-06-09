'use client';

import { api } from '@/lib/api';

type ApiRecord = Record<string, unknown>;

function asRecord(payload: unknown): ApiRecord | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  return payload as ApiRecord;
}

function unwrapData<T>(payload: unknown): T {
  const record = asRecord(payload);
  const hasEnvelope = record && ('code' in record || 'message' in record) && 'data' in record;
  return (hasEnvelope ? record?.data : payload) as T;
}

export interface DomesticChannelConnectionTestResult {
  success: boolean;
  status_code: number;
  message: string;
  request_id?: string;
  upstream_model?: string;
  response_preview?: string;
  duration_ms?: number;
}

export interface DomesticChannelResponsesTestResult {
  success: boolean;
  status_code: number;
  message: string;
  request_id?: string;
  upstream_model?: string;
  response_preview?: string;
  duration_ms?: number;
}

export interface DomesticChannelMessagesTestResult {
  success: boolean;
  status_code: number;
  message: string;
  request_id?: string;
  upstream_model?: string;
  response_preview?: string;
  duration_ms?: number;
}

export interface DomesticChannelModelsFetchResult {
  success: boolean;
  status_code: number;
  message: string;
  request_id?: string;
  models?: string[];
  capability_models?: Record<string, string[]>;
  model_catalog?: DomesticFetchedModelMetadata[];
  response_preview?: string;
  duration_ms?: number;
}

export interface DomesticFetchedModelMetadata {
  id?: string;
  name?: string;
  version?: string;
  domain?: string;
  task_type?: string;
  status?: string;
  capabilities?: string[];
}

export interface DomesticChannelDiagnosticPayload {
  provider_type: string;
  provider_config: Record<string, unknown>;
  test_model?: string;
}

export async function testDomesticChannelConnection(
  payload: DomesticChannelDiagnosticPayload
): Promise<DomesticChannelConnectionTestResult> {
  return unwrapData<DomesticChannelConnectionTestResult>((await api.post('/admin/channels/test-connection', payload)) as unknown);
}

export async function testDomesticChannelResponses(
  payload: DomesticChannelDiagnosticPayload
): Promise<DomesticChannelResponsesTestResult> {
  return unwrapData<DomesticChannelResponsesTestResult>((await api.post('/admin/channels/test-responses', payload)) as unknown);
}

export async function testDomesticChannelMessages(
  payload: DomesticChannelDiagnosticPayload
): Promise<DomesticChannelMessagesTestResult> {
  return unwrapData<DomesticChannelMessagesTestResult>((await api.post('/admin/channels/test-messages', payload)) as unknown);
}

export async function fetchDomesticChannelModels(
  payload: DomesticChannelDiagnosticPayload
): Promise<DomesticChannelModelsFetchResult> {
  return unwrapData<DomesticChannelModelsFetchResult>((await api.post('/admin/channels/fetch-models', payload)) as unknown);
}
