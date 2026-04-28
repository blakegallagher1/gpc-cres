import { tool } from "@openai/agents";
import { z } from "zod";
import { runWithConcurrency } from "./concurrency.js";

const PROPERTY_DB_INTERNAL_SCOPE_HEADER = "x-gpc-internal-scope";
const PROPERTY_DB_INTERNAL_SCOPE_VALUE = "parcels.read";

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

function extractZoningCodeForCount(sql: string): string | null {
  const loweredSql = sql.toLowerCase();
  if (!loweredSql.includes("from ebr_parcels")) return null;
  if (!loweredSql.includes("count(")) return null;
  if (!/(zoning|zone|zonetype|zoningcode|zoning_type)/i.test(sql)) return null;
  const zoningMatch = sql.match(/=\s*'([^']+)'/i);
  const zoning = zoningMatch?.[1]?.trim();
  if (!zoning) return null;
  return zoning;
}

const PARISH_REFERENCE_RE = /\b([a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,3})\s+parish\b/gi;

function extractRequestedParish(sql: string): string | null {
  const matches = [...sql.matchAll(PARISH_REFERENCE_RE)];
  const match = matches.at(-1);
  if (!match) return null;
  const candidate = match[1]?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
  if (!candidate) return null;
  const stopTokens = new Set(["in", "for", "of", "near", "at", "around", "inside"]);
  const parts = candidate.split(" ");
  let startIndex = 0;
  for (let index = 0; index < parts.length; index += 1) {
    if (stopTokens.has(parts[index])) {
      startIndex = index + 1;
    }
  }
  const parish = parts.slice(startIndex).join(" ").trim();
  const normalized = parish.length > 0 ? parish : candidate;
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function isParishScopedParcelQueryMissingDimension(sql: string): {
  missing: boolean;
  parish: string | null;
} {
  const parish = extractRequestedParish(sql);
  if (!parish) return { missing: false, parish: null };
  return { missing: false, parish };
}

type ParishVerificationTier = "verified" | "probable" | "unknown";

const PARISH_REFERENCE_TABLES = [
  "fema_flood",
  "soils",
  "wetlands",
  "epa_facilities",
] as const;

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function toRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
  }
  if (payload && typeof payload === "object") {
    const rows = (payload as Record<string, unknown>).rows;
    if (Array.isArray(rows)) {
      return rows.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
    }
  }
  return [];
}

function collectParcelIds(rows: Record<string, unknown>[]): string[] {
  return uniqueStrings(
    rows
      .map((row) => {
        const raw = row.parcel_id ?? row.parcelId;
        return typeof raw === "string" ? raw.trim() : "";
      })
      .filter((value) => value.length > 0),
  );
}

