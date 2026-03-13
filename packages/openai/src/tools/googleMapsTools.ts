import { prisma, type Prisma } from "@entitlement-os/db";
import { tool } from "@openai/agents";
import { z } from "zod";

const GOOGLE_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places";
const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_PLACES_AGGREGATE_URL =
  "https://places.googleapis.com/v1/places:aggregate";
const GOOGLE_FETCH_TIMEOUT_MS = 5_000;
const AREA_SUMMARY_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const POI_DENSITY_TTL_MS = 14 * 24 * 60 * 60 * 1_000;
const DEFAULT_RADIUS_METERS = 1_600;
const DEFAULT_POI_TYPES = [
  "restaurant",
  "gas_station",
  "school",
  "hospital",
  "grocery_store",
  "bank",
] as const;

type Coordinates = {
  latitude: number;
  longitude: number;
};

type AreaSummaryPayload = {
  summary: string | null;
  overview: string | null;
  description: string | null;
  referencedPlaceIds: string[];
  placeId: string | null;
};

type PoiDensitySnapshot = {
  counts: Record<string, number>;
  total: number;
  radiusMeters: number;
};

type PoiDensityLookupResult = {
  snapshot: PoiDensitySnapshot | null;
  cached: boolean;
};

type AddressGeocodeResponse = {
  results?: Array<{
    place_id?: string;
  }>;
};

type AreaSummaryResponse = {
  neighborhoodSummary?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function getGoogleMapsApiKey(): string | null {
  return asTrimmedString(process.env.GOOGLE_MAPS_API_KEY);
}

function roundCoordinate(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

function buildAreaSummaryCacheKey(input: {
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
}): string {
  if (input.placeId) {
    return `place:${input.placeId}`;
  }

  return `coords:${roundCoordinate(input.latitude ?? 0, 5)},${roundCoordinate(input.longitude ?? 0, 5)}`;
}

function buildPoiDensityCacheKey(input: {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  placeTypes: string[];
}): string {
  const latKey = roundCoordinate(input.latitude, 3);
  const lngKey = roundCoordinate(input.longitude, 3);
  const normalizedTypes = [...input.placeTypes].sort();
  return `lat:${latKey}|lng:${lngKey}|radius:${input.radiusMeters}|types:${normalizedTypes.join(",")}`;
}

function normalizePlaceTypes(placeTypes: string[] | null): string[] {
  const source =
    placeTypes && placeTypes.length > 0 ? placeTypes : [...DEFAULT_POI_TYPES];

  return [
    ...new Set(source.map((value) => value.trim()).filter(Boolean)),
  ];
}

function extractText(value: unknown): string | null {
  const direct = asTrimmedString(value);
  if (direct) {
    return direct;
  }

  if (!isRecord(value)) {
    return null;
  }

  const candidates = [
    value.text,
    value.content,
    value.value,
    value.summary,
    value.plainText,
  ];
  for (const candidate of candidates) {
    const extracted = asTrimmedString(candidate);
    if (extracted) {
      return extracted;
    }
  }

  if (Array.isArray(value.parts)) {
    const combined = value.parts
      .map((part) => extractText(part))
      .filter((part): part is string => Boolean(part))
      .join(" ")
      .trim();

    return combined.length > 0 ? combined : null;
  }

  return null;
}

function collectReferencedPlaceIds(
  value: unknown,
  seen = new Set<string>(),
): string[] {
  if (typeof value === "string") {
    const resourceMatch = value.match(/^places\/(.+)$/);
    if (resourceMatch?.[1]) {
      seen.add(resourceMatch[1]);
    }
    return [...seen];
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectReferencedPlaceIds(entry, seen);
    }
    return [...seen];
  }

  if (!isRecord(value)) {
    return [...seen];
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key.toLowerCase().includes("placeid")) {
      const extracted = asTrimmedString(nestedValue);
      if (extracted) {
        seen.add(extracted);
      }
      continue;
    }

    collectReferencedPlaceIds(nestedValue, seen);
  }

  return [...seen];
}

