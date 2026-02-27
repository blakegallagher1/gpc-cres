import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { memoryEventSchema } from "@/lib/schemas/memoryEvent";
import { getMemoryEventService } from "@/lib/services/memoryEventService";

// POST /api/memory/events — Record a memory event
export async function POST(req: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = memoryEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const service = getMemoryEventService();
    const event = await service.recordEvent({
      ...parsed.data,
      orgId: auth.orgId,
      userId: parsed.data.userId ?? auth.userId,
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error("Error recording memory event:", error);
    return NextResponse.json(
      { error: "Failed to record memory event" },
      { status: 500 },
    );
  }
}

// GET /api/memory/events — Get event stats
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") ?? "7", 10);

    const service = getMemoryEventService();
    const stats = await service.getEventStats(auth.orgId, days);

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching memory event stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch memory event stats" },
      { status: 500 },
    );
  }
}
