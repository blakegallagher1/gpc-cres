import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  fetchObjectBytesFromGateway,
  systemAuth,
} from "@/lib/storage/gatewayStorage";
import { runWithCronMonitor } from "@/lib/automation/sentry";
import * as Sentry from "@sentry/nextjs";
import { logger, serializeErrorForLogs } from "@/lib/logger";
import { runParishPackRefresh } from "@gpc/server/jobs/parish-pack-refresh.service";

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
 * Vercel Cron Job: Parish Pack Refresh
 * Runs weekly (Sunday 4 AM) to refresh stale parish packs.
 *
 * Configure in vercel.json:
 * { "crons": [{ "path": "/api/cron/parish-pack-refresh", "schedule": "0 4 * * 0" }] }
 */
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runWithCronMonitor({
    slug: "parish-pack-refresh",
    schedule: "0 4 * * 0",
    handler: async () => {
      try {
        const { searchParams } = new URL(req.url);
        const summary = await runParishPackRefresh({
          jurisdictionId: searchParams.get("jurisdictionId") ?? undefined,
          sku: searchParams.get("sku") ?? undefined,
          storage: {
            fetchObjectBytes: fetchObjectBytesFromGateway,
            systemAuth,
          },
        });
        return NextResponse.json(summary);
      } catch (error) {
        Sentry.captureException(error, {
          tags: { route: "api.cron.parish-pack-refresh", method: "GET" },
        });
        logger.error("Cron parish-pack-refresh failed", serializeErrorForLogs(error));
        return NextResponse.json(
          { error: "Parish pack refresh failed", details: String(error) },
          { status: 500 },
        );
      }
    },
  });
}
