import { prisma } from "@entitlement-os/db";

export interface AutomationEventRecord {
  id: string;
  orgId: string;
  dealId: string | null;
  handlerName: string;
  eventType: string;
  status: string;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}

export interface HandlerHealth {
  handlerName: string;
  lastRunAt: string | null;
  totalRuns7d: number;
  successCount7d: number;
  failureCount7d: number;
  successRate7d: number;
  avgDurationMs: number | null;
  status: "healthy" | "degraded" | "failing" | "inactive";
}

export interface AutomationStats {
  totalToday: number;
  successRateToday: number;
  avgDurationMs: number | null;
  failuresRequiringAttention: number;
}

const ALL_HANDLERS = [
  "intake",
  "enrichment",
  "triage",
  "taskExecution",
  "advancement",
  "documents",
  "changeDetection",
  "parishPackRefresh",
  "artifactGeneration",
  "buyerOutreach",
  "marketMonitoring",
  "knowledgeCapture",
  "ops",
];

export async function startEvent(
  orgId: string,
  handlerName: string,
  eventType: string,
  dealId?: string | null,
  inputData?: Record<string, unknown>,
  idempotencyKey?: string | null,
): Promise<string | null> {
  if (idempotencyKey) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO automation_events (id, org_id, handler_name, event_type, deal_id, status, idempotency_key, input_data, started_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4::uuid, 'running', $5, $6::jsonb, NOW(), NOW(), NOW())
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      orgId,
      handlerName,
      eventType,
      dealId ?? null,
      idempotencyKey,
      JSON.stringify(inputData ?? {}),
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0].id;
  }

  const event = await prisma.automationEvent.create({
    data: {
      orgId,
      handlerName,
      eventType,
      dealId: dealId ?? null,
      status: "running",
      inputData: (inputData ?? {}) as object,
      startedAt: new Date(),
    },
  });

  return event.id;
}

export async function completeEvent(
  eventId: string,
  outputData?: Record<string, unknown>,
): Promise<void> {
  const event = await prisma.automationEvent.findUnique({
    where: { id: eventId },
    select: { startedAt: true },
  });

  const now = new Date();
  const durationMs = event ? now.getTime() - event.startedAt.getTime() : null;

  await prisma.automationEvent.update({
    where: { id: eventId },
    data: {
      status: "completed",
      outputData: (outputData ?? {}) as object,
      completedAt: now,
      durationMs,
    },
  });
}

export async function failEvent(
  eventId: string,
  error: unknown,
  errorCode?: string,
): Promise<void> {
  const event = await prisma.automationEvent.findUnique({
    where: { id: eventId },
    select: { startedAt: true },
  });

  const now = new Date();
  const durationMs = event ? now.getTime() - event.startedAt.getTime() : null;
  const errorMessage = error instanceof Error ? error.message : String(error);

  const outputData: Record<string, unknown> = {};
  if (errorCode) {
    outputData.errorCode = errorCode;
    outputData.retryable = errorCode.startsWith("TRANSIENT");
  } else {
    outputData.retryable = false;
  }

  await prisma.automationEvent.update({
    where: { id: eventId },
    data: {
      status: "failed",
      error: errorMessage,
      outputData: outputData as object,
      completedAt: now,
      durationMs,
    },
  });
}

export async function getRecentEvents(
  orgId: string,
  limit = 50,
  dealId?: string,
): Promise<AutomationEventRecord[]> {
  const where: { orgId: string; dealId?: string } = { orgId };
  if (dealId) {
    where.dealId = dealId;
  }

  const events = await prisma.automationEvent.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: limit,
  });

  return events.map((event) => ({
    id: event.id,
    orgId: event.orgId,
    dealId: event.dealId,
    handlerName: event.handlerName,
    eventType: event.eventType,
    status: event.status,
    inputData: (event.inputData ?? {}) as Record<string, unknown>,
    outputData: (event.outputData ?? {}) as Record<string, unknown>,
    error: event.error,
    startedAt: event.startedAt.toISOString(),
    completedAt: event.completedAt?.toISOString() ?? null,
    durationMs: event.durationMs,
  }));
}

