# Property Brain Implementation Roadmap

Date: 2026-04-14
Status: Design / implementation roadmap
Owner: Gallagher Property Company
Scope: Entitlement OS property-centric learning, retrieval, and agent execution

## Objective

Make the application materially more agentic by turning `property` / `parcel` / `parcel-set`
into first-class learning subjects, instead of treating most learning as conversation- or run-centric.

This roadmap is explicitly additive:
- do not replace existing chat memory
- do not replace business memory
- do not replace entity memory
- do not replace the knowledge base
- do not replace the current coordinator / specialist tool model

Instead, add a property-centric spine that sits on top of the current systems and makes them useful
for parcel-, deal-, and map-grounded reasoning.

## Current-State Summary

What exists today:
- canonical entity IDs via `InternalEntity`
- evented fact memory via `MemoryEventLog`, `MemoryDraft`, `MemoryVerified`, `MemoryRejected`
- knowledge embeddings + graph retrieval
- episodic/procedural learning promotion from completed runs
- parcel-set planning and map context serialization
- Qdrant-backed property-intelligence sidecar store

What is missing:
- a durable property-native state model
- retrieval keyed by property/entity/parcel-set rather than just `runId`
- automatic learning from parcel/map/property DB interactions
- a continuous property copilot loop that updates recommendations as evidence changes
- first-class property-memory tools in the default web runtime path

## Product Outcome

After this roadmap, the system should be able to:

1. Recognize that a parcel, address, and selected map geometry all refer to the same durable property subject.
2. Accumulate verified facts, observations, comparisons, and next actions about that property over time.
3. Retrieve those facts automatically when the operator asks about a parcel or works in a parcel set.
4. Learn from screening, comps, entitlement outcomes, and operator corrections without waiting for explicit chat memory writes.
5. Present agentic recommendations as a function of property state, not just the current chat prompt.

## Design Principles

1. Property-first, run-aware
Property and parcel context should be primary. Runs, conversations, and deals should enrich property state, not replace it.

2. Authoritative-first, learned-second
Property DB + verified memory + document extraction should outrank Qdrant semantic recall.

3. Additive memory layers
Keep current memory systems, but make property retrieval compose them into a single working context.

4. Explicit provenance and freshness
Every learned property fact needs confidence, source, timestamp, and freshness semantics.

5. Graceful degradation
If a backend signal fails, keep the property brain usable with partial context and clear trust labels.

## Phase Plan

### Phase 0 — Property Subject Unification

Goal:
Guarantee that the application can deterministically map address, parcel ID, map selection, deal parcel, and stored memory into one property subject.

Deliverables:
- stronger `InternalEntity` resolution rules
- parcel/address canonicalization utilities
- parcel-set / map-context subject identity propagation

Schema changes:
- `InternalEntity`
  - add `canonicalParcelKey String?`
  - add `canonicalDisplayName String?`
  - add `primaryParish String?`
  - add `subjectKind String @default("property")`
  - add unique index on `(orgId, canonicalParcelKey)` when populated
- optional new join table:
  - `InternalEntityAlias`
    - `id`
    - `orgId`
    - `entityId`
    - `aliasType` (`parcel_id`, `address`, `property_db_id`, `geometry_key`)
    - `aliasValue`
    - `createdAt`

Files to change:
- [packages/db/prisma/schema.prisma](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/db/prisma/schema.prisma)
- [packages/server/src/services/entity-resolution.service.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/server/src/services/entity-resolution.service.ts)
- [apps/web/lib/chat/MapChatContext.tsx](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/lib/chat/MapChatContext.tsx)
- [packages/openai/src/planning/planner.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/planning/planner.ts)
- [apps/web/components/maps/useMapTrackedParcelWorkspace.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/components/maps/useMapTrackedParcelWorkspace.ts)
- [apps/web/components/maps/MapChatPanel.tsx](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/components/maps/MapChatPanel.tsx)

Tasks:
1. Create canonical parcel/address identity helpers in the server package.
2. Extend entity resolution to upsert aliases, not just bare `canonicalAddress` / `parcelId`.
3. Add subject metadata to map context payloads so downstream agent runs know the active property subject.
4. Make parcel-set materialization emit a stable subject bundle: `entityIds`, `parcelIds`, `viewportBounds`, `polygon`.
5. Add tests proving the same parcel resolves to the same `InternalEntity` across address, parcelId, and map-selection paths.

