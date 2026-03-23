# Parcel Intelligence Spine — Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace prompt-shaped map context with a typed parcel query planner/executor that creates structured analytical context for the agent.

**Architecture:** Hybrid (Approach C). Planner creates ParcelSetDefinitions from map context + user intent, executor materializes them via gateway service adapters, analytics layer summarizes them, agent receives StructuredParcelContext instead of text prefix. One read-only agent tool (`describe_parcel_set`) exercises the runtime boundary.

**Tech Stack:** TypeScript, Zod (for tool schemas), Vitest, OpenAI Agents SDK, existing gateway service adapters in propertyDbTools.ts

**Design Doc:** `docs/plans/2026-03-22-parcel-intelligence-spine-design.md`

---

### Task 1: Shared Contract Types

**Files:**
- Create: `packages/shared/src/types/parcelIntelligence.ts`
- Modify: `packages/shared/src/index.ts` (add export line)
- Test: `packages/shared/test/parcelIntelligence.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/shared/test/parcelIntelligence.test.ts
import { describe, it, expect } from "vitest";
import type {
  ParcelSetDefinition,
  ParcelSetMaterialization,
  ParcelQueryPlan,
  StructuredParcelContext,
  SetAnalytics,
  ParcelSetStatus,
  SpatialScope,
} from "../src/types/parcelIntelligence.js";

describe("parcelIntelligence types", () => {
  it("ParcelSetDefinition is constructable with required fields", () => {
    const def: ParcelSetDefinition = {
      id: "set-1",
      orgId: "org-1",
      label: null,
      origin: { kind: "selection", parcelIds: ["p1", "p2"], source: "map" },
      lifecycle: { kind: "ephemeral", scope: "conversation" },
      status: "unresolved",
      createdAt: new Date().toISOString(),
      metadata: {},
    };
    expect(def.id).toBe("set-1");
    expect(def.origin.kind).toBe("selection");
  });

  it("ParcelSetMaterialization carries facts and screening arrays", () => {
    const mat: ParcelSetMaterialization = {
      parcelSetId: "set-1",
      memberIds: ["p1", "p2"],
      count: 2,
      facts: [
        { parcelId: "p1", address: "123 Main", owner: null, acres: 1.5, zoningType: "M1", center: [-91.18, 30.45], parish: "East Baton Rouge", assessedValue: null },
      ],
      screening: [],
      provenance: { sourceKind: "database", sourceRoute: "/tools/parcels.sql", authoritative: true, confidence: null, resolvedAt: new Date().toISOString(), freshness: "fresh" },
      materializedAt: new Date().toISOString(),
    };
    expect(mat.facts).toHaveLength(1);
    expect(mat.provenance.authoritative).toBe(true);
  });

  it("SetAnalytics computes distributions shape", () => {
    const analytics: SetAnalytics = {
      totalCount: 10,
      distributions: { zoningType: { M1: 6, C2: 4 } },
      screeningSummary: null,
      topConstraints: ["60% zoned M1"],
      scoringSummary: null,
    };
    expect(analytics.distributions.zoningType.M1).toBe(6);
  });

  it("ParcelQueryPlan carries resolution strategy and directives", () => {
    const plan: ParcelQueryPlan = {
      id: "plan-1",
      intent: "filter",
      inputSets: [],
      resolution: { kind: "bbox", spatial: { kind: "bbox", bounds: [-91.2, 30.4, -91.1, 30.5] }, limit: 100 },
      filters: [{ field: "zoningType", operator: "eq", value: "M1" }],
      screening: null,
      scoring: null,
      outputMode: "list",
      directives: { materializationMode: "immediate", screeningTiming: "none", authoritativeVerification: "required", freshnessMaxSeconds: null, estimatedCost: "light" },
      memoryPolicy: { allowSemanticDiscovery: false, requireDbVerification: true, maxCandidatesFromMemory: 0, confidenceFloor: 0.7 },
      provenanceRequirements: { requireAuthoritative: true, maxStalenessSeconds: null, verifyMemoryResults: true },
      isFollowUp: false,
    };
    expect(plan.resolution.kind).toBe("bbox");
    expect(plan.directives.materializationMode).toBe("immediate");
  });

  it("StructuredParcelContext replaces text prefix", () => {
    const ctx: StructuredParcelContext = {
      plan: {} as ParcelQueryPlan,
      sets: [],
      conversationSetRegistry: [],
      intent: "summarize",
      outputMode: "summary",
    };
    expect(ctx.intent).toBe("summarize");
  });

  it("SpatialScope supports bbox, polygon, and radius", () => {
    const bbox: SpatialScope = { kind: "bbox", bounds: [-91.2, 30.4, -91.1, 30.5] };
    const poly: SpatialScope = { kind: "polygon", coordinates: [[[-91.2, 30.4], [-91.1, 30.4], [-91.1, 30.5], [-91.2, 30.5], [-91.2, 30.4]]] };
    const rad: SpatialScope = { kind: "radius", center: [-91.15, 30.45], radiusMeters: 500 };
    expect(bbox.kind).toBe("bbox");
    expect(poly.kind).toBe("polygon");
    expect(rad.kind).toBe("radius");
  });

  it("ParcelSetStatus covers full lifecycle", () => {
    const statuses: ParcelSetStatus[] = ["unresolved", "resolving", "materialized", "stale", "failed"];
    expect(statuses).toHaveLength(5);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @entitlement-os/shared exec vitest run test/parcelIntelligence.test.ts`
Expected: FAIL — module not found

**Step 3: Write the types**

