import crypto from "crypto";
import { NextResponse } from "next/server";
import { runEntitlementPrecedentBackfillCron } from "@gpc/server";

import * as Sentry from "@sentry/nextjs";

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
 * Vercel Cron Job: Entitlement Precedent Backfill
 * Ingests connector records from RSS, Socrata, and ArcGIS seed sources
 * and upserts structured entitlement precedents for prediction calibration.
 */
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestUrl = new URL(req.url);
  const jurisdictionId = requestUrl.searchParams.get("jurisdictionId");
  const sourceLimit = Number(requestUrl.searchParams.get("sourceLimit") ?? "25");
  const recordsPerSource = Number(requestUrl.searchParams.get("recordsPerSource") ?? "75");
  const evidenceLinksPerRecord = Number(requestUrl.searchParams.get("evidenceLinksPerRecord") ?? "2");
  try {
    const data = await runEntitlementPrecedentBackfillCron({
      jurisdictionId,
      sourceLimit: Number.isFinite(sourceLimit) ? sourceLimit : 25,
      recordsPerSource: Number.isFinite(recordsPerSource) ? recordsPerSource : 75,
      evidenceLinksPerRecord: Number.isFinite(evidenceLinksPerRecord)
        ? evidenceLinksPerRecord
        : 2,
    });
    return NextResponse.json(data);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.cron.entitlement-precedent-backfill", method: "GET" },
    });
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
