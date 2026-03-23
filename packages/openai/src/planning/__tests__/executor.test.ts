/**
 * Tests for ParcelQueryExecutor
 *
 * Verifies resolution strategy execution (selection-passthrough, bbox),
 * filter application, screening orchestration, registry integration, and analytics computation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ParcelQueryExecutor } from "../executor";
import { ParcelSetRegistry } from "../registry";
import type { ParcelQueryPlan, ParcelSetDefinition } from "@entitlement-os/shared";

// Mock the gateway adapter
const mockGatewayAdapter = {
  searchParcelsByBbox: vi.fn(),
  getParcelDetails: vi.fn(),
  screenParcels: vi.fn(),
};

describe("ParcelQueryExecutor", () => {
  let executor: ParcelQueryExecutor;
  let registry: ParcelSetRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ParcelSetRegistry();
    executor = new ParcelQueryExecutor(mockGatewayAdapter);
  });

  describe("selection-passthrough resolution", () => {
    it("materializes a selection set with parcel IDs already known", async () => {
      const inputSetDef = makeSelectionDef(["p1", "p2"]);
      const plan = makePlan({
        resolution: { kind: "selection-passthrough" },
        inputSets: [inputSetDef],
      });

      // Register the input set in the registry (executor expects it to already exist)
      registry.register("conv-1", inputSetDef);

      mockGatewayAdapter.getParcelDetails.mockResolvedValue([
        { parcelId: "p1", address: "123 Main", zoningType: "M1", acres: 2.0 },
        { parcelId: "p2", address: "456 Oak", zoningType: "C2", acres: 1.5 },
      ]);

      const result = await executor.execute(plan, registry, "conv-1");

      expect(result.sets).toHaveLength(1);
      expect(result.sets[0].materialization).not.toBeNull();
      expect(result.sets[0].materialization!.memberIds).toEqual(["p1", "p2"]);
      expect(result.sets[0].materialization!.facts).toHaveLength(2);
      expect(result.sets[0].materialization!.provenance.authoritative).toBe(true);
    });
  });

  describe("bbox resolution", () => {
    it("resolves parcels within a bounding box", async () => {
      const viewportSetDef = makeViewportDef();
      const plan = makePlan({
        resolution: { kind: "bbox", spatial: { kind: "bbox", bounds: [-91.2, 30.4, -91.1, 30.5] }, limit: 100 },
        inputSets: [viewportSetDef],
      });
      registry.register("conv-1", viewportSetDef);
      mockGatewayAdapter.searchParcelsByBbox.mockResolvedValue([
        { parcelId: "p10", address: "10 River Rd", zoningType: "M1", acres: 5.0 },
      ]);

      const result = await executor.execute(plan, registry, "conv-1");

      expect(result.sets[0].materialization!.memberIds).toEqual(["p10"]);
      expect(mockGatewayAdapter.searchParcelsByBbox).toHaveBeenCalledWith(
        expect.objectContaining({ bounds: [-91.2, 30.4, -91.1, 30.5] }),
      );
    });
  });

  describe("filter application", () => {
    it("applies filters to materialized set", async () => {
      const inputSetDef = makeSelectionDef(["p1", "p2", "p3"]);
      const plan = makePlan({
        resolution: { kind: "selection-passthrough" },
        inputSets: [inputSetDef],
        filters: [{ field: "zoningType", operator: "eq", value: "M1" }],
      });
      registry.register("conv-1", inputSetDef);
      mockGatewayAdapter.getParcelDetails.mockResolvedValue([
        { parcelId: "p1", address: "A", zoningType: "M1", acres: 2.0 },
        { parcelId: "p2", address: "B", zoningType: "C2", acres: 1.5 },
        { parcelId: "p3", address: "C", zoningType: "M1", acres: 3.0 },
      ]);

      const result = await executor.execute(plan, registry, "conv-1");

      expect(result.sets[0].materialization!.memberIds).toEqual(["p1", "p3"]);
      expect(result.sets[0].materialization!.count).toBe(2);
    });
  });

  describe("screening orchestration", () => {
    it("screens parcels when screening strategy is pre-agent", async () => {
      const inputSetDef = makeSelectionDef(["p1"]);
      const plan = makePlan({
        resolution: { kind: "selection-passthrough" },
        inputSets: [inputSetDef],
        screening: { dimensions: ["flood"], mode: "selective", batchSize: 8, priority: "speed" },
        directives: { materializationMode: "immediate", screeningTiming: "pre-agent", authoritativeVerification: "required", freshnessMaxSeconds: null, estimatedCost: "light" },
      });
      registry.register("conv-1", inputSetDef);
      mockGatewayAdapter.getParcelDetails.mockResolvedValue([
        { parcelId: "p1", address: "A", zoningType: "M1", acres: 2.0 },
      ]);
      mockGatewayAdapter.screenParcels.mockResolvedValue([
        { parcelId: "p1", dimensions: ["flood"], envelope: { in_sfha: true }, screenedAt: new Date().toISOString() },
      ]);

      const result = await executor.execute(plan, registry, "conv-1");

      expect(result.sets[0].materialization!.screening).toHaveLength(1);
      expect(mockGatewayAdapter.screenParcels).toHaveBeenCalled();
    });

    it("skips screening when timing is agent-triggered", async () => {
      const inputSetDef = makeSelectionDef(["p1"]);
      const plan = makePlan({
        resolution: { kind: "selection-passthrough" },
        inputSets: [inputSetDef],
        screening: { dimensions: ["flood"], mode: "selective", batchSize: 8, priority: "speed" },
        directives: { materializationMode: "immediate", screeningTiming: "agent-triggered", authoritativeVerification: "required", freshnessMaxSeconds: null, estimatedCost: "light" },
      });
      registry.register("conv-1", inputSetDef);
      mockGatewayAdapter.getParcelDetails.mockResolvedValue([
        { parcelId: "p1", address: "A", zoningType: "M1", acres: 2.0 },
      ]);

      const result = await executor.execute(plan, registry, "conv-1");

      expect(result.sets[0].materialization!.screening).toEqual([]);
      expect(mockGatewayAdapter.screenParcels).not.toHaveBeenCalled();
    });
  });

  describe("registry integration", () => {
    it("registers resolved sets in the registry", async () => {
      const inputSetDef = makeSelectionDef(["p1"]);
      const plan = makePlan({
        resolution: { kind: "selection-passthrough" },
        inputSets: [inputSetDef],
      });
      registry.register("conv-1", inputSetDef);
      mockGatewayAdapter.getParcelDetails.mockResolvedValue([
        { parcelId: "p1", address: "A", zoningType: "M1", acres: 2.0 },
      ]);

      await executor.execute(plan, registry, "conv-1");

      const setIds = registry.listSetIds("conv-1");
      expect(setIds).toHaveLength(1);
      expect(registry.getDefinition("conv-1", setIds[0])?.status).toBe("materialized");
    });
  });

  describe("analytics computation", () => {
    it("returns analytics for materialized sets", async () => {
      const inputSetDef = makeSelectionDef(["p1", "p2"]);
      const plan = makePlan({
        resolution: { kind: "selection-passthrough" },
        inputSets: [inputSetDef],
      });
      registry.register("conv-1", inputSetDef);
      mockGatewayAdapter.getParcelDetails.mockResolvedValue([
        { parcelId: "p1", address: "A", zoningType: "M1", acres: 2.0 },
        { parcelId: "p2", address: "B", zoningType: "M1", acres: 3.0 },
      ]);

      const result = await executor.execute(plan, registry, "conv-1");

      expect(result.analytics).not.toBeNull();
      expect(result.analytics!.totalCount).toBe(2);
      expect(result.analytics!.distributions.zoningType).toEqual({ M1: 2 });
    });
  });
});

function makePlan(overrides: Partial<ParcelQueryPlan>): ParcelQueryPlan {
  return {
    id: "plan-test",
    intent: "identify",
    inputSets: [],
    resolution: { kind: "selection-passthrough" },
    filters: [],
    screening: null,
    scoring: null,
    outputMode: "list",
    directives: { materializationMode: "immediate", screeningTiming: "none", authoritativeVerification: "required", freshnessMaxSeconds: null, estimatedCost: "light" },
    memoryPolicy: { allowSemanticDiscovery: false, requireDbVerification: true, maxCandidatesFromMemory: 0, confidenceFloor: 0.7 },
    provenanceRequirements: { requireAuthoritative: true, maxStalenessSeconds: null, verifyMemoryResults: true },
    isFollowUp: false,
    ...overrides,
  };
}

function makeSelectionDef(parcelIds: string[]): ParcelSetDefinition {
  return { id: `set-${Math.random().toString(36).slice(2, 8)}`, orgId: "org-1", label: null, origin: { kind: "selection", parcelIds, source: "map" }, lifecycle: { kind: "ephemeral", scope: "conversation" }, status: "unresolved", createdAt: new Date().toISOString(), metadata: {} };
}

function makeViewportDef(): ParcelSetDefinition {
  return { id: `set-${Math.random().toString(36).slice(2, 8)}`, orgId: "org-1", label: null, origin: { kind: "viewport", spatial: { kind: "bbox", bounds: [-91.2, 30.4, -91.1, 30.5] } }, lifecycle: { kind: "ephemeral", scope: "conversation" }, status: "unresolved", createdAt: new Date().toISOString(), metadata: {} };
}
