import { describe, it, expect } from "vitest";
import {
  computeAnalytics,
} from "../analytics";
import type {
  ParcelSetMaterialization,
  ParcelFacts,
  ParcelScreeningResult,
} from "@entitlement-os/shared";

describe("computeAnalytics", () => {
  it("should compute totalCount from materialization", () => {
    const materialization: ParcelSetMaterialization = {
      parcelSetId: "set-1",
      memberIds: ["p1", "p2", "p3"],
      count: 3,
      facts: [
        {
          parcelId: "p1",
          address: "123 Main St",
          owner: null,
          acres: 10,
          zoningType: "M1",
          center: [0, 0],
          parish: "East Baton Rouge",
          assessedValue: 100000,
        },
        {
          parcelId: "p2",
          address: "456 Oak Ave",
          owner: null,
          acres: 5,
          zoningType: "M1",
          center: [1, 1],
          parish: "East Baton Rouge",
          assessedValue: 50000,
        },
        {
          parcelId: "p3",
          address: "789 Pine Rd",
          owner: null,
          acres: 8,
          zoningType: "C2",
          center: [2, 2],
          parish: "Ascension",
          assessedValue: 75000,
        },
      ],
      screening: [],
      provenance: {
        sourceKind: "database",
        sourceRoute: null,
        authoritative: true,
        confidence: 1.0,
        resolvedAt: new Date().toISOString(),
        freshness: "fresh",
      },
      materializedAt: new Date().toISOString(),
    };

    const analytics = computeAnalytics(materialization);

    expect(analytics.totalCount).toBe(3);
  });

  it("should compute zoning distribution correctly", () => {
    const materialization: ParcelSetMaterialization = {
      parcelSetId: "set-2",
      memberIds: ["p1", "p2", "p3"],
      count: 3,
      facts: [
        {
          parcelId: "p1",
          address: null,
          owner: null,
          acres: null,
          zoningType: "M1",
          center: null,
          parish: "East Baton Rouge",
          assessedValue: null,
        },
        {
          parcelId: "p2",
          address: null,
          owner: null,
          acres: null,
          zoningType: "M1",
          center: null,
          parish: "East Baton Rouge",
          assessedValue: null,
        },
        {
          parcelId: "p3",
          address: null,
          owner: null,
          acres: null,
          zoningType: "C2",
          center: null,
          parish: "Ascension",
          assessedValue: null,
        },
      ],
      screening: [],
      provenance: {
        sourceKind: "database",
        sourceRoute: null,
        authoritative: true,
        confidence: 1.0,
        resolvedAt: new Date().toISOString(),
        freshness: "fresh",
      },
      materializedAt: new Date().toISOString(),
    };

    const analytics = computeAnalytics(materialization);

    expect(analytics.distributions.zoningType).toEqual({
      M1: 2,
      C2: 1,
    });
  });

  it("should compute parish distribution correctly", () => {
    const materialization: ParcelSetMaterialization = {
      parcelSetId: "set-3",
      memberIds: ["p1", "p2", "p3"],
      count: 3,
      facts: [
        {
          parcelId: "p1",
          address: null,
          owner: null,
          acres: null,
          zoningType: null,
          center: null,
          parish: "East Baton Rouge",
          assessedValue: null,
        },
        {
          parcelId: "p2",
          address: null,
          owner: null,
          acres: null,
          zoningType: null,
          center: null,
          parish: "East Baton Rouge",
          assessedValue: null,
        },
        {
          parcelId: "p3",
          address: null,
          owner: null,
          acres: null,
          zoningType: null,
          center: null,
          parish: "Ascension",
          assessedValue: null,
        },
      ],
      screening: [],
      provenance: {
        sourceKind: "database",
        sourceRoute: null,
        authoritative: true,
        confidence: 1.0,
        resolvedAt: new Date().toISOString(),
        freshness: "fresh",
      },
      materializedAt: new Date().toISOString(),
    };

    const analytics = computeAnalytics(materialization);

    expect(analytics.distributions.parish).toEqual({
      "East Baton Rouge": 2,
      "Ascension": 1,
    });
  });

  it("should compute flood exposure from screening", () => {
    const materialization: ParcelSetMaterialization = {
      parcelSetId: "set-4",
      memberIds: ["p1", "p2", "p3"],
      count: 3,
      facts: [
        {
          parcelId: "p1",
          address: null,
          owner: null,
          acres: null,
          zoningType: null,
          center: null,
          parish: null,
          assessedValue: null,
        },
        {
          parcelId: "p2",
          address: null,
          owner: null,
          acres: null,
          zoningType: null,
          center: null,
          parish: null,
          assessedValue: null,
        },
        {
          parcelId: "p3",
          address: null,
          owner: null,
          acres: null,
          zoningType: null,
          center: null,
          parish: null,
          assessedValue: null,
        },
      ],
      screening: [
        {
          parcelId: "p1",
          dimensions: ["flood"],
          envelope: { in_sfha: true },
          screenedAt: new Date().toISOString(),
        },
        {
          parcelId: "p2",
          dimensions: ["flood"],
          envelope: { in_sfha: true },
          screenedAt: new Date().toISOString(),
        },
        {
          parcelId: "p3",
          dimensions: ["flood"],
          envelope: { in_sfha: false },
          screenedAt: new Date().toISOString(),
        },
      ],
      provenance: {
        sourceKind: "database",
        sourceRoute: null,
        authoritative: true,
        confidence: 1.0,
        resolvedAt: new Date().toISOString(),
        freshness: "fresh",
      },
      materializedAt: new Date().toISOString(),
    };

    const analytics = computeAnalytics(materialization);

    expect(analytics.screeningSummary).not.toBeNull();
    expect(analytics.screeningSummary?.floodExposure).toEqual({
      sfhaCount: 2,
      totalCount: 3,
    });
  });

  it("should generate flood constraint in topConstraints", () => {
    const materialization: ParcelSetMaterialization = {
      parcelSetId: "set-5",
      memberIds: ["p1", "p2", "p3"],
      count: 3,
      facts: [
        {
          parcelId: "p1",
          address: null,
          owner: null,
          acres: null,
          zoningType: null,
          center: null,
          parish: null,
          assessedValue: null,
        },
        {
          parcelId: "p2",
          address: null,
          owner: null,
          acres: null,
          zoningType: null,
          center: null,
          parish: null,
          assessedValue: null,
        },
        {
          parcelId: "p3",
          address: null,
          owner: null,
          acres: null,
          zoningType: null,
          center: null,
          parish: null,
          assessedValue: null,
        },
      ],
      screening: [
        {
          parcelId: "p1",
          dimensions: ["flood"],
          envelope: { in_sfha: true },
          screenedAt: new Date().toISOString(),
        },
        {
          parcelId: "p2",
          dimensions: ["flood"],
          envelope: { in_sfha: true },
          screenedAt: new Date().toISOString(),
        },
        {
          parcelId: "p3",
          dimensions: ["flood"],
          envelope: { in_sfha: false },
          screenedAt: new Date().toISOString(),
        },
      ],
      provenance: {
        sourceKind: "database",
        sourceRoute: null,
        authoritative: true,
        confidence: 1.0,
        resolvedAt: new Date().toISOString(),
        freshness: "fresh",
      },
      materializedAt: new Date().toISOString(),
    };

    const analytics = computeAnalytics(materialization);

    expect(analytics.topConstraints).toContain("67% in SFHA flood zone");
  });

  it("should handle empty materialization", () => {
    const materialization: ParcelSetMaterialization = {
      parcelSetId: "set-empty",
      memberIds: [],
      count: 0,
      facts: [],
      screening: [],
      provenance: {
        sourceKind: "database",
        sourceRoute: null,
        authoritative: true,
        confidence: 1.0,
        resolvedAt: new Date().toISOString(),
        freshness: "fresh",
      },
      materializedAt: new Date().toISOString(),
    };

    const analytics = computeAnalytics(materialization);

    expect(analytics.totalCount).toBe(0);
    expect(analytics.distributions).toEqual({});
    expect(analytics.screeningSummary).toBeNull();
    expect(analytics.topConstraints).toEqual([]);
    expect(analytics.scoringSummary).toBeNull();
  });

  it("should compute wetland exposure from screening", () => {
    const materialization: ParcelSetMaterialization = {
      parcelSetId: "set-6",
      memberIds: ["p1", "p2"],
      count: 2,
      facts: [
        {
          parcelId: "p1",
          address: null,
          owner: null,
          acres: null,
          zoningType: null,
          center: null,
          parish: null,
          assessedValue: null,
        },
        {
          parcelId: "p2",
          address: null,
          owner: null,
          acres: null,
          zoningType: null,
          center: null,
          parish: null,
          assessedValue: null,
        },
      ],
      screening: [
        {
          parcelId: "p1",
          dimensions: ["wetlands"],
          envelope: { has_wetlands: true },
          screenedAt: new Date().toISOString(),
        },
        {
          parcelId: "p2",
          dimensions: ["wetlands"],
          envelope: { has_wetlands: false },
          screenedAt: new Date().toISOString(),
        },
      ],
      provenance: {
        sourceKind: "database",
        sourceRoute: null,
        authoritative: true,
        confidence: 1.0,
        resolvedAt: new Date().toISOString(),
        freshness: "fresh",
      },
      materializedAt: new Date().toISOString(),
    };

    const analytics = computeAnalytics(materialization);

    expect(analytics.screeningSummary?.wetlandExposure).toEqual({
      affectedCount: 1,
      totalCount: 2,
    });
  });

  it("should generate wetland constraint in topConstraints", () => {
    const materialization: ParcelSetMaterialization = {
      parcelSetId: "set-7",
      memberIds: ["p1", "p2"],
      count: 2,
      facts: [
        {
          parcelId: "p1",
          address: null,
          owner: null,
          acres: null,
          zoningType: null,
          center: null,
          parish: null,
          assessedValue: null,
        },
        {
          parcelId: "p2",
          address: null,
          owner: null,
          acres: null,
          zoningType: null,
          center: null,
          parish: null,
          assessedValue: null,
        },
      ],
      screening: [
        {
          parcelId: "p1",
          dimensions: ["wetlands"],
          envelope: { has_wetlands: true },
          screenedAt: new Date().toISOString(),
        },
        {
          parcelId: "p2",
          dimensions: ["wetlands"],
          envelope: { has_wetlands: false },
          screenedAt: new Date().toISOString(),
        },
      ],
      provenance: {
        sourceKind: "database",
        sourceRoute: null,
        authoritative: true,
        confidence: 1.0,
        resolvedAt: new Date().toISOString(),
        freshness: "fresh",
      },
      materializedAt: new Date().toISOString(),
    };

    const analytics = computeAnalytics(materialization);

    expect(analytics.topConstraints).toContain("1 parcel has wetland exposure");
  });

  it("should skip null fields in distributions", () => {
    const materialization: ParcelSetMaterialization = {
      parcelSetId: "set-8",
      memberIds: ["p1", "p2"],
      count: 2,
      facts: [
        {
          parcelId: "p1",
          address: null,
          owner: null,
          acres: null,
          zoningType: null, // null value
          center: null,
          parish: "East Baton Rouge",
          assessedValue: null,
        },
        {
          parcelId: "p2",
          address: null,
          owner: null,
          acres: null,
          zoningType: null, // null value
          center: null,
          parish: "Ascension",
          assessedValue: null,
        },
      ],
      screening: [],
      provenance: {
        sourceKind: "database",
        sourceRoute: null,
        authoritative: true,
        confidence: 1.0,
        resolvedAt: new Date().toISOString(),
        freshness: "fresh",
      },
      materializedAt: new Date().toISOString(),
    };

    const analytics = computeAnalytics(materialization);

    // zoningType should not be in distributions (all null)
    expect(analytics.distributions.zoningType).toBeUndefined();
    // parish should be in distributions
    expect(analytics.distributions.parish).toBeDefined();
  });

  it("should identify dominant zoning constraint (>60%)", () => {
    const materialization: ParcelSetMaterialization = {
      parcelSetId: "set-9",
      memberIds: ["p1", "p2", "p3", "p4", "p5"],
      count: 5,
      facts: [
        {
          parcelId: "p1",
          address: null,
          owner: null,
          acres: null,
          zoningType: "M1",
          center: null,
          parish: null,
          assessedValue: null,
        },
        {
          parcelId: "p2",
          address: null,
          owner: null,
          acres: null,
          zoningType: "M1",
          center: null,
          parish: null,
          assessedValue: null,
        },
        {
          parcelId: "p3",
          address: null,
          owner: null,
          acres: null,
          zoningType: "M1",
          center: null,
          parish: null,
          assessedValue: null,
        },
        {
          parcelId: "p4",
          address: null,
          owner: null,
          acres: null,
          zoningType: "M1",
          center: null,
          parish: null,
          assessedValue: null,
        },
        {
          parcelId: "p5",
          address: null,
          owner: null,
          acres: null,
          zoningType: "C2",
          center: null,
          parish: null,
          assessedValue: null,
        },
      ],
      screening: [],
      provenance: {
        sourceKind: "database",
        sourceRoute: null,
        authoritative: true,
        confidence: 1.0,
        resolvedAt: new Date().toISOString(),
        freshness: "fresh",
      },
      materializedAt: new Date().toISOString(),
    };

    const analytics = computeAnalytics(materialization);

    // 4 out of 5 = 80% M1
    expect(analytics.topConstraints).toContain("80% zoned M1");
  });

  it("should collect unique screening dimensions", () => {
    const materialization: ParcelSetMaterialization = {
      parcelSetId: "set-10",
      memberIds: ["p1", "p2"],
      count: 2,
      facts: [
        {
          parcelId: "p1",
          address: null,
          owner: null,
          acres: null,
          zoningType: null,
          center: null,
          parish: null,
          assessedValue: null,
        },
        {
          parcelId: "p2",
          address: null,
          owner: null,
          acres: null,
          zoningType: null,
          center: null,
          parish: null,
          assessedValue: null,
        },
      ],
      screening: [
        {
          parcelId: "p1",
          dimensions: ["flood", "wetlands"],
          envelope: {},
          screenedAt: new Date().toISOString(),
        },
        {
          parcelId: "p2",
          dimensions: ["epa"],
          envelope: {},
          screenedAt: new Date().toISOString(),
        },
      ],
      provenance: {
        sourceKind: "database",
        sourceRoute: null,
        authoritative: true,
        confidence: 1.0,
        resolvedAt: new Date().toISOString(),
        freshness: "fresh",
      },
      materializedAt: new Date().toISOString(),
    };

    const analytics = computeAnalytics(materialization);

    expect(analytics.screeningSummary?.dimensionsScreened).toContain("flood");
    expect(analytics.screeningSummary?.dimensionsScreened).toContain("wetlands");
    expect(analytics.screeningSummary?.dimensionsScreened).toContain("epa");
  });
});
