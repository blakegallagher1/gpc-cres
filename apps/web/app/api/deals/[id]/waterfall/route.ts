import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

// GET /api/deals/[id]/waterfall — load saved waterfall structures
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
      select: { waterfallStructures: true },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const structures = (deal.waterfallStructures as Record<string, unknown>[] | null) ?? [];
    return NextResponse.json({ structures });
  } catch (error) {
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
    const auth = await resolveAuth();
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

    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    await prisma.deal.update({
      where: { id },
      data: { waterfallStructures: structures },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving waterfall structures:", error);
    return NextResponse.json(
      { error: "Failed to save waterfall structures" },
      { status: 500 }
    );
  }
}