export async function getAutomationStats(orgId: string): Promise<AutomationStats> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todayEvents = await prisma.automationEvent.findMany({
    where: { orgId, startedAt: { gte: startOfDay } },
    select: { status: true, durationMs: true },
  });

  const total = todayEvents.length;
  const succeeded = todayEvents.filter((event) => event.status === "completed").length;
  const durations = todayEvents
    .map((event) => event.durationMs)
    .filter((duration): duration is number => duration !== null);

  const failuresRequiringAttention = await prisma.automationEvent.count({
    where: { orgId, status: "failed", completedAt: { gte: startOfDay } },
  });

  return {
    totalToday: total,
    successRateToday: total > 0 ? Math.round((succeeded / total) * 100) : 100,
    avgDurationMs:
      durations.length > 0
        ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
        : null,
    failuresRequiringAttention,
  };
}

export async function getHandlerHealth(orgId: string): Promise<HandlerHealth[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const events = await prisma.automationEvent.findMany({
    where: { orgId, startedAt: { gte: sevenDaysAgo } },
    select: {
      handlerName: true,
      status: true,
      startedAt: true,
      durationMs: true,
    },
    orderBy: { startedAt: "desc" },
  });

  const byHandler = new Map<
    string,
    {
      total: number;
      success: number;
      failure: number;
      lastRun: Date | null;
      durations: number[];
    }
  >();

  for (const handler of ALL_HANDLERS) {
    byHandler.set(handler, {
      total: 0,
      success: 0,
      failure: 0,
      lastRun: null,
      durations: [],
    });
  }

  for (const event of events) {
    const entry = byHandler.get(event.handlerName) ?? {
      total: 0,
      success: 0,
      failure: 0,
      lastRun: null,
      durations: [],
    };

    entry.total += 1;
    if (event.status === "completed") {
      entry.success += 1;
    }
    if (event.status === "failed") {
      entry.failure += 1;
    }
    if (!entry.lastRun || event.startedAt > entry.lastRun) {
      entry.lastRun = event.startedAt;
    }
    if (event.durationMs !== null) {
      entry.durations.push(event.durationMs);
    }

    byHandler.set(event.handlerName, entry);
  }

  return [...byHandler.entries()].map(([name, data]) => {
    const successRate = data.total > 0 ? Math.round((data.success / data.total) * 100) : 100;
    const avgDurationMs =
      data.durations.length > 0
        ? Math.round(data.durations.reduce((sum, duration) => sum + duration, 0) / data.durations.length)
        : null;

    let status: HandlerHealth["status"] = "inactive";
    if (data.total > 0) {
      if (successRate >= 90) {
        status = "healthy";
      } else if (successRate >= 60) {
        status = "degraded";
      } else {
        status = "failing";
      }
    }

    return {
      handlerName: name,
      lastRunAt: data.lastRun?.toISOString() ?? null,
      totalRuns7d: data.total,
      successCount7d: data.success,
      failureCount7d: data.failure,
      successRate7d: successRate,
      avgDurationMs,
      status,
    };
  });
}

export async function getFailedEvents(
  orgId: string,
  limit = 20,
): Promise<AutomationEventRecord[]> {
  const events = await prisma.automationEvent.findMany({
    where: { orgId, status: "failed" },
    orderBy: { startedAt: "desc" },
    take: limit,
  });

  return events.map((event) => ({
    id: event.id,
    orgId: event.orgId,
    dealId: event.dealId,
    handlerName: event.handlerName,
    eventType: event.eventType,
    status: event.status,
    inputData: (event.inputData ?? {}) as Record<string, unknown>,
    outputData: (event.outputData ?? {}) as Record<string, unknown>,
    error: event.error,
    startedAt: event.startedAt.toISOString(),
    completedAt: event.completedAt?.toISOString() ?? null,
    durationMs: event.durationMs,
  }));
}
