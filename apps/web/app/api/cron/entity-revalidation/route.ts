import crypto from "crypto";
import { NextResponse } from "next/server";
import { runEntityRevalidationCron } from "@gpc/server";
import * as Sentry from "@sentry/nextjs";
import { logger, serializeErrorForLogs } from "@/lib/logger";

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

// Vercel Cron Job: Entity Revalidation
// Scans entities for address collisions and creates alerts.
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await runEntityRevalidationCron();
    return NextResponse.json(data);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.cron.entity-revalidation", method: "GET" },
    });
    logger.error("Cron entity-revalidation failed", serializeErrorForLogs(err));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
