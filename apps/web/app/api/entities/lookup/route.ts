import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { prisma } from "@entitlement-os/db";
import { normalizeAddress } from "@/lib/services/entityResolution";
import { getTruthView } from "@/lib/services/truthViewService";

/**
 * GET /api/entities/lookup
 *
 * Read-only entity resolution by address or parcel_id.
 * Does NOT create entities — never writes to the DB.
 * Returns entity_id + truth view if found, or { found: false } if unknown.
 *
 * Query params:
 *   ?address=123+Main+St%2C+Baton+Rouge%2C+LA+70801
 *   ?parcel_id=12345
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");
    const parcelId = searchParams.get("parcel_id");

    if (!address && !parcelId) {
      return NextResponse.json(
        { error: "At least one of address or parcel_id is required" },
        { status: 400 },
      );
    }

    // Try parcel_id first (deterministic)
    if (parcelId) {
      const entity = await prisma.internalEntity.findFirst({
        where: { orgId: auth.orgId, parcelId },
        select: { id: true, canonicalAddress: true, parcelId: true },
      });
      if (entity) {
        const truth = await getTruthView(entity.id, auth.orgId);
        return NextResponse.json({
          found: true,
          entityId: entity.id,
          canonicalAddress: entity.canonicalAddress,
          parcelId: entity.parcelId,
          truth,
        });
      }
    }

    // Try normalized address
    if (address) {
      const canonical = normalizeAddress(address);
      const entity = await prisma.internalEntity.findFirst({
        where: { orgId: auth.orgId, canonicalAddress: canonical },
        select: { id: true, canonicalAddress: true, parcelId: true },
      });
      if (entity) {
        const truth = await getTruthView(entity.id, auth.orgId);
        return NextResponse.json({
          found: true,
          entityId: entity.id,
          canonicalAddress: entity.canonicalAddress,
          parcelId: entity.parcelId,
          truth,
        });
      }
    }

    return NextResponse.json({ found: false });
  } catch (error) {
    console.error("Error in entity lookup:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to look up entity", detail: message },
      { status: 500 },
    );
  }
}
