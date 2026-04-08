import crypto from "crypto";
import { NextResponse } from "next/server";
import { runWithCronMonitor } from "@/lib/automation/sentry";
import * as Sentry from "@sentry/nextjs";
import { logger, serializeErrorForLogs } from "@/lib/logger";
import { runChangeDetection } from "@gpc/server/jobs/change-detection.service";

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
      try {
        const summary = await runChangeDetection();
        return NextResponse.json(summary);
      } catch (error) {
        Sentry.captureException(error, {
          tags: { route: "api.cron.change-detection", method: "GET" },
        });
        logger.error("Cron change-detection failed", serializeErrorForLogs(error));
        return NextResponse.json(
          { error: "Change detection failed", details: String(error) },
          { status: 500 },
        );
      }
    },
  });
}
