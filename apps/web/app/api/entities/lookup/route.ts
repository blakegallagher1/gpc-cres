import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { lookupEntityByAddressOrParcel } from "@gpc/server/services/entity-lookup.service";
import * as Sentry from "@sentry/nextjs";

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

    return NextResponse.json(
      await lookupEntityByAddressOrParcel({
        orgId: auth.orgId,
        address,
        parcelId,
      }),
    );
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.entities.lookup", method: "GET" },
    });
    console.error("Error in entity lookup:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to look up entity", detail: message },
      { status: 500 },
    );
  }
}
