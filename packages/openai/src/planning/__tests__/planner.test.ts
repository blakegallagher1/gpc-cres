/**
 * Tests for ParcelQueryPlanner
 *
 * Verifies intent classification, input set creation, resolution strategy selection,
 * filter extraction, screening planning, and directive assembly.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ParcelQueryPlanner } from "../planner";
import { ParcelSetRegistry } from "../registry";
import { MapContextInput } from "@entitlement-os/shared";

describe("ParcelQueryPlanner", () => {
  let planner: ParcelQueryPlanner;
  let registry: ParcelSetRegistry;
  const testOrgId = "test-org";
  const testConversationId = "test-conversation";

  beforeEach(() => {
    planner = new ParcelQueryPlanner();
    registry = new ParcelSetRegistry();
  });

  describe("Intent Classification (6 tests)", () => {
    it("should classify 'What are these parcels?' as identify with selected parcels", () => {
      const mapContext: MapContextInput = {
        selectedParcelIds: ["p1", "p2"],
      };

      const plan = planner.plan({
        message: "What are these parcels?",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.intent).toBe("identify");
    });

    it("should classify 'Show me M1 parcels over 2 acres' as filter", () => {
      const mapContext: MapContextInput = {
        center: { lat: 30.5, lng: -91.2 },
        zoom: 12,
      };

      const plan = planner.plan({
        message: "Show me M1 parcels over 2 acres",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.intent).toBe("filter");
    });

    it("should classify 'Check flood risk on the selected parcels' as screen", () => {
      const mapContext: MapContextInput = {
        selectedParcelIds: ["p1", "p2", "p3"],
      };

      const plan = planner.plan({
        message: "Check flood risk on the selected parcels",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.intent).toBe("screen");
    });

    it("should classify 'Compare these three parcels' as compare", () => {
      const mapContext: MapContextInput = {
        selectedParcelIds: ["p1", "p2", "p3"],
      };

      const plan = planner.plan({
        message: "Compare these three parcels",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.intent).toBe("compare");
    });

    it("should classify 'What is the weather today?' (no map context) as general", () => {
      const plan = planner.plan({
        message: "What is the weather today?",
        orgId: testOrgId,
        mapContext: null,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.intent).toBe("general");
    });

    it("should classify 'Find industrial parcels near the port' as discover", () => {
      const mapContext: MapContextInput = {
        center: { lat: 30.5, lng: -91.2 },
        zoom: 12,
      };

      const plan = planner.plan({
        message: "Find industrial parcels near the port",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.intent).toBe("discover");
    });
  });

  describe("Input Set Creation (3 tests)", () => {
    it("should create a selection set from selectedParcelIds", () => {
      const mapContext: MapContextInput = {
        selectedParcelIds: ["parcel-1", "parcel-2", "parcel-3"],
        viewportLabel: "Selected properties",
      };

      const plan = planner.plan({
        message: "What are these?",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.inputSets).toHaveLength(1);
      expect(plan.inputSets[0].origin.kind).toBe("selection");
      expect(plan.inputSets[0].origin).toHaveProperty("parcelIds");
      if (plan.inputSets[0].origin.kind === "selection") {
        expect(plan.inputSets[0].origin.parcelIds).toEqual([
          "parcel-1",
          "parcel-2",
          "parcel-3",
        ]);
      }
    });

    it("should create a viewport set from center and zoom", () => {
      const mapContext: MapContextInput = {
        center: { lat: 30.5, lng: -91.2 },
        zoom: 14,
      };

      const plan = planner.plan({
        message: "What do we have here?",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.inputSets).toHaveLength(1);
      expect(plan.inputSets[0].origin.kind).toBe("viewport");
      expect(plan.inputSets[0].origin).toHaveProperty("spatial");
      if (plan.inputSets[0].origin.kind === "viewport") {
        expect(plan.inputSets[0].origin.spatial.kind).toBe("bbox");
      }
    });

    it("should create a selection set from polygon parcel ids when no explicit selection exists", () => {
      const mapContext: MapContextInput = {
        spatialSelection: {
          kind: "polygon",
          coordinates: [[
            [-91.2, 30.4],
            [-91.1, 30.4],
            [-91.1, 30.5],
            [-91.2, 30.5],
            [-91.2, 30.4],
          ]],
          parcelIds: ["polygon-1", "polygon-2"],
          label: "Drawn polygon",
        },
      };

      const plan = planner.plan({
        message: "Summarize this polygon",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.inputSets).toHaveLength(1);
      expect(plan.inputSets[0].origin.kind).toBe("selection");
      if (plan.inputSets[0].origin.kind === "selection") {
        expect(plan.inputSets[0].origin.parcelIds).toEqual(["polygon-1", "polygon-2"]);
      }
    });

    it("should carry orgId on all created sets", () => {
      const mapContext: MapContextInput = {
        selectedParcelIds: ["p1"],
        center: { lat: 30.5, lng: -91.2 },
        zoom: 12,
      };

      const plan = planner.plan({
        message: "Show everything here",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.inputSets.length).toBeGreaterThan(0);
      plan.inputSets.forEach((set) => {
        expect(set.orgId).toBe(testOrgId);
      });
    });

    it("should not create mixed selection and viewport sets under a single plan", () => {
      const mapContext: MapContextInput = {
        selectedParcelIds: ["p1"],
        viewportBounds: {
          west: -91.22,
          south: 30.41,
          east: -91.16,
          north: 30.48,
        },
      };

      const plan = planner.plan({
        message: "Identify these parcels",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.inputSets).toHaveLength(1);
      expect(plan.inputSets[0].origin.kind).toBe("selection");
    });
  });

  describe("Resolution Strategy Selection (2 tests)", () => {
    it("should use selection-passthrough for identify intent with selection", () => {
      const mapContext: MapContextInput = {
        selectedParcelIds: ["p1", "p2"],
      };

      const plan = planner.plan({
        message: "Identify these parcels",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.resolution.kind).toBe("selection-passthrough");
    });

    it("should use bbox strategy for viewport-scoped filter queries", () => {
      const mapContext: MapContextInput = {
        viewportBounds: {
          west: -91.24,
          south: 30.39,
          east: -91.12,
          north: 30.51,
        },
      };

      const plan = planner.plan({
        message: "Show me M1 zoned parcels",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.resolution.kind).toBe("bbox");
      if (plan.resolution.kind === "bbox") {
        expect(plan.resolution.spatial.kind).toBe("bbox");
      }
    });
  });

  describe("Filter Extraction (2 tests)", () => {
    it("should extract zoning filter from 'Show me M1 zoned parcels'", () => {
      const mapContext: MapContextInput = {
        center: { lat: 30.5, lng: -91.2 },
        zoom: 12,
      };

      const plan = planner.plan({
        message: "Show me M1 zoned parcels",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.filters.length).toBeGreaterThan(0);
      const zoningFilter = plan.filters.find((f) => f.field === "zoningType");
      expect(zoningFilter).toBeDefined();
      expect(zoningFilter?.operator).toBe("in");
      expect(zoningFilter?.value).toContain("M1");
    });

    it("should extract acreage filter from 'Parcels over 5 acres'", () => {
      const mapContext: MapContextInput = {
        center: { lat: 30.5, lng: -91.2 },
        zoom: 12,
      };

      const plan = planner.plan({
        message: "Show me parcels over 5 acres",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.filters.length).toBeGreaterThan(0);
      const acresFilter = plan.filters.find((f) => f.field === "acres");
      expect(acresFilter).toBeDefined();
      expect(acresFilter?.operator).toBe("gte");
      expect(acresFilter?.value).toBe(5);
    });
  });

  describe("Screening Planning (1 test)", () => {
    it("should plan flood screening for flood-related queries", () => {
      const mapContext: MapContextInput = {
        selectedParcelIds: ["p1", "p2"],
      };

      const plan = planner.plan({
        message: "Check flood risk on these parcels",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.screening).toBeDefined();
      expect(plan.screening?.dimensions).toContain("flood");
    });
  });

  describe("Plan Structure (4 tests)", () => {
    it("should generate a valid plan ID", () => {
      const plan = planner.plan({
        message: "Test message",
        orgId: testOrgId,
        mapContext: null,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.id).toBeDefined();
      expect(plan.id.length).toBeGreaterThan(0);
      // Should be a UUID
      expect(plan.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it("should always include execution directives", () => {
      const plan = planner.plan({
        message: "Any message",
        orgId: testOrgId,
        mapContext: null,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.directives).toBeDefined();
      expect(plan.directives.materializationMode).toBe("immediate");
      expect(plan.directives.authoritativeVerification).toBe("required");
      expect(plan.directives.estimatedCost).toMatch(/light|moderate|heavy/);
    });

    it("should always include memory policy (Phase 1 conservative)", () => {
      const plan = planner.plan({
        message: "Any message",
        orgId: testOrgId,
        mapContext: null,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.memoryPolicy).toBeDefined();
      expect(plan.memoryPolicy.allowSemanticDiscovery).toBe(false);
      expect(plan.memoryPolicy.requireDbVerification).toBe(true);
    });

    it("should set output mode based on intent", () => {
      // Test identify + detail
      let mapContext: MapContextInput = {
        selectedParcelIds: ["p1"],
      };
      let plan = planner.plan({
        message: "What are these?",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });
      expect(plan.outputMode).toBe("detail");

      // Test summarize + summary
      plan = planner.plan({
        message: "Summarize here",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });
      expect(plan.outputMode).toBe("summary");

      // Test filter + list (note: viewport context needed for filter to work)
      mapContext = {
        center: { lat: 30.5, lng: -91.2 },
        zoom: 12,
      };
      plan = planner.plan({
        message: "Show M1 parcels",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });
      expect(plan.outputMode).toBe("list");

      // Test rank + comparison (with selection context)
      mapContext = {
        selectedParcelIds: ["p1", "p2"],
      };
      plan = planner.plan({
        message: "Rank these",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });
      expect(plan.outputMode).toBe("comparison");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty selectedParcelIds", () => {
      const mapContext: MapContextInput = {
        selectedParcelIds: [],
      };

      const plan = planner.plan({
        message: "Query",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.inputSets).toHaveLength(0);
    });

    it("should handle null mapContext", () => {
      const plan = planner.plan({
        message: "General query",
        orgId: testOrgId,
        mapContext: null,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.intent).toBe("general");
      expect(plan.inputSets).toHaveLength(0);
    });

    it("should extract multiple filters from a single message", () => {
      const mapContext: MapContextInput = {
        center: { lat: 30.5, lng: -91.2 },
        zoom: 12,
      };

      const plan = planner.plan({
        message: "Show me M1 or C2 zoned parcels over 3 acres",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      expect(plan.filters.length).toBeGreaterThanOrEqual(2);
    });

    it("should detect follow-up queries", () => {
      const conversationHistory = [
        "Show me industrial parcels",
        "What about flooding?",
      ];

      const plan = planner.plan({
        message: "And soils?",
        orgId: testOrgId,
        mapContext: null,
        registry,
        conversationId: testConversationId,
        conversationHistory,
      });

      expect(plan.isFollowUp).toBe(true);
    });

    it("should handle zoning codes with different cases", () => {
      const mapContext: MapContextInput = {
        center: { lat: 30.5, lng: -91.2 },
        zoom: 12,
      };

      const plan = planner.plan({
        message: "Show me m1 and M2 parcels",
        orgId: testOrgId,
        mapContext,
        registry,
        conversationId: testConversationId,
      });

      const zoningFilter = plan.filters.find((f) => f.field === "zoningType");
      expect(zoningFilter?.value).toContain("M1");
      expect(zoningFilter?.value).toContain("M2");
    });
  });
});
