import { tool } from "@openai/agents";
import { z } from "zod";
import { runWithConcurrency } from "./concurrency.js";

/**
 * Property Database — Gateway API tools.
 *
 * Calls the FastAPI gateway at api.gallagherpropco.com for parcel lookup,
 * bbox search, and environmental/site screening.
 *
 * Env vars:
 *   LOCAL_API_URL — Gateway base URL (e.g. https://api.gallagherpropco.com)
 *   LOCAL_API_KEY — Gateway bearer token
 */

function getGatewayUrl(): string {
  const url = process.env.LOCAL_API_URL?.trim();
  if (!url) {
    throw new Error("[propertyDbTools] Missing required LOCAL_API_URL.");
  }
  return url;
}

function getGatewayKey(): string {
  const key = process.env.LOCAL_API_KEY?.trim();
  if (!key) {
    throw new Error("[propertyDbTools] Missing required LOCAL_API_KEY.");
  }
  return key;
}

function getCloudflareAccessHeadersFromEnv(): Record<string, string> {
  const clientId = process.env.CF_ACCESS_CLIENT_ID?.trim();
  const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return {};
  }
  return {
    "CF-Access-Client-Id": clientId,
    "CF-Access-Client-Secret": clientSecret,
  };
}

function getAgentsUrl(): string {
  if (process.env.AGENTS_URL) return process.env.AGENTS_URL.trim();
  const wsUrl = process.env.NEXT_PUBLIC_AGENT_WS_URL?.trim();
  if (wsUrl) return wsUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
  return "https://agents.gallagherpropco.com";
}

const MAX_RETRIES = 3;

function parseRetryMs(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric * 1000;
  }

  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) {
    const delta = parsed - Date.now();
    return delta > 0 ? delta : null;
  }

  return null;
}

function delayMs(valueMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, valueMs));
}

function readGatewayErrorText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const parts = [
    typeof record.error === "string" ? record.error : "",
    typeof record.detail === "string" ? record.detail : "",
    typeof record.message === "string" ? record.message : "",
  ].filter((value) => value.length > 0);
  return parts.join(" ").trim();
}

async function maybeRecoverZoningCountQuery(
  sql: string,
  payload: unknown,
): Promise<unknown | null> {
  const loweredSql = sql.toLowerCase();
  if (!loweredSql.includes("from ebr_parcels")) return null;
  if (!loweredSql.includes("count(")) return null;
  if (!loweredSql.includes("zoning_type")) return null;

  const errorText = readGatewayErrorText(payload).toLowerCase();
  if (!errorText.includes("zoning_type")) return null;
  if (!errorText.includes("does not exist")) return null;

  const zoningMatch = sql.match(/=\s*'([^']+)'/i);
  const zoning = zoningMatch?.[1]?.trim();
  if (!zoning) return null;

  const fallback = await gatewayPost("/tools/parcel.search", {
    zoning,
    limit: 1,
  });
  const fallbackData = fallback as Record<string, unknown>;
  if (typeof fallbackData?.count !== "number") return null;

  return {
    rowCount: 1,
    rows: [
      {
        zoning_type: zoning.toUpperCase(),
        cnt: fallbackData.count,
      },
    ],
    fallback: "parcel_search_count",
  };
}

