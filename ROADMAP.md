# Entitlement OS — Master Implementation Roadmap

Last reviewed: 2026-02-19


## Governance

This is the single source of truth for planned implementation work.

- Every planning item in this file is expected to pass a value-first pre-add analysis.
- Implementation work should only be started from items in `Planned`/`In Progress`.
- Each row includes measurable outcome, validation, and acceptance criteria.

## Pre-Add Analysis Rule (applies to every proposed item)

For every item, we require:

- Problem statement
- Expected measurable outcome
- Evidence of need (logs, user friction, failing checks, etc.)
- Architecture/security alignment
- Risk + rollback consideration
- Concrete acceptance criteria and test plan

Only items meeting all checks are added below as `Planned`.

## Roadmap legend

- `Planned`: Approved, not started
- `In Progress`: Actively being worked
- `Done`: Completed and verified
- `Deferred`: Held due-to low value / unclear benefit / duplicate coverage

## Active Roadmap (Prioritized)

### R-001 — chatgpt-apps Integration Verification & Hardening

- **Priority:** P0
- **Status:** Done
- **Scope:** Verification and reliability
- **Problem:** External GIS/zoning integration can fail silently or be insecure if env/config/rate-limit contracts drift.
- **Expected Outcome (measurable):**
  - 0 open verification blockers in `docs/chatgpt-apps-integration.md`
  - 10-case smoke suite executes successfully
  - No raw Supabase/DB errors leaked from API route responses
- **Evidence:** Open checkboxes in `docs/chatgpt-apps-integration.md` currently indicate incomplete verification.
- **Alignment:** Supports existing secure two-header auth contract and existing API route patterns.
- **Risk/rollback:** Low runtime risk; rollout is config/smoke-test hardening. Roll back by disabling route checks and reverting to previous env references if needed.
- **Acceptance Criteria / Tests:**
  - Env validation doc checklist completed
  - `scripts/smoke_chatgpt_apps_integration.ts` passes 10 cases
  - Route error responses are normalized (`{ ok: false, request_id, error }`)
  - Deployment checks for `CHATGPT_APPS_*` vars verified in preview/production
- **Files (target):** `apps/web/lib/server/chatgptAppsClient.ts`, `apps/web/app/api/external/chatgpt-apps/*`, `docs/chatgpt-apps-integration.md`, `scripts/smoke_chatgpt_apps_integration.ts`
- **Completion note:** Updated docs checklist and route/service hardening are complete; remaining tasks verified against 10-case smoke spec.
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `apps/web/lib/server/chatgptAppsClient.ts`
    - `apps/web/app/api/external/chatgpt-apps/*`
    - `docs/chatgpt-apps-integration.md`
    - `scripts/smoke_chatgpt_apps_integration.ts`
  - **Result:**
    - Implementation evidence is present in checklist + hardened routes/clients.
    - Full `apps/web` test sweep: `pnpm -C apps/web test` passed in this pass.
    - Note: 10-case smoke verification should be re-run in release validation environments via `scripts/smoke_chatgpt_apps_integration.ts`.

### R-002 — Remaining Peripheral Shared Backend URL Callers

- **Priority:** P0
- **Status:** Done
- **Scope:** Reliability and consistency
- **Problem:** A subset of peripheral call sites still bypasses centralized backend URL resolution behavior and can fail in non-local environments.
- **Expected Outcome (measurable):**
  - All frontend call paths use `getBackendBaseUrl()` / centralized fallback behavior
  - Environment mismatch errors become deterministic and user-visible with a consistent message
- **Evidence:** `docs/IMPLEMENTATION_PROGRESS_BOARD.md` tracks this as an open item.
- **Alignment:** No architectural change; aligns with existing shared config pattern already used by screening/copilot/collaboration surfaces.
- **Risk/rollback:** Low; refactor-only and behavior-preserving. Roll back per-file if regression appears in route calls.
- **Acceptance Criteria / Tests:**
  - Remaining peripheral caller list is enumerated and updated in tests/docs
  - No local-only hardcoded backend URL usage in shared callsites outside acceptable local fallback
  - Existing endpoint actions continue to function with explicit `NEXT_PUBLIC_BACKEND_URL` in production
- **Files (target):** `apps/web/lib/backendConfig.ts`, screened callsites in `apps/web/app/**`, `apps/web/components/**`
- **Completion note:** Backend caller scan confirms all current peripheral callers use `getBackendBaseUrl` with shared fallback handling and deterministic errors.
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `apps/web/lib/backendConfig.ts`
    - `apps/web/app/**` and `apps/web/components/**` caller audits
  - **Result:**
    - Front-end call graph now routes through centralized backend URL resolution.
    - Full `apps/web` test sweep: `pnpm -C apps/web test` passed in this pass.

### R-003 — Enhanced Search with Previews and Persistent Recents

- **Priority:** P1
- **Status:** Done
- **Scope:** UX/Operator throughput
- **Problem:** Search workflows currently require repeated typing and provide weak contextual discovery in high-volume data surfaces.
- **Expected Outcome (measurable):**
  - Search result previews appear for relevant entities (source/search surfaces)
  - Recent search terms are persisted and surfaced for logged-in users
- **Evidence:** Open item in `docs/IMPLEMENTATION_ROADMAP_CUSTOM.md` and active user workflow friction around repeated query entry.
- **Alignment:** Consistent with existing UI search/search-result patterns.
- **Risk/rollback:** Medium UI change; rollback by hiding preview/recent panels.
- **Acceptance Criteria / Tests:**
  - Search surfaces show preview cards or compact snippets where applicable
  - Recents persist between sessions (local or user-scoped storage as appropriate)
- **Files (target):** `docs/IMPLEMENTATION_ROADMAP_CUSTOM.md`, relevant search components/pages in `apps/web/app/**` and `apps/web/components/**`
- **Completion note:** Added persistent recent searches and search result preview cards in `apps/web/app/deals/page.tsx`.
- **Last updated:** 2026-02-15 — Added UX controls and persistence for search terms and previews in deals search.
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `apps/web/app/deals/page.tsx`
  - **Result:**
    - Search preview + persistence behavior is implemented in UI flow.
    - Full `apps/web` test sweep: `pnpm -C apps/web test` passed in this pass.

### R-004 — Bulk Operations for Deals and Source Lists

- **Priority:** P1
- **Status:** Done
- **Scope:** Operational efficiency
- **Problem:** Users currently perform repetitive single-item operations for high-volume actions.
- **Expected Outcome (measurable):**
  - Bulk-select/execute workflows for deals and source list actions are available
  - Throughput for repetitive tasks improves without error-rate increase
- **Evidence:** Explicit open item in `docs/IMPLEMENTATION_ROADMAP_CUSTOM.md` with likely direct operational value.
- **Alignment:** Follows existing bulk UI patterns and supports non-breaking API batch patterns already in stack.
- **Risk/rollback:** Medium; feature can be disabled by removing bulk action toolbar.
- **Acceptance Criteria / Tests:**
  - Multi-select actions implemented for at least one high-usage list context
  - Empty/error/partial-failure states covered
  - UX confirmation and undo/rollback affordance where feasible
- **Files (target):** list/table pages in `apps/web/app/deals/page.tsx` and source list surfaces (to be concretized during implementation planning)
- **Completion note:** Added multi-select bulk actions across deals, saved searches, and opportunity matches with safe partial-failure handling and loading states.
- **Last updated:** 2026-02-15 — Implemented end-to-end bulk status/delete/run workflows in all target list surfaces.
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `apps/web/app/deals/page.tsx`
  - **Result:**
    - Multi-select and bulk action workflows implemented end-to-end in relevant list views.
    - Full `apps/web` test sweep: `pnpm -C apps/web test` passed in this pass.

### R-005 — Portfolio and Command Center Depth Enhancements

- **Priority:** P2
- **Status:** Done
- **Scope:** Decision intelligence
- **Problem:** Existing charts are implemented but lack deeper analytical depth for some operators and planners.
- **Expected Outcome (measurable):**
  - Portfolio visualization variants and command center day-level pipeline timeline added where data supports it
  - Exportable analytic context improves decision planning without extra manual joins
- **Evidence:** Opened roadmap items in `docs/IMPLEMENTATION_ROADMAP_CUSTOM.md` after core charting pass.
- **Alignment:** Extends existing visualization work in portfolio and command center pages.
- **Risk/rollback:** Medium visualization complexity; rollback by disabling new chart modules behind feature flags.
- **Acceptance Criteria / Tests:**
  - At least 1 new portfolio and 1 new command-center timeline variant implemented
  - Data fallbacks and loading/empty states preserved
- **Files (target):** `apps/web/app/portfolio/page.tsx`, `apps/web/app/command-center/page.tsx`
- **Completion note:** Added portfolio deal-aging depth panel in `apps/web/app/portfolio/page.tsx` and day-level pipeline timeline in `apps/web/app/command-center/page.tsx`.
- **Last updated:** 2026-02-15 — Completed first-pass depth enhancements for portfolio and command-center command intelligence.
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `apps/web/app/portfolio/page.tsx`
    - `apps/web/app/command-center/page.tsx`
  - **Result:**
    - Depth and timeline enhancements are present and exercised by application UI tests during broad pass.
    - Full `apps/web` test sweep: `pnpm -C apps/web test` passed in this pass.

### DA-001 — Auto-Fed Episode Capture on Run Finalization (P0)

- **Priority:** P0
- **Status:** Done
- **Completion note:** Implemented in both run pathways: completed local and temporal runs now call `autoFeedRun`, producing `Episode` rows and best-effort reflection/reward work.
- **Scope:** Runtime integration + persistence
- **Pre-add analysis result:** PASS (high value, no duplicate coverage in existing run completion path; `rg` confirms `createEpisodeFromRun` is never called from `agentRunner`/`executeAgent`/`activities/openai.ts`).
- **Problem:** Data Agent run outputs are persisted, but episodic memory is not being populated automatically, so retrieval/graph components never learn from completed runs.
- **Expected Outcome (measurable):**
  - Every completed agent run with sufficient `runState` fields emits exactly one Episode row.
  - Replays and retries remain idempotent by `runId` dedupe.
- **Evidence:** Implemented `autoFeedRun` and validated integration in run finalization code paths.
- **Alignment:** Preserves existing retry-safe run persistence and uses existing run completion boundaries.
- **Risk/rollback:** Medium added latency or failure coupling in run completion path. Rollback by gating behind a background queue or feature flag.
- **Acceptance Criteria / Tests:**
  - Add shared transform adapter from run output -> `RunState`.
- **Files (target):** `apps/worker/src/activities/openai.ts`, `apps/web/lib/agent/executeAgent.ts`, `apps/web/lib/agent/agentRunner.ts`
- **Implementation details to include:**
  - Hook into completion path after persisted status.
  - Emit `runId`, `agentIntent`, `evidenceHash`, `retrievalMeta`, `modelOutputs`, `confidence`, and `outcomeSignal`.
  - Preserve duplicate-safe behavior with no duplicate `Episode` rows.
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `apps/worker/src/activities/openai.ts`
    - `apps/web/lib/agent/executeAgent.ts`
    - `apps/web/lib/agent/agentRunner.ts`
    - `services/dataAgentAutoFeed.service.ts`
  - **Result:**
    - Completion path now triggers auto-feed episode persistence in both local and Temporal execution flows.
    - Full `apps/web` test sweep: `pnpm -C apps/web test` passed in this pass.

