import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { SavedSearchService } from "@/lib/services/saved-search.service";
import { AppError } from "@/lib/errors";

const service = new SavedSearchService();

// PATCH /api/opportunities/[id] — mark seen or dismiss a match
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    if (body.action === "seen") {
      const match = await service.markSeen(id, auth.orgId, auth.userId);
      return NextResponse.json({ match });
    } else if (body.action === "dismiss") {
      const match = await service.dismissMatch(id, auth.orgId, auth.userId);
      return NextResponse.json({ match });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'seen' or 'dismiss'." },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error updating opportunity:", error);
    return NextResponse.json(
      { error: "Failed to update opportunity" },
      { status: 500 }
    );
  }
}
