import { prisma } from "@entitlement-os/db";
import * as Sentry from "@sentry/nextjs";

const SENTINEL_ORG_ID = "00000000-0000-0000-0000-000000000001";

export interface SentinelAlertRecord {
  id: string;
  source: string;
  inputData: unknown;
  outputData: unknown;
  startedAt: string;
}

export interface SentinelAlertPayload {
  verdict?: string;
  failCount?: number;
  warnCount?: number;
  [key: string]: unknown;
}

export interface PersistSentinelAlertResult {
  ok: boolean;
  error?: string;
}

/**
 * Persist a sentinel alert webhook payload as an automation_events row.
 * Never throws — returns a structured error for the route to map to HTTP.
 */
export async function persistSentinelAlert(
  body: SentinelAlertPayload | null,
): Promise<PersistSentinelAlertResult> {
  try {
    await prisma.automationEvent.create({
      data: {
        orgId: SENTINEL_ORG_ID,
        handlerName: "stability-sentinel-cli",
        eventType: "sentinel.alert",
        status: "completed",
        inputData: (body ?? {}) as object,
        outputData: {
          source: "webhook",
          verdict: body?.verdict ?? "UNKNOWN",
          failCount: body?.failCount ?? 0,
          warnCount: body?.warnCount ?? 0,
        } as object,
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 0,
      },
    });

    return { ok: true };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.admin.sentinel-alerts", method: "POST" },
    });
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Storage failed",
    };
  }
}

/**
 * Load the most recent 24h of sentinel alert events for admin inspection.
 */
export async function listRecentSentinelAlerts(
  limit = 50,
): Promise<{ count: number; alerts: SentinelAlertRecord[] }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const alerts = await prisma.automationEvent.findMany({
    where: {
      handlerName: { in: ["stability-sentinel", "stability-sentinel-cli"] },
      eventType: "sentinel.alert",
      startedAt: { gte: since },
    },
    orderBy: { startedAt: "desc" },
    take: limit,
  });

  return {
    count: alerts.length,
    alerts: alerts.map((a) => ({
      id: a.id,
      source: a.handlerName,
      inputData: a.inputData,
      outputData: a.outputData,
      startedAt: a.startedAt.toISOString(),
    })),
  };
}
