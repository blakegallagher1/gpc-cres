import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { captureEvidence } from "@entitlement-os/evidence";
import type { CaptureEvidenceResult, SourceScanResult } from "@entitlement-os/evidence";
import {
  isMaterialChange,
  computeScanStats,
  groupChangesByJurisdiction,
  withRetry,
  withTimeout,
} from "@entitlement-os/evidence";
import { runWithCronMonitor } from "@/lib/automation/sentry";
import * as Sentry from "@sentry/nextjs";
import { logger, serializeErrorForLogs } from "@/lib/logger";

const MAX_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;
function verifyCronSecret(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const header = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (!header || header.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(header));
  } catch {
    return false;
  }
}

/**
 * Vercel Cron Job: Change Detection
 * Runs nightly at 6 AM to check all jurisdiction seed sources for content changes.
 *
 * Configure in vercel.json:
 * { "crons": [{ "path": "/api/cron/change-detection", "schedule": "0 6 * * *" }] }
 */
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runWithCronMonitor({
    slug: "change-detection",
    schedule: "0 6 * * *",
    handler: async () => {
      const startTime = Date.now();

      try {
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
      return NextResponse.json({
        ok: true,
        message: "No active seed sources to monitor",
        timestamp: new Date().toISOString(),
        stats: { total: 0, changed: 0, unreachable: 0 },
      });
    }

    // Create a Run record for auditing
    const orgId = sources[0].jurisdiction.orgId;
    const run = await prisma.run.create({
      data: {
        orgId,
        runType: "CHANGE_DETECT",
        status: "running",
      },
    });

    // 2. Process each source with retry + timeout
    const results: SourceScanResult[] = [];

    for (const source of sources) {
      const label = `${source.jurisdiction.name}: ${source.url}`;
      let result: SourceScanResult = {
        url: source.url,
        jurisdictionId: source.jurisdictionId,
        jurisdictionName: source.jurisdiction.name,
        purpose: source.purpose,
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
                orgId: source.jurisdiction.orgId,
                runId: run.id,
                prisma,
                allowPlaywrightFallback: false, // No Playwright in cron (cost cap guardrail)
                officialDomains: source.jurisdiction.officialDomains,
              }),
              MAX_TIMEOUT_MS,
              label
            ),
          MAX_RETRIES,
          label
        );

        // Detect first capture: if changed=true but there's only 1 snapshot, it's first capture
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

    // 5. For material changes: create review tasks for active deals in affected jurisdictions
    const changedJurisdictions = groupChangesByJurisdiction(stats.materialChanges);

    let tasksCreated = 0;
    for (const [jurisdictionId, changes] of changedJurisdictions) {
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
            pipelineStep: 4, // Entitlements step
          },
        });
        tasksCreated++;
        logger.info("Cron change-detection created review task", {
          dealId: deal.id,
          dealName: deal.name,
          jurisdictionName,
        });
      }
    }

    // 6. Update run record
    const elapsed = Date.now() - startTime;
    await prisma.run.update({
      where: { id: run.id },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        outputJson: {
          totalSources: stats.total,
          unreachableCount: stats.unreachable,
          materialChangeCount: stats.materialChangeCount,
          firstCaptureCount: stats.firstCaptureCount,
          tasksCreated,
          networkAlert: stats.networkAlert,
          elapsedMs: elapsed,
          changes: stats.materialChanges.map((c) => ({
            url: c.url,
            jurisdiction: c.jurisdictionName,
            purpose: c.purpose,
          })),
          unreachable: results
            .filter((r) => r.unreachable)
            .map((r) => ({ url: r.url, error: r.error })),
        },
      },
    });

    const summary = {
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

        logger.info("Cron change-detection complete", {
          summary: summary.stats,
        });
        return NextResponse.json(summary);
      } catch (error) {
        Sentry.captureException(error, {
          tags: { route: "api.cron.change-detection", method: "GET" },
        });
        logger.error("Cron change-detection failed", serializeErrorForLogs(error));
        return NextResponse.json(
          { error: "Change detection failed", details: String(error) },
          { status: 500 }
        );
      }
    },
  });
}
