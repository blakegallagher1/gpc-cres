import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  getParcelEnrichmentPayload,
  searchPropertyDbMatches,
} from "@/lib/automation/enrichment";

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
    // Load parcel and verify org ownership via the deal
    const parcel = await prisma.parcel.findFirst({
      where: { id: parcelId, dealId, deal: { orgId: auth.orgId } },
      include: { deal: { include: { jurisdiction: { select: { name: true } } } } },
    });

    if (!parcel) {
      return NextResponse.json({ error: "Parcel not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const action = (body as { action?: string }).action ?? "search";

    // ---------------------------------------------------------------
    // STEP 1: Search the property DB for matching parcels
    // ---------------------------------------------------------------
    if (action === "search") {
      const matches = await searchPropertyDbMatches(
        parcel.address,
        parcel.deal?.jurisdiction?.name ?? null,
      );

      return NextResponse.json({ matches, address: parcel.address });
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

      const { screening, updateData } = await getParcelEnrichmentPayload(propertyDbId);

      // Apply update
      const updated = await prisma.parcel.update({
        where: { id: parcelId },
        data: updateData,
      });

      return NextResponse.json({ parcel: updated, screening });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Enrich error:", error);
    return NextResponse.json(
      { error: "Enrichment failed" },
      { status: 500 },
    );
  }
}
