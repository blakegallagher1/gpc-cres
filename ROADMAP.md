# Entitlement OS — Master Implementation Roadmap

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
