# Parcel Intelligence Spine — Design Document

**Date:** 2026-03-22
**Status:** Approved for Phase 1 implementation
**Approach:** Hybrid (Approach C) — planner-led first turn, agent-extensible follow-ups

## Problem

The current map-to-chat integration passes parcel context as a plain text prefix (`[Map Context]...`) prepended to the user message. The agent receives unstructured text and improvises tool chains from scratch every turn. There is no typed intent resolution, no query planning, no structured parcel set abstraction, and no analytical summarization layer. Parcel sets exist only as accidental tool outputs.

## Goal

Replace prompt-shaped map context with a structured analytical system: a typed parcel query planner that creates the analytical world, an executor that materializes it, an analytics layer that summarizes it, and an agent that reasons inside it.

## Architectural Principle

1. **Planner** defines the analytical job
2. **Executor** materializes the parcel world needed for that job
3. **Analytics** summarize the parcel world
4. **Agent** interprets, refines, and explains inside that materialized world

The planner creates and frames the world. The agent reasons inside it.

## Hard Rules

- **Database truth over semantic recall.** Memory-assisted discovery can suggest candidates. Exact parcel truth must be verified against the property DB before any decision-grade output. This is encoded in `MemoryPolicy.requireDbVerification` and enforced by the executor.
- **No raw map text in prompts.** After Phase 1, agents receive `StructuredParcelContext`, not text prefixes.
- **No agent-improvised tool chains for plan-scoped queries.** The agent operates on typed sets through planner-aware tools, not raw gateway endpoints.
- **Parcel sets are explicit, not accidental.** Every set has an ID, origin, lifecycle, status, and provenance.

---

## Core Types

### ParcelSet: Definition / Materialization Split

A parcel set has two layers:

- **ParcelSetDefinition** — the recipe/identity. Can exist before any resolution. The truth for an unresolved set is its origin.
- **ParcelSetMaterialization** — the resolved snapshot. Once materialized, `memberIds` is the truth of that snapshot.

A selection-origin set may be member-materialized (IDs known from the map) but fact-unresolved and screening-unresolved. The system distinguishes these layers.

### Spatial Scope

```typescript
type SpatialScope =
  | { kind: "bbox"; bounds: [number, number, number, number] }
  | { kind: "polygon"; coordinates: number[][][] }
  | { kind: "radius"; center: [number, number]; radiusMeters: number }
```

Extensible to multipolygon or other spatial scopes without breaking changes.

### ParcelSetOrigin

```typescript
type ParcelSetOrigin =
  | { kind: "viewport"; spatial: SpatialScope }
  | { kind: "selection"; parcelIds: string[]; source: "map" | "deal" | "agent" }
  | { kind: "query"; filters: ParcelFilter[]; sql?: string }
  | { kind: "spatial"; spatial: SpatialScope; filters?: ParcelFilter[] }
  | { kind: "refinement"; parentSetId: string; operation: SetOperation }
  | { kind: "saved"; persistedId: string }
```

### ParcelSetDefinition

```typescript
interface ParcelSetDefinition {
  id: string;
  orgId: string;
  label: string | null;
  origin: ParcelSetOrigin;
  lifecycle: ParcelSetLifecycle;
  status: ParcelSetStatus;
  createdAt: string;
  metadata: Record<string, unknown>;
}
```

- `orgId` is always present, even for ephemeral sets.
- `status` tracks: `unresolved | resolving | materialized | stale | failed`.

### ParcelSetMaterialization

```typescript
interface ParcelSetMaterialization {
  parcelSetId: string;
  memberIds: string[];
  count: number;
  facts: ParcelFacts[];
  screening: ParcelScreeningResult[];
  provenance: ParcelSetProvenance;
  materializedAt: string;
}
```

All fields are JSON-safe arrays. Internal runtime caches may use `Map<>` for lookup performance, but the canonical shared/transport shape uses arrays.

### ParcelFacts

```typescript
interface ParcelFacts {
  parcelId: string;
  address: string | null;
  owner: string | null;
  acres: number | null;
  zoningType: string | null;
  center: [number, number] | null;
  parish: string | null;
  assessedValue: number | null;
}
```

### ParcelScreeningResult

```typescript
interface ParcelScreeningResult {
  parcelId: string;
  dimensions: ScreeningDimension[];
  envelope: Record<string, unknown>;
  screenedAt: string;
}

type ScreeningDimension = "flood" | "soils" | "wetlands" | "epa" | "traffic" | "ldeq" | "zoning"
```

### Provenance

```typescript
interface ParcelSetProvenance {
  sourceKind: "database" | "memory" | "mixed";
  sourceRoute: string | null;
  authoritative: boolean;
  confidence: number | null;
  resolvedAt: string | null;
  freshness: "fresh" | "cached" | "stale";
}
```

