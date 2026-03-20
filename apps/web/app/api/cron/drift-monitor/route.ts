import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { trackDrift } from "@/lib/services/driftFreezeService";
import * as Sentry from "@sentry/nextjs";

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

// Vercel Cron Job: Drift Monitor
// Checks each calibration segment for MAE worsening and triggers drift freeze.
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const segments = await prisma.calibrationSegment.findMany({
      select: { id: true, orgId: true, mae: true },
    });

    const results: Array<{ segmentId: string; frozen: boolean; consecutiveWorsenings: number }> = [];

    for (const segment of segments) {
      if (segment.mae === null) continue;

      const result = await trackDrift(segment.orgId, segment.id, segment.mae);
      results.push({ segmentId: segment.id, ...result });
    }

    const frozenCount = results.filter((r) => r.frozen).length;

    return NextResponse.json({
      success: true,
      segmentsChecked: results.length,
      frozenSegments: frozenCount,
      results,
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.cron.drift-monitor", method: "GET" },
    });
    console.error("[cron/drift-monitor] failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
