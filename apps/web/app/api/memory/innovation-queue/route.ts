import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getPendingInnovations, reviewInnovation } from "@/lib/services/noveltyDetector";

// GET /api/memory/innovation-queue — Get pending innovation queue items
export async function GET() {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const items = await getPendingInnovations(auth.orgId);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching innovation queue:", error);
    return NextResponse.json(
      { error: "Failed to fetch innovation queue" },
      { status: 500 },
    );
  }
}

// POST /api/memory/innovation-queue — Review an innovation queue item
export async function POST(req: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { innovationId, decision } = body;

    if (!innovationId || !decision || !["approve", "reject"].includes(decision)) {
      return NextResponse.json(
        { error: "innovationId and decision (approve|reject) required" },
        { status: 400 },
      );
    }

    await reviewInnovation(auth.orgId, innovationId, auth.userId, decision);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reviewing innovation:", error);
    return NextResponse.json(
      { error: "Failed to review innovation" },
      { status: 500 },
    );
  }
}
