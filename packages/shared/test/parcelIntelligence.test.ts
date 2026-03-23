import { describe, expect, it } from "vitest";

import type {
  EligibilityGate,
  ExecutionDirectives,
  MemoryPolicy,
  OutputMode,
  ParcelFacts,
  ParcelFilter,
  ParcelQueryIntent,
  ParcelQueryPlan,
  ParcelScreeningResult,
  ParcelSetDefinition,
  ParcelSetLifecycle,
  ParcelSetMaterialization,
  ParcelSetOrigin,
  ParcelSetProvenance,
  ParcelSetStatus,
  ResolutionStrategy,
  ScreeningDimension,
  ScreeningStrategy,
  ScreeningSummary,
  ScoringCriterion,
  ScoringObjective,
  SetAnalytics,
  SetOperation,
  SpatialScope,
  StructuredParcelContext,
  ProvenanceRequirements,
} from "../src/types/parcelIntelligence.js";

describe("Parcel Intelligence Contract Types", () => {
  describe("SpatialScope", () => {
    it("constructs bbox spatial scope", () => {
      const scope: SpatialScope = {
        kind: "bbox",
        bounds: [-91.2, 30.1, -91.0, 30.3],
      };
      expect(scope.kind).toBe("bbox");
      expect(scope.bounds).toEqual([-91.2, 30.1, -91.0, 30.3]);
    });

    it("constructs polygon spatial scope", () => {
      const scope: SpatialScope = {
        kind: "polygon",
        coordinates: [[[-91.2, 30.1], [-91.0, 30.1], [-91.0, 30.3], [-91.2, 30.3], [-91.2, 30.1]]],
      };
      expect(scope.kind).toBe("polygon");
      expect(scope.coordinates).toHaveLength(1);
    });

    it("constructs radius spatial scope", () => {
      const scope: SpatialScope = {
        kind: "radius",
        center: [-91.1, 30.2],
        radiusMeters: 1000,
      };
      expect(scope.kind).toBe("radius");
      expect(scope.center).toEqual([-91.1, 30.2]);
      expect(scope.radiusMeters).toBe(1000);
    });
  });

  describe("ParcelSetOrigin", () => {
    it("constructs viewport origin", () => {
      const origin: ParcelSetOrigin = {
        kind: "viewport",
        spatial: { kind: "bbox", bounds: [-91.2, 30.1, -91.0, 30.3] },
      };
      expect(origin.kind).toBe("viewport");
    });

    it("constructs selection origin", () => {
      const origin: ParcelSetOrigin = {
        kind: "selection",
        parcelIds: ["ebr-001", "ebr-002"],
        source: "map",
      };
      expect(origin.kind).toBe("selection");
      expect(origin.parcelIds).toEqual(["ebr-001", "ebr-002"]);
      expect(origin.source).toBe("map");
    });

    it("constructs query origin", () => {
      const filters: ParcelFilter[] = [
        { field: "acres", operator: "gte", value: 5 },
      ];
      const origin: ParcelSetOrigin = {
        kind: "query",
        filters,
        sql: "SELECT * FROM ebr_parcels WHERE acres >= 5",
      };
      expect(origin.kind).toBe("query");
      expect(origin.filters).toHaveLength(1);
    });

    it("constructs spatial origin", () => {
      const origin: ParcelSetOrigin = {
        kind: "spatial",
        spatial: { kind: "radius", center: [-91.1, 30.2], radiusMeters: 1000 },
        filters: [{ field: "zoningType", operator: "eq", value: "M1" }],
      };
      expect(origin.kind).toBe("spatial");
      expect(origin.filters).toHaveLength(1);
    });

    it("constructs refinement origin", () => {
      const operation: SetOperation = {
        kind: "filter",
        filters: [{ field: "acres", operator: "gt", value: 10 }],
      };
      const origin: ParcelSetOrigin = {
        kind: "refinement",
        parentSetId: "set-123",
        operation,
      };
      expect(origin.kind).toBe("refinement");
    });

    it("constructs saved origin", () => {
      const origin: ParcelSetOrigin = {
        kind: "saved",
        persistedId: "saved-set-456",
      };
      expect(origin.kind).toBe("saved");
    });
  });

  describe("ParcelSetStatus", () => {
    it("has all lifecycle statuses", () => {
      const statuses: ParcelSetStatus[] = [
        "unresolved",
        "resolving",
        "materialized",
        "stale",
        "failed",
      ];
      expect(statuses).toHaveLength(5);
    });
  });

  describe("ParcelSetLifecycle", () => {
    it("constructs ephemeral lifecycle", () => {
      const lifecycle: ParcelSetLifecycle = {
        kind: "ephemeral",
        scope: "request",
      };
      expect(lifecycle.kind).toBe("ephemeral");
    });

    it("constructs persistent lifecycle", () => {
      const lifecycle: ParcelSetLifecycle = {
        kind: "persistent",
        persistedId: "persisted-123",
        createdAt: "2026-03-22T00:00:00Z",
        updatedAt: "2026-03-22T00:00:00Z",
      };
      expect(lifecycle.kind).toBe("persistent");
      expect(lifecycle.persistedId).toBe("persisted-123");
    });
  });

  describe("ParcelSetDefinition", () => {
    it("constructs with all required fields", () => {
      const definition: ParcelSetDefinition = {
        id: "set-001",
        orgId: "org-123",
        label: "Downtown EBR Parcels",
        origin: {
          kind: "viewport",
          spatial: { kind: "bbox", bounds: [-91.2, 30.1, -91.0, 30.3] },
        },
        lifecycle: { kind: "ephemeral", scope: "request" },
        status: "materialized",
        createdAt: "2026-03-22T00:00:00Z",
        metadata: { context: "map-view" },
      };
      expect(definition.id).toBe("set-001");
      expect(definition.orgId).toBe("org-123");
      expect(definition.label).toBe("Downtown EBR Parcels");
      expect(definition.status).toBe("materialized");
      expect(definition.metadata.context).toBe("map-view");
    });

    it("allows null label", () => {
      const definition: ParcelSetDefinition = {
        id: "set-002",
        orgId: "org-123",
        label: null,
        origin: {
          kind: "selection",
          parcelIds: ["ebr-001"],
          source: "deal",
        },
        lifecycle: { kind: "ephemeral", scope: "conversation" },
        status: "unresolved",
        createdAt: "2026-03-22T00:00:00Z",
        metadata: {},
      };
      expect(definition.label).toBeNull();
    });
  });

  describe("ParcelFacts", () => {
    it("constructs with all fields", () => {
      const facts: ParcelFacts = {
        parcelId: "ebr-12345",
        address: "123 Main St, Baton Rouge, LA",
        owner: "John Doe",
        acres: 5.2,
        zoningType: "M1",
        center: [-91.15, 30.2],
        parish: "East Baton Rouge",
        assessedValue: 250000,
      };
      expect(facts.parcelId).toBe("ebr-12345");
      expect(facts.address).toBe("123 Main St, Baton Rouge, LA");
      expect(facts.acres).toBe(5.2);
      expect(facts.center).toEqual([-91.15, 30.2]);
    });

    it("allows null values", () => {
      const facts: ParcelFacts = {
        parcelId: "ebr-12346",
        address: null,
        owner: null,
        acres: null,
        zoningType: null,
        center: null,
        parish: null,
        assessedValue: null,
      };
      expect(facts.address).toBeNull();
      expect(facts.acres).toBeNull();
    });
  });

  describe("ParcelScreeningResult", () => {
    it("constructs with dimensions and envelope", () => {
      const screening: ParcelScreeningResult = {
        parcelId: "ebr-12345",
        dimensions: ["flood", "soils", "wetlands"],
        envelope: {
          floodZone: "SFHA",
          soilType: "clay",
          wetlands: false,
        },
        screenedAt: "2026-03-22T00:00:00Z",
      };
      expect(screening.parcelId).toBe("ebr-12345");
      expect(screening.dimensions).toEqual(["flood", "soils", "wetlands"]);
      expect(screening.envelope.floodZone).toBe("SFHA");
    });
  });

  describe("ParcelSetMaterialization", () => {
    it("carries facts and screening arrays", () => {
      const facts: ParcelFacts[] = [
        {
          parcelId: "ebr-001",
          address: "123 Main",
          owner: "Owner A",
          acres: 5,
          zoningType: "M1",
          center: [-91.15, 30.2],
          parish: "EBR",
          assessedValue: 100000,
        },
      ];

      const screening: ParcelScreeningResult[] = [
        {
          parcelId: "ebr-001",
          dimensions: ["flood", "soils"],
          envelope: { floodZone: "SFHA" },
          screenedAt: "2026-03-22T00:00:00Z",
        },
      ];

      const materialization: ParcelSetMaterialization = {
        parcelSetId: "set-001",
        memberIds: ["ebr-001"],
        count: 1,
        facts,
        screening,
        provenance: {
          sourceKind: "database",
          sourceRoute: "/api/parcels",
          authoritative: true,
          confidence: 0.95,
          resolvedAt: "2026-03-22T00:00:00Z",
          freshness: "fresh",
        },
        materializedAt: "2026-03-22T00:00:00Z",
      };

      expect(materialization.facts).toHaveLength(1);
      expect(materialization.screening).toHaveLength(1);
      expect(materialization.count).toBe(1);
    });
  });

  describe("SetAnalytics", () => {
    it("computes distributions shape", () => {
      const analytics: SetAnalytics = {
        totalCount: 100,
        distributions: {
          zoningType: { M1: 45, M2: 30, B1: 25 },
          parish: { EBR: 70, Ascension: 30 },
        },
        screeningSummary: {
          dimensionsScreened: ["flood", "soils"],
          floodExposure: { sfhaCount: 20, totalCount: 100 },
          wetlandExposure: { affectedCount: 15, totalCount: 100 },
          epaProximity: { sitesWithinMile: 5 },
        },
        topConstraints: ["SFHA Flood Zone", "Protected Wetlands"],
        scoringSummary: { min: 10, max: 95, mean: 52.5 },
      };
      expect(Object.keys(analytics.distributions)).toEqual(["zoningType", "parish"]);
      expect(analytics.distributions.zoningType).toEqual({ M1: 45, M2: 30, B1: 25 });
      expect(analytics.topConstraints).toHaveLength(2);
    });
  });

  describe("ParcelFilter", () => {
    it("constructs filter with all operators", () => {
      const filters: ParcelFilter[] = [
        { field: "acres", operator: "gte", value: 5 },
        { field: "zoningType", operator: "eq", value: "M1" },
        { field: "assessedValue", operator: "lt", value: 500000 },
      ];
      expect(filters).toHaveLength(3);
      expect(filters[0].operator).toBe("gte");
    });
  });

  describe("SetOperation", () => {
    it("constructs all operation types", () => {
      const ops: SetOperation[] = [
        { kind: "filter", filters: [] },
        { kind: "union", otherSetId: "set-2" },
        { kind: "intersect", otherSetId: "set-3" },
        { kind: "subtract", otherSetId: "set-4" },
        { kind: "sort", field: "acres", direction: "desc" },
        { kind: "limit", count: 50 },
      ];
      expect(ops).toHaveLength(6);
    });
  });

  describe("ResolutionStrategy", () => {
    it("constructs all strategy types", () => {
      const strategies: ResolutionStrategy[] = [
        { kind: "parcel-ids", ids: ["ebr-001", "ebr-002"] },
        {
          kind: "bbox",
          spatial: { kind: "bbox", bounds: [-91.2, 30.1, -91.0, 30.3] },
          limit: 100,
        },
        { kind: "selection-passthrough" },
        { kind: "property-query", filters: [] },
        { kind: "spatial-sql", sql: "SELECT *", params: [] },
        { kind: "memory-discovery", query: "industrial parcels", topK: 10 },
      ];
      expect(strategies).toHaveLength(6);
    });
  });

  describe("ExecutionDirectives", () => {
    it("constructs with all required fields", () => {
      const directives: ExecutionDirectives = {
        materializationMode: "immediate",
        screeningTiming: "pre-agent",
        authoritativeVerification: "required",
        freshnessMaxSeconds: 3600,
        estimatedCost: "moderate",
      };
      expect(directives.materializationMode).toBe("immediate");
      expect(directives.estimatedCost).toBe("moderate");
    });
  });

  describe("MemoryPolicy", () => {
    it("constructs with all required fields", () => {
      const policy: MemoryPolicy = {
        allowSemanticDiscovery: true,
        requireDbVerification: false,
        maxCandidatesFromMemory: 20,
        confidenceFloor: 0.7,
      };
      expect(policy.allowSemanticDiscovery).toBe(true);
      expect(policy.maxCandidatesFromMemory).toBe(20);
    });
  });

  describe("ScreeningStrategy", () => {
    it("constructs with all required fields", () => {
      const strategy: ScreeningStrategy = {
        dimensions: ["flood", "soils", "wetlands"],
        mode: "full",
        batchSize: 8,
        priority: "completeness",
      };
      expect(strategy.dimensions).toEqual(["flood", "soils", "wetlands"]);
      expect(strategy.batchSize).toBe(8);
    });
  });

  describe("ScoringObjective", () => {
    it("constructs with criteria, gates, and limit", () => {
      const criteria: ScoringCriterion[] = [
        {
          field: "acres",
          weight: 0.3,
          direction: "maximize",
        },
        {
          field: "assessedValue",
          weight: 0.7,
          direction: "minimize",
          penalty: { condition: "SFHA", factor: 0.5 },
        },
      ];

      const gates: EligibilityGate[] = [
        {
          field: "zoningType",
          operator: "in",
          value: ["M1", "M2"],
          reason: "Industrial zoning required",
        },
      ];

      const objective: ScoringObjective = {
        criteria,
        eligibilityGates: gates,
        limit: 50,
      };

      expect(objective.criteria).toHaveLength(2);
      expect(objective.eligibilityGates).toHaveLength(1);
      expect(objective.limit).toBe(50);
    });
  });

  describe("ParcelQueryPlan", () => {
    it("carries resolution strategy and directives", () => {
      const inputSets: ParcelSetDefinition[] = [
        {
          id: "set-001",
          orgId: "org-123",
          label: "Input Set",
          origin: {
            kind: "viewport",
            spatial: { kind: "bbox", bounds: [-91.2, 30.1, -91.0, 30.3] },
          },
          lifecycle: { kind: "ephemeral", scope: "request" },
          status: "materialized",
          createdAt: "2026-03-22T00:00:00Z",
          metadata: {},
        },
      ];

      const resolution: ResolutionStrategy = {
        kind: "bbox",
        spatial: { kind: "bbox", bounds: [-91.2, 30.1, -91.0, 30.3] },
        limit: 100,
      };

      const directives: ExecutionDirectives = {
        materializationMode: "immediate",
        screeningTiming: "pre-agent",
        authoritativeVerification: "required",
        freshnessMaxSeconds: 3600,
        estimatedCost: "moderate",
      };

      const plan: ParcelQueryPlan = {
        id: "plan-001",
        intent: "screen",
        inputSets,
        resolution,
        filters: [],
        screening: {
          dimensions: ["flood"],
          mode: "full",
          batchSize: 8,
          priority: "completeness",
        },
        scoring: null,
        outputMode: "list",
        directives,
        memoryPolicy: {
          allowSemanticDiscovery: false,
          requireDbVerification: true,
          maxCandidatesFromMemory: 10,
          confidenceFloor: 0.8,
        },
        provenanceRequirements: {
          requireAuthoritative: true,
          maxStalenessSeconds: 3600,
          verifyMemoryResults: true,
        },
        isFollowUp: false,
      };

      expect(plan.id).toBe("plan-001");
      expect(plan.intent).toBe("screen");
      expect(plan.resolution.kind).toBe("bbox");
      expect(plan.directives.materializationMode).toBe("immediate");
    });
  });

  describe("StructuredParcelContext", () => {
    it("replaces text prefix and includes all components", () => {
      const definition: ParcelSetDefinition = {
        id: "set-001",
        orgId: "org-123",
        label: "Test Set",
        origin: {
          kind: "selection",
          parcelIds: ["ebr-001"],
          source: "map",
        },
        lifecycle: { kind: "ephemeral", scope: "conversation" },
        status: "materialized",
        createdAt: "2026-03-22T00:00:00Z",
        metadata: {},
      };

      const materialization: ParcelSetMaterialization = {
        parcelSetId: "set-001",
        memberIds: ["ebr-001"],
        count: 1,
        facts: [
          {
            parcelId: "ebr-001",
            address: "123 Main",
            owner: "Owner",
            acres: 5,
            zoningType: "M1",
            center: [-91.15, 30.2],
            parish: "EBR",
            assessedValue: 100000,
          },
        ],
        screening: [],
        provenance: {
          sourceKind: "database",
          sourceRoute: "/api/parcels",
          authoritative: true,
          confidence: 1.0,
          resolvedAt: "2026-03-22T00:00:00Z",
          freshness: "fresh",
        },
        materializedAt: "2026-03-22T00:00:00Z",
      };

      const plan: ParcelQueryPlan = {
        id: "plan-001",
        intent: "identify",
        inputSets: [definition],
        resolution: { kind: "selection-passthrough" },
        filters: [],
        screening: null,
        scoring: null,
        outputMode: "list",
        directives: {
          materializationMode: "immediate",
          screeningTiming: "none",
          authoritativeVerification: "skip",
          freshnessMaxSeconds: null,
          estimatedCost: "light",
        },
        memoryPolicy: {
          allowSemanticDiscovery: false,
          requireDbVerification: false,
          maxCandidatesFromMemory: 0,
          confidenceFloor: 0,
        },
        provenanceRequirements: {
          requireAuthoritative: false,
          maxStalenessSeconds: null,
          verifyMemoryResults: false,
        },
        isFollowUp: false,
      };

      const context: StructuredParcelContext = {
        plan,
        sets: [
          {
            definition,
            materialization,
            analytics: null,
          },
        ],
        conversationSetRegistry: ["set-001"],
        intent: "identify",
        outputMode: "list",
      };

      expect(context.plan.id).toBe("plan-001");
      expect(context.sets).toHaveLength(1);
      expect(context.sets[0].definition.label).toBe("Test Set");
      expect(context.sets[0].materialization?.count).toBe(1);
      expect(context.conversationSetRegistry).toEqual(["set-001"]);
    });
  });

  describe("OutputMode", () => {
    it("has all output modes", () => {
      const modes: OutputMode[] = ["list", "comparison", "summary", "map", "detail"];
      expect(modes).toHaveLength(5);
    });
  });

  describe("ParcelQueryIntent", () => {
    it("has all intent types", () => {
      const intents: ParcelQueryIntent[] = [
        "identify",
        "screen",
        "filter",
        "compare",
        "rank",
        "discover",
        "summarize",
        "refine",
        "general",
      ];
      expect(intents).toHaveLength(9);
    });
  });

  describe("ScreeningDimension", () => {
    it("has all screening dimensions", () => {
      const dimensions: ScreeningDimension[] = [
        "flood",
        "soils",
        "wetlands",
        "epa",
        "traffic",
        "ldeq",
        "zoning",
      ];
      expect(dimensions).toHaveLength(7);
    });
  });
});