/** Call a gateway POST endpoint and return the JSON body. */
export async function gatewayPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const PROPERTY_DB_URL = getGatewayUrl();
  const PROPERTY_DB_KEY = getGatewayKey();
  let lastError: string | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${PROPERTY_DB_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PROPERTY_DB_KEY}`,
          apikey: PROPERTY_DB_KEY,
          "Content-Type": "application/json",
          ...getCloudflareAccessHeadersFromEnv(),
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        return res.json();
      }

      const text = await res.text();
      lastError = `Gateway error (${res.status}): ${text}`;

      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = parseRetryMs(res.headers.get("retry-after"));
        const backoff = Math.min(2_000 * Math.pow(2, attempt), 10_000);
        await delayMs(retryAfter ?? backoff);
        continue;
      }

      return { error: lastError };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = `Gateway request failed: ${message}`;

      if (attempt < MAX_RETRIES) {
        const backoff = Math.min(2_000 * Math.pow(2, attempt), 10_000);
        await delayMs(backoff);
        continue;
      }

      return { error: lastError };
    }
  }

  return { error: lastError ?? "Gateway request failed." };
}

/**
 * Backward-compatible RPC wrapper that maps old Supabase function names
 * to gateway endpoints. Used by enrichment, parcel-geometry route, etc.
 */
export async function rpc(fnName: string, body: Record<string, unknown>): Promise<unknown> {
  switch (fnName) {
    case "api_get_parcel":
      return gatewayPost("/tools/parcel.lookup", body);
    case "api_search_parcels": {
      const searchText = (body.search_text ?? body.p_search_text ?? "") as string;
      const parish = (body.parish ?? body.p_parish ?? "") as string;
      if (!searchText) return { error: "No search text provided for api_search_parcels." };
      const normalizedSearchText = searchText.replace(/[''`]/g, "").trim();
      const geocodeQuery = parish
        ? `${normalizedSearchText}, ${parish} Parish, Louisiana`
        : `${normalizedSearchText}, Louisiana`;
      const geo = await geocodeAddress(geocodeQuery);
      if (!geo) return {
        error: "Could not geocode address. Try the query_property_db tool with structured filters (zip, zoning, owner name) instead.",
        suggestion: "Use query_property_db tool with structured filters",
      };
      return gatewayPost("/tools/parcel.bbox", {
        min_lat: geo.lat - 0.005,
        max_lat: geo.lat + 0.005,
        min_lng: geo.lng - 0.005,
        max_lng: geo.lng + 0.005,
        limit: (body.limit_rows ?? body.p_limit_rows ?? 5) as number,
      });
    }
    case "api_screen_zoning": {
      const pid = String(body.parcel_id ?? body.p_parcel_id).replace(/'/g, "''");
      return gatewayPost("/tools/parcels.sql", {
        sql: `SELECT p_parcel_id, zoning_type, existing_land_use, future_land_use FROM ebr_parcels WHERE p_parcel_id = '${pid}' LIMIT 1`,
      });
    }
    case "api_screen_flood":
      return gatewayPost("/tools/screen.flood", { parcel_id: body.parcel_id ?? body.p_parcel_id });
    case "api_screen_soils":
      return gatewayPost("/tools/screen.soils", { parcel_id: body.parcel_id ?? body.p_parcel_id });
    case "api_screen_wetlands":
      return gatewayPost("/tools/screen.wetlands", { parcel_id: body.parcel_id ?? body.p_parcel_id });
    case "api_screen_epa":
      return gatewayPost("/tools/screen.epa", { parcel_id: body.parcel_id ?? body.p_parcel_id, radius_miles: body.radius_miles ?? 1.0 });
    case "api_screen_traffic":
      return gatewayPost("/tools/screen.traffic", { parcel_id: body.parcel_id ?? body.p_parcel_id, radius_miles: body.radius_miles ?? 0.5 });
    case "api_screen_ldeq":
      return gatewayPost("/tools/screen.ldeq", { parcel_id: body.parcel_id ?? body.p_parcel_id, radius_miles: body.radius_miles ?? 1.0 });
    case "api_screen_full":
      return gatewayPost("/tools/screen.full", { parcel_id: body.parcel_id ?? body.p_parcel_id });
    default:
      return { error: `Unknown RPC function: ${fnName}` };
  }
}

// ---------------------------------------------------------------------------
// Geocoding helper — converts an address to lat/lng
// Uses Google Maps Geocoding API if GOOGLE_MAPS_API_KEY is set (AIza...),
// otherwise falls back to OpenStreetMap Nominatim (free, no key needed).
// ---------------------------------------------------------------------------

