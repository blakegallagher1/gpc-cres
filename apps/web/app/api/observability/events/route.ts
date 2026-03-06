import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const telemetryEventSchema = z.object({
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

const payloadSchema = z.object({
  events: z.array(telemetryEventSchema).min(1).max(100),
});

type TelemetryEvent = z.infer<typeof telemetryEventSchema>;

const FAILURE_TYPES = new Set<TelemetryEvent["type"]>([
  "unhandled_error",
  "unhandled_rejection",
  "fetch_error",
]);

function toDate(timestamp: string): Date {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

function resolveDurationMs(event: TelemetryEvent): number | null {
  if (typeof event.durationMs === "number") {
    return event.durationMs;
  }
  if (typeof event.request?.durationMs === "number") {
    return event.request.durationMs;
  }
  return null;
}

function resolveRoute(event: TelemetryEvent): string | null {
  return event.request?.url ?? event.pagePath ?? event.pageUrl ?? null;
}

// POST /api/observability/events — ingest client observability telemetry
export async function POST(req: NextRequest) {
  try {
    const auth = await resolveAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!auth.orgId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const eventsToCreate = parsed.data.events.map((event) => {
      const startedAt = toDate(event.timestamp);
      const durationMs = resolveDurationMs(event);
      const completedAt =
        durationMs !== null ? new Date(startedAt.getTime() + durationMs) : startedAt;
      const status = FAILURE_TYPES.has(event.type) ? "failed" : "completed";
      const route = resolveRoute(event);
      const statusCode = event.request?.statusCode ?? null;
      const requestId = event.request?.requestId ?? null;
      const errorMessage = event.error?.message ?? event.reason ?? null;

      return {
        orgId: auth.orgId,
        dealId: null,
        handlerName: "observability-client",
        eventType: event.type,
        status,
        inputData: {
          ...event,
          route,
          statusCode,
          durationMs,
          requestId,
        },
        outputData: {},
        error: errorMessage,
        startedAt,
        completedAt,
        durationMs,
      };
    });

    const result = await prisma.automationEvent.createMany({
      data: eventsToCreate,
    });

    return NextResponse.json({ ok: true, count: result.count }, { status: 201 });
  } catch (error) {
    console.error("[observability-events] Failed to record client telemetry", error);
    return NextResponse.json(
      { error: "Failed to record observability events" },
      { status: 500 },
    );
  }
}