Acceptance:
- same parcel selected from chat, map, and deal pages resolves to one stable entity ID
- no duplicate `InternalEntity` records for the same parcel/address pair

### Phase 1 — Property Observation Ingestion

Goal:
Turn parcel DB reads, screening outputs, map prospecting, and operator notes into durable property observations automatically.

Deliverables:
- `PropertyObservation` write path
- automatic ingestion from parcel/map/property APIs
- normalized observation-to-memory pipeline

Schema changes:
- new table `PropertyObservation`
  - `id`
  - `orgId`
  - `entityId`
  - `parcelId`
  - `observationType` (`parcel_lookup`, `screening`, `ownership`, `comp`, `market_signal`, `operator_note`, `map_workspace`)
  - `sourceSystem` (`property_db`, `gateway`, `agent`, `user`, `document`, `automation`)
  - `payloadJson`
  - `confidence`
  - `freshnessTier`
  - `observedAt`
  - `sourceHash`
  - `requestId`
  - `dealId?`
  - indexes on `(orgId, entityId, observationType, observedAt desc)`
- optional table `PropertyDerivedSignal`
  - `id`
  - `orgId`
  - `entityId`
  - `signalKey`
  - `signalValueJson`
  - `confidence`
  - `derivedAt`
  - `expiresAt?`

Files to change:
- [packages/db/prisma/schema.prisma](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/db/prisma/schema.prisma)
- [apps/web/app/api/parcels/route.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/app/api/parcels/route.ts)
- [apps/web/app/api/map/prospect/route.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/app/api/map/prospect/route.ts)
- [apps/web/app/api/map/workspace/route.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/app/api/map/workspace/route.ts)
- [packages/openai/src/tools/propertyDbTools.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/tools/propertyDbTools.ts)
- [apps/web/app/api/memory/write/route.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/app/api/memory/write/route.ts)
- new server service:
  - `packages/server/src/services/property-observation.service.ts`

Tasks:
1. Add a deterministic server-side ingester for parcel/property observations.
2. Ingest parcel lookups and prospecting results into `PropertyObservation`.
3. Ingest successful `screen_full` / `screen_batch` results into `PropertyObservation`.
4. Ingest map workspace saves as subject-scoped observations.
5. Normalize operator free-text writes into both memory and property observation streams.
6. Add dedupe on `(entityId, observationType, sourceHash)` to avoid spam.

Acceptance:
- opening parcels on the map leaves durable property observations behind
- repeated parcel lookup does not create unbounded duplicates
- observations can be inspected per property subject

### Phase 2 — Property Brain State Model

Goal:
Build a durable property-native state object the agent and UI can both reason over.

Deliverables:
- `PropertyProfile`
- `PropertyRelationship`
- deterministic profile assembler

Schema changes:
- new table `PropertyProfile`
  - `id`
  - `orgId`
  - `entityId`
  - `parcelId`
  - `profileJson`
  - `confidenceSummaryJson`
  - `freshnessSummaryJson`
  - `lastRebuiltAt`
  - `nextActionJson`
  - unique `(orgId, entityId)`
- new table `PropertyRelationship`
  - `id`
  - `orgId`
  - `fromEntityId`
  - `toEntityId`
  - `relationshipType` (`adjacent`, `same_owner`, `same_corridor`, `comp`, `competitive`, `same_parcel_set`)
  - `weight`
  - `evidenceJson`
  - `createdAt`
  - indexes on `fromEntityId`, `toEntityId`, `relationshipType`

Profile fields to assemble:
- identity
- address / parcel / parish
- zoning and entitlement posture
- environmental constraints
- screening history
- ownership summary
- comp summary
- market posture
- recommendation summary
- unresolved conflicts
- freshness / trust metadata

Files to change:
- [packages/db/prisma/schema.prisma](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/db/prisma/schema.prisma)
- new service:
  - `packages/server/src/services/property-profile.service.ts`
- new route(s):
  - `apps/web/app/api/entities/[id]/profile/route.ts`
  - `apps/web/app/api/parcels/[parcelId]/profile/route.ts`
