import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { SavedSearchService } from "@/lib/services/saved-search.service";
import { AppError } from "@/lib/errors";

const service = new SavedSearchService();

// GET /api/saved-searches/[id] — get a saved search with its matches
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const search = await service.getById(id, auth.orgId, auth.userId);
    return NextResponse.json({ search });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error fetching saved search:", error);
    return NextResponse.json(
      { error: "Failed to fetch saved search" },
      { status: 500 }
    );
  }
}

// PATCH /api/saved-searches/[id] — update a saved search
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

    const search = await service.update(id, auth.orgId, auth.userId, {
      name: body.name,
      criteria: body.criteria,
      alertEnabled: body.alertEnabled,
      alertFrequency: body.alertFrequency,
    });

    return NextResponse.json({ search });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error updating saved search:", error);
    return NextResponse.json(
      { error: "Failed to update saved search" },
      { status: 500 }
    );
  }
}

// DELETE /api/saved-searches/[id] — delete a saved search
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await service.delete(id, auth.orgId, auth.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error deleting saved search:", error);
    return NextResponse.json(
      { error: "Failed to delete saved search" },
      { status: 500 }
    );
  }
}
