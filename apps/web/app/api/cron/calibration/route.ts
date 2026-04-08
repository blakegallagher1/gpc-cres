import crypto from "crypto";
import { NextResponse } from "next/server";
import { runCalibrationForAllOrgsSafely } from "@gpc/server/jobs/calibration-cron.service";

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

  const outcome = await runCalibrationForAllOrgsSafely();

  if (!outcome.ok) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json(outcome.result);
}
