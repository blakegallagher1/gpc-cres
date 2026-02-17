import { prisma } from "@entitlement-os/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutomationEventRecord {
  id: string;
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

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function startEvent(
  handlerName: string,
  eventType: string,
  dealId?: string | null,
  inputData?: Record<string, unknown>
): Promise<string> {
  const event = await prisma.automationEvent.create({
    data: {
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
  outputData?: Record<string, unknown>
): Promise<void> {
  const event = await prisma.automationEvent.findUnique({
    where: { id: eventId },
    select: { startedAt: true },
  });

  const now = new Date();
  const durationMs = event
    ? now.getTime() - event.startedAt.getTime()
    : null;

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
  error: unknown
): Promise<void> {
  const event = await prisma.automationEvent.findUnique({
    where: { id: eventId },
    select: { startedAt: true },
  });

  const now = new Date();
  const durationMs = event
    ? now.getTime() - event.startedAt.getTime()
    : null;

  const errorMessage =
    error instanceof Error ? error.message : String(error);

  await prisma.automationEvent.update({
    where: { id: eventId },
    data: {
      status: "failed",
      error: errorMessage,
      completedAt: now,
      durationMs,
    },
  });
}

export async function getRecentEvents(
  limit = 50,
  dealId?: string
): Promise<AutomationEventRecord[]> {
  const events = await prisma.automationEvent.findMany({
    where: dealId ? { dealId } : undefined,
    orderBy: { startedAt: "desc" },
    take: limit,
  });

  return events.map((e) => ({
    id: e.id,
    dealId: e.dealId,
    handlerName: e.handlerName,
    eventType: e.eventType,
    status: e.status,
    inputData: (e.inputData ?? {}) as Record<string, unknown>,
    outputData: (e.outputData ?? {}) as Record<string, unknown>,
    error: e.error,
    startedAt: e.startedAt.toISOString(),
    completedAt: e.completedAt?.toISOString() ?? null,
    durationMs: e.durationMs,
  }));
}

export async function getAutomationStats(): Promise<AutomationStats> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todayEvents = await prisma.automationEvent.findMany({
    where: { startedAt: { gte: startOfDay } },
    select: { status: true, durationMs: true },
  });

  const total = todayEvents.length;
  const succeeded = todayEvents.filter((e) => e.status === "completed").length;
  const durations = todayEvents
    .map((e) => e.durationMs)
    .filter((d): d is number => d !== null);

  const failuresRequiringAttention = await prisma.automationEvent.count({
    where: { status: "failed", completedAt: { gte: startOfDay } },
  });

  return {
    totalToday: total,
    successRateToday: total > 0 ? Math.round((succeeded / total) * 100) : 100,
    avgDurationMs:
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null,
    failuresRequiringAttention,
  };
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

export async function getHandlerHealth(): Promise<HandlerHealth[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const events = await prisma.automationEvent.findMany({
    where: { startedAt: { gte: sevenDaysAgo } },
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

  // Initialize all known handlers
  for (const h of ALL_HANDLERS) {
    byHandler.set(h, {
      total: 0,
      success: 0,
      failure: 0,
      lastRun: null,
      durations: [],
    });
  }

  for (const e of events) {
    const entry = byHandler.get(e.handlerName) ?? {
      total: 0,
      success: 0,
      failure: 0,
      lastRun: null,
      durations: [],
    };
    entry.total++;
    if (e.status === "completed") entry.success++;
    if (e.status === "failed") entry.failure++;
    if (!entry.lastRun || e.startedAt > entry.lastRun) {
      entry.lastRun = e.startedAt;
    }
    if (e.durationMs !== null) entry.durations.push(e.durationMs);
    byHandler.set(e.handlerName, entry);
  }

  return [...byHandler.entries()].map(([name, data]) => {
    const successRate =
      data.total > 0 ? Math.round((data.success / data.total) * 100) : 100;
    const avgDuration =
      data.durations.length > 0
        ? Math.round(
            data.durations.reduce((a, b) => a + b, 0) / data.durations.length
          )
        : null;

    let status: HandlerHealth["status"] = "inactive";
    if (data.total > 0) {
      if (successRate >= 90) status = "healthy";
      else if (successRate >= 60) status = "degraded";
      else status = "failing";
    }

    return {
      handlerName: name,
      lastRunAt: data.lastRun?.toISOString() ?? null,
      totalRuns7d: data.total,
      successCount7d: data.success,
      failureCount7d: data.failure,
      successRate7d: successRate,
      avgDurationMs: avgDuration,
      status,
    };
  });
}

export async function getFailedEvents(limit = 20): Promise<AutomationEventRecord[]> {
  const events = await prisma.automationEvent.findMany({
    where: { status: "failed" },
    orderBy: { startedAt: "desc" },
    take: limit,
  });

  return events.map((e) => ({
    id: e.id,
    dealId: e.dealId,
    handlerName: e.handlerName,
    eventType: e.eventType,
    status: e.status,
    inputData: (e.inputData ?? {}) as Record<string, unknown>,
    outputData: (e.outputData ?? {}) as Record<string, unknown>,
    error: e.error,
    startedAt: e.startedAt.toISOString(),
    completedAt: e.completedAt?.toISOString() ?? null,
    durationMs: e.durationMs,
  }));
}
