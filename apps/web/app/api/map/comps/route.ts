import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const PROPERTY_DB_URL = process.env.LA_PROPERTY_DB_URL || "";
const PROPERTY_DB_KEY = process.env.LA_PROPERTY_DB_KEY || "";

async function propertyRpc(
  fnName: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(`${PROPERTY_DB_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      apikey: PROPERTY_DB_KEY,
      Authorization: `Bearer ${PROPERTY_DB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  return res.json();
}

/**
 * GET /api/map/comps?address=...&lat=...&lng=...&radiusMiles=3
 *
 * Searches the Property DB for comparable sales near a location or by address.
 * Returns parcels with sale price, date, acreage, and coordinates.
 */
export async function GET(req: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const address = searchParams.get("address");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!address && (!lat || !lng)) {
    return NextResponse.json(
      { error: "Provide address or lat/lng" },
      { status: 400 }
    );
  }

  try {
    // Build search text from address or reverse-geocode location
    const searchText = address
      ? address.replace(/[''`,.#]/g, "").replace(/\s+/g, " ").trim()
      : "";

    let result: Record<string, unknown>[];

    if (searchText) {
      // Search by address text
      const raw = await propertyRpc("api_search_parcels", {
        search_text: searchText,
        parish: null,
        limit_rows: 50,
      });
      result = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
    } else {
      // Search by coordinates — use the search with a generic term and filter by distance
      // The property DB doesn't have a radius search, so we search with empty text
      // and rely on coordinates. For now, just return parcels near the point.
      const raw = await propertyRpc("api_search_parcels", {
        search_text: "",
        parish: null,
        limit_rows: 100,
      });
      result = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
    }

    // Map results to comp sale format
    const comps = result
      .filter((p) => {
        // Must have coordinates
        const pLat = p.latitude ?? p.lat;
        const pLng = p.longitude ?? p.lng;
        return pLat != null && pLng != null;
      })
      .map((p) => ({
        id: String(p.id ?? ""),
        address: String(p.site_address ?? p.address ?? "Unknown"),
        lat: Number(p.latitude ?? p.lat),
        lng: Number(p.longitude ?? p.lng),
        salePrice: p.sale_price ? Number(p.sale_price) : null,
        saleDate: p.sale_date ? String(p.sale_date) : null,
        acreage: p.acreage ? Number(p.acreage) : null,
        pricePerAcre:
          p.acreage && p.sale_price
            ? Math.round(Number(p.sale_price) / Number(p.acreage))
            : null,
        useType: p.use_code ?? p.land_use ?? null,
      }));

    // If lat/lng provided, filter by distance
    if (lat && lng) {
      const centerLat = Number(lat);
      const centerLng = Number(lng);
      const radiusMiles = Number(searchParams.get("radiusMiles") || "3");
      const radiusKm = radiusMiles * 1.60934;

      const filtered = comps.filter((c) => {
        const dLat = ((c.lat - centerLat) * Math.PI) / 180;
        const dLng = ((c.lng - centerLng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((centerLat * Math.PI) / 180) *
            Math.cos((c.lat * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return distKm <= radiusKm;
      });

      return NextResponse.json({ comps: filtered });
    }

    return NextResponse.json({ comps });
  } catch (error) {
    console.error("Comps search error:", error);
    return NextResponse.json(
      { error: "Failed to search comparables" },
      { status: 500 }
    );
  }
}
