import { prisma, type Prisma } from "@entitlement-os/db";
import * as Sentry from "@sentry/nextjs";
import { runEntitlementKpiDriftMonitor } from "../monitoring/entitlement-kpi-monitor.service";
import { runEntitlementStrategyAutopilotSweep } from "../monitoring/entitlement-strategy-autopilot.service";
import { backfillEntitlementOutcomePrecedents } from "./entitlement-precedent-backfill.service";

export type EntitlementPrecedentBackfillCronInput = {
  jurisdictionId: string | null;
  sourceLimit: number;
  recordsPerSource: number;
  evidenceLinksPerRecord: number;
};

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function runEntitlementPrecedentBackfillCron(
  input: EntitlementPrecedentBackfillCronInput,
): Promise<Record<string, unknown>> {
  const orgs = await prisma.org.findMany({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (orgs.length === 0) {
    return { ok: true, message: "No orgs available for backfill." };
  }

  const orgResults: Array<Record<string, unknown>> = [];

  for (const org of orgs) {
    const run = await prisma.run.create({
      data: {
        orgId: org.id,
        runType: "ENRICHMENT",
        jurisdictionId: input.jurisdictionId,
        status: "running",
      },
    });

    try {
      const summary = await backfillEntitlementOutcomePrecedents({
        orgId: org.id,
        runId: run.id,
        jurisdictionId: input.jurisdictionId ?? undefined,
        sourceLimit: input.sourceLimit,
        recordsPerSource: input.recordsPerSource,
        evidenceLinksPerRecord: input.evidenceLinksPerRecord,
      });

      let kpiMonitorSummary: Prisma.InputJsonValue | null = null;
      try {
        kpiMonitorSummary = toInputJsonValue(
          await runEntitlementKpiDriftMonitor({
            orgId: org.id,
            jurisdictionId: input.jurisdictionId ?? undefined,
          }),
        );
      } catch (monitorError) {
        Sentry.captureException(monitorError, {
          tags: { service: "entitlement-precedent-backfill-cron", phase: "kpi-monitor" },
        });
        kpiMonitorSummary = toInputJsonValue({
          success: false,
          error:
            monitorError instanceof Error
              ? monitorError.message
              : String(monitorError),
        });
      }

      let autopilotSummary: Prisma.InputJsonValue | null = null;
      try {
        autopilotSummary = toInputJsonValue(
          await runEntitlementStrategyAutopilotSweep({
            orgId: org.id,
            jurisdictionId: input.jurisdictionId,
          }),
        );
      } catch (autopilotError) {
        Sentry.captureException(autopilotError, {
          tags: {
            service: "entitlement-precedent-backfill-cron",
            phase: "strategy-autopilot",
          },
        });
        autopilotSummary = toInputJsonValue({
          success: false,
          error:
            autopilotError instanceof Error
              ? autopilotError.message
              : String(autopilotError),
        });
      }

      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          outputJson: {
            ...summary,
            kpiMonitor: kpiMonitorSummary,
            strategyAutopilot: autopilotSummary,
          },
        },
      });

      orgResults.push({
        runId: run.id,
        status: "succeeded",
        ...summary,
        kpiMonitor: kpiMonitorSummary,
        strategyAutopilot: autopilotSummary,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error: message.slice(0, 10_000),
        },
      });

      orgResults.push({
        orgId: org.id,
        runId: run.id,
        status: "failed",
        error: message,
      });
    }
  }

  return {
    ok: true,
    timestamp: new Date().toISOString(),
    orgsProcessed: orgResults.length,
    results: orgResults,
  };
}
