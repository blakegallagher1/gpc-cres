import "server-only";

import { randomUUID } from "node:crypto";

export type ObservabilityLevel = "debug" | "info" | "warn" | "error";
export type ObservabilityMonitorStatus = "ok" | "warn" | "error" | "degraded" | "unknown";
export type ObservabilityRecordKind = "all" | "event" | "monitor";

const MAX_EVENT_RECORDS = 200;
const MAX_MONITOR_SNAPSHOTS = 100;
const DEFAULT_QUERY_LIMIT = 50;
const MAX_QUERY_LIMIT = 200;
const STORE_KEY = Symbol.for("gallagher-cres.observability-store");
const SENSITIVE_KEY_RE = /(authorization|cookie|token|secret|password|api[-_]?key)/i;
const IDENTITY_KEY_RE = /^(orgId|userId|userEmail)$/i;

export interface ObservabilityEventInput {
  level: ObservabilityLevel;
  event: string;
  route?: string | null;
  requestId?: string | null;
  orgId?: string | null;
  userId?: string | null;
  upstream?: string | null;
  status?: number | null;
  durationMs?: number | null;
  fields?: Record<string, unknown>;
}

export interface ObservabilityEventRecord extends ObservabilityEventInput {
  id: string;
  kind: "event";
  recordedAt: string;
  recordedAtMs: number;
  fields: Record<string, unknown>;
}

export interface ObservabilityMonitorSnapshotInput {
  source: string;
  surface: string;
  status: ObservabilityMonitorStatus | string;
  summary?: string | null;
  route?: string | null;
  requestId?: string | null;
  orgId?: string | null;
  userId?: string | null;
  details?: Record<string, unknown>;
}

export interface ObservabilityMonitorSnapshot extends ObservabilityMonitorSnapshotInput {
  id: string;
  kind: "monitor";
  recordedAt: string;
  recordedAtMs: number;
  summary: string | null;
  details: Record<string, unknown>;
}

export interface ObservabilityQueryOptions {
  kind?: ObservabilityRecordKind;
  limit?: number;
  since?: number | string | Date | null;
  level?: ObservabilityLevel | null;
  event?: string | null;
  route?: string | null;
  requestId?: string | null;
  orgId?: string | null;
  userId?: string | null;
  status?: number | string | null;
  source?: string | null;
  surface?: string | null;
}

export interface ObservabilityQueryResult {
  generatedAt: string;
  filters: {
    kind: ObservabilityRecordKind;
    limit: number;
    since: string | null;
    level: ObservabilityLevel | null;
    event: string | null;
    route: string | null;
    requestId: string | null;
    orgId: string | null;
    userId: string | null;
    status: string | null;
    source: string | null;
    surface: string | null;
  };
  stats: {
    totalEvents: number;
    totalMonitorSnapshots: number;
    matchedEvents: number;
    matchedMonitorSnapshots: number;
    latestEventAt: string | null;
    latestMonitorSnapshotAt: string | null;
  };
  events: ObservabilityEventRecord[];
  monitorSnapshots: ObservabilityMonitorSnapshot[];
}

interface ObservabilityStoreState {
  events: ObservabilityEventRecord[];
  monitorSnapshots: ObservabilityMonitorSnapshot[];
}

function sanitizeValue(value: unknown, keyHint?: string): unknown {
  if (keyHint && SENSITIVE_KEY_RE.test(keyHint)) {
    return "[redacted]";
  }
  if (value == null) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        sanitizeValue(entry, key),
      ]),
    );
  }
  return String(value);
}

function sanitizeRecord(record: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!record) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, sanitizeValue(value, key)]),
  );
}

function stripIdentityValue(value: unknown): unknown {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }
  if (Array.isArray(value)) {
    return value.map((entry) =>
      typeof entry === "object" && entry !== null
        ? stripIdentityFields(entry as Record<string, unknown>)
        : entry,
    );
  }
  if (typeof value === "object") {
    return stripIdentityFields(value as Record<string, unknown>);
  }
  return value;
}

function stripIdentityFields(record: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!record) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key, value]) => value !== undefined && !IDENTITY_KEY_RE.test(key))
      .map(([key, value]) => [key, stripIdentityValue(value)]),
  );
}

function getStore(): ObservabilityStoreState {
  const globalStore = globalThis as typeof globalThis & { [STORE_KEY]?: ObservabilityStoreState };
  if (!globalStore[STORE_KEY]) {
    globalStore[STORE_KEY] = {
      events: [],
      monitorSnapshots: [],
    };
  }
  return globalStore[STORE_KEY];
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_QUERY_LIMIT;
  }
  return Math.min(MAX_QUERY_LIMIT, Math.max(1, Math.trunc(limit ?? DEFAULT_QUERY_LIMIT)));
}

function normalizeSince(value: number | string | Date | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsedNumeric = Number(value);
  if (Number.isFinite(parsedNumeric) && value.trim() !== "") {
    return parsedNumeric;
  }
  const parsedDate = Date.parse(value);
  return Number.isNaN(parsedDate) ? null : parsedDate;
}

function toLower(value: string | null | undefined): string | null {
  return value ? value.toLowerCase() : null;
}

