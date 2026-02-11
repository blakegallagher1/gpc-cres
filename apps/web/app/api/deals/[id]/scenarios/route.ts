import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export interface SavedScenario {
  id: string;
  name: string;
  assumptions: Record<string, unknown>;
  createdAt: string;
}

// GET /api/deals/[id]/scenarios — load saved scenarios
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

    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { financialModelScenarios: true },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const scenarios = (deal.financialModelScenarios as SavedScenario[] | null) ?? [];
    return NextResponse.json({ scenarios });
  } catch (error) {
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
    const auth = await resolveAuth();
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

    // Verify deal ownership
    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    await prisma.deal.update({
      where: { id },
      data: { financialModelScenarios: scenarios },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving scenarios:", error);
    return NextResponse.json(
      { error: "Failed to save scenarios" },
      { status: 500 }
    );
  }
}