function parseAreaSummaryPayload(
  rawResponse: unknown,
  resolvedPlaceId: string | null,
): AreaSummaryPayload {
  const neighborhoodSummary =
    isRecord(rawResponse) && isRecord(rawResponse.neighborhoodSummary)
      ? rawResponse.neighborhoodSummary
      : null;

  const overview = extractText(neighborhoodSummary?.overview ?? null);
  const description = extractText(neighborhoodSummary?.description ?? null);
  const summary =
    [overview, description]
      .filter((value): value is string => Boolean(value))
      .join("\n\n") || null;
  const referencedPlaceIds = collectReferencedPlaceIds(neighborhoodSummary ?? {});

  if (resolvedPlaceId && !referencedPlaceIds.includes(resolvedPlaceId)) {
    referencedPlaceIds.unshift(resolvedPlaceId);
  }

  return {
    summary,
    overview,
    description,
    referencedPlaceIds,
    placeId: resolvedPlaceId,
  };
}

function parsePoiAggregateCounts(
  rawResponse: unknown,
  placeTypes: string[],
): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(
    placeTypes.map((placeType) => [placeType, 0]),
  );

  if (!isRecord(rawResponse)) {
    return counts;
  }

  const directCounts = isRecord(rawResponse.countsByType)
    ? rawResponse.countsByType
    : null;
  if (directCounts) {
    for (const [placeType, value] of Object.entries(directCounts)) {
      const parsed = asNumber(value);
      if (parsed !== null) {
        counts[placeType] = parsed;
      }
    }
    return counts;
  }

  const arrayCandidates = [
    rawResponse.placeTypeCounts,
    rawResponse.counts,
    rawResponse.aggregateCounts,
    isRecord(rawResponse.result) ? rawResponse.result.placeTypeCounts : null,
    isRecord(rawResponse.result) ? rawResponse.result.counts : null,
  ];

  for (const candidate of arrayCandidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    for (const entry of candidate) {
      if (!isRecord(entry)) {
        continue;
      }

      const placeType =
        asTrimmedString(entry.placeType) ??
        asTrimmedString(entry.type) ??
        asTrimmedString(entry.name);
      const count =
        asNumber(entry.count) ??
        asNumber(entry.placeCount) ??
        asNumber(entry.value);

      if (placeType && count !== null) {
        counts[placeType] = count;
      }
    }

    return counts;
  }

  return counts;
}

function parsePoiAggregateSnapshot(
  rawResponse: unknown,
  placeTypes: string[],
  radiusMeters: number,
): PoiDensitySnapshot {
  const counts = parsePoiAggregateCounts(rawResponse, placeTypes);
  const explicitTotal =
    isRecord(rawResponse)
      ? asNumber(rawResponse.total) ??
        asNumber(rawResponse.totalCount) ??
        (isRecord(rawResponse.result)
          ? asNumber(rawResponse.result.total) ??
            asNumber(rawResponse.result.totalCount)
          : null)
      : null;

  return {
    counts,
    total:
      explicitTotal ??
      Object.values(counts).reduce((sum, count) => sum + count, 0),
    radiusMeters,
  };
}

async function resolvePlaceIdFromCoordinates(
  latitude: number,
  longitude: number,
  apiKey: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    latlng: `${latitude},${longitude}`,
    key: apiKey,
  });

  try {
    const response = await fetch(`${GOOGLE_GEOCODE_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(GOOGLE_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as AddressGeocodeResponse;
    return asTrimmedString(payload.results?.[0]?.place_id);
  } catch {
    return null;
  }
}

async function fetchNeighborhoodSummary(
  placeId: string,
  apiKey: string,
): Promise<{ payload: AreaSummaryPayload; rawResponse: unknown } | null> {
  try {
    const response = await fetch(
      `${GOOGLE_PLACE_DETAILS_URL}/${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "neighborhoodSummary",
        },
        signal: AbortSignal.timeout(GOOGLE_FETCH_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      return null;
    }

    const rawResponse = (await response.json()) as AreaSummaryResponse;
    return {
      payload: parseAreaSummaryPayload(rawResponse, placeId),
      rawResponse,
    };
  } catch {
    return null;
  }
}

