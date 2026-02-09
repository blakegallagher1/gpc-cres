import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

// GET /api/parcels - list parcels across all deals
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasCoords = request.nextUrl.searchParams.get("hasCoords") === "true";

    const where: Record<string, unknown> = { orgId: auth.orgId };
    if (hasCoords) {
      where.lat = { not: null };
      where.lng = { not: null };
    }

    const parcels = await prisma.parcel.findMany({
      where,
      include: {
        deal: {
          select: { id: true, name: true, sku: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return NextResponse.json({ parcels });
  } catch (error) {
    console.error("Error fetching parcels:", error);
    return NextResponse.json(
      { error: "Failed to fetch parcels" },
      { status: 500 }
    );
  }
}
