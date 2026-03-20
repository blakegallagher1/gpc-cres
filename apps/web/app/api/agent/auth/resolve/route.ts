import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/agent/auth/resolve
 *
 * Resolves the user's orgId and userId from Auth.js/NextAuth auth context
 * (Authorization Bearer token or session cookie).
 * Called by the Cloudflare Worker during WebSocket setup to validate
 * org membership without duplicating the Prisma lookup.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ orgId: auth.orgId, userId: auth.userId });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.agent.auth.resolve", method: "POST" },
    });
    console.error("[auth/resolve] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

/** Support GET for simpler Worker integration */
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ orgId: auth.orgId, userId: auth.userId });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.agent.auth.resolve", method: "GET" },
    });
    console.error("[auth/resolve] GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