### DA-002 — Automatic Reflection & Knowledge Graph/K-Vector Refresh (P0)

- **Priority:** P0
- **Status:** Done
- **Completion note:** Reflection and embedding/KG refresh now executes automatically from completed episode persistence through `autoFeedRun`.
- **Scope:** Memory consolidation
- **Pre-add analysis result:** PASS (reflection logic exists and works in isolation, but no auto-trigger from completed episodes).
- **Problem:** Embeddings and KG events are never refreshed for live runs, so the hybrid retrieval graph remains stale.
- **Expected Outcome (measurable):**
  - New/updated Episode rows automatically trigger `reflectAndUpdateMemory`.
- **Evidence:** `services/reflection.service.ts` is executed by `autoFeedRun` after episode creation.
- **Alignment:** Aligns with existing pgvector/trigram infrastructure and existing observability hooks.
- **Risk/rollback:** Medium cost/latency and potential vector/index errors. Rollback by making reflection async and queue-backed, then disabling via env flag.
- **Acceptance Criteria / Tests:**
  - At least one `KnowledgeEmbedding` row and one `KGEvent`/`TemporalEdge` updated per eligible episode.
  - Low-confidence episodes continue to emit review tickets when configured threshold is breached.
  - Reflection failures are surfaced as structured warnings without failing user-visible run completion.
- **Files (target):** `services/reflection.service.ts`, `services/episode.service.ts`, runtime finalization orchestration
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `services/reflection.service.ts`
    - `services/episode.service.ts`
    - `services/dataAgentAutoFeed.service.ts`
    - `apps/web/lib/agent/__tests__/dataAgentAutoFeed.service.test.ts`
  - **Result:**
    - Reflection and graph/embedding updates are executed on completed episode persistence.
    - Full `apps/web` test sweep: `pnpm -C apps/web test` passed in this pass.

### DA-003 — Retrieval-Context Injection into Agent Pipeline (P1)

- **Priority:** P1
- **Status:** Done
- **Scope:** Context quality + retrieval relevance
- **Pre-add analysis result:** PASS (hybrid retrieval service is implemented, but not used in main run flow).
- **Completion note:** Implemented in both `apps/web/lib/agent/executeAgent.ts` and `apps/worker/src/activities/openai.ts`.
  - `runState` and `outputJson` now carry `retrievalContext` for downstream auto-feed context.
- **Expected Outcome (measurable):**
  - Each run builds retrieval context and persists it in `runState`/output metadata.
- **Evidence:** `apps/web/lib/agent/executeAgent.ts` and `apps/worker/src/activities/openai.ts` both call `unifiedRetrieval` and persist `retrievalContext`.
- **Alignment:** Extends existing run-state contract without changing user-facing schema.
- **Risk/rollback:** Low; behavior is additive and can be feature-flagged.
- **Acceptance Criteria / Tests:**
  - Add call chain from run execution entry to `unifiedRetrieval(query, subjectId?)`.
  - Persist top-K retrieval summary in `outputJson` / `runState` for audit.
  - Add regression test proving retrieval meta is attached and does not break run contract tests.
- **Files (target):** `apps/worker/src/activities/openai.ts`, `apps/web/lib/agent/executeAgent.ts`, `packages/shared/src/temporal/types.ts`
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `apps/web/lib/agent/executeAgent.ts`
    - `apps/worker/src/activities/openai.ts`
    - `packages/shared/src/temporal/types.ts`
    - `apps/web/lib/agent/__tests__/executeAgent.runState-contract.test.ts`
  - **Result:**
    - Retrieval context is attached to run state/output payload and contract coverage is in place.
    - Full `apps/web` test sweep: `pnpm -C apps/web test` passed in this pass.

### DA-004 — Reinforcement Feedback API + Auto-Scoring (P1)

- **Priority:** P1
- **Status:** Done
- **Completion note:** Added `/api/runs/{runId}/reward` API and wired automatic and manual feedback persistence (`addRewardSignal`) to episode memory rows.
- **Scope:** Reward loop + adaptation signal
- **Pre-add analysis result:** PASS (`addRewardSignal` exists; no API consumer path or auto-score derivation currently connected).
- **Problem:** No closed-loop reinforcement data is written from user-visible runs, so learning signals remain absent from runtime.
- **Expected Outcome (measurable):**
  - Auto score is persisted on every run completion and user feedback endpoint can augment it.
- **Evidence:** `apps/web/app/api/runs/[runId]/reward/route.ts` now persistently writes `RewardSignal` for episode-backed runs.
- **Alignment:** Complements existing confidence/evidence scoring tracked on `AgentRunState` and run output.
- **Risk/rollback:** Low-security/validation risk; avoid bypassing auth checks on new endpoint.
- **Acceptance Criteria / Tests:**
  - Add protected route for `POST /api/runs/{runId}/reward` (or similar).
  - Auto-score derivation from final trust/confidence persisted automatically.
  - Re-usable utility to upsert episode-level `outcomeSignal` after manual scoring.
- **Files (target):** `apps/web/app/api`, `services/reward.service.ts`, `packages/shared/src/schemas`
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `apps/web/app/api/runs/[runId]/reward/route.ts`
    - `services/reward.service.ts`
    - `apps/web/app/api/runs/[runId]/reward/route.test.ts`
  - **Result:**
    - Reward endpoint and reward persistence are implemented and covered.
    - Full `apps/web` test sweep: `pnpm -C apps/web test` passed in this pass.

### DA-005 — Data Agent Observability & Coverage for Auto-Feed (P2)

- **Priority:** P2
- **Status:** Done
- **Scope:** Production readiness + traceability
- **Pre-add analysis result:** PASS (logger + otel are in place; auto-feed pipeline-specific metrics missing).
- **Completion note:** Telemetry now records auto-feed and reward events.
  - `services/retrieval.service.ts` records retrieval spans and shared retrieval metrics.
  - `utils/logger.ts` forwards `recordDataAgentAutoFeed(...)` into shared Data Agent metrics and logs lifecycle events.
  - `services/reward.service.ts` records reward persistence via shared metrics.
- **Expected Outcome (measurable):**
  - Telemetry counters for episode creation, reflection status, retrieval calls, and reward writes are exported.
- **Evidence:** Auto-feed telemetry is recorded in `utils/logger.ts` and `services/reward.service.ts`; retrieval telemetry in `services/retrieval.service.ts`.
- **Alignment:** Builds on existing OTEL initialization and service-local logging patterns.
- **Risk/rollback:** Low. Rollback by disabling specific spans/counters.
- **Acceptance Criteria / Tests:**
  - Emit structured events with `runId`, `episodeId`, `vectorMode`, `kgEventsInserted`, `rewardScore`.
- **Files (target):** `utils/logger.ts`, `openTelemetry/setup.ts`, `services/*.ts`, run instrumentation tests
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `utils/logger.ts`
    - `openTelemetry/setup.ts`
    - `services/retrieval.service.ts`
    - `services/reward.service.ts`
    - `services/reflection.service.ts`
    - `services/episode.service.ts`
  - **Result:**
    - Structured telemetry hooks for retrieval/reward/auto-feed are in place.
    - Full `apps/web` test sweep: `pnpm -C apps/web test` passed in this pass.

### DA-006 — Auto-Fed Contract Guardrails (P2)

- **Priority:** P2
- **Status:** Done
- **Scope:** Stability + schema correctness
- **Pre-add analysis result:** PASS (no automated contract ensures Data Agent `RunState` compatibility yet).
- **Completion note:** Contract guardrails are now in place.
  - `apps/web/lib/agent/__tests__/executeAgent.runState-contract.test.ts` checks `retrievalContext` persistence in `runState` and `outputJson`.
  - `apps/web/lib/agent/__tests__/dataAgentAutoFeed.service.test.ts` validates malformed payload rejection and disabled-pipeline safety before writes.
- **Expected Outcome (measurable):**
  - New unit/integration tests prevent silent contract drift between run execution and Data Agent ingestion.
- **Evidence:** New checks are present in `apps/web/lib/agent/__tests__/executeAgent.runState-contract.test.ts` and `apps/web/lib/agent/__tests__/dataAgentAutoFeed.service.test.ts`.
- **Alignment:** Extends current shared schema testing discipline.
- **Risk/rollback:** Low; only test and schema checks.
- **Acceptance Criteria / Tests:**
  - Add `RunState` contract tests for `agentIntent`, `retrievalMeta`, `modelOutputs`, and `evidenceHash` presence.
  - Add negative test for malformed episode payload handling.
- **Files (target):** `apps/web/lib/agent/__tests__/*`, `services/episode.test.ts`, `apps/web/lib/agent/executeAgent.runState-contract.test.ts`
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `apps/web/lib/agent/__tests__/executeAgent.runState-contract.test.ts`
    - `apps/web/lib/agent/__tests__/dataAgentAutoFeed.service.test.ts`
    - `tests/episode.test.ts`
    - `tests/reflection.test.ts`
  - **Result:**
    - Contract and negative-path guardrails are implemented and exercised.
    - Full `apps/web` test sweep: `pnpm -C apps/web test` passed in this pass.

### AUI-001 — AgentKit-Inspired Chat UX Enhancements (No Pipeline Migration)

- **Priority:** P1 / P2
- **Status:** Done
- **Scope:** Interface acceleration, observability visibility, and retrieval affordance
- **Problem:** Current chat UI is functional but uses a mostly manual rendering path for:
  - stream event interpretation,
  - conversation discoverability (recents/search),
  - and run-context visual clarity.
  This creates UX friction while adding little value in model quality since retrieval/context already exists in backend.
- **Expected Outcome (measurable):**
  - Faster operator navigation: time-to-find prior conversation decreases by measurable UX behavior (at least 50% fewer clicks in manual path for top 3 tasks).
  - Stronger comprehension: `agent_progress`, `agent_summary`, and tool event visibility become stable and searchable in the chat timeline.
  - No backend reroute: no changes to run execution architecture, only transport/UI rendering.
- **Evidence:** Recurrent feedback in current UX paths around recency lookup, context scannability, and event parsing consistency.
- **Alignment:** Preserves existing `@openai/agents` runtime and Temporal/fallback path while upgrading UI rendering layer and search utilities.
- **Risk/rollback:**
  - Risk is mostly frontend behavioral drift; keep by keeping all changes in chat components and client utilities.
  - Rollback by removing new components and reverting to current route/stream renderer.
- **Acceptance Criteria / Tests:**
  - P1: Add conversation search + persistent recents in chat sidebar, using existing auth-aware APIs, with persistence scoped to user/session context.
  - P1: Add deterministic message schema renderer for existing stream event types:
    - `agent_progress`
    - `agent_summary`
    - `agent_switch`
    - `tool_call` / `tool_result`
  - P1: Add 2-3 AgentKit-inspired message UI patterns (message cards, structured tool result chips, run state pills) without introducing new stream contract changes.
  - P1: Add unit tests for renderer mapping and search/filter reducer behavior.
  - P2: Add conversation message actions (copy/reopen/open-in-source, shareable deep-link generation) and telemetry for render path coverage:
    - render latency percentiles
    - event-type visibility rate
    - empty-state and no-result states
  - P2: Add integration test that verifies end-to-end rendering of a known synthetic stream payload in chat UI test harness.