Create `packages/shared/src/types/parcelIntelligence.ts` with all type definitions from the design doc. This file is types only — zero runtime code.

Key types to define:
- `SpatialScope` (bbox | polygon | radius)
- `ParcelSetOrigin` (viewport | selection | query | spatial | refinement | saved)
- `ParcelSetStatus` (unresolved | resolving | materialized | stale | failed)
- `ParcelSetLifecycle` (ephemeral | persistent)
- `ParcelSetDefinition`
- `ParcelFacts`
- `ParcelScreeningResult`, `ScreeningDimension`
- `ParcelSetMaterialization`
- `ParcelSetProvenance`
- `ParcelFilter`, `SetOperation`
- `ParcelQueryIntent`
- `ResolutionStrategy`
- `ExecutionDirectives`
- `MemoryPolicy`
- `ScreeningStrategy`
- `ScoringObjective`, `ScoringCriterion`, `EligibilityGate`
- `RankingObjective` (alias for ScoringObjective for compat)
- `OutputMode`
- `ProvenanceRequirements`
- `ParcelQueryPlan`
- `SetAnalytics`, `ScreeningSummary`
- `StructuredParcelContext`

**Step 4: Add export to shared index**

Add to `packages/shared/src/index.ts` after line 15 (`export * from "./types/mapChat.js"`):
```typescript
export * from "./types/parcelIntelligence.js";
```

**Step 5: Run test to verify it passes**

Run: `pnpm --filter @entitlement-os/shared build && pnpm --filter @entitlement-os/shared exec vitest run test/parcelIntelligence.test.ts`
Expected: PASS — all 7 tests

**Step 6: Commit**

```bash
git add packages/shared/src/types/parcelIntelligence.ts packages/shared/src/index.ts packages/shared/test/parcelIntelligence.test.ts
git commit -m "feat(planning): add parcel intelligence shared contract types"
```

---

### Task 2: Field Catalog

**Files:**
- Create: `packages/openai/src/planning/fields.ts`
- Test: `packages/openai/src/planning/__tests__/fields.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/openai/src/planning/__tests__/fields.test.ts
import { describe, it, expect } from "vitest";
import { ParcelFieldCatalog, resolveField, isValidField } from "../fields.js";

describe("ParcelFieldCatalog", () => {
  it("contains known property DB columns", () => {
    expect(ParcelFieldCatalog.zoningType).toBeDefined();
    expect(ParcelFieldCatalog.acres).toBeDefined();
    expect(ParcelFieldCatalog.owner).toBeDefined();
    expect(ParcelFieldCatalog.address).toBeDefined();
    expect(ParcelFieldCatalog.parish).toBeDefined();
  });

  it("resolveField normalizes aliases to canonical names", () => {
    expect(resolveField("zoning_type")).toBe("zoningType");
    expect(resolveField("area_acres")).toBe("acres");
    expect(resolveField("site_addr")).toBe("address");
    expect(resolveField("owner_name")).toBe("owner");
    expect(resolveField("zoningType")).toBe("zoningType");
  });

  it("resolveField returns null for unknown fields", () => {
    expect(resolveField("nonexistent_column")).toBeNull();
  });

  it("isValidField checks catalog membership", () => {
    expect(isValidField("zoningType")).toBe(true);
    expect(isValidField("acres")).toBe(true);
    expect(isValidField("bogus")).toBe(false);
  });

  it("each field has dbColumn and type metadata", () => {
    const field = ParcelFieldCatalog.acres;
    expect(field.dbColumn).toBe("area_acres");
    expect(field.type).toBe("number");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @entitlement-os/openai exec vitest run src/planning/__tests__/fields.test.ts`
Expected: FAIL — module not found

**Step 3: Write the field catalog**

Create `packages/openai/src/planning/fields.ts`:
- `ParcelFieldCatalog` — object mapping canonical field names to `{ dbColumn, type, aliases }` metadata
- Fields: `parcelId`, `address`, `owner`, `acres`, `zoningType`, `center`, `parish`, `assessedValue`, `latitude`, `longitude`
- `resolveField(input: string): string | null` — normalizes snake_case/camelCase aliases to canonical names
- `isValidField(name: string): boolean` — checks if a name is in the catalog

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @entitlement-os/openai exec vitest run src/planning/__tests__/fields.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/openai/src/planning/fields.ts packages/openai/src/planning/__tests__/fields.test.ts
git commit -m "feat(planning): add parcel field catalog with alias resolution"
```

---

### Task 3: ParcelSetRegistry

**Files:**
- Create: `packages/openai/src/planning/registry.ts`
- Test: `packages/openai/src/planning/__tests__/registry.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/openai/src/planning/__tests__/registry.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { ParcelSetRegistry } from "../registry.js";
import type { ParcelSetDefinition, ParcelSetMaterialization } from "@entitlement-os/shared";

