import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

/**
 * POST /api/agent/auth/resolve
 *
 * Resolves the user's orgId and userId from a Supabase JWT.
 * Called by the Cloudflare Worker during WebSocket setup to validate
 * org membership without duplicating the Prisma lookup.
 */
export async function POST() {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ orgId: auth.orgId, userId: auth.userId });
  } catch (err) {
    console.error("[auth/resolve] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

/** Support GET for simpler Worker integration */
export async function GET() {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ orgId: auth.orgId, userId: auth.userId });
  } catch (err) {
    console.error("[auth/resolve] GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
