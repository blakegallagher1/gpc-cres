import { tool } from "@openai/agents";
import { z } from "zod";

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

/** Call a gateway POST endpoint and return the JSON body. */
export async function gatewayPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const GATEWAY_URL = getGatewayUrl();
  const GATEWAY_KEY = getGatewayKey();
  let lastError: string | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${GATEWAY_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GATEWAY_KEY}`,
          "Content-Type": "application/json",
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
      if (!searchText) return { error: "No search text provided for api_search_parcels." };
      const geo = await geocodeAddress(searchText + ", Louisiana");
      if (!geo) return { error: "Could not geocode address. Ensure GOOGLE_MAPS_API_KEY is set." };
      const OFFSET = 0.005;
      return gatewayPost("/tools/parcel.bbox", {
        west: geo.lng - OFFSET, south: geo.lat - OFFSET,
        east: geo.lng + OFFSET, north: geo.lat + OFFSET,
        limit: (body.limit_rows ?? body.p_limit_rows ?? 10) as number,
      });
    }
    case "api_screen_zoning":
      return gatewayPost("/api/screening/zoning", { parcelId: body.parcel_id ?? body.p_parcel_id });
    case "api_screen_flood":
      return gatewayPost("/api/screening/flood", { parcelId: body.parcel_id ?? body.p_parcel_id });
    case "api_screen_soils":
      return gatewayPost("/api/screening/soils", { parcelId: body.parcel_id ?? body.p_parcel_id });
    case "api_screen_wetlands":
      return gatewayPost("/api/screening/wetlands", { parcelId: body.parcel_id ?? body.p_parcel_id });
    case "api_screen_epa":
      return gatewayPost("/api/screening/epa", { parcelId: body.parcel_id ?? body.p_parcel_id, radiusMiles: body.radius_miles ?? 1.0 });
    case "api_screen_traffic":
      return gatewayPost("/api/screening/traffic", { parcelId: body.parcel_id ?? body.p_parcel_id, radiusMiles: body.radius_miles ?? 0.5 });
    case "api_screen_ldeq":
      return gatewayPost("/api/screening/ldeq", { parcelId: body.parcel_id ?? body.p_parcel_id, radiusMiles: body.radius_miles ?? 1.0 });
    case "api_screen_full":
      return gatewayPost("/api/screening/full", { parcelId: body.parcel_id ?? body.p_parcel_id });
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
  return geocodeNominatim(address);
}

// ---------------------------------------------------------------------------
// 1. Search Parcels — geocode address then bbox search on gateway
// ---------------------------------------------------------------------------
export const searchParcels = tool({
  name: "search_parcels",
  description:
    "Search for parcels by address. Geocodes the address to coordinates, then searches the Louisiana Property Database for parcels near that location. Returns parcel numbers, owners, addresses, and areas. For a known parcel number, use get_parcel_details instead.",
  parameters: z.object({
    search_text: z
      .string()
      .min(1)
      .describe("Street address to search for (e.g. '222 St Louis St, Baton Rouge, LA')"),
    parish: z
      .string()
      .nullable()
      .describe("Parish name to append to the search for better geocoding accuracy (e.g. 'East Baton Rouge')"),
    limit_rows: z
      .number()
      .int()
      .min(1)
      .max(50)
      .nullable()
      .describe("Max parcels to return (default 10)"),
  }),
  execute: async ({ search_text, parish, limit_rows }) => {
    // Build geocoding query — append parish/state for accuracy
    let query = search_text;
    if (parish) {
      query += `, ${parish} Parish`;
    }
    if (!/louisiana|LA\b/i.test(query)) {
      query += ", Louisiana";
    }

    const geo = await geocodeAddress(query);
    if (!geo) {
      return JSON.stringify({
        error: "Could not geocode the address. Make sure GOOGLE_MAPS_API_KEY is set, or use get_parcel_details with a known parcel number (e.g. '001-5096-7').",
        search_text,
      });
    }

    // Create a ~500m bbox around the geocoded point
    const OFFSET = 0.005; // ~500m at Louisiana latitudes
    const bbox = {
      west: geo.lng - OFFSET,
      south: geo.lat - OFFSET,
      east: geo.lng + OFFSET,
      north: geo.lat + OFFSET,
      limit: limit_rows ?? 10,
    };

    const result = await gatewayPost("/tools/parcel.bbox", bbox);

    return JSON.stringify({
      geocoded_location: geo,
      search_text,
      ...(typeof result === "object" && result !== null ? result as Record<string, unknown> : { data: result }),
    });
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
      .describe("The parcel number (e.g. '001-5096-7')"),
  }),
  execute: async ({ parcel_id }) => {
    const result = await gatewayPost("/tools/parcel.lookup", { parcel_id });
    return JSON.stringify(result);
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
    const result = await gatewayPost("/api/screening/zoning", { parcelId: parcel_id });
    return JSON.stringify(result);
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
    const result = await gatewayPost("/api/screening/flood", { parcelId: parcel_id });
    return JSON.stringify(result);
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
    const result = await gatewayPost("/api/screening/soils", { parcelId: parcel_id });
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
    const result = await gatewayPost("/api/screening/wetlands", { parcelId: parcel_id });
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
      .nullable()
      .describe("Search radius in miles (default 1.0)"),
  }),
  execute: async ({ parcel_id, radius_miles }) => {
    const result = await gatewayPost("/api/screening/epa", {
      parcelId: parcel_id,
      radiusMiles: radius_miles ?? 1.0,
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
      .nullable()
      .describe("Search radius in miles (default 0.5)"),
  }),
  execute: async ({ parcel_id, radius_miles }) => {
    const result = await gatewayPost("/api/screening/traffic", {
      parcelId: parcel_id,
      radiusMiles: radius_miles ?? 0.5,
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
      .nullable()
      .describe("Search radius in miles (default 1.0)"),
  }),
  execute: async ({ parcel_id, radius_miles }) => {
    const result = await gatewayPost("/api/screening/ldeq", {
      parcelId: parcel_id,
      radiusMiles: radius_miles ?? 1.0,
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
    const result = await gatewayPost("/api/screening/full", { parcelId: parcel_id });
    return JSON.stringify(result);
  },
});
