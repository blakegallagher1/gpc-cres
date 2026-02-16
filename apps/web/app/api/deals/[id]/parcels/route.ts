import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { dispatchEvent } from "@/lib/automation/events";
import "@/lib/automation/handlers";
import { captureAutomationDispatchError } from "@/lib/automation/sentry";

// GET /api/deals/[id]/parcels
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

    // Verify deal belongs to user's org
    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

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
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    if (!body.address) {
      return NextResponse.json(
        { error: "address is required" },
        { status: 400 }
      );
    }

    // Verify deal belongs to user's org
    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const parcel = await prisma.parcel.create({
      data: {
        orgId: auth.orgId,
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

    // Fire-and-forget: dispatch parcel.created for auto-enrichment (#2)
    dispatchEvent({
      type: "parcel.created",
      dealId: id,
      parcelId: parcel.id,
      orgId: auth.orgId,
    }).catch((error) => {
      captureAutomationDispatchError(error, {
        handler: "api.deals.parcels.create",
        eventType: "parcel.created",
        dealId: id,
        orgId: auth.orgId,
      });
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
