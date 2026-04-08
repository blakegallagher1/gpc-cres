import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock server-only and gateway before imports
vi.mock("server-only", () => ({}));

const mockQuery = vi.fn();
vi.mock("../../gatewayClient", () => ({
  getGatewayClient: () => ({ query: mockQuery }),
}));

import { computeFitScores } from "../fitScore";
import type { ThesisDefinition } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_GEOMETRY = {
  type: "Polygon" as const,
  coordinates: [[[-91.1, 30.4], [-91.0, 30.4], [-91.0, 30.5], [-91.1, 30.5], [-91.1, 30.4]]],
};

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    parcel_id: "P-001",
    acreage: 8,
    zoning: "M1",
    flood_zone: "X",
    road: "I-10 Service Rd",
    geom: MOCK_GEOMETRY,
    ...overrides,
  };
}

function makeThesis(overrides: Partial<ThesisDefinition> = {}): ThesisDefinition {
  return {
    orgId: "org-test",
    name: "Test Thesis",
    weights: [
      { factor: "acreage_min", weight: 0.3, threshold: 5 },
      { factor: "zoning_allows", weight: 0.3, threshold: "M1,M2,LI" },
      { factor: "flood_zone_safe", weight: 0.2 },
      { factor: "road_frontage", weight: 0.2 },
    ],
    ...overrides,
  };
}