function chunkArray<T>(values: T[], size: number): T[][] {
  if (size <= 0) return [values];
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchReferenceZipsForParish(parish: string): Promise<Set<string>> {
  const escapedParish = escapeSqlLiteral(parish);
  const zips = new Set<string>();
  for (const tableName of PARISH_REFERENCE_TABLES) {
    const sql = `SELECT DISTINCT z.zip AS zip
FROM zcta z
JOIN ${tableName} r ON ST_Intersects(z.geom, r.geom)
WHERE r.parish ILIKE '${escapedParish}'
  AND z.zip IS NOT NULL
LIMIT 2000`;
    const payload = await gatewayPost("/tools/parcels.sql", { sql });
    const rows = toRows(payload);
    for (const row of rows) {
      const zip = row.zip;
      if (typeof zip === "string" && zip.trim().length > 0) {
        zips.add(zip.trim());
      }
    }
  }
  return zips;
}

async function fetchVerifiedParcelIdsForParish(
  parish: string,
  parcelIds: string[],
): Promise<Set<string>> {
  const escapedParish = escapeSqlLiteral(parish);
  const verified = new Set<string>();
  for (const parcelChunk of chunkArray(parcelIds, 180)) {
    const inClause = parcelChunk.map((id) => `'${escapeSqlLiteral(id)}'`).join(", ");
    for (const tableName of PARISH_REFERENCE_TABLES) {
      const sql = `SELECT DISTINCT e.parcel_id AS parcel_id
FROM ebr_parcels e
JOIN ${tableName} r ON ST_Intersects(e.geom, r.geom)
WHERE r.parish ILIKE '${escapedParish}'
  AND e.parcel_id IN (${inClause})
LIMIT 2000`;
      const payload = await gatewayPost("/tools/parcels.sql", { sql });
      const rows = toRows(payload);
      for (const row of rows) {
        const parcelId = row.parcel_id;
        if (typeof parcelId === "string" && parcelId.trim().length > 0) {
          verified.add(parcelId.trim());
        }
      }
    }
  }
  return verified;
}

async function fetchParcelZipMap(parcelIds: string[]): Promise<Map<string, string>> {
  const zipMap = new Map<string, string>();
  for (const parcelChunk of chunkArray(parcelIds, 250)) {
    const inClause = parcelChunk.map((id) => `'${escapeSqlLiteral(id)}'`).join(", ");
    const sql = `SELECT parcel_id, zip FROM ebr_parcels WHERE parcel_id IN (${inClause})`;
    const payload = await gatewayPost("/tools/parcels.sql", { sql });
    const rows = toRows(payload);
    for (const row of rows) {
      const parcelId = row.parcel_id;
      const zip = row.zip;
      if (typeof parcelId === "string" && typeof zip === "string") {
        zipMap.set(parcelId.trim(), zip.trim());
      }
    }
  }
  return zipMap;
}

function tierParcelRows(params: {
  rows: Record<string, unknown>[];
  verifiedParcelIds: Set<string>;
  parishZipSet: Set<string>;
  zipByParcelId: Map<string, string>;
}): {
  verified: Array<Record<string, unknown> & {
    verification_tier: ParishVerificationTier;
    parish_verified: boolean;
    parish_confidence: number;
  }>;
  probable: Array<Record<string, unknown> & {
    verification_tier: ParishVerificationTier;
    parish_verified: boolean;
    parish_confidence: number;
  }>;
  unknown: Array<Record<string, unknown> & {
    verification_tier: ParishVerificationTier;
    parish_verified: boolean;
    parish_confidence: number;
  }>;
  all: Array<Record<string, unknown> & {
    verification_tier: ParishVerificationTier;
    parish_verified: boolean;
    parish_confidence: number;
  }>;
} {
  const verified: Array<Record<string, unknown> & {
    verification_tier: ParishVerificationTier;
    parish_verified: boolean;
    parish_confidence: number;
  }> = [];
  const probable: Array<Record<string, unknown> & {
    verification_tier: ParishVerificationTier;
    parish_verified: boolean;
    parish_confidence: number;
  }> = [];
  const unknown: Array<Record<string, unknown> & {
    verification_tier: ParishVerificationTier;
    parish_verified: boolean;
    parish_confidence: number;
  }> = [];

  for (const row of params.rows) {
    const parcelIdValue = row.parcel_id ?? row.parcelId;
    const parcelId =
      typeof parcelIdValue === "string" && parcelIdValue.trim().length > 0
        ? parcelIdValue.trim()
        : null;
    const zip = parcelId ? params.zipByParcelId.get(parcelId) ?? null : null;
    const isVerified = parcelId ? params.verifiedParcelIds.has(parcelId) : false;
    const isProbable = !isVerified && typeof zip === "string" && params.parishZipSet.has(zip);

    const enriched = {
      ...row,
      verification_tier: isVerified ? "verified" : isProbable ? "probable" : "unknown",
      parish_verified: isVerified,
      parish_confidence: isVerified ? 0.95 : isProbable ? 0.6 : 0.2,
    } as Record<string, unknown> & {
      verification_tier: ParishVerificationTier;
      parish_verified: boolean;
      parish_confidence: number;
    };

    if (isVerified) {
      verified.push(enriched);
    } else if (isProbable) {
      probable.push(enriched);
    } else {
      unknown.push(enriched);
    }
  }

  return {
    verified,
    probable,
    unknown,
    all: [...verified, ...probable, ...unknown],
  };
}

async function countByZoningViaParcelSearch(zoning: string): Promise<unknown | null> {
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

async function maybeRecoverZoningCountQuery(
  sql: string,
  payload: unknown,
): Promise<unknown | null> {
  const zoning = extractZoningCodeForCount(sql);
  if (!zoning) return null;

  const errorText = readGatewayErrorText(payload).toLowerCase();
  if (!/(zoning|zone|zonetype|zoningcode|zoning_type)/i.test(errorText)) return null;
  if (!errorText.includes("does not exist")) return null;
  return countByZoningViaParcelSearch(zoning);
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
          [PROPERTY_DB_INTERNAL_SCOPE_HEADER]: PROPERTY_DB_INTERNAL_SCOPE_VALUE,
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
      return gatewayPost("/api/screening/flood", { parcelId: String(body.parcel_id ?? body.p_parcel_id) });
    case "api_screen_soils":
      return gatewayPost("/api/screening/soils", { parcelId: String(body.parcel_id ?? body.p_parcel_id) });
    case "api_screen_wetlands":
      return gatewayPost("/api/screening/wetlands", { parcelId: String(body.parcel_id ?? body.p_parcel_id) });
    case "api_screen_epa":
      return gatewayPost("/api/screening/epa", { parcelId: String(body.parcel_id ?? body.p_parcel_id), radius_miles: body.radius_miles ?? 1.0 });
    case "api_screen_traffic":
      return gatewayPost("/api/screening/traffic", { parcelId: String(body.parcel_id ?? body.p_parcel_id), radius_miles: body.radius_miles ?? 0.5 });
    case "api_screen_ldeq":
      return gatewayPost("/api/screening/ldeq", { parcelId: String(body.parcel_id ?? body.p_parcel_id), radius_miles: body.radius_miles ?? 1.0 });
    case "api_screen_full":
      return gatewayPost("/api/screening/full", { parcelId: String(body.parcel_id ?? body.p_parcel_id) });
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
    parish: z.string().optional().nullable().describe("Parish name to filter parcels by (uses indexed ebr_parcels.parish)."),
    zip: z.string().optional().nullable().describe("ZIP code to filter parcels by (uses ebr_parcels.zip)."),
    min_acreage: z.number().optional().nullable().describe("Minimum parcel acreage."),
    max_acreage: z.number().optional().nullable().describe("Maximum parcel acreage."),
    owner_contains: z.string().optional().nullable().describe("Filter parcels where owner name contains this text (case-insensitive)."),
    land_use: z.string().optional().nullable().describe("Filter by existing land use classification."),
    sort: z.string().optional().nullable().describe("Sort order: 'acreage_desc' (default), 'acreage_asc', 'assessed_value_desc', 'address_asc'."),
    limit: z.number().optional().nullable().describe("Max results to return (default 10, max 100)."),
  }),
  execute: async (params) => {
    // Build SQL dynamically from structured filters via /tools/parcels.sql
    // Columns: parcel_id, address, owner, parish, zip, area_sqft, assessed_value, zoning_type, geom
    const conditions: string[] = [];
    const limit = Math.min(params.limit ?? 10, 100);

    if (params.zoning) {
      const z = params.zoning.replace(/'/g, "''").toUpperCase().replace(/-/g, "");
      conditions.push(`UPPER(REPLACE(zoning_type, '-', '')) = '${z}'`);
    }
    if (params.parish) {
      const parish = params.parish.replace(/'/g, "''");
      conditions.push(`parish ILIKE '${parish}'`);
    }
    if (params.zip) {
      const zip = params.zip.replace(/'/g, "''");
      conditions.push(`zip = '${zip}'`);
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

    const sql = `SELECT parcel_id, address, owner, parish, zip, area_sqft / 43560.0 AS acres, assessed_value, zoning_type FROM ebr_parcels ${where} ${orderBy} LIMIT ${limit}`;
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
    "SCHEMA (exact columns — do NOT assume columns that are not listed):\n" +
    "  ebr_parcels (560K rows, multi-parish — NOT just EBR despite the legacy table name):\n" +
    "    parcel_id TEXT, address TEXT (street only, no city/state), owner TEXT, parish TEXT (indexed), zip TEXT (ZCTA zip code, 99.95% populated),\n" +
    "    area_sqft NUMERIC, assessed_value NUMERIC, zoning_type TEXT (34% populated, NULL for many parcels),\n" +
    "    geom GEOMETRY(MultiPolygon,4326), created_at TIMESTAMP, id UUID\n" +
    "    NOTE: ebr_parcels is multi-parish. Use parish for parish-scoped parcel queries.\n" +
    "  fema_flood (5.2K rows): id UUID, zone TEXT, bfe TEXT, panel_id TEXT, parish TEXT, geom GEOMETRY, effective_date TEXT\n" +
    "  soils (37K rows): id UUID, mapunit_key TEXT, drainage_class TEXT, hydric_rating TEXT, shrink_swell TEXT, parish TEXT, geom GEOMETRY\n" +
    "  wetlands (39K rows): id UUID, wetland_type TEXT, parish TEXT, geom GEOMETRY\n" +
    "  epa_facilities (6.7K rows): id UUID, name TEXT, street_address TEXT, city TEXT, state TEXT, zip TEXT, registry_id TEXT, status TEXT, violations_last_3yr INT, penalties_last_3yr INT, lat NUMERIC, lon NUMERIC, parish TEXT, geom GEOMETRY(Point,4326)\n" +
    "  zcta (516 rows — Louisiana ZIP code polygons): id SERIAL, zip TEXT, state_fips TEXT, land_area_sqm BIGINT, lat NUMERIC, lon NUMERIC, geom GEOMETRY(MultiPolygon,4326)\n\n" +
    "IMPORTANT CONSTRAINTS:\n" +
    "  - ebr_parcels has indexed parish and zip columns; use them before spatial joins for parish/ZIP filters.\n" +
    "  - For ZIP breakdowns: SELECT zip, COUNT(*) FROM ebr_parcels WHERE zoning_type = 'A4' GROUP BY zip ORDER BY count DESC\n" +
    "  - Do NOT use CTEs, subqueries, or temp table names that match non-allowed table names — the gateway parser will reject them.\n" +
    "  - fema_flood, soils, wetlands, epa_facilities also have a 'parish' column for overlay-specific filters.\n" +
    "  - Zoning is only ~34% populated — always mention this caveat when reporting zoning counts.\n" +
    "  - NEVER use = (SELECT ...) for subqueries that can return multiple rows — always use IN (SELECT ...).\n\n" +
    "PARISH-SCOPED PARCEL SEARCH (CRITICAL):\n" +
    "  Use the indexed ebr_parcels.parish column for parcel membership. Do NOT join soils/flood/wetlands just to determine parish.\n" +
    "  PATTERN: SELECT parcel_id, address, owner, parish, area_sqft/43560.0 AS acres, zoning_type\n" +
    "    FROM ebr_parcels\n" +
    "    WHERE parish ILIKE 'Livingston' AND area_sqft/43560.0 >= 10\n" +
    "    ORDER BY area_sqft DESC LIMIT 50\n" +
    "  For overlay screening, then join overlay tables on geometry and keep their parish filters overlay-specific.\n\n" +
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
    "  Flood zone check: SELECT e.parcel_id, e.address, f.zone FROM ebr_parcels e JOIN fema_flood f ON ST_Intersects(e.geom, f.geom) WHERE e.parcel_id = '001-5096-7'\n" +
    "  Parish land search: SELECT parcel_id, address, owner, parish, area_sqft/43560.0 AS acres, zoning_type FROM ebr_parcels WHERE parish ILIKE 'Livingston' AND area_sqft/43560.0 >= 15 ORDER BY area_sqft DESC LIMIT 30",
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

    const parishGuard = isParishScopedParcelQueryMissingDimension(trimmed);

    const shortcutZoning = extractZoningCodeForCount(trimmed);
    if (shortcutZoning) {
      const shortcutResult = await countByZoningViaParcelSearch(shortcutZoning);
      if (shortcutResult) {
        return JSON.stringify(shortcutResult);
      }
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
      if (parishGuard.missing && parishGuard.parish) {
        const parcelIds = collectParcelIds(rows);
        if (parcelIds.length === 0) {
          return JSON.stringify({
            rowCount: data.rowCount,
            rows,
            requestedParish: parishGuard.parish,
            verification: {
              mode: "authoritative_geometry_plus_proxy",
              tieringApplied: false,
              code: "PARISH_SCOPE_NON_PARCEL_RESULT",
              guidance:
                "Result does not include parcel_id rows, so parish membership cannot be tiered. Use parcel-level query for ranked candidates.",
            },
          });
        }

        const [verifiedParcelIds, parishZipSet, zipByParcelId] = await Promise.all([
          fetchVerifiedParcelIdsForParish(parishGuard.parish, parcelIds),
          fetchReferenceZipsForParish(parishGuard.parish),
          fetchParcelZipMap(parcelIds),
        ]);
        const tiered = tierParcelRows({
          rows,
          verifiedParcelIds,
          parishZipSet,
          zipByParcelId,
        });
        const features = extractMapFeatures(tiered.verified);

        return JSON.stringify({
          rowCount: tiered.verified.length,
          rows: tiered.verified,
          rows_probable: tiered.probable,
          rows_unknown: tiered.unknown,
          rows_all: tiered.all,
          requestedParish: parishGuard.parish,
          verification: {
            mode: "authoritative_geometry_plus_proxy",
            tieringApplied: true,
            tiers: {
              verified: tiered.verified.length,
              probable: tiered.probable.length,
              unknown: tiered.unknown.length,
            },
            rankingRule: "rank_verified_only",
            authoritativeSources: [...PARISH_REFERENCE_TABLES],
          },
          ...(features.length > 0 ? { [MAP_FEATURES_KEY]: features } : {}),
        });
      }
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
