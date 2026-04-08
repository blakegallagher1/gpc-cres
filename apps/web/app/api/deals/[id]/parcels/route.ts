import { NextRequest, NextResponse } from "next/server";
import {
  createDealParcel,
  DealAccessError,
  listDealParcels,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { dispatchEvent } from "@/lib/automation/events";
import { captureAutomationDispatchError } from "@/lib/automation/sentry";
import "@/lib/automation/handlers";
import * as Sentry from "@sentry/nextjs";

// GET /api/deals/[id]/parcels
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
    const parcels = await listDealParcels({ dealId: id, orgId: auth.orgId });

    return NextResponse.json({ parcels });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json({ error: "Deal not found" }, { status: error.status });
    }
    console.error("Error fetching parcels:", error);
    Sentry.captureException(error, {
      tags: { route: "/api/deals/[id]/parcels", method: "GET" },
      fingerprint: ["smoke-test", Date.now().toString()],
      level: "error",
    });
    await Sentry.flush(5000);
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
    const auth = await resolveAuth(request);
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

    const parcel = await createDealParcel({
      dealId: id,
      orgId: auth.orgId,
      input: {
        address: body.address,
        apn: body.apn ?? null,
        acreage: body.acreage ?? null,
        currentZoning: body.currentZoning ?? null,
        futureLandUse: body.futureLandUse ?? null,
        utilitiesNotes: body.utilitiesNotes ?? null,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
      },
    });

    // Intentional route-level runtime seam: asynchronous enrichment dispatch stays in apps/web.
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
    if (error instanceof DealAccessError) {
      return NextResponse.json({ error: "Deal not found" }, { status: error.status });
    }
    console.error("Error creating parcel:", error);
    Sentry.captureException(error, {
      tags: { route: "/api/deals/[id]/parcels", method: "POST" },
      fingerprint: ["smoke-test", Date.now().toString()],
      level: "error",
    });
    await Sentry.flush(5000);
    return NextResponse.json(
      { error: "Failed to create parcel" },
      { status: 500 }
    );
  }
}
