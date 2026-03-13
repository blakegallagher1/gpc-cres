import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  areaSummaryFindUniqueMock,
  areaSummaryUpsertMock,
  poiDensityFindUniqueMock,
  poiDensityUpsertMock,
} = vi.hoisted(() => ({
  areaSummaryFindUniqueMock: vi.fn(),
  areaSummaryUpsertMock: vi.fn(),
  poiDensityFindUniqueMock: vi.fn(),
  poiDensityUpsertMock: vi.fn(),
}));

vi.mock("@openai/agents", () => ({
  tool: <T extends object>(definition: T) => definition,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    areaSummaryCache: {
      findUnique: areaSummaryFindUniqueMock,
      upsert: areaSummaryUpsertMock,
    },
    pOIDensityCache: {
      findUnique: poiDensityFindUniqueMock,
      upsert: poiDensityUpsertMock,
    },
  },
}));

import {
  get_area_summary,
  get_poi_density,
  lookupPoiDensitySnapshot,
} from "./googleMapsTools.js";

const getAreaSummaryExecute = (
  get_area_summary as unknown as {
    execute: (input: {
      placeId: string | null;
      latitude: number | null;
      longitude: number | null;
      orgId: string;
    }) => Promise<string>;
  }
).execute;

const getPoiDensityExecute = (
  get_poi_density as unknown as {
    execute: (input: {
      orgId: string;
      latitude: number;
      longitude: number;
      radiusMeters: number | null;
      placeTypes: string[] | null;
    }) => Promise<string>;
  }
).execute;

function makeJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("googleMapsTools", () => {
  const originalGoogleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    areaSummaryFindUniqueMock.mockReset();
    areaSummaryUpsertMock.mockReset();
    poiDensityFindUniqueMock.mockReset();
    poiDensityUpsertMock.mockReset();
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalGoogleMapsApiKey === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = originalGoogleMapsApiKey;
    }
  });

  it("returns a fresh cached area summary before attempting live Google fetches", async () => {
    areaSummaryFindUniqueMock.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      summaryJson: {
        summary: "Cached Baton Rouge summary",
        overview: "Cached overview",
        description: "Cached description",
        referencedPlaceIds: ["place-1"],
        placeId: "place-1",
      },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = JSON.parse(
      await getAreaSummaryExecute({
        placeId: "place-1",
        latitude: null,
        longitude: null,
        orgId: "org-1",
      }),
    ) as Record<string, unknown>;

    expect(result).toEqual({
      summary: "Cached Baton Rouge summary",
      overview: "Cached overview",
      description: "Cached description",
      referencedPlaceIds: ["place-1"],
      placeId: "place-1",
      cached: true,
      error: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(areaSummaryFindUniqueMock).toHaveBeenCalledTimes(1);
    expect(areaSummaryUpsertMock).not.toHaveBeenCalled();
  });

  it("resolves a place id from coordinates, fetches neighborhood summary, and writes through cache", async () => {
    areaSummaryFindUniqueMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeJsonResponse({
          results: [{ place_id: "resolved-place-1" }],
        }),
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          neighborhoodSummary: {
            overview: {
              text: "Warehouse district with improving access.",
            },
            description: {
              text: "Industrial infill pocket near major corridors.",
            },
            nearbyPlaces: [{ placeId: "nearby-place-1" }],
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = JSON.parse(
      await getAreaSummaryExecute({
        placeId: null,
        latitude: 30.45,
        longitude: -91.15,
        orgId: "org-1",
      }),
    ) as Record<string, unknown>;

    expect(result).toEqual({
      summary:
        "Warehouse district with improving access.\n\nIndustrial infill pocket near major corridors.",
      overview: "Warehouse district with improving access.",
      description: "Industrial infill pocket near major corridors.",
      referencedPlaceIds: ["resolved-place-1", "nearby-place-1"],
      placeId: "resolved-place-1",
      cached: false,
      error: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "maps.googleapis.com/maps/api/geocode/json",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "places.googleapis.com/v1/places/resolved-place-1",
    );
    expect(areaSummaryUpsertMock).toHaveBeenCalledTimes(2);
  });

  it("returns graceful area summary degradation when Google is unavailable", async () => {
    areaSummaryFindUniqueMock.mockResolvedValue(null);
    delete process.env.GOOGLE_MAPS_API_KEY;

    const result = JSON.parse(
      await getAreaSummaryExecute({
        placeId: "place-1",
        latitude: null,
        longitude: null,
        orgId: "org-1",
      }),
    ) as Record<string, unknown>;

    expect(result).toEqual({
      summary: null,
      overview: null,
      description: null,
      referencedPlaceIds: [],
      placeId: "place-1",
      cached: false,
      error: "Google Maps API unavailable",
    });
    expect(areaSummaryUpsertMock).not.toHaveBeenCalled();
  });

  it("returns cached POI density when the Postgres snapshot is still fresh", async () => {
    poiDensityFindUniqueMock.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      radiusMeters: 1600,
      resultJson: {
        counts: {
          restaurant: 4,
          gas_station: 2,
        },
        total: 6,
        radiusMeters: 1600,
      },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupPoiDensitySnapshot({
      orgId: "org-1",
      latitude: 30.45,
      longitude: -91.15,
      radiusMeters: 1600,
      placeTypes: ["restaurant", "gas_station"],
    });

    expect(result).toEqual({
      snapshot: {
        counts: {
          restaurant: 4,
          gas_station: 2,
        },
        total: 6,
        radiusMeters: 1600,
      },
      cached: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(poiDensityUpsertMock).not.toHaveBeenCalled();
  });

  it("fetches live aggregate POI counts and persists them on cache miss", async () => {
    poiDensityFindUniqueMock.mockResolvedValue(null);

    const fetchMock = vi.fn().mockResolvedValue(
      makeJsonResponse({
        placeTypeCounts: [
          { placeType: "restaurant", count: 9 },
          { placeType: "gas_station", count: 3 },
          { placeType: "school", count: 2 },
        ],
        totalCount: 14,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = JSON.parse(
      await getPoiDensityExecute({
        orgId: "org-1",
        latitude: 30.45,
        longitude: -91.15,
        radiusMeters: 1600,
        placeTypes: ["restaurant", "gas_station", "school"],
      }),
    ) as Record<string, unknown>;

    expect(result).toEqual({
      counts: {
        restaurant: 9,
        gas_station: 3,
        school: 2,
      },
      total: 14,
      radiusMeters: 1600,
      cached: false,
      error: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://places.googleapis.com/v1/places:aggregate",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        "X-Goog-Api-Key": "test-google-key",
      }),
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      placeTypes: ["restaurant", "gas_station", "school"],
      locationRestriction: {
        circle: {
          center: {
            latitude: 30.45,
            longitude: -91.15,
          },
          radius: 1600,
        },
      },
      operatingStatus: "OPERATING_STATUS_OPERATIONAL",
    });
    expect(poiDensityUpsertMock).toHaveBeenCalledTimes(1);
  });

  it("returns graceful POI density degradation when aggregate fetch fails", async () => {
    poiDensityFindUniqueMock.mockResolvedValue(null);

    const fetchMock = vi.fn().mockRejectedValue(new Error("upstream unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    const result = JSON.parse(
      await getPoiDensityExecute({
        orgId: "org-1",
        latitude: 30.45,
        longitude: -91.15,
        radiusMeters: null,
        placeTypes: null,
      }),
    ) as Record<string, unknown>;

    expect(result).toEqual({
      counts: {},
      total: 0,
      radiusMeters: 1600,
      cached: false,
      error: "Google Maps API unavailable",
    });
    expect(poiDensityUpsertMock).not.toHaveBeenCalled();
  });
});
