import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { propertyDbRpc } from "@entitlement-os/openai";
import { resolveAuth } from "@/lib/auth/resolveAuth";

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
  { params }: { params: Promise<{ id: string; parcelId: string }> }
) {
  const auth = await resolveAuth();
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
      // Normalize address: strip punctuation, collapse whitespace
      const normalized = parcel.address
        .replace(/[''`,.#]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      // Try progressively broader searches
      let matches: unknown[] = [];
      const attempts = [
        normalized,
        // Drop zip code if present
        normalized.replace(/\s+\d{5}(-\d{4})?$/, ""),
        // Just street number + first word of street name
        normalized.split(" ").slice(0, 3).join(" "),
      ];

      for (const searchText of attempts) {
        const result = await propertyDbRpc("api_search_parcels", {
          search_text: searchText,
          parish: parcel.deal?.jurisdiction?.name ?? null,
          limit_rows: 10,
        });
        if (Array.isArray(result) && result.length > 0) {
          matches = result;
          break;
        }
      }

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
          { status: 400 }
        );
      }

      // Get parcel details
      const details = await propertyDbRpc("api_get_parcel", {
        parcel_id: propertyDbId,
      });

      // Run full screening
      const screening = await propertyDbRpc("api_screen_full", {
        parcel_id: propertyDbId,
      });

      // Extract data from details
      const d = (Array.isArray(details) ? details[0] : details) as Record<
        string,
        unknown
      > | null;
      const s = (Array.isArray(screening) ? screening[0] : screening) as Record<
        string,
        unknown
      > | null;

      // Build update payload
      const updateData: Record<string, unknown> = {
        propertyDbId,
      };

      if (d) {
        if (d.parcel_uid) updateData.apn = String(d.parcel_uid);
        if (d.lat) updateData.lat = Number(d.lat);
        if (d.lng) updateData.lng = Number(d.lng);
        if (d.acreage) updateData.acreage = Number(d.acreage);
      }

      if (s) {
        // Flood
        if (s.flood) {
          const flood = s.flood as Record<string, unknown>;
          const zones = flood.zones as Array<Record<string, unknown>> | undefined;
          if (zones && zones.length > 0) {
            updateData.floodZone = zones
              .map((z) => `${z.zone_code} (${Number(z.overlap_pct ?? 0).toFixed(0)}%)`)
              .join(", ");
          } else {
            updateData.floodZone = "No flood zone data";
          }
        }

        // Soils
        if (s.soils) {
          const soils = s.soils as Record<string, unknown>;
          const types = soils.soil_types as Array<Record<string, unknown>> | undefined;
          if (types && types.length > 0) {
            updateData.soilsNotes = types
              .map((t) => `${t.soil_name}: ${t.drainage_class ?? "unknown drainage"}, hydric=${t.hydric_rating ?? "?"}`)
              .join("; ");
          }
        }

        // Wetlands
        if (s.wetlands) {
          const wetlands = s.wetlands as Record<string, unknown>;
          const areas = wetlands.wetland_areas as Array<Record<string, unknown>> | undefined;
          if (areas && areas.length > 0) {
            updateData.wetlandsNotes = areas
              .map((w) => `${w.wetland_type} (${Number(w.overlap_pct ?? 0).toFixed(0)}%)`)
              .join("; ");
          } else {
            updateData.wetlandsNotes = "No wetlands detected";
          }
        }

        // EPA + LDEQ combined as env notes
        const envParts: string[] = [];
        if (s.epa) {
          const epa = s.epa as Record<string, unknown>;
          const sites = epa.sites as Array<Record<string, unknown>> | undefined;
          if (sites && sites.length > 0) {
            envParts.push(
              `EPA: ${sites.length} site(s) nearby — ` +
                sites
                  .slice(0, 3)
                  .map((e) => `${e.facility_name} (${Number(e.distance_miles ?? 0).toFixed(1)}mi)`)
                  .join(", ")
            );
          } else {
            envParts.push("EPA: No regulated sites nearby");
          }
        }
        if (s.ldeq) {
          const ldeq = s.ldeq as Record<string, unknown>;
          const permits = ldeq.permits as Array<Record<string, unknown>> | undefined;
          if (permits && permits.length > 0) {
            envParts.push(
              `LDEQ: ${permits.length} permit(s) nearby — ` +
                permits
                  .slice(0, 3)
                  .map((p) => `${p.facility_name} (${Number(p.distance_miles ?? 0).toFixed(1)}mi)`)
                  .join(", ")
            );
          } else {
            envParts.push("LDEQ: No permitted facilities nearby");
          }
        }
        if (envParts.length > 0) {
          updateData.envNotes = envParts.join("\n");
        }

        // Traffic
        if (s.traffic) {
          const traffic = s.traffic as Record<string, unknown>;
          const roads = traffic.roads as Array<Record<string, unknown>> | undefined;
          if (roads && roads.length > 0) {
            updateData.trafficNotes = roads
              .slice(0, 3)
              .map(
                (r) =>
                  `${r.road_name}: ${Number(r.aadt ?? 0).toLocaleString()} AADT, ${Number(r.truck_pct ?? 0).toFixed(0)}% trucks, ${Number(r.distance_miles ?? 0).toFixed(1)}mi`
              )
              .join("; ");
          }
        }
      }

      // Apply update
      const updated = await prisma.parcel.update({
        where: { id: parcelId },
        data: updateData,
      });

      return NextResponse.json({ parcel: updated, screening: s });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Enrich error:", error);
    return NextResponse.json(
      { error: "Enrichment failed" },
      { status: 500 }
    );
  }
}
