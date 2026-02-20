import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { resolveAuth } from "@/lib/auth/resolveAuth";

function isMissingOrPlaceholder(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "undefined" ||
    normalized === "null" ||
    normalized === "placeholder" ||
    normalized.includes("placeholder")
  );
}

function getPropertyDbConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  if (isMissingOrPlaceholder(url) || isMissingOrPlaceholder(key)) {
    return null;
  }

  return { url: url.trim(), key: key.trim() };
}

async function propertyRpc(
  fnName: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const config = getPropertyDbConfig();
  if (!config) return [];

  const { url, key } = config;
  const res = await fetch(`${url}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  try {
    return await res.json();
  } catch {
    return [];
  }
}

const QuerySchema = z
  .object({
    address: z.string().trim().min(1).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusMiles: z.coerce.number().min(0.1).max(25).default(3),
  })
  .refine(
    (value) =>
      Boolean(value.address) ||
      (typeof value.lat === "number" && typeof value.lng === "number"),
    {
      message: "Provide address or lat/lng",
      path: ["address"],
    }
  );

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
  if (!auth.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let input: z.infer<typeof QuerySchema>;
  try {
    input = QuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries())
    );
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.flatten().fieldErrors },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const address = input.address;
  const lat = input.lat;
  const lng = input.lng;

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
        const pLat = asNumber(p.latitude ?? p.lat);
        const pLng = asNumber(p.longitude ?? p.lng);
        return pLat != null && pLng != null;
      })
      .map((p) => ({
        id: String(p.id ?? ""),
        address: String(p.site_address ?? p.address ?? "Unknown"),
        lat: asNumber(p.latitude ?? p.lat) ?? 0,
        lng: asNumber(p.longitude ?? p.lng) ?? 0,
        salePrice: asNumber(p.sale_price),
        saleDate: p.sale_date ? String(p.sale_date) : null,
        acreage: asNumber(p.acreage),
        pricePerAcre: (() => {
          const acreage = asNumber(p.acreage);
          const salePrice = asNumber(p.sale_price);
          if (!acreage || !salePrice || acreage <= 0) return null;
          return Math.round(salePrice / acreage);
        })(),
        pricePerSf: (() => {
          const acreage = asNumber(p.acreage);
          const salePrice = asNumber(p.sale_price);
          if (!acreage || !salePrice || acreage <= 0) return null;
          return Number((salePrice / (acreage * 43560)).toFixed(2));
        })(),
        useType: p.use_code ?? p.land_use ?? null,
      }));

    // If lat/lng provided, filter by distance
    if (typeof lat === "number" && typeof lng === "number") {
      const centerLat = lat;
      const centerLng = lng;
      const radiusMiles = input.radiusMiles;
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
    console.error("[map-comps-route]", error);
    return NextResponse.json(
      { error: "Failed to search comparables" },
      { status: 500 }
    );
  }
}
