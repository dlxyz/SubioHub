'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type {
  DomesticChannelConnectionTestResult,
  DomesticChannelMessagesTestResult,
  DomesticChannelModelsFetchResult,
  DomesticChannelResponsesTestResult,
} from '@/lib/admin-domestic-channel-api';

type Props = {
  onTestConnection: () => Promise<DomesticChannelConnectionTestResult>;
  onTestMessages: () => Promise<DomesticChannelMessagesTestResult>;
  onTestResponses: () => Promise<DomesticChannelResponsesTestResult>;
  onFetchModels: () => Promise<DomesticChannelModelsFetchResult>;
};

type RunningAction = 'connection' | 'messages' | 'responses' | 'models' | null;
const CAPABILITY_LABELS: Record<string, string> = {
  chat: 'Chat',
  embeddings: 'Embeddings',
  rerank: 'Rerank',
};

function capabilityBadgeClass(capability: string) {
  switch (capability) {
    case 'chat':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300';
    case 'embeddings':
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300';
    case 'rerank':
      return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-300';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300';
  }
}

function ResultCard({
  title,
  success,
  statusCode,
  message,
  requestID,
  upstreamModel,
  durationMs,
  preview,
}: {
  title: string;
  success: boolean;
  statusCode: number;
  message: string;
  requestID?: string;
  upstreamModel?: string;
  durationMs?: number;
  preview?: string;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        success
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
      }`}
    >
      <div className="font-medium">{title}</div>
      <div className="mt-1">状态码：{statusCode}，耗时：{durationMs ?? 0}ms</div>
      <div className="mt-1">{message}</div>
      {upstreamModel ? <div className="mt-1">上游模型：{upstreamModel}</div> : null}
      {requestID ? <div className="mt-1">请求 ID：{requestID}</div> : null}
      {preview ? (
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-white/70 p-3 text-xs dark:bg-black/20">
          {preview}
        </pre>
      ) : null}
    </div>
  );
}

export function DomesticChannelDiagnosticsPanel({
  onTestConnection,
  onTestMessages,
  onTestResponses,
  onFetchModels,
}: Props) {
  const [runningAction, setRunningAction] = useState<RunningAction>(null);
  const [diagnosticError, setDiagnosticError] = useState('');
  const [connectionResult, setConnectionResult] = useState<DomesticChannelConnectionTestResult | null>(null);
  const [messagesResult, setMessagesResult] = useState<DomesticChannelMessagesTestResult | null>(null);
  const [responsesResult, setResponsesResult] = useState<DomesticChannelResponsesTestResult | null>(null);
  const [modelsResult, setModelsResult] = useState<DomesticChannelModelsFetchResult | null>(null);

  const runAction = async (
    action: RunningAction,
    runner: () => Promise<DomesticChannelConnectionTestResult | DomesticChannelResponsesTestResult | DomesticChannelModelsFetchResult>
  ) => {
    setDiagnosticError('');
    setRunningAction(action);
    try {
      const result = await runner();
      if (action === 'connection') {
        setConnectionResult(result as DomesticChannelConnectionTestResult);
      } else if (action === 'messages') {
        setMessagesResult(result as DomesticChannelMessagesTestResult);
      } else if (action === 'responses') {
        setResponsesResult(result as DomesticChannelResponsesTestResult);
      } else if (action === 'models') {
        setModelsResult(result as DomesticChannelModelsFetchResult);
      }
    } catch (error) {
      setDiagnosticError(error instanceof Error ? error.message : '执行诊断失败');
    } finally {
      setRunningAction(null);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">联调诊断</div>
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            独立验证 `chat/completions`、`responses` 链路，以及上游可用模型列表。
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runAction('connection', onTestConnection)}
            disabled={runningAction !== null}
            className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 px-4 py-2.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
          >
            {runningAction === 'connection' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {runningAction === 'connection' ? '测试中' : '测试 Chat'}
          </button>
          <button
            type="button"
            onClick={() => void runAction('messages', onTestMessages)}
            disabled={runningAction !== null}
            className="inline-flex items-center gap-2 rounded-2xl border border-orange-200 px-4 py-2.5 text-sm font-medium text-orange-700 transition hover:bg-orange-50 disabled:opacity-60 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-950/30"
          >
            {runningAction === 'messages' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {runningAction === 'messages' ? '测试中' : '测试 Messages'}
          </button>
          <button
            type="button"
            onClick={() => void runAction('responses', onTestResponses)}
            disabled={runningAction !== null}
            className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 px-4 py-2.5 text-sm font-medium text-blue-700 transition hover:bg-blue-50 disabled:opacity-60 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/30"
          >
            {runningAction === 'responses' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {runningAction === 'responses' ? '测试中' : '测试 Responses'}
          </button>
          <button
            type="button"
            onClick={() => void runAction('models', onFetchModels)}
            disabled={runningAction !== null}
            className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 px-4 py-2.5 text-sm font-medium text-violet-700 transition hover:bg-violet-50 disabled:opacity-60 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950/30"
          >
            {runningAction === 'models' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {runningAction === 'models' ? '拉取中' : '拉取模型列表'}
          </button>
        </div>
      </div>

      {diagnosticError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {diagnosticError}
        </div>
      ) : null}

      <div className="space-y-3">
        {connectionResult ? (
          <ResultCard
            title={connectionResult.success ? 'Chat 测试成功' : 'Chat 测试失败'}
            success={connectionResult.success}
            statusCode={connectionResult.status_code}
            message={connectionResult.message}
            requestID={connectionResult.request_id}
            upstreamModel={connectionResult.upstream_model}
            durationMs={connectionResult.duration_ms}
            preview={connectionResult.response_preview}
          />
        ) : null}
        {messagesResult ? (
          <ResultCard
            title={messagesResult.success ? 'Messages 测试成功' : 'Messages 测试失败'}
            success={messagesResult.success}
            statusCode={messagesResult.status_code}
            message={messagesResult.message}
            requestID={messagesResult.request_id}
            upstreamModel={messagesResult.upstream_model}
            durationMs={messagesResult.duration_ms}
            preview={messagesResult.response_preview}
          />
        ) : null}
        {responsesResult ? (
          <ResultCard
            title={responsesResult.success ? 'Responses 测试成功' : 'Responses 测试失败'}
            success={responsesResult.success}
            statusCode={responsesResult.status_code}
            message={responsesResult.message}
            requestID={responsesResult.request_id}
            upstreamModel={responsesResult.upstream_model}
            durationMs={responsesResult.duration_ms}
            preview={responsesResult.response_preview}
          />
        ) : null}
        {modelsResult ? (
          <div className="space-y-3">
            <ResultCard
              title={modelsResult.success ? `模型列表拉取成功（${modelsResult.models?.length || 0} 个）` : '模型列表拉取失败'}
              success={modelsResult.success}
              statusCode={modelsResult.status_code}
              message={modelsResult.message}
              requestID={modelsResult.request_id}
              durationMs={modelsResult.duration_ms}
              preview={modelsResult.response_preview}
            />
            {modelsResult.success && modelsResult.capability_models ? (
              <div className="rounded-2xl border border-violet-200 bg-violet-50/70 px-4 py-3 text-sm text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-violet-100">
                <div className="font-medium">能力分类</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(modelsResult.capability_models).map(([capability, models]) => (
                    <span
                      key={capability}
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${capabilityBadgeClass(capability)}`}
                    >
                      {CAPABILITY_LABELS[capability] || capability} {models.length}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
