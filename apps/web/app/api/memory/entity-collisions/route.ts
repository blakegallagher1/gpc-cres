import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getPendingCollisions, resolveCollision } from "@/lib/services/entityCollisionDetector";

// GET /api/memory/entity-collisions — Get pending collision alerts
export async function GET() {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const alerts = await getPendingCollisions(auth.orgId);
    return NextResponse.json({ alerts });
  } catch (error) {
    console.error("Error fetching collision alerts:", error);
    return NextResponse.json(
      { error: "Failed to fetch collision alerts" },
      { status: 500 },
    );
  }
}

// POST /api/memory/entity-collisions — Resolve a collision alert
export async function POST(req: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { alertId, resolution } = body;

    if (!alertId || !resolution || !["merge", "distinct", "ignore"].includes(resolution)) {
      return NextResponse.json(
        { error: "alertId and resolution (merge|distinct|ignore) required" },
        { status: 400 },
      );
    }

    await resolveCollision(auth.orgId, alertId, auth.userId, resolution);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error resolving collision:", error);
    return NextResponse.json(
      { error: "Failed to resolve collision" },
      { status: 500 },
    );
  }
}
