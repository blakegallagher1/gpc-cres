import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";
import { logger, serializeErrorForLogs } from "@/lib/logger";
import {
  attachRequestIdHeader,
  createRequestObservabilityContext,
  logServerObservability,
  recordMonitorSnapshot,
} from "@/lib/server/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const modernTelemetryEventSchema = z.object({
  type: z.enum([
    "route_view",
    "unhandled_error",
    "unhandled_rejection",
    "fetch_error",
    "fetch_slow",
  ]),
  timestamp: z.string().min(1),
  sessionId: z.string().min(1),
  pagePath: z.string().optional(),
  pageUrl: z.string().optional(),
  referrer: z.string().optional(),
  userAgent: z.string().optional(),
  viewport: z
    .object({
      width: z.number(),
      height: z.number(),
      devicePixelRatio: z.number().optional(),
    })
    .optional(),
  request: z
    .object({
      url: z.string().min(1),
      method: z.string().min(1),
      statusCode: z.number().nullable().optional(),
      durationMs: z.number().nullable().optional(),
      requestId: z.string().nullable().optional(),
    })
    .optional(),
  error: z
    .object({
      message: z.string().optional(),
      name: z.string().optional(),
      stack: z.string().optional(),
      filename: z.string().optional(),
      lineno: z.number().optional(),
      colno: z.number().optional(),
    })
    .optional(),
  reason: z.string().optional(),
  durationMs: z.number().optional(),
});

const legacyTelemetryKindSchema = z.enum([
  "navigation",
  "page_error",
  "browser_error",
  "unhandled_rejection",
  "fetch_failure",
]);

