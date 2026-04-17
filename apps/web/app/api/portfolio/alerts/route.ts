import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { listPortfolioAlerts } from "@gpc/server/automation/portfolio-watcher.service";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const includeAck = request.nextUrl.searchParams.get("includeAcknowledged") === "1";
  const includeResolved = request.nextUrl.searchParams.get("includeResolved") === "1";
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.min(200, Math.max(1, Number.parseInt(limitRaw, 10))) : 50;

  try {
    const alerts = await listPortfolioAlerts(auth.orgId, {
      includeAcknowledged: includeAck,
      includeResolved,
      limit,
    });
    return NextResponse.json({ alerts });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.portfolio.alerts", method: "GET" },
    });
    return NextResponse.json({ error: "Failed to load alerts" }, { status: 500 });
  }
}
