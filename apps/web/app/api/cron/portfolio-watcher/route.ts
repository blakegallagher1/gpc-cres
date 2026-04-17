import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import crypto from "node:crypto";
import { runPortfolioWatcher } from "@gpc/server/automation/portfolio-watcher.service";

export const runtime = "nodejs";
export const maxDuration = 60;

function verifyCronSecret(request: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!header || header.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(header));
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPortfolioWatcher();
    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.cron.portfolio-watcher", method: "GET" },
    });
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Portfolio watcher failed",
      },
      { status: 500 },
    );
  }
}
