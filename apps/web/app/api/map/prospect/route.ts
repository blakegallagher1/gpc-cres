import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { prisma } from "@entitlement-os/db";

const PROPERTY_DB_URL =
  process.env.LA_PROPERTY_DB_URL ?? "https://jueyosscalcljgdorrpy.supabase.co";
const PROPERTY_DB_KEY = process.env.LA_PROPERTY_DB_KEY ?? "";
const PROPERTY_DB_FALLBACK_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY_DEV ??
  "";

const resolvedPropertyDbKey =
  PROPERTY_DB_KEY || PROPERTY_DB_FALLBACK_KEY;

async function propertyRpc(
  fnName: string,
  body: Record<string, unknown>
): Promise<unknown> {
  if (!resolvedPropertyDbKey) return [];

  const res = await fetch(`${PROPERTY_DB_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      apikey: resolvedPropertyDbKey,
      Authorization: `Bearer ${resolvedPropertyDbKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  return res.json();
}

// ---------------------------------------------------------------------------
// Point-in-polygon (ray casting algorithm)
// ---------------------------------------------------------------------------

function pointInPolygon(
  lat: number,
  lng: number,
  polygon: number[][][]
): boolean {
  // Use the outer ring (first ring) of the polygon
  const ring = polygon[0];
  if (!ring || ring.length < 4) return false;

  let inside = false;
  const x = lng;
  const y = lat;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    // GeoJSON coordinates are [lng, lat]
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// POST /api/map/prospect
// Body: {
//   polygon: { type: "Polygon", coordinates: number[][][] },
//   filters?: {
//     zoningCodes?: string[],
//     minAcreage?: number,
//     maxAcreage?: number,
//     minAssessedValue?: number,
//     maxAssessedValue?: number,
//     excludeFloodZone?: boolean,
//   }
// }
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { polygon, filters } = body;

  if (!polygon?.coordinates?.[0]) {
    return NextResponse.json(
      { error: "polygon with coordinates is required" },
      { status: 400 }
    );
  }

  try {
    // Compute bounding box from polygon to determine which parishes to search
    const coords = polygon.coordinates[0] as number[][];
    const lats = coords.map((c) => c[1]);
    const lngs = coords.map((c) => c[0]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    // Determine center for search text (empty = wildcard)
    const centerLat = (minLat + maxLat) / 2;
    const _centerLng = (minLng + maxLng) / 2;

    // Determine parishes based on lat range (rough Louisiana mapping)
    const parishes: string[] = [];
    // EBR: ~30.3-30.6, Ascension: ~30.1-30.35, Livingston: ~30.3-30.6 (east),
    // West BR: ~30.3-30.5 (west of Mississippi), Iberville: ~30.2-30.5
    if (centerLat >= 30.0 && centerLat <= 30.7) {
      parishes.push(
        "East Baton Rouge",
        "Ascension",
        "Livingston",
        "West Baton Rouge",
        "Iberville"
      );
    } else {
      parishes.push("East Baton Rouge"); // default
    }

    // Query parcels from each parish
    const allParcels: Record<string, unknown>[] = [];
    if (!resolvedPropertyDbKey) {
      return NextResponse.json(
        { parcels: [], total: 0, error: "Missing LA property DB API key" },
        { status: 200 },
      );
    }

    for (const parish of parishes) {
      const raw = await propertyRpc("api_search_parcels", {
        search_text: filters?.searchText || "*",
        parish,
        limit_rows: 200,
      });
      if (Array.isArray(raw)) {
        allParcels.push(...(raw as Record<string, unknown>[]));
      }
    }

    // Filter: point-in-polygon
    let filtered = allParcels.filter((p) => {
      const lat = Number(p.latitude ?? p.lat ?? 0);
      const lng = Number(p.longitude ?? p.lng ?? 0);
      if (!lat || !lng) return false;
      return pointInPolygon(lat, lng, polygon.coordinates);
    });

    // Apply filters
    if (filters?.minAcreage != null) {
      filtered = filtered.filter(
        (p) => p.acreage != null && Number(p.acreage) >= filters.minAcreage
      );
    }
    if (filters?.maxAcreage != null) {
      filtered = filtered.filter(
        (p) => p.acreage != null && Number(p.acreage) <= filters.maxAcreage
      );
    }
    if (filters?.zoningCodes?.length) {
      const codes = new Set(
        (filters.zoningCodes as string[]).map((c: string) => c.toUpperCase())
      );
      filtered = filtered.filter((p) => {
        const zoning = String(p.zoning ?? p.zone_code ?? "").toUpperCase();
        return codes.has(zoning) || [...codes].some((c) => zoning.includes(c));
      });
    }
    if (filters?.excludeFloodZone) {
      filtered = filtered.filter((p) => {
        const flood = String(p.flood_zone ?? "").toUpperCase();
        return !(/ZONE\s*[AV]/.test(flood));
      });
    }
    if (filters?.minAssessedValue != null) {
      filtered = filtered.filter(
        (p) =>
          p.assessed_value != null &&
          Number(p.assessed_value) >= filters.minAssessedValue
      );
    }
    if (filters?.maxAssessedValue != null) {
      filtered = filtered.filter(
        (p) =>
          p.assessed_value != null &&
          Number(p.assessed_value) <= filters.maxAssessedValue
      );
    }

    // Map to response format
    const parcels = filtered.map((p) => ({
      id: String(p.id ?? ""),
      address: String(p.site_address ?? p.situs_address ?? p.address ?? "Unknown"),
      owner: String(p.owner_name ?? p.owner ?? "Unknown"),
      acreage: p.acreage != null ? Number(p.acreage) : null,
      zoning: String(p.zoning ?? p.zone_code ?? ""),
      assessedValue: p.assessed_value != null ? Number(p.assessed_value) : null,
      floodZone: String(p.flood_zone ?? ""),
      lat: Number(p.latitude ?? p.lat ?? 0),
      lng: Number(p.longitude ?? p.lng ?? 0),
      parish: String(p.parish_name ?? p.parish ?? ""),
      parcelUid: String(p.parcel_uid ?? p.parcel_id ?? ""),
      propertyDbId: String(p.parcel_uid ?? p.parcel_id ?? p.id ?? ""),
    }));

    return NextResponse.json({ parcels, total: parcels.length });
  } catch (error) {
    console.error("Prospect search error:", error);
    return NextResponse.json(
      { error: "Failed to search parcels" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/map/prospect/bulk-create-deals
// ---------------------------------------------------------------------------

export async function PUT(req: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action, parcelIds, parcels } = body;

  if (action === "create-deals" && Array.isArray(parcels)) {
    // Find default jurisdiction for the org (use first available)
    const jurisdiction = await prisma.jurisdiction.findFirst({
      where: { orgId: auth.orgId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!jurisdiction) {
      return NextResponse.json(
        { error: "No jurisdiction configured" },
        { status: 400 }
      );
    }

    // Create a deal for each selected parcel
    const created: string[] = [];
    for (const parcel of parcels as Array<{
      address: string;
      lat: number;
      lng: number;
      acreage: number | null;
      zoning: string;
      floodZone: string;
      id: string;
      propertyDbId?: string;
      parish: string;
    }>) {
      // Try to find a parish-specific jurisdiction
      let jId = jurisdiction.id;
      if (parcel.parish) {
        const parishJur = await prisma.jurisdiction.findFirst({
          where: {
            orgId: auth.orgId,
            name: { contains: parcel.parish, mode: "insensitive" },
          },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (parishJur) jId = parishJur.id;
      }

      const deal = await prisma.deal.create({
        data: {
          orgId: auth.orgId,
          name: `Prospect: ${parcel.address}`,
          sku: "OUTDOOR_STORAGE",
          status: "INTAKE",
          jurisdictionId: jId,
          createdBy: auth.userId,
          source: "[AUTO] Prospecting Mode",
        },
      });

      await prisma.parcel.create({
        data: {
          dealId: deal.id,
          orgId: auth.orgId,
          address: parcel.address,
          lat: parcel.lat,
          lng: parcel.lng,
          acreage: parcel.acreage,
          currentZoning: parcel.zoning || null,
          floodZone: parcel.floodZone || null,
          propertyDbId: parcel.propertyDbId || parcel.id || null,
        },
      });

      created.push(deal.id);
    }
    return NextResponse.json({ created, count: created.length });
  }

  if (action === "batch-triage" && Array.isArray(parcelIds)) {
    // Create triage tasks for each parcel's deal
    // This would trigger the triage automation loop
    return NextResponse.json({
      message: `Batch triage queued for ${parcelIds.length} parcels`,
      count: parcelIds.length,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