function matchesCommonFilters(
  record: {
    route?: string | null;
    requestId?: string | null;
    orgId?: string | null;
    userId?: string | null;
    recordedAtMs: number;
  },
  filters: Required<Omit<ObservabilityQueryResult["filters"], "since">> & { sinceMs: number | null },
): boolean {
  if (filters.sinceMs != null && record.recordedAtMs < filters.sinceMs) {
    return false;
  }
  if (filters.route && record.route !== filters.route) {
    return false;
  }
  if (filters.requestId && record.requestId !== filters.requestId) {
    return false;
  }
  if (filters.orgId && record.orgId && record.orgId !== filters.orgId) {
    return false;
  }
  if (filters.userId && record.userId !== filters.userId) {
    return false;
  }
  return true;
}

function trimToSize<T>(items: T[], maxItems: number): void {
  if (items.length > maxItems) {
    items.length = maxItems;
  }
}

export function recordObservabilityEvent(input: ObservabilityEventInput): ObservabilityEventRecord {
  const nowMs = Date.now();
  const event: ObservabilityEventRecord = {
    id: randomUUID(),
    kind: "event",
    recordedAt: new Date(nowMs).toISOString(),
    recordedAtMs: nowMs,
    level: input.level,
    event: input.event,
    route: input.route ?? null,
    requestId: input.requestId ?? null,
    orgId: input.orgId ?? null,
    userId: input.userId ?? null,
    upstream: input.upstream ?? null,
    status: input.status ?? null,
    durationMs: input.durationMs ?? null,
    fields: sanitizeRecord(input.fields),
  };

  const store = getStore();
  store.events.unshift(event);
  trimToSize(store.events, MAX_EVENT_RECORDS);
  return event;
}

export function recordObservabilityMonitorSnapshot(
  input: ObservabilityMonitorSnapshotInput,
): ObservabilityMonitorSnapshot {
  const nowMs = Date.now();
  const snapshot: ObservabilityMonitorSnapshot = {
    id: randomUUID(),
    kind: "monitor",
    recordedAt: new Date(nowMs).toISOString(),
    recordedAtMs: nowMs,
    source: input.source,
    surface: input.surface,
    status: input.status,
    summary: input.summary ?? null,
    route: input.route ?? null,
    requestId: input.requestId ?? null,
    orgId: input.orgId ?? null,
    userId: input.userId ?? null,
    details: sanitizeRecord(stripIdentityFields(input.details)),
  };

  const store = getStore();
  store.monitorSnapshots.unshift(snapshot);
  trimToSize(store.monitorSnapshots, MAX_MONITOR_SNAPSHOTS);
  return snapshot;
}

export function queryObservabilityStore(
  options: ObservabilityQueryOptions = {},
): ObservabilityQueryResult {
  const store = getStore();
  const normalizedSince = normalizeSince(options.since);
  const filters = {
    kind: options.kind ?? "all",
    limit: clampLimit(options.limit),
    since: normalizedSince == null ? null : new Date(normalizedSince).toISOString(),
    level: options.level ?? null,
    event: options.event ?? null,
    route: options.route ?? null,
    requestId: options.requestId ?? null,
    orgId: options.orgId ?? null,
    userId: options.userId ?? null,
    status: options.status == null ? null : String(options.status),
    source: options.source ?? null,
    surface: options.surface ?? null,
  };
  const normalized = {
    ...filters,
    sinceMs: normalizedSince,
    kind: filters.kind,
    limit: filters.limit,
    level: filters.level,
    event: filters.event,
    route: filters.route,
    requestId: filters.requestId,
    orgId: filters.orgId,
    userId: filters.userId,
    status: filters.status,
    source: filters.source,
    surface: filters.surface,
  };

  const events =
    normalized.kind === "monitor"
      ? []
      : store.events
          .filter((entry) => matchesCommonFilters(entry, normalized))
          .filter((entry) => (normalized.level ? entry.level === normalized.level : true))
          .filter((entry) => (normalized.event ? entry.event === normalized.event : true))
          .filter((entry) =>
            normalized.status ? String(entry.status ?? "") === normalized.status : true,
          )
          .slice(0, normalized.limit);

  const monitorSnapshots =
    normalized.kind === "event"
      ? []
      : store.monitorSnapshots
          .filter((entry) => matchesCommonFilters(entry, normalized))
          .filter((entry) =>
            normalized.status ? toLower(entry.status) === toLower(normalized.status) : true,
          )
          .filter((entry) => (normalized.source ? entry.source === normalized.source : true))
          .filter((entry) => (normalized.surface ? entry.surface === normalized.surface : true))
          .slice(0, normalized.limit);

  return {
    generatedAt: new Date().toISOString(),
    filters,
    stats: {
      totalEvents: store.events.length,
      totalMonitorSnapshots: store.monitorSnapshots.length,
      matchedEvents: events.length,
      matchedMonitorSnapshots: monitorSnapshots.length,
      latestEventAt: store.events[0]?.recordedAt ?? null,
      latestMonitorSnapshotAt: store.monitorSnapshots[0]?.recordedAt ?? null,
    },
    events,
    monitorSnapshots,
  };
}

export function resetObservabilityStore(): void {
  const store = getStore();
  store.events = [];
  store.monitorSnapshots = [];
}
