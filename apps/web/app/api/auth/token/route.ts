import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import {
  getLocalDevAuthResult,
  isAppRouteLocalBypassEnabled,
} from "@/lib/auth/localDevBypass";

/**
 * GET /api/auth/token
 *
 * Returns the Clerk session token for the authenticated user. The browser
 * calls this before opening the WebSocket to the Cloudflare Agent Worker,
 * which needs a Bearer token it can verify against Clerk's JWKS endpoint.
 */
export async function GET(request: NextRequest) {
  if (isAppRouteLocalBypassEnabled()) {
    const devAuth = getLocalDevAuthResult();
    // Return a placeholder token for local dev — the worker also bypasses auth in dev.
    return NextResponse.json({
      token: `local-dev:${devAuth.userId}:${devAuth.orgId}`,
    });
  }

  const { userId, getToken } = getAuth(request);

  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ error: "Token unavailable" }, { status: 401 });
  }

  return NextResponse.json({ token });
}
