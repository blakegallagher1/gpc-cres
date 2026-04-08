import crypto from "crypto";
import { NextResponse } from "next/server";
import { runOpportunityScan } from "@gpc/server/jobs/opportunity-scan.service";
import * as Sentry from "@sentry/nextjs";
import { logger, serializeErrorForLogs } from "@/lib/logger";

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
 * Vercel Cron Job: Opportunity Scanner
 * Runs every 6 hours to check saved searches for new parcel matches.
 */
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runOpportunityScan();

    if (summary.errors.length > 0 && summary.processed === 0) {
      return NextResponse.json(
        { error: "Opportunity scan failed", details: summary.errors.join("; ") },
        { status: 500 },
      );
    }

    return NextResponse.json(summary);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.cron.opportunity-scan", method: "GET" },
    });
    logger.error("Cron opportunity-scan failed", serializeErrorForLogs(err));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