describe("ParcelSetRegistry", () => {
  let registry: ParcelSetRegistry;

  beforeEach(() => {
    registry = new ParcelSetRegistry();
  });

  it("registers a definition and retrieves it by ID", () => {
    const def: ParcelSetDefinition = {
      id: "set-1", orgId: "org-1", label: null,
      origin: { kind: "selection", parcelIds: ["p1"], source: "map" },
      lifecycle: { kind: "ephemeral", scope: "conversation" },
      status: "unresolved", createdAt: new Date().toISOString(), metadata: {},
    };
    registry.register("conv-1", def);
    expect(registry.getDefinition("conv-1", "set-1")).toEqual(def);
  });

  it("returns null for unknown set ID", () => {
    expect(registry.getDefinition("conv-1", "nope")).toBeNull();
  });

  it("lists all set IDs for a conversation", () => {
    const def1 = makeDefinition("set-1", "org-1");
    const def2 = makeDefinition("set-2", "org-1");
    registry.register("conv-1", def1);
    registry.register("conv-1", def2);
    expect(registry.listSetIds("conv-1")).toEqual(["set-1", "set-2"]);
  });

  it("stores and retrieves materialization", () => {
    const def = makeDefinition("set-1", "org-1");
    registry.register("conv-1", def);
    const mat: ParcelSetMaterialization = {
      parcelSetId: "set-1", memberIds: ["p1", "p2"], count: 2,
      facts: [], screening: [],
      provenance: { sourceKind: "database", sourceRoute: null, authoritative: true, confidence: null, resolvedAt: new Date().toISOString(), freshness: "fresh" },
      materializedAt: new Date().toISOString(),
    };
    registry.updateMaterialization("conv-1", mat);
    expect(registry.getMaterialization("conv-1", "set-1")?.memberIds).toEqual(["p1", "p2"]);
  });

  it("updates definition status", () => {
    const def = makeDefinition("set-1", "org-1");
    registry.register("conv-1", def);
    registry.updateStatus("conv-1", "set-1", "materialized");
    expect(registry.getDefinition("conv-1", "set-1")?.status).toBe("materialized");
  });

  it("marks sets stale by origin kind", () => {
    const viewportDef = makeDefinition("set-v", "org-1", "viewport");
    const selectionDef = makeDefinition("set-s", "org-1", "selection");
    registry.register("conv-1", viewportDef);
    registry.register("conv-1", selectionDef);
    registry.updateStatus("conv-1", "set-v", "materialized");
    registry.updateStatus("conv-1", "set-s", "materialized");
    registry.markStaleByOrigin("conv-1", "viewport");
    expect(registry.getDefinition("conv-1", "set-v")?.status).toBe("stale");
    expect(registry.getDefinition("conv-1", "set-s")?.status).toBe("materialized");
  });

  it("isolates conversations from each other", () => {
    registry.register("conv-1", makeDefinition("set-1", "org-1"));
    registry.register("conv-2", makeDefinition("set-2", "org-1"));
    expect(registry.listSetIds("conv-1")).toEqual(["set-1"]);
    expect(registry.listSetIds("conv-2")).toEqual(["set-2"]);
  });
});

function makeDefinition(id: string, orgId: string, originKind: string = "selection"): ParcelSetDefinition {
  const origin = originKind === "viewport"
    ? { kind: "viewport" as const, spatial: { kind: "bbox" as const, bounds: [-91.2, 30.4, -91.1, 30.5] as [number, number, number, number] } }
    : { kind: "selection" as const, parcelIds: ["p1"], source: "map" as const };
  return { id, orgId, label: null, origin, lifecycle: { kind: "ephemeral", scope: "conversation" }, status: "unresolved", createdAt: new Date().toISOString(), metadata: {} };
}
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @entitlement-os/shared build && pnpm --filter @entitlement-os/openai exec vitest run src/planning/__tests__/registry.test.ts`
Expected: FAIL — module not found

**Step 3: Write the registry**

Create `packages/openai/src/planning/registry.ts`:
- `ParcelSetRegistry` class with a `Map<conversationId, Map<setId, { definition, materialization }>>` internal store
- Methods: `register()`, `getDefinition()`, `getMaterialization()`, `updateMaterialization()`, `updateStatus()`, `listSetIds()`, `markStaleByOrigin()`
- All methods are conversation-scoped (first param is `conversationId`)

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @entitlement-os/shared build && pnpm --filter @entitlement-os/openai exec vitest run src/planning/__tests__/registry.test.ts`
Expected: PASS — all 7 tests

**Step 5: Commit**

```bash
git add packages/openai/src/planning/registry.ts packages/openai/src/planning/__tests__/registry.test.ts
git commit -m "feat(planning): add conversation-scoped ParcelSetRegistry"
```

---

### Task 4: Analytics