async function geocodeGoogle(address: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const params = new URLSearchParams({
      address,
      key: apiKey,
      components: "country:US",
    });
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status: string;
      results?: Array<{
        geometry?: { location?: { lat: number; lng: number } };
      }>;
    };
    if (data.status !== "OK" || !data.results?.length) return null;
    const loc = data.results[0].geometry?.location;
    return loc ? { lat: loc.lat, lng: loc.lng } : null;
  } catch {
    return null;
  }
}

async function geocodeNominatim(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const params = new URLSearchParams({
      q: address,
      format: "json",
      limit: "1",
      countrycodes: "us",
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "EntitlementOS/1.0 (gallagherpropco.com)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const googleKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (googleKey && googleKey.startsWith("AIza")) {
    const result = await geocodeGoogle(address, googleKey);
    if (result) return result;
  }
  const nominatimResult = await geocodeNominatim(address);
  if (nominatimResult) return nominatimResult;

  // Fallback: try a simplified query (strip street number, keep road + city/state)
  const simplified = address.replace(/^\d+\s+/, "").trim();
  if (simplified !== address && simplified.length > 3) {
    return geocodeNominatim(simplified);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Map Feature Envelope — inline helper (cannot import from apps/web/)
// ---------------------------------------------------------------------------

interface MapFeatureEnvelope {
  parcelId: string;
  address?: string;
  zoningType?: string;
  center?: { lat: number; lng: number };
  label?: string;
}

const MAP_FEATURES_KEY = "__mapFeatures";

function extractMapFeatures(
  parcels: unknown,
): MapFeatureEnvelope[] {
  const arr = Array.isArray(parcels) ? parcels : [parcels];
  const features: MapFeatureEnvelope[] = [];
  for (const p of arr) {
    if (!p || typeof p !== "object") continue;
    const rec = p as Record<string, unknown>;
    const id = String(rec.parcel_id ?? rec.parcelId ?? rec.id ?? "");
    if (!id) continue;
    const address = String(rec.site_addr ?? rec.siteAddr ?? rec.address ?? "");
    const zoning = rec.zoning_type ?? rec.zoningType;
    let center: { lat: number; lng: number } | undefined;
    if (rec.latitude && rec.longitude) {
      center = { lat: Number(rec.latitude), lng: Number(rec.longitude) };
    } else if (rec.centroid_lat && rec.centroid_lng) {
      center = { lat: Number(rec.centroid_lat), lng: Number(rec.centroid_lng) };
    }
    features.push({
      parcelId: id,
      address: address || undefined,
      zoningType: typeof zoning === "string" ? zoning : undefined,
      center,
      label: address || id,
    });
  }
  return features;
}

export function wrapResultWithMapFeatures(result: unknown): string {
  const text = JSON.stringify(result);
  const features = extractMapFeatures(result);
  if (features.length === 0) return text;
  return JSON.stringify({ text, [MAP_FEATURES_KEY]: features });
}

// ---------------------------------------------------------------------------
// 1. Search Parcels — geocode address then bbox search on gateway
// ---------------------------------------------------------------------------
export const searchParcels = tool({
  name: "search_parcels",
  description:
    "Search for parcels by STREET ADDRESS only (geocodes the address to coordinates, then finds nearby parcels). " +
    "Only use this when the user provides a specific street address like '222 St Louis St'. " +
    "Do NOT use this for ZIP code, zoning, acreage, or owner-based searches — use query_property_db instead. " +
    "For a known parcel number, use get_parcel_details.",
  parameters: z.object({
    search_text: z
      .string()
      .min(1)
      .describe("Street address to search for (e.g. '222 St Louis St, Baton Rouge, LA')"),
    parish: z
      .string()
      .optional().nullable()
      .describe("Parish name to append to the search for better geocoding accuracy (e.g. 'East Baton Rouge')"),
    limit_rows: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional().nullable()
      .describe("Max parcels to return (default 10)"),
  }),
  execute: async ({ search_text, parish, limit_rows }) => {
    const normalizedSearchText = search_text.replace(/[''`]/g, "").trim();
    const result = await rpc("api_search_parcels", {
      search_text: normalizedSearchText,
      ...(parish ? { parish } : {}),
      ...(limit_rows ? { limit_rows } : {}),
    });
    return wrapResultWithMapFeatures(result);
  },
});

// ---------------------------------------------------------------------------
// 2. Get Parcel Details
// ---------------------------------------------------------------------------
export const getParcelDetails = tool({
  name: "get_parcel_details",
  description:
    "Get full details for a specific parcel by its parcel number (e.g. '001-5096-7'). Returns owner info, address, area, assessed value, and geometry.",
  parameters: z.object({
    parcel_id: z
      .string()
      .uuid()
      .or(z.string())
      .describe("The parcel number (e.g. '001-5096-7')"),
  }),
  execute: async ({ parcel_id }) => {
    const result = await rpc("api_get_parcel", { parcel_id });
    return wrapResultWithMapFeatures(result);
  },
});

// ---------------------------------------------------------------------------
// 3. Zoning Screening
// ---------------------------------------------------------------------------
export const screenZoning = tool({
  name: "screen_zoning",
  description:
    "Screen a parcel for zoning classification. Returns the EBR zoning type (e.g. C2, M1, A1), existing land use, and future land use from EBRGIS data.",
  parameters: z.object({
    parcel_id: z
      .string()
      .describe("The parcel number (e.g. '001-5096-7')"),
  }),
  execute: async ({ parcel_id }) => {
    const safePid = parcel_id.replace(/'/g, "''");
    const result = await gatewayPost("/tools/parcels.sql", {
      sql: `SELECT parcel_id, address, owner, area_sqft / 43560.0 AS acres, assessed_value FROM ebr_parcels WHERE parcel_id = '${safePid}' LIMIT 1`,
    });
    const data = result as Record<string, unknown>;
    const rows = Array.isArray(data?.rows) ? data.rows : Array.isArray(result) ? result : [];
    return wrapResultWithMapFeatures(rows as Record<string, unknown>[]);
  },
});

// ---------------------------------------------------------------------------
// 4. Flood Zone Screening
// ---------------------------------------------------------------------------
export const screenFlood = tool({
  name: "screen_flood",
  description:
    "Screen a parcel for FEMA flood zone hazards. Returns flood zones that intersect the parcel, SFHA status, and overlap percentages.",
  parameters: z.object({
    parcel_id: z
      .string()
      .describe("The parcel number (e.g. '001-5096-7')"),
  }),
  execute: async ({ parcel_id }) => {
    const result = await rpc("api_screen_flood", { parcel_id });
    return wrapResultWithMapFeatures(result);
  },
});

// ---------------------------------------------------------------------------
// 4. Soils Screening
// ---------------------------------------------------------------------------
export const screenSoils = tool({
  name: "screen_soils",
  description:
    "Screen a parcel for USDA soil conditions. Returns soil map units, hydrologic groups, and hydric ratings.",
  parameters: z.object({
    parcel_id: z
      .string()
      .describe("The parcel number (e.g. '001-5096-7')"),
  }),
  execute: async ({ parcel_id }) => {
    const result = await rpc("api_screen_soils", { parcel_id });
    return JSON.stringify(result);
  },
});

// ---------------------------------------------------------------------------
// 5. Wetlands Screening
// ---------------------------------------------------------------------------
export const screenWetlands = tool({
  name: "screen_wetlands",
  description:
    "Screen a parcel for NWI wetlands. Returns wetland areas that intersect the parcel with type and overlap percentages.",
  parameters: z.object({
    parcel_id: z
      .string()
      .describe("The parcel number (e.g. '001-5096-7')"),
  }),
  execute: async ({ parcel_id }) => {
    const result = await rpc("api_screen_wetlands", { parcel_id });
    return JSON.stringify(result);
  },
});

// ---------------------------------------------------------------------------
// 6. EPA Environmental Screening
// ---------------------------------------------------------------------------
export const screenEpa = tool({
  name: "screen_epa",
  description:
    "Screen a parcel for nearby EPA-regulated facilities (Superfund, RCRA, etc.). Returns facilities within the search radius with distance.",
  parameters: z.object({
    parcel_id: z
      .string()
      .describe("The parcel number (e.g. '001-5096-7')"),
    radius_miles: z
      .number()
      .optional().nullable()
      .describe("Search radius in miles (default 1.0)"),
  }),
  execute: async ({ parcel_id, radius_miles }) => {
    const result = await rpc("api_screen_epa", {
      parcel_id,
      ...(radius_miles ? { radius_miles } : {}),
    });
    return JSON.stringify(result);
  },
});

// ---------------------------------------------------------------------------
// 7. Traffic / Access Screening
// ---------------------------------------------------------------------------
export const screenTraffic = tool({
  name: "screen_traffic",
  description:
    "Screen a parcel for nearby traffic count stations. Returns AADT counts and distances. May return 'not available' if traffic data is not yet loaded.",
  parameters: z.object({
    parcel_id: z
      .string()
      .describe("The parcel number (e.g. '001-5096-7')"),
    radius_miles: z
      .number()
      .optional().nullable()
      .describe("Search radius in miles (default 0.5)"),
  }),
  execute: async ({ parcel_id, radius_miles }) => {
    const result = await rpc("api_screen_traffic", {
      parcel_id,
      ...(radius_miles ? { radius_miles } : {}),
    });
    return JSON.stringify(result);
  },
});

// ---------------------------------------------------------------------------
// 8. LDEQ Screening
// ---------------------------------------------------------------------------
export const screenLdeq = tool({
  name: "screen_ldeq",
  description:
    "Screen a parcel for nearby LDEQ-permitted facilities. Returns permits within the search radius with distance. May return 'not available' if LDEQ data is not yet loaded.",
  parameters: z.object({
    parcel_id: z
      .string()
      .describe("The parcel number (e.g. '001-5096-7')"),
    radius_miles: z
      .number()
      .optional().nullable()
      .describe("Search radius in miles (default 1.0)"),
  }),
  execute: async ({ parcel_id, radius_miles }) => {
    const result = await rpc("api_screen_ldeq", {
      parcel_id,
      ...(radius_miles ? { radius_miles } : {}),
    });
    return JSON.stringify(result);
  },
});

// ---------------------------------------------------------------------------
// 9. Full Site Screening
// ---------------------------------------------------------------------------
export const screenFull = tool({
  name: "screen_full",
  description:
    "Run a comprehensive site screening on a parcel covering zoning, flood, soils, wetlands, EPA, traffic, and LDEQ. Returns all screening results in one call.",
  parameters: z.object({
    parcel_id: z
      .string()
      .describe("The parcel number (e.g. '001-5096-7')"),
  }),
  execute: async ({ parcel_id }) => {
    const result = await rpc("api_screen_full", { parcel_id });
    return wrapResultWithMapFeatures(result);
  },
});

// ---------------------------------------------------------------------------
// 10. Query Property DB — Typed Facade
// ---------------------------------------------------------------------------
export const queryPropertyDb = tool({
  name: "query_property_db",
  description:
    "Simple structured parcel search with preset filters. For COUNT, GROUP BY, aggregate, or spatial queries, use query_property_db_sql instead (it is strictly more capable). " +
    "This tool is a convenience wrapper for basic filter combinations only.",
  parameters: z.object({
    zoning: z.string().optional().nullable().describe("Zoning type to filter by (e.g. 'C2', 'M1', 'A1'). Case/hyphen insensitive."),
    zip: z.string().optional().nullable().describe("ZIP code to filter parcels by (matched in situs address)."),
    min_acreage: z.number().optional().nullable().describe("Minimum parcel acreage."),
    max_acreage: z.number().optional().nullable().describe("Maximum parcel acreage."),
    owner_contains: z.string().optional().nullable().describe("Filter parcels where owner name contains this text (case-insensitive)."),
    land_use: z.string().optional().nullable().describe("Filter by existing land use classification."),
    sort: z.string().optional().nullable().describe("Sort order: 'acreage_desc' (default), 'acreage_asc', 'assessed_value_desc', 'address_asc'."),
    limit: z.number().optional().nullable().describe("Max results to return (default 10, max 100)."),
  }),
  execute: async (params) => {
    // Build SQL dynamically from structured filters via /tools/parcels.sql
    // Columns: parcel_id, address, owner, area_sqft, assessed_value, zoning_type, geom
    const conditions: string[] = [];
    const limit = Math.min(params.limit ?? 10, 100);

    if (params.zoning) {
      const z = params.zoning.replace(/'/g, "''").toUpperCase().replace(/-/g, "");
      conditions.push(`UPPER(REPLACE(zoning_type, '-', '')) = '${z}'`);
    }
    if (params.zip) {
      const zip = params.zip.replace(/'/g, "''");
      conditions.push(`address LIKE '%${zip}%'`);
    }
    if (params.min_acreage != null) {
      conditions.push(`area_sqft / 43560.0 >= ${Number(params.min_acreage)}`);
    }
    if (params.max_acreage != null) {
      conditions.push(`area_sqft / 43560.0 <= ${Number(params.max_acreage)}`);
    }
    if (params.owner_contains) {
      const owner = params.owner_contains.replace(/'/g, "''");
      conditions.push(`owner ILIKE '%${owner}%'`);
    }
    if (params.land_use) {
      const lu = params.land_use.replace(/'/g, "''");
      conditions.push(`address ILIKE '%${lu}%'`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    let orderBy = "ORDER BY area_sqft DESC";
    if (params.sort === "acreage_asc") orderBy = "ORDER BY area_sqft ASC";
    else if (params.sort === "assessed_value_desc") orderBy = "ORDER BY assessed_value DESC NULLS LAST";
    else if (params.sort === "address_asc") orderBy = "ORDER BY address ASC";

    const sql = `SELECT parcel_id, address, owner, area_sqft / 43560.0 AS acres, assessed_value, zoning_type FROM ebr_parcels ${where} ${orderBy} LIMIT ${limit}`;
    const result = await gatewayPost("/tools/parcels.sql", { sql });
    // Gateway returns {ok, rows, rowCount} — extract rows array
    const rows = Array.isArray(result) ? result : (result as Record<string, unknown>)?.rows;
    return wrapResultWithMapFeatures(Array.isArray(rows) ? rows : []);
  },
});

// ---------------------------------------------------------------------------
// 11. Query Property DB — Raw SQL
// ---------------------------------------------------------------------------
export const queryPropertyDbSql = tool({
  name: "query_property_db_sql",
  description:
    "Run a read-only SQL query against the Louisiana Property Database. USE THIS for aggregate queries (COUNT, SUM, AVG, GROUP BY), " +
    "spatial queries (ST_DWithin, ST_Intersects), complex filtering, and any question the structured query_property_db tool cannot express.\n\n" +
    "SCHEMA:\n" +
    "  ebr_parcels (198K rows): parcel_id TEXT, address TEXT, owner TEXT, area_sqft NUMERIC, assessed_value NUMERIC, zoning_type TEXT, geom GEOMETRY(MultiPolygon,4326), created_at TIMESTAMP\n" +
    "  fema_flood (5.2K rows): gid INT, dfirm_id TEXT, fld_zone TEXT, zone_subty TEXT, sfha_tf TEXT, geom GEOMETRY\n" +
    "  soils (37K rows): gid INT, musym TEXT, muname TEXT, hydgrp TEXT, hydric_rating TEXT, geom GEOMETRY\n" +
    "  wetlands (39K rows): gid INT, wetland_type TEXT, attribute TEXT, geom GEOMETRY\n" +
    "  epa_facilities (6.7K rows): gid INT, facility_name TEXT, street TEXT, city TEXT, state TEXT, zip TEXT, latitude NUMERIC, longitude NUMERIC, geom GEOMETRY(Point,4326)\n\n" +
    "TIPS:\n" +
    "  - Acreage: area_sqft / 43560.0\n" +
    "  - PostGIS: ST_DWithin(geom, ST_SetSRID(ST_MakePoint(lng,lat),4326), meters), ST_Intersects, ST_Contains, ST_Area, ST_Centroid\n" +
    "  - Distance in meters: ST_Distance(geom::geography, point::geography)\n" +
    "  - Always include parcel_id and address in SELECT for map display\n" +
    "  - Use LIMIT (max 500 for data, no limit needed for COUNT/aggregate)\n" +
    "  - SELECT only, no DDL/DML. Gateway enforces table allowlist.\n\n" +
    "EXAMPLES:\n" +
    "  Count by zoning: SELECT zoning_type, COUNT(*) AS cnt FROM ebr_parcels WHERE zoning_type IS NOT NULL GROUP BY zoning_type ORDER BY cnt DESC\n" +
    "  Large parcels: SELECT parcel_id, address, owner, area_sqft/43560.0 AS acres FROM ebr_parcels WHERE area_sqft/43560.0 >= 5 ORDER BY area_sqft DESC LIMIT 20\n" +
    "  Near a point: SELECT parcel_id, address, area_sqft/43560.0 AS acres FROM ebr_parcels WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(-91.1,30.45),4326)::geography, 1609) LIMIT 20\n" +
    "  Flood zone check: SELECT e.parcel_id, e.address, f.fld_zone FROM ebr_parcels e JOIN fema_flood f ON ST_Intersects(e.geom, f.geom) WHERE e.parcel_id = '001-5096-7'",
  parameters: z.object({
    sql: z.string().describe("Read-only SQL query (SELECT/WITH only). Include parcel_id + address columns when returning parcels for map display."),
  }),
  execute: async (params) => {
    // Validate SELECT-only (defense in depth — gateway also enforces)
    const trimmed = params.sql.trim().replace(/;+$/, "");
    const firstWord = trimmed.split(/\s+/)[0]?.toUpperCase();
    if (firstWord !== "SELECT" && firstWord !== "WITH") {
      return JSON.stringify({ error: "Only SELECT/WITH queries are allowed." });
    }
    const result = await gatewayPost("/tools/parcels.sql", { sql: trimmed });
    const recovered = await maybeRecoverZoningCountQuery(trimmed, result);
    if (recovered) {
      return JSON.stringify(recovered);
    }
    const data = result as Record<string, unknown>;
    if (data && typeof data === "object" && Array.isArray(data.rows)) {
      // Wrap with map features so parcels can be highlighted on the map
      const rows = data.rows as Record<string, unknown>[];
      const features = extractMapFeatures(rows);
      if (features.length > 0) {
        return JSON.stringify({
          rowCount: data.rowCount,
          rows,
          [MAP_FEATURES_KEY]: features,
        });
      }
      return JSON.stringify({ rowCount: data.rowCount, rows });
    }
    return JSON.stringify(result);
  },
});

// ---------------------------------------------------------------------------
// 12. Screen Batch — Multi-parcel concurrent screening
// ---------------------------------------------------------------------------

/**
 * Helper to POST progress events to Durable Object /push endpoint
 */
async function pushOperationEvent(
  conversationId: string,
  event: {
    type: "operation_progress" | "operation_done" | "operation_error";
    operationId: string;
    label: string;
    pct?: number;
    summary?: string;
    error?: string;
  },
): Promise<void> {
  if (!conversationId) return; // silently skip if no conversation

  const pushUrl = `${getAgentsUrl()}/${conversationId}/push`;
  const pushKey = getGatewayKey();

  try {
    await fetch(pushUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${pushKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversationId,
        event,
      }),
    });
  } catch (error) {
    console.error(`[screenBatch] Failed to push ${event.type} event:`, error);
    // Don't throw — push failures should not block tool execution
  }
}

export const screenBatch = tool({
  name: "screen_batch",
  description:
    "Run full environmental screening on multiple parcels concurrently. Accepts up to 20 parcel IDs and screens each " +
    "for zoning, flood zones, soils, wetlands, EPA facilities, traffic, and LDEQ issues. Results returned as keyed object " +
    "with parcel_id as key and {status, data, error} for each. Optionally streams real-time progress to browser via conversationId.",
  parameters: z.object({
    parcel_ids: z.array(z.string()).max(20).describe("Array of parcel IDs to screen (max 20). Screened concurrently with limit of 5."),
    conversationId: z.string().optional().nullable().describe("Optional conversation ID for real-time progress streaming. If provided, operation_progress events are pushed to browser."),
    operationId: z.string().optional().nullable().describe("Optional operation ID for progress tracking. Generated if not provided."),
  }),
  execute: async ({ parcel_ids, conversationId: rawConversationId, operationId: rawOperationId }) => {
    const conversationId = rawConversationId ?? "";
    const operationId = rawOperationId ?? `batch-screen-${Date.now()}`;
    const total = parcel_ids.length;

    // Use atomic counter to track completion safely
    const completionTracker = { count: 0 };
    try {
      const tasks = parcel_ids.map(parcel_id => async () => {
        try {
          const data = await rpc("api_screen_full", { parcel_id });

          // Atomically increment and push progress if conversationId provided
          completionTracker.count++;
          if (conversationId && completionTracker.count <= total) {
            await pushOperationEvent(conversationId, {
              type: "operation_progress",
              operationId,
              label: `Screening ${parcel_id}`,
              pct: Math.round((completionTracker.count / total) * 100),
            });
          }

          return { status: "ok" as const, data };
        } catch (error) {
          completionTracker.count++;
          // Still push progress for failed parcels
          if (conversationId && completionTracker.count <= total) {
            await pushOperationEvent(conversationId, {
              type: "operation_progress",
              operationId,
              label: `Screening ${parcel_id} (failed)`,
              pct: Math.round((completionTracker.count / total) * 100),
            });
          }
          return { status: "error" as const, error: String(error) };
        }
      });

      const settled = await runWithConcurrency(tasks, 5);

      const result: Record<string, { status: string; data?: unknown; error?: string }> = {};
      parcel_ids.forEach((parcel_id, index) => {
        const settled_result = settled[index];
        if (settled_result.status === "fulfilled") {
          result[parcel_id] = settled_result.value;
        } else {
          result[parcel_id] = { status: "error", error: String(settled_result.reason) };
        }
      });

      // Push completion event if conversationId provided
      if (conversationId) {
        const errorCount = Object.values(result).filter(r => r.status === "error").length;
        const successCount = total - errorCount;

        await pushOperationEvent(conversationId, {
          type: "operation_done",
          operationId,
          label: "Batch screening complete",
          summary: `Screened ${total} parcels: ${successCount} successful, ${errorCount} failed`,
        });
      }

      return wrapResultWithMapFeatures(result);
    } catch (batchError) {
      // Push error event if conversationId provided
      if (conversationId) {
        await pushOperationEvent(conversationId, {
          type: "operation_error",
          operationId,
          label: "Batch screening failed",
          error: String(batchError),
        });
      }

      throw batchError;
    }
  },
});
// build trigger: 1774251043
