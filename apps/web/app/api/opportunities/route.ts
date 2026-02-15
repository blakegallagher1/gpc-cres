import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { SavedSearchService } from "@/lib/services/saved-search.service";

const service = new SavedSearchService();
const BulkOpportunitySchema = z.object({
  action: z.enum(["seen", "dismiss"]),
  ids: z.array(z.string().uuid()).min(1).max(250),
});

// GET /api/opportunities — all unseen matches across all saved searches
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    const result = await service.getOpportunities(auth.orgId, auth.userId, limit, offset);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching opportunities:", error);
    return NextResponse.json(
      { error: "Failed to fetch opportunities" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = BulkOpportunitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        },
        { status: 400 }
      );
    }

    const { action, ids } = parsed.data;
    const result =
      action === "seen"
        ? await service.markSeenBulk(ids, auth.orgId, auth.userId)
        : await service.dismissMatchBulk(ids, auth.orgId, auth.userId);

    return NextResponse.json({
      action,
      result,
    });
  } catch (error) {
    console.error("Error bulk updating opportunities:", error);
    return NextResponse.json(
      { error: "Failed to bulk update opportunities" },
      { status: 500 }
    );
  }
}
