import { NextRequest, NextResponse } from "next/server";
import {
  DealAccessError,
  getDealFinancialModelScenarios,
  saveDealFinancialModelScenarios,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

export interface SavedScenario {
  id: string;
  name: string;
  assumptions: Record<string, unknown>;
  createdAt: string;
}

// GET /api/deals/[id]/scenarios — load saved scenarios
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
    const scenarios = await getDealFinancialModelScenarios({
      dealId: id,
      orgId: auth.orgId,
    });
    return NextResponse.json({ scenarios });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json({ error: "Deal not found" }, { status: error.status });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.scenarios", method: "GET" },
    });
    console.error("Error loading scenarios:", error);
    return NextResponse.json(
      { error: "Failed to load scenarios" },
      { status: 500 }
    );
  }
}

// PUT /api/deals/[id]/scenarios — save scenarios array
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
    const { scenarios } = body;

    if (!Array.isArray(scenarios)) {
      return NextResponse.json(
        { error: "Invalid scenarios payload" },
        { status: 400 }
      );
    }

    await saveDealFinancialModelScenarios({
      dealId: id,
      orgId: auth.orgId,
      entries: scenarios,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json({ error: "Deal not found" }, { status: error.status });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.scenarios", method: "PUT" },
    });
    console.error("Error saving scenarios:", error);
    return NextResponse.json(
      { error: "Failed to save scenarios" },
      { status: 500 }
    );
  }
}
