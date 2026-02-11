import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

// GET /api/deals/[id]/debt-comparison — load saved loan structures
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
      select: { debtComparisons: true },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const loans = (deal.debtComparisons as Record<string, unknown>[] | null) ?? [];
    return NextResponse.json({ loans });
  } catch (error) {
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
    const auth = await resolveAuth();
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

    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    await prisma.deal.update({
      where: { id },
      data: { debtComparisons: loans },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving debt comparisons:", error);
    return NextResponse.json(
      { error: "Failed to save debt comparisons" },
      { status: 500 }
    );
  }
}
