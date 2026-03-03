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
      setThreads(response.threads);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load threads");
      setThreads([]);
    } finally {
      setIsLoadingThreads(false);
    }
  }, [sendRequest, setError]);

  const startThread = useCallback(
    async (params: ThreadStartParams) => {
      const response = await sendRequest("thread/start", params);
      return response as ThreadStartResult;
    },
    [sendRequest],
  );

  const resumeThread = useCallback(
    async (params: ThreadResumeParams) => {
      const response = await sendRequest("thread/resume", params);
      return response as ThreadResumeResult;
    },
    [sendRequest],
  );

  const archiveThread = useCallback(
    async (params: ThreadArchiveParams) => {
      const response = await sendRequest("thread/archive", params);
      void refreshThreads();
      return response as ThreadArchiveResult;
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
