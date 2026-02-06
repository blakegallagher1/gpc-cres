import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";

// GET /api/deals/[id]/parcels
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const parcels = await prisma.parcel.findMany({
      where: { dealId: id },
      orderBy: { createdAt: "asc" },
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

// POST /api/deals/[id]/parcels
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.address) {
      return NextResponse.json(
        { error: "address is required" },
        { status: 400 }
      );
    }

    // Get orgId from the deal
    const deal = await prisma.deal.findUnique({
      where: { id },
      select: { orgId: true },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const parcel = await prisma.parcel.create({
      data: {
        orgId: deal.orgId,
        dealId: id,
        address: body.address,
        apn: body.apn ?? null,
        acreage: body.acreage ? parseFloat(body.acreage) : null,
        currentZoning: body.currentZoning ?? null,
        futureLandUse: body.futureLandUse ?? null,
        utilitiesNotes: body.utilitiesNotes ?? null,
        lat: body.lat ? parseFloat(body.lat) : null,
        lng: body.lng ? parseFloat(body.lng) : null,
      },
    });

    return NextResponse.json({ parcel }, { status: 201 });
  } catch (error) {
    console.error("Error creating parcel:", error);
    return NextResponse.json(
      { error: "Failed to create parcel" },
      { status: 500 }
    );
  }
}