**Files:**
- Create: `packages/openai/src/planning/analytics.ts`
- Test: `packages/openai/src/planning/__tests__/analytics.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/openai/src/planning/__tests__/analytics.test.ts
import { describe, it, expect } from "vitest";
import { computeAnalytics } from "../analytics.js";
import type { ParcelSetMaterialization } from "@entitlement-os/shared";

describe("computeAnalytics", () => {
  it("computes totalCount from materialization", () => {
    const mat = makeMaterialization([
      { parcelId: "p1", zoningType: "M1", acres: 2.0 },
      { parcelId: "p2", zoningType: "C2", acres: 1.5 },
      { parcelId: "p3", zoningType: "M1", acres: 3.0 },
    ]);
    const analytics = computeAnalytics(mat);
    expect(analytics.totalCount).toBe(3);
  });

  it("computes zoning distribution", () => {
    const mat = makeMaterialization([
      { parcelId: "p1", zoningType: "M1", acres: 2.0 },
      { parcelId: "p2", zoningType: "C2", acres: 1.5 },
      { parcelId: "p3", zoningType: "M1", acres: 3.0 },
    ]);
    const analytics = computeAnalytics(mat);
    expect(analytics.distributions.zoningType).toEqual({ M1: 2, C2: 1 });
  });

  it("computes flood exposure summary from screening", () => {
    const mat = makeMaterialization(
      [{ parcelId: "p1" }, { parcelId: "p2" }, { parcelId: "p3" }],
      [
        { parcelId: "p1", dimensions: ["flood"], envelope: { in_sfha: true }, screenedAt: new Date().toISOString() },
        { parcelId: "p2", dimensions: ["flood"], envelope: { in_sfha: false }, screenedAt: new Date().toISOString() },
        { parcelId: "p3", dimensions: ["flood"], envelope: { in_sfha: true }, screenedAt: new Date().toISOString() },
      ],
    );
    const analytics = computeAnalytics(mat);
    expect(analytics.screeningSummary?.floodExposure).toEqual({ sfhaCount: 2, totalCount: 3 });
  });

  it("generates topConstraints strings", () => {
    const mat = makeMaterialization(
      [{ parcelId: "p1", zoningType: "M1" }, { parcelId: "p2", zoningType: "M1" }],
      [
        { parcelId: "p1", dimensions: ["flood"], envelope: { in_sfha: true }, screenedAt: new Date().toISOString() },
        { parcelId: "p2", dimensions: ["flood"], envelope: { in_sfha: true }, screenedAt: new Date().toISOString() },
      ],
    );
    const analytics = computeAnalytics(mat);
    expect(analytics.topConstraints.length).toBeGreaterThan(0);
    expect(analytics.topConstraints.some((c) => c.includes("flood"))).toBe(true);
  });

  it("handles empty materialization", () => {
    const mat = makeMaterialization([]);
    const analytics = computeAnalytics(mat);
    expect(analytics.totalCount).toBe(0);
    expect(analytics.distributions).toEqual({});
    expect(analytics.screeningSummary).toBeNull();
    expect(analytics.topConstraints).toEqual([]);
  });

  it("computes wetland exposure from screening", () => {
    const mat = makeMaterialization(
      [{ parcelId: "p1" }, { parcelId: "p2" }],
      [
        { parcelId: "p1", dimensions: ["wetlands"], envelope: { has_wetlands: true }, screenedAt: new Date().toISOString() },
        { parcelId: "p2", dimensions: ["wetlands"], envelope: { has_wetlands: false }, screenedAt: new Date().toISOString() },
      ],
    );
    const analytics = computeAnalytics(mat);
    expect(analytics.screeningSummary?.wetlandExposure).toEqual({ affectedCount: 1, totalCount: 2 });
  });
});

function makeMaterialization(
  facts: Partial<import("@entitlement-os/shared").ParcelFacts>[],
  screening: import("@entitlement-os/shared").ParcelScreeningResult[] = [],
): ParcelSetMaterialization {
  return {
    parcelSetId: "test-set",
    memberIds: facts.map((f) => f.parcelId ?? "unknown"),
    count: facts.length,
    facts: facts.map((f) => ({
      parcelId: f.parcelId ?? "unknown",
      address: f.address ?? null,
      owner: f.owner ?? null,
      acres: f.acres ?? null,
      zoningType: f.zoningType ?? null,
      center: f.center ?? null,
      parish: f.parish ?? null,
      assessedValue: f.assessedValue ?? null,
    })),
    screening,
    provenance: { sourceKind: "database", sourceRoute: null, authoritative: true, confidence: null, resolvedAt: new Date().toISOString(), freshness: "fresh" },
    materializedAt: new Date().toISOString(),
  };
}
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @entitlement-os/shared build && pnpm --filter @entitlement-os/openai exec vitest run src/planning/__tests__/analytics.test.ts`
Expected: FAIL

**Step 3: Write analytics module**

Create `packages/openai/src/planning/analytics.ts`:
- `computeAnalytics(mat: ParcelSetMaterialization): SetAnalytics`
- Computes: `totalCount`, `distributions` (zoningType, parish), `screeningSummary` (flood exposure, wetland exposure, EPA proximity), `topConstraints` (human-readable strings like "67% in SFHA flood zone")
- Pure function, no side effects, no gateway calls

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @entitlement-os/shared build && pnpm --filter @entitlement-os/openai exec vitest run src/planning/__tests__/analytics.test.ts`
Expected: PASS — all 6 tests

**Step 5: Commit**

```bash
git add packages/openai/src/planning/analytics.ts packages/openai/src/planning/__tests__/analytics.test.ts
git commit -m "feat(planning): add SetAnalytics computation with distributions and screening summaries"
```

---

### Task 5: ParcelQueryPlanner

**Files:**
- Create: `packages/openai/src/planning/planner.ts`
- Test: `packages/openai/src/planning/__tests__/planner.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/openai/src/planning/__tests__/planner.test.ts
import { describe, it, expect } from "vitest";
import { ParcelQueryPlanner } from "../planner.js";
import type { MapContextInput } from "@entitlement-os/shared";
import { ParcelSetRegistry } from "../registry.js";

