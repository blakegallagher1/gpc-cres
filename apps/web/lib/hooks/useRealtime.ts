"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface RealtimeMessage {
  type: "run_started" | "run_completed" | "run_failed" | "metric_update";
  data: unknown;
  timestamp: string;
}

interface UseRealtimeOptions {
  onRunStarted?: (data: unknown) => void;
  onRunCompleted?: (data: unknown) => void;
  onRunFailed?: (data: unknown) => void;
  onMetricUpdate?: (data: unknown) => void;
  enableNotifications?: boolean;
}

export function useRealtime(_options: UseRealtimeOptions = {}) {
  return {
    isConnected: false,
    lastMessage: null as RealtimeMessage | null,
    connect: () => {},
    disconnect: () => {},
  };
}

// Hook for auto-refreshing dashboard metrics
export function useAutoRefresh(
  refreshFn: () => void | Promise<void>,
  intervalMs: number = 30000
) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshFn();
      setLastRefresh(new Date());
    } catch (error) {
      console.error("Refresh failed:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshFn]);

  const start = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(refresh, intervalMs);
  }, [refresh, intervalMs]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    start();
    return () => stop();
  }, [start, stop]);

  return {
    isRefreshing,
    lastRefresh,
    refresh,
    start,
    stop,
  };
}

// Hook for run status polling (fallback for WebSocket)
export function useRunStatus(runId: string | null, onStatusChange?: (status: string) => void) {
  const [status, setStatus] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const poll = useCallback(async () => {
    if (!runId) return;

    try {
      const response = await fetch(`/api/runs/${runId}`);
      if (!response.ok) throw new Error("Failed to fetch run status");

      const data = await response.json();
      const newStatus = data.run?.status;

      if (newStatus !== status) {
        setStatus(newStatus);
        onStatusChange?.(newStatus);

        // Stop polling if run is complete
        if (["success", "error", "cancelled"].includes(newStatus)) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            setIsPolling(false);
          }
        }
      }
    } catch (error) {
      console.error("Polling error:", error);
    }
  }, [runId, status, onStatusChange]);

  const startPolling = useCallback(() => {
    if (!runId || intervalRef.current) return;
    setIsPolling(true);
    intervalRef.current = setInterval(poll, 2000); // Poll every 2 seconds
  }, [runId, poll]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setIsPolling(false);
    }
  }, []);

  useEffect(() => {
    if (runId) {
      startPolling();
    }
    return () => stopPolling();
  }, [runId, startPolling, stopPolling]);

  return {
    status,
    isPolling,
    startPolling,
    stopPolling,
  };
}
