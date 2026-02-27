import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getMemoryEventService } from "@/lib/services/memoryEventService";

// GET /api/entities/[id]/memory — Get entity memory events
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor") ?? undefined;
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const factType = searchParams.get("factType") ?? undefined;
    const sourceType = searchParams.get("sourceType") ?? undefined;
    const status = searchParams.get("status") ?? undefined;

    const service = getMemoryEventService();
    const result = await service.getEntityMemory(id, auth.orgId, {
      cursor,
      limit,
      factType,
      sourceType,
      status,
    });

    return NextResponse.json({
      events: result.events,
      truthSummary: null,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Error fetching entity memory:", error);
    return NextResponse.json(
      { error: "Failed to fetch entity memory" },
      { status: 500 },
    );
  }
}