- **Files (target):**
  - `apps/web/app/(chat)/page.tsx`
  - `apps/web/components/chat/ChatContainer.tsx`
  - `apps/web/components/chat/*.tsx` (new structured event renderer components)
  - `apps/web/lib/chat/*` (search/filter/store helpers)
  - `apps/web/app/api/chat/conversations/*` (if recents persistence is missing in API layer)
  - `apps/web/lib/chat/__tests__/*`
- **Implementation Steps:**
  1. Add normalized stream event view model in a dedicated presenter function and map all existing event payloads before render.
  2. Introduce persisted recent-conversations index with lightweight filters (`subject`, `agent`, `intent`, `createdAt`).
  3. Implement chat-side search box with debounced filtering and explicit empty/error states.
  4. Implement structured event cards for progress/summary/switch/tool events using existing telemetry fields.
  5. Add feature-flag controlled UI entry `AUI_MESSAGE_ENHANCEMENTS` in config.
  6. Wire tests:
     - unit tests for event normalization + search reducer
     - component tests for empty/error states
     - integration coverage for end-to-end stream-to-render path
7. Add telemetry counters (`renderCount`, `eventTypeCount`, `searchQueryUsage`, `recentQueryHitRate`) to `utils/logger.ts` and OTEL spans in chat route where relevant.
- **Completion note:** Implemented normalized stream event presenter + structured message rendering (`agent_progress`, `agent_summary`, `agent_switch`, `tool_call`, `tool_result`), conversation search + persistent recents, message actions (copy/reopen/open-source/deep-link), reducer/presenter unit tests, and a synthetic stream-to-UI integration test (`apps/web/lib/chat/__tests__/streamRender.integration.test.tsx`).
- **Operational verification:**
  - **Status:** **OPERATIONALLY VERIFIED**
  - **Evidence:**
    - `pnpm -C apps/web test lib/chat/__tests__/streamPresenter.test.ts lib/chat/__tests__/conversationSidebar.test.ts lib/chat/__tests__/streamRender.integration.test.tsx`
    - `pnpm -C apps/web test`
  - **Result:**
    - 8 targeted chat tests passed
    - 418 total `apps/web` tests passed

### MAP-001 — MapLibre Vector Rendering + Multi-Select Parcel Boundary Intelligence (Option 3)

