"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type CodexClientMethod,
  type CodexClientRequestByMethod,
  type CodexClientResultByMethod,
  type ThreadArchiveParams,
  type ThreadArchiveResult,
  type ThreadListParams,
  type ThreadListResult,
  type ThreadResumeParams,
  type ThreadResumeResult,
  type ThreadStartParams,
  type ThreadStartResult,
  type ThreadSummary,
} from "../_lib/codex-protocol";

interface JsonRecord {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeThreadSummary(value: unknown): ThreadSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const threadId = asString(value.threadId) ?? asString(value.id);
  if (!threadId) {
    return null;
  }

  const createdAtRaw = asString(value.createdAt) ?? (typeof value.createdAt === "number" ? new Date(value.createdAt * 1000).toISOString() : null);
  const updatedAtRaw = asString(value.updatedAt) ?? (typeof value.updatedAt === "number" ? new Date(value.updatedAt * 1000).toISOString() : null);
  const createdAt = createdAtRaw ?? new Date(0).toISOString();
  const updatedAt = updatedAtRaw ?? createdAt;
  const model = asString(value.model);
  const title = asString(value.title) ?? asString(value.preview);
  const isArchived = Boolean(value.isArchived ?? value.archived ?? false);
  const lastTurnId = asString(value.lastTurnId);

  return {
    threadId,
    title,
    model,
    updatedAt,
    createdAt,
    isArchived,
    lastTurnId,
  };
}

function normalizeThreadListResult(raw: unknown): ThreadSummary[] {
  if (!isRecord(raw)) {
    return [];
  }

  const direct = Array.isArray(raw.threads) ? raw.threads : null;
  const dataArray = isRecord(raw.data) && Array.isArray(raw.data.items)
    ? raw.data.items
    : Array.isArray(raw.data)
      ? raw.data
      : null;
  const source = direct ?? dataArray ?? [];

  return source
    .map((entry) => normalizeThreadSummary(entry))
    .filter((entry): entry is ThreadSummary => entry !== null);
}

function normalizeThreadStartResult(raw: unknown): ThreadStartResult {
  if (!isRecord(raw)) {
    throw new Error("Invalid thread/start response");
  }

  const threadObj = isRecord(raw.thread) ? raw.thread : null;
  const threadId = asString(raw.threadId) ?? (threadObj ? asString(threadObj.id) : null);
  if (!threadId) {
    throw new Error("Missing thread ID in thread/start response");
  }

  return {
    threadId,
    model: asString(raw.model) ?? (threadObj ? asString(threadObj.model) : null),
    createdAt: asString(raw.createdAt) ?? (threadObj ? asString(threadObj.createdAt) ?? undefined : undefined),
  };
}

function normalizeThreadResumeResult(raw: unknown): ThreadResumeResult {
  if (!isRecord(raw)) {
    throw new Error("Invalid thread/resume response");
  }

  const threadObj = isRecord(raw.thread) ? raw.thread : null;
  const threadId = asString(raw.threadId) ?? (threadObj ? asString(threadObj.id) : null);
  if (!threadId) {
    throw new Error("Missing thread ID in thread/resume response");
  }

  return {
    threadId,
    resumed: true,
    model: asString(raw.model) ?? (threadObj ? asString(threadObj.model) : null),
  };
}

function normalizeThreadArchiveResult(raw: unknown, fallbackThreadId: string): ThreadArchiveResult {
  if (!isRecord(raw)) {
    return {
      threadId: fallbackThreadId,
      archived: true,
    };
  }

  return {
    threadId: asString(raw.threadId) ?? fallbackThreadId,
    archived: typeof raw.archived === "boolean" ? raw.archived : true,
  };
}

function normalizeThreadStartParams(params: ThreadStartParams): ThreadStartParams {
  const approvalPolicy = params.approvalPolicy === "onRequest" ? "on-request" : params.approvalPolicy;
  const rawSandbox = params.sandboxPolicy;
  const sandboxType =
    rawSandbox?.type === "workspace-write"
      ? "workspaceWrite"
      : rawSandbox?.type === "danger-full-access"
        ? "dangerFullAccess"
        : rawSandbox?.type === "read-only"
          ? "readOnly"
          : rawSandbox?.type;

  return {
    model: params.model,
    modelProvider: null,
    cwd: params.cwd ?? null,
    approvalPolicy,
    sandbox:
      sandboxType === "workspaceWrite" && rawSandbox
        ? {
            type: "workspaceWrite",
            writableRoots: rawSandbox.writableRoots,
            networkAccess: rawSandbox.networkAccess,
            excludeTmpdirEnvVar: Boolean(rawSandbox.excludeTmpdirEnvVar ?? false),
            excludeSlashTmp: Boolean(rawSandbox.excludeSlashTmp ?? false),
          }
        : sandboxType === "dangerFullAccess"
          ? { type: "dangerFullAccess" }
          : sandboxType === "readOnly"
            ? { type: "readOnly" }
            : null,
    config: null,
    baseInstructions: null,
    developerInstructions: null,
  };
}

interface UseThreadsProps {
  sendRequest: <M extends CodexClientMethod>(
    method: M,
    params: CodexClientRequestByMethod[M],
  ) => Promise<CodexClientResultByMethod[M]>;
  onError?: (message: string) => void;
  enabled?: boolean;
}

interface UseThreadsResult {
  isLoadingThreads: boolean;
  threads: ThreadSummary[];
  refreshThreads: () => Promise<void>;
  startThread: (params: ThreadStartParams) => Promise<ThreadStartResult>;
  resumeThread: (params: ThreadResumeParams) => Promise<ThreadResumeResult>;
  archiveThread: (params: ThreadArchiveParams) => Promise<ThreadArchiveResult>;
}

export function useThreads({ sendRequest, onError, enabled = true }: UseThreadsProps): UseThreadsResult {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);

  const setError = useCallback(
    (message: string) => {
      onError?.(message);
    },
    [onError],
  );

  const refreshThreads = useCallback(async () => {
    setIsLoadingThreads(true);
    try {
      const response = await sendRequest("thread/list", {
        includeArchived: false,
      } as ThreadListParams);
      setThreads(normalizeThreadListResult(response));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load threads");
      setThreads([]);
    } finally {
      setIsLoadingThreads(false);
    }
  }, [sendRequest, setError]);

  const startThread = useCallback(
    async (params: ThreadStartParams) => {
      const response = await sendRequest("thread/start", normalizeThreadStartParams(params));
      return normalizeThreadStartResult(response);
    },
    [sendRequest],
  );

  const resumeThread = useCallback(
    async (params: ThreadResumeParams) => {
      const response = await sendRequest("thread/resume", params);
      return normalizeThreadResumeResult(response);
    },
    [sendRequest],
  );

  const archiveThread = useCallback(
    async (params: ThreadArchiveParams) => {
      const response = await sendRequest("thread/archive", params);
      void refreshThreads();
      return normalizeThreadArchiveResult(response, params.threadId);
    },
    [sendRequest, refreshThreads],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void refreshThreads();
  }, [enabled, refreshThreads]);

  return {
    isLoadingThreads,
    threads,
    refreshThreads,
    startThread,
    resumeThread,
    archiveThread,
  };
}
