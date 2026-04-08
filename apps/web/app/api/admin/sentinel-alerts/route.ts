import { NextResponse, type NextRequest } from "next/server";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import {
  persistSentinelAlert,
  listRecentSentinelAlerts,
} from "@gpc/server/admin/sentinel-alerts.service";

export const runtime = "nodejs";

/**
 * Internal sentinel alert receiver.
 *
 * POST — Receives alert payloads from the CLI sentinel runner and persists
 *        them via the package service.
 * GET  — Returns recent sentinel alerts (last 24h).
 */
export async function POST(request: Request) {
  const authorization = await authorizeApiRoute(
    request as NextRequest,
    "/api/admin/sentinel-alerts",
  );
  if (!authorization.ok) {
    return authorization.response;
  }

  const body = await request.json().catch(() => null);
  const outcome = await persistSentinelAlert(body);

  if (!outcome.ok) {
    return NextResponse.json({ ok: false, error: outcome.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, stored: true });
}

export async function GET(request: Request) {
  const authorization = await authorizeApiRoute(
    request as NextRequest,
    "/api/admin/sentinel-alerts",
  );
  if (!authorization.ok) {
    return authorization.response;
  }

  const result = await listRecentSentinelAlerts();
  return NextResponse.json({ ok: true, ...result });
}