const legacyTelemetryEventSchema = z.object({
  kind: legacyTelemetryKindSchema,
  occurredAt: z.string().min(1),
  route: z.string().min(1),
  viewId: z.string().min(1),
  sessionId: z.string().min(1),
  level: z.enum(["info", "warning", "error"]).optional(),
  pageTitle: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  componentStack: z.string().nullable().optional(),
  prevRoute: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  method: z.string().nullable().optional(),
  statusCode: z.number().int().nullable().optional(),
  durationMs: z.number().nonnegative().nullable().optional(),
  requestId: z.string().nullable().optional(),
  correlationId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const monitorSnapshotSchema = z.object({
  source: z.string().min(1),
  surface: z.string().min(1),
  status: z.string().min(1),
  summary: z.string().optional(),
  route: z.string().optional(),
  requestId: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

const payloadSchema = z
  .object({
    events: z.array(z.union([modernTelemetryEventSchema, legacyTelemetryEventSchema])).max(100).optional(),
    monitorSnapshots: z.array(monitorSnapshotSchema).max(50).optional(),
  })
  .superRefine((value, ctx) => {
    const eventCount = value.events?.length ?? 0;
    const snapshotCount = value.monitorSnapshots?.length ?? 0;
    if (eventCount + snapshotCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one observability event or monitor snapshot is required",
        path: ["events"],
      });
    }
  });

type ModernTelemetryEvent = z.infer<typeof modernTelemetryEventSchema>;
type LegacyTelemetryEvent = z.infer<typeof legacyTelemetryEventSchema>;
type MonitorSnapshotInput = z.infer<typeof monitorSnapshotSchema>;
type AuthState = { orgId: string; userId: string | null | undefined };

function isModernTelemetryEvent(event: ModernTelemetryEvent | LegacyTelemetryEvent): event is ModernTelemetryEvent {
  return "type" in event;
}

function normalizeRequestId(value: string | null | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

function sanitizeMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) {
    return {};
  }

  const safeMetadata = { ...metadata };
  delete safeMetadata.userId;
  delete safeMetadata.userEmail;
  delete safeMetadata.orgId;
  return safeMetadata;
}

function modernDurationMs(event: ModernTelemetryEvent): number | null {
  if (typeof event.durationMs === "number") {
    return event.durationMs;
  }
  if (typeof event.request?.durationMs === "number") {
    return event.request.durationMs;
  }
  return null;
}

function modernRoute(event: ModernTelemetryEvent): string | null {
  return event.request?.url ?? event.pagePath ?? event.pageUrl ?? null;
}

function modernLevel(event: ModernTelemetryEvent): "info" | "warn" | "error" {
  switch (event.type) {
    case "fetch_slow":
      return "warn";
    case "unhandled_error":
    case "unhandled_rejection":
    case "fetch_error":
      return "error";
    default:
      return "info";
  }
}

function legacyLevel(event: LegacyTelemetryEvent): "info" | "warn" | "error" {
  if (event.level === "error") {
    return "error";
  }
  if (event.level === "warning") {
    return "warn";
  }
  if (
    event.kind === "page_error" ||
    event.kind === "browser_error" ||
    event.kind === "unhandled_rejection" ||
    event.kind === "fetch_failure"
  ) {
    return "error";
  }
  return "info";
}

async function recordModernEvent(event: ModernTelemetryEvent, auth: AuthState) {
  const route = modernRoute(event);
  const durationMs = modernDurationMs(event);

  await logServerObservability(modernLevel(event), event.type, {
    route,
    requestId: normalizeRequestId(event.request?.requestId),
    orgId: auth.orgId,
    userId: auth.userId ?? null,
    upstream: "client",
    status: event.request?.statusCode ?? null,
    durationMs,
    source: "client",
    schemaVersion: "modern",
    type: event.type,
    clientTimestamp: event.timestamp,
    sessionId: event.sessionId,
    pagePath: event.pagePath ?? null,
    pageUrl: event.pageUrl ?? null,
    referrer: event.referrer ?? null,
    userAgent: event.userAgent ?? null,
    viewport: event.viewport ?? null,
    request: event.request
      ? {
          ...event.request,
          requestId: normalizeRequestId(event.request.requestId),
        }
      : null,
    error: event.error ?? null,
    reason: event.reason ?? null,
  });
}

async function recordLegacyEvent(event: LegacyTelemetryEvent, auth: AuthState) {
  const durationMs = event.durationMs ?? null;

  await logServerObservability(legacyLevel(event), event.kind, {
    route: event.route,
    requestId: normalizeRequestId(event.requestId),
    orgId: auth.orgId,
    userId: auth.userId ?? null,
    upstream: "client",
    status: event.statusCode ?? null,
    durationMs,
    source: "client",
    schemaVersion: "legacy",
    kind: event.kind,
    occurredAt: event.occurredAt,
    viewId: event.viewId,
    sessionId: event.sessionId,
    level: event.level ?? null,
    pageTitle: event.pageTitle ?? null,
    message: event.message ?? null,
    componentStack: event.componentStack ?? null,
    prevRoute: event.prevRoute ?? null,
    request: {
      url: event.url ?? null,
      method: event.method ?? null,
      statusCode: event.statusCode ?? null,
      durationMs,
      requestId: normalizeRequestId(event.requestId),
      correlationId: event.correlationId ?? null,
    },
    metadata: sanitizeMetadata(event.metadata),
  });
}

async function recordClientMonitorSnapshot(snapshot: MonitorSnapshotInput, auth: AuthState) {
  await recordMonitorSnapshot({
    source: snapshot.source,
    surface: snapshot.surface,
    status: snapshot.status,
    summary: snapshot.summary ?? null,
    route: snapshot.route ?? null,
    requestId: normalizeRequestId(snapshot.requestId),
    orgId: auth.orgId,
    userId: auth.userId ?? null,
    details: {
      source: "ingest-route",
      ...(snapshot.details ?? {}),
    },
  });
}

export async function POST(req: NextRequest) {
  const context = createRequestObservabilityContext(req, "/api/observability/events");
  const withRequestId = (response: NextResponse) => attachRequestIdHeader(response, context.requestId);

  try {
    const auth = await resolveAuth(req);
    if (!auth) {
      return withRequestId(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }

    if (!auth.orgId) {
      return withRequestId(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return withRequestId(NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
    }

    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return withRequestId(
        NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 },
        ),
      );
    }

    const events = parsed.data.events ?? [];
    const monitorSnapshots = parsed.data.monitorSnapshots ?? [];

    for (const event of events) {
      if (isModernTelemetryEvent(event)) {
        await recordModernEvent(event, auth);
        continue;
      }
      await recordLegacyEvent(event, auth);
    }

    for (const snapshot of monitorSnapshots) {
      await recordClientMonitorSnapshot(snapshot, auth);
    }

    const count = events.length + monitorSnapshots.length;
    return withRequestId(
      NextResponse.json(
        {
          ok: true,
          count,
          counts: {
            events: events.length,
            monitorSnapshots: monitorSnapshots.length,
          },
        },
        { status: 201 },
      ),
    );
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.observability.events", method: "POST" },
    });
    logger.error("Observability events failed to record client telemetry", serializeErrorForLogs(error));
    return withRequestId(
      NextResponse.json(
        { error: "Failed to record observability events" },
        { status: 500 },
      ),
    );
  }
}
