import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { recomputeAllSegments } from "@/lib/jobs/calibrationRecompute";
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

// Vercel Cron Job: Calibration Recompute
// Recomputes segment bias stats using decay-aware effective weights.
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orgs = await prisma.org.findMany({ select: { id: true } });
    const errors: Array<{ orgId: string; error: string }> = [];

    for (const org of orgs) {
      try {
        await recomputeAllSegments(org.id);
      } catch (err) {
        Sentry.captureException(err, {
          tags: { route: "api.cron.calibration", method: "GET" },
        });
        errors.push({
          orgId: org.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      orgsProcessed: orgs.length,
      errors,
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.cron.calibration", method: "GET" },
    });
    console.error("[cron/calibration] failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