---

## Planner Architecture

### Intent Classification

```typescript
type ParcelQueryIntent =
  | "identify" | "screen" | "filter" | "compare"
  | "rank" | "discover" | "summarize" | "refine" | "general"
```

### Resolution Strategy

The plan encodes HOW resolution will happen, not just what the user meant:

```typescript
type ResolutionStrategy =
  | { kind: "parcel-ids"; ids: string[] }
  | { kind: "bbox"; spatial: SpatialScope; limit: number }
  | { kind: "selection-passthrough" }
  | { kind: "property-query"; filters: ParcelFilter[] }
  | { kind: "spatial-sql"; sql: string; params: unknown[] }
  | { kind: "memory-discovery"; query: string; parish?: string; topK: number }
```

### Execution Directives

```typescript
interface ExecutionDirectives {
  materializationMode: "immediate" | "lazy";
  screeningTiming: "pre-agent" | "agent-triggered" | "none";
  authoritativeVerification: "required" | "recommended" | "skip";
  freshnessMaxSeconds: number | null;
  estimatedCost: "light" | "moderate" | "heavy";
}
```

### Memory Policy

```typescript
interface MemoryPolicy {
  allowSemanticDiscovery: boolean;
  requireDbVerification: boolean;     // ALWAYS true for decision-grade output
  maxCandidatesFromMemory: number;
  confidenceFloor: number;
}
```

### Scoring Objective

```typescript
interface ScoringObjective {
  criteria: ScoringCriterion[];
  eligibilityGates: EligibilityGate[];
  limit: number | null;
}

interface ScoringCriterion {
  field: string;
  weight: number;
  direction: "maximize" | "minimize";
  penalty?: { condition: string; factor: number };
}

interface EligibilityGate {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in";
  value: unknown;
  reason: string;
}
```

### ParcelQueryPlan

```typescript
interface ParcelQueryPlan {
  id: string;
  intent: ParcelQueryIntent;
  inputSets: ParcelSetDefinition[];
  resolution: ResolutionStrategy;
  filters: ParcelFilter[];
  screening: ScreeningStrategy | null;
  scoring: ScoringObjective | null;
  outputMode: OutputMode;
  directives: ExecutionDirectives;
  memoryPolicy: MemoryPolicy;
  provenanceRequirements: ProvenanceRequirements;
  isFollowUp: boolean;
}
```

### Filter Chain

```typescript
interface ParcelFilter {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains" | "within";
  value: unknown;
}
```

v1: string-backed normalized fields. Target: constrained field catalog / typed field registry via `fields.ts`.

---

## Analytics Layer

### SetAnalytics

```typescript
interface SetAnalytics {
  totalCount: number;
  distributions: Record<string, Record<string, number>>;
  screeningSummary: ScreeningSummary | null;
  topConstraints: string[];
  scoringSummary: { min: number; max: number; mean: number } | null;
}

interface ScreeningSummary {
  dimensionsScreened: ScreeningDimension[];
  floodExposure: { sfhaCount: number; totalCount: number } | null;
  wetlandExposure: { affectedCount: number; totalCount: number } | null;
  epaProximity: { sitesWithinMile: number } | null;
}
```

Phase 1 ships real analytical value: parcel count, zoning distribution, flood exposure summary, top constraints.

### StructuredParcelContext

What the agent receives instead of the text prefix:

```typescript
interface StructuredParcelContext {
  plan: ParcelQueryPlan;
  sets: {
    definition: ParcelSetDefinition;
    materialization: ParcelSetMaterialization | null;
    analytics: SetAnalytics | null;
  }[];
  conversationSetRegistry: string[];
  intent: ParcelQueryIntent;
  outputMode: OutputMode;
}
```

Carries both raw/resolved parcel-set data AND planner/executor-generated analytical summaries.

---

## Execution Flow

### First Turn

```
POST /api/chat { message, mapContext }
  → ParcelQueryPlanner.plan(message, mapContext, history, registry)
    → classifyIntent()
    → selectResolutionStrategy()
    → buildFilterChain()
    → planScreening()
    → assembleDirectives()
    → ParcelQueryPlan
  → ParcelQueryExecutor.execute(plan, registry)
    → resolveDefinitions() via gateway service adapters
    → applyFilters()
    → executeScreening() if pre-agent
    → computeAnalytics()
    → register sets in ParcelSetRegistry
    → { sets[], analytics }
  → Package as StructuredParcelContext
  → Pass to agent runner (replaces text prefix)
```

### Follow-Up Turns

Planner remains active (not passive). Follow-up responsibilities:

- Decide whether refinement requires new resolution
- Decide whether existing materialization is stale/incomplete
- Decide whether additional screening must run before the agent reasons