async function fetchPoiDensitySnapshot(
  center: Coordinates,
  radiusMeters: number,
  placeTypes: string[],
  apiKey: string,
): Promise<{ snapshot: PoiDensitySnapshot; rawResponse: unknown } | null> {
  try {
    const response = await fetch(GOOGLE_PLACES_AGGREGATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify({
        placeTypes,
        locationRestriction: {
          circle: {
            center,
            radius: radiusMeters,
          },
        },
        operatingStatus: "OPERATING_STATUS_OPERATIONAL",
      }),
      signal: AbortSignal.timeout(GOOGLE_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const rawResponse = (await response.json()) as unknown;
    return {
      snapshot: parsePoiAggregateSnapshot(rawResponse, placeTypes, radiusMeters),
      rawResponse,
    };
  } catch {
    return null;
  }
}

async function readAreaSummaryCache(
  orgId: string,
  cacheKey: string,
): Promise<AreaSummaryPayload | null> {
  const cached = await prisma.areaSummaryCache.findUnique({
    where: {
      orgId_cacheKey: {
        orgId,
        cacheKey,
      },
    },
    select: {
      expiresAt: true,
      summaryJson: true,
    },
  });

  if (!cached || cached.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return isRecord(cached.summaryJson)
    ? (cached.summaryJson as unknown as AreaSummaryPayload)
    : null;
}

async function writeAreaSummaryCacheEntry(input: {
  orgId: string;
  cacheKey: string;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
  payload: AreaSummaryPayload;
  rawResponse: unknown;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + AREA_SUMMARY_TTL_MS);

  await prisma.areaSummaryCache.upsert({
    where: {
      orgId_cacheKey: {
        orgId: input.orgId,
        cacheKey: input.cacheKey,
      },
    },
    create: {
      orgId: input.orgId,
      cacheKey: input.cacheKey,
      placeId: input.placeId,
      lat: input.latitude,
      lng: input.longitude,
      radiusMeters: 0,
      summaryJson: toJson(input.payload),
      sourcePayloadJson: toJson(input.rawResponse),
      expiresAt,
    },
    update: {
      placeId: input.placeId,
      lat: input.latitude,
      lng: input.longitude,
      radiusMeters: 0,
      summaryJson: toJson(input.payload),
      sourcePayloadJson: toJson(input.rawResponse),
      expiresAt,
    },
  });
}

async function writeAreaSummaryCache(input: {
  orgId: string;
  inputPlaceId: string | null;
  resolvedPlaceId: string | null;
  latitude: number | null;
  longitude: number | null;
  payload: AreaSummaryPayload;
  rawResponse: unknown;
}): Promise<void> {
  const cacheKeys = new Set<string>([
    buildAreaSummaryCacheKey({
      placeId: input.inputPlaceId,
      latitude: input.latitude,
      longitude: input.longitude,
    }),
  ]);

  if (input.resolvedPlaceId) {
    cacheKeys.add(
      buildAreaSummaryCacheKey({
        placeId: input.resolvedPlaceId,
        latitude: null,
        longitude: null,
      }),
    );
  }

  for (const cacheKey of cacheKeys) {
    await writeAreaSummaryCacheEntry({
      orgId: input.orgId,
      cacheKey,
      placeId: input.resolvedPlaceId,
      latitude: input.latitude,
      longitude: input.longitude,
      payload: input.payload,
      rawResponse: input.rawResponse,
    });
  }
}

async function readPoiDensityCache(
  orgId: string,
  cacheKey: string,
): Promise<PoiDensitySnapshot | null> {
  const cached = await prisma.pOIDensityCache.findUnique({
    where: {
      orgId_cacheKey: {
        orgId,
        cacheKey,
      },
    },
    select: {
      expiresAt: true,
      resultJson: true,
      radiusMeters: true,
    },
  });

  if (!cached || cached.expiresAt.getTime() < Date.now()) {
    return null;
  }

  const resultJson = isRecord(cached.resultJson) ? cached.resultJson : null;
  const countsRecord = resultJson && isRecord(resultJson.counts)
    ? resultJson.counts
    : {};
  const counts = Object.fromEntries(
    Object.entries(countsRecord)
      .map(([key, value]) => [key, asNumber(value) ?? 0])
      .filter((entry): entry is [string, number] => Number.isFinite(entry[1])),
  );

  return {
    counts,
    total: asNumber(resultJson?.total) ?? 0,
    radiusMeters: asNumber(resultJson?.radiusMeters) ?? cached.radiusMeters,
  };
}

async function writePoiDensityCache(input: {
  orgId: string;
  cacheKey: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  placeTypes: string[];
  snapshot: PoiDensitySnapshot;
  rawResponse: unknown;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + POI_DENSITY_TTL_MS);

  await prisma.pOIDensityCache.upsert({
    where: {
      orgId_cacheKey: {
        orgId: input.orgId,
        cacheKey: input.cacheKey,
      },
    },
    create: {
      orgId: input.orgId,
      cacheKey: input.cacheKey,
      lat: input.latitude,
      lng: input.longitude,
      radiusMeters: input.radiusMeters,
      poiTypes: input.placeTypes,
      densityScore: input.snapshot.total,
      resultJson: toJson(input.snapshot),
      sourcePayloadJson: toJson(input.rawResponse),
      expiresAt,
    },
    update: {
      lat: input.latitude,
      lng: input.longitude,
      radiusMeters: input.radiusMeters,
      poiTypes: input.placeTypes,
      densityScore: input.snapshot.total,
      resultJson: toJson(input.snapshot),
      sourcePayloadJson: toJson(input.rawResponse),
      expiresAt,
    },
  });
}

export async function lookupPoiDensitySnapshot(input: {
  orgId: string;
  latitude: number;
  longitude: number;
  radiusMeters?: number | null;
  placeTypes?: string[] | null;
}): Promise<PoiDensityLookupResult> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return { snapshot: null, cached: false };
  }

  const radiusMeters = Math.max(
    100,
    Math.round(input.radiusMeters ?? DEFAULT_RADIUS_METERS),
  );
  const placeTypes = normalizePlaceTypes(input.placeTypes ?? null);
  const cacheKey = buildPoiDensityCacheKey({
    latitude: input.latitude,
    longitude: input.longitude,
    radiusMeters,
    placeTypes,
  });

  const cached = await readPoiDensityCache(input.orgId, cacheKey);
  if (cached) {
    return { snapshot: cached, cached: true };
  }

  const liveResult = await fetchPoiDensitySnapshot(
    { latitude: input.latitude, longitude: input.longitude },
    radiusMeters,
    placeTypes,
    apiKey,
  );

  if (!liveResult) {
    return { snapshot: null, cached: false };
  }

  await writePoiDensityCache({
    orgId: input.orgId,
    cacheKey,
    latitude: input.latitude,
    longitude: input.longitude,
    radiusMeters,
    placeTypes,
    snapshot: liveResult.snapshot,
    rawResponse: liveResult.rawResponse,
  });

  return { snapshot: liveResult.snapshot, cached: false };
}

export const get_area_summary = tool({
  name: "get_area_summary",
  description:
    "Fetch a Google Maps neighborhood summary for a place, cache it in Postgres, and return summary text for screening and market intelligence.",
  parameters: z.object({
    placeId: z
      .string()
      .nullable()
      .describe(
        "Google Place ID for the location to summarize. Pass null to use latitude/longitude fallback.",
      ),
    latitude: z.number().nullable().describe("Latitude fallback if no placeId"),
    longitude: z
      .number()
      .nullable()
      .describe("Longitude fallback if no placeId"),
    orgId: z.string().describe("Organization ID for cache scoping"),
  }),
  execute: async ({ placeId, latitude, longitude, orgId }) => {
    if (!placeId && (latitude === null || longitude === null)) {
      return JSON.stringify({
        summary: null,
        overview: null,
        description: null,
        referencedPlaceIds: [],
        placeId: null,
        cached: false,
        error: "placeId or latitude/longitude required",
      });
    }

    const primaryCacheKey = buildAreaSummaryCacheKey({
      placeId,
      latitude,
      longitude,
    });
    const cached = await readAreaSummaryCache(orgId, primaryCacheKey);
    if (cached) {
      return JSON.stringify({
        ...cached,
        cached: true,
        error: null,
      });
    }

    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      return JSON.stringify({
        summary: null,
        overview: null,
        description: null,
        referencedPlaceIds: [],
        placeId: placeId ?? null,
        cached: false,
        error: "Google Maps API unavailable",
      });
    }

    const resolvedPlaceId =
      placeId ??
      (latitude !== null && longitude !== null
        ? await resolvePlaceIdFromCoordinates(latitude, longitude, apiKey)
        : null);

    if (!resolvedPlaceId) {
      return JSON.stringify({
        summary: null,
        overview: null,
        description: null,
        referencedPlaceIds: [],
        placeId: null,
        cached: false,
        error: "Google Maps API unavailable",
      });
    }

    if (!placeId) {
      const resolvedCache = await readAreaSummaryCache(
        orgId,
        buildAreaSummaryCacheKey({
          placeId: resolvedPlaceId,
          latitude: null,
          longitude: null,
        }),
      );
      if (resolvedCache) {
        return JSON.stringify({
          ...resolvedCache,
          cached: true,
          error: null,
        });
      }
    }

    const liveResult = await fetchNeighborhoodSummary(resolvedPlaceId, apiKey);
    if (!liveResult) {
      return JSON.stringify({
        summary: null,
        overview: null,
        description: null,
        referencedPlaceIds: [],
        placeId: resolvedPlaceId,
        cached: false,
        error: "Google Maps API unavailable",
      });
    }

    await writeAreaSummaryCache({
      orgId,
      inputPlaceId: placeId ?? null,
      resolvedPlaceId,
      latitude,
      longitude,
      payload: liveResult.payload,
      rawResponse: liveResult.rawResponse,
    });

    return JSON.stringify({
      ...liveResult.payload,
      cached: false,
      error: null,
    });
  },
});