- map and detail surfaces:
  - [apps/web/components/maps/ParcelDetailCard.tsx](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/components/maps/ParcelDetailCard.tsx)
  - [apps/web/components/maps/MapOperatorConsole.tsx](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/components/maps/MapOperatorConsole.tsx)

Tasks:
1. Build a profile assembler that folds together verified memory, observations, comps, and screening.
2. Generate relationships from map adjacency, shared ownership, and comp references.
3. Expose property profile APIs for UI and agent use.
4. Add a “Property Brain” panel to parcel detail and map operator console.

Acceptance:
- any parcel can show a single assembled profile
- agent and UI read the same assembled object

### Phase 3 — Property-Centric Retrieval Spine

Goal:
Make property/entity retrieval the default runtime context for property questions.

Deliverables:
- `unifiedRetrieval` upgrade from run-centric to subject-centric
- property-memory tools exposed in the default web runtime
- retrieval bundles for parcel, parcel-set, deal, and map context

Code changes:
- [packages/openai/src/agents/webRuntimeContracts.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/agents/webRuntimeContracts.ts)
- [apps/web/lib/agent/executeAgent.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/lib/agent/executeAgent.ts)
- [packages/openai/src/dataAgent/retrieval.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/dataAgent/retrieval.ts)
- [packages/openai/src/agentos/toolPolicy.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/agentos/toolPolicy.ts)
- [packages/openai/src/tools/propertyMemoryTools.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/tools/propertyMemoryTools.ts)
- [packages/openai/src/agentos/memory/contextBuilder.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/agentos/memory/contextBuilder.ts)

Tasks:
1. Extend `buildRetrievalContext()` to accept `entityId`, `parcelIds`, `parcelSetId`, `dealId`, and `addressSignature`.
2. Expand `unifiedRetrieval()` to merge:
   - property profile snapshots
   - verified property memory
   - property observations
   - knowledge embeddings
   - graph relations
   - property-intelligence Qdrant hits
3. Add `recall_property_intelligence` and `store_property_finding` to the default web-runtime allowlist.
4. Rank retrieval by authoritative property signals first, Qdrant second.
5. Add retrieval telemetry that tells us which property evidence actually influenced answers.

Acceptance:
- asking about a parcel automatically retrieves property-native learned context
- parcel and map questions do not rely primarily on the current conversation thread

### Phase 4 — Property Learning Promotion

Goal:
Promote successful parcel/deal/map runs into durable property skills and experiences, not only generic run history.

Deliverables:
- property-aware episodic summaries
- property-aware procedural skills
- fact promotion from map and parcel runs

Code changes:
- [packages/server/src/services/agent-learning.service.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/server/src/services/agent-learning.service.ts)
- [packages/server/src/services/learning-fact-promotion.service.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/server/src/services/learning-fact-promotion.service.ts)
- [packages/server/src/services/trajectory-log.service.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/server/src/services/trajectory-log.service.ts)
- [packages/server/src/services/episodic-memory.service.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/server/src/services/episodic-memory.service.ts)
- [packages/server/src/services/procedural-skill.service.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/server/src/services/procedural-skill.service.ts)
- [apps/web/lib/agent/agentPostRunEffects.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/lib/agent/agentPostRunEffects.ts)

Tasks:
1. Resolve entity context from parcel IDs, selected map features, and parcel sets, not only `dealId`.
2. Promote successful parcel screening and parcel-comparison runs into property episodes.
3. Extract recurring property analysis procedures as procedural skills, for example:
   - “industrial parcel triage in East Baton Rouge”
   - “screening flood/wetlands/traffic before IOS underwriting”
4. Add confidence thresholds that distinguish weak observations from reusable property patterns.
5. Surface promoted property learnings back into retrieval.

Acceptance:
- a successful parcel analysis run creates reusable property memory even if no `Deal` exists yet
- later runs on similar parcels retrieve those learnings automatically

### Phase 5 — Property Copilot Loops

Goal:
Turn the app into a continuously learning property operating system.

Deliverables:
- background refresh loops
- next-best-action generation
- proactive property-level updates

Code changes:
- `apps/web/lib/automation/`
- `packages/server/src/automation/`
- `apps/web/app/api/cron/`
- map and opportunities surfaces

Tasks:
1. Add property-refresh automation loops:
   - re-screen changed parcels
   - refresh permit/entitlement posture
   - re-evaluate ownership outreach opportunities