```
POST /api/chat { message } (follow-up)
  → ParcelQueryPlanner.plan(message, null, history, registry)
    → classifyIntent() → "refine"
    → resolve pronoun references to existing set IDs
    → check staleness of existing materializations
    → decide: new resolution needed? additional screening?
    → ParcelQueryPlan { isFollowUp: true }
  → Agent receives updated StructuredParcelContext
  → Agent calls planner-aware tools for refinement
```

---

## Module Boundaries

### Executor Dependency Rule

The executor depends on **resolution adapters / gateway service functions**, not on agent-facing tool definitions. Agent tools are wrappers over planner/executor capabilities.

```
Executor → gateway service adapters (gatewaySearchParcels, fetchScreening, etc.)
Agent tools → Planner + Executor (thin wrappers)
```

`propertyDbTools.ts` remains as the existing agent tool surface. The executor does NOT call these tools. It calls lower-level gateway helpers. The new planner-aware agent tools call the executor.

### Memory Integration Architecture

Even though `propertyMemoryTools.ts` has no code changes in Phase 1, the architecture defines:

- **Discovery path:** `ResolutionStrategy.memory-discovery` → executor calls `PropertyIntelligenceStore.search()` → gets candidate parcelIds → verifies each via gateway `getParcelDetails` → sets `provenance.authoritative = false` until verification completes, then `true`
- **Verification rule:** `MemoryPolicy.requireDbVerification = true` always for decision-grade output
- **Provenance tracking:** memory-sourced sets carry `sourceKind: "memory"`, `confidence` from Qdrant RRF score, flip to `sourceKind: "mixed"` after DB verification

### MapChatContext.tsx Evolution

- **Phase 1:** Minimal compatibility. Continues emitting `MapContextInput`. The chat route converts this to planner input.
- **Phase 2+:** Evolves to emit richer structured state aligned with parcel-set creation. Can carry pre-built `ParcelSetDefinition`s for viewport and selection sets, reducing planner cold-start work.

### Shared Contract Location

`StructuredParcelContext`, `ParcelSetDefinition`, `ParcelSetMaterialization`, `SetAnalytics`, and core enums live in `packages/shared/src/types/` so that planner, route layer, agent runtime, and chat/map UI renderers all speak the same language.

---

## Staleness and Invalidation Rules

| Trigger | Effect | Phase |
|---------|--------|-------|
| Viewport pan/zoom | viewport-origin sets become `stale` | 1 |
| Selection change | selection-origin sets become `stale`; new selection set created | 1 |
| Conversation idle > 30 min | all ephemeral sets become `stale` | 1 |
| Screening data > 15 min old | screening results marked `freshness: "stale"` | 1 |
| Memory-sourced set not DB-verified | stays `authoritative: false`; planner marks verification `required` | 2 |
| Parent set invalidated | refinement-origin children become `stale` | 2 |
| Persistent set > 24h without refresh | marked `stale`; re-resolution available | 4 |

---

## File Layout

### New Files

```
packages/openai/src/planning/
├── types.ts               Core type definitions
├── planner.ts             ParcelQueryPlanner class
├── executor.ts            ParcelQueryExecutor class
├── registry.ts            ParcelSetRegistry (conversation-scoped store)
├── analytics.ts           SetAnalytics computation
├── fields.ts              ParcelFieldCatalog (v1: string registry)
├── index.ts               Public exports
└── __tests__/
    ├── planner.test.ts
    ├── executor.test.ts
    ├── registry.test.ts
    └── analytics.test.ts

packages/shared/src/types/
└── parcelIntelligence.ts  Shared contract types (StructuredParcelContext, etc.)
```

### Changed Files

| File | Change | Phase |
|------|--------|-------|
| `apps/web/app/api/chat/route.ts` | Replace `buildMapContextPrefix()` with planner invocation. Pass `StructuredParcelContext` to agent runner. | 1 |
| `packages/openai/src/agents/coordinator.ts` | System prompt receives typed context. Add `describe_parcel_set` tool. | 1 |
| `packages/shared/src/types/mapChat.ts` | Re-export shared contract types. Keep `MapContextInput` for compat. | 1 |
| `packages/openai/src/tools/propertyDbTools.ts` | No removal. Remains as executor's resolution adapter source AND legacy agent tool surface. | 1 (no change) |
| `packages/openai/src/tools/propertyMemoryTools.ts` | No code change. Architecturally scoped for Phase 2 memory-discovery integration. | 2 |
| `apps/web/lib/chat/MapChatContext.tsx` | Evolve to emit richer structured state. | 2+ |
| `packages/openai/src/agents/coordinator.ts` | Add remaining 5 planner-aware agent tools. | 2 |

### New Agent Tools

