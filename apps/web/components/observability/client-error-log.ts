"use client";

import type { ClientTelemetryEvent } from "./client-telemetry";

const MAX_ENTRIES = 200;

export type ClientErrorLogEntry = {
  id: string;
  capturedAt: string;
  source: ClientTelemetryEvent["kind"];
  route: string;
  sessionId: string;
  viewId: string;
  level: "error" | "warning" | "info";
  message: string;
  pageTitle?: string | null;
  url?: string | null;
  method?: string | null;
  statusCode?: number | null;
  componentStack?: string | null;
  metadata?: Record<string, unknown>;
};

type Listener = (entries: readonly ClientErrorLogEntry[]) => void;

const listeners = new Set<Listener>();
let entries: ClientErrorLogEntry[] = [];

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `err-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function notify(): void {
  const snapshot = entries.slice();
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function isRecordingEnabled(): boolean {
  if (typeof process === "undefined") {
    return false;
  }
  if (process.env.NODE_ENV === "development") {
    return true;
  }
  return process.env.NEXT_PUBLIC_CLIENT_ERROR_LOG === "1";
}

export function isClientErrorLogUiEnabled(): boolean {
  return isRecordingEnabled();
}

function attachWindowApi(): void {
  if (typeof window === "undefined" || !isRecordingEnabled()) {
    return;
  }
  const w = window as unknown as {
    __GPC_CLIENT_ERROR_LOG__?: {
      getEntries: () => readonly ClientErrorLogEntry[];
      clear: () => void;
      subscribe: (fn: Listener) => () => void;
    };
  };
  w.__GPC_CLIENT_ERROR_LOG__ = {
    getEntries: () => entries.slice(),
    clear: () => {
      clearClientErrorLog();
    },
    subscribe: (fn) => subscribeClientErrorLog(fn),
  };
}

if (typeof window !== "undefined") {
  attachWindowApi();
}

export function shouldMirrorTelemetryToLocalErrorLog(event: ClientTelemetryEvent): boolean {
  if (event.kind === "page_error" || event.kind === "browser_error" || event.kind === "unhandled_rejection") {
    return true;
  }
  if (event.kind === "fetch_failure") {
    return true;
  }
  if (event.kind === "map_metric" && event.level === "error") {
    return true;
  }
  return false;
}

function telemetryLevelToEntryLevel(
  event: ClientTelemetryEvent,
): ClientErrorLogEntry["level"] {
  if (event.level === "warning") {
    return "warning";
  }
  if (event.level === "info") {
    return "info";
  }
  return "error";
}

export function mirrorClientTelemetryToLocalLog(event: ClientTelemetryEvent): void {
  if (!isRecordingEnabled() || !shouldMirrorTelemetryToLocalErrorLog(event)) {
    return;
  }

  const row: ClientErrorLogEntry = {
    id: generateId(),
    capturedAt: event.occurredAt,
    source: event.kind,
    route: event.route,
    sessionId: event.sessionId,
    viewId: event.viewId,
    level: telemetryLevelToEntryLevel(event),
    message: event.message ?? "(no message)",
    pageTitle: event.pageTitle ?? null,
    url: event.url ?? null,
    method: event.method ?? null,
    statusCode: event.statusCode ?? null,
    componentStack: event.componentStack ?? null,
    metadata: {
      ...(event.metadata ?? {}),
      requestId: event.requestId ?? undefined,
      correlationId: event.correlationId ?? undefined,
      durationMs: event.durationMs ?? undefined,
    },
  };

  entries = [row, ...entries].slice(0, MAX_ENTRIES);
  notify();
}

export function getClientErrorLog(): readonly ClientErrorLogEntry[] {
  return entries.slice();
}

export function clearClientErrorLog(): void {
  entries = [];
  notify();
}

export function subscribeClientErrorLog(listener: Listener): () => void {
  listeners.add(listener);
  listener(entries.slice());
  return () => {
    listeners.delete(listener);
  };
}

export function exportClientErrorLogJson(): string {
  return JSON.stringify(entries, null, 2);
}
