import crypto from "crypto";
import { NextResponse } from "next/server";
import { runDriftMonitor } from "@gpc/server/jobs/drift-monitor.service";
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
 * Vercel Cron Job: Drift Monitor
 * Checks each calibration segment for MAE worsening and triggers drift freeze.
 */
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runDriftMonitor();
    return NextResponse.json(summary);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.cron.drift-monitor", method: "GET" },
    });
    logger.error("Cron drift-monitor failed", serializeErrorForLogs(err));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