| Tool | Phase | Purpose |
|------|-------|---------|
| `describe_parcel_set` | **1** | Read-only: returns analytics/summary for a set |
| `refine_parcel_set` | 2 | Apply filters or set operations |
| `screen_parcel_set` | 2 | Screen a set on specified dimensions |
| `compare_parcel_sets` | 2 | Structured comparison of 2+ sets |
| `score_parcel_set` | 2 | Apply scoring objective |
| `materialize_parcel_set` | 2 | Force resolution of a lazy set |

`describe_parcel_set` ships in Phase 1 to exercise the agent/runtime boundary early.

---

## Phased Rollout

### Phase 1: Foundation (implement now)

**Ships:**
- `planning/types.ts` — all type definitions
- `planning/planner.ts` — intent classification (heuristic/keyword), resolution strategy selection, filter extraction, screening strategy, directive assembly
- `planning/executor.ts` — resolution for `parcel-ids`, `selection-passthrough`, `bbox` strategies. Screening via existing gateway adapters. Memory discovery stubbed with interface.
- `planning/registry.ts` — conversation-scoped in-memory registry with staleness checks
- `planning/analytics.ts` — `computeAnalytics()`: count, zoning distribution, flood exposure summary, top constraints
- `planning/fields.ts` — string-backed field catalog for known property DB columns
- `packages/shared/src/types/parcelIntelligence.ts` — shared contract types
- Chat route integration: planner replaces `buildMapContextPrefix()`
- Coordinator: receives `StructuredParcelContext`, `describe_parcel_set` tool wired
- Tests for planner, executor, registry, analytics

**Does NOT ship:**
- Agent-facing mutation tools (refine, screen, compare, score, materialize)
- LLM-backed intent classification
- `spatial-sql` or `memory-discovery` resolution strategies (interfaces defined, not implemented)
- Scoring with penalties/gating
- Persistent parcel sets
- MapChatContext.tsx changes

### Phase 2: Agent Tools + Follow-Up Planner

- Ship 5 remaining planner-aware agent tools
- Wire planner into follow-up turns (re-planning, staleness checks)
- Implement `memory-discovery` resolution with DB verification
- Implement `property-query` resolution with filter-to-SQL compilation
- Evolve MapChatContext.tsx to emit richer structured state

### Phase 3: Scoring + Analytics

- Weighted scoring with eligibility gates and penalties
- Richer SetAnalytics with constraint summaries
- LLM-backed intent classification
- Typed field registry replacing string fields

### Phase 4: Persistence

- Prisma migration for parcel set tables
- Persistent lifecycle in registry
- Saved searches, named shortlists, deal collections
- CRUD API routes

---

## Phase 1 Build Sequence

1. `packages/shared/src/types/parcelIntelligence.ts` — shared contract types
2. `packages/openai/src/planning/types.ts` — full type definitions
3. `packages/openai/src/planning/fields.ts` — field catalog
4. `packages/openai/src/planning/registry.ts` + tests
5. `packages/openai/src/planning/analytics.ts` + tests
6. `packages/openai/src/planning/planner.ts` + tests
7. `packages/openai/src/planning/executor.ts` + tests
8. `packages/openai/src/planning/index.ts` — public exports
9. `describe_parcel_set` tool definition + wiring in coordinator
10. `apps/web/app/api/chat/route.ts` — integration (replace text prefix with planner)
11. `packages/openai/src/agents/coordinator.ts` — system prompt update for typed context
12. Integration test: map selection → planner → executor → agent receives StructuredParcelContext

---

## Phase 1 Acceptance Criteria

1. A user with 3 selected parcels on the map sends "What are these parcels?" → agent receives a `StructuredParcelContext` with a materialized selection set containing facts for all 3 parcels, a zoning distribution, and a parcel count — not a text prefix.

2. A user viewing downtown Baton Rouge at zoom 14 sends "Show me industrial parcels" → planner classifies intent as `filter`, creates a viewport-origin set with `bbox` resolution strategy and `zoningType contains M` filter, executor materializes it, agent receives the set with analytics showing count and zoning breakdown.

3. `describe_parcel_set` tool is callable by the agent and returns `SetAnalytics` for any registered set.

4. The `ParcelSetRegistry` tracks sets across turns within the same conversation. A set created on turn 1 is accessible on turn 2.

5. Provenance is tracked: all materialized sets carry `sourceKind`, `authoritative`, `freshness`, and `resolvedAt`.

6. Staleness rules fire: viewport-origin sets become `stale` when viewport changes between turns.

7. All new code has unit tests. Planner intent classification, executor resolution, registry lifecycle, and analytics computation are tested.

8. The `[Map Context]...[/Map Context]` text prefix is no longer passed to the agent when the planner is active.

9. No regression: existing chat functionality works. If the planner encounters an error, it falls back to the existing text prefix path.

10. Shared contract types are importable from `@entitlement-os/shared`.