describe("ParcelQueryPlanner", () => {
  const planner = new ParcelQueryPlanner();

  describe("intent classification", () => {
    it("classifies 'What are these parcels?' as identify", () => {
      const plan = planner.plan({ message: "What are these parcels?", orgId: "org-1", mapContext: makeMapContext(), registry: new ParcelSetRegistry(), conversationId: "c1" });
      expect(plan.intent).toBe("identify");
    });

    it("classifies 'Show me M1 parcels over 2 acres' as filter", () => {
      const plan = planner.plan({ message: "Show me M1 parcels over 2 acres", orgId: "org-1", mapContext: makeMapContext(), registry: new ParcelSetRegistry(), conversationId: "c1" });
      expect(plan.intent).toBe("filter");
    });

    it("classifies 'Check flood risk' as screen", () => {
      const plan = planner.plan({ message: "Check flood risk on the selected parcels", orgId: "org-1", mapContext: makeMapContext(), registry: new ParcelSetRegistry(), conversationId: "c1" });
      expect(plan.intent).toBe("screen");
    });

    it("classifies 'Compare these parcels' as compare", () => {
      const plan = planner.plan({ message: "Compare these three parcels", orgId: "org-1", mapContext: makeMapContext(), registry: new ParcelSetRegistry(), conversationId: "c1" });
      expect(plan.intent).toBe("compare");
    });

    it("classifies 'What is the weather today?' as general", () => {
      const plan = planner.plan({ message: "What is the weather today?", orgId: "org-1", mapContext: null, registry: new ParcelSetRegistry(), conversationId: "c1" });
      expect(plan.intent).toBe("general");
    });

    it("classifies 'Find industrial parcels near the port' as discover", () => {
      const plan = planner.plan({ message: "Find industrial parcels near the port", orgId: "org-1", mapContext: makeMapContext(), registry: new ParcelSetRegistry(), conversationId: "c1" });
      expect(plan.intent).toBe("discover");
    });
  });

  describe("set creation from map context", () => {
    it("creates selection set from selectedParcelIds", () => {
      const ctx = makeMapContext({ selectedParcelIds: ["p1", "p2", "p3"] });
      const plan = planner.plan({ message: "Analyze these", orgId: "org-1", mapContext: ctx, registry: new ParcelSetRegistry(), conversationId: "c1" });
      const selectionSet = plan.inputSets.find((s) => s.origin.kind === "selection");
      expect(selectionSet).toBeDefined();
      expect(selectionSet!.orgId).toBe("org-1");
      if (selectionSet!.origin.kind === "selection") {
        expect(selectionSet!.origin.parcelIds).toEqual(["p1", "p2", "p3"]);
      }
    });

    it("creates viewport set from center + zoom", () => {
      const ctx = makeMapContext({ center: { lat: 30.45, lng: -91.18 }, zoom: 14 });
      const plan = planner.plan({ message: "Show me parcels here", orgId: "org-1", mapContext: ctx, registry: new ParcelSetRegistry(), conversationId: "c1" });
      const viewportSet = plan.inputSets.find((s) => s.origin.kind === "viewport");
      expect(viewportSet).toBeDefined();
    });

    it("carries orgId on all created sets", () => {
      const ctx = makeMapContext({ selectedParcelIds: ["p1"] });
      const plan = planner.plan({ message: "Check this", orgId: "org-99", mapContext: ctx, registry: new ParcelSetRegistry(), conversationId: "c1" });
      expect(plan.inputSets.every((s) => s.orgId === "org-99")).toBe(true);
    });
  });

  describe("resolution strategy", () => {
    it("uses selection-passthrough for selection intent", () => {
      const ctx = makeMapContext({ selectedParcelIds: ["p1"] });
      const plan = planner.plan({ message: "What is this parcel?", orgId: "org-1", mapContext: ctx, registry: new ParcelSetRegistry(), conversationId: "c1" });
      expect(plan.resolution.kind).toBe("selection-passthrough");
    });

    it("uses bbox for viewport-scoped filter queries", () => {
      const ctx = makeMapContext({ center: { lat: 30.45, lng: -91.18 }, zoom: 14 });
      const plan = planner.plan({ message: "Show me M1 parcels", orgId: "org-1", mapContext: ctx, registry: new ParcelSetRegistry(), conversationId: "c1" });
      expect(plan.resolution.kind).toBe("bbox");
    });
  });

  describe("filter extraction", () => {
    it("extracts zoning filter from natural language", () => {
      const plan = planner.plan({ message: "Show me M1 zoned parcels", orgId: "org-1", mapContext: makeMapContext(), registry: new ParcelSetRegistry(), conversationId: "c1" });
      expect(plan.filters.some((f) => f.field === "zoningType" && f.value === "M1")).toBe(true);
    });

    it("extracts acreage filter", () => {
      const plan = planner.plan({ message: "Parcels over 5 acres", orgId: "org-1", mapContext: makeMapContext(), registry: new ParcelSetRegistry(), conversationId: "c1" });
      expect(plan.filters.some((f) => f.field === "acres" && f.operator === "gt")).toBe(true);
    });
  });

  describe("screening strategy", () => {
    it("plans flood screening for flood-related queries", () => {
      const plan = planner.plan({ message: "Check flood risk", orgId: "org-1", mapContext: makeMapContext({ selectedParcelIds: ["p1"] }), registry: new ParcelSetRegistry(), conversationId: "c1" });
      expect(plan.screening).not.toBeNull();
      expect(plan.screening!.dimensions).toContain("flood");
    });

    it("plans no screening for general identify", () => {
      const plan = planner.plan({ message: "What parcels are selected?", orgId: "org-1", mapContext: makeMapContext({ selectedParcelIds: ["p1"] }), registry: new ParcelSetRegistry(), conversationId: "c1" });
      expect(plan.screening).toBeNull();
    });
  });

  describe("execution directives", () => {
    it("sets immediate materialization for first turn", () => {
      const plan = planner.plan({ message: "Analyze these", orgId: "org-1", mapContext: makeMapContext({ selectedParcelIds: ["p1"] }), registry: new ParcelSetRegistry(), conversationId: "c1" });
      expect(plan.directives.materializationMode).toBe("immediate");
      expect(plan.isFollowUp).toBe(false);
    });

    it("requires authoritative verification by default", () => {
      const plan = planner.plan({ message: "Check this", orgId: "org-1", mapContext: makeMapContext({ selectedParcelIds: ["p1"] }), registry: new ParcelSetRegistry(), conversationId: "c1" });
      expect(plan.directives.authoritativeVerification).toBe("required");
      expect(plan.memoryPolicy.requireDbVerification).toBe(true);
    });
  });
});

