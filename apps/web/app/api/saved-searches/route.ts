import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { SavedSearchService } from "@/lib/services/saved-search.service";
import { AppError } from "@/lib/errors";

const service = new SavedSearchService();
const BulkSavedSearchSchema = z.object({
  action: z.enum(["delete", "run"]),
  ids: z.array(z.string().uuid()).min(1).max(250),
});

// GET /api/saved-searches — list all saved searches for the user
export async function GET() {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searches = await service.getAll(auth.orgId, auth.userId);
    return NextResponse.json({ searches });
  } catch (error) {
    console.error("Error fetching saved searches:", error);
    return NextResponse.json(
      { error: "Failed to fetch saved searches" },
      { status: 500 }
    );
  }
}

// POST /api/saved-searches — create a new saved search
export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const search = await service.create({
      orgId: auth.orgId,
      userId: auth.userId,
      name: body.name,
      criteria: body.criteria ?? {},
      alertEnabled: body.alertEnabled,
      alertFrequency: body.alertFrequency,
    });

    return NextResponse.json({ search }, { status: 201 });
  } catch (error) {
    console.error("Error creating saved search:", error);
    return NextResponse.json(
      { error: "Failed to create saved search" },
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
    const parsed = BulkSavedSearchSchema.safeParse(body);
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

    if (parsed.data.action === "delete") {
      const result = await service.deleteMany(
        parsed.data.ids,
        auth.orgId,
        auth.userId
      );
      return NextResponse.json({ action: parsed.data.action, result });
    }

    const result = await service.runSearches(
      parsed.data.ids,
      auth.orgId,
      auth.userId
    );
    return NextResponse.json({ action: parsed.data.action, result });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error bulk updating saved searches:", error);
    return NextResponse.json(
      { error: "Failed to bulk update saved searches" },
      { status: 500 }
    );
  }
}