export const get_poi_density = tool({
  name: "get_poi_density",
  description:
    "Count POI density around a coordinate using Google Places aggregate counts, cache the result in Postgres, and return counts for screening enrichment.",
  parameters: z.object({
    latitude: z.number().describe("Center latitude"),
    longitude: z.number().describe("Center longitude"),
    radiusMeters: z
      .number()
      .nullable()
      .describe("Search radius in meters (default 1600 = about 1 mile)"),
    placeTypes: z
      .array(z.string())
      .nullable()
      .describe(
        "Place types to count, e.g. ['restaurant', 'gas_station', 'school']",
      ),
    orgId: z.string().describe("Organization ID"),
  }),
  execute: async ({ latitude, longitude, radiusMeters, placeTypes, orgId }) => {
    const result = await lookupPoiDensitySnapshot({
      orgId,
      latitude,
      longitude,
      radiusMeters,
      placeTypes,
    });

    if (!result.snapshot) {
      return JSON.stringify({
        counts: {},
        total: 0,
        radiusMeters: Math.max(
          100,
          Math.round(radiusMeters ?? DEFAULT_RADIUS_METERS),
        ),
        cached: false,
        error: "Google Maps API unavailable",
      });
    }

    return JSON.stringify({
      ...result.snapshot,
      cached: result.cached,
      error: null,
    });
  },
});
