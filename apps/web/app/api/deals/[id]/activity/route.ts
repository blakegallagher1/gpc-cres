import { NextRequest, NextResponse } from "next/server";
import { DealNotFoundError, getDealActivity } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

// GET /api/deals/[id]/activity
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const items = await getDealActivity({ dealId: id, orgId: auth.orgId });

    return NextResponse.json({ activity: items });
  } catch (error) {
    if (error instanceof DealNotFoundError) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.activity", method: "GET" },
    });
    console.error("Error fetching activity:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity" },
      { status: 500 }
    );
  }
}
