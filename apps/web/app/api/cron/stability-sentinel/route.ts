// TODO: The sentinel currently checks chat/map/workflow but does NOT probe the
// /db endpoint. Add a fourth surface check that hits the gateway /db endpoint —
// /health returning OK is not sufficient (it was healthy while /db was dead
// during the 2026-03-31 Docker crash).
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import crypto from "node:crypto";
import { runStabilitySentinel } from "@gpc/server/jobs/stability-sentinel.service";

export const runtime = "nodejs";
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function verifyCronSecret(request: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!header || header.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(header));
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runStabilitySentinel();
    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.cron.stability-sentinel", method: "GET" },
    });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sentinel failed" },
      { status: 500 },
    );
  }
}
