import "server-only";

import {
  REQUEST_ID_HEADER,
  attachRequestId,
  cloneHeadersWithRequestId,
  getOrCreateRequestId,
  readRequestId,
} from "../request-context";
import {
  queryObservabilityStore,
  recordObservabilityEvent,
  recordObservabilityMonitorSnapshot,
  type ObservabilityEventRecord,
  type ObservabilityMonitorSnapshot,
  type ObservabilityMonitorSnapshotInput,
  type ObservabilityQueryOptions,
  type ObservabilityQueryResult,
  type ObservabilityLevel,
} from "./store";

interface HeaderReader {
  get(name: string): string | null;
}

interface DurableAutomationEventRecord {
  id: string;
  orgId: string;
  handlerName: string;
  eventType: string;
  status: string;
  inputData: unknown;
  outputData: unknown;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
}

export interface RequestObservabilityContext {
  route: string;
  method: string;
  requestId: string;
  startedAtMs: number;
}

export interface RequestOutcomeDetails {
  status: number;
  durationMs?: number;
  orgId?: string | null;
  userId?: string | null;
  upstream?: string | null;
  resultCount?: number | null;
  error?: unknown;
  details?: Record<string, unknown>;
}

const SENSITIVE_KEY_RE = /(authorization|cookie|token|secret|password|api[-_]?key)/i;
const IDENTITY_KEY_RE = /^(orgId|userId|userEmail)$/i;

export function sanitizeValue(value: unknown, keyHint?: string): unknown {
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
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sanitizeValue(entry, key)]),
    );
  }
  return String(value);
}

export function sanitizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, sanitizeValue(value, key)]),
  );
}

export function stripIdentityFields(record: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!record) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key, value]) => value !== undefined && !IDENTITY_KEY_RE.test(key))
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return [
            key,
            value.map((entry) =>
              typeof entry === "object" && entry !== null
                ? stripIdentityFields(entry as Record<string, unknown>)
                : entry,
            ),
          ];
        }
        if (typeof value === "object" && value !== null) {
          return [key, stripIdentityFields(value as Record<string, unknown>)];
        }
        return [key, value];
      }),
  );
}