const CTX = { orgId: "org-test" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeFitScores", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scores a single parcel with ideal attributes highly", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeRow()],
    });

    const result = await computeFitScores(CTX, {
      thesis: makeThesis(),
      parcelSql: "SELECT * FROM ebr_parcels LIMIT 10",
    });

    expect(result.scores).toHaveLength(1);
    const score = result.scores[0];
    expect(score.parcelId).toBe("P-001");
    expect(score.score).toBeGreaterThanOrEqual(70);
    expect(score.thesis).toBe("Test Thesis");
    expect(score.breakdown).toHaveProperty("acreage_min");
    expect(score.breakdown).toHaveProperty("zoning_allows");
    expect(score.breakdown).toHaveProperty("flood_zone_safe");
    expect(score.breakdown).toHaveProperty("road_frontage");
  });

  it("returns summary stats for multiple parcels", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeRow({ parcel_id: "P-001", acreage: 10 }),
        makeRow({ parcel_id: "P-002", acreage: 2, flood_zone: "AE", road: "Local St" }),
        makeRow({ parcel_id: "P-003", acreage: 6, zoning: "R1" }),
      ],
    });

    const result = await computeFitScores(CTX, {
      thesis: makeThesis(),
      parcelSql: "SELECT * FROM ebr_parcels LIMIT 10",
    });

    expect(result.scores).toHaveLength(3);
    expect(result.summary.count).toBe(3);
    expect(result.summary.maxScore).toBeGreaterThanOrEqual(result.summary.minScore);
    expect(result.summary.avgScore).toBeGreaterThan(0);
  });

  it("returns empty scores for empty result set", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await computeFitScores(CTX, {
      thesis: makeThesis(),
      parcelSql: "SELECT * FROM ebr_parcels WHERE acreage > 9999",
    });

    expect(result.scores).toHaveLength(0);
    expect(result.summary.count).toBe(0);
    expect(result.summary.avgScore).toBe(0);
  });

  it("emits add_layer map action with heatmap style", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeRow()],
    });

    const result = await computeFitScores(CTX, {
      thesis: makeThesis(),
      parcelSql: "SELECT * FROM ebr_parcels LIMIT 1",
    });

    expect(result.mapActions).toHaveLength(1);
    const action = result.mapActions[0];
    expect(action.action).toBe("add_layer");
    if (action.action === "add_layer") {
      expect(action.label).toContain("Fit Score");
      expect(action.geojson.features).toHaveLength(1);
      expect(action.geojson.features[0].properties.fit_score).toBeDefined();
    }
  });

  it("includes citationRefs from parcel IDs", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeRow({ parcel_id: "P-AAA" }),
        makeRow({ parcel_id: "P-BBB" }),
      ],
    });

    const result = await computeFitScores(CTX, {
      thesis: makeThesis(),
      parcelSql: "SELECT * FROM ebr_parcels LIMIT 10",
    });

    expect(result.citationRefs).toContain("P-AAA");
    expect(result.citationRefs).toContain("P-BBB");
  });

  // -- Factor scoring --

  it("scores acreage_min: above threshold gets high score", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeRow({ acreage: 20 })],
    });

    const result = await computeFitScores(CTX, {
      thesis: makeThesis({
        weights: [{ factor: "acreage_min", weight: 1.0, threshold: 5 }],
      }),
      parcelSql: "SELECT * FROM ebr_parcels LIMIT 1",
    });

    expect(result.scores[0].score).toBeGreaterThanOrEqual(80);
  });

  it("scores acreage_min: below threshold gets low score", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeRow({ acreage: 1 })],
    });

    const result = await computeFitScores(CTX, {
      thesis: makeThesis({
        weights: [{ factor: "acreage_min", weight: 1.0, threshold: 10 }],
      }),
      parcelSql: "SELECT * FROM ebr_parcels LIMIT 1",
    });

    expect(result.scores[0].score).toBeLessThan(30);
  });

  it("scores zoning_allows: matching code gets 100", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeRow({ zoning: "M1" })],
    });

    const result = await computeFitScores(CTX, {
      thesis: makeThesis({
        weights: [{ factor: "zoning_allows", weight: 1.0, threshold: "M1,M2" }],
      }),
      parcelSql: "SELECT * FROM ebr_parcels LIMIT 1",
    });

    expect(result.scores[0].score).toBe(100);
  });

  it("scores zoning_allows: non-matching code gets 10", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeRow({ zoning: "R1" })],
    });

    const result = await computeFitScores(CTX, {
      thesis: makeThesis({
        weights: [{ factor: "zoning_allows", weight: 1.0, threshold: "M1,M2" }],
      }),
      parcelSql: "SELECT * FROM ebr_parcels LIMIT 1",
    });

    expect(result.scores[0].score).toBe(10);
  });

  it("scores flood_zone_safe: X gets 100, AE gets 30", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeRow({ parcel_id: "safe", flood_zone: "X" }),
        makeRow({ parcel_id: "risky", flood_zone: "AE" }),
      ],
    });

    const result = await computeFitScores(CTX, {
      thesis: makeThesis({
        weights: [{ factor: "flood_zone_safe", weight: 1.0 }],
      }),
      parcelSql: "SELECT * FROM ebr_parcels LIMIT 10",
    });

    const safe = result.scores.find((s) => s.parcelId === "safe");
    const risky = result.scores.find((s) => s.parcelId === "risky");
    expect(safe?.score).toBe(100);
    expect(risky?.score).toBe(30);
  });

  it("scores road_frontage: interstate gets 95", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeRow({ road: "I-10 Service Road" })],
    });

    const result = await computeFitScores(CTX, {
      thesis: makeThesis({
        weights: [{ factor: "road_frontage", weight: 1.0 }],
      }),
      parcelSql: "SELECT * FROM ebr_parcels LIMIT 1",
    });

    expect(result.scores[0].score).toBe(95);
  });

  it("handles null values gracefully (scores 0)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeRow({ acreage: null, zoning: null, flood_zone: null })],
    });

    const result = await computeFitScores(CTX, {
      thesis: makeThesis(),
      parcelSql: "SELECT * FROM ebr_parcels LIMIT 1",
    });

    // Should not throw, score should be low
    expect(result.scores).toHaveLength(1);
    expect(result.scores[0].score).toBeLessThanOrEqual(50);
  });

  it("throws on invalid SQL", async () => {
    await expect(
      computeFitScores(CTX, {
        thesis: makeThesis(),
        parcelSql: "DROP TABLE ebr_parcels",
      }),
    ).rejects.toThrow("validation failed");
  });

  it("skips features without geometry in map actions", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeRow({ parcel_id: "has-geom" }),
        { parcel_id: "no-geom", acreage: 5, zoning: "M1", flood_zone: "X" },
      ],
    });

    const result = await computeFitScores(CTX, {
      thesis: makeThesis(),
      parcelSql: "SELECT * FROM ebr_parcels LIMIT 10",
    });

    // Both parcels scored
    expect(result.scores).toHaveLength(2);
    // Only one has geometry for the map
    const addLayer = result.mapActions.find((a) => a.action === "add_layer");
    if (addLayer && addLayer.action === "add_layer") {
      expect(addLayer.geojson.features).toHaveLength(1);
    }
  });
});