function makeMapContext(overrides?: Partial<MapContextInput>): MapContextInput {
  return {
    center: { lat: 30.45, lng: -91.18 },
    zoom: 14,
    selectedParcelIds: [],
    viewportLabel: "Downtown Baton Rouge",
    referencedFeatures: [],
    ...overrides,
  };
}
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @entitlement-os/shared build && pnpm --filter @entitlement-os/openai exec vitest run src/planning/__tests__/planner.test.ts`
Expected: FAIL

**Step 3: Write the planner**

Create `packages/openai/src/planning/planner.ts`:
- `ParcelQueryPlanner` class
- `plan(input: PlannerInput): ParcelQueryPlan` — main method
- Internal methods: `classifyIntent()`, `createInputSets()`, `selectResolutionStrategy()`, `extractFilters()`, `planScreening()`, `assembleDirectives()`, `buildMemoryPolicy()`
- Intent classification: keyword/pattern heuristic (no LLM call). Match against known patterns: flood/soils/EPA → screen, compare/versus → compare, filter/show/find+criteria → filter, rank/best/worst → rank, etc.
- Filter extraction: regex-based for v1. Detect zoning codes (M1, C2, A1, etc.), acreage thresholds ("over N acres"), parish names.
- Resolution strategy: selection-passthrough when selectedParcelIds present, bbox for viewport-scoped queries, parcel-ids for direct ID references.
- Screening strategy: map screening keywords to dimensions. "flood" → flood, "environmental" → flood+soils+wetlands+epa, "full screen" → all.
- All plans carry `memoryPolicy.requireDbVerification = true` and `directives.authoritativeVerification = "required"` by default.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @entitlement-os/shared build && pnpm --filter @entitlement-os/openai exec vitest run src/planning/__tests__/planner.test.ts`
Expected: PASS — all 14 tests

**Step 5: Commit**

```bash
git add packages/openai/src/planning/planner.ts packages/openai/src/planning/__tests__/planner.test.ts
git commit -m "feat(planning): add ParcelQueryPlanner with heuristic intent classification"
```

---

### Task 6: ParcelQueryExecutor

**Files:**
- Create: `packages/openai/src/planning/executor.ts`
- Test: `packages/openai/src/planning/__tests__/executor.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/openai/src/planning/__tests__/executor.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ParcelQueryExecutor } from "../executor.js";
import { ParcelSetRegistry } from "../registry.js";
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
      const plan = makePlan({
        resolution: { kind: "selection-passthrough" },
        inputSets: [makeSelectionDef(["p1", "p2"])],
      });
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
      const plan = makePlan({
        resolution: { kind: "bbox", spatial: { kind: "bbox", bounds: [-91.2, 30.4, -91.1, 30.5] }, limit: 100 },
        inputSets: [makeViewportDef()],
      });
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
      const plan = makePlan({
        resolution: { kind: "selection-passthrough" },
        inputSets: [makeSelectionDef(["p1", "p2", "p3"])],
        filters: [{ field: "zoningType", operator: "eq", value: "M1" }],
      });
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
      const plan = makePlan({
        resolution: { kind: "selection-passthrough" },
        inputSets: [makeSelectionDef(["p1"])],
        screening: { dimensions: ["flood"], mode: "selective", batchSize: 8, priority: "speed" },
        directives: { materializationMode: "immediate", screeningTiming: "pre-agent", authoritativeVerification: "required", freshnessMaxSeconds: null, estimatedCost: "light" },
      });
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
      const plan = makePlan({
        resolution: { kind: "selection-passthrough" },
        inputSets: [makeSelectionDef(["p1"])],
        screening: { dimensions: ["flood"], mode: "selective", batchSize: 8, priority: "speed" },
        directives: { materializationMode: "immediate", screeningTiming: "agent-triggered", authoritativeVerification: "required", freshnessMaxSeconds: null, estimatedCost: "light" },
      });
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
      const plan = makePlan({
        resolution: { kind: "selection-passthrough" },
        inputSets: [makeSelectionDef(["p1"])],
      });
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
      const plan = makePlan({
        resolution: { kind: "selection-passthrough" },
        inputSets: [makeSelectionDef(["p1", "p2"])],
      });
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
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @entitlement-os/shared build && pnpm --filter @entitlement-os/openai exec vitest run src/planning/__tests__/executor.test.ts`
Expected: FAIL

**Step 3: Write the executor**