2. Add next-best-action generation onto `PropertyProfile`.
3. Push proactive actions to `/opportunities`, `/map`, and `/command-center`.
4. Add “why did the agent recommend this?” traceability from property brain state.

Acceptance:
- operators see proactive updates tied to properties
- the app evolves property recommendations as evidence changes

### Phase 6 — UI/Operator Surfaces

Goal:
Expose the property brain in the places operators already work.

Surfaces:
- `/map`
- `/deals/[id]`
- `/opportunities`
- `/chat`
- `/command-center`

File-level tasks:
- [apps/web/components/maps/ParcelDetailCard.tsx](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/components/maps/ParcelDetailCard.tsx)
  - add profile, memory, and next-action tabs
- [apps/web/components/maps/MapOperatorConsole.tsx](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/components/maps/MapOperatorConsole.tsx)
  - add parcel-brain table and relationship views
- [apps/web/components/chat/ChatContainer.tsx](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/components/chat/ChatContainer.tsx)
  - show property retrieval sources and trust envelope
- `apps/web/components/opportunities/*`
  - show property-derived recommendations, not only scan results
- `apps/web/components/command-center/*`
  - include property drift and property next-action queues

Acceptance:
- every property-facing surface can show what the system knows, why it knows it, and what it wants the operator to do next

## Migration / Rollout Sequence

Recommended implementation order:
1. Phase 0
2. Phase 1
3. Phase 3
4. Phase 2
5. Phase 4
6. Phase 6
7. Phase 5

Reason:
- unify property subjects first
- start capturing observations early
- switch retrieval before building too much new UI
- then build the durable property brain model on top of actual observed data

## Validation Gates By Phase

Phase 0:
- entity resolution tests
- no duplicate entity creation across parcel/address/map contexts

Phase 1:
- property observation ingestion tests
- parcel/map route tests
- no duplicate observations on repeated reads

Phase 2:
- profile assembly snapshot tests
- route tests for profile endpoints

Phase 3:
- retrieval adapter tests
- live chat/map route verification
- proof that parcel questions retrieve entity/property evidence

Phase 4:
- learning promotion tests
- procedural/episodic creation assertions
- property-linked fact promotion coverage

Phase 5/6:
- operator UI tests
- targeted Playwright map/chat/opportunity sweeps

## Immediate Highest-Leverage Build Slice

If only one slice is approved next, implement:

### Slice A — Property-Centric Retrieval Spine

Includes:
- Phase 0 subject unification (minimal version)
- Phase 1 property observation ingestion on parcel/map reads
- Phase 3 retrieval pivot

Why this first:
- It makes the agent materially smarter on live property work without needing the entire property-brain UI stack.
- It closes the gap between what the prompts expect (`recall_property_intelligence`) and what the runtime actually provides.

Files for Slice A:
- [packages/db/prisma/schema.prisma](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/db/prisma/schema.prisma)
- [packages/server/src/services/entity-resolution.service.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/server/src/services/entity-resolution.service.ts)
- `packages/server/src/services/property-observation.service.ts`
- [apps/web/app/api/parcels/route.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/app/api/parcels/route.ts)
- [apps/web/app/api/map/prospect/route.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/app/api/map/prospect/route.ts)
- [packages/openai/src/agents/webRuntimeContracts.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/agents/webRuntimeContracts.ts)
- [apps/web/lib/agent/executeAgent.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/lib/agent/executeAgent.ts)
- [packages/openai/src/dataAgent/retrieval.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/dataAgent/retrieval.ts)
- [packages/openai/src/agentos/toolPolicy.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/agentos/toolPolicy.ts)

## Risks

1. Property DB is still remote/gateway-backed
Learning cannot depend on brittle synchronous gateway calls during every prompt. Observation capture should be async-safe and failure-tolerant.

2. Duplicate subject creation
If Phase 0 is weak, every later phase will amplify duplicate property brains.

3. Retrieval bloat
If property retrieval dumps too much evidence into prompt context, the agent will get slower and less reliable.

4. Overpromotion
If every screening line becomes verified fact, property memory quality will degrade fast.

## Recommendation

Approve Slice A first.

That gives the application a real property-learning backbone with the smallest architectural blast radius and the highest improvement in agent quality for map, parcel, chat, and opportunity workflows.
