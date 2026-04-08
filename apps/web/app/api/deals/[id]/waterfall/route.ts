import { NextRequest, NextResponse } from "next/server";
import {
  DealAccessError,
  getDealWaterfallStructures,
  saveDealWaterfallStructures,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

// GET /api/deals/[id]/waterfall — load saved waterfall structures
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
    const structures = await getDealWaterfallStructures({
      dealId: id,
      orgId: auth.orgId,
    });
    return NextResponse.json({ structures });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json({ error: "Deal not found" }, { status: error.status });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.waterfall", method: "GET" },
    });
    console.error("Error loading waterfall structures:", error);
    return NextResponse.json(
      { error: "Failed to load waterfall structures" },
      { status: 500 }
    );
  }
}

// PUT /api/deals/[id]/waterfall — save waterfall structures array
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { structures } = body;

    if (!Array.isArray(structures)) {
      return NextResponse.json(
        { error: "Invalid structures payload" },
        { status: 400 }
      );
    }

    await saveDealWaterfallStructures({
      dealId: id,
      orgId: auth.orgId,
      entries: structures,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json({ error: "Deal not found" }, { status: error.status });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.waterfall", method: "PUT" },
    });
    console.error("Error saving waterfall structures:", error);
    return NextResponse.json(
      { error: "Failed to save waterfall structures" },
      { status: 500 }
    );
  }
}
