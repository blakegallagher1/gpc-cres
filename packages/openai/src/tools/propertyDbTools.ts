import { tool } from "@openai/agents";
import { z } from "zod";

/**
 * Property Database — Gateway API tools.
 *
 * Calls the FastAPI gateway at api.gallagherpropco.com for parcel lookup
 * and bbox search. Screening endpoints are not yet available on the gateway.
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

function sanitizeAddress(value: string): string {
  return value.replace(/[''`]/g, "").replace(/\\s+/g, " ").trim();
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
      const rawSearchText = (body.search_text ?? body.p_search_text ?? "") as string;
      const searchText = sanitizeAddress(rawSearchText);
      if (!searchText) return { error: "No search text provided for api_search_parcels." };
      const geo = await geocodeAddress(searchText + ", Louisiana");
      if (!geo) return { error: "Could not geocode address. Ensure GOOGLE_MAPS_API_KEY is set." };
      const OFFSET = 0.005;
      return gatewayPost("/tools/parcel.bbox", {
        west: geo.lng - OFFSET, south: geo.lat - OFFSET,
        east: geo.lng + OFFSET, north: geo.lat + OFFSET,
        ...(body.parish ? { parish: body.parish } : {}),
        ...(body.limit_rows ? { limit: body.limit_rows } : {}),
        ...(body.p_limit_rows ? { limit: body.p_limit_rows } : {}),
        ...(body.limit ? { limit: body.limit } : {}),
      });
    }
    case "api_screen_flood":
    case "api_screen_soils":
    case "api_screen_wetlands":
    case "api_screen_epa":
    case "api_screen_traffic":
    case "api_screen_ldeq":
    case "api_screen_full":
      return { error: `${fnName} screening is not yet available on the gateway.` };
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
  execute: async ({
    search_text: rawSearchText,
    parish: rawParish,
    limit_rows,
  }) => {
    const search_text = sanitizeAddress(rawSearchText);
    const parish = rawParish ? sanitizeAddress(rawParish) : null;

    const result = await rpc("api_search_parcels", {
      search_text: search_text + (parish ? `, ${parish}` : ""),
      ...(parish ? { parish } : {}),
      ...(limit_rows ? { limit_rows } : {}),
    });
    return JSON.stringify(result);
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
    const result = await rpc("api_get_parcel", { parcel_id });
    return JSON.stringify(result);
  },
});

// ---------------------------------------------------------------------------
// 3. Flood Zone Screening (not available on gateway)
// ---------------------------------------------------------------------------
export const screenFlood = tool({
  name: "screen_flood",
  description:
    "Screen a parcel for FEMA flood zone hazards. NOTE: This screening is not yet available on the gateway.",
  parameters: z.object({
    parcel_id: z
      .string()
      .describe("The parcel number"),
  }),
  execute: async ({ parcel_id }) => {
    const result = await rpc("api_screen_flood", { parcel_id });
    return JSON.stringify(result);
  },
});

// ---------------------------------------------------------------------------
// 4. Soils Screening (not available on gateway)
// ---------------------------------------------------------------------------
export const screenSoils = tool({
  name: "screen_soils",
  description:
    "Screen a parcel for USDA soil conditions. NOTE: This screening is not yet available on the gateway.",
  parameters: z.object({
    parcel_id: z
      .string()
      .describe("The parcel number"),
  }),
  execute: async ({ parcel_id }) => {
    const result = await rpc("api_screen_soils", { parcel_id });
    return JSON.stringify(result);
  },
});

// ---------------------------------------------------------------------------
// 5. Wetlands Screening (not available on gateway)
// ---------------------------------------------------------------------------
export const screenWetlands = tool({
  name: "screen_wetlands",
  description:
    "Screen a parcel for NWI wetlands. NOTE: This screening is not yet available on the gateway.",
  parameters: z.object({
    parcel_id: z
      .string()
      .describe("The parcel number"),
  }),
  execute: async ({ parcel_id }) => {
    const result = await rpc("api_screen_wetlands", { parcel_id });
    return JSON.stringify(result);
  },
});

// ---------------------------------------------------------------------------
// 6. EPA Environmental Screening (not available on gateway)
// ---------------------------------------------------------------------------
export const screenEpa = tool({
  name: "screen_epa",
  description:
    "Screen a parcel for EPA-regulated facilities. NOTE: This screening is not yet available on the gateway.",
  parameters: z.object({
    parcel_id: z
      .string()
      .describe("The parcel number"),
    radius_miles: z
      .number()
      .nullable()
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
// 7. Traffic / Access Screening (not available on gateway)
// ---------------------------------------------------------------------------
export const screenTraffic = tool({
  name: "screen_traffic",
  description:
    "Screen a parcel for traffic counts and road access. NOTE: This screening is not yet available on the gateway.",
  parameters: z.object({
    parcel_id: z
      .string()
      .describe("The parcel number"),
    radius_miles: z
      .number()
      .nullable()
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
// 8. LDEQ Screening (not available on gateway)
// ---------------------------------------------------------------------------
export const screenLdeq = tool({
  name: "screen_ldeq",
  description:
    "Screen a parcel for LDEQ permits and regulated sites. NOTE: This screening is not yet available on the gateway.",
  parameters: z.object({
    parcel_id: z
      .string()
      .describe("The parcel number"),
    radius_miles: z
      .number()
      .nullable()
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
// 9. Full Site Screening (not available on gateway)
// ---------------------------------------------------------------------------
export const screenFull = tool({
  name: "screen_full",
  description:
    "Run a comprehensive site screening on a parcel. NOTE: This screening is not yet available on the gateway.",
  parameters: z.object({
    parcel_id: z
      .string()
      .describe("The parcel number"),
  }),
  execute: async ({ parcel_id }) => {
    const result = await rpc("api_screen_full", { parcel_id });
    return JSON.stringify(result);
  },
});
