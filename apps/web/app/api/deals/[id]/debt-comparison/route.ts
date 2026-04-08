import { NextRequest, NextResponse } from "next/server";
import {
  DealAccessError,
  getDealDebtComparisons,
  saveDealDebtComparisons,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

// GET /api/deals/[id]/debt-comparison — load saved loan structures
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
    const loans = await getDealDebtComparisons({ dealId: id, orgId: auth.orgId });
    return NextResponse.json({ loans });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json({ error: "Deal not found" }, { status: error.status });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.debt-comparison", method: "GET" },
    });
    console.error("Error loading debt comparisons:", error);
    return NextResponse.json(
      { error: "Failed to load debt comparisons" },
      { status: 500 }
    );
  }
}

// PUT /api/deals/[id]/debt-comparison — save loan structures array
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
    const { loans } = body;

    if (!Array.isArray(loans)) {
      return NextResponse.json(
        { error: "Invalid loans payload" },
        { status: 400 }
      );
    }

    await saveDealDebtComparisons({
      dealId: id,
      orgId: auth.orgId,
      entries: loans,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json({ error: "Deal not found" }, { status: error.status });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.debt-comparison", method: "PUT" },
    });
    console.error("Error saving debt comparisons:", error);
    return NextResponse.json(
      { error: "Failed to save debt comparisons" },
      { status: 500 }
    );
  }
}
