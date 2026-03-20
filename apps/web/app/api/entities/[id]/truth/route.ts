import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getTruthView } from "@/lib/services/truthViewService";
import * as Sentry from "@sentry/nextjs";

// GET /api/entities/[id]/truth — Get the current truth view for an entity
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const truth = await getTruthView(id, auth.orgId);

    return NextResponse.json(truth);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.entities.truth", method: "GET" },
    });
    console.error("Error fetching truth view:", error);
    return NextResponse.json(
      { error: "Failed to fetch truth view" },
      { status: 500 },
    );
  }
}
