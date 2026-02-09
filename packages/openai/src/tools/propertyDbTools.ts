import { tool } from "@openai/agents";
import { z } from "zod";

/**
 * Louisiana Property Database — Supabase REST API tools.
 *
 * Connects to a separate Supabase project (jueyosscalcljgdorrpy)
 * containing 560K parcels across 5 Louisiana parishes with
 * flood, soils, wetlands, EPA, traffic, and LDEQ screening data.
 *
 * Env vars (optional overrides):
 *   LA_PROPERTY_DB_URL  — Supabase project URL
 *   LA_PROPERTY_DB_KEY  — Service-role API key
 */

const PROPERTY_DB_URL =
  process.env.LA_PROPERTY_DB_URL ?? "https://jueyosscalcljgdorrpy.supabase.co";
const PROPERTY_DB_KEY =
  process.env.LA_PROPERTY_DB_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1ZXlvc3NjYWxjbGpnZG9ycnB5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDM1MjU3NywiZXhwIjoyMDg1OTI4NTc3fQ.4ZsbLoYxhWGJfu20TyLtrCDLtx-VdeHcQEmaffekJVI";

/** Call a Supabase RPC endpoint and return the JSON body. */
export async function rpc(fnName: string, body: Record<string, unknown>): Promise<unknown> {
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

  if (!res.ok) {
    const text = await res.text();
    return { error: `Property DB error (${res.status}): ${text}` };
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// 1. Search Parcels
// ---------------------------------------------------------------------------
export const searchParcels = tool({
  name: "search_parcels",
  description:
    "Search the Louisiana Property Database (560K parcels across 5 parishes) by address, owner name, or parcel number. Returns matching parcels with address, owner, acreage, and coordinates.",
  parameters: z.object({
    search_text: z
      .string()
      .min(1)
      .describe(
        "Search term: street address, owner name, or parcel number (e.g. '12345 Airline Hwy', 'Gallagher', '05-1234')",
      ),
    parish: z
      .string()
      .nullable()
      .describe(
        "Filter by parish name (e.g. 'East Baton Rouge', 'Ascension', 'Livingston', 'West Baton Rouge', 'Iberville')",
      ),
    limit_rows: z
      .number()
      .int()
      .min(1)
      .max(50)
      .nullable()
      .describe("Max results to return (default 25)"),
  }),
  execute: async ({ search_text, parish, limit_rows }) => {
    // Normalize: strip apostrophes/smart quotes and collapse whitespace
    const normalized = search_text
      .replace(/[''`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const result = await rpc("api_search_parcels", {
      search_text: normalized,
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
    "Get full details for a specific parcel by its UUID. Returns owner info, legal description, acreage, coordinates, and data source. Use search_parcels first to find the parcel ID.",
  parameters: z.object({
    parcel_id: z
      .string()
      .uuid()
      .describe("The parcel UUID from the property database (returned by search_parcels)"),
  }),
  execute: async ({ parcel_id }) => {
    const result = await rpc("api_get_parcel", { parcel_id });
    return JSON.stringify(result);
  },
});

// ---------------------------------------------------------------------------
// 3. Flood Zone Screening
// ---------------------------------------------------------------------------
export const screenFlood = tool({
  name: "screen_flood",
  description:
    "Screen a parcel for FEMA flood zone hazards using real spatial overlay. Returns flood zone designation (A, AE, X, etc.), overlap percentage, whether the parcel is in a Special Flood Hazard Area (SFHA), and flood insurance implications.",
  parameters: z.object({
    parcel_id: z
      .string()
      .uuid()
      .describe("The parcel UUID from the property database"),
  }),
  execute: async ({ parcel_id }) => {
    const result = await rpc("api_screen_flood", { parcel_id });
    return JSON.stringify(result);
  },
});

// ---------------------------------------------------------------------------
// 4. Soils Screening
// ---------------------------------------------------------------------------
export const screenSoils = tool({
  name: "screen_soils",
  description:
    "Screen a parcel for USDA soil conditions using real spatial overlay. Returns soil types, drainage class, hydric rating, shrink-swell potential, and development suitability.",
  parameters: z.object({
    parcel_id: z
      .string()
      .uuid()
      .describe("The parcel UUID from the property database"),
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
    "Screen a parcel for NWI (National Wetlands Inventory) wetlands using real spatial overlay. Returns wetland types, overlap percentage, and USACE 404 permit implications.",
  parameters: z.object({
    parcel_id: z
      .string()
      .uuid()
      .describe("The parcel UUID from the property database"),
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
    "Screen a parcel for EPA-regulated facilities within a radius. Returns Superfund, RCRA, brownfield, and TRI sites with distance, violation history, and penalties.",
  parameters: z.object({
    parcel_id: z
      .string()
      .uuid()
      .describe("The parcel UUID from the property database"),
    radius_miles: z
      .number()
      .nullable()
      .describe("Search radius in miles from parcel centroid (default 1.0)"),
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
    "Screen a parcel for traffic counts and road access. Returns nearby road segments with AADT (average annual daily traffic), truck percentage, road name, and distance from parcel.",
  parameters: z.object({
    parcel_id: z
      .string()
      .uuid()
      .describe("The parcel UUID from the property database"),
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
// 8. LDEQ (Louisiana Dept of Environmental Quality) Screening
// ---------------------------------------------------------------------------
export const screenLdeq = tool({
  name: "screen_ldeq",
  description:
    "Screen a parcel for LDEQ (Louisiana Department of Environmental Quality) permits and regulated sites within a radius. Returns active permits, facility names, permit types, and distances.",
  parameters: z.object({
    parcel_id: z
      .string()
      .uuid()
      .describe("The parcel UUID from the property database"),
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
// 9. Full Site Screening (all-in-one)
// ---------------------------------------------------------------------------
export const screenFull = tool({
  name: "screen_full",
  description:
    "Run a comprehensive site screening on a parcel — combines flood zones, soils, wetlands, EPA facilities, traffic counts, and LDEQ permits into a single report. Best for initial due diligence on a new parcel.",
  parameters: z.object({
    parcel_id: z
      .string()
      .uuid()
      .describe("The parcel UUID from the property database"),
  }),
  execute: async ({ parcel_id }) => {
    const result = await rpc("api_screen_full", { parcel_id });
    return JSON.stringify(result);
  },
});
