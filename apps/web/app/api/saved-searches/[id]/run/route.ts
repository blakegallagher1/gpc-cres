import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { SavedSearchService } from "@/lib/services/saved-search.service";
import { AppError } from "@/lib/errors";
import * as Sentry from "@sentry/nextjs";

const service = new SavedSearchService();

// POST /api/saved-searches/[id]/run — manually execute a saved search
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = await service.runSearch(id, auth.orgId, auth.userId);
    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.saved-searches.run", method: "POST" },
    });
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error running saved search:", error);
    return NextResponse.json(
      { error: "Failed to run saved search" },
      { status: 500 }
    );
  }
}