export function serializeFields(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${JSON.stringify(value ?? null)}`)
    .join(" ");
}

export function writeLog(level: ObservabilityLevel, message: string): void {
  switch (level) {
    case "debug":
      console.debug(message);
      break;
    case "warn":
      console.warn(message);
      break;
    case "error":
      console.error(message);
      break;
    default:
      console.info(message);
      break;
  }
}

export function isDbAvailable(): boolean {
  return Boolean(process.env.GATEWAY_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim());
}

export async function getPrisma() {
  if (!isDbAvailable()) {
    return null;
  }
  try {
    const dbModule = await import("@entitlement-os/db");
    return dbModule.prisma;
  } catch {
    return null;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

export function toMonitorStatus(value: unknown): string {
  return typeof value === "string" ? value : "unknown";
}

export function mapDurableStatus(kind: "event" | "monitor", status: number | string | null, level?: ObservabilityLevel): string {
  if (kind === "monitor") {
    const normalized = typeof status === "string" ? status.toLowerCase() : "unknown";
    return normalized === "error" || normalized === "degraded" ? "failed" : "completed";
  }
  if (typeof status === "number" && status >= 500) {
    return "failed";
  }
  return level === "error" ? "failed" : "completed";
}

export function extractErrorMessage(value: unknown): string | null {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  const record = asRecord(value);
  return typeof record.message === "string" ? record.message : null;
}

export async function persistDurableObservabilityEvent(
  kind: "event" | "monitor",
  payload: Record<string, unknown>,
): Promise<void> {
  const orgId = typeof payload.orgId === "string" && payload.orgId.trim() ? payload.orgId : null;
  if (!orgId) {
    return;
  }

  const prisma = await getPrisma();
  if (!prisma) {
    return;
  }

  const eventType = kind === "monitor"
    ? `monitor:${String(payload.source ?? "unknown")}:${String(payload.surface ?? "unknown")}`
    : String(payload.event ?? "observability");
  const statusValue = kind === "monitor"
    ? toMonitorStatus(payload.status)
    : (typeof payload.status === "number" ? payload.status : null);
  const durableStatus = mapDurableStatus(kind, statusValue, payload.level as ObservabilityLevel | undefined);
  const durationMs = typeof payload.durationMs === "number" ? payload.durationMs : null;
  const errorMessage = extractErrorMessage(payload.error);

  try {
    await prisma.automationEvent.create({
      data: {
        orgId,
        handlerName: "observability",
        eventType,
        status: durableStatus,
        inputData: {
          kind,
          route: payload.route ?? null,
          requestId: payload.requestId ?? null,
          userId: payload.userId ?? null,
          upstream: payload.upstream ?? null,
          status: statusValue,
          level: payload.level ?? null,
          source: payload.source ?? null,
          surface: payload.surface ?? null,
          summary: payload.summary ?? null,
        },
        outputData: {
          kind,
          fields: payload.fields ?? {},
          details: payload.details ?? {},
        },
        error: errorMessage,
        durationMs,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.warn("[observability] durable persistence failed", {
      kind,
      route: payload.route ?? null,
      source: payload.source ?? null,
      surface: payload.surface ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function normalizeDurableEvent(row: DurableAutomationEventRecord): ObservabilityEventRecord | null {
  const input = asRecord(row.inputData);
  const output = asRecord(row.outputData);
  if (input.kind !== "event") {
    return null;
  }
  return {
    id: row.id,
    kind: "event",
    recordedAt: row.completedAt?.toISOString() ?? row.startedAt.toISOString(),
    recordedAtMs: row.completedAt?.getTime() ?? row.startedAt.getTime(),
    level: (typeof input.level === "string" ? input.level : "info") as ObservabilityLevel,
    event: typeof row.eventType === "string" ? row.eventType : "observability",
    route: typeof input.route === "string" ? input.route : null,
    requestId: typeof input.requestId === "string" ? input.requestId : null,
    orgId: row.orgId,
    userId: typeof input.userId === "string" ? input.userId : null,
    upstream: typeof input.upstream === "string" ? input.upstream : null,
    status: typeof input.status === "number" ? input.status : null,
    durationMs: typeof row.durationMs === "number" ? row.durationMs : null,
    fields: sanitizeFields(asRecord(output.fields)),
  };
}

export function normalizeDurableMonitor(row: DurableAutomationEventRecord): ObservabilityMonitorSnapshot | null {
  const input = asRecord(row.inputData);
  const output = asRecord(row.outputData);
  if (input.kind !== "monitor") {
    return null;
  }
  return {
    id: row.id,
    kind: "monitor",
    recordedAt: row.completedAt?.toISOString() ?? row.startedAt.toISOString(),
    recordedAtMs: row.completedAt?.getTime() ?? row.startedAt.getTime(),
    source: typeof input.source === "string" ? input.source : "durable",
    surface: typeof input.surface === "string" ? input.surface : "unknown",
    status: typeof input.status === "string" ? input.status : "unknown",
    summary: typeof input.summary === "string" ? input.summary : null,
    route: typeof input.route === "string" ? input.route : null,
    requestId: typeof input.requestId === "string" ? input.requestId : null,
    orgId: row.orgId,
    userId: typeof input.userId === "string" ? input.userId : null,
    details: sanitizeFields(stripIdentityFields(asRecord(output.details))),
  };
}

export function mergeUniqueById<T extends { id: string; recordedAtMs: number }>(
  primary: T[],
  secondary: T[],
  limit: number,
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const entry of [...primary, ...secondary].sort((a, b) => b.recordedAtMs - a.recordedAtMs)) {
    if (seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    merged.push(entry);
    if (merged.length >= limit) {
      break;
    }
  }
  return merged;
}

export function matchesCommonFilters(
  record: {
    route?: string | null;
    requestId?: string | null;
    orgId?: string | null;
    userId?: string | null;
    recordedAtMs: number;
  },
  options: ObservabilityQueryOptions,
  sinceMs: number | null,
): boolean {
  if (sinceMs != null && record.recordedAtMs < sinceMs) {
    return false;
  }
  if (options.route && record.route !== options.route) {
    return false;
  }
  if (options.requestId && record.requestId !== options.requestId) {
    return false;
  }
  if (options.orgId && record.orgId && record.orgId !== options.orgId) {
    return false;
  }
  if (options.userId && record.userId !== options.userId) {
    return false;
  }
  return true;
}

export function normalizeSince(value: number | string | Date | null | undefined): number | null {
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

export function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return 50;
  }
  return Math.min(200, Math.max(1, Math.trunc(limit ?? 50)));
}

export function lower(value: string | null | undefined): string | null {
  return value ? value.toLowerCase() : null;
}

export function filterDurableEvents(events: ObservabilityEventRecord[], options: ObservabilityQueryOptions): ObservabilityEventRecord[] {
  const sinceMs = normalizeSince(options.since);
  return events
    .filter((entry) => matchesCommonFilters(entry, options, sinceMs))
    .filter((entry) => (options.level ? entry.level === options.level : true))
    .filter((entry) => (options.event ? entry.event === options.event : true))
    .filter((entry) => (options.status != null ? String(entry.status ?? "") === String(options.status) : true));
}

export function filterDurableMonitors(
  monitorSnapshots: ObservabilityMonitorSnapshot[],
  options: ObservabilityQueryOptions,
): ObservabilityMonitorSnapshot[] {
  const sinceMs = normalizeSince(options.since);
  return monitorSnapshots
    .filter((entry) => matchesCommonFilters(entry, options, sinceMs))
    .filter((entry) => (options.status != null ? lower(entry.status) === lower(String(options.status)) : true))
    .filter((entry) => (options.source ? entry.source === options.source : true))
    .filter((entry) => (options.surface ? entry.surface === options.surface : true));
}

export async function queryDurableObservability(
  options: ObservabilityQueryOptions,
): Promise<Pick<ObservabilityQueryResult, "events" | "monitorSnapshots" | "stats"> | null> {
  const orgId = options.orgId?.trim();
  if (!orgId) {
    return null;
  }

  const prisma = await getPrisma();
  if (!prisma) {
    return null;
  }

  const take = Math.max(50, options.limit ?? 50);
  try {
    const rows = await prisma.automationEvent.findMany({
      where: {
        orgId,
        handlerName: "observability",
      },
      orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
      take,
    }) as DurableAutomationEventRecord[];

    const allEvents = rows
      .map(normalizeDurableEvent)
      .filter((entry): entry is ObservabilityEventRecord => Boolean(entry));
    const allMonitorSnapshots = rows
      .map(normalizeDurableMonitor)
      .filter((entry): entry is ObservabilityMonitorSnapshot => Boolean(entry));

    const events = options.kind === "monitor" ? [] : filterDurableEvents(allEvents, options).slice(0, clampLimit(options.limit));
    const monitorSnapshots = options.kind === "event"
      ? []
      : filterDurableMonitors(allMonitorSnapshots, options).slice(0, clampLimit(options.limit));

    return {
      events,
      monitorSnapshots,
      stats: {
        totalEvents: allEvents.length,
        totalMonitorSnapshots: allMonitorSnapshots.length,
        matchedEvents: events.length,
        matchedMonitorSnapshots: monitorSnapshots.length,
        latestEventAt: allEvents[0]?.recordedAt ?? null,
        latestMonitorSnapshotAt: allMonitorSnapshots[0]?.recordedAt ?? null,
      },
    };
  } catch (error) {
    console.warn("[observability] durable query failed", {
      orgId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function getRequestHeaderValue(
  request: { headers: HeaderReader | Headers } | HeaderReader | Headers,
  headerName: string,
): string | null {
  const headers = "headers" in request ? request.headers : request;
  const value = headers.get(headerName);
  return value?.trim() || null;
}

export function createRequestObservabilityContext(
  request: { method?: string | null; headers: HeaderReader | Headers },
  route: string,
): RequestObservabilityContext {
  return {
    route,
    method: request.method?.toUpperCase() || "GET",
    requestId: getOrCreateRequestId(request),
    startedAtMs: Date.now(),
  };
}

export function getRequestHeadersWithId(
  request: { headers: HeaderReader | Headers } | HeaderReader | Headers,
  requestId?: string,
): Headers {
  return cloneHeadersWithRequestId(request, requestId ?? getOrCreateRequestId(request));
}

export function attachRequestIdHeader<T extends { headers: Headers }>(target: T, requestId: string): T {
  return attachRequestId(target, requestId);
}

export async function logServerObservability(
  level: ObservabilityLevel,
  event: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const sanitizedFields = sanitizeFields(fields);
  writeLog(level, `[observability] event=${event} ${serializeFields(sanitizedFields)}`.trim());
  recordObservabilityEvent({
    level,
    event,
    route: typeof sanitizedFields.route === "string" ? sanitizedFields.route : null,
    requestId: typeof sanitizedFields.requestId === "string" ? sanitizedFields.requestId : null,
    orgId: typeof sanitizedFields.orgId === "string" ? sanitizedFields.orgId : null,
    userId: typeof sanitizedFields.userId === "string" ? sanitizedFields.userId : null,
    upstream: typeof sanitizedFields.upstream === "string" ? sanitizedFields.upstream : null,
    status: typeof sanitizedFields.status === "number" ? sanitizedFields.status : null,
    durationMs: typeof sanitizedFields.durationMs === "number" ? sanitizedFields.durationMs : null,
    fields: sanitizedFields,
  });
  await persistDurableObservabilityEvent("event", {
    level,
    event,
    route: typeof sanitizedFields.route === "string" ? sanitizedFields.route : null,
    requestId: typeof sanitizedFields.requestId === "string" ? sanitizedFields.requestId : null,
    orgId: typeof sanitizedFields.orgId === "string" ? sanitizedFields.orgId : null,
    userId: typeof sanitizedFields.userId === "string" ? sanitizedFields.userId : null,
    upstream: typeof sanitizedFields.upstream === "string" ? sanitizedFields.upstream : null,
    status: typeof sanitizedFields.status === "number" ? sanitizedFields.status : null,
    durationMs: typeof sanitizedFields.durationMs === "number" ? sanitizedFields.durationMs : null,
    fields: sanitizedFields,
    error: sanitizedFields.error ?? null,
  });
}

export async function recordMonitorSnapshot(input: ObservabilityMonitorSnapshotInput): Promise<ObservabilityMonitorSnapshot> {
  const snapshot = recordObservabilityMonitorSnapshot({
    ...input,
    details: stripIdentityFields(input.details),
  });
  await persistDurableObservabilityEvent("monitor", {
    source: snapshot.source,
    surface: snapshot.surface,
    status: snapshot.status,
    summary: snapshot.summary,
    route: snapshot.route,
    requestId: snapshot.requestId,
    orgId: snapshot.orgId,
    userId: snapshot.userId,
    details: snapshot.details,
    durationMs: null,
  });
  return snapshot;
}

export async function queryRecentObservability(options: ObservabilityQueryOptions = {}): Promise<ObservabilityQueryResult> {
  const inMemory = queryObservabilityStore(options);
  const durable = await queryDurableObservability(options);
  if (!durable) {
    return inMemory;
  }

  const events = mergeUniqueById(inMemory.events, durable.events, inMemory.filters.limit);
  const monitorSnapshots = mergeUniqueById(inMemory.monitorSnapshots, durable.monitorSnapshots, inMemory.filters.limit);

  return {
    generatedAt: new Date().toISOString(),
    filters: inMemory.filters,
    stats: {
      totalEvents: Math.max(inMemory.stats.totalEvents, durable.stats.totalEvents),
      totalMonitorSnapshots: Math.max(inMemory.stats.totalMonitorSnapshots, durable.stats.totalMonitorSnapshots),
      matchedEvents: events.length,
      matchedMonitorSnapshots: monitorSnapshots.length,
      latestEventAt: events[0]?.recordedAt ?? null,
      latestMonitorSnapshotAt: monitorSnapshots[0]?.recordedAt ?? null,
    },
    events,
    monitorSnapshots,
  };
}

export async function logRequestStart(context: RequestObservabilityContext, details?: Record<string, unknown>): Promise<void> {
  await logServerObservability("info", "request_start", {
    route: context.route,
    method: context.method,
    requestId: context.requestId,
    ...details,
  });
}

export async function logRequestOutcome(
  context: RequestObservabilityContext,
  details: RequestOutcomeDetails,
): Promise<void> {
  const durationMs = details.durationMs ?? Math.max(0, Date.now() - context.startedAtMs);
  const level: ObservabilityLevel = details.status >= 500
    ? "error"
    : details.status >= 400
      ? "warn"
      : "info";

  await logServerObservability(level, "request_complete", {
    route: context.route,
    method: context.method,
    requestId: context.requestId,
    status: details.status,
    durationMs,
    orgId: details.orgId ?? null,
    userId: details.userId ?? null,
    upstream: details.upstream ?? null,
    resultCount: details.resultCount ?? null,
    error: details.error,
    ...(details.details ?? {}),
  });
}

export {
  REQUEST_ID_HEADER,
  readRequestId,
  type ObservabilityMonitorSnapshotInput,
  type ObservabilityQueryOptions,
  type ObservabilityLevel,
};
