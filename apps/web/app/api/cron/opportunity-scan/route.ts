import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { OpportunityScannerJob } from "@/lib/jobs/opportunity-scanner.job";

function verifyCronSecret(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const header = (req.headers.get("authorization") || "")
    .replace("Bearer ", "")
    .trim();
  if (!header || header.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(header));
  } catch {
    return false;
  }
}

// Vercel Cron Job: Opportunity Scanner
// Runs every 6 hours to check saved searches for new parcel matches.
// Schedule: "0 0,6,12,18 * * *" (every 6h)
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the first org to use for the Run record
  const firstOrg = await prisma.org.findFirst({ select: { id: true } });
  if (!firstOrg) {
    return NextResponse.json({ error: "No org found" }, { status: 500 });
  }

  // Create a Run record for audit trail
  const run = await prisma.run.create({
    data: {
      orgId: firstOrg.id,
      runType: "OPPORTUNITY_SCAN",
      status: "running",
    },
  });

  const job = new OpportunityScannerJob();
  const result = await job.execute();

  // Update run record
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

  return NextResponse.json({
    success: result.success,
    processed: result.processed,
    newMatches: result.newMatches,
    errors: result.errors,
    duration_ms: result.duration_ms,
  });
}