Create `packages/openai/src/planning/executor.ts`:
- `GatewayAdapter` interface: `{ searchParcelsByBbox, getParcelDetails, screenParcels }` — the executor's dependency boundary. NOT agent tools.
- `ParcelQueryExecutor` class with constructor taking a `GatewayAdapter`
- `execute(plan, registry, conversationId)` → `{ sets: MaterializedSet[], analytics: SetAnalytics | null }`
- Internal methods: `resolveSet()` (dispatches by resolution strategy kind), `applyFilters()` (in-memory filter on facts), `executeScreening()` (calls adapter when timing is pre-agent), `packageResult()`
- Registers all resolved sets in the registry and updates status to `materialized`
- Calls `computeAnalytics()` from analytics module on the final materialization
- v1: `memory-discovery` and `spatial-sql` strategies throw `not implemented` error with clear message

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @entitlement-os/shared build && pnpm --filter @entitlement-os/openai exec vitest run src/planning/__tests__/executor.test.ts`
Expected: PASS — all 7 tests

**Step 5: Commit**

```bash
git add packages/openai/src/planning/executor.ts packages/openai/src/planning/__tests__/executor.test.ts
git commit -m "feat(planning): add ParcelQueryExecutor with gateway adapter abstraction"
```

---

### Task 7: Planning Module Exports

**Files:**
- Create: `packages/openai/src/planning/index.ts`
- Modify: `packages/openai/src/index.ts` (add planning export)

**Step 1: Create the barrel export**

```typescript
// packages/openai/src/planning/index.ts
export { ParcelQueryPlanner } from "./planner.js";
export { ParcelQueryExecutor } from "./executor.js";
export type { GatewayAdapter } from "./executor.js";
export { ParcelSetRegistry } from "./registry.js";
export { computeAnalytics } from "./analytics.js";
export { ParcelFieldCatalog, resolveField, isValidField } from "./fields.js";
```

**Step 2: Add to openai package exports**

Add to `packages/openai/src/index.ts` after the last export line:
```typescript
export * from "./planning/index.js";
```

**Step 3: Verify build**

Run: `pnpm --filter @entitlement-os/openai build`
Expected: Build succeeds with no errors

**Step 4: Commit**

```bash
git add packages/openai/src/planning/index.ts packages/openai/src/index.ts
git commit -m "feat(planning): export planning module from openai package"
```

---

### Task 8: describe_parcel_set Agent Tool

**Files:**
- Create: `packages/openai/src/tools/parcelSetTools.ts`
- Modify: `packages/openai/src/tools/index.ts` (add export)
- Modify: `packages/openai/src/agents/index.ts` (wire into coordinator tools in `createConfiguredCoordinator`)
- Test: `packages/openai/src/planning/__tests__/parcelSetTools.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/openai/src/planning/__tests__/parcelSetTools.test.ts
import { describe, it, expect } from "vitest";
import { makeDescribeParcelSetTool } from "../../tools/parcelSetTools.js";
import { ParcelSetRegistry } from "../registry.js";
import type { ParcelSetMaterialization } from "@entitlement-os/shared";

