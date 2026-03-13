import { beforeEach, describe, expect, it, vi } from "vitest";

const { lookupPoiDensitySnapshotMock } = vi.hoisted(() => ({
  lookupPoiDensitySnapshotMock: vi.fn(),
}));

vi.mock("@openai/agents", () => ({
  tool: <T extends object>(definition: T) => definition,
}));

vi.mock("./googleMapsTools.js", () => ({
  lookupPoiDensitySnapshot: lookupPoiDensitySnapshotMock,
}));

import { parcelTriageScore, scorePOIDensity } from "./scoringTools.js";

const parcelTriageScoreExecute = (
  parcelTriageScore as unknown as {
    execute: (
      input: {
        dealId: string;
        address: string;
        currentZoning: string | null;
        acreage: number | null;
        latitude?: number | null;
        longitude?: number | null;
        proposedUse: "SMALL_BAY_FLEX" | "OUTDOOR_STORAGE" | "TRUCK_PARKING";
        floodZone: string | null;
        futureLandUse: string | null;
        utilitiesAvailable: boolean | null;
        frontageRoad: string | null;
        adjacentUses: string | null;
      },
      context?: unknown,
    ) => Promise<string>;
  }
).execute;

describe("scorePOIDensity", () => {
  it("scores the configured total-density bands and service bonus", () => {
    expect(scorePOIDensity({}, 0)).toBe(1);
    expect(scorePOIDensity({}, 8)).toBe(3);
    expect(scorePOIDensity({}, 20)).toBe(5);
    expect(scorePOIDensity({}, 45)).toBe(7);
    expect(scorePOIDensity({}, 75)).toBe(9);
    expect(
      scorePOIDensity({ grocery_store: 1, gas_station: 1 }, 75),
    ).toBe(10);
  });
});

describe("parcelTriageScore", () => {
  beforeEach(() => {
    lookupPoiDensitySnapshotMock.mockReset();
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("returns poiDensityScore when Google enrichment succeeds", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    lookupPoiDensitySnapshotMock.mockResolvedValue({
      snapshot: {
        counts: {
          grocery_store: 1,
          gas_station: 1,
          restaurant: 20,
        },
        total: 22,
        radiusMeters: 1600,
      },
      cached: false,
    });

    const result = JSON.parse(
      await parcelTriageScoreExecute(
        {
          dealId: "deal-1",
          address: "123 Main St",
          currentZoning: "M1",
          acreage: 4,
          latitude: 30.45,
          longitude: -91.15,
          proposedUse: "SMALL_BAY_FLEX",
          floodZone: "X",
          futureLandUse: "Industrial",
          utilitiesAvailable: true,
          frontageRoad: "I-10 Service Rd",
          adjacentUses: "industrial warehouse",
        },
        { context: { orgId: "org-1" } },
      ),
    ) as Record<string, unknown>;

    expect(lookupPoiDensitySnapshotMock).toHaveBeenCalledWith({
      orgId: "org-1",
      latitude: 30.45,
      longitude: -91.15,
    });
    expect(result.poiDensityScore).toBe(6);
  });

  it("gracefully skips POI enrichment when org context or coordinates are missing", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";

    const result = JSON.parse(
      await parcelTriageScoreExecute(
        {
          dealId: "deal-1",
          address: "123 Main St",
          currentZoning: "M1",
          acreage: 4,
          latitude: null,
          longitude: null,
          proposedUse: "SMALL_BAY_FLEX",
          floodZone: "X",
          futureLandUse: "Industrial",
          utilitiesAvailable: true,
          frontageRoad: "I-10 Service Rd",
          adjacentUses: "industrial warehouse",
        },
        { context: {} },
      ),
    ) as Record<string, unknown>;

    expect(lookupPoiDensitySnapshotMock).not.toHaveBeenCalled();
    expect(result.poiDensityScore).toBeNull();
  });

  it("gracefully skips POI enrichment when the Google call fails", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    lookupPoiDensitySnapshotMock.mockRejectedValue(new Error("google unavailable"));

    const result = JSON.parse(
      await parcelTriageScoreExecute(
        {
          dealId: "deal-1",
          address: "123 Main St",
          currentZoning: "M1",
          acreage: 4,
          latitude: 30.45,
          longitude: -91.15,
          proposedUse: "SMALL_BAY_FLEX",
          floodZone: "X",
          futureLandUse: "Industrial",
          utilitiesAvailable: true,
          frontageRoad: "I-10 Service Rd",
          adjacentUses: "industrial warehouse",
        },
        { context: { orgId: "org-1" } },
      ),
    ) as Record<string, unknown>;

    expect(result.poiDensityScore).toBeNull();
  });
});
