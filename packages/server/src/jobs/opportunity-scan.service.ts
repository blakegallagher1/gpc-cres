import { prisma } from "@entitlement-os/db";
import { OpportunityScannerJob } from "./opportunity-scanner.job";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpportunityScanSummary {
  success: boolean;
  processed: number;
  newMatches: number;
  errors: string[];
  duration_ms: number;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function runOpportunityScan(): Promise<OpportunityScanSummary> {
  const firstOrg = await prisma.org.findFirst({ select: { id: true } });
  if (!firstOrg) {
    return {
      success: false,
      processed: 0,
      newMatches: 0,
      errors: ["No org found"],
      duration_ms: 0,
    };
  }

  const run = await prisma.run.create({
    data: {
      orgId: firstOrg.id,
      runType: "OPPORTUNITY_SCAN",
      status: "running",
    },
  });

  const job = new OpportunityScannerJob();
  const result = await job.execute();

  await prisma.run.update({
    where: { id: run.id },
    data: {
      status: result.success ? "succeeded" : "failed",
      finishedAt: new Date(),
      error: result.errors.length > 0 ? result.errors.join("; ") : null,
      outputJson: {
        processed: result.processed,
        newMatches: result.newMatches,
        duration_ms: result.duration_ms,
      },
    },
  });

  return {
    success: result.success,
    processed: result.processed,
    newMatches: result.newMatches,
    errors: result.errors,
    duration_ms: result.duration_ms,
  };
}
