import crypto from "crypto";
import { NextResponse } from "next/server";
import { runWithCronMonitor } from "@/lib/automation/sentry";
import * as Sentry from "@sentry/nextjs";
import { logger, serializeErrorForLogs } from "@/lib/logger";
import { runSourceIngestion } from "@gpc/server/jobs/source-ingestion.service";

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
 * Vercel Cron Job: Source Ingestion
 * Runs weekly on Sundays at 5 AM to capture and score jurisdiction seed sources.
 *
 * Configure in vercel.json:
 * { "crons": [{ "path": "/api/cron/source-ingestion", "schedule": "0 5 * * 0" }] }
 */
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runWithCronMonitor({
    slug: "source-ingestion",
    schedule: "0 5 * * 0",
    handler: async () => {
      try {
        const summary = await runSourceIngestion();
        return NextResponse.json(summary);
      } catch (error) {
        Sentry.captureException(error, {
          tags: { route: "api.cron.source-ingestion", method: "GET" },
        });
        logger.error("Cron source-ingestion failed", serializeErrorForLogs(error));
        return NextResponse.json(
          { error: "Source ingestion failed", details: String(error) },
          { status: 500 },
        );
      }
    },
  });
}
