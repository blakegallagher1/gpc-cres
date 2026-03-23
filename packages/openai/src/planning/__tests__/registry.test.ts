import { describe, it, expect, beforeEach } from "vitest";
import {
  ParcelSetDefinition,
  ParcelSetMaterialization,
  ParcelFacts,
  ParcelScreeningResult,
} from "@entitlement-os/shared";
import { ParcelSetRegistry } from "../registry";

describe("ParcelSetRegistry", () => {
  let registry: ParcelSetRegistry;
  const conversationId = "conv-123";
  const otherConversationId = "conv-456";

  beforeEach(() => {
    registry = new ParcelSetRegistry();
  });

  describe("register and retrieve", () => {
    it("should register a definition and retrieve it by ID", () => {
      const definition: ParcelSetDefinition = {
        id: "set-1",
        orgId: "org-1",
        label: "Test Set",
        origin: {
          kind: "viewport",
          spatial: { kind: "bbox", bounds: [0, 0, 1, 1] },
        },
        lifecycle: { kind: "ephemeral", scope: "conversation" },
        status: "unresolved",
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      registry.register(conversationId, definition);

      const retrieved = registry.getDefinition(conversationId, "set-1");
      expect(retrieved).toEqual(definition);
    });

    it("should return null for unknown set ID", () => {
      const retrieved = registry.getDefinition(conversationId, "unknown-set");
      expect(retrieved).toBeNull();
    });

    it("should return null for unknown conversation", () => {
      const definition: ParcelSetDefinition = {
        id: "set-1",
        orgId: "org-1",
        label: "Test Set",
        origin: {
          kind: "selection",
          parcelIds: ["p1"],
          source: "map",
        },
        lifecycle: { kind: "ephemeral", scope: "conversation" },
        status: "unresolved",
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      registry.register(conversationId, definition);

      const retrieved = registry.getDefinition(
        "unknown-conv",
        "set-1"
      );
      expect(retrieved).toBeNull();
    });
  });

  describe("listSetIds", () => {
    it("should list all set IDs for a conversation", () => {
      const def1: ParcelSetDefinition = {
        id: "set-1",
        orgId: "org-1",
        label: "Set 1",
        origin: {
          kind: "viewport",
          spatial: { kind: "bbox", bounds: [0, 0, 1, 1] },
        },
        lifecycle: { kind: "ephemeral", scope: "conversation" },
        status: "unresolved",
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      const def2: ParcelSetDefinition = {
        id: "set-2",
        orgId: "org-1",
        label: "Set 2",
        origin: {
          kind: "selection",
          parcelIds: ["p1", "p2"],
          source: "deal",
        },
        lifecycle: { kind: "ephemeral", scope: "conversation" },
        status: "unresolved",
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      registry.register(conversationId, def1);
      registry.register(conversationId, def2);

      const setIds = registry.listSetIds(conversationId);
      expect(setIds).toHaveLength(2);
      expect(setIds).toContain("set-1");
      expect(setIds).toContain("set-2");
    });

    it("should return empty array for unknown conversation", () => {
      const setIds = registry.listSetIds("unknown-conv");
      expect(setIds).toEqual([]);
    });
  });

  describe("materialization", () => {
    it("should store and retrieve materialization", () => {
      const definition: ParcelSetDefinition = {
        id: "set-1",
        orgId: "org-1",
        label: "Test Set",
        origin: {
          kind: "viewport",
          spatial: { kind: "bbox", bounds: [0, 0, 1, 1] },
        },
        lifecycle: { kind: "ephemeral", scope: "conversation" },
        status: "unresolved",
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      registry.register(conversationId, definition);

      const facts: ParcelFacts[] = [
        {
          parcelId: "p1",
          address: "123 Main St",
          owner: "John Doe",
          acres: 5,
          zoningType: "M1",
          center: [30.2, -91.1],
          parish: "EBR",
          assessedValue: 100000,
        },
      ];

      const screening: ParcelScreeningResult[] = [
        {
          parcelId: "p1",
          dimensions: ["flood", "zoning"],
          envelope: { flood: "SFHA", zoning: "M1" },
          screenedAt: new Date().toISOString(),
        },
      ];

      const materialization: ParcelSetMaterialization = {
        parcelSetId: "set-1",
        memberIds: ["p1"],
        count: 1,
        facts,
        screening,
        provenance: {
          sourceKind: "database",
          sourceRoute: "/api/parcels",
          authoritative: true,
          confidence: 0.95,
          resolvedAt: new Date().toISOString(),
          freshness: "fresh",
        },
        materializedAt: new Date().toISOString(),
      };

      registry.updateMaterialization(conversationId, materialization);

      const retrieved = registry.getMaterialization(conversationId, "set-1");
      expect(retrieved).toEqual(materialization);
      expect(retrieved?.count).toBe(1);
    });

    it("should throw when updating materialization for unknown set", () => {
      // Register a definition first to establish the conversation
      const definition: ParcelSetDefinition = {
        id: "set-1",
        orgId: "org-1",
        label: "Test Set",
        origin: {
          kind: "viewport",
          spatial: { kind: "bbox", bounds: [0, 0, 1, 1] },
        },
        lifecycle: { kind: "ephemeral", scope: "conversation" },
        status: "unresolved",
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      registry.register(conversationId, definition);

      const materialization: ParcelSetMaterialization = {
        parcelSetId: "unknown-set",
        memberIds: [],
        count: 0,
        facts: [],
        screening: [],
        provenance: {
          sourceKind: "database",
          sourceRoute: "/api/parcels",
          authoritative: true,
          confidence: null,
          resolvedAt: new Date().toISOString(),
          freshness: "fresh",
        },
        materializedAt: new Date().toISOString(),
      };

      expect(() => {
        registry.updateMaterialization(conversationId, materialization);
      }).toThrow(/not found/i);
    });
  });

  describe("status management", () => {
    it("should update definition status", () => {
      const definition: ParcelSetDefinition = {
        id: "set-1",
        orgId: "org-1",
        label: "Test Set",
        origin: {
          kind: "viewport",
          spatial: { kind: "bbox", bounds: [0, 0, 1, 1] },
        },
        lifecycle: { kind: "ephemeral", scope: "conversation" },
        status: "unresolved",
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      registry.register(conversationId, definition);

      registry.updateStatus(conversationId, "set-1", "resolving");
      let retrieved = registry.getDefinition(conversationId, "set-1");
      expect(retrieved?.status).toBe("resolving");

      registry.updateStatus(conversationId, "set-1", "materialized");
      retrieved = registry.getDefinition(conversationId, "set-1");
      expect(retrieved?.status).toBe("materialized");
    });

    it("should throw when updating status for unknown set", () => {
      // Register a definition first to establish the conversation
      const definition: ParcelSetDefinition = {
        id: "set-1",
        orgId: "org-1",
        label: "Test Set",
        origin: {
          kind: "viewport",
          spatial: { kind: "bbox", bounds: [0, 0, 1, 1] },
        },
        lifecycle: { kind: "ephemeral", scope: "conversation" },
        status: "unresolved",
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      registry.register(conversationId, definition);

      expect(() => {
        registry.updateStatus(conversationId, "unknown-set", "materialized");
      }).toThrow(/not found/i);
    });
  });

  describe("markStaleByOrigin", () => {
    it("should mark sets stale by origin kind (viewport sets)", () => {
      const viewportSet: ParcelSetDefinition = {
        id: "viewport-set",
        orgId: "org-1",
        label: "Viewport",
        origin: {
          kind: "viewport",
          spatial: { kind: "bbox", bounds: [0, 0, 1, 1] },
        },
        lifecycle: { kind: "ephemeral", scope: "conversation" },
        status: "materialized",
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      const selectionSet: ParcelSetDefinition = {
        id: "selection-set",
        orgId: "org-1",
        label: "Selection",
        origin: {
          kind: "selection",
          parcelIds: ["p1"],
          source: "map",
        },
        lifecycle: { kind: "ephemeral", scope: "conversation" },
        status: "materialized",
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      registry.register(conversationId, viewportSet);
      registry.register(conversationId, selectionSet);

      registry.markStaleByOrigin(conversationId, "viewport");

      const viewportRetrieved = registry.getDefinition(
        conversationId,
        "viewport-set"
      );
      const selectionRetrieved = registry.getDefinition(
        conversationId,
        "selection-set"
      );

      expect(viewportRetrieved?.status).toBe("stale");
      expect(selectionRetrieved?.status).toBe("materialized");
    });

    it("should do nothing for unknown conversation", () => {
      expect(() => {
        registry.markStaleByOrigin("unknown-conv", "viewport");
      }).not.toThrow();
    });
  });

  describe("conversation isolation", () => {
    it("should isolate sets between conversations", () => {
      const def1: ParcelSetDefinition = {
        id: "shared-id",
        orgId: "org-1",
        label: "Set in Conv 1",
        origin: {
          kind: "viewport",
          spatial: { kind: "bbox", bounds: [0, 0, 1, 1] },
        },
        lifecycle: { kind: "ephemeral", scope: "conversation" },
        status: "unresolved",
        createdAt: new Date().toISOString(),
        metadata: { conv: "1" },
      };

      const def2: ParcelSetDefinition = {
        id: "shared-id",
        orgId: "org-1",
        label: "Set in Conv 2",
        origin: {
          kind: "selection",
          parcelIds: ["p1"],
          source: "map",
        },
        lifecycle: { kind: "ephemeral", scope: "conversation" },
        status: "materialized",
        createdAt: new Date().toISOString(),
        metadata: { conv: "2" },
      };

      registry.register(conversationId, def1);
      registry.register(otherConversationId, def2);

      const retrieved1 = registry.getDefinition(conversationId, "shared-id");
      const retrieved2 = registry.getDefinition(
        otherConversationId,
        "shared-id"
      );

      expect(retrieved1?.metadata.conv).toBe("1");
      expect(retrieved2?.metadata.conv).toBe("2");
      expect(retrieved1?.status).toBe("unresolved");
      expect(retrieved2?.status).toBe("materialized");
    });

    it("should not affect other conversations when marking stale", () => {
      const def1: ParcelSetDefinition = {
        id: "viewport-set",
        orgId: "org-1",
        label: "Viewport",
        origin: {
          kind: "viewport",
          spatial: { kind: "bbox", bounds: [0, 0, 1, 1] },
        },
        lifecycle: { kind: "ephemeral", scope: "conversation" },
        status: "materialized",
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      const def2: ParcelSetDefinition = {
        id: "viewport-set",
        orgId: "org-1",
        label: "Viewport",
        origin: {
          kind: "viewport",
          spatial: { kind: "bbox", bounds: [1, 1, 2, 2] },
        },
        lifecycle: { kind: "ephemeral", scope: "conversation" },
        status: "materialized",
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      registry.register(conversationId, def1);
      registry.register(otherConversationId, def2);

      registry.markStaleByOrigin(conversationId, "viewport");

      const retrieved1 = registry.getDefinition(conversationId, "viewport-set");
      const retrieved2 = registry.getDefinition(
        otherConversationId,
        "viewport-set"
      );

      expect(retrieved1?.status).toBe("stale");
      expect(retrieved2?.status).toBe("materialized");
    });
  });
});
