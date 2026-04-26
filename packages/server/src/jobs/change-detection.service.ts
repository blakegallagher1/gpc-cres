import { prisma } from "@entitlement-os/db";
import { captureEvidence } from "@entitlement-os/evidence";
import type { CaptureEvidenceResult, SourceScanResult } from "@entitlement-os/evidence";
import {
  computeScanStats,
  withRetry,
  withTimeout,
} from "@entitlement-os/evidence";
import * as Sentry from "@sentry/nextjs";
import { logger } from "../logger";

const MAX_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;

type OrgSourceScanResult = SourceScanResult & {
  orgId: string;
  runId: string;
};

export interface ChangeDetectionSummary {
  ok: boolean;
  message: string;
  timestamp: string;
  elapsedMs: number;
  stats: {
    total: number;
    changed: number;
    firstCaptures: number;
    unreachable: number;
    tasksCreated: number;
    networkAlert: boolean;
  };
}

/**
 * Core change detection logic. Orchestrates source scanning, stats
 * computation, review task creation, and run record persistence.
 */
export async function runChangeDetection(): Promise<ChangeDetectionSummary> {
  const startTime = Date.now();

  // 1. Fetch all active seed sources with jurisdiction details
  const sources = await prisma.jurisdictionSeedSource.findMany({
    where: { active: true },
    include: {
      jurisdiction: {
        select: {
          id: true,
          name: true,
          orgId: true,
          officialDomains: true,
        },
      },
    },
  });

  if (sources.length === 0) {
    return {
      ok: true,
      message: "No active seed sources to monitor",
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - startTime,
      stats: { total: 0, changed: 0, firstCaptures: 0, unreachable: 0, tasksCreated: 0, networkAlert: false },
    };
  }

  const orgIds = Array.from(new Set(sources.map((source) => source.jurisdiction.orgId)));
  const runIdsByOrgId = new Map<string, string>();
  for (const orgId of orgIds) {
    const run = await prisma.run.create({
      data: {
        orgId,
        runType: "CHANGE_DETECT",
        status: "running",
      },
    });
    runIdsByOrgId.set(orgId, run.id);
  }

  // 2. Process each source with retry + timeout
  const results: OrgSourceScanResult[] = [];

  for (const source of sources) {
    const label = `${source.jurisdiction.name}: ${source.url}`;
    const orgId = source.jurisdiction.orgId;
    const runId = runIdsByOrgId.get(orgId);
    if (!runId) {
      throw new Error(`No change-detection run available for org ${orgId}`);
    }
    let result: OrgSourceScanResult = {
      url: source.url,
      jurisdictionId: source.jurisdictionId,
      jurisdictionName: source.jurisdiction.name,
      purpose: source.purpose,
      orgId,
      runId,
      changed: false,
      firstCapture: false,
      error: null,
      unreachable: false,
    };

    try {
      const captureResult: CaptureEvidenceResult = await withRetry(
        () =>
          withTimeout(
            captureEvidence({
              url: source.url,
              orgId,
              runId,
              prisma,
              allowPlaywrightFallback: false,
              officialDomains: source.jurisdiction.officialDomains,
            }),
            MAX_TIMEOUT_MS,
            label,
          ),
        MAX_RETRIES,
        label,
      );

      const snapshotCount = await prisma.evidenceSnapshot.count({
        where: { evidenceSourceId: captureResult.sourceId },
      });

      result = {
        ...result,
        changed: captureResult.changed,
        firstCapture: snapshotCount <= 1,
      };

      logger.info("Cron change-detection captured source result", {
        label,
        result: captureResult.changed
          ? (snapshotCount <= 1 ? "first_capture" : "changed")
          : "unchanged",
      });
    } catch (error) {
      Sentry.captureException(error, {
        tags: { route: "api.cron.change-detection", method: "GET" },
      });
      const errorMsg = error instanceof Error ? error.message : String(error);
      result = {
        ...result,
        error: errorMsg,
        unreachable: true,
      };
      logger.error("Cron change-detection source failed after retries", {
        label,
        maxRetries: MAX_RETRIES,
        errorMessage: errorMsg,
      });
    }

    results.push(result);
  }

  // 3. Analyze results
  const stats = computeScanStats(results);

  // 4. Guardrail: If >50% unreachable, log alert
  if (stats.networkAlert) {
    logger.error("Cron change-detection network alert", {
      unreachable: stats.unreachable,
      total: stats.total,
      unreachableRatio: stats.unreachableRatio,
    });
  }

  // 5. For material changes: create review tasks for active deals
  const changedJurisdictions = new Map<string, OrgSourceScanResult[]>();
  for (const change of stats.materialChanges as OrgSourceScanResult[]) {
    const key = `${change.orgId}:${change.jurisdictionId}`;
    const existing = changedJurisdictions.get(key) ?? [];
    existing.push(change);
    changedJurisdictions.set(key, existing);
  }

  let tasksCreated = 0;
  const tasksCreatedByOrgId = new Map<string, number>();
  for (const changes of changedJurisdictions.values()) {
    const orgId = changes[0].orgId;
    const jurisdictionId = changes[0].jurisdictionId;
    const activeDeals = await prisma.deal.findMany({
      where: {
        jurisdictionId,
        orgId,
        status: { notIn: ["KILLED", "EXITED"] },
      },
      select: { id: true, name: true },
    });

    const changeSummary = changes
      .map((c) => `- [${c.purpose}] ${c.url}`)
      .join("\n");
    const jurisdictionName = changes[0].jurisdictionName;

    for (const deal of activeDeals) {
      await prisma.task.create({
        data: {
          orgId,
          dealId: deal.id,
          title: `Review policy changes: ${jurisdictionName}`,
          description: `Change detection found material updates at ${jurisdictionName} jurisdiction sources that may affect this deal.\n\nChanged sources:\n${changeSummary}\n\nReview these changes and assess impact on the entitlement process.`,
          status: "TODO",
          pipelineStep: 4,
        },
      });
      tasksCreated++;
      tasksCreatedByOrgId.set(orgId, (tasksCreatedByOrgId.get(orgId) ?? 0) + 1);
      logger.info("Cron change-detection created review task", {
        dealId: deal.id,
        dealName: deal.name,
        jurisdictionName,
      });
    }
  }

  // 6. Update run records
  const elapsed = Date.now() - startTime;
  for (const [orgId, runId] of runIdsByOrgId) {
    const orgResults = results.filter((result) => result.orgId === orgId);
    const orgStats = computeScanStats(orgResults);
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        outputJson: {
          totalSources: orgStats.total,
          unreachableCount: orgStats.unreachable,
          materialChangeCount: orgStats.materialChangeCount,
          firstCaptureCount: orgStats.firstCaptureCount,
          tasksCreated: tasksCreatedByOrgId.get(orgId) ?? 0,
          networkAlert: orgStats.networkAlert,
          elapsedMs: elapsed,
          changes: orgStats.materialChanges.map((c) => ({
            url: c.url,
            jurisdiction: c.jurisdictionName,
            purpose: c.purpose,
          })),
          unreachable: orgResults
            .filter((r) => r.unreachable)
            .map((r) => ({ url: r.url, error: r.error })),
        },
      },
    });
  }

  const summary: ChangeDetectionSummary = {
    ok: true,
    message: "Change detection complete",
    timestamp: new Date().toISOString(),
    elapsedMs: elapsed,
    stats: {
      total: stats.total,
      changed: stats.materialChangeCount,
      firstCaptures: stats.firstCaptureCount,
      unreachable: stats.unreachable,
      tasksCreated,
      networkAlert: stats.networkAlert,
    },
  };

  logger.info("Cron change-detection complete", { summary: summary.stats });
  return summary;
}
