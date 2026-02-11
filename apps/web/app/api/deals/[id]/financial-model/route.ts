import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

// GET /api/deals/[id]/financial-model — load saved assumptions
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
      select: {
        id: true,
        name: true,
        sku: true,
        status: true,
        financialModelAssumptions: true,
        parcels: {
          select: { acreage: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    return NextResponse.json({
      assumptions: deal.financialModelAssumptions ?? null,
      deal: {
        id: deal.id,
        name: deal.name,
        sku: deal.sku,
        status: deal.status,
        totalAcreage: deal.parcels.reduce(
          (sum, p) => sum + (p.acreage ? parseFloat(p.acreage.toString()) : 0),
          0
        ),
      },
    });
  } catch (error) {
    console.error("Error loading financial model:", error);
    return NextResponse.json(
      { error: "Failed to load financial model" },
      { status: 500 }
    );
  }
}

// PUT /api/deals/[id]/financial-model — save assumptions
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
    const { assumptions } = body;

    if (!assumptions || typeof assumptions !== "object") {
      return NextResponse.json(
        { error: "Invalid assumptions payload" },
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
      data: { financialModelAssumptions: assumptions },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving financial model:", error);
    return NextResponse.json(
      { error: "Failed to save financial model" },
      { status: 500 }
    );
  }
}
