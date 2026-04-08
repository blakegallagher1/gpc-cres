import { NextRequest, NextResponse } from "next/server";
import {
  applyDealParcelEnrichment,
  findDealParcelEnrichmentMatches,
  ParcelNotFoundError,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/deals/[id]/parcels/[parcelId]/enrich
 *
 * Searches the Louisiana Property Database for matching parcels,
 * then runs a full site screening (flood, soils, wetlands, EPA, traffic, LDEQ).
 *
 * Two modes:
 *   - No body or { "action": "search" }  -> returns property DB matches (step 1)
 *   - { "action": "apply", "propertyDbId": "uuid" } -> applies enrichment to parcel (step 2)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; parcelId: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: dealId, parcelId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const action = (body as { action?: string }).action ?? "search";

    // ---------------------------------------------------------------
    // STEP 1: Search the property DB for matching parcels
    // ---------------------------------------------------------------
    if (action === "search") {
      const result = await findDealParcelEnrichmentMatches({
        dealId,
        orgId: auth.orgId,
        parcelId,
      });

      return NextResponse.json(result);
    }

    // ---------------------------------------------------------------
    // STEP 2: Apply enrichment from a selected property DB parcel
    // ---------------------------------------------------------------
    if (action === "apply") {
      const propertyDbId = (body as { propertyDbId?: string }).propertyDbId;
      if (!propertyDbId) {
        return NextResponse.json(
          { error: "propertyDbId is required" },
          { status: 400 },
        );
      }

      const result = await applyDealParcelEnrichment({
        dealId,
        orgId: auth.orgId,
        parcelId,
        propertyDbId,
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    if (error instanceof ParcelNotFoundError) {
      return NextResponse.json({ error: "Parcel not found" }, { status: 404 });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.parcels.enrich", method: "POST" },
    });
    console.error("Enrich error:", error);
    return NextResponse.json(
      { error: "Enrichment failed" },
      { status: 500 },
    );
  }
}