describe("describe_parcel_set tool", () => {
  it("returns analytics for a registered, materialized set", async () => {
    const registry = new ParcelSetRegistry();
    const def = {
      id: "set-1", orgId: "org-1", label: "Test set",
      origin: { kind: "selection" as const, parcelIds: ["p1", "p2"], source: "map" as const },
      lifecycle: { kind: "ephemeral" as const, scope: "conversation" as const },
      status: "materialized" as const, createdAt: new Date().toISOString(), metadata: {},
    };
    registry.register("conv-1", def);
    const mat: ParcelSetMaterialization = {
      parcelSetId: "set-1", memberIds: ["p1", "p2"], count: 2,
      facts: [
        { parcelId: "p1", address: "A", owner: null, acres: 2.0, zoningType: "M1", center: null, parish: "EBR", assessedValue: null },
        { parcelId: "p2", address: "B", owner: null, acres: 3.0, zoningType: "M1", center: null, parish: "EBR", assessedValue: null },
      ],
      screening: [], provenance: { sourceKind: "database", sourceRoute: null, authoritative: true, confidence: null, resolvedAt: new Date().toISOString(), freshness: "fresh" },
      materializedAt: new Date().toISOString(),
    };
    registry.updateMaterialization("conv-1", mat);

    const toolFn = makeDescribeParcelSetTool(registry, "conv-1");
    const result = await toolFn({ setId: "set-1" });
    const parsed = JSON.parse(result);

    expect(parsed.totalCount).toBe(2);
    expect(parsed.distributions.zoningType).toEqual({ M1: 2 });
  });

  it("returns error for unknown set ID", async () => {
    const registry = new ParcelSetRegistry();
    const toolFn = makeDescribeParcelSetTool(registry, "conv-1");
    const result = await toolFn({ setId: "nope" });
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @entitlement-os/shared build && pnpm --filter @entitlement-os/openai exec vitest run src/planning/__tests__/parcelSetTools.test.ts`
Expected: FAIL

**Step 3: Write the tool**

Create `packages/openai/src/tools/parcelSetTools.ts`:
- `makeDescribeParcelSetTool(registry, conversationId)` — factory function that returns a tool handler function
- `describeParcelSetToolDef` — the `tool()` definition with Zod schema: `{ setId: z.string().nullable() }`
- Handler: looks up materialization from registry, calls `computeAnalytics()`, returns JSON string with analytics + set metadata
- Returns error JSON if set not found or not materialized

**Step 4: Add export to tools/index.ts**

Add to `packages/openai/src/tools/index.ts`:
```typescript
export { describeParcelSetToolDef, makeDescribeParcelSetTool } from "./parcelSetTools.js";
```

**Step 5: Wire into coordinator**

In `packages/openai/src/agents/index.ts`, in `createConfiguredCoordinator()`:
- Import `describeParcelSetToolDef` from tools
- Add to the tools array spread into `.clone()` call
- The tool needs a registry and conversationId at runtime, so wire it as a dynamic tool that receives context

**Step 6: Run test to verify it passes**

Run: `pnpm --filter @entitlement-os/shared build && pnpm --filter @entitlement-os/openai exec vitest run src/planning/__tests__/parcelSetTools.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/openai/src/tools/parcelSetTools.ts packages/openai/src/tools/index.ts packages/openai/src/agents/index.ts packages/openai/src/planning/__tests__/parcelSetTools.test.ts
git commit -m "feat(planning): add describe_parcel_set agent tool"
```

---

### Task 9: Chat Route Integration

**Files:**
- Modify: `apps/web/app/api/chat/route.ts` (replace buildMapContextPrefix with planner invocation)

**Step 1: Understand the current flow**

Current (lines 14-45, 134-140 of route.ts):
- `buildMapContextPrefix(mapContext)` → string
- `message: \`${mapContextPrefix}${message}\`` → combined string to agent

Target:
- `ParcelQueryPlanner.plan()` → `ParcelQueryPlan`
- `ParcelQueryExecutor.execute()` → `{ sets, analytics }`
- Package as `StructuredParcelContext`
- Pass to `runAgentWorkflow()` as structured data alongside the raw message (no prefix injection)
- Fallback: if planner throws, fall back to `buildMapContextPrefix()` (acceptance criterion 9)

**Step 2: Modify the route**

In `apps/web/app/api/chat/route.ts`:
- Import `ParcelQueryPlanner`, `ParcelQueryExecutor`, `ParcelSetRegistry`, `createDefaultGatewayAdapter` from `@entitlement-os/openai`
- Import `StructuredParcelContext` from `@entitlement-os/shared`
- Keep `buildMapContextPrefix()` as a fallback
- Before calling `runAgentWorkflow()`:
  1. Try: `planner.plan()` → `executor.execute()` → build `StructuredParcelContext`
  2. Catch: fall back to `buildMapContextPrefix()` and log warning
- Pass `parcelContext: StructuredParcelContext | null` to `runAgentWorkflow()` instead of embedding map text in message

**Step 3: Update agentRunner.ts to accept StructuredParcelContext**

The `runAgentWorkflow()` function needs a new optional parameter `parcelContext?: StructuredParcelContext`. When present, it's injected into the agent's system prompt as a structured JSON block rather than as a message prefix.

**Step 4: Verify the full flow manually**

Run: `pnpm build && pnpm dev`
- Open the app, select parcels on the map, send a message
- Verify the agent receives structured context (check server logs)
- Verify fallback works by temporarily breaking the planner

**Step 5: Commit**

```bash
git add apps/web/app/api/chat/route.ts apps/web/lib/agent/agentRunner.ts
git commit -m "feat(planning): integrate planner into chat route, replace text prefix"
```

---

### Task 10: Coordinator System Prompt Update

**Files:**
- Modify: `packages/openai/src/agents/coordinator.ts` (update system prompt to use StructuredParcelContext)

**Step 1: Update COORDINATOR_INSTRUCTIONS**

Add a section to the coordinator system prompt that teaches it about the structured parcel context:
- When `StructuredParcelContext` is present, the agent has pre-resolved parcel sets with facts, screening, and analytics
- The agent should reference set IDs and use `describe_parcel_set` for detailed analytics
- The agent should NOT try to parse `[Map Context]` text blocks (those are legacy fallback)
- The agent should explain analytics summaries in natural language
- The agent should use `topConstraints` as starting points for analysis

**Step 2: Verify build**

Run: `pnpm --filter @entitlement-os/openai build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/openai/src/agents/coordinator.ts
git commit -m "feat(planning): update coordinator prompt for StructuredParcelContext"
```

---

### Task 11: Full Build + Test Verification

**Step 1: Run all package builds**

Run: `pnpm --filter @entitlement-os/shared build && pnpm --filter @entitlement-os/openai build`
Expected: Both pass

**Step 2: Run all planning tests**

Run: `pnpm --filter @entitlement-os/openai exec vitest run src/planning/`
Expected: All tests pass (fields, registry, analytics, planner, executor, parcelSetTools)

**Step 3: Run shared package tests**

Run: `pnpm --filter @entitlement-os/shared exec vitest run`
Expected: All pass including new parcelIntelligence.test.ts

**Step 4: Run full web app tests**

Run: `pnpm --filter gpc-agent-dashboard exec vitest run --configLoader runner`
Expected: All pass — no regressions

**Step 5: Commit final state**

```bash
git add -A
git commit -m "feat(planning): Phase 1 parcel intelligence spine complete"
```

---

## Phase 1 Acceptance Criteria

1. A user with 3 selected parcels sends "What are these parcels?" → agent receives `StructuredParcelContext` with a materialized selection set containing facts for all 3 parcels, zoning distribution, and parcel count.

2. A user viewing downtown Baton Rouge at zoom 14 sends "Show me industrial parcels" → planner classifies intent as `filter`, creates viewport-origin set with `bbox` resolution strategy and zoning filter, executor materializes it, agent receives the set with analytics.

3. `describe_parcel_set` tool is callable by the agent and returns `SetAnalytics` for any registered set.

4. `ParcelSetRegistry` tracks sets across turns within the same conversation.

5. Provenance is tracked: all materialized sets carry `sourceKind`, `authoritative`, `freshness`, `resolvedAt`.

6. Staleness rules fire: viewport-origin sets become `stale` when viewport changes.

7. All new code has unit tests. Planner intent classification, executor resolution, registry lifecycle, and analytics computation are tested.

8. The `[Map Context]...[/Map Context]` text prefix is no longer passed to the agent when the planner is active.

9. No regression: if the planner encounters an error, it falls back to the existing text prefix path.

10. Shared contract types are importable from `@entitlement-os/shared`.
