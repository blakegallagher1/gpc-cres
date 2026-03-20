import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { SavedSearchService } from "@/lib/services/saved-search.service";
import { AppError } from "@/lib/errors";
import * as Sentry from "@sentry/nextjs";

const service = new SavedSearchService();
const OpportunityActionSchema = z.object({
  action: z.enum(["seen", "dismiss", "pursue"]),
});

// PATCH /api/opportunities/[id] — update per-match operator feedback
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = OpportunityActionSchema.safeParse(body);
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

    if (parsed.data.action === "seen") {
      const match = await service.markSeen(id, auth.orgId, auth.userId);
      return NextResponse.json({ match });
    } else if (parsed.data.action === "dismiss") {
      const match = await service.dismissMatch(id, auth.orgId, auth.userId);
      return NextResponse.json({ match });
    }

    const match = await service.markPursued(id, auth.orgId, auth.userId);
    return NextResponse.json({ match });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.opportunities", method: "PATCH" },
    });
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