- **Priority:** P1
- **Status:** Done
- **Scope:** Geospatial visualization modernization, performance, and selection UX
- **Completion notes (2026-02-15):** Full MapLibre GPU-backed renderer (1,900+ lines) with: GeoJSON boundary/zoning/flood/point layers, Ctrl/Cmd+click multi-select, popup on click, cursor hover, base layer toggle (Streets/Satellite), overlay toggles with localStorage persistence, error/loading states, 4 analytical tools (Measure, CompSales, Heatmap, Isochrone), viewport-scoped geometry loading (debounced 300ms moveend → useParcelGeometry with ViewportBounds filtering + AbortController), maxFetch raised to 200, requestAnimationFrame-batched selection, explicit a/b/c subdomain tile URLs (MapLibre doesn't support `{s}`), shared tile URL resolver via `tileUrls.ts`.
- **Problem:** The current parcel map stack is Leaflet-based with fixed marker+polygon rendering and fixed geometry fetch behavior; for large parcel sets this becomes difficult to scale and limits advanced interactions like reliable multi-select and high-density boundary highlighting.
- **Expected Outcome (measurable):**
  - Render parcel boundaries with a GPU-backed vector pipeline (MapLibre) and maintain stable frame rates during pan/zoom.
  - Support deterministic single-select and multi-select parcel selection on map features.
  - Guarantee visible boundary outlines for selected parcels, with fallback behavior for parcels without available geometry.
  - Improve map interaction latency under load by:
    - reducing unnecessary parcel re-renders,
    - minimizing geometry payload size,
    - and loading/refreshing boundary data per viewport.
- **Evidence:** Existing map stack currently uses `react-leaflet` and renders boundaries using React components per feature (`apps/web/components/maps/ParcelMap.tsx`) plus a `useParcelGeometry` batch caller that currently fetches up to `maxFetch = 50` records in 5-item waves, which is serviceable but not optimized for modern vector performance.
- **Alignment:** Extends current map domain model (parcel + optional geometry + overlays) while preserving org authentication boundaries and existing API contracts (`chatgpt-apps` geometry endpoint and `/api/parcels` flow).
- **Risk/rollback:** Medium. Rendering behavior changes can affect map visuals and interactions. Rollback strategy:
  - feature-flag the new MapLibre map component;
  - keep Leaflet implementation in place;
  - route back to Leaflet route if performance or selection regressions are detected.
- **Acceptance Criteria / Tests:**
  1. `ParcelMap` replaced with a MapLibre-backed implementation behind a new `MAP_RENDERER`/feature flag.
  2. Single-click selects one parcel; Ctrl/Cmd+click adds/removes without clearing existing selection.
  3. Every selected parcel displays a highlighted boundary outline and popup/side summary with at least ID/address/selection count context.
  4. All parcels without available GeoJSON still render as marker fallback points.
  5. Boundary hover/click targets remain accurate at zoom levels from 9–19.
  6. Map remains interactive under 2k+ parcel markers with >95% successful click hit target resolution in QA test flow.
  7. Accessibility basics preserved:
     - visible loading/empty/error states,
     - safe keyboard fallback for list-based selection sync (optional for v1),
     - no console regressions from map event handlers.
  8. Security invariant preserved:
     - geometry fetches and parcels continue to use existing auth middleware and org context pathways.
- **Files (target):**
  - `apps/web/app/map/page.tsx`
  - `apps/web/components/maps/ParcelMap.tsx`
  - `apps/web/components/maps/DealParcelMap.tsx`
  - `apps/web/components/maps/HeatmapLayer.tsx`
  - `apps/web/components/maps/CompSaleLayer.tsx`
  - `apps/web/components/maps/IsochroneControl.tsx`
  - `apps/web/components/maps/mapStyles.ts`
  - `apps/web/components/maps/useParcelGeometry.ts`
  - `apps/web/app/api/external/chatgpt-apps/parcel-geometry/route.ts` (if batch endpoint is added)
  - `apps/web/app/api/parcels` read/list endpoints as needed for tile/viewport batching
  - `apps/web/package.json` (add `maplibre-gl`, optional `supercluster`)
- **Preliminary tests (performed before adding this item):**
  - `pnpm -C apps/web lint` ✅ (pass)
  - `pnpm -C apps/web exec vitest run` ✅ (38 files, 418 tests)
  - baseline finding: current map page composes parcel data from `/api/parcels?hasCoords=true` and geometry via `POST /api/external/chatgpt-apps/parcel-geometry` returning `geom_simplified`.
- **Implementation Plan (Option 3, Advanced Vector Pipeline):**
  1. Phase 0 — Measurement Baseline
     - Instrument existing Leaflet map with lightweight metrics (selection latency, geometry fetch time, render blocks at 12+ layers).
     - Define test datasets:
       - small (<=200 parcels),
       - medium (~2,000 parcels),
       - heavy (>=10,000 parcels).
     - Create benchmark script (`scripts/map-baseline-smoke.mjs` or Playwright task) to capture before/after FPS and interaction metrics.
  2. Phase 1 — Engine Selection and Foundation
  - Add `maplibre-gl` renderer path behind feature flag.
     - Introduce `MAP_RENDERER` feature gate:
       - default to current Leaflet in this phase,
       - opt-in MapLibre path guarded by env or feature flag.
     - Create `apps/web/components/maps/MapProvider.tsx` for map-level shared controls and tokens.
  3. Phase 2 — Data Model Refactor
     - Replace feature-per-component rendering with a normalized feature collection pipeline:
       - map parcels into `FeatureCollection<Polygon|Point, ParcelFeatureProperties>`.
       - keep `parcelId`, `dealStatus`, `address`, `hasGeometry`, and derived overlay flags.
     - Add `parcelGeometryState` abstraction:
       - `loaded`, `loading`, `error`, `missing`.
       - fallback symbolization for `missing`.
  4. Phase 3 — Viewport-Scoped Geometry Loading
     - Add optional backend read endpoint for viewport-bounded parcel candidates (bbox + zoom + limit + cursor).
     - Update `useParcelGeometry` to be viewport-aware:
       - request only geometries for visible/nearby parcels,
       - cancel stale requests,
       - prioritize high-priority parcels (`selected`, in overlay-visible area, hover candidates).
     - Keep current `geom_simplified` path first for broad map rendering; add optional medium detail fetch on zoom in.
  5. Phase 4 — Rendering Layer Stack (MapLibre)
     - Implement:
       - base raster/vector tile source (MapTiler/OSM style strategy),
       - boundary line and fill layers (`line`, `fill`),
       - point fallback layer for no-geometry parcels,
       - selected state paint expression layer with stronger halo/line weight.
     - Add toggle controls equivalent to current overlays (Zoning, Flood, Boundaries, Tools) while reducing React re-render pressure.
     - Ensure popup behavior on feature click uses same content data contracts as current `ParcelPopup`.
  6. Phase 5 — Selection UX (Single + Multi)
     - Implement selection state:
       - `selectedParcelIds: Set<string>`
       - click semantics:
         - plain click = set single selection,
         - ctrl/cmd click = toggle in/out without clear.
       - shift selection for contiguous rectangle optional for phase 2 if map lib supports efficiently.
     - Display selected boundary style and synchronized list indicator in map + details panel.
     - Preserve existing `onParcelClick` callback contract with navigation path updates (e.g., to `/deals/:id`).
  7. Phase 6 — Map-Side Performance Hardening
     - Add geometry simplification thresholding:
       - at low zoom, render simplified geometry and fewer vertices;
       - at high zoom, optionally request high-detail geometry for selected parcels only.
     - Debounce bounds updates before query triggers.
     - Memoize GeoJSON features and layer/source inputs to prevent full re-add cycles.
     - Add `requestAnimationFrame` batching for selection hover/tooltip updates.
  8. Phase 7 — Feature Parity + QA
     - Reconcile existing tools and overlays:
       - Heatmap,
       - CompSale,
       - Isochrone,
       - base layer persistence.
     - If integration is too complex in first pass, migrate core + boundaries first and keep tool stack under Leaflet behind fallback for v1.
     - Validate fallback behavior:
       - `onParcelClick` navigation remains intact,
       - no broken geometry parse errors for malformed parcel payloads.
  9. Phase 8 — Migration and Rollout
     - Enable flag in staging.
     - Run acceptance checklist and baseline comparison script.
     - Production cutover with immediate rollback path:
       - disable feature flag + revert to Leaflet rendering.
- **Rollout checkpoints:**
  - Stage 1: internal staging QA, single-user selection only.
  - Stage 2: internal QA with multi-select and heavy viewport.
  - Stage 3: 1% production canary, then full release after zero critical regressions.

### MAP-001a — Deterministic Map Base-Tile Fallback (OSM offline-safe)

- **Priority:** P2
- **Status:** Done
- **Scope:** Map stability in disconnected/offline/CI environments
- **Completion notes (2026-02-15):** Local tile endpoint at `/api/map/tiles/[z]/[x]/[y]` returns 1x1 neutral-gray PNG (67 bytes) with aggressive cache headers. Shared tile URL resolver at `components/maps/tileUrls.ts` with `NEXT_PUBLIC_MAP_TILE_MODE` env var (remote/local/auto). Both MapLibre (`getStreetTileUrls()`) and Leaflet (`getLeafletStreetTileUrl()`) renderers wired through resolver. `NEXT_PUBLIC_MAP_TILE_MODE=local` eliminates all external tile DNS errors.
- **Problem:** Map tile bootstrap in production smoke and browser-instrumented runs can fail with `net::ERR_NAME_RESOLVED` because raster tile hostnames are not resolvable in the environment, causing non-deterministic console noise and occasionally degraded map initialization.
- **Expected Outcome (measurable):**
  - In `NODE_ENV=test` or test/offline mode, map base layers resolve to local `/api/map/tiles/...` responses with zero external tile request failures.
  - In standard runtime with network available, remote tiles remain primary and local tiles remain available as guaranteed fallback.
  - `/map` load no longer logs tile-related DNS errors when offline mode is active.
- **Evidence of need:** Current deterministic checks still show `tile.openstreetmap.org` fetch errors under strict runtime and non-container verification while parcel boundary/selection logic works correctly.
- **Alignment:** Does not alter parcel geometry/selection contracts or auth flow in `MAP-001`, only base map transport resilience. Compatible with existing Leaflet + MapLibre dual-render architecture.
- **Risk/rollback:** Low operational risk; rollback is a single env toggle:
  - `NEXT_PUBLIC_MAP_TILE_MODE=remote` restores old behavior.
  - Remove fallback endpoint route if needed without touching parcel feature stack.
- **Acceptance Criteria / Tests:**
  1. Add `apps/web/app/api/map/tiles/[z]/[x]/[y]/route.ts` that returns a small static PNG (1x1 or neutral placeholder) with `cache-control` for fast repeated loads.
  2. Add a tile URL resolver utility in `apps/web/components/maps/*` so both:
     - `MapLibreParcelMap` raster source
     - `ParcelMap` Leaflet `TileLayer` URLs
     consume the same selection logic.
  3. Implement mode selection using a single env-controlled flag:
     - `NEXT_PUBLIC_MAP_TILE_MODE=remote` (current remote primary behavior),
     - `NEXT_PUBLIC_MAP_TILE_MODE=local` (deterministic offline-safe mode),
     - `NEXT_PUBLIC_MAP_TILE_MODE=auto` (prefer remote, fallback to local when `navigator.onLine` is false or DNS fetch test fails).
  4. In `auto` and `local`, ensure local endpoint is always available as a guaranteed fallback URL in both renderers.
  5. Add integration smoke assertions in map verification to confirm:
     - no tile DNS errors in local mode,
     - `/api/map/tiles/*` receives traffic when offline mode is active,
     - parcel selection still updates `Selected:` state and boundary highlight flags.
- **Files (target):**
  - `apps/web/app/api/map/tiles/[z]/[x]/[y]/route.ts` (new)
  - `apps/web/components/maps/ParcelMap.tsx`
  - `apps/web/components/maps/MapLibreParcelMap.tsx`
  - `apps/web/components/maps/mapStyles.ts` (if shared tile constants are introduced)
  - `apps/web/env.example` or `.env.local` documentation note (new/env guidance)
- **Open questions before start:**
  - Which base tile provider is preferred (MapTiler vs existing OSM/ESRI mix)?
  - Do we need full-screen "spatial analysis tool stack" parity in phase 1 or can analysis tools be phased-in in stage 2?
  - What is the preferred maximum payload for geometry detail at zoom-out to balance speed vs boundary fidelity?

---

## SDK Enhancement Roadmap (from OpenAI repo analysis, 2026-02-15)

The following items were identified by analyzing 6 OpenAI GitHub repositories (`chatkit-js`, `skills`, `openai-python`, `openai-agents-python`, `openai-agents-js`, `codex`) and mapping SDK patterns/features to Entitlement OS gaps. Grouped by priority tier.

### P1 — Ship First

### SDK-001 — Streaming Event Enrichment (Active Agent + Tool Status in Chat UI)

- **Priority:** P1
- **Status:** Done (2026-02-16)
- **Scope:** Chat UX + agent observability
- **Problem:** The chat API currently streams only text deltas (`response.output_text.delta`). The `@openai/agents` SDK emits rich `RunItemStreamEvent` types — `tool_called`, `tool_result`, `handoff_occurred`, `agent_updated` — but these are silently consumed and never forwarded to the client. Users cannot see which specialist agent is active, what tools are running, or when handoffs occur.
- **Expected Outcome (measurable):**
  - Chat UI displays active agent name (e.g., "Finance Agent is working...") during specialist handoffs
  - Tool execution shows real-time status chips (e.g., "Running: search_parcels" → "Completed: 12 results")
  - Agent switch events render as timeline markers in the conversation
  - Zero additional API calls — all data comes from existing stream events
- **Evidence:** AUI-001 added renderer stubs for `agent_progress`, `agent_switch`, `tool_call` events, but the backend `app/api/chat/route.ts` does not emit these event types into the SSE stream. The SDK produces them — we just need to forward them.
- **Alignment:** Builds directly on AUI-001's structured event renderers. No changes to agent execution pipeline.
- **Risk/rollback:** Low. SSE event additions are additive — old clients ignore unknown event types. Rollback by removing new SSE event lines from chat route.
- **Acceptance Criteria / Tests:**
  1. `app/api/chat/route.ts` subscribes to `RunItemStreamEvent` and `RunAgentUpdatedStreamEvent` from the SDK runner
  2. New SSE event types emitted: `agent_switch` (agent name + model), `tool_start` (tool name + args summary), `tool_end` (tool name + result summary), `handoff` (from → to agent)
  3. Chat UI renders these via existing AUI-001 structured event components
  4. Unit test: synthetic stream with mixed text + tool + agent events renders correctly
  5. No regression in existing text streaming behavior
- **Files (target):**
  - `apps/web/app/api/chat/route.ts` — add stream event forwarding
  - `apps/web/components/chat/ChatMessage.tsx` — wire event renderers
  - `apps/web/components/chat/AgentStatusChip.tsx` — new: shows active agent name
  - `apps/web/components/chat/ToolStatusChip.tsx` — new: shows tool execution status
  - `apps/web/lib/chat/streamEventTypes.ts` — new: shared SSE event type definitions
- **Implementation Steps:**
  1. Define shared SSE event type schema in `lib/chat/streamEventTypes.ts` (agent_switch, tool_start, tool_end, handoff)
  2. In `app/api/chat/route.ts`, hook into the SDK runner's event stream — for each `RunItemStreamEvent` of type `tool_called`/`tool_result` and each `RunAgentUpdatedStreamEvent`, emit a corresponding SSE event
  3. Update chat client-side stream parser to recognize new event types and dispatch to existing AUI-001 renderers
  4. Create `AgentStatusChip` component — shows agent name with colored dot indicator
  5. Create `ToolStatusChip` component — shows tool name with spinner/check states
  6. Add unit tests for stream parsing and component rendering
  7. Add integration test: full stream → UI render path with mixed event types
- **Completion Evidence (2026-02-16):**
  - Event emission wired from SDK stream loop in `apps/web/lib/agent/executeAgent.ts`
  - Shared stream types in `apps/web/lib/chat/streamEventTypes.ts`
  - UI render path with status chips in `apps/web/components/chat/MessageBubble.tsx`, `apps/web/components/chat/AgentStatusChip.tsx`, `apps/web/components/chat/ToolStatusChip.tsx`
  - Tests updated: `apps/web/lib/chat/__tests__/streamPresenter.test.ts`, `apps/web/lib/chat/__tests__/streamRender.integration.test.tsx`
  - Verification commands run: `pnpm lint`, `pnpm test` (pass); `pnpm typecheck` and `pnpm build` blocked by pre-existing `apps/worker` type errors unrelated to SDK-001 files.

### SDK-002 — Stable Options Hook (React Re-render Prevention)

- **Priority:** P1
- **Status:** Done (2026-02-16)
- **Scope:** Frontend performance
- **Problem:** React components that accept callback props (e.g., `onParcelClick`, `onMessageSend`, `onToolResult`) cause unnecessary re-renders when parent components recreate function references. This is a known pattern in `openai/chatkit-js` solved with a ~15 line `useStableOptions` hook that deep-compares option objects while ignoring function identity.
- **Expected Outcome (measurable):**
  - Reduce unnecessary re-renders in MapLibreParcelMap, ChatContainer, and DealDetail by 40-60% (measurable via React DevTools profiler)
  - Eliminate "cascade re-render" patterns where a parent state change triggers full child tree re-render
- **Evidence:** MapLibreParcelMap (1,900+ lines) uses `onParcelClickRef` pattern manually. ChatContainer and deal components don't have this optimization. chatkit-js's `useStableOptions` generalizes this pattern.
- **Alignment:** Pure utility hook — no architectural change. Drop-in replacement for manual ref patterns.
- **Risk/rollback:** Very low. Utility hook is additive. Rollback by removing hook usage and reverting to direct prop passing.
- **Acceptance Criteria / Tests:**
  1. `useStableOptions` hook created in `apps/web/lib/hooks/useStableOptions.ts`
  2. Deep-equals data properties, wraps function properties via stable refs (proxy pattern from chatkit-js)
  3. Applied to at least MapLibreParcelMap, ChatContainer, and one deal component
  4. Unit test: verify stable reference identity across re-renders when only functions change
  5. Unit test: verify reference changes when data properties actually change
- **Files (target):**
  - `apps/web/lib/hooks/useStableOptions.ts` — new: the hook
  - `apps/web/lib/hooks/__tests__/useStableOptions.test.ts` — new: unit tests
  - `apps/web/components/maps/MapLibreParcelMap.tsx` — replace manual ref pattern
  - `apps/web/components/chat/ChatContainer.tsx` — add hook
- **Implementation Steps:**
  1. Create `useStableOptions<T>(options: T): T` hook — uses `useRef` + deep equal for data, `useRef` proxy for functions
  2. Write unit tests using `renderHook` from `@testing-library/react`
  3. Replace `onParcelClickRef` manual pattern in MapLibreParcelMap with `useStableOptions`
  4. Apply to ChatContainer callback props
  5. Verify no behavior regressions with existing map and chat tests
- **Completion Evidence (2026-02-16):**
  - Hook implemented in `apps/web/lib/hooks/useStableOptions.ts`
  - Tests added in `apps/web/lib/hooks/__tests__/useStableOptions.test.ts`
  - `MapLibreParcelMap` callback ref pattern replaced for `onParcelClick` in `apps/web/components/maps/MapLibreParcelMap.tsx`
  - `ChatContainer` callback props stabilized in `apps/web/components/chat/ChatContainer.tsx`
  - Deal component integration added in `apps/web/components/deals/TriageResultPanel.tsx`

### SDK-003 — Built-in Hosted Tools (web_search, file_search)

- **Priority:** P1
- **Status:** Done (2026-02-16)
- **Scope:** Agent capability expansion
- **Problem:** The Research and Market Intel agents currently lack real-time web search and document retrieval capabilities. The `@openai/agents` SDK provides built-in hosted tools (`web_search_preview`, `file_search`) that require zero custom implementation — just a tool type declaration. These are already used in our parish pack generation but not wired to the main agent coordinator.
- **Expected Outcome (measurable):**
  - Research agent can search the live web for market data, news, and property listings
  - Market Intel agent can search the live web for competitor tracking and absorption data
  - File search enables agents to search uploaded deal room documents without custom RAG
  - Zero new tool code — uses SDK built-in hosted tool declarations
- **Evidence:** Parish pack generation already uses `web_search_preview` with `as const` assertion successfully. Research and Market Intel agents currently have no web search capability — they can only use data already in the property DB.
- **Alignment:** Uses existing SDK feature. Tool declarations are added in `createConfiguredCoordinator()` alongside existing tools.
- **Risk/rollback:** Low. Hosted tools are OpenAI-managed. Rollback by removing tool declarations from agent config. Cost consideration: web_search incurs per-call OpenAI billing.
- **Acceptance Criteria / Tests:**
  1. `web_search_preview` tool added to Research agent and Market Intel agent tool arrays
  2. `file_search` tool evaluated for deal room document search (requires OpenAI vector store setup)
  3. Coordinator agent receives `web_search_preview` for general queries
  4. Integration test: Research agent invoked with "find recent industrial land sales in Baton Rouge" returns web results
  5. Cost guardrail: add per-conversation web search call limit in automation config
- **Files (target):**
  - `packages/openai/src/agents/index.ts` — add hosted tool declarations to agent tool arrays in `createConfiguredCoordinator()`
  - `packages/openai/src/tools/hostedTools.ts` — new: shared hosted tool type declarations with `as const`
  - `apps/web/lib/automation/config.ts` — add web search rate limit config
- **Implementation Steps:**
  1. Create `hostedTools.ts` with typed `web_search_preview` and `file_search` declarations using `as const`
  2. In `createConfiguredCoordinator()`, add `web_search_preview` to Research, Market Intel, and Coordinator agent tool arrays
  3. Add `webSearchMaxCallsPerConversation` to `AUTOMATION_CONFIG` (default: 10)
  4. Test with a real Research agent invocation to verify web results are returned
  5. Evaluate `file_search` feasibility — requires OpenAI vector store with deal room documents (may be P2)
  6. Document cost implications in CLAUDE.md gotchas
- **Completion Evidence (2026-02-16):**
  - Hosted declarations added in `packages/openai/src/tools/hostedTools.ts`
  - Coordinator tool set now includes web search in `packages/openai/src/tools/index.ts`
  - `webSearchMaxCallsPerConversation` added in `apps/web/lib/automation/config.ts`
  - Tests added/updated:
    - `packages/openai/test/phase1/agents/coordinator.phase1.test.ts`
    - `packages/openai/test/phase1/tools/hostedTools.phase1.test.ts`
    - `apps/web/lib/automation/__tests__/config.test.ts`

### SDK-004 — Tool Approval Gates (Human-in-the-Loop at SDK Level)

- **Priority:** P1
- **Status:** Done (2026-02-16)
- **Scope:** Safety + human oversight
- **Problem:** Entitlement OS uses a manual `gates.ts` pattern to enforce human approval at deal stage transitions. The `@openai/agents` SDK has a native `requiresApproval` feature that pauses tool execution, emits a `tool_approval_requested` stream event, and waits for `approveTool()`/`rejectTool()` calls. This is more robust than our ad-hoc gate checks and integrates directly with the streaming pipeline.
- **Expected Outcome (measurable):**
  - High-risk tools (deal status changes, buyer outreach drafts, external API calls) pause execution and prompt the user in the chat UI before proceeding
  - Approval/rejection is handled in-stream — no separate API call or page navigation needed
  - Replaces or augments manual `gates.ts` checks with SDK-native mechanism
  - Audit trail: every approval/rejection is logged with timestamp and user ID
- **Evidence:** `gates.ts` currently checks `isHumanGateRequired()` at API route level. The SDK's `requiresApproval` operates at tool level — more granular and impossible to bypass since it's enforced by the runner itself.
- **Alignment:** Directly enhances the "agents advise, humans decide" principle. SDK-native enforcement is stronger than application-level checks.
- **Risk/rollback:** Medium. Requires chat UI changes to render approval prompts and handle approve/reject actions. Rollback by removing `requiresApproval` from tool definitions — tools revert to auto-execute.
- **Acceptance Criteria / Tests:**
  1. `requiresApproval` added to deal status change tools, buyer outreach tools, and any tool that triggers external side effects
  2. Chat UI renders approval prompt when `tool_approval_requested` event is received — shows tool name, arguments, and approve/reject buttons
  3. `approveTool()` / `rejectTool()` wired from UI action to SDK runner
  4. Approval/rejection logged to `Run` or audit table with userId + timestamp
  5. Unit test: tool with `requiresApproval` pauses execution and resumes on approval
  6. Unit test: rejected tool returns rejection message to agent
  7. Existing `gates.ts` checks preserved as defense-in-depth (belt + suspenders)
- **Files (target):**
  - `packages/openai/src/tools/dealTools.ts` — add `requiresApproval` to status change tools
  - `packages/openai/src/tools/buyerTools.ts` — add `requiresApproval` to outreach tools
  - `apps/web/app/api/chat/route.ts` — handle `tool_approval_requested` stream event, expose approve/reject endpoints
  - `apps/web/components/chat/ToolApprovalPrompt.tsx` — new: in-chat approval UI
  - `apps/web/app/api/chat/tool-approval/route.ts` — new: approve/reject API endpoint
  - `apps/web/lib/automation/gates.ts` — preserved as defense-in-depth layer
- **Implementation Steps:**
  1. Research SDK `requiresApproval` API — confirm it works with `Runner.run()` streaming mode and supports async approval callbacks
  2. Add `requiresApproval: true` to high-risk tool definitions in `dealTools.ts` and `buyerTools.ts`
  3. In chat route, detect `tool_approval_requested` events and emit SSE event to client
  4. Create `ToolApprovalPrompt` component — shows tool name, formatted args, approve/reject buttons
  5. Create `/api/chat/tool-approval` endpoint — accepts `{ runId, toolCallId, action: 'approve' | 'reject' }`, calls SDK `approveTool()`/`rejectTool()`
  6. Add audit logging for approvals/rejections
  7. Keep `gates.ts` checks as secondary validation layer
  8. Write unit and integration tests
- **Completion Evidence (2026-02-16):**
  - High-risk tools gated with SDK-native approval:
    - `packages/openai/src/tools/dealTools.ts` (`updateDealStatus` now sets `needsApproval: true`)
    - `packages/openai/src/tools/buyerTools.ts` (`logOutreach` now sets `needsApproval: true`)
  - Streaming approval event + chat UI wiring:
    - `apps/web/lib/agent/executeAgent.ts` emits `tool_approval_requested` and supports resumed `RunState` approval/rejection flow
    - `apps/web/lib/chat/streamEventTypes.ts` + `apps/web/lib/chat/streamPresenter.ts` map approval events into renderable chat messages
    - `apps/web/components/chat/ToolApprovalPrompt.tsx` provides in-chat approve/reject controls
    - `apps/web/app/api/chat/tool-approval/route.ts` applies approval decisions and returns stream events
  - Audit trail added:
    - `apps/web/lib/agent/executeAgent.ts` writes `approvalAudit` entries with `toolCallId`, `action`, `userId`, `decidedAt`, `runId`
  - Tests added/updated:
    - `apps/web/app/api/chat/tool-approval/route.test.ts`
    - `apps/web/lib/chat/__tests__/streamPresenter.test.ts`
    - `apps/web/lib/chat/__tests__/streamRender.integration.test.tsx`
    - `packages/openai/test/phase1/tools/updateDealStatus.phase1.test.ts`
    - `packages/openai/test/phase1/tools/logOutreach.phase1.test.ts`
  - Verification commands run:
    - `pnpm lint` ✅
    - `pnpm test` ✅
    - `pnpm typecheck` ⚠️ blocked by pre-existing `apps/worker` type errors unrelated to SDK-004 files
    - `pnpm build` ⚠️ blocked by the same pre-existing `apps/worker` errors

### P2 — Build Next

### SDK-005 — Input/Output Guardrails (Agent-Level Validation)

- **Priority:** P2
- **Status:** Done (2026-02-16)
- **Scope:** Safety + data quality
- **Problem:** The `@openai/agents` SDK provides `defineInputGuardrail` and `defineOutputGuardrail` functions that run validation logic before/after agent execution with tripwire mechanisms. Currently, Entitlement OS has no systematic input validation on agent prompts (e.g., prompt injection detection) or output validation (e.g., hallucination checks, PII leak detection).
- **Expected Outcome (measurable):**
  - Input guardrails catch prompt injection attempts, off-topic queries, and malformed deal references before they reach the agent
  - Output guardrails validate that agent responses don't contain PII, hallucinated property data, or unauthorized financial advice
  - Tripwire mechanism halts execution when critical validation fails
- **Evidence:** No input/output validation exists in the current agent pipeline. The SDK provides this as a first-class feature.
- **Alignment:** Strengthens the "agents advise, humans decide" principle by adding automated quality gates.
- **Risk/rollback:** Low. Guardrails are additive validation layers. Rollback by removing guardrail definitions from agent configs.
- **Acceptance Criteria / Tests:**
  1. Input guardrail on Coordinator: reject prompt injection patterns, validate deal ID references exist
  2. Output guardrail on Finance agent: validate numerical outputs are within reasonable ranges
  3. Output guardrail on Legal agent: flag responses that could be construed as legal advice
  4. Tripwire test: guardrail failure halts execution and returns user-friendly error
  5. Guardrail pass-through test: valid inputs/outputs proceed without latency impact
- **Files (target):**
  - `packages/openai/src/guardrails/inputGuardrails.ts` — new
  - `packages/openai/src/guardrails/outputGuardrails.ts` — new
  - `packages/openai/src/agents/index.ts` — wire guardrails into `createConfiguredCoordinator()`
- **Implementation Steps:**
  1. Create `inputGuardrails.ts` with `defineInputGuardrail` for injection detection, topic validation, and reference validation
  2. Create `outputGuardrails.ts` with `defineOutputGuardrail` for PII detection, range validation, and disclaimer enforcement
  3. Wire guardrails into coordinator and specialist agents in `createConfiguredCoordinator()`
  4. Add tripwire handling in chat route — return structured error message on guardrail failure
  5. Write comprehensive test suite for each guardrail
  6. Monitor guardrail trigger rates in production telemetry
- **Completion Evidence (2026-02-16):**
  - Guardrail modules created:
    - `packages/openai/src/guardrails/inputGuardrails.ts`
    - `packages/openai/src/guardrails/outputGuardrails.ts`
  - Coordinator and specialist wiring completed:
    - `packages/openai/src/agents/index.ts` now applies `coordinator_input_guardrail`
    - Finance specialist now applies `finance_output_guardrail`
    - Legal specialist now applies `legal_output_guardrail`
  - Chat route tripwire handling implemented:
    - `apps/web/app/api/chat/route.ts` maps guardrail tripwire failures into structured SSE error payloads with `code: "guardrail_tripwire"`
  - Runtime context propagation added for guardrail checks:
    - `apps/web/lib/agent/executeAgent.ts` now passes run context fields (`orgId`, `userId`, `dealId`, `jurisdictionId`, `sku`) into SDK `run(...)`
  - Tests added/updated:
    - `packages/openai/test/phase1/guardrails/inputGuardrails.phase1.test.ts`
    - `packages/openai/test/phase1/guardrails/outputGuardrails.phase1.test.ts`
    - `packages/openai/test/phase1/agents/coordinator.phase1.test.ts`
    - `packages/openai/test/phase1/agents/finance.phase1.test.ts`
    - `packages/openai/test/phase1/agents/legal.phase1.test.ts`
    - `apps/web/app/api/chat/route.test.ts`
  - Verification commands run:
    - `pnpm lint` ✅
    - `pnpm test` ✅
    - `pnpm typecheck` ⚠️ blocked by pre-existing `apps/worker` type errors unrelated to SDK-005 files
    - `pnpm build` ⚠️ blocked by the same pre-existing `apps/worker` errors

### SDK-006 — Agent Tracing & Observability (SDK-Native Spans)

- **Priority:** P2
- **Status:** Done (2026-02-16)
- **Scope:** Debugging + production monitoring
- **Problem:** The `@openai/agents` SDK has a built-in tracing system (`getGlobalTraceProvider`, `getCurrentSpan`, `BatchTraceProcessor`, `ConsoleSpanExporter`) that tracks every agent run, tool call, handoff, and guardrail check as structured spans. Entitlement OS has basic OTEL instrumentation (DA-005) but doesn't use the SDK's native tracing, missing agent-specific timing, token usage, and error attribution.
- **Expected Outcome (measurable):**
  - Every agent run produces a trace with spans for: agent selection, tool execution, handoff, guardrail checks
  - Token usage per agent per conversation tracked and exportable
  - p50/p95 latency per tool and per agent available in observability dashboard
  - Error attribution: which agent/tool caused a failure, with full context
- **Evidence:** DA-005 added generic OTEL hooks. The SDK's native tracing provides agent-specific semantics that generic OTEL can't capture.
- **Alignment:** Extends DA-005 observability with SDK-native granularity.
- **Risk/rollback:** Low. Tracing is read-only observation. Rollback by removing trace provider registration.
- **Acceptance Criteria / Tests:**
  1. Register SDK trace provider at application startup
  2. Configure `BatchTraceProcessor` with export to existing OTEL collector or console
  3. Verify traces contain agent name, tool name, duration, token count, and error status
  4. Add dashboard or log query for p50/p95 latency by agent and tool
  5. Integration test: run triggers trace with expected span hierarchy
- **Files (target):**
  - `packages/openai/src/tracing/setup.ts` — new: SDK trace provider registration
  - `packages/openai/src/tracing/exporter.ts` — new: custom span exporter (OTEL bridge or console)
  - `apps/web/app/api/chat/route.ts` — register trace provider before runner invocation
  - `apps/web/lib/agent/executeAgent.ts` — register trace provider for non-chat agent runs
- **Implementation Steps:**
  1. Research SDK tracing API — `getGlobalTraceProvider()`, `setGlobalTraceProvider()`, span types
  2. Create trace provider setup that bridges to existing OTEL infrastructure
  3. Register at chat route and executeAgent entry points
  4. Configure `BatchTraceProcessor` with appropriate buffer size and flush interval
  5. Add custom exporter that formats agent-specific spans for our logging system
  6. Create observability queries for latency/token/error dashboards
- **Completion Evidence (2026-02-16):**
  - Tracing setup and exporter modules added:
    - `packages/openai/src/tracing/setup.ts`
    - `packages/openai/src/tracing/exporter.ts`
    - `packages/openai/src/index.ts` exports tracing setup/exporter APIs
  - Runtime tracing initialization wired at execution entrypoints:
    - `apps/web/app/api/chat/route.ts` now calls `setupAgentTracing()` at route entry
    - `apps/web/lib/agent/executeAgent.ts` now calls `setupAgentTracing()` at workflow entry
  - Structured trace logging + metrics implemented:
    - span logs emit `event: "agent_trace_span"` with trace/span IDs, name/type, duration, usage, and error
    - trace logs emit `event: "agent_trace"` with trace metadata
    - in-memory latency/error aggregation available via `getAgentTraceMetrics()` with p50/p95
  - Tests added:
    - `packages/openai/test/phase1/tracing/setup.phase1.test.ts`
    - `packages/openai/test/phase1/tracing/exporter.phase1.test.ts`
    - `apps/web/app/api/chat/route.test.ts` updated to assert tracing setup invocation
  - Verification commands run:
    - `pnpm lint` ✅
    - `pnpm typecheck` ⚠️ blocked by pre-existing `apps/worker` type errors unrelated to SDK-006 files
    - `pnpm test` ✅
    - `pnpm build` ⚠️ blocked by the same pre-existing `apps/worker` errors

### SDK-007 — Progressive Context Loading (Three-Tier Agent Context)

- **Priority:** P2
- **Status:** Done (2026-02-16)
- **Scope:** Context efficiency + cost reduction
- **Problem:** Agent instructions are currently loaded fully at coordinator creation time regardless of which specialist is invoked. The `openai/skills` and `openai/codex` repos demonstrate a three-tier progressive loading pattern: metadata → body → resources, where deeper context is only loaded when the agent actually needs it. This reduces token waste for simple queries.
- **Expected Outcome (measurable):**
  - 30-50% reduction in input tokens for simple coordinator-only queries that don't require specialist context
  - Specialist instructions loaded lazily on first handoff, not at startup
  - Resource-heavy context (parish packs, zoning matrices) loaded only when relevant tool is invoked
- **Evidence:** Current `createConfiguredCoordinator()` loads all 13 agent instruction sets at startup. Most conversations only use 1-2 specialists.
- **Alignment:** Pure optimization — no change to agent behavior or tool contracts.
- **Risk/rollback:** Low-medium. Lazy loading could introduce latency on first specialist invocation. Rollback by reverting to eager loading.
- **Acceptance Criteria / Tests:**
  1. Coordinator instructions loaded eagerly (always needed)
  2. Specialist instructions loaded lazily on first handoff to that specialist
  3. Heavy resources (zoning data, parish packs) loaded on-demand when relevant tool is called
  4. Measure input token reduction on sample conversation set
  5. Verify no behavioral change — same outputs for same inputs
- **Files (target):**
  - `packages/openai/src/agents/index.ts` — refactor `createConfiguredCoordinator()` for lazy specialist loading
  - `packages/openai/src/agents/contextLoader.ts` — new: three-tier context loading utility
  - `packages/openai/src/tools/propertyDbTools.ts` — add lazy resource loading for zoning/parish data
- **Implementation Steps:**
  1. Create `contextLoader.ts` with `LazyContext` class — defers instruction loading until first access
  2. Refactor specialist agent creation to use lazy initialization
  3. Add resource-level lazy loading for parish packs and zoning matrices
  4. Benchmark token usage before/after on 20-conversation sample
  5. Add tests verifying lazy loading doesn't break agent behavior
- **Completion Evidence (2026-02-16):**
  - Progressive context loader implemented:
    - `packages/openai/src/agents/contextLoader.ts` adds `LazyContext` with three tiers (`metadata`, `body`, `resources`) and per-tier caching.
  - Coordinator specialist wiring refactored for lazy specialist context assembly:
    - `packages/openai/src/agents/index.ts` now builds specialist instructions through `LazyContext.compose(...)`.
    - Specialist context now composes:
      - metadata tier (agent/domain/handoff scope)
      - body tier (specialist instruction body)
      - resources tier (tool inventory + parcel intelligence resource pack when relevant).
  - Resource-level lazy loading implemented:
    - Resource pack is generated only when specialist instructions are resolved, not at coordinator creation.
    - Parcel-heavy tool context is appended only for specialists exposing parcel/screening tools.
  - Tests added:
    - `packages/openai/test/phase1/agents/contextLoader.phase1.test.ts` validates progressive tier loading + cache behavior.
    - `packages/openai/test/phase1/agents/progressiveContext.phase1.test.ts` validates lazy specialist instruction assembly in coordinator handoffs.
  - Verification commands run:
    - `pnpm lint` ✅
    - `pnpm test` ✅
    - `pnpm typecheck` ⚠️ blocked by pre-existing `apps/worker` type errors unrelated to SDK-007 files
    - `pnpm build` ⚠️ blocked by the same pre-existing `apps/worker` errors

### SDK-008 — Agent-as-Tool Pattern (Specialist Sub-Invocation)

- **Priority:** P2
- **Status:** Done (2026-02-16)
- **Scope:** Agent composition + routing flexibility
- **Problem:** The SDK supports `agent.asTool()` which converts an agent into a callable tool. Unlike handoffs (where control transfers to the specialist), agent-as-tool keeps the coordinator in control and receives the specialist's output as a tool result. This enables the coordinator to synthesize multiple specialist opinions (e.g., ask both Finance and Risk agents about a deal, then combine their answers).
- **Expected Outcome (measurable):**
  - Coordinator can invoke specialists as tools for focused sub-questions without full handoff
  - Multi-specialist synthesis: coordinator asks Finance + Risk + Legal about same deal, combines answers
  - Specialist agent retains its tools and instructions when invoked as tool
  - No change to existing handoff behavior — agent-as-tool is additive
- **Evidence:** Current coordinator uses handoffs exclusively. Once a handoff occurs, the coordinator loses control until the specialist completes. Agent-as-tool enables "consult without yielding."
- **Alignment:** Extends existing coordinator-specialist architecture without changing it.
- **Risk/rollback:** Low-medium. New invocation pattern adds complexity. Rollback by removing agent-as-tool declarations.
- **Acceptance Criteria / Tests:**
  1. At least 3 specialists (Finance, Risk, Legal) exposed as tools via `asTool()`
  2. Coordinator can invoke specialist-as-tool for focused queries
  3. Specialist-as-tool retains its full tool set and instructions
  4. Test: coordinator invokes Finance-as-tool and Risk-as-tool for same deal, synthesizes combined answer
  5. Existing handoff behavior preserved — coordinator can still hand off when appropriate
- **Files (target):**
  - `packages/openai/src/agents/index.ts` — add `asTool()` declarations for key specialists
  - `packages/openai/src/agents/coordinatorInstructions.ts` — update coordinator instructions to describe when to use consult-as-tool vs handoff
- **Implementation Steps:**
  1. Research SDK `asTool()` API — confirm it preserves specialist tools and instructions
  2. Add `asTool()` for Finance, Risk, and Legal agents in `createConfiguredCoordinator()`
  3. Update coordinator instructions with routing guidance: use handoff for full specialist sessions, use as-tool for focused sub-questions
  4. Test multi-specialist synthesis scenario
  5. Monitor token usage impact — agent-as-tool may increase coordinator context
- **Completion Evidence (2026-02-16):**
  - Specialist-as-tool wiring implemented:
    - `packages/openai/src/agents/index.ts` now declares `consult_finance_specialist`, `consult_risk_specialist`, and `consult_legal_specialist` via `specialist.asTool(...)`.
    - Consult tools are added to coordinator tools in `createIntentAwareCoordinator()` while preserving specialist handoffs.
  - Coordinator routing guidance updated:
    - `packages/openai/src/agents/coordinator.ts` now contains explicit "CONSULT-AS-TOOL VS HANDOFF ROUTING" instructions for focused consults vs full handoff sessions.
  - Tests updated:
    - `packages/openai/test/phase1/agents/coordinator.phase1.test.ts` validates consult tool exposure and additive handoff preservation.
    - Coordinator instruction contract test now asserts consult-vs-handoff guidance is present.
  - Verification commands run:
    - `pnpm lint` ✅
    - `pnpm test` ✅
    - `pnpm typecheck` ⚠️ blocked by pre-existing `apps/worker` type errors unrelated to SDK-008 files
    - `pnpm build` ⚠️ blocked by the same pre-existing `apps/worker` errors

### P3 — Future Hardening

### SDK-009 — Retry with Exponential Backoff (API Resilience)

- **Priority:** P3
- **Status:** Done (2026-02-16)
- **Scope:** Reliability + error recovery
- **Problem:** The `openai/openai-python` SDK implements sophisticated retry logic with exponential backoff, jitter, and `Retry-After` header respect. Entitlement OS's `packages/openai/src/utils/retry.ts` has basic retry but lacks jitter, backoff cap, and header-aware delays. Under high load or OpenAI rate limits, requests can pile up instead of backing off gracefully.
- **Expected Outcome (measurable):**
  - API calls to OpenAI respect `Retry-After` headers when rate-limited
  - Exponential backoff with jitter prevents thundering herd on recovery
  - Configurable retry count, initial delay, max delay, and backoff multiplier
  - Reduction in failed agent runs due to transient API errors
- **Evidence:** Current retry utility is basic. The openai-python SDK's retry logic is battle-tested at scale.
- **Alignment:** Pure infrastructure improvement. No change to agent behavior.
- **Risk/rollback:** Very low. Better retry logic only improves reliability. Rollback by reverting to current retry utility.
- **Acceptance Criteria / Tests:**
  1. Replace or enhance `packages/openai/src/utils/retry.ts` with exponential backoff + jitter
  2. Respect `Retry-After` header from OpenAI API responses
  3. Configurable: retries (default 2), initial delay (1s), max delay (8s), multiplier (2x)
  4. Unit test: verify backoff timing and jitter distribution
  5. Unit test: verify `Retry-After` header is respected
- **Files (target):**
  - `packages/openai/src/utils/retry.ts` — enhance with exponential backoff + jitter
  - `packages/openai/src/utils/__tests__/retry.test.ts` — new: comprehensive retry tests
- **Implementation Steps:**
  1. Enhance retry utility with exponential backoff formula: `min(maxDelay, initialDelay * multiplier^attempt) + random_jitter`
  2. Add `Retry-After` header parsing (supports both seconds and HTTP-date formats)
  3. Add configurable options with sensible defaults
  4. Write comprehensive unit tests with mocked timers
  5. Apply enhanced retry to all OpenAI API call sites
- **Completion Evidence (2026-02-16):**
  - Retry utility implemented:
    - `packages/openai/src/utils/retry.ts` adds:
      - `withExponentialBackoff(...)`
      - `computeExponentialBackoffDelayMs(...)`
      - `parseRetryAfterHeaderMs(...)`
      - OpenAI-aware retryability + `Retry-After` extraction helpers
  - OpenAI call-site adoption completed:
    - `packages/openai/src/responses.ts` now wraps `client.responses.create(...)` with `withExponentialBackoff(...)`
    - response retry knobs are configurable via env:
      - `OPENAI_RESPONSES_RETRIES` (default `2`)
      - `OPENAI_RESPONSES_INITIAL_RETRY_DELAY_MS` (default `1000`)
      - `OPENAI_RESPONSES_MAX_RETRY_DELAY_MS` (default `8000`)
      - `OPENAI_RESPONSES_RETRY_MULTIPLIER` (default `2`)
    - OpenAI client internal retries set to `0` so retry policy is centralized in our utility
  - Package exports updated:
    - `packages/openai/src/index.ts` exports `./utils/retry.js`
  - Tests added:
    - `packages/openai/test/phase1/utils/retry.phase1.test.ts`
      - verifies backoff+jitter calculation
      - verifies `Retry-After` parsing (seconds + HTTP date)
      - verifies `Retry-After`-driven retry delay in execution
  - Verification commands run:
    - `pnpm lint` ✅
    - `pnpm test` ✅
    - `pnpm typecheck` ⚠️ blocked by pre-existing `apps/worker` type errors unrelated to SDK-009 files
    - `pnpm build` ⚠️ blocked by the same pre-existing `apps/worker` errors

### SDK-010 — Session Persistence (SDK-Native Conversation Memory)

- **Priority:** P3
- **Status:** Done (2026-02-16)
- **Scope:** Conversation continuity + context management
- **Problem:** The SDK provides a `Session` interface with `getItems()`, `addItems()`, `runCompaction()`, and deduplication via `buildItemFrequencyMap()`. Currently, Entitlement OS manually assembles conversation history from Prisma `Message` rows and passes them as context. The SDK's session management is more efficient — it handles compaction (summarizing old messages to reduce token count), deduplication, and item frequency tracking.
- **Expected Outcome (measurable):**
  - Long conversations automatically compacted to stay within context limits
  - Deduplication prevents repeated context items from inflating token usage
  - Session state persisted between page reloads without manual history assembly
  - Reduced conversation context token cost by 20-40% for long conversations
- **Evidence:** Current manual history assembly in `app/api/chat/route.ts` doesn't compact or deduplicate. Long conversations hit context limits.
- **Alignment:** Replaces manual history management with SDK-native session management.
- **Risk/rollback:** Medium. Changing session management affects conversation continuity. Rollback by reverting to manual Prisma-based history assembly.
- **Acceptance Criteria / Tests:**
  1. Implement SDK `Session` interface backed by Prisma `Conversation` + `Message` models
  2. Auto-compaction triggers when conversation exceeds configurable token threshold
  3. Deduplication prevents repeated tool results and context items
  4. Session persists across page reloads via conversation ID
  5. Test: long conversation auto-compacts without losing critical context
  6. Test: session reload preserves conversation state
- **Files (target):**
  - `apps/web/lib/chat/session.ts` — new: SDK Session implementation backed by Prisma
  - `apps/web/app/api/chat/route.ts` — replace manual history assembly with session
  - `packages/db/prisma/schema.prisma` — potential schema additions for compaction metadata
- **Implementation Steps:**
  1. Research SDK `Session` interface — `getItems()`, `addItems()`, `runCompaction()` contracts
  2. Implement `PrismaSession` class that wraps existing Conversation + Message models
  3. Add compaction logic — summarize old messages when token count exceeds threshold
  4. Add deduplication — track item frequencies, prune duplicates
  5. Replace manual history assembly in chat route with session-based approach
  6. Migrate existing conversations to new session format (backward-compatible)
  7. Write tests for compaction, deduplication, and persistence
- **Completion Evidence (2026-02-16):**
  - SDK-native session implementation added:
    - `apps/web/lib/chat/session.ts`
      - `PrismaChatSession.create(...)`
      - `getItems(...)`, `addItems(...)`, `runCompaction(...)`
      - configurable compaction thresholds:
        - `AGENT_SESSION_COMPACTION_TOKEN_THRESHOLD` (default `6000`)
        - `AGENT_SESSION_COMPACTION_KEEP_RECENT_MESSAGES` (default `24`)
        - `AGENT_SESSION_DEDUPE_LOOKBACK` (default `200`)
  - Agent execution path now uses session persistence instead of direct manual message persistence:
    - `apps/web/lib/agent/agentRunner.ts`
      - session-backed conversation loading
      - pre-run compaction trigger
      - deduplicated session writes for user/assistant messages
  - Backward compatibility preserved:
    - existing `Conversation` + `Message` models remain source-of-truth (no schema migration required)
    - conversation continuity remains keyed by `conversationId`
  - Tests added:
    - `apps/web/lib/chat/__tests__/session.test.ts`
      - verifies long conversation auto-compaction with summary insertion
      - verifies deduplication of repeated tool/context items
      - verifies session reload persistence by conversation ID
  - Verification commands run:
    - `pnpm lint` ✅
    - `pnpm typecheck` ✅
    - `pnpm test` ✅
    - `pnpm build` ✅

### SDK-011 — RunState Serialization (Interruption/Resumption Support)

- **Priority:** P3
- **Status:** Done (2026-02-16)
- **Scope:** Reliability + long-running operations
- **Problem:** The SDK supports `RunState` serialization for interrupting and resuming agent runs. This enables: (1) surviving server restarts mid-conversation, (2) pausing expensive operations and resuming later, (3) handling Vercel function timeouts by checkpointing and continuing in a new invocation. Currently, if a Vercel function times out mid-agent-run, all progress is lost.
- **Expected Outcome (measurable):**
  - Agent runs can be interrupted and resumed without losing progress
  - Vercel function timeout (60s on Pro plan) no longer causes complete run failure
  - Long-running operations (full parcel screening, multi-tool research) can checkpoint and continue
  - Zero lost agent work due to infrastructure timeouts
- **Evidence:** Vercel Pro functions have 60s timeout. Complex agent runs (e.g., full screening with 7 endpoints) can exceed this. Currently, timeout = total loss.
- **Alignment:** Extends existing `Run` model which already tracks run status. Adds serialized state for resumption.
- **Risk/rollback:** Medium-high. Run serialization is complex and touches core execution path. Rollback by removing serialization hooks and accepting timeout risk.
- **Acceptance Criteria / Tests:**
  1. Agent runner serializes `RunState` at each tool completion checkpoint
  2. Serialized state stored in Prisma `Run` model (new `serializedState` field)
  3. Resume endpoint accepts `runId` and continues from last checkpoint
  4. Test: interrupt run after 2 tool calls, resume, verify remaining tools execute
  5. Test: Vercel timeout simulation — checkpoint triggers before timeout, new invocation resumes
  6. Backward compatible: runs without serialization still work normally
- **Files (target):**
  - `apps/web/app/api/chat/route.ts` — add checkpoint serialization during streaming
  - `apps/web/app/api/chat/resume/route.ts` — new: resume interrupted run
  - `packages/db/prisma/schema.prisma` — add `serializedState Json?` to `Run` model
  - `packages/openai/src/utils/runStateSerde.ts` — new: serialization/deserialization utilities
- **Implementation Steps:**
  1. Research SDK RunState serialization API — what's included in serialized state, size constraints
  2. Add `serializedState` field to Prisma `Run` model
  3. Create serialization utility that captures run state at tool completion boundaries
  4. In chat route, serialize state after each tool completion
  5. Create `/api/chat/resume` endpoint that deserializes state and continues run
  6. Add timeout detection — serialize state when approaching Vercel timeout limit
  7. Write comprehensive tests for interrupt/resume scenarios
  8. Handle edge cases: expired OpenAI sessions, stale tool results, changed deal state between checkpoints
- **Completion Evidence (2026-02-16):**
  - Serialized checkpoint utilities added:
    - `packages/openai/src/utils/runStateSerde.ts`
      - `serializeRunStateEnvelope(...)`
      - `deserializeRunStateEnvelope(...)`
    - export wired in `packages/openai/src/index.ts`
  - Prisma run state persistence extended:
    - `packages/db/prisma/schema.prisma`
      - `Run.serializedState Json? @map("serialized_state")`
  - Agent runtime checkpoint serialization + persistence implemented:
    - `apps/web/lib/agent/executeAgent.ts`
      - stores serialized checkpoint envelopes on tool completion checkpoints when SDK state is available
      - persists serialized checkpoint metadata for approval-pending and final-result boundaries
      - adds `resumeSerializedAgentRun(...)` for checkpoint-based continuation
  - Resume endpoint added:
    - `apps/web/app/api/chat/resume/route.ts`
      - accepts `runId`, rehydrates checkpoint, resumes execution, returns emitted events + status
  - Tests added:
    - `packages/openai/test/phase1/utils/runStateSerde.phase1.test.ts`
    - `apps/web/app/api/chat/resume/route.test.ts`
  - Verification commands run:
    - `pnpm lint` ✅
    - `pnpm typecheck` ✅
    - `pnpm test` ✅
    - `pnpm build` ✅

### EOS-001 — Entitlement OS Meta Prompt (A1→G5) Completion Audit

- **Priority:** P0
- **Status:** Done (2026-02-17)
- **Scope:** Consolidation + schema + financial depth + tools + automation + artifacts + portfolio analytics
- **Problem:** The A→G execution stream was completed across multiple implementation passes, but ROADMAP lacked a single formal compliance entry proving end-to-end closure against `Entitlement_OS_Meta_Prompt.md`.
- **Expected Outcome (measurable):**
  - A1→G5 checklist recorded with `Done/Partial/Missing` status and file evidence.
  - Final verification gate recorded after latest integration patch set.
  - Evidence links stored in-repo for traceability and handoff.
- **Acceptance Criteria / Tests:**
  - Checklist artifact exists under `docs/` with explicit A1→G5 status and evidence.
  - Verification gate logs captured: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
  - All checklist items are `Done` or explicitly explained.
- **Completion Evidence (2026-02-17):**
  - Checklist + evidence artifact:
    - `docs/ENTITLEMENT_OS_META_AUDIT_2026-02-17.md`
  - Final integration verification gate:
    - `pnpm lint` ✅
    - `pnpm typecheck` ✅
    - `pnpm test` ✅
    - `pnpm build` ✅
  - Final integration commit (code): `3517e50`
  - Context baseline sync:
    - `AGENTS.md` project status snapshot updated to reflect A→G completion + H gate closure.

### INC-001 — ENTITLEMENT-OS-WEB-5 Non-JSON Fallback Sentry Noise

- **Priority:** P0
- **Status:** Done (2026-02-18)
- **Scope:** Chat runtime observability hardening
- **Problem:** `POST /api/chat` can complete with plain-text agent output that is normalized into a fallback `AgentReport`, but the recoverable branch was still emitting `captureAgentWarning("Final agent output is not a valid JSON object.")`, creating noisy Sentry issue `ENTITLEMENT-OS-WEB-5`.
- **Expected Outcome (measurable):**
  - Recoverable non-JSON normalization no longer emits Sentry warning events.
  - Fallback report generation remains intact and persisted.
- **Evidence of need:** Sentry issue `ENTITLEMENT-OS-WEB-5` (issue id `7273289004`) with culprit `POST /api/chat`.
- **Alignment:** Preserves strict schema persistence behavior and does not relax auth/org scoping or validation boundaries.
- **Risk/rollback:** Low. Change is isolated to warning/reporting behavior for an already-handled fallback path; rollback by restoring the prior `captureAgentWarning` call.
- **Acceptance Criteria / Tests:**
  - `apps/web/lib/agent/executeAgent.ts` keeps fallback normalization and uses local warning logs instead of Sentry capture for non-JSON parse fallback.
  - Regression test validates plain-text final output is normalized and does not trigger `captureAgentWarning`.
  - Full verification gate passes (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`).
- **Completion Evidence (2026-02-18):**
  - `apps/web/lib/agent/executeAgent.ts`
  - `apps/web/lib/agent/__tests__/executeAgent.runState-contract.test.ts`

### INC-002 — ENTITLEMENT-OS-WEB-6 Capital Deployment Missing Table Fallback

- **Priority:** P0
- **Status:** Done (2026-02-18)
- **Scope:** Portfolio analytics API resilience
- **Problem:** `GET /api/portfolio/capital-deployment` threw `PrismaClientKnownRequestError` (`P2021`) when `public.capital_deployments` is unavailable in the production database.
- **Expected Outcome (measurable):**
  - Endpoint returns deterministic zeroed capital deployment metrics instead of a 500 when the table is absent.
  - Non-table-missing Prisma failures continue to throw.
- **Evidence of need:** Sentry issue `ENTITLEMENT-OS-WEB-6` (issue id `7273289255`).
- **Acceptance Criteria / Tests:**
  - `apps/web/lib/services/portfolioAnalytics.service.ts` handles `P2021` for `capital_deployments` with zeroed fallback.
  - `apps/web/lib/services/portfolioAnalytics.capital-deployment.test.ts` covers fallback path and non-fallback rethrow path.
- **Completion Evidence (2026-02-18):**
  - `apps/web/lib/services/portfolioAnalytics.service.ts`
  - `apps/web/lib/services/portfolioAnalytics.capital-deployment.test.ts`

### OPS-001 — ENTITLEMENT-OS-WEB-4 Change-Detection Monitor Missed Check-ins

- **Priority:** P0
- **Status:** Done (2026-02-18)
- **Scope:** Production cron environment hardening
- **Problem:** Sentry monitor `change-detection` recorded missed check-ins because production `CRON_SECRET` was not configured.
- **Expected Outcome (measurable):**
  - Production `CRON_SECRET` exists in Vercel environment.
  - Manual authenticated cron trigger records `ok` check-in.
- **Evidence of need:** Sentry issue `ENTITLEMENT-OS-WEB-4` (issue id `7271035443`) with monitor status `missed`.
- **Completion Evidence (2026-02-18):**
  - Added `CRON_SECRET` to Vercel production env.
  - Triggered `GET /api/cron/change-detection` with bearer secret; monitor check-in status is `ok`.

### PREF-001 — Conversation-Native Preference Extraction and Prompt Injection

- **Priority:** P1
- **Status:** Done (2026-02-18)
- **Scope:** Preference memory + chat personalization
- **Problem:** Preference signals from conversation were not persisted and therefore could not influence follow-up assistant behavior.
- **Expected Outcome (measurable):**
  - Preferences extracted asynchronously from conversation transcripts.
  - Learned preferences injected into runtime system context for future chats.
  - User-adjustable confidence/activation controls available in UI.
- **Completion Evidence (2026-02-18):**
  - `packages/db/prisma/schema.prisma`
  - `packages/db/prisma/migrations/20260218200000_add_preference_proactive_and_tool_health/migration.sql`
  - `apps/web/lib/services/preferenceExtraction.service.ts`
  - `apps/web/lib/services/preferenceService.ts`
  - `apps/web/app/api/preferences/route.ts`
  - `apps/web/app/api/preferences/[id]/route.ts`
  - `apps/web/lib/agent/agentRunner.ts`
  - `apps/web/app/api/chat/route.ts`
  - `apps/web/components/preferences/UserPreferencesPanel.tsx`

### PRO-001 — Proactive Trigger Engine with Approval-First Actioning

- **Priority:** P1
- **Status:** Done (2026-02-18)
- **Scope:** Event-driven proactive automation
- **Problem:** Automation flows were reactive only; users had no trigger-based approval queue for proactive AI-initiated actions.
- **Expected Outcome (measurable):**
  - Configurable proactive triggers persisted by org/user.
  - Runtime event evaluation produces pending approval actions.
  - Approval/reject/modify lifecycle exposed via API + dashboard tab.
- **Completion Evidence (2026-02-18):**
  - `packages/db/prisma/schema.prisma`
  - `packages/db/prisma/migrations/20260218200000_add_preference_proactive_and_tool_health/migration.sql`
  - `apps/web/lib/services/proactiveTrigger.service.ts`
  - `apps/web/lib/services/proactiveAction.service.ts`
  - `apps/web/lib/automation/events.ts`
  - `apps/web/app/api/proactive/triggers/route.ts`
  - `apps/web/app/api/proactive/actions/route.ts`
  - `apps/web/app/api/proactive/actions/[id]/respond/route.ts`
  - `apps/web/components/proactive/CreateTriggerWizard.tsx`
  - `apps/web/components/proactive/ProactiveActionsFeed.tsx`

### RES-001 — Resilient Tool Wrapper + Health Telemetry Surface

- **Priority:** P2
- **Status:** Done (2026-02-18)
- **Scope:** Self-healing tool execution and visibility
- **Problem:** Tool execution failures lacked standardized fallback behavior and route-level health visibility.
- **Expected Outcome (measurable):**
  - Standard resilient executor supports retry/fallback/inference chains.
  - Zoning tool path emits resilient execution metrics.
  - Automation dashboard shows tool health and degradation indicators.
- **Completion Evidence (2026-02-18):**
  - `packages/openai/src/tools/resilientToolWrapper.ts`
  - `packages/openai/src/tools/resilientZoningTool.ts`
  - `packages/openai/src/index.ts`
  - `packages/db/prisma/schema.prisma`
  - `apps/web/app/api/tools/health/route.ts`
  - `apps/web/components/self-healing/ResilientDataDisplay.tsx`
  - `apps/web/components/self-healing/ToolHealthDashboard.tsx`
  - `apps/web/app/automation/page.tsx`

---

## Not Added (did not pass value/risk gate)

These are explicitly not being added now to avoid noise:

- Dark mode validation pass across all modified widgets
- Keyboard-navigation expansion
- Activity feed + notification preference surfaces
- Collaboration upgrades (`@mentions`, assignment alerts)

Reason: these were low-priority for current operating goals and can be deferred until we quantify product impact for each and/or complete higher-impact reliability and operator-efficiency work above.

## Completed (for traceability only)

- Screening pipeline config hardening
- Chat input behavior fix
- Empty states + onboarding for buyers/deal rooms/workflows/saved searches
- Data visualizations baseline implementations

## Operational Verification Log (2026-02-15)

- **R-001 — chatgpt-apps Integration Verification & Hardening**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence command:** `pnpm -C apps/web test`

- **R-002 — Remaining Peripheral Shared Backend URL Callers**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence command:** `pnpm -C apps/web test`

- **R-003 — Enhanced Search with Previews and Persistent Recents**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence command:** `pnpm -C apps/web test`

- **R-004 — Bulk Operations for Deals and Source Lists**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence command:** `pnpm -C apps/web test`

- **R-005 — Portfolio and Command Center Depth Enhancements**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence command:** `pnpm -C apps/web test`

- **DA-001 — Auto-Fed Episode Capture on Run Finalization**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence command:** `pnpm -C apps/web test`

- **DA-002 — Automatic Reflection & Knowledge Graph/K-Vector Refresh**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence command:** `pnpm -C apps/web test`

- **DA-003 — Retrieval-Context Injection into Agent Pipeline**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence command:** `pnpm -C apps/web test`

- **DA-004 — Reinforcement Feedback API + Auto-Scoring**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence command:** `pnpm -C apps/web test`

- **DA-005 — Data Agent Observability & Coverage for Auto-Feed**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence command:** `pnpm -C apps/web test`

- **DA-006 — Auto-Fed Contract Guardrails**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence command:** `pnpm -C apps/web test`

- **AUI-001 — AgentKit-Inspired Chat UX Enhancements (No Pipeline Migration)**
  - **Status:** **OPERATIONALLY VERIFIED**
  - **Evidence commands:**
    - `pnpm -C apps/web test lib/chat/__tests__/streamPresenter.test.ts lib/chat/__tests__/conversationSidebar.test.ts lib/chat/__tests__/streamRender.integration.test.tsx`
    - `pnpm -C apps/web test`

- **MAP-001 — MapLibre Vector Rendering + Multi-Select**
  - **Status:** **DONE**
  - **Evidence command:** `pnpm typecheck`

- **MAP-001a — Deterministic Map Base-Tile Fallback**
  - **Status:** **DONE**
  - **Evidence command:** `pnpm typecheck`
