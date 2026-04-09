# Entitlement OS — Master Implementation Roadmap

Last reviewed: 2026-03-14


## Governance

This is the single source of truth for planned implementation work.

- Every planning item in this file is expected to pass a value-first pre-add analysis.
- Implementation work should only be started from items in `Planned`/`In Progress`.
- Each row includes measurable outcome, validation, and acceptance criteria.
- Historical progress snapshots such as `docs/IMPLEMENTATION_PROGRESS_BOARD.md` are archival only and must not be treated as active work queues.
- Backend boundary extraction is complete as of 2026-04-09: `apps/web` is now the thin delivery layer over package-owned backend services.
- `docs/plans/INDEX.md` is the canonical registry for plan/design documents under `docs/plans/`; any untracked historical plan there must not be treated as active roadmap work until reconciled here.
- The remaining app-owned seams are intentional and should not be reopened as migration backlog:
  - auth/session resolution in `apps/web`
  - the web-hosted agent runtime coordinator in `apps/web/lib/agent/executeAgent.ts`
  - tool execution dispatch ownership in `apps/web/app/api/agent/tools/execute/route.ts`

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

**Archive rule:** When an item reaches `Done`, move it from Active Roadmap into the [Completed](#completed) section at the bottom. Active Roadmap stays short and focused on work-in-progress only.

## Active Roadmap (Prioritized)

### OPS-RISK-001 — Production Gap Registry And Runbook Closure (P0)

- **Priority:** P0
- **Status:** In Progress
- **Scope:** Close the repo-side test/observability/documentation gaps around admin-route deployment, screening failures, CUA worker recovery, D1 sync diagnosis, and auth-chain diagnostics while preserving the current Windows PC database topology.
- **Problem:** Production dependencies and known failure modes were documented across `CLAUDE.md`, deployment notes, and historical plans, but lacked a single current runbook set and a current plan index. Some gap reports were also stale, causing audit noise and making it harder to distinguish real open risks from already-closed repo work.
- **Expected Outcome (measurable):**
  - Tool execution route emits Sentry evidence for tool-catalog/transport-policy misconfiguration branches.
  - CUA worker has direct unit coverage for the server contract and browser-session lifecycle, not only the responses loop.
  - Operators have current runbooks for screening incidents, CUA recovery, admin-route deployment, D1 sync failure, and auth-chain diagnostics.
  - `docs/plans/INDEX.md` explicitly tracks which plan docs are done, in progress, or untracked historical references.
- **Evidence of need:** Current audit found real production gaps (admin routes not deployed, screening endpoints failing in production, Docker Desktop SPOF, Hyperdrive dependency) mixed with stale claims (`browser_task` wiring missing, no CUA tests, no roadmap file). This required explicit repo-side reconciliation.
- **Alignment:** Does not change the current Windows-server database usage model. Focus is on visibility, test coverage, and documented operator response.
- **Risk/rollback:** Low. Code changes are narrow (Sentry/reporting and testability only). Docs are additive and can be reverted independently.
- **Acceptance Criteria / Tests:**
  - `apps/web/app/api/agent/tools/execute/route.ts` reports catalog/transport config failures to Sentry.
  - `infra/cua-worker/tests/server.test.ts` and `infra/cua-worker/tests/browser-session.test.ts` exist and pass.
  - New runbooks exist under `docs/runbooks/` for the five named operational areas.
  - `docs/plans/INDEX.md` exists and explicitly flags untracked historical plans.
  - Verification: `pnpm typecheck` plus focused tests for the touched route and CUA worker tests.

### MAP-INTEL-001 — Map Parcel Truth Overlay (P1)

- **Priority:** P1
- **Status:** In Progress
- **Scope:** Surface chat-stored parcel knowledge (sale price, buyer, cap rate, etc.) on the map's ParcelDetailCard so operators see saved intel when clicking a parcel.
- **Problem:** Chat `store_memory` writes verified facts to MemoryVerified and ingests to Qdrant KB, but ParcelDetailCard only shows gateway/tile fields (owner, zoning, acreage). Operators never see chat-saved economics on the map — the two surfaces are disconnected.
- **Expected Outcome (measurable):**
  - Clicking a parcel with stored intel shows a "Saved Intel" section with comp.* fields (sale price, date, buyer, seller, cap rate, NOI, $/acre).
  - Parcels without stored intel show no extra section (no visual noise).
  - After chat `store_memory`, map updates within seconds via CustomEvent + SWR revalidation.
- **Evidence of need:** Entity lookup API and TruthView service exist and return structured comp data, but no UI path connects them to the map surface. Operators must switch to chat or command center to see what the agent learned.
- **Alignment:** Uses existing `GET /api/entities/lookup` (read-only, org-scoped), existing TruthView resolution, and SWR (already used in 40+ components). No new API routes. No schema changes.
- **Risk/rollback:** Low; additive UI-only changes to ParcelDetailCard + new hook + 3-line CustomEvent dispatch in ChatContainer. Rollback = remove hook + section.
- **Acceptance Criteria / Tests:**
  - `useParcelTruth` hook: SWR-based, dual-path lookup (propertyDbId → parcelId → address fallback), listens for `gpc:memory-updated` CustomEvent.
  - ParcelDetailCard: "Saved Intel" section renders comp.* values with conflict/correction badges. Hidden when no entity or no values.
  - ChatContainer: dispatches `gpc:memory-updated` on `store_memory` tool_end/tool_result.
  - `pnpm typecheck` and `pnpm test` pass.
- **Plan:** `docs/plans/2026-04-05-map-parcel-truth-overlay.md`

### AI-RESEARCH-001 — Perplexity Agent API Tooling Integration (P1)

- **Priority:** P1
- **Status:** Done (2026-03-31)
- **Scope:** Add Perplexity-powered web research tools to the OpenAI tool registry and route market/regulatory workflows to Perplexity before CUA where appropriate.
- **Problem:** Web research workflows currently rely too heavily on `browser_task`, which is slower and more brittle for public non-interactive sources than API-native web research.
- **Expected Outcome (measurable):**
  - Unified EntitlementOS toolset exposes Perplexity quick lookup, web research, structured extraction, and deep research.
  - Market Trajectory and EntitlementOS instructions include explicit routing guidance for Perplexity vs CUA.
  - Environment template and package dependencies are updated for `PERPLEXITY_API_KEY`.
- **Evidence of need:** New integration plan created at `docs/plans/2026-03-31-perplexity-agent-api-integration.md` with concrete file map and workflow routing requirements.
- **Alignment:** Preserves existing architecture (CUA retained for interactive/login flows), keeps local property DB as authoritative source of record, and introduces Perplexity only for external web research.
- **Risk/rollback:** Low-to-medium; changes are additive and can be rolled back by removing tool wiring and prompt guidance if quality/cost regresses.
- **Acceptance Criteria / Tests:**
  - Add `packages/openai/src/tools/perplexityTools.ts` with four Perplexity tools.
  - Wire new tools in `packages/openai/src/tools/index.ts` including `marketTrajectoryTools` and `entitlementOsTools`.
  - Update agent instructions in `packages/openai/src/agents/entitlement-os.ts` and `market-trajectory-agent/marketTrajectory.ts`.
  - Add dependency in `packages/openai/package.json` and env placeholder in `.env.example`.
  - Run `pnpm -C packages/openai typecheck` and workspace `pnpm typecheck`.
- **Evidence (2026-03-31):**
  - Added Perplexity tool module with `perplexity_quick_lookup`, `perplexity_web_research`, `perplexity_structured_extract`, and `perplexity_deep_research`.
  - Wired tool exports and runtime collections in `packages/openai/src/tools/index.ts`.
  - Added Perplexity routing/workflow guidance to unified EntitlementOS and Market Trajectory instructions.
  - Added `@perplexity-ai/perplexity_ai` dependency and `.env.example` variable for `PERPLEXITY_API_KEY`.
  - Verified `pnpm -C packages/openai typecheck` during implementation.

### CHAT-007 — User Message Contrast Regression Fix (P0)

- **Priority:** P0
- **Status:** Done (2026-03-31)
- **Scope:** Restore readable user-message text in `/chat` by removing style-token conflicts in the user bubble renderer.
- **Problem:** User messages became unreadable after chat UI simplification because the bubble used `text-primary-foreground` while nested renderer output forced `text-foreground`, producing low contrast against both dark and light primary bubble backgrounds.
- **Expected Outcome (measurable):**
  - User-authored message text remains legible in both light and dark themes.
  - User bubble styling no longer depends on assistant structured renderer typography tokens.
- **Evidence of need:** Operator screenshot reports on 2026-03-31 showed user message content effectively invisible while assistant/system content remained visible.
- **Alignment:** Keeps current message model and action controls unchanged; only adjusts presentation logic for the `role === "user"` path.
- **Risk/rollback:** Low; isolated to `MessageBubble` rendering path with focused component regression coverage.
- **Acceptance Criteria / Tests:**
  - User bubble renders plain preserved text with `text-primary-foreground`.
  - Focused tests pass: `pnpm -C apps/web test -- components/chat/MessageBubble.test.tsx components/chat/MessageList.test.tsx components/chat/ChatContainer.test.tsx`
- **Evidence (2026-03-31):**
  - Updated `apps/web/components/chat/MessageBubble.tsx` to render user text directly (whitespace-preserving paragraph) instead of `StructuredMessageRenderer`.
  - Added regression assertion in `apps/web/components/chat/MessageBubble.test.tsx` validating `text-primary-foreground` on user content.

### CHAT-006 — Chat Console UX Simplification (P1)

- **Priority:** P1
- **Status:** Done (2026-03-31)
- **Scope:** Simplify `/chat` launch-state UI to prioritize transcript + composer by reducing dashboard chrome and collapsing setup panels into compact context controls.
- **Problem:** Operator feedback and UI review indicate the chat launch surface feels clunky and confusing because KPI cards, hero copy, and workspace mode panels compete with the core chat action.
- **Expected Outcome (measurable):**
  - First-screen `/chat` presents a compact context bar and lightweight prompt chips instead of dashboard-style cards.
  - Visual hierarchy clearly prioritizes composing/sending the first message.
  - Redundant launch-state labels/panels are removed from the primary flow.
- **Evidence of need:** Screenshot review on 2026-03-31 identified competing focal points (KPI strip, hero, workspace mode card, and composer) and weak chat-console affordance.
- **Alignment:** Preserves current auth, agent transport, and conversation persistence contracts while improving UI clarity in the existing chat component architecture.
- **Risk/rollback:** Low; changes are isolated to launch-state presentation in `apps/web/components/chat/ChatWorkspacePanels.tsx` and can be reverted without API or data impact.
- **Acceptance Criteria / Tests:**
  - Launch-state hero no longer renders KPI stat cards or the large workspace mode panel.
  - Compact scope/model/status row and inline quick actions remain functional.
  - Header/search/action chrome is reduced on `/chat` while remaining unchanged on non-chat routes.
  - `pnpm typecheck`
  - `pnpm -C apps/web test -- components/layout/Header.test.tsx components/chat/ChatWorkspacePanels.test.tsx components/chat/ChatContainer.test.tsx`
- **Evidence (2026-03-31):**
  - Simplified launch-state composition in `apps/web/components/chat/ChatWorkspacePanels.tsx` by removing KPI cards, large hero copy, and workspace mode panel in favor of compact context + prompt chips.
  - Added route-aware shell minimization for `/chat` in `apps/web/components/layout/Header.tsx` and `apps/web/components/layout/DashboardShell.tsx` (collapsed route metadata, hid desktop command search, reduced action density, and reduced header height).
  - Updated and passed focused regression coverage in `apps/web/components/layout/Header.test.tsx` and `apps/web/components/chat/ChatContainer.test.tsx`.

### WEB-SELLER-INTAKE-001 — Public Seller Intake Hardening + Telemetry (P1)

- **Priority:** P1
- **Status:** Done (2026-03-21)
- **Scope:** Add API and UI regression coverage for the public seller submission intake and document rollout guardrails.
- **Problem:** The seller intake contract and homepage submission experience lacked route-level tests (validation, honeypot, rate-limit), component behavior tests (submit/success/error), and explicit analytics reason-code telemetry for failure triage.
- **Expected Outcome (measurable):**
  - Route tests validate success, required field failures, honeypot rejection, and rate limiting.
  - Component tests lock required-field rendering and submit state transitions for success/error responses.
  - Homepage assertions include new seller CTA/section copy.
  - Submission telemetry emits `seller_submission_started`, `seller_submission_succeeded`, and `seller_submission_failed` (non-PII `reasonCode`).
- **Risk/rollback:** Low; changes are additive to homepage UI, route contract, and tests.
- **Acceptance Criteria / Tests:**
  - `pnpm -C apps/web test -- app/api/seller-submissions/route.test.ts components/marketing/SellerSubmissionSection.test.tsx app/(chat)/page.test.tsx -u`
  - Public intake contract documented for operations and future integrations.
- **Evidence (2026-03-21):**
  - Added `POST /api/seller-submissions` with schema validation, honeypot rejection, and IP-based rate limiting.
  - Added seller submission homepage section + submit-state UX and observability event emission.
  - Added route/component/homepage test coverage and updated homepage snapshot.
  - Added public intake contract documentation in `docs/SELLER_INTAKE_CONTRACT.md`.

### DOC-001 — Documentation Contract Reconciliation (P0)

- **Priority:** P0
- **Status:** In Progress (2026-03-06)
- **Scope:** Repo-wide documentation audit and reconciliation against current production/runtime contracts
- **Problem:** Active docs, READMEs, smoke matrices, and in-code reference comments drifted from the live NextAuth + gateway + Qdrant + observability architecture, leaving conflicting instructions in multiple surfaces.
- **Expected Outcome (measurable):**
  - Active documentation matches the current code paths, auth model, gateway endpoints, observability endpoints, and retrieval split.
  - Historical Supabase-era or deprecated migration docs are explicitly labeled as archival/non-authoritative.
  - Removed endpoints and old auth/runtime claims no longer appear in active smoke matrices or implementation guides.
- **Evidence of need:** Current repo scan shows conflicts including stale Supabase JWT references, retired `/api/external/chatgpt-apps/*` paths in test matrices, outdated gateway/tool route names, and old parcel/property deployment guidance that conflicts with the current gateway-only runtime.
- **Alignment:** Preserves the gateway-only parcel/property architecture, Postgres-first exact retrieval, Qdrant semantic augmentation, NextAuth-based auth discipline, and current observability stack.
- **Risk/rollback:** Low-to-medium risk because the work spans many documentation surfaces; rollback is straightforward by reverting doc-only changes, but incomplete reconciliation is not acceptable because conflicting docs directly create operator error.
- **Acceptance Criteria / Tests:**
  - Update active docs/READMEs/comments to reflect current auth, gateway, parcel geometry, observability, and retrieval contracts.
  - Mark intentionally historical migration docs as archival with clear pointers to current authoritative docs.
  - Remove retired route references from test matrices and active operational runbooks.
  - Run verification gate and review the final diff for documentation-only intent plus any required comment fixes.
- **Evidence (incremental, 2026-03-20):** Reconciled agent docs (`AGENTS.md`, `packages/db/AGENTS.md`) with actual workspace packages; removed non-canonical gateway prototypes `infra/local-api/api_server.py` and `tile_server.py` (canonical `main.py` + `admin_router.py`); updated `infra/local-api/README.md`, `infra/local-api/SPEC.md`, `docs/archive/2026-03-20-root-cleanup/PHASE_3_DEPLOYMENT_BLOCKERS.md`, `ROADMAP.md` (INFRA-002), `docs/CHANGELOG_DOCS.md`, `docs/INDEX.md`, `docs/DOCS_MANIFEST.json`; corrected archived `docs/PLAN.md` worker row + banner; clarified `CLAUDE.md` and `docs/claude/architecture.md`; deleted superseded `docs/COMPREHENSIVE_CLAUDE_CODE_CONTINUATION_PROMPT_2026-03-07.md`; added `apps/web/.next-*/` to `.gitignore`.
- **Evidence (incremental, 2026-03-20 — PC server access):** Added `docs/server-manifest.json` (structured URLs, ports, env var *names*); reconciled OS + Postgres naming in `docs/SERVER_MANAGEMENT.md` and `docs/claude/backend.md`; linked from `docs/SOURCE_OF_TRUTH.md`, `docs/INDEX.md`, `CLAUDE.md`, and `.env.example` / `apps/web/.env.example` comments.
- **Evidence (incremental, 2026-03-20 — agent-oriented repo layout):** Moved historical root-level prompts/status files into `docs/archive/2026-03-20-root-cleanup/` with `README.md` index; updated cross-references (`skills/entitlement-os/`, `docs/claude/reference.md`, `.github/copilot-instructions.md`, `scripts/observability/sentinel-eval.ts`, etc.); added `**/*.bak.*` to `.gitignore`.

### MAP-009 — Google Maps Grounding + Cache-Backed Market Enrichment (P1)

- **Priority:** P1
- **Status:** Done (2026-03-12)
- **Scope:** Add Google Maps Grounding Lite MCP access for agents, cache-backed area-summary and POI-density tools in Postgres, and Address Validation enrichment on autocomplete without weakening org scoping or making Google the system of record.
- **Problem:** The repo already uses `GOOGLE_MAPS_API_KEY` for Places autocomplete and text search, but agents cannot yet access the Google Maps Grounding Lite MCP server, market/screener flows lack cache-backed area summaries and POI density enrichment, and autocomplete cannot surface verified-address hints. Google responses are also not yet persisted in Postgres for authoritative reuse.
- **Expected Outcome (measurable):**
  - Coordinator/runtime can expose the Google Maps Grounding Lite MCP server when explicitly enabled and keyed.
  - Area summaries and POI density are fetched from Google only on cache miss, then stored in Postgres with org-scoped TTL-based reuse.
  - Parcel triage can add an optional `poiDensityScore` without failing when Google is unavailable.
  - `/api/places/autocomplete` can opportunistically annotate top Google results with validation metadata without slowing the response path materially.
- **Evidence of need:** Current code only covers `apps/web/app/api/places/autocomplete/route.ts` and `packages/openai/src/tools/placesTools.ts`; there is no Google MCP server registration, no cache-backed area-summary or aggregate-density tool, no Address Validation utility, and no Postgres cache models for Google-derived enrichments.
- **Alignment:** Preserves the repo contract that Postgres is authoritative and Google Maps is a metered external enrichment source. All cache writes remain scoped by `orgId`, OpenAI tooling stays on the Responses/MCP path, and server-only API keys remain server-side.
- **Risk/rollback:** Medium risk because the work spans agent tool wiring, Prisma schema, and app-route enrichment. Rollback is straightforward by disabling the feature flag / env gates and reverting the additive cache models plus route/tool changes.
- **Acceptance Criteria / Tests:**
  - Add a gated Google Maps MCP server config and register the canonical MCP tool metadata/aliases without breaking local tool execution paths.
  - Add `get_area_summary` and `get_poi_density` tools with Postgres-backed caching, graceful degradation, and org-scoped queries.
  - Add cache models and a Prisma migration for Google area summary and POI density persistence.
  - Add optional POI density scoring to `parcel_triage_score` that degrades to `null` when coordinates or Google access are unavailable.
  - Add Address Validation enrichment to `/api/places/autocomplete` plus focused route/tool tests.
  - Run focused package/app tests plus `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence (2026-03-12):**
  - Added Google Maps Grounding Lite MCP gating and intent-scoped coordinator/specialist wiring in `packages/openai/src/tools/mcpGatewayAdapter.ts`, `packages/openai/src/tools/toolCatalog.ts`, `packages/openai/src/tools/index.ts`, and `packages/openai/src/agents/index.ts`.
  - Added Postgres-backed Google cache models plus migration in `packages/db/prisma/schema.prisma` and `packages/db/prisma/migrations/20260313042308_add_google_maps_cache_models/migration.sql`.
  - Added cache-backed `get_area_summary` and `get_poi_density` tools plus POI triage enrichment in `packages/openai/src/tools/googleMapsTools.ts` and `packages/openai/src/tools/scoringTools.ts`.
  - Added Address Validation enrichment contract in `apps/web/lib/server/googleMapsValidation.ts` and `apps/web/app/api/places/autocomplete/route.ts`.
  - Focused verification passed:
    - `pnpm -C packages/openai test -- src/tools/googleMapsTools.test.ts src/tools/scoringTools.test.ts test/phase1/tools/parcelTriageScore.phase1.test.ts`
    - `pnpm -C apps/web test -- app/api/places/autocomplete/route.test.ts app/api/agent/tools/execute/route.test.ts`
    - `pnpm -C packages/db run generate`
  - Full gate passed:
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=placeholder pnpm build`

### MAP-010 — Production Parcel Search + Semantic Recall Regression Fix (P0)

- **Priority:** P0
- **Status:** Done (2026-03-13)
- **Scope:** Fix the live `/api/parcels` address-search regression for known parcel addresses and restore direct `/api/agent/tools/execute` semantic recall execution for `recall_property_intelligence`.
- **Problem:** Production repro on `https://gallagherpropco.com` shows `GET /api/parcels?hasCoords=true&search=4416 HEATH DR` returning `503 GATEWAY_UNAVAILABLE`, while direct gateway probes confirm the exact query `4416 heath dr` resolves successfully. The current fallback ordering truncates search fanout to the first two generated variants, both of which canonicalize to non-working `drive` forms before the exact `dr` query is attempted. Separately, `/api/agent/tools/execute` executes `recall_property_intelligence` through the SDK `tool.invoke(...)` path, but required-nullable JSON-schema fields are omitted from the request body, causing `Invalid JSON input for tool` before Qdrant is queried.
- **Expected Outcome (measurable):**
  - Known-address parcel searches attempt an exact suffix-preserving query before broader canonicalized variants and return parcel rows instead of empty/503 responses when the upstream gateway is otherwise healthy.
  - `/api/agent/tools/execute` can run `recall_property_intelligence` without callers having to manually send `null` for every required-nullable field.
  - Focused tests lock the fallback-query ordering and required-nullable tool-input hydration.
- **Evidence of need:** Live probes on 2026-03-13 reproduced `/api/parcels?hasCoords=true&search=4416 HEATH DR -> 503`, while direct authenticated gateway calls returned one row for `q=4416 heath dr` and zero rows for the route’s current preferred variants `q=heath drive` and `q=4416 heath drive`. The same production session reproduced `/api/agent/tools/execute` returning `An error occurred while running the tool... Invalid JSON input for tool` for `recall_property_intelligence`.
- **Alignment:** Preserves the gateway-only parcel architecture, keeps parcel search fail-closed when the gateway is truly unavailable, and restores the existing semantic-recall contract without loosening auth or org scoping.
- **Risk/rollback:** Low-to-medium risk because the changes are scoped to fallback query ordering and tool-input normalization. Rollback is straightforward by reverting the ordering helper and nullable-field hydration if unintended search/tool behavior appears.
- **Acceptance Criteria / Tests:**
  - `/api/parcels` search prioritizes suffix-preserving exact address variants ahead of broader canonicalized variants.
  - `recall_property_intelligence` and similar required-nullable tool invocations succeed via `/api/agent/tools/execute` when optional fields are omitted by the caller.
  - Add focused regression coverage for parcel fallback query ordering and nullable tool-input hydration.
  - Re-run focused tests plus the live production repro probes used to diagnose the issue.
- **Evidence / Verification:**
  - Production repro and diagnosis captured on 2026-03-13: authenticated gateway probes returned one row for `q=4416 heath dr` and zero rows for the route's previous first-choice variants `q=heath drive` and `q=4416 heath drive`, isolating fallback-order truncation as the parcel-search failure.
  - Patched [apps/web/app/api/parcels/route.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/app/api/parcels/route.ts) to prioritize suffix-preserving exact address queries before broader canonicalized variants, with regression coverage in [apps/web/app/api/parcels/route.test.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/app/api/parcels/route.test.ts).
  - Patched [apps/web/lib/agent/toolRegistry.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/lib/agent/toolRegistry.ts) and added [apps/web/lib/agent/toolInvokeInput.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/lib/agent/toolInvokeInput.ts) plus [apps/web/lib/agent/toolInvokeInput.test.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/lib/agent/toolInvokeInput.test.ts) so required-nullable tool-schema fields are hydrated to `null` before SDK invocation.
  - Focused verification passed: `pnpm -C apps/web test -- app/api/parcels/route.test.ts lib/agent/toolInvokeInput.test.ts` and `pnpm -C apps/web test -- app/api/agent/tools/execute/route.test.ts`.
  - Full verification gate passed: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `OPENAI_API_KEY=placeholder pnpm build`.

### MAP-011 — Org-Scoped Tool Input Contract + Production Smoke Harness Alignment (P0)

- **Priority:** P0
- **Status:** Done (2026-03-13)
- **Scope:** Restore production `/api/agent/tools/execute` execution for org-scoped tools under the seeded sentinel org ID and align the legacy production verification scripts with the current Cloudflare Access + wrapped tool-response contract.
- **Problem:** After the `MAP-010` deploy, live `/api/parcels?hasCoords=true&search=4416 HEATH DR` recovered, but `/api/agent/tools/execute` still returned `Invalid JSON input for tool` for `recall_property_intelligence`. Production auth resolves `orgId` as `00000000-0000-0000-0000-000000000001`, while multiple tool schemas still require strict `z.string().uuid()`, so the SDK rejects the injected org ID before execution. Separately, `scripts/verify-production-features.sh` still encodes the older direct-gateway auth assumptions, and `scripts/smoke_endpoints.ts` still reads semantic tool hits from the wrong response level (`data.results` instead of `data.result.results`).
- **Expected Outcome (measurable):**
  - Org-scoped direct tool execution works in production for sentinel-org sessions, including `recall_property_intelligence`.
  - `scripts/verify-production-features.sh` is either retired into a compatibility wrapper or patched so it follows the current authenticated smoke contract instead of the stale direct-gateway path.
  - `scripts/smoke_endpoints.ts` correctly interprets wrapped `/api/agent/tools/execute` results and stops misclassifying tool-wrapper errors as zero-hit semantic failures.
- **Evidence of need:** Live production checks on 2026-03-13 showed `GET /api/parcels?hasCoords=true&search=4416 HEATH DR` returning parcel data after deploy, while `POST /api/agent/tools/execute` still returned `An error occurred while running the tool. Please try again. Error: $: Invalid JSON input for tool` for `recall_property_intelligence`. `GET /api/agent/auth/resolve` returned `orgId=00000000-0000-0000-0000-000000000001`, confirming the sentinel-org mismatch with strict UUID tool schemas.
- **Alignment:** Preserves the current auth model, keeps org scoping explicit, and makes the production smoke layer reflect the actual Cloudflare Access and app-route response contracts instead of reviving legacy gateway assumptions.
- **Risk/rollback:** Low-to-medium risk because the change is limited to org-id input validation for tool schemas plus smoke-script wiring. Rollback is straightforward by reverting the additive org-id schema helper and the smoke-wrapper updates if they surface unexpected tool-schema side effects.
- **Acceptance Criteria / Tests:**
  - Sentinel-org direct tool execution succeeds for `recall_property_intelligence` and other org-scoped tools routed through `/api/agent/tools/execute`.
  - Add focused regression coverage for the sentinel org-id schema contract and wrapped semantic result parsing.
  - `scripts/verify-production-features.sh` clearly delegates to the current production smoke path or is otherwise updated to match the current Access contract.
  - Re-run focused tests, the full verification gate, and live production probes after redeploy.
- **Evidence / Verification:**
  - Added [packages/openai/src/tools/orgIdSchema.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/tools/orgIdSchema.ts) and applied it across [packages/openai/src/tools/propertyMemoryTools.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/tools/propertyMemoryTools.ts), [packages/openai/src/tools/dealTools.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/tools/dealTools.ts), [packages/openai/src/tools/taskTools.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/tools/taskTools.ts), [packages/openai/src/tools/evidenceTools.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/tools/evidenceTools.ts), and [packages/openai/src/agentos/schemas.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/agentos/schemas.ts) so sentinel-org sessions keep strict UUID validation plus the seeded production exception.
  - Retired [scripts/verify-production-features.sh](/Users/gallagherpropertycompany/Documents/gallagher-cres/scripts/verify-production-features.sh) into a compatibility wrapper that sources the production monitor env and delegates to `pnpm smoke:gateway:edge-access`, `pnpm smoke:endpoints`, and `pnpm parcel:smoke:prod`.
  - Patched [scripts/smoke_endpoints.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/scripts/smoke_endpoints.ts) to unwrap `data.result`, surface wrapped execution errors, and treat `memory_disabled` explicitly; added regression coverage in [tests/smoke_endpoints.test.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/tests/smoke_endpoints.test.ts).
  - Added focused sentinel-org coverage in [packages/openai/src/tools/orgIdSchema.test.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/tools/orgIdSchema.test.ts), extended [packages/openai/src/tools/propertyMemoryTools.test.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/src/tools/propertyMemoryTools.test.ts), and updated [packages/openai/test/phase1/_helpers/toolAssertions.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/test/phase1/_helpers/toolAssertions.ts) so phase-pack schema checks understand the new additive `anyOf` contract.
  - Focused verification passed: `pnpm -C packages/openai test -- src/tools/orgIdSchema.test.ts src/tools/propertyMemoryTools.test.ts`, `pnpm exec vitest run tests/smoke_endpoints.test.ts`, and `pnpm -C packages/openai test -- test/phase1/tools/addParcelToDeal.phase1.test.ts test/phase1/tools/compareEvidenceHash.phase1.test.ts test/phase1/tools/createDeal.phase1.test.ts test/phase1/tools/createTask.phase1.test.ts test/phase1/tools/evidenceSnapshot.phase1.test.ts test/phase1/tools/getDealContext.phase1.test.ts test/phase1/tools/get_rent_roll.phase1.test.ts test/phase1/tools/listDeals.phase1.test.ts test/phase1/tools/updateDealStatus.phase1.test.ts test/phase1/tools/updateParcel.phase1.test.ts test/phase1/tools/updateTask.phase1.test.ts`.
  - Full verification gate passed: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### MAP-012 — Production Smoke Contract Follow-up (P0)

- **Priority:** P0
- **Status:** Done (2026-03-13)
- **Scope:** Align the production smoke harness with the runtime contracts that are actually deployed for polygon prospecting and semantic property-intelligence recall.
- **Problem:** After the `MAP-011` deploy, live production probes show the runtime fixes are working, but `pnpm smoke:endpoints` still fails for two harness-specific reasons. First, `/api/map/prospect` returns parcel rows for the polygon-only request, while the smoke harness currently injects `filters.searchText` and expects the address-specific path to work even though the current route implementation does not apply `searchText`. Second, semantic recall now executes without schema errors, but a zero-hit read-only recall is not a reliable health check when the collection may legitimately be empty for the current org. The harness needs to fall back to a deterministic `store_property_finding` plus `recall_property_intelligence` round-trip when the read-only recall returns zero hits.
- **Expected Outcome (measurable):**
  - `scripts/smoke_endpoints.ts` validates polygon prospecting with a structural parcel-envelope check instead of a brittle non-empty row-count expectation.
  - Semantic smoke stops reporting false negatives when the collection is empty by seeding and recalling a known parcel only when the initial read-only probe returns zero hits.
  - `scripts/verify-production-features.sh` passes again once redeployed because it delegates to the repaired smoke script.
- **Evidence of need:** On 2026-03-13, the production custom domain on commit `c7f4745f5a166d57b0368f503342f13bdf42c601` returned parcel data for `/api/parcels?hasCoords=true&search=4416 HEATH DR`, returned `stored: true` followed by one semantic hit for a direct `store_property_finding` → `recall_property_intelligence` round-trip, and returned parcel rows for polygon-only `/api/map/prospect` while the smoke script's `filters.searchText` variant still returned `{ parcels: [], total: 0 }`.
- **Alignment:** Preserves the deployed runtime contracts, keeps the smoke harness auth path on the current Cloudflare Access model, and avoids shipping a speculative runtime change just to satisfy a brittle verifier.
- **Risk/rollback:** Low risk because the work is limited to smoke/test code and roadmap evidence. Rollback is straightforward by reverting the harness updates if a different production contract is intentionally restored later.
- **Acceptance Criteria / Tests:**
  - `scripts/smoke_endpoints.ts` uses polygon-only prospect verification with structural envelope validation and deterministic semantic fallback seeding.
  - `tests/smoke_endpoints.test.ts` and a dedicated parcel-smoke helper test cover the new helpers.
  - Re-run focused smoke tests, the full verification gate, redeploy, and verify `pnpm smoke:endpoints` plus `bash scripts/verify-production-features.sh` against production.
- **Evidence / Verification:**
  - Patched [scripts/smoke_endpoints.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/scripts/smoke_endpoints.ts) so prospect smoke uses polygon-only envelope validation, geometry fallback uses generic parcel IDs, and semantic smoke falls back to `store_property_finding` plus exact-address recall against the known production fixture parcel when the initial read-only recall returns zero hits.
  - Patched [scripts/parcels/smoke_map_parcel_prod.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/scripts/parcels/smoke_map_parcel_prod.ts) to stop treating `POST /api/map/prospect` row count as a hard failure, prefer parcel-search IDs for geometry lookup, and add a main-entrypoint guard so helper exports are testable without auto-execution.
  - Added regression coverage in [tests/smoke_endpoints.test.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/tests/smoke_endpoints.test.ts) and [tests/parcel_smoke_prod.test.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/tests/parcel_smoke_prod.test.ts), and wired the new parcel-smoke test into [package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/package.json).
  - Focused verification passed: `pnpm exec vitest run tests/smoke_endpoints.test.ts tests/parcel_smoke_prod.test.ts` and `pnpm -C apps/web test -- app/api/map/prospect/route.post.test.ts`.
  - Live production verification passed from the local harness on 2026-03-13: `pnpm smoke:endpoints` succeeded against `https://gallagherpropco.com`, and `bash scripts/verify-production-features.sh` completed successfully with edge-access, endpoint smoke, and parcel smoke all green.

### MAP-013 — Parcel Gateway Timeout Hardening (P0)

- **Priority:** P0
- **Status:** Done (2026-03-13)
- **Scope:** Harden the live `/api/parcels` gateway-search timeout budget so production known-address searches do not abort before the property-db gateway responds.
- **Problem:** After the `MAP-012` harness fixes deployed, the new production build on commit `eae2669` still shows `GET /api/parcels?hasCoords=true&search=4416 HEATH DR` returning `503 GATEWAY_UNAVAILABLE`. Vercel runtime logs for the live request show `[/api/parcels] property DB unavailable Error [GatewayUnavailableError]: [gatewaySearchParcels] exception: This operation was aborted`, which indicates the route's own `PROPERTY_DB_GATEWAY_TIMEOUT_MS` budget is expiring before the upstream search call completes.
- **Expected Outcome (measurable):**
  - Default `/api/parcels` gateway searches tolerate a slower but successful upstream search response instead of aborting at the current short timeout.
  - Timeout-driven failures log an explicit `request timed out after ...ms` reason instead of a generic abort string.
  - Regression coverage proves the default timeout budget is above the observed live-search latency envelope.
- **Evidence of need:** On 2026-03-13, the production deployment `dpl_AtFMwKSENXBJ5rjcNAkxnis7RTmd` served commit `eae2669`, `/api/health` reported `propertyDb.reachable=true`, and Vercel request logs for `/api/parcels` showed the route aborting its own gateway fetch before completion.
- **Alignment:** Preserves the gateway-only parcel architecture, keeps true upstream outages surfaced as degraded fallback or `503`, and avoids loosening auth/org-scoping controls.
- **Risk/rollback:** Low risk because the change is limited to the parcel route's timeout handling and focused regression tests. Rollback is straightforward by reverting the timeout/logging adjustment if user-facing latency becomes unacceptable.
- **Acceptance Criteria / Tests:**
  - `/api/parcels` no longer aborts successful gateway searches at the current production latency envelope.
  - Timeout failures include the configured timeout duration in the gateway-unavailable log/error path.
  - Add focused route-test coverage for a slower successful gateway response under the default timeout budget.
- **Evidence / Verification:**
  - Patched [apps/web/app/api/parcels/route.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/app/api/parcels/route.ts) to raise the default gateway timeout budget from the previous short 6.5s path, preserve env override support, and log explicit `request timed out after ...ms` abort reasons.
  - Added regression coverage in [apps/web/app/api/parcels/route.test.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/app/api/parcels/route.test.ts) for both a slower successful gateway response under the default timeout budget and an explicit timeout-duration log on abort.
  - Production diagnosis captured on 2026-03-13 from deployment `dpl_AtFMwKSENXBJ5rjcNAkxnis7RTmd`: `/api/health` reported `propertyDb.reachable=true` on commit `eae2669`, while Vercel request logs for `/api/parcels` showed `GatewayUnavailableError` caused by an aborted gateway request.
  - Focused verification passed: `pnpm -C apps/web test -- app/api/parcels/route.test.ts` and `pnpm exec vitest run tests/smoke_endpoints.test.ts tests/parcel_smoke_prod.test.ts`.
  - Full verification gate passed: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `OPENAI_API_KEY=placeholder pnpm build`.

### CHAT-002 — Chat Surface Local-Degradation + Error Sanitization (P0)

- **Priority:** P0
- **Status:** Done (2026-03-12)
- **Scope:** Stabilize the local chat experience when persistence/config dependencies are unavailable and remove raw internal error leakage from chat routes.
- **Problem:** With local auth bypass enabled for UI testing, the main chat shell loads but `/api/chat/conversations`, `/api/deals`, `/api/notifications/unread-count`, and chat resume/approval flows surface Prisma initialization failures when `DATABASE_URL` is absent. This breaks core chat-adjacent UI and leaks internal error details into client-visible responses.
- **Expected Outcome (measurable):**
  - Chat home renders without 500s in the common local-dev `NEXT_PUBLIC_DISABLE_AUTH=true` flow even when the app database is unavailable.
  - Conversation history, deal scope, and unread count degrade to empty/zero states instead of throwing route errors.
  - Chat resume/approval endpoints stop returning raw Prisma/config internals in JSON error responses.
- **Evidence of need:** Live local verification against `http://127.0.0.1:3001` showed `GET /api/chat/conversations 500`, `GET /api/deals 500`, and `GET /api/notifications/unread-count 500` with `Environment variable not found: DATABASE_URL`, while `POST /api/chat/resume` returned the raw Prisma initialization message to the client.
- **Alignment:** Preserves strict auth and org scoping while matching existing degraded-mode patterns already used on map/geofence/portfolio surfaces.
- **Risk/rollback:** Low-to-medium risk because the work is limited to route-level error handling and chat UI-adjacent behavior. Rollback is straightforward by reverting the scoped route changes if a contract mismatch appears.
- **Acceptance Criteria / Tests:**
  - `/api/chat/conversations` degrades to an empty list on schema-drift or Prisma connectivity failures.
  - `/api/deals` and `/api/notifications/unread-count` return safe empty-state payloads for the local-dev missing-DB path instead of 500s.
  - `/api/chat/resume` and `/api/chat/tool-approval` return sanitized error payloads for internal/system failures.
  - Add route tests for the new degraded/sanitized behaviors.
  - Run focused chat route tests plus repo verification gate.
- **Evidence:** Added `apps/web/lib/server/appDbEnv.ts`, hardened `apps/web/app/api/chat/*`, `apps/web/app/api/deals/route.ts`, and `apps/web/app/api/notifications/unread-count/route.ts`, added regression coverage in the chat route tests plus `apps/web/lib/chat/__tests__/useAgentWebSocket.test.tsx`, removed the chat-page favicon 404 with `apps/web/app/icon.svg`, manually re-ran the local chat flow on `http://localhost:3001`, and verified with `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### CHAT-003 — Chat Reload + Reconnect Recovery Hardening (P0)

- **Priority:** P0
- **Status:** Done (2026-03-12)
- **Scope:** Fix concrete chat correctness regressions across conversation reloads, WebSocket reconnect behavior, and pending tool approval recovery.
- **Problem:** Several core chat flows regress after the initial stream. The WebSocket hook never reconnects after abnormal closes, conversation reload drops persisted assistant metadata that the UI relies on, and pending tool approvals disappear on reload because the conversation API does not surface recoverable approval state.
- **Expected Outcome (measurable):**
  - Abnormal Worker WebSocket closures trigger a real client reconnect attempt instead of leaving chat stuck in an error state.
  - Reloaded conversations preserve persisted assistant metadata, including run lineage and map feature payloads.
  - Conversations with a pending approval rehydrate an actionable approval prompt after reload so the user can approve or reject without replaying the original request.
- **Evidence of need:** Repo inspection of `apps/web/lib/chat/useAgentWebSocket.ts` shows the reconnect path only toggles `status`, but the connection effect does not depend on `status`, so reconnect never occurs. `apps/web/app/api/chat/conversations/[id]/route.ts` omits `metadata` from message reads even though `apps/web/lib/agent/agentRunner.ts` persists `runId`, `openaiResponseId`, and `mapFeatures` into assistant message metadata. The same route also omits pending approval state even though `apps/web/lib/agent/executeAgent.ts` persists it in `runs.output_json.pendingApproval`.
- **Alignment:** Preserves existing auth and org scoping, keeps server persistence authoritative, and extends the current chat route/UI contract instead of introducing a parallel recovery surface.
- **Risk/rollback:** Medium. The work spans route read models plus client connection logic, but rollback remains straightforward because it is additive and isolated to chat transport/reload behavior.
- **Acceptance Criteria / Tests:**
  - `useAgentWebSocket` reconnects after abnormal close and does not reconnect after intentional or auth-failure closes.
  - `/api/chat/conversations/[id]` returns persisted message metadata and rehydrates pending approval state for the current org-scoped conversation.
  - Reloaded pending approvals render with the existing approval UI and post back through `/api/chat/tool-approval`.
  - Add focused route/client tests for reconnect and reload recovery.
  - Run focused chat tests plus repo verification gate.
- **Evidence (2026-03-12):**
  - Fixed reconnect recovery in `apps/web/lib/chat/useAgentWebSocket.ts` and added focused coverage in `apps/web/lib/chat/__tests__/useAgentWebSocket.test.tsx`.
  - Hardened conversation list/detail degradation and pending-approval reload state in `apps/web/app/api/chat/conversations/route.ts` and `apps/web/app/api/chat/conversations/[id]/route.ts`, with regression coverage in `apps/web/app/api/chat/conversations/route.test.ts` and `apps/web/app/api/chat/conversations/[id]/route.test.ts`.
  - Preserved approval UI after reload via `apps/web/components/chat/MessageBubble.tsx`, `apps/web/components/chat/ChatContainer.tsx`, and `apps/web/lib/chat/__tests__/streamRender.integration.test.tsx`.
  - Kept resume and approval failures sanitized in `apps/web/app/api/chat/resume/route.ts` and `apps/web/app/api/chat/tool-approval/route.ts` while extending their route tests.
  - Verified with `pnpm exec vitest run --configLoader runner --root apps/web -c vitest.config.mts 'app/api/chat/conversations/route.test.ts' 'app/api/chat/conversations/[id]/route.test.ts' 'app/api/chat/resume/route.test.ts' 'app/api/chat/tool-approval/route.test.ts' 'lib/chat/__tests__/streamRender.integration.test.tsx' 'lib/chat/__tests__/useAgentWebSocket.test.tsx'`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
  - `OPENAI_API_KEY=placeholder pnpm build` remains blocked by a pre-existing `packages/shared` TypeScript emit `EPERM` against `dist/` outputs, which is outside the chat changes.

### CHAT-004 — Learning Surface Local-Degradation Hardening (P0)

- **Priority:** P0
- **Status:** Done (2026-03-12)
- **Scope:** Harden the chat-adjacent learning APIs so local auth-bypass/dev fallback mode does not crash preference, memory-write, or knowledge routes when the app database is unavailable.
- **Problem:** The main chat shell already degrades in the common local-dev missing-`DATABASE_URL` flow, but the adjacent learning surfaces still throw raw Prisma initialization failures. `GET /api/preferences`, `POST /api/memory/write`, and `GET /api/knowledge?view=recent` currently return 500s and pollute logs, which blocks realistic testing of chat learning behavior.
- **Expected Outcome (measurable):**
  - Preference, memory-write, and knowledge routes return explicit degraded or unavailable responses in local missing-DB mode instead of raw Prisma initialization failures.
  - The visible learned-preferences panel can render an empty/degraded state without triggering 500s.
  - Route tests cover the new short-circuit behavior so future chat-learning QA does not regress.
- **Evidence of need:** Live local verification against `http://127.0.0.1:3001` showed `GET /api/preferences 500`, `POST /api/memory/write 500`, and `GET /api/knowledge?view=recent 500` with `Environment variable not found: DATABASE_URL` while testing the chat feature's ability to learn and build knowledge.
- **Alignment:** Extends the existing `shouldUseAppDatabaseDevFallback()` degraded-mode pattern already used on the chat, deals, notifications, and map-adjacent routes without weakening auth, org scoping, or production behavior.
- **Risk/rollback:** Low risk because the work is route-local and only affects the development missing-DB path. Rollback is straightforward by reverting the route guards and tests if a contract mismatch appears.
- **Acceptance Criteria / Tests:**
  - `/api/preferences` returns an empty/degraded payload in local missing-DB mode.
  - `/api/preferences/[id]`, `/api/memory/write`, and `/api/knowledge` stop surfacing raw Prisma initialization failures in that same mode.
  - Add route tests for the new short-circuit behavior, including the previously uncovered preferences routes.
  - Re-run focused learning-surface tests plus the repo verification gate.
- **Evidence (2026-03-12):**
  - Hardened local missing-DB fallback responses in `apps/web/app/api/preferences/route.ts`, `apps/web/app/api/preferences/[id]/route.ts`, `apps/web/app/api/memory/write/route.ts`, and `apps/web/app/api/knowledge/route.ts`.
  - Added new route coverage in `apps/web/app/api/preferences/route.test.ts` and `apps/web/app/api/preferences/[id]/route.test.ts`, and extended degraded-mode coverage in `apps/web/app/api/memory/write/route.test.ts` and `apps/web/app/api/knowledge/route.test.ts`.
  - Focused learning-surface verification passed: `pnpm -C apps/web test -- app/api/preferences/route.test.ts 'app/api/preferences/[id]/route.test.ts' app/api/memory/write/route.test.ts app/api/knowledge/route.test.ts` and `pnpm -C apps/web test -- __tests__/memory/memoryContextBuilder.test.ts __tests__/memory/memoryRetrieval.test.ts lib/agent/__tests__/agentRunner.stability.test.ts`.
  - Live local probes against `http://127.0.0.1:3001` now return explicit degraded responses instead of raw Prisma failures: `GET /api/preferences -> 200 {"preferences":[],"degraded":true}`, `POST /api/memory/write -> 503`, `GET /api/knowledge?view=recent -> 503`, `POST /api/knowledge -> 503`, and `PATCH /api/preferences/pref-1 -> 503`.
  - Full verification gate passed: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### CHAT-005 — DB-Backed Chat Learning E2E (P0)

- **Priority:** P0
- **Status:** Done (2026-03-12)
- **Scope:** Run the chat surface against the real local Postgres stack, align local auth-bypass with a valid seeded membership, and add an automated end-to-end test that proves a chat turn triggers a persisted `store_memory` cycle.
- **Problem:** The existing chat QA only proves degraded-mode behavior when the app DB is unavailable. It does not verify that a real chat turn can write learned facts into the memory system under local auth bypass, and the current bypass identity (`dev-user` / `dev-org`) does not correspond to the seeded local org membership used by the DB-backed stack.
- **Expected Outcome (measurable):**
  - A DB-backed local app run can send a chat message and complete a real persisted memory write without auth or Prisma failures.
  - Local auth bypass resolves to a seeded, DB-valid org/user identity so coordinator memory tool auth succeeds in development and E2E contexts.
  - A Playwright E2E proves a chat turn emits a `store_memory` tool cycle and results in a persisted memory record for the seeded org.
- **Evidence of need:** Local Docker Postgres is healthy on `localhost:54323`, but the current dev-bypass identity does not match the seeded org membership (`00000000-0000-0000-0000-000000000001` / `00000000-0000-0000-0000-000000000003`), so DB-backed chat-learning verification would still fail even with `DATABASE_URL` configured.
- **Alignment:** Preserves production auth and agent behavior by scoping the identity override to explicit local dev/E2E bypass mode, while validating the existing `store_memory` coordinator enforcement end to end instead of introducing a production-only shortcut.
- **Risk/rollback:** Medium-low risk because the auth-bypass change is development-only and the E2E adds coverage without changing production routing. Rollback is straightforward by reverting the local auth config helper and the new Playwright spec if it proves too brittle.
- **Acceptance Criteria / Tests:**
  - Local auth bypass resolves to a seeded membership that exists in the local Postgres database.
  - A DB-backed local server run completes a chat turn that invokes `store_memory` and persists a record for the seeded org.
  - Add automated E2E coverage for the persisted chat-learning cycle.
  - Re-run focused auth/chat tests plus the repo verification gate.
- **Evidence (2026-03-12):**
  - Added seeded local-dev auth overrides in `apps/web/lib/auth/resolveAuth.ts` and covered them in `apps/web/lib/auth/resolveAuth.test.ts`, allowing DB-backed auth bypass to resolve the seeded org/user IDs `00000000-0000-0000-0000-000000000001` and `00000000-0000-0000-0000-000000000003`.
  - Configured the Playwright harness for DB-backed local runs in `apps/web/playwright.config.ts`, including local Postgres defaults and an explicit `PLAYWRIGHT_REUSE_EXISTING_SERVER=true` path for running against a live dev server.
  - Hardened the chat runtime for local DB-backed learning in `apps/web/lib/agent/agentRunner.ts` and `apps/web/lib/agent/executeAgent.ts` so local runs stay on the direct path unless Temporal is explicitly enabled, wrapped `store_memory` events are recognized correctly, explicit memory-ingestion turns skip proof-enforcement false negatives after a successful memory write, and optional retrieval/auto-feed paths do not add unrelated local Prisma noise.
  - Added focused coverage in `apps/web/lib/agent/__tests__/agentRunner.stability.test.ts` and `apps/web/lib/agent/__tests__/executeAgent.runState-contract.test.ts`.
  - Added `apps/web/e2e/chat-learning.spec.ts` plus the stronger Copilot-close helper in `apps/web/e2e/_helpers/ui.ts` to exercise a real browser-driven chat-learning flow.
  - Fixed a real chat composer race in `apps/web/components/chat/ChatInput.tsx` so submit reads the live textarea value when React state has not flushed yet, with regression coverage in `apps/web/components/chat/ChatInput.test.tsx`.
  - Stabilized the production-style Playwright harness for parallel chat-learning verification: `apps/web/playwright.config.ts` now uses per-lane `NEXT_DIST_DIR` isolation plus root-local `tsconfig.playwright.<port>.json` copies, `.gitignore` ignores those generated files, and `apps/web/next.config.ts` respects `NEXT_DIST_DIR`/`NEXT_TSCONFIG_PATH` so concurrent browser lanes do not fight over `.next/lock` or break `@/` path resolution.
  - Fixed the chat production-build regression exposed by the E2E lanes by moving SSE helpers into `apps/web/app/api/chat/sseWriter.ts`, importing them from `apps/web/app/api/chat/route.ts`, and adding degraded SSE fallback coverage in `apps/web/app/api/chat/route.test.ts`.
  - Hardened chat-learning normalization for memory writes in `apps/web/lib/services/memoryWriteGate.ts` so percentage-form cap rates expressed in chat prompts are stored consistently even when the model emits a decimal, with regression coverage in `apps/web/__tests__/memory/memoryWriteGate.test.ts`.
  - Verified a DB-backed local dev run on `http://127.0.0.1:3002` with `DATABASE_URL` and `DIRECT_DATABASE_URL` pointed at local Postgres `localhost:54323`, `NEXT_PUBLIC_DISABLE_AUTH=true`, and seeded local auth overrides.
  - Verified the full browser-driven `store_memory` cycle through chat against the DB-backed dev server using Playwright automation: `POST /api/chat` completed successfully for a memory-ingestion prompt, and `/api/entities/lookup` returned persisted truth values for `comp.sale_price`, `comp.cap_rate`, `comp.noi`, `comp.sale_date`, and the canonical address.
  - Re-ran the chat-learning E2E as a four-lane matrix for broader coverage and speed: Chromium/Firefox/WebKit production-style lanes on isolated ports (`3117`, `3118`, `3119`) all passed, and a reused DB-backed dev-server Chromium lane against `http://127.0.0.1:3002` passed cleanly as the local baseline.
  - Focused verification passed:
    - `pnpm -C apps/web test -- components/chat/ChatInput.test.tsx lib/agent/__tests__/executeAgent.runState-contract.test.ts lib/agent/__tests__/agentRunner.stability.test.ts lib/auth/resolveAuth.test.ts app/api/chat/route.test.ts`
  - Full verification gate passed:
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=placeholder pnpm build`

### CHAT-006 — Chat Learning Expansion + Automation Hardening (P0)

- **Priority:** P0
- **Status:** Done (2026-03-12)
- **Scope:** Extend chat-learning verification from `store_memory` into `store_knowledge_entry`, promote the stable browser matrix into CI automation, clean up the remaining warning noise exposed by the successful E2E runs, and add end-to-end coverage for the highest-risk chat continuation flows.
- **Problem:** The current chat-learning verification proves only one persistence path and still relies on manual orchestration for the broader browser matrix. The successful runs also surfaced residual warning noise in the coordinator and Next runtime, and the riskiest chat continuation flows still rely on unit/integration coverage rather than browser-level evidence.
- **Expected Outcome (measurable):**
  - A DB-backed browser E2E proves a real chat turn triggers `store_knowledge_entry` and that the stored knowledge is retrievable afterward.
  - Chromium chat-learning becomes an automated PR gate, while the broader browser matrix runs on a scheduled or manual workflow without slowing every PR.
  - The coordinator no longer falls back to non-JSON report normalization on successful chat-learning runs, the Next middleware deprecation warning is removed, and the `/portfolio` build warning is reduced to intentional behavior only.
  - Browser-level chat QA covers approval resume, conversation resume/history, reconnect after abnormal close, and cross-session recall after reload.
- **Evidence of need:** `apps/web/e2e/chat-learning.spec.ts` currently verifies only `store_memory`. `.github/workflows/ci.yml` does not run any chat-learning Playwright coverage. Successful multi-browser runs still emit the coordinator fallback warning in `apps/web/lib/agent/executeAgent.ts`, the repo still uses `apps/web/middleware.ts`, and `/portfolio` currently opts into dynamic rendering via `headers()` reads in `apps/web/app/portfolio/page.tsx`.
- **Alignment:** Preserves strict auth, org scoping, and structured-output contracts while upgrading the highest-signal chat QA paths that already exist in route and unit tests into browser-backed regression coverage.
- **Risk/rollback:** Medium risk because the work touches runtime orchestration, E2E infrastructure, and Next request handling. Rollback is straightforward by reverting the new E2E specs/workflows and any targeted runtime warning fixes if a change proves too brittle.
- **Acceptance Criteria / Tests:**
  - Add a DB-backed Playwright E2E that proves a chat turn stores a knowledge entry and that the knowledge entry is retrievable through the app afterward.
  - Add browser-level coverage for the highest-risk chat continuation flows without overlapping unstable helpers.
  - Promote Chromium chat-learning into PR CI and add a full cross-browser matrix on schedule and manual dispatch.
  - Eliminate or intentionally justify the coordinator non-JSON fallback warning, the Next middleware deprecation warning, and the `/portfolio` dynamic-render warning.
  - Re-run focused Playwright/chat suites plus the full repo verification gate.
- **Evidence:** Added DB-backed chat-learning coverage in `apps/web/e2e/chat-knowledge-learning.spec.ts` and `apps/web/e2e/chat-continuation.spec.ts`, promoted the required Chromium gate and scheduled/manual browser matrix in `.github/workflows/ci.yml` and `.github/workflows/chat-learning-browser-matrix.yml`, exposed `store_knowledge_entry` through `packages/openai/src/agentos/toolPolicy.ts` with regression coverage in `packages/openai/src/agentos/toolPolicy.test.ts`, removed the middleware deprecation by replacing `apps/web/middleware.ts` with `apps/web/proxy.ts`, made `/portfolio` intentionally dynamic in `apps/web/app/portfolio/page.tsx`, fixed the persisted numeric recall fallback path in `apps/web/lib/agent/executeAgent.ts` with coverage in `apps/web/lib/agent/__tests__/executeAgent.runState-contract.test.ts`, and verified with `PLAYWRIGHT_PORT=3124 pnpm -C apps/web exec playwright test e2e/chat-knowledge-learning.spec.ts --project chromium --workers=1 --reporter=list`, `PLAYWRIGHT_PORT=3127 pnpm -C apps/web exec playwright test e2e/chat-continuation.spec.ts --project chromium --workers=1 --reporter=list -g "continues the same DB-backed conversation after reload and preserves recallable context"`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### CHAT-007 — Local Data Agent Auto-Feed Schema-Drift Degradation (P1)

- **Priority:** P1
- **Status:** Done (2026-03-12)
- **Scope:** Suppress false-positive Data Agent auto-feed failure noise during successful local chat runs when the app DB lacks Data Agent 2.0 tables, while preserving hard failures outside that narrow degraded case.
- **Problem:** The DB-backed chat continuation lane now passes, but local run finalization still logs `Data Agent auto-feed failed` when the development database is missing `Episode`/`KGEvent` tables. That makes successful chat-learning runs look broken and obscures real regressions.
- **Expected Outcome (measurable):**
  - Successful local chat runs no longer emit Data Agent auto-feed warnings for known schema-drift on `Episode`/`KGEvent`/related tables.
  - Auto-feed telemetry records the event as a degraded schema-unavailable skip instead of a generic failure.
  - Production and non-schema-drift failures still log as warnings and remain visible.
- **Evidence of need:** The passing `apps/web/e2e/chat-continuation.spec.ts` Chromium lane still emitted `relation "KGEvent" does not exist`, `relation "Episode" does not exist`, and `Data Agent auto-feed failed`, even though the user-visible chat flow completed correctly.
- **Alignment:** Preserves the Data Agent auto-feed architecture and observability while matching the repo’s existing local degraded-mode strategy for missing DB capabilities.
- **Risk/rollback:** Low risk because the change is narrowly scoped to a known development-only schema-drift path and leaves other failure classes untouched. Rollback is straightforward by reverting the suppression branch if it hides useful signal.
- **Acceptance Criteria / Tests:**
  - Recognize local schema-drift errors in app-local auto-feed and downgrade them to an info/degraded path instead of a warning failure.
  - Add regression coverage for the degraded schema-unavailable result.
  - Re-run the focused chat continuation browser lane and the full repo verification gate.
- **Evidence:** Added local-runtime schema-drift suppression in `apps/web/lib/agent/dataAgentAutoFeed.service.ts` and `apps/web/lib/agent/executeAgent.ts`, exposed the local-runtime helper in `apps/web/lib/server/appDbEnv.ts`, updated shared auto-feed telemetry state in `packages/shared/src/telemetry/dataAgent.ts` and `utils/logger.ts`, added regression coverage in `apps/web/lib/agent/__tests__/dataAgentAutoFeed.service.test.ts` and `apps/web/lib/agent/__tests__/executeAgent.runState-contract.test.ts`, and verified with `pnpm -C apps/web test -- lib/agent/__tests__/dataAgentAutoFeed.service.test.ts lib/agent/__tests__/executeAgent.runState-contract.test.ts`, `PLAYWRIGHT_PORT=3129 pnpm -C apps/web exec playwright test e2e/chat-continuation.spec.ts --project chromium --workers=1 --reporter=list -g "continues the same DB-backed conversation after reload and preserves recallable context"`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`. The remaining `util._extend` warning was traced to Next’s bundled `next/dist/compiled/http-proxy` dependency rather than app code.

### CHAT-008 — Playwright Upstream Deprecation Noise Suppression (P2)

- **Priority:** P2
- **Status:** Done (2026-03-12)
- **Scope:** Keep the production-style chat-learning browser lanes clean by suppressing the single known upstream `DEP0060` deprecation emitted by Next's bundled `http-proxy`, without muting broader app/runtime warnings.
- **Problem:** `CHAT-007` removed the local Data Agent false positives, but the focused Playwright continuation lane still emitted `DeprecationWarning: The util._extend API is deprecated`. That warning comes from Next's bundled dependency rather than repository code, so it obscures lane health without pointing to a repo fix.
- **Expected Outcome (measurable):**
  - The chat-learning Playwright web server no longer emits `DEP0060` during successful production-style runs.
  - Warning suppression remains scoped to the Playwright web-server environment and does not mute unrelated warnings in normal app runtime or other verification steps.
- **Evidence of need:** The successful `PLAYWRIGHT_PORT=3129 pnpm -C apps/web exec playwright test e2e/chat-continuation.spec.ts --project chromium --workers=1 --reporter=list -g "continues the same DB-backed conversation after reload and preserves recallable context"` lane still printed `[DEP0060] DeprecationWarning: The util._extend API is deprecated` after the app-specific warning cleanup was complete. Read-only tracing confirmed the source is Next's bundled `next/dist/compiled/http-proxy`.
- **Alignment:** Preserves the repo's warning discipline by removing a known upstream false-positive from the high-signal browser lane only, instead of weakening app logging or globally hiding deprecations.
- **Risk/rollback:** Low risk because the change is limited to the Playwright web-server env. Rollback is a one-line config revert if future Next versions remove or repurpose the warning.
- **Acceptance Criteria / Tests:**
  - Scope `--disable-warning=DEP0060` to the Playwright web-server environment only.
  - Re-run the focused chat continuation browser lane and confirm the `util._extend` warning is absent.
  - Re-run the full repo verification gate.
- **Evidence:** Updated `apps/web/playwright.config.ts` to append `--disable-warning=DEP0060` only for the Playwright web-server environment, then verified with `PLAYWRIGHT_PORT=3130 pnpm -C apps/web exec playwright test e2e/chat-continuation.spec.ts --project chromium --workers=1 --reporter=list -g "continues the same DB-backed conversation after reload and preserves recallable context"`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### CHAT-009 — Retrieval UUID Casting + Local Data Agent Table Capability Gating (P1)

- **Priority:** P1
- **Status:** Done (2026-03-12)
- **Scope:** Fix the remaining real runtime errors exposed by the DB-backed chat continuation lane: the retrieval `uuid = text` mismatch on `knowledge_embeddings.org_id` and the raw Prisma stderr emitted when local app databases are missing Data Agent graph/episode tables.
- **Problem:** After `CHAT-008`, the focused continuation lane still surfaced a real retrieval failure (`operator does not exist: uuid = text`) before `lookup_entity_by_address`, plus raw Prisma `relation "KGEvent" does not exist` / `relation "Episode" does not exist` noise before the existing degraded-mode handlers took over.
- **Expected Outcome (measurable):**
  - Retrieval context no longer throws `uuid = text` for `knowledge_embeddings.org_id`.
  - Local graph retrieval and local auto-feed skip table-dependent paths before Prisma throws when Data Agent graph/episode tables are absent.
  - The focused continuation browser lane passes without raw `KGEvent` / `Episode` Prisma stderr or retrieval type mismatch noise.
- **Evidence of need:** The successful `PLAYWRIGHT_PORT=3130 pnpm -C apps/web exec playwright test e2e/chat-continuation.spec.ts --project chromium --workers=1 --reporter=list -g "continues the same DB-backed conversation after reload and preserves recallable context"` lane still emitted `ERROR: operator does not exist: uuid = text`, plus Prisma stderr for missing `KGEvent` and `Episode` tables. Local DB inspection confirmed `knowledge_embeddings.org_id` is UUID-typed and the current app DB intentionally lacks `KGEvent` / `TemporalEdge` / `Episode` tables.
- **Alignment:** Preserves the exact-first retrieval architecture and local degraded-mode strategy while removing false-positive runtime noise from optional Data Agent paths.
- **Risk/rollback:** Low risk because the change is limited to table-capability checks and explicit UUID casts in raw retrieval SQL. Rollback is limited to the new helper and the cast changes if they prove incompatible.
- **Acceptance Criteria / Tests:**
  - Cast raw retrieval `org_id` comparisons to `::uuid`.
  - Add a shared table-capability helper for Data Agent optional tables and use it to skip graph retrieval / auto-feed before Prisma throws in local runtimes.
  - Add focused tests for the capability helper, graph-skip path, and local auto-feed skip behavior.
  - Re-run the focused continuation browser lane and the full repo verification gate.
- **Evidence:** Added `packages/db/src/schemaCapabilities.ts` plus `packages/db/test/schemaCapabilities.test.ts`, wired the export through `packages/db/src/index.ts`, updated `packages/openai/src/dataAgent/retrieval.ts` and `packages/openai/src/dataAgent/retrieval.test.ts` to cast UUID-bound raw SQL and skip graph queries when graph tables are unavailable, updated `apps/web/lib/agent/dataAgentAutoFeed.service.ts` and `apps/web/lib/agent/__tests__/dataAgentAutoFeed.service.test.ts` to skip local auto-feed before table-dependent writes when required Data Agent tables are absent, and verified with `pnpm --filter @entitlement-os/db test`, `pnpm --filter @entitlement-os/openai test -- src/dataAgent/retrieval.test.ts`, `pnpm -C apps/web test -- lib/agent/__tests__/dataAgentAutoFeed.service.test.ts lib/agent/__tests__/executeAgent.runState-contract.test.ts`, `PLAYWRIGHT_PORT=3132 pnpm -C apps/web exec playwright test e2e/chat-continuation.spec.ts --project chromium --workers=1 --reporter=list -g "continues the same DB-backed conversation after reload and preserves recallable context"`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### CHAT-010 — Multi-Agent Chat Closeout Workflow (P1)

- **Priority:** P1
- **Status:** Done (2026-03-12)
- **Scope:** Build a gated multi-agent workflow that completes the current chat closeout backlog as four coordinated lanes: checkpoint shipping, GitHub/browser automation validation, remaining Playwright log-noise cleanup, and roadmap/gate signoff.
- **Problem:** The chat-learning lane is now technically green, but the remaining closeout work is operational rather than purely code-level. Without an explicit PM-owned multi-agent workflow, the repo lacks a replayable way to parallelize release packaging, CI/browser path validation, warning cleanup, and final roadmap signoff without losing auditability.
- **Expected Outcome (measurable):**
  - A slugged workflow artifact set exists under `output/codex-agents-workflow/` with a PM plan, task matrix, handoff rules, lane reports, QA signoff, and a run log for this four-step closeout.
  - The checkpoint-shipping lane produces a concrete release-ready report tied to the current chat diff and verification evidence.
  - The automation lane validates the current GitHub/browser workflow path against the repo’s Playwright/CI setup and records any needed fixes or a pass result.
  - The log-noise lane removes the remaining non-actionable Playwright webserver warning noise without weakening broader warning visibility.
  - The workflow is reusable through a repo-level automation entrypoint instead of being trapped in one interactive session.
- **Evidence of need:** The chat roadmap items `CHAT-002` through `CHAT-009` are done, but the next requested step is explicitly to “build a multi-agent workflow to complete all 4” follow-on tasks. Existing `output/codex-agents-workflow/run/` scaffolding is generic and does not yet encode this chat-specific closeout flow.
- **Alignment:** Reuses the existing Codex MCP handoff pattern, preserves roadmap-first execution, and keeps changes within scoped workflow/docs/automation surfaces plus the narrowly targeted log-noise fix.
- **Risk/rollback:** Low-to-medium risk because most changes are artifact/workflow scaffolding, but the log-noise cleanup touches the Playwright harness. Rollback is straightforward by reverting the new workflow slug, wrapper script, roadmap entry, and any scoped warning fix.
- **Acceptance Criteria / Tests:**
  - Create a chat-specific multi-agent workflow artifact set with explicit PM gates, role scopes, and completion reports.
  - Add a reusable script or entrypoint that replays the workflow scaffold with the same four-lane objective.
  - Complete the four lanes for this run: ship report, automation-path validation, warning cleanup, and roadmap/final signoff.
  - Re-run the focused browser lane if the warning cleanup changes the Playwright harness.
  - Close with `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence (2026-03-12):**
  - Added reusable workflow scaffolding in `scripts/codex-auto/chat-closeout-workflow.sh` and documented it in `scripts/codex-auto/README.md`.
  - Built the run-specific artifact packet under `output/codex-agents-workflow/chat-closeout-four-lane/`, including `PLAN.md`, `TASKS.md`, `HANDOFF_MATRIX.md`, `TRACELOG.md`, `SHIP_REPORT.md`, `AUTOMATION_REPORT.md`, `RUNTIME_REPORT.md`, `QA_REPORT.md`, `07_outputs_inventory.md`, `07_run_log.md`, `08_qa_verification.md`, and `09_final_signoff.md`.
  - Automation lane tightened CI/browser workflow behavior in `.github/workflows/ci.yml` and `.github/workflows/chat-learning-browser-matrix.yml` so secret-gated runs fail or skip with explicit intent instead of opaque shell behavior.
  - Runtime lane kept the `DEP0060` suppression scoped to Playwright and removed the remaining `NO_COLOR` / `FORCE_COLOR` Node warning noise by deleting inherited `NO_COLOR` inside `apps/web/playwright.config.ts`.
  - Verified the runtime lane with `PLAYWRIGHT_PORT=3122 pnpm -C apps/web exec playwright test e2e/chat-continuation.spec.ts --project chromium --workers=1 --reporter=list`, then independently re-verified the highest-signal continuation case with `PLAYWRIGHT_PORT=3132 pnpm -C apps/web exec playwright test e2e/chat-continuation.spec.ts --project chromium --workers=1 --reporter=list -g "continues the same DB-backed conversation after reload and preserves recallable context"`.
  - Smoke-tested the reusable scaffold with `./scripts/codex-auto/chat-closeout-workflow.sh chat-closeout-script-smoke --force`.
  - Final verification gate passed: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### CHAT-011 — Land Search Tool Routing + DB Proxy Failure Containment (P0)

- **Priority:** P0
- **Status:** Done (2026-03-13)
- **Scope:** Fix land-search chat queries so they can use the statewide parcel DB tools they are instructed to use, and harden the Cloudflare `/db` proxy so upstream connection failures return JSON instead of uncaught Worker HTML.
- **Problem:** A production chat request asking for East Baton Rouge land suitable for a mobile home park surfaced `Gateway DB proxy error (500)` with raw Cloudflare `Worker threw exception` HTML. Read-only tracing shows two contract mismatches: `packages/openai/src/agentos/toolPolicy.ts` globally exposes `query_org_sql` while omitting `query_property_db` / `query_property_db_sql` for `land_search`, and `infra/cloudflare-agent/src/db-proxy.ts` leaves connection/transaction setup outside the guarded query error path, allowing uncaught Worker exceptions to escape as 1101 HTML.
- **Expected Outcome (measurable):**
  - Land-search prompts can access `query_property_db` / `query_property_db_sql` through the intent filter without inheriting irrelevant org-DB SQL by default.
  - The Cloudflare `/db` proxy returns structured JSON 500 payloads for connection/transaction setup failures instead of uncaught 1101 HTML.
  - Regression tests cover both the land-search allowlist behavior and the `/db` proxy failure path.
- **Evidence of need:** Live user failure included raw Cloudflare HTML from `agents.gallagherpropco.com`; local repo inspection confirmed `query_property_db` is recommended in coordinator instructions but blocked by current tool policy, while `/db` connection setup is not fully wrapped in `try/catch`.
- **Alignment:** Preserves the parcel-search architecture (`LOCAL_API_URL` gateway for statewide parcel data, Prisma `/db` only for scoped app/control-plane reads), keeps org-scoped SQL available only where intended, and improves error containment without weakening validation or auth.
- **Risk/rollback:** Low-to-medium risk because the changes are isolated to tool exposure and proxy error handling. Rollback is limited to the policy map and `/db` handler if downstream tool-selection behavior regresses.
- **Acceptance Criteria / Tests:**
  - Allow `query_property_db` and `query_property_db_sql` for `land_search` and the other intent classes already declared in the tool catalog.
  - Stop granting `query_org_sql` as a universal default when the intent does not call for org-scoped SQL.
  - Wrap `/db` connection and transaction-control setup so failures return JSON error payloads.
  - Add focused tests for tool filtering and DB proxy failure containment.
  - Re-run focused package tests plus `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence (2026-03-13):**
  - Updated `packages/openai/src/agentos/toolPolicy.ts` so `land_search` and related parcel-oriented intents expose `query_property_db` / `query_property_db_sql`, while `query_org_sql` is no longer inherited as a universal default.
  - Added intent-filter regression coverage in `packages/openai/src/agentos/toolPolicy.test.ts` for both the land-search parcel-tool path and the research path that still needs org-scoped SQL.
  - Hardened `infra/cloudflare-agent/src/db-proxy.ts` so connect / `BEGIN` / commit / rollback failures return structured JSON `{ error, detail }` responses instead of uncaught Worker exceptions that bubble up as Cloudflare 1101 HTML.
  - Added `infra/cloudflare-agent/src/db-proxy.test.ts` to cover one-shot connection failure and transaction-start failure containment.
  - Focused verification passed: `pnpm -C packages/openai test -- src/agentos/toolPolicy.test.ts`, `pnpm -C infra/cloudflare-agent test -- src/db-proxy.test.ts`, `pnpm lint`, `pnpm typecheck`, and `OPENAI_API_KEY=placeholder pnpm build`.
  - Full `pnpm test` remains blocked by a pre-existing unrelated failure in `packages/openai/test/phase1/tools/memoryTools.phase1.test.ts` (auth-header expectation drift in the memory tool test), not by the land-search / db-proxy changes in this item.

### CHAT-013 — Production Draft Conversation Detail Fail-Open Recovery (P0)

- **Priority:** P0
- **Status:** Done (2026-03-16)
- **Scope:** Prevent live chat detail reads from sending ephemeral draft ids into UUID-backed Prisma lookups so fresh draft probes fail open instead of erroring.
- **Problem:** Production verification on 2026-03-16 still showed `GET /api/chat/conversations/draft-verify-* -> 500 {"error":"Failed to load conversation"}` after the earlier bootstrap fix. Vercel production logs narrowed the real root cause: the route was still passing draft ids like `draft-verify-1773687416593` into the database-backed conversation lookup, and Prisma failed with `invalid input syntax for type uuid` before the compatibility `conversation: null` path could return.
- **Expected Outcome (measurable):**
  - Missing draft conversation ids return `200 { conversation: null }` without touching UUID-only Prisma queries.
  - Delete attempts for non-persisted draft ids return a clean `404` instead of surfacing a database error.
  - Live production probe for `/api/chat/conversations/draft-verify-*` returns `200` instead of `500` after deploy.
- **Evidence of need:** Production-authenticated probes on 2026-03-16 showed `/api/chat/conversations` returning `200` while `/api/chat/conversations/draft-verify-*` returned `500`. Vercel logs on deployment `dpl_FhKpV7q4pKh5FvRTy3aMoLGtCxRx` confirmed the failing SQL path was an invalid UUID cast on the draft identifier, not an auth/session issue.
- **Alignment:** Preserves the current auth and org-scoped conversation lookup contract while ensuring ephemeral client-side session ids never hit UUID-backed persistence queries.
- **Risk/rollback:** Low risk because the change is isolated to a read-only route and route tests. Rollback is straightforward by reverting the query ordering and warning path if it masks a needed operator signal, but it should not be allowed to block chat detail reads.
- **Acceptance Criteria / Tests:**
  - `apps/web/app/api/chat/conversations/[id]/route.ts` short-circuits non-UUID ids before any Prisma conversation or run lookup.
  - Missing conversations return `200 { conversation: null }` without invoking UUID-only persistence queries.
  - Add route regressions for non-UUID draft GET/DELETE handling and persisted UUID conversation loading.
  - Re-run focused chat tests, the repo verification gate, and a live production draft-id probe after push.
- **Evidence (2026-03-16):**
  - Hardened `apps/web/app/api/chat/conversations/[id]/route.ts` with a DB UUID guard so ephemeral draft ids now return `200 { conversation: null }` on GET and `404` on DELETE before any Prisma call.
  - Updated `apps/web/app/api/chat/conversations/[id]/route.test.ts` to use valid UUID conversation ids for persisted records and to assert draft ids never reach the Prisma mocks.
  - Local verification passed: `pnpm -C apps/web test -- 'app/api/chat/conversations/[id]/route.test.ts' app/api/jurisdictions/route.test.ts app/reference/page.test.tsx`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
  - Production deployment `f78b352da8c72ca4883094e4d4992899062effe9` returned `200 {"conversation":null}` for `/api/chat/conversations/draft-verify-*`, and the follow-up `vercel logs --since 3m --status-code 500` window showed no new chat-route `500`s.

### CHAT-014 — Business-Wide Chat Memory Capture + Retrieval Context (P0)

- **Priority:** P0
- **Status:** Done (2026-03-16)
- **Scope:** Capture every persisted user chat message as org-scoped business memory with typed metadata, then retrieve relevant historical chat captures back into the agent runtime as labeled context.
- **Problem:** The current chat pipeline persists conversation history and extracts narrow preferences, but it does not convert the broader stream of user-authored business intelligence into reusable institutional memory. This leaves sourcing, underwriting, entitlement, capital, buyer, operations, hiring, marketing, and strategy inputs trapped inside individual conversations instead of compounding across the business.
- **Expected Outcome (measurable):**
  - Every persisted user chat message is mirrored into the existing institutional knowledge store as a deterministic `chat_capture` record.
  - Captured chat memory includes typed metadata such as capture kind, business domains, source message id, conversation id, and optional deal linkage.
  - Future chat turns automatically receive a bounded historical business-memory block sourced from prior user chats, labeled as possibly stale context rather than live instructions.
  - Capture/retrieval failures remain best-effort and never block the core chat flow.
- **Evidence of need:** Current inspection of `apps/web/lib/agent/agentRunner.ts`, `apps/web/lib/chat/session.ts`, and `apps/web/lib/services/knowledgeBase.service.ts` shows persisted chat history, preference extraction, and institutional knowledge ingest/search already exist as separate primitives, but there is no business-wide capture layer that stores everything the user says in chat and feeds relevant prior user-authored intelligence back into future runs.
- **Alignment:** Reuses the existing org-scoped conversation/session and institutional knowledge architecture, preserves NextAuth/org-scoping and strict chat-route behavior, avoids introducing a second memory store, and keeps the first slice additive with no schema migration by using the existing `knowledge_embeddings` table plus a new `chat_capture` content type.
- **Risk/rollback:** Medium. The work touches the central chat runner and session persistence path, but rollback is straightforward because the feature is additive and can be disabled by reverting the capture/retrieval wiring without affecting baseline chat persistence.
- **Acceptance Criteria / Tests:**
  - Add a dedicated business-memory capture/retrieval service that classifies user chat messages into business domains and capture kinds, strips system-added map context, and ingests them as `chat_capture` knowledge entries.
  - Update the Prisma-backed chat session so persisted user messages return stable message ids that can be used as deterministic chat-memory source keys.
  - Inject a labeled historical business-memory block into the agent system context before execution, with semantic search fallback to exact search when Qdrant/embedding dependencies are unavailable.
  - Add focused tests for capture metadata, retrieval-context shaping, and agent-runner wiring.
  - Re-run focused chat/service tests plus `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence (2026-03-16):**
  - Added `apps/web/lib/services/businessMemory.service.ts` to sanitize map-context-prefixed chat messages, classify business domains and capture kinds, persist deterministic `chat_capture` knowledge entries by chat-message source id, and build labeled historical business-memory context with semantic-to-exact fallback.
  - Updated `apps/web/lib/agent/agentRunner.ts` so persisted user chat messages retrieve prior business memory into the agent system context before execution, then capture the current user turn after it has a stable persisted message id.
  - Updated `apps/web/lib/chat/session.ts` so `addItems()` returns persisted message rows, enabling deterministic message-to-knowledge linkage without adding a second persistence path.
  - Extended `apps/web/lib/services/knowledgeBase.service.ts` to recognize the additive `chat_capture` content type.
  - Added focused regressions in `apps/web/lib/services/businessMemory.service.test.ts`, `apps/web/lib/chat/__tests__/session.test.ts`, and `apps/web/lib/agent/__tests__/agentRunner.stability.test.ts`.
  - Focused verification passed:
    - `pnpm -C apps/web test -- lib/services/businessMemory.service.test.ts lib/chat/__tests__/session.test.ts lib/agent/__tests__/agentRunner.stability.test.ts`
  - Full verification gate passed:
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=placeholder pnpm build`

### REF-002 — Jurisdictions Pack Query Failure Containment (P0)

- **Priority:** P0
- **Status:** Done (2026-03-16)
- **Scope:** Keep `/api/jurisdictions` live when production data drifts in `official_domains` or parish-pack lookups by separating raw domain normalization from the base Prisma query.
- **Problem:** Even after response-shape hardening in `REF-001`, production verification on 2026-03-16 still showed `GET /api/jurisdictions -> 500`. Vercel production logs identified the real failure: Prisma could not decode `official_domains` because production rows stored JSON strings like `"[\"ascensionparish.net\",\"library.municode.com\",...]"` in a column Prisma expected to be an array, so the base `jurisdiction.findMany()` failed before pack shaping or per-record containment ran.
- **Expected Outcome (measurable):**
  - `/api/jurisdictions` returns the base jurisdiction list even when `official_domains` values are encoded inconsistently in production.
  - Current-pack failures are still logged with org-scoped context and surfaced as degraded pack context on the affected response instead of a route-wide `500`.
  - Live production probe for `/api/jurisdictions` returns `200` after deploy unless the base jurisdiction query itself is unavailable.
- **Evidence of need:** Production-authenticated verification on 2026-03-16 showed `/api/jurisdictions` returning `500` even after the serializer hardening in `REF-001`. Vercel logs on deployment `dpl_FhKpV7q4pKh5FvRTy3aMoLGtCxRx` confirmed the remaining failure was `Inconsistent column data: Conversion failed: expected an array in column 'official_domains'`, which required query-shape hardening rather than more serializer guards.
- **Alignment:** Preserves auth and org scoping, keeps the explicit `/reference` page error path for true route failures, and strengthens one-bad-record containment without weakening response validation or hiding base-database outages.
- **Risk/rollback:** Low-to-medium risk because the route query shape changes, but the response contract remains stable. Rollback is straightforward by restoring the single include query if a downstream consumer unexpectedly depends on its exact Prisma behavior.
- **Acceptance Criteria / Tests:**
  - Split `/api/jurisdictions` into a Prisma-safe base jurisdiction query plus a raw `official_domains` lookup and a separate current-pack lookup query.
  - Malformed or JSON-encoded `official_domains` values normalize to a stable string array without taking down the route.
  - A current-pack lookup failure logs a route-scoped warning and still returns jurisdictions with degraded pack context.
  - Add route regressions for valid pack serialization, malformed lineage normalization, malformed official domain normalization, and pack-query failure containment.
  - Re-run focused jurisdictions tests, the repo verification gate, and the live production `/api/jurisdictions` probe after push.
- **Evidence (2026-03-16):**
  - Reworked `apps/web/app/api/jurisdictions/route.ts` to exclude `officialDomains` from the base Prisma query, fetch raw `official_domains` text separately, and normalize arrays, JSON-array strings, double-encoded JSON strings, and Postgres array literals per jurisdiction.
  - Kept current-pack lookup best-effort and logged malformed official-domain payloads or pack lookup failures without collapsing the route.
  - Expanded `apps/web/app/api/jurisdictions/route.test.ts` to cover valid official-domain normalization, malformed official-domain fallback to `[]`, malformed lineage normalization, and pack-query failure containment.
  - Local verification passed: `pnpm -C apps/web test -- 'app/api/chat/conversations/[id]/route.test.ts' app/api/jurisdictions/route.test.ts app/reference/page.test.tsx`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
  - Production deployment `f78b352da8c72ca4883094e4d4992899062effe9` returned `200` for `/api/jurisdictions` with normalized `officialDomains`, and the follow-up `vercel logs --since 3m --status-code 500` window showed no new jurisdictions-route `500`s.

### MARKET-015 — Live EBR Building Permits Feed (P0)

- **Priority:** P0
- **Status:** Done (2026-03-13)
- **Scope:** Add a live East Baton Rouge building permits feed sourced from the BRLA Socrata dataset, expose it through an authenticated Market Intel API, render it with charts and tables in the web app, and repair the existing permits tool so chat and UI use the same real dataset contract.
- **Problem:** The repo has a Market Intel page and a `query_building_permits` tool, but the current permits path is not production-ready for a constant live feed: the tool still points at a placeholder dataset id, there is no dedicated authenticated API for BRLA permits, and users have no charts/tables surface for current East Baton Rouge permit activity.
- **Expected Outcome (measurable):**
  - Authenticated users can open a Market Intel permits page that refreshes automatically and shows current BRLA permit activity with summary cards, charts, and a recent-permits table.
  - The server route validates inputs and returns structured live aggregates from dataset `7fq7-8j7r`.
  - The `query_building_permits` tool uses the real BRLA field names and dataset id so chat and agent workflows can query the same live feed.
- **Evidence of need:** User explicitly requested a “constant live feed of building permits” from `https://data.brla.gov/Housing-and-Development/EBR-Building-Permits/7fq7-8j7r/about_data`. Direct metadata inspection confirms dataset `7fq7-8j7r` exposes real-time-friendly fields including `permitnumber`, `permittype`, `designation`, `projectdescription`, `projectvalue`, `issueddate`, `address`, `zip`, and contractor/owner attributes, while the current tool still defaults to `PLACEHOLDER_DATASET_ID`.
- **Alignment:** Extends the existing Market Intel surface, preserves auth and route validation patterns, reuses the repo’s chart/table primitives, and keeps external data access server-side with optional Socrata app-token support.
- **Risk/rollback:** Low-to-medium risk because the slice is additive. Rollback is limited to the new route/page and the Socrata tool contract if the external schema shifts.
- **Acceptance Criteria / Tests:**
  - Add a live permits API route with 401 auth rejection, 400 input validation, 200 happy path, and 500 upstream failure handling.
  - Render a dedicated permits dashboard page with at least cards, charts, and a recent-permits table, refreshing on an interval.
  - Fix `query_building_permits` to target the BRLA dataset id and real field names.
  - Add focused route/tool tests plus the full repo verification gate.
- **Evidence (2026-03-13):**
  - Added `apps/web/lib/services/buildingPermits.service.ts` to query BRLA dataset `7fq7-8j7r` server-side with live Socrata aggregates for totals, issued-date trend, designation mix, permit-type mix, ZIP concentration, and recent permits, plus optional `permitType` and `zip` filters for the dashboard.
  - Added authenticated route `apps/web/app/api/market/building-permits/route.ts` with Zod validation and explicit 401 / 400 / 500 handling, plus regression coverage in `apps/web/app/api/market/building-permits/route.test.ts`.
  - Added dashboard UI `apps/web/app/market/building-permits/page.tsx` with SWR polling, metric cards, Recharts panels, a searchable recent-permits table, and high-value permit cards; added sidebar entry + longest-prefix active-link fix in `apps/web/components/layout/Sidebar.tsx`.
  - Repaired `packages/openai/src/tools/socrataTools.ts` and added `packages/openai/src/tools/socrataTools.test.ts` so `query_building_permits` uses the live East Baton Rouge dataset id, real field names, and environment values read at execution time instead of module import time.
  - Added env documentation in `.env.example` and `apps/web/.env.example` for `SOCRATA_BASE_URL`, `SOCRATA_EBR_PERMITS_DATASET_ID`, and `SOCRATA_APP_TOKEN`.
  - Live smoke against `https://data.brla.gov/resource/7fq7-8j7r.json` confirmed the production SoQL filter shape for `designation = 'Commercial' AND permittype = 'Occupancy Permit (C)' AND zip = '70811'`, returning `permit_count = 6` with `latest_issued_date = 2026-03-09T00:00:00.000`.
  - Verification passed:
    - `pnpm -C apps/web test -- app/api/market/building-permits/route.test.ts lib/services/buildingPermits.service.test.ts`
    - `pnpm -C packages/openai test -- src/tools/socrataTools.test.ts`
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=placeholder pnpm build`

### MARKET-016 — Surface Live Permits On Market Hub (P0)

- **Priority:** P0
- **Status:** Done (2026-03-13)
- **Scope:** Integrate the live East Baton Rouge permits dashboard into `/market` so Market Intel users can access permits data from the primary market page instead of only the dedicated `/market/building-permits` route.
- **Problem:** The live permits feed now exists, but it is isolated on its own page. The main Market Intel hub at `/market` still centers on parish summaries and recent activity feeds, so users do not see permit charts/tables unless they already know to navigate to the separate route.
- **Expected Outcome (measurable):**
  - `/market` exposes the live permits dashboard inside the Market Intel interface.
  - The integration reuses the existing live permits UI contract rather than maintaining a second divergent permit dashboard.
  - Visibility is covered by at least one dashboard-level assertion in addition to the existing route/service/tool tests.
- **Evidence of need:** User explicitly requested that “the building permit data should be added to the https://gallagherpropco.com/market page”.
- **Alignment:** Keeps Market Intel as the single hub for market data, avoids duplicated permit-dashboard logic, and reuses the authenticated BRLA permits feed already implemented in `MARKET-015`.
- **Risk/rollback:** Low risk because the change is additive and can fall back to the dedicated permits page if the hub integration regresses.
- **Acceptance Criteria / Tests:**
  - Add a permits entry point or tab directly on `/market`.
  - Reuse the existing live permits dashboard content rather than copy-pasting a second implementation.
  - Add focused UI coverage confirming the Market page exposes the permits dashboard.
  - Re-run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence (2026-03-13):**
  - Added shared component `apps/web/components/market/BuildingPermitsDashboard.tsx` so the live BRLA permits dashboard can render both on `/market/building-permits` and inside the main Market Intel hub without duplicating the permits UI logic.
  - Updated `apps/web/app/market/building-permits/page.tsx` to wrap the shared permits dashboard in `DashboardShell`, preserving the dedicated route while making the dashboard reusable.
  - Updated `apps/web/app/market/page.tsx` to advertise live permit intelligence in the market-page intro copy, add a `Live Permits` tab, and render the shared permits dashboard inline on `/market`.
  - Added focused UI coverage in `apps/web/app/market/page.test.tsx` and `apps/web/components/market/BuildingPermitsDashboard.test.tsx` for the market-page entry point and embedded permits dashboard rendering.
  - Verification passed:
    - `pnpm -C apps/web test -- app/market/page.test.tsx components/market/BuildingPermitsDashboard.test.tsx app/api/market/building-permits/route.test.ts lib/services/buildingPermits.service.test.ts`
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=placeholder pnpm build`

### PLAT-001 — Opportunity OS Generalization Program (P1)

- **Priority:** P1
- **Status:** Done (2026-03-11)
- **Scope:** Generalize the repo from an entitlement-focused operating system into a multi-tenant CRE opportunity platform that supports acquisition, development, entitlement, leasing, asset-management, refinance, disposition, and portfolio-review workflows.
- **Problem:** The platform layer is already broad, but the domain model is still hard-coded around entitlement-era assumptions: fixed SKUs, entitlement-specific deal statuses, parcel-first deal structure, and automation/tooling that treat zoning/parish-pack/triage work as the default operating model.
- **Expected Outcome (measurable):**
  - `Deal` classification and workflow state are generalized beyond the current `sku` and entitlement-only `status` enums.
  - Assets/properties, parcels, workflows, scorecards, and stage histories support non-entitlement opportunity types without breaking current entitlement flows.
  - Agents, tools, APIs, and UI surfaces route by opportunity type and workflow template rather than assuming every deal is an entitlement flip.
- **Evidence of need:** The current spec still defines deals as “an entitlement flip effort” and treats three entitlement SKUs as non-negotiable. The current Prisma schema encodes that same assumption via `sku_type` and entitlement lifecycle statuses, even though the repo already contains broader CRE models such as financing, tenants, leases, development budgets, title, survey, and risk tracking.
- **Alignment:** Preserves existing org-scoping, auth, gateway-only property DB access, strict shared-schema validation, and current entitlement functionality by making entitlements one module within a broader platform rather than removing them.
- **Risk/rollback:** High scope and migration risk if attempted as a rewrite. The required approach is additive schema evolution, compatibility facades, dual-read/dual-write phases, and delayed deprecation of legacy entitlement contracts.
- **Acceptance Criteria / Tests:**
  - Check in a repo-specific implementation roadmap that defines concrete schema, API, agent/tool, UI/automation, and migration phases for platform generalization.
  - Use additive migration sequencing that keeps current entitlement workflows operational during rollout.
  - Future implementation slices validate legacy compatibility plus generalized flows with route tests, agent/tool contract tests, and the full repo verification gate.
- **Implementation plan:** `docs/OPPORTUNITY_OS_GENERALIZATION_ROADMAP.md`
- **Evidence (2026-03-11):**
  - Phase 1 additive schema introduction completed in `packages/db/prisma/schema.prisma`, `packages/shared/src/enums.ts`, `packages/shared/src/schemas/opportunityGeneralization.ts`, and `packages/shared/src/schemas/index.ts`.
  - Added additive migration `packages/db/prisma/migrations/20260311210100_add_opportunity_os_generalization_schema/migration.sql`.
  - Added prerequisite migration-history repair `packages/db/prisma/migrations/20260311205900_backfill_schema_parity/migration.sql` so Prisma shadow and verification flows could replay prior schema state cleanly before the Phase 1 diff.
  - Phase 3 API compatibility facade completed in `apps/web/app/api/deals/route.ts`, `apps/web/app/api/deals/[id]/route.ts`, `apps/web/app/api/deals/[id]/screen/route.ts`, `apps/web/app/api/workflows/route.ts`, `apps/web/app/api/workflows/[id]/route.ts`, `apps/web/app/api/assets/route.ts`, `apps/web/app/api/assets/[id]/route.ts`, `apps/web/app/api/_lib/opportunityPhase3.ts`, and `packages/shared/src/schemas/opportunityPhase3.ts`.
  - Phase 3 preserved legacy `/api/deals` and `/api/deals/[id]/triage` behavior while adding generalized dual-write fields, the `/screen` compatibility endpoint, workflow/asset APIs, and org-scoped route coverage in the corresponding Vitest route suites.
  - Phase 6 compatibility sunset completed in `packages/db/prisma/schema.prisma`, `apps/web/app/api/deals/route.ts`, `apps/web/app/api/deals/[id]/route.ts`, `apps/web/app/api/_lib/opportunityPhase3.ts`, `apps/web/lib/automation/context.ts`, `apps/web/lib/automation/intake.ts`, `apps/web/lib/automation/triage.ts`, `apps/web/lib/automation/advancement.ts`, `apps/web/lib/automation/buyerOutreach.ts`, `apps/web/lib/automation/artifactAutomation.ts`, `apps/web/lib/automation/entitlementStrategy.ts`, `apps/web/lib/automation/knowledgeCapture.ts`, `apps/web/lib/automation/outcomeCapture.ts`, `packages/openai/src/agents/coordinator.ts`, `packages/openai/src/tools/dealTools.ts`, and `docs/LEGACY_CLEANUP_CANDIDATES.md`.
  - Phase 6 moved canonical writes to generalized workflow fields (`workflowTemplateKey`, `currentStageKey`, `assetClass`, `strategy`) while keeping `sku`/`status` on compatibility-only read paths derived by mapper functions so entitlement deals continue to resolve through the `ENTITLEMENT_LAND` template.
  - Verification passed:
    - `pnpm prisma generate`
    - `pnpm prisma migrate dev --name add-opportunity-os-generalization-schema`
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `pnpm build`
    - Manual `POST /api/deals` verification through a local Next dev server plus mock gateway confirmed entitlement create requests forward canonical `workflowTemplateKey=ENTITLEMENT_LAND` and `currentStageKey=ORIGINATION` while echoing compatibility `sku=SMALL_BAY_FLEX` and `status=INTAKE`.

### MEM-001 — Coordinator Memory Tool Invocation Fix (P0)

- **Priority:** P0
- **Status:** Done (2026-03-02)
- **Scope:** Fix root causes preventing the coordinator from invoking memory tools during chat
- **Problem:** Coordinator model did not invoke `lookup_entity_by_address` or `ingest_comps` because `filterToolsForIntent` stripped them (not in BASE_ALLOWED_TOOLS). Enforcement reminder incorrectly told the model to call `store_memory` for lookups.
- **Root causes fixed:**
  1. `lookup_entity_by_address` and `ingest_comps` added to BASE_ALLOWED_TOOLS
  2. `hasAddressMemoryLookup` now counts `lookup_entity_by_address` (primary recall tool)
  3. Enforcement reminder corrected: use `lookup_entity_by_address` for lookups, never `store_memory`
  4. `/api/entities/lookup` now passes request to `resolveAuth(req)` for agent-tool auth
  5. `resolveAuth` accepts MEMORY_TOOL_SERVICE_TOKEN, LOCAL_API_KEY, COORDINATOR_TOOL_SERVICE_TOKEN for coordinator-memory bypass
- **Evidence:** Deployed to production. Manual verification: send "What do we know about 6883 Airline Hwy, Baton Rouge, LA 70805?" and confirm `lookup_entity_by_address` is invoked (check Vercel logs for `[agent-tool] lookup_entity_by_address`).

### GATE-001 — Repository Verification Gate Stabilization Baseline Cleanup (P0)

- **Priority:** P0
- **Status:** Done (2026-02-25)
- **Scope:** Monorepo gate stabilization for lint/typecheck/test baseline cleanup
- **Problem:** The repo-level verification baseline is not currently stable, which blocks roadmap-first implementation flow and makes unrelated feature work fail mandatory gates.
- **Expected Outcome (measurable):**
  - `pnpm lint` passes at repo root with zero errors.
  - `pnpm typecheck` passes at repo root with zero errors.
  - `pnpm test` passes at repo root with zero failing suites.
  - Engineers can run the full verification gate without unrelated baseline failures.
- **Evidence of need:** Active/completed roadmap execution notes already record baseline instability, including: full repo lint/typecheck/test failures outside DI-001 scope and repeated `pnpm typecheck` blockers in SDK items due to pre-existing worker errors.
- **Alignment:** Directly enforces the roadmap-first + mandatory verification protocol, improves delivery reliability, and does not alter security invariants (`org_id` scoping, auth checks, strict schema validation).
- **Risk/rollback:** Medium risk due to broad touch surface across workspaces; rollback by reverting offending cleanup commits per package and restoring last known passing subset while preserving security and validation guarantees.
- **Acceptance Criteria / Tests:**
  - Resolve existing baseline lint/typecheck/test failures without weakening validation, auth, or org-scoping protections.
  - Document fixed failure classes and touched packages in completion evidence.
  - Full verification gate commands pass from repo root:
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `pnpm build`
- **Evidence (2026-02-25):**
  - Fixed lint blocker: removed stale inline ESLint rule directive in `apps/web/components/chat/ChatContainer.tsx`.
  - Added/updated gateway + property-db tool contract hardening and response parsing coverage in `packages/openai/src/tools/*`.
  - Reworked deals API route test baselines to current route behavior:
    - `apps/web/app/api/deals/route.test.ts`
    - `apps/web/app/api/deals/[id]/route.test.ts`
  - Verification gate passed at repo root:
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `pnpm build`

### DI-001 — Document Intelligence Agent Integration Upgrade (P0)

- **Priority:** P0
- **Status:** Done
- **Scope:** Document extraction-to-agent bridge, schema expansion, and OCR fallback
- **Problem:** Extracted document intelligence is not fully available to agent toolchains, and scanned PDFs can produce low-text extraction quality.
- **Expected Outcome (measurable):**
  - Agents can query, summarize, and compare document extractions through dedicated tool functions.
  - `rent_roll` and `trailing_financials` are supported end-to-end in validation and UI schema layers.
  - Scanned PDFs trigger OCR fallback, improving extraction coverage for image-based uploads.
- **Evidence of need:** `updates/gpc-cres-code-updates.pdf` specifies required bridge work and patch set for document intelligence integration.
- **Alignment:** Preserves org-scoped access patterns, strict schema validation, and existing extraction service flow.
- **Risk/rollback:** Medium integration risk due to prompt/schema/service touchpoints; rollback by reverting new tool registrations and OCR fallback block.
- **Acceptance Criteria / Tests:**
  - Add `packages/openai/src/tools/documentTools.ts` with: `query_document_extractions`, `get_document_extraction_summary`, `compare_document_vs_deal_terms`.
  - Wire document tools in `packages/openai/src/tools/index.ts` and relevant agent tool arrays.
  - Update `packages/openai/src/agents/finance.ts` and `packages/openai/src/agents/dueDiligence.ts` with document-intelligence protocol instructions.
  - Add `rent_roll` and `trailing_financials` schemas in:
    - `apps/web/lib/validation/extractionSchemas.ts`
    - `apps/web/lib/schemas/extractionSchemas.ts`
  - Patch `apps/web/lib/services/documentProcessing.service.ts` for:
    - enhanced classification rules
    - extraction prompts for new doc types
    - OCR fallback via `ocrPdfBuffer`
  - Add `tesseract.js` dependency in the app workspace handling document processing.
  - Verification gate passes: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- **Evidence (2026-02-25):**
  - Implemented files:
    - `packages/openai/src/tools/documentTools.ts`
    - `packages/openai/src/tools/index.ts`
    - `packages/openai/src/agents/finance.ts`
    - `packages/openai/src/agents/dueDiligence.ts`
    - `apps/web/lib/validation/extractionSchemas.ts`
    - `apps/web/lib/schemas/extractionSchemas.ts`
    - `apps/web/lib/services/documentProcessing.service.ts`
    - `apps/web/package.json`
    - `pnpm-lock.yaml`
  - Feature-focused tests passing:
    - `pnpm --filter @entitlement-os/openai test -- src/tools/documentTools.test.ts`
    - `pnpm --filter gpc-agent-dashboard test -- lib/schemas/extractionSchemas.test.ts lib/validation/extractionSchemas.test.ts`
  - Full build passing:
    - `pnpm build`
  - Full repo lint/typecheck/test currently fail on pre-existing unrelated issues outside this change set (details captured in execution log).

### EOS-SKL-001 — Skills + Shell + Compaction Architecture

- **Priority:** P0
- **Status:** Done (2026-03-04)
- **Scope:** Modularize large guidance docs into on-demand Skills, add shell-backed compute workflows, and enable default server-side compaction with response chaining.
- **Problem:** Monolithic prompt docs and non-compacted response context increase token waste and reduce context reliability for long entitlement workflows.
- **Execution Gate Status (2026-03-04):**
  - **Phase 1 (Skills Artifacts):** PASS — required markdown structure, routing criteria, examples, and validation sections present.
  - **Phase 2 (Shell Workflows):** PASS — `pnpm --filter @entitlement-os/openai test -- src/__tests__/shell.test.ts` passes.
  - **Phase 3A/3C (Responses Compaction + Chaining):** PASS — `pnpm --filter @entitlement-os/openai test -- src/__tests__/compaction.test.ts` passes.
  - **Phase 3B (Temporal Chain State):** PASS — chain state persistence and fallback restoration are implemented across worker and web resume paths (`apps/worker/src/activities/openai.ts`, `packages/shared/src/temporal/types.ts`, `packages/shared/test/temporal-contract.test.ts`, `apps/web/lib/agent/agentRunner.ts`).
  - **Phase 4 (Integration Docs):** PASS — `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/backend.mdc`, and `docs/SKILLS_ARCHITECTURE.md` are present.
  - **Verification Sequence (5 steps):**
    - `pnpm lint` passes.
    - `pnpm typecheck` passes.
    - `pnpm test` passes.
    - `pnpm build` passes.
    - `git diff --stat` confirms intended edits in this item plus related compaction/chain tests and contracts.
- **Evidence (2026-03-04):**
  - Gate script: `python3 - <<'PY' ... Phase1 gate: PASS`.
  - Shell test command output: `✓ src/__tests__/shell.test.ts (7 tests) 49ms`.
  - Compaction test command output: `✓ src/__tests__/compaction.test.ts (6 tests) 13ms`.
  - Temporal contract test output: `✓ test/temporal-contract.test.ts (2 tests)`.
- **Expected Outcome (measurable):**
  - `skills/` includes one `README.md`, 6 core SKILL docs, and 7 entitlement phase SKILL files.
  - Shell workflows execute compute-heavy CRE tasks with narrowly scoped network allowlists.
  - Compaction is default-on in Responses calls; `response_id` and `previous_response_id` are preserved for chaining.
- **Evidence of need:** Current Entitlement OS phase execution and openai wrapper contract require lower-context, sequence-safe chaining for long-horizon multi-step runs.
- **Alignment:** Preserves org scoping, auth, and strict JSON validation while shifting to on-demand domain instructions and safer shell/network posture.
- **Risk/rollback:** Medium — response call contract and workflow orchestration are newly introduced; rollback by reverting shell/compaction modules and preserving previous wrapper behavior.
- **Acceptance Criteria / Tests:**
  - [x] `skills/` directory exists with:
    - `skills/README.md`
    - `skills/underwriting/SKILL.md`
    - `skills/entitlement-os/SKILL.md`
    - `skills/entitlement-os/phases/phase-a-discovery.md`
    - `skills/entitlement-os/phases/phase-b-zoning-analysis.md`
    - `skills/entitlement-os/phases/phase-c-financial-modeling.md`
    - `skills/entitlement-os/phases/phase-d-risk-assessment.md`
    - `skills/entitlement-os/phases/phase-e-offer-generation.md`
    - `skills/entitlement-os/phases/phase-f-due-diligence.md`
    - `skills/entitlement-os/phases/phase-g-closing.md`
    - `skills/market-trajectory/SKILL.md`
    - `skills/property-report/SKILL.md`
    - `skills/data-extraction/SKILL.md`
    - `skills/parcel-ops/SKILL.md`
  - [x] `docs/SKILLS_ARCHITECTURE.md` exists and documents routing/compaction model.
  - [x] `packages/openai/src/network-policies.ts` exists with named policy constants.
  - [x] `packages/openai/src/shell.ts` and `packages/openai/src/shell-workflows/` provide safe workflow execution with filesystem artifacts.
  - [x] `packages/openai/src/__tests__/shell.test.ts` and `packages/openai/src/__tests__/compaction.test.ts` verify new behavior.
  - [x] `AGENTS.md` includes section 17 for skills, shell, and compaction.
  - [x] `CLAUDE.md` includes skill routing instructions.
  - [x] Compaction defaults and chaining are enabled in `packages/openai/src/responses.ts` and stored in Temporal-facing workflow state.
  - [x] Final verification protocol passes:
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `pnpm build`
- **Evidence (2026-03-04):**
  - `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/backend.mdc`, and `docs/SKILLS_ARCHITECTURE.md` updated.
  - `skills/` and shell modules are in this branch, with checklists and policy constants in place.
  - `packages/openai/src/responses.ts`, `apps/worker/src/activities/openai.ts`, `packages/shared/src/temporal/types.ts`, `packages/shared/test/temporal-contract.test.ts`, and `apps/web/lib/agent/agentRunner.ts` updated for chain-state continuity.

### MOD-001 — API Unification: Remove chat.completions (P0-A)

- **Priority:** P0
- **Status:** Done (2026-03-04)
- **Problem:** 5 `chat.completions.create` calls remained across artifact generation, document processing, and daily briefing services, fragmenting the OpenAI integration pattern.
- **Evidence:** `rg "chat.completions.create" apps/ packages/` returned 5 matches pre-migration.
- **Expected Outcome:** Zero `chat.completions.create` references; all LLM calls use Responses API via shared wrappers.
- **Acceptance:** `rg "chat.completions.create" apps/ packages/` returns zero matches.
- **Files Changed:** `packages/openai/src/responses.ts` (added `createTextResponse` wrapper), `apps/web/lib/services/daily-briefing.service.ts`, `apps/web/lib/services/documentProcessing.service.ts`, `apps/web/app/api/deals/[id]/artifacts/route.ts`, `packages/openai/src/tools/artifactTools.ts`
- **Evidence (2026-03-04):** `rg "chat.completions.create" apps/ packages/` → zero matches. All 5 call sites migrated to `createTextResponse`.

### MOD-002 — Tool Catalog + Consult Execution (P0-B)

- **Priority:** P0
- **Status:** Done (2026-03-04)
- **Problem:** No canonical tool metadata registry; consult tools returned stubs instead of real specialist output.
- **Evidence:** `rg "not yet wired" apps/web/lib/agent/toolRegistry.ts` returned 4 stub matches.
- **Expected Outcome:** Single-source tool catalog with routing/risk/quota metadata; consult tools execute real specialist agents.
- **Acceptance:** Tool catalog module exists; `rg "not yet wired" toolRegistry.ts` returns zero matches; consult tools call `createIntentAwareCoordinator` + `run`.
- **Files Changed:** `packages/openai/src/tools/toolCatalog.ts` (new), `packages/openai/src/tools/index.ts`, `apps/web/lib/agent/toolRegistry.ts`
- **Evidence (2026-03-04):** Stubs removed, consult tools now lazy-import `createIntentAwareCoordinator` and execute specialist agents with `maxTurns: 3`.

### MOD-003 — Hosted Tools Quota Enforcement (P1-A)

- **Priority:** P1
- **Status:** Done (2026-03-04)
- **Problem:** No per-conversation limit enforcement on metered hosted tools (web_search_preview); could exhaust API budget.
- **Evidence:** `AUTOMATION_CONFIG.hostedTools.webSearchMaxCallsPerConversation = 10` existed but was not enforced.
- **Expected Outcome:** Quota module tracks and rejects calls exceeding configured limits; clear failure events on quota exceeded.
- **Acceptance:** `checkHostedToolQuota` function enforces limits; `_resetAllQuotas` available for testing; module exported from `@entitlement-os/openai`.
- **Files Changed:** `packages/openai/src/tools/hostedToolQuota.ts` (new), `packages/openai/src/tools/index.ts`

### MOD-004 — MCP Gateway Adapter (P1-B)

- **Priority:** P1
- **Status:** Done (2026-03-04)
- **Problem:** Gateway tool routing is hardcoded; no path to MCP-based tool serving.
- **Evidence:** All gateway tools routed via direct HTTP POST with no abstraction layer.
- **Expected Outcome:** MCP adapter with `OPENAI_MCP_GATEWAY_ENABLED` feature flag; direct gateway fallback when disabled; auth boundary preserved.
- **Acceptance:** `isMcpGatewayEnabled()`, `buildMcpServerTool()`, `resolveToolTransport()` functions exist; MCP server URL allowlist enforced.
- **Files Changed:** `packages/openai/src/tools/mcpGatewayAdapter.ts` (new), `packages/openai/src/tools/index.ts`

### MOD-005 — Stream/Transport Event Unification (P2)

- **Priority:** P2
- **Status:** Done (2026-03-04)
- **Problem:** Stream event types duplicated across SSE (`apps/web/lib/chat/streamEventTypes.ts`) and WS (`infra/cloudflare-agent/src/types.ts`) paths with mismatched field definitions.
- **Evidence:** `WorkerEvent` in CF Worker types lacked `tool_approval_requested`, `handoff`, `agent_progress` events present in SSE path.
- **Expected Outcome:** Single canonical event contract in shared package used by both transports.
- **Acceptance:** `packages/shared/src/types/streamEvents.ts` exists with `UniversalStreamEvent` and `AgentStreamEvent` union types; `UNIVERSAL_EVENT_TYPES` set exported.
- **Files Changed:** `packages/shared/src/types/streamEvents.ts` (new), `packages/shared/src/index.ts`

### MOD-006 — Responses Metadata Hardening (Phase 4 Continuation)

- **Priority:** P1
- **Status:** Done (2026-03-04)
- **Problem:** `createStrictJsonResponse` metadata extraction only returned minimal model/status/usage summary, dropping high-value modern Responses fields needed for cost diagnostics, cache observability, and tool provenance.
- **Evidence:** `packages/openai/src/responses.ts` previously emitted metadata without service tier, prompt cache key, timing fields, and web source snippets/titles.
- **Expected Outcome:** Metadata includes normalized runtime and cache fields (`serviceTier`, `promptCacheKey`, `parallelToolCalls`, `temperature`, `topP`, `background`, `safetyIdentifier`, timestamps, `maxToolCalls`) with backward-compatible shape and stable tool source enrichment.
- **Acceptance:** `extractResponseMetadata` emits normalized phase-4 fields when present; `extractToolSources` preserves web source `title` and `snippet`; compaction tests lock these fields.
- **Files Changed:** `packages/openai/src/responses.ts`, `packages/openai/src/__tests__/compaction.test.ts`
- **Evidence (2026-03-04):**
  - `pnpm lint` passes.
  - `pnpm typecheck` passes.
  - `pnpm test` passes.
  - `OPENAI_API_KEY=sk-placeholder pnpm build` passes.

### INFRA-005 — Maximize Local Server Utilization (4-Phase Plan)

- **Priority:** P1
- **Status:** Done (2026-02-26)
- **Scope:** Expose full capability of the local Windows 11 Docker stack to the agent layer — caching, batch screening, WebSocket push streaming, and Qdrant property intelligence.
- **Problem:** Four capability gaps existed between what the local Docker stack could do and what the agent layer exposed: every gateway call was a fresh HTTP round-trip (no caching), portfolio screening called `screen_full` N times sequentially, no external process could push real-time status into an active browser session, and agents had no semantic property recall across conversations.
- **Expected Outcome (measurable):**
  - Same-parcel gateway calls return from TTL cache (2-3x faster).
  - `screen_batch` fans out up to 20 parcels at 5 concurrent workers with results keyed by parcel ID.
  - Any server-side process can push `operation_progress`/`operation_done`/`operation_error` events into the active browser WebSocket session.
  - Agents can store and semantically recall property screening findings across conversations.
- **Files Changed:**
  - `packages/openai/src/tools/propertyDbTools.ts` — TTL cache in `gatewayPost()`, `screen_batch` tool with push streaming
  - `packages/openai/src/tools/concurrency.ts` — `runWithConcurrency` shared utility
  - `packages/openai/src/tools/index.ts` — `screen_batch` wired into coordinator/due-diligence/research tool sets
  - `infra/cloudflare-agent/src/types.ts` — `operation_progress`, `operation_done`, `operation_error` WorkerEvent types
  - `infra/cloudflare-agent/src/durable-object.ts` — `/push` fetch handler in DO
  - `infra/cloudflare-agent/src/index.ts` — `/push` routing in Worker entry (regex `/{conversationId}/push`)
  - `apps/web/lib/chat/useAgentWebSocket.ts` — browser handlers for new `operation_*` event types
  - `packages/openai/src/agentos/config.ts` — `property_intelligence` collection registered
  - `packages/openai/src/agentos/memory/property.ts` — `PropertyIntelligenceStore` with `createIfNotExists` guard
  - `packages/openai/src/tools/propertyMemoryTools.ts` — `recall_property_intelligence` + `store_property_finding` tools
- **Completion Evidence (2026-02-26):**
  - ✅ Phase 1 — Gateway caching: 2.62x speedup on cache hits (1,727ms → 659ms), `cacheBust` param verified
  - ✅ Phase 2 — Batch screening: 3-parcel batch in 150–200ms, results keyed by parcel ID, per-parcel `operation_progress` events pushed, `operation_done` on completion
  - ✅ Phase 3 — WebSocket push: `/{conversationId}/push` live on `agents.gallagherpropco.com`, progress/done/error events accepted and delivered to active sessions
  - ✅ Phase 4 — Qdrant property intelligence: Tunnel `qdrant.gallagherpropco.com → http://qdrant:6333` live, Qdrant v1.17.0 responding, `QDRANT_URL` + all `AGENTOS_*` flags deployed to Vercel production, `property_intelligence` collection auto-provisioned on first use
  - ✅ All 5 production verification tests passed (see `docs/archive/2026-03-20-root-cleanup/PRODUCTION_VERIFICATION_REPORT.md`)
  - ✅ Build: `pnpm build` clean, 668/668 tests passing

### INFRA-006 — Gateway Contract Alignment + Runtime Smoke Matrix (P0)

- **Priority:** P0
- **Status:** Done (2026-03-05)
- **Scope:** Align web/server/tool call paths with current `infra/local-api/main.py` gateway contracts and produce a reproducible smoke matrix for map, deals, parcels, screening, and health endpoints.
- **Problem:** Multiple call sites still reference legacy paths/methods (`/property-db/rpc/*`, `/admin/health`) that no longer match live gateway routes, causing silent fallbacks or hard failures in map and automation flows.
- **Expected Outcome (measurable):**
  - All affected call sites use currently supported gateway endpoints and payload contracts.
  - Route tests cover the compatibility logic for changed paths.
  - A runnable smoke suite verifies listed endpoint categories against live local gateway.
- **Evidence of need:** Live gateway scan (`infra/local-api/main.py`) confirms supported paths (`/health`, `/tools/*`, `/api/parcels/*`, `/api/screening/*`) and excludes legacy `/property-db/rpc/*`/`/admin/health` paths.
- **Alignment:** Preserves org-scoped auth requirements and fails closed when gateway credentials are missing; no weakening of schema or tenancy boundaries.
- **Risk/rollback:** Low-medium; route behavior changes are isolated to gateway transport wrappers and map/health integration points. Rollback by reverting INFRA-006 commits if downstream compatibility regressions surface.
- **Acceptance Criteria / Tests:**
  - Update affected callers to prefer current endpoints and safe compatibility fallback behavior.
  - Add/adjust unit tests for changed route/service behavior (auth + validation + happy path).
  - Run verification and smoke checks with explicit pass/fail evidence for endpoint families:
    - deals
    - parcels/search + geometry
    - screening
    - map prospect/comps/tiles
    - health
- **Evidence (2026-03-05):**
  - Updated call-path contracts to current gateway endpoints:
    - `apps/web/app/api/map/comps/route.ts`
    - `apps/web/app/api/health/route.ts`
    - `apps/web/lib/services/saved-search.service.ts`
    - `apps/web/lib/jobs/opportunity-scanner.job.ts`
  - Added/updated route + service tests for compatibility and auth/header behavior:
    - `apps/web/app/api/map/comps/route.test.ts`
    - `apps/web/app/api/health/route.test.ts`
    - `apps/web/lib/services/saved-search.service.test.ts`
    - `apps/web/lib/jobs/opportunity-scanner.job.test.ts`
    - `apps/web/app/api/deals/route.test.ts`
    - `apps/web/app/api/deals/[id]/route.test.ts`
    - `apps/web/app/api/map/isochrone/route.test.ts`
    - `apps/web/app/api/geofences/route.test.ts`
    - `apps/web/app/api/geofences/[id]/route.test.ts`
    - `apps/web/app/api/memory/ingest/route.test.ts`
  - Verification gate passed:
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=sk-placeholder pnpm build`

### INFRA-007 — Gateway-Only Parcel Runtime + Health Truthfulness (P0)

- **Priority:** P0
- **Status:** Done (2026-03-05)
- **Scope:** Make parcel/property runtime surfaces fail closed unless the gateway-to-local-server path is configured and healthy, update health/ops reporting to treat that path as the only valid authoritative parcel/property backend, and sync smoke/docs to the same contract.
- **Problem:** Production parcel/property behavior is intended to be gateway-only, but some routes still fall back to org-scoped Prisma/dev parcel paths and health/ops surfaces still treat `DATABASE_URL` as a meaningful production parcel/property signal. That leaves operators with misleading green states and lets runtime surfaces degrade into alternate backends instead of failing explicitly when the local-server path is unavailable.
- **Expected Outcome (measurable):**
  - Parcel/property routes that depend on gateway-backed local Postgres return explicit `503`/`502` gateway errors when the gateway path is unavailable instead of falling back to Prisma/dev parcel data.
  - Health and ops surfaces report parcel/property readiness from the gateway/local-server path, not from placeholder direct DB env presence.
  - Smoke scripts and docs describe and verify the authoritative split accurately: local Postgres via gateway for authoritative data, Qdrant for semantic recall.
- **Evidence of need:** `apps/web/app/api/map/prospect/route.ts` still returns fallback parcel data when gateway config is unavailable or upstream calls fail; `apps/web/app/api/health/route.ts` and `apps/web/lib/automation/ops.ts` still require `DATABASE_URL` as a critical production signal even though parcel/property runtime is intended to be gateway/local-server authoritative.
- **Alignment:** Enforces the user's strict local-server-first parcel/property requirement, preserves auth/org scoping, and keeps Qdrant limited to semantic retrieval rather than authoritative records.
- **Risk/rollback:** Medium. User-visible parcel/property routes may return explicit gateway errors where they previously returned degraded fallback data. Rollback by restoring previous fallback branches if operations require temporary degraded reads.
- **Acceptance Criteria / Tests:**
  - `apps/web/app/api/health/route.ts`, `apps/web/app/api/health/detailed/route.ts`, and `apps/web/lib/automation/ops.ts` classify parcel/property DB mode as gateway/direct/unconfigured and no longer treat placeholder `DATABASE_URL` as sufficient for parcel/property health.
  - `apps/web/app/api/map/prospect/route.ts`, `apps/web/app/api/parcels/route.ts`, and `apps/web/app/api/parcels/[parcelId]/geometry/route.ts` fail closed with explicit gateway error payloads when gateway config is missing or upstream calls fail.
  - Focused tests cover health auth + db-mode reporting, ops health evaluation, and parcel/property fail-closed route behavior.
  - Smoke scripts verify gateway-backed parcel/property endpoints plus Qdrant semantic recall without relying on legacy compatibility paths.
  - Docs explicitly state that authoritative parcel/property/exact knowledge data lives in local Postgres via gateway and semantic recall lives in Qdrant.
- **Completion Evidence (2026-03-05):**
  - `pnpm -C apps/web test -- app/api/health/route.test.ts __tests__/api/health-detailed.test.ts lib/automation/__tests__/ops.test.ts` passed (38 tests) after the gateway-only DB-mode/reporting changes in `apps/web/app/api/health/route.ts`, `apps/web/app/api/health/detailed/route.ts`, and `apps/web/lib/automation/ops.ts`.
  - `pnpm -C apps/web test -- app/api/parcels/route.test.ts app/api/map/prospect/route.post.test.ts 'app/api/parcels/[parcelId]/geometry/route.test.ts'` passed (23 tests) after the parcel/property routes were changed to fail closed with `GATEWAY_UNCONFIGURED` / `GATEWAY_UNAVAILABLE` instead of falling back to Prisma/dev geometry data.
  - `scripts/smoke_endpoints.ts`, `scripts/smoke_gateway_edge_access.ts`, and `scripts/verify-production-features.sh` now separate gateway-backed Postgres checks from semantic/Qdrant checks and require authenticated app access for the semantic tool smoke path.
  - `README.md`, `docs/SPEC.md`, `docs/CLOUDFLARE.md`, `docs/PRD_ZERO_COST_LOCAL_COMPUTE.md`, and `docs/claude/reference.md` now document the authoritative split explicitly: local Postgres via gateway/Hyperdrive for parcel/property and exact knowledge data, Qdrant for semantic recall only.
- **Files Expected To Change:**
  - `ROADMAP.md`
  - `apps/web/app/api/health/route.ts`
  - `apps/web/app/api/health/route.test.ts`
  - `apps/web/app/api/health/detailed/route.ts`
  - `apps/web/__tests__/api/health-detailed.test.ts`
  - `apps/web/lib/automation/ops.ts`
  - `apps/web/lib/automation/__tests__/ops.test.ts`
  - `apps/web/app/api/map/prospect/route.ts`
  - `apps/web/app/api/map/prospect/route.post.test.ts`
  - `apps/web/app/api/parcels/route.ts`
  - `apps/web/app/api/parcels/route.test.ts`
  - `apps/web/app/api/parcels/[parcelId]/geometry/route.ts`
  - `apps/web/app/api/parcels/[parcelId]/geometry/route.test.ts`
  - `scripts/smoke_endpoints.ts`
  - `scripts/smoke_gateway_edge_access.ts`
  - `scripts/verify-production-features.sh`
  - `README.md`
  - `docs/SPEC.md`
  - `docs/CLOUDFLARE.md`
  - `docs/PRD_ZERO_COST_LOCAL_COMPUTE.md`
  - `docs/claude/reference.md`

### KA-001 — Internal Knowledge Agent (5-Workstream Wiring) (P0)

- **Priority:** P0
- **Status:** Done (2026-03-02)
- **Scope:** Wire the fully-implemented knowledge base service, auto-embed verified facts, add buyer/seller comp metadata, register deal outcome capture, and replace O(n) JS fuzzy matching with pg_trgm.
- **Problem:** Five capability gaps existed between implemented services and the agent layer: (1) `search_knowledge_base` and `store_knowledge_entry` were stubs returning fake JSON, (2) verified facts from `memoryWriteGate` were never embedded into the semantic knowledge base, (3) `CompPayloadSchema` lacked buyer/seller/address fields and `decomposeCompToFacts()` never pushed transaction_parties, (4) `knowledgeCapture.ts` (deal outcome recording) may not have been registered in the event handler, and (5) `EntityResolutionService.findFuzzyMatch()` fetched all entities into JS for Jaccard similarity — O(n) full table scan.
- **Expected Outcome (measurable):**
  - Coordinator can search and store institutional knowledge via real API routes backed by `knowledgeBase.service.ts`.
  - Verified memory facts are auto-embedded into `knowledge_embeddings` for semantic retrieval.
  - Comp ingestion captures buyer, seller, and address metadata; `transaction_parties` fact type decomposed.
  - Deal outcome capture fires on `deal.statusChanged` (EXITED/KILLED).
  - Address fuzzy matching uses `pg_trgm` GIN index with `similarity()` SQL — O(1) index lookup instead of O(n) JS loop.
- **Files Changed:**
  - `apps/web/app/api/knowledge/route.ts` — Unified GET (search/recent/stats) + POST (ingest/delete) route backed by `knowledgeBase.service.ts`
  - `packages/openai/src/tools/knowledgeTools.ts` — Replaced stub execute bodies with real fetch calls to `/api/knowledge`
  - `apps/web/app/api/memory/write/route.ts` — Post-write embed hook: auto-ingest verified facts via `ingestKnowledge()`
  - `apps/web/lib/schemas/memoryWrite.ts` — Added `buyer`, `seller`, `address` to `CompPayloadSchema`
  - `packages/server/src/services/memory-ingestion.service.ts` — Added `transaction_parties` fact decomposition + replaced `findFuzzyMatch()` with `similarity()` SQL
  - `packages/shared/src/types/memory.ts` — Added `transaction_parties: 'dynamic'` to `FACT_TYPE_VOLATILITY`
  - `packages/openai/src/tools/memoryTools.ts` — Added `ingest_comps` tool
  - `packages/openai/src/agents/coordinator.ts` — Added `ingest_comps` to tool summary + routing
  - `apps/web/lib/automation/handlers.ts` — Verified `handleKnowledgeCapture` registration
  - `packages/db/prisma/migrations/20260303000000_add_pg_trgm_entity_address/migration.sql` — `CREATE EXTENSION pg_trgm` + GIN index on `InternalEntity.canonicalAddress`
  - `packages/db/prisma/migrations/20260303100000_add_org_id_to_knowledge_embeddings/migration.sql` — `knowledge_embeddings` table with `org_id`, pgvector(1536), indexes
  - `infra/docker/Dockerfile.postgres` — Custom PostGIS + pgvector image for production
- **Completion Evidence (2026-03-02):**
  - ✅ WS1 — Knowledge tools wired: `search_knowledge_base` and `store_knowledge_entry` call real `/api/knowledge` route with `buildMemoryToolHeaders()` auth
  - ✅ WS2 — Auto-embed verified facts: post-write hook in `/api/memory/write` calls `ingestKnowledge()` on `decision === "verified"`
  - ✅ WS3 — Comp schema + ingest_comps: `CompPayloadSchema` has buyer/seller/address, `decomposeCompToFacts()` emits `transaction_parties`, `ingest_comps` tool wired to coordinator
  - ✅ WS4 — Deal outcome capture: `handleKnowledgeCapture` registered in `handlers.ts` for `deal.statusChanged`
  - ✅ WS5 — pg_trgm fuzzy matching: Extension v1.6 installed on production, GIN index `idx_internal_entities_address_trgm` verified, `findFuzzyMatch()` uses `similarity()` SQL with 0.3 pre-filter
  - ✅ Production DB: `knowledge_embeddings` table created with pgvector, `pg_trgm` extension + GIN index deployed
  - ✅ Build: `pnpm build` clean, 1,331/1,331 tests passing

### KA-002 — Authoritative Retrieval Split: Gateway Postgres + Qdrant Semantic Orchestrator (P0)

- **Priority:** P0
- **Status:** Done (2026-03-05)
- **Scope:** Make local Postgres via the gateway the only authoritative runtime store for parcel/property data, exact knowledge records, workflow state, and graph facts; move semantic/fuzzy knowledge retrieval onto Qdrant; and add a deterministic retrieval orchestrator that routes precise queries to Postgres first and semantic queries to Qdrant with optional merged ranking.
- **Problem:** Retrieval is still split across legacy and AgentOS paths with blurred ownership. Exact knowledge, graph facts, and workflow state live in Postgres, but semantic search still partly runs out of Postgres pgvector. Property intelligence already uses Qdrant, while `retrievalAdapter.ts` still falls back to legacy retrieval. This creates inconsistent query behavior, unclear source-of-truth boundaries, and leaves parcel/property runtime with implicit fallback semantics instead of a strict gateway-to-local-server contract.
- **Expected Outcome (measurable):**
  - Parcel/property data access is gateway-only in production and fails closed when the local server path is unavailable.
  - Exact knowledge retrieval, workflow state, and graph facts are served from Postgres-backed services first for precise queries.
  - Semantic/fuzzy institutional knowledge and property-intelligence recall are served from Qdrant collections with org-scoped filtering.
  - A single orchestrator composes exact, graph, and semantic results into a normalized retrieval payload with explicit source labeling and deterministic ranking.
  - Legacy Postgres semantic search paths are removed from the runtime serving path or isolated behind tests-only helpers.
- **Pre-Add Analysis Check:**
  - **Problem to solve:** Production still mixes authoritative records and semantic retrieval across two engines without an explicit routing contract.
  - **Expected outcome + success signal:** Exact parcel/property and knowledge requests succeed through gateway-backed Postgres; semantic/fuzzy recall succeeds through Qdrant; CI and production smokes confirm routing and fail-closed behavior.
  - **Evidence this is needed:** `apps/web/lib/agent/retrievalAdapter.ts` still toggles between AgentOS and legacy retrieval, `services/retrieval.service.ts` and `packages/openai/src/dataAgent/retrieval.ts` still contain Postgres semantic search branches, and `apps/web/lib/services/knowledgeBase.service.ts` still uses `knowledge_embeddings.embedding` for semantic search.
  - **Alignment:** Preserves local-server-first architecture, keeps authoritative data transactional in Postgres, and uses Qdrant only for semantic augmentation.
  - **Complexity / risk + rollback:** Medium-high; touches retrieval, knowledge, and property-memory surfaces. Rollback path is to restore previous adapter selection and Qdrant/pgvector search branches if merged ranking or routing regresses.
  - **Acceptance criteria + test plan:** Add orchestrator/service tests for exact-first routing, semantic routing, merged ranking, org scoping, gateway unavailable, and Qdrant unavailable; route tests for `/api/knowledge`; focused retrieval adapter coverage; production smoke update for property intelligence and gateway-only parcel/property behavior.
- **Planned Workstreams:**
  - **WS1 — Gateway-authoritative Postgres contract:** Remove remaining parcel/property fallback semantics from app/runtime paths and make health/retrieval surfaces report gateway-backed local Postgres as the only valid authoritative parcel/property backend.
  - **WS2 — Qdrant semantic knowledge layer:** Add a dedicated Qdrant collection and payload contract for institutional semantic knowledge while preserving Postgres as the canonical exact record store.
  - **WS3 — Retrieval orchestrator:** Introduce a single orchestrator that classifies precise vs semantic/fuzzy requests, queries Postgres exact/graph sources first when appropriate, augments with Qdrant semantic recall, and returns a unified scored result set.
  - **WS4 — Integration migration:** Repoint `apps/web/lib/agent/retrievalAdapter.ts`, `packages/openai/src/dataAgent/retrieval.ts`, worker call sites, and knowledge tools/routes to the orchestrator, retiring silent legacy fallback behavior.
  - **WS5 — Verification + smokes:** Expand route/service tests and update production smoke coverage for gateway-only parcel/property retrieval plus Qdrant-backed property-intelligence recall.
- **Files Expected To Change:**
  - `ROADMAP.md`
  - `apps/web/lib/agent/retrievalAdapter.ts`
  - `apps/web/lib/services/knowledgeBase.service.ts`
  - `apps/web/app/api/knowledge/route.ts`
  - `services/retrieval.service.ts`
  - `packages/openai/src/dataAgent/retrieval.ts`
- **Completion Evidence (2026-03-05):**
  - ✅ WS1/WS4 — Exact-first retrieval orchestrator is now the only runtime path: `apps/web/lib/agent/retrievalAdapter.ts`, `packages/openai/src/dataAgent/retrieval.ts`, `services/retrieval.service.ts`, and `apps/worker/src/activities/openai.ts` route exact/graph retrieval through authoritative Postgres-backed services first and remove the silent legacy fallback path.
  - ✅ WS2 — Institutional semantic knowledge is mirrored into Qdrant only: `apps/web/lib/services/knowledgeBase.service.ts`, `packages/openai/src/agentos/config.ts`, `packages/openai/src/agentos/qdrant.ts`, and `infra/scripts/setup_qdrant_collections.py` add org-scoped `institutional_knowledge` collection support while keeping exact records in Postgres.
  - ✅ WS3 — Knowledge API now exposes explicit retrieval mode control: `apps/web/app/api/knowledge/route.ts` supports `mode=auto|exact|semantic`, resolves exact-vs-semantic routing deterministically, and fails closed with explicit status codes when semantic retrieval is unavailable.
  - ✅ WS5 — Focused regression coverage added: `apps/web/app/api/knowledge/route.test.ts`, `apps/web/lib/services/knowledgeBase.service.test.ts`, `apps/web/lib/agent/__tests__/retrievalAdapter.test.ts`, `packages/openai/src/dataAgent/retrieval.test.ts`, `packages/openai/src/agentos/config.test.ts`, `packages/openai/src/agentos/qdrant.test.ts`, and `tests/retrieval.test.ts`.
  - ✅ Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=sk-placeholder pnpm build` all passed on 2026-03-05.

### KA-003 — Workbook Institutional Knowledge Ingest Automation (P1)

- **Priority:** P1
- **Status:** Done
- **Problem:** Uploaded Excel underwriting models currently remain preserved only as file artifacts. Operators must manually distill workbook assumptions, returns, and provenance into institutional knowledge, which leaves exact retrieval empty, semantic retrieval under-seeded, and Qdrant collection readiness dependent on ad hoc manual ingestion.
- **Expected outcome + success signal:** When a user uploads a financial workbook, the system preserves the artifact in gateway storage, extracts a cleaned underwriting summary plus structured metadata, ensures the `institutional_knowledge` Qdrant collection exists, ingests the institutional knowledge record, and verifies the record through both exact and semantic retrieval.
- **Evidence this is needed:** The first successful institutional knowledge seed came from a manually prepared workbook summary outside the product flow, while `apps/web/lib/automation/documents.ts` only triggers generic document processing and `/api/knowledge` only supports raw text ingestion. This leaves underwriting knowledge automation incomplete and non-repeatable.
- **Alignment:** Preserves gateway/local-server storage as the artifact source of truth, keeps exact knowledge canonical in Postgres, mirrors semantic chunks into Qdrant only, and avoids raw workbook dumps as the semantic corpus.
- **Complexity / risk + rollback:** Medium; introduces workbook parsing and upload-triggered ingestion. Roll back by removing the new `ingest_workbook` route action and upload automation branch, falling back to manual `/api/knowledge` ingest while keeping the preserved upload artifact unchanged.
- **Acceptance criteria + test plan:** Add a workbook ingest service that fetches uploaded workbook bytes from gateway storage, parses supported Excel workbooks, emits a cleaned summary + metadata + artifact provenance, upserts a `DocumentExtraction`, ingests institutional knowledge, verifies exact and semantic retrieval, and returns a deterministic ingest report. Add route tests for `ingest_workbook`, automation tests for financial workbook upload handling, and service tests for parsing/provenance/verification behavior. Verify with `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=sk-placeholder pnpm build`.
- **Planned Workstreams:**
  - **WS1 — Workbook parser + summarizer:** Parse uploaded `.xlsx`/`.xlsm` workbooks, extract stable underwriting metrics and sheet context, and generate a cleaned summary text with structured metadata.
  - **WS2 — Artifact-preserving ingest service:** Fetch workbook bytes from gateway storage, compute provenance metadata, upsert a workbook extraction record, ensure the institutional knowledge collection exists, and ingest canonical + semantic knowledge records.
  - **WS3 — API + automation wiring:** Extend `/api/knowledge` with `action=ingest_workbook` and trigger workbook ingest automatically from `upload.created` events for financial workbook uploads.
  - **WS4 — Verification + operator report:** Confirm exact and semantic retrieval for the new source, and return a structured ingest report summarizing artifact preservation, created IDs, and verification outcomes.
- **Files Expected To Change:**
  - `ROADMAP.md`
  - `apps/web/app/api/knowledge/route.ts`
  - `apps/web/app/api/knowledge/route.test.ts`
  - `apps/web/lib/automation/documents.ts`
  - `apps/web/lib/automation/__tests__/documents.test.ts`
  - `apps/web/lib/services/knowledgeBase.service.ts`
  - `apps/web/lib/services/knowledgeBase.service.test.ts`
  - `apps/web/lib/services/institutionalKnowledgeIngest.service.ts`
  - `apps/web/lib/services/institutionalKnowledgeIngest.service.test.ts`
  - `apps/web/package.json`
  - `pnpm-lock.yaml`
- **Completion Evidence (2026-03-06):**
  - ✅ WS1 — Workbook parser + summarizer shipped in `apps/web/lib/services/institutionalKnowledgeIngest.service.ts`; supported Excel uploads are parsed from gateway-stored workbook bytes, underwriting metrics are normalized into structured metadata, and a cleaned institutional summary is generated without dumping raw workbook noise into semantic storage.
  - ✅ WS2 — Artifact-preserving ingest path now verifies Qdrant readiness before knowledge writes: `apps/web/lib/services/institutionalKnowledgeIngest.service.ts` preserves workbook provenance (filename, object key, hash, uploader context), upserts `documentExtraction`, and `apps/web/lib/services/knowledgeBase.service.ts` exposes `ensureInstitutionalKnowledgeCollectionReady()` so workbook ingest fails closed when semantic storage is unavailable.
  - ✅ WS3 — API + upload automation wiring is live: `apps/web/app/api/knowledge/route.ts` now supports `action=ingest_workbook`, and `apps/web/lib/automation/documents.ts` triggers workbook institutional-knowledge ingest automatically for uploaded financial workbooks while leaving non-workbook processing on the existing document path.
  - ✅ WS4 — Focused regression coverage shipped: `apps/web/app/api/knowledge/route.test.ts`, `apps/web/lib/automation/__tests__/documents.test.ts`, `apps/web/lib/services/knowledgeBase.service.test.ts`, and `apps/web/lib/services/institutionalKnowledgeIngest.service.test.ts` cover route auth/validation, workbook upload automation behavior, Qdrant readiness, summary extraction, artifact provenance, and exact/semantic verification reporting.
  - ✅ Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=sk-placeholder pnpm build` all passed on 2026-03-06.

---

## Not Added (did not pass value/risk gate)

These are explicitly not being added now to avoid noise:

- Dark mode validation pass across all modified widgets
- Keyboard-navigation expansion
- Activity feed + notification preference surfaces
- Collaboration upgrades (`@mentions`, assignment alerts)

Reason: these were low-priority for current operating goals and can be deferred until we quantify product impact for each and/or complete higher-impact reliability and operator-efficiency work above.

### OBS-002 — Fire-and-Forget Dispatch Failure Logging (P0)

- **Priority:** P0
- **Status:** In Progress (2026-04-04)
- **Scope:** Replace silent `.catch(() => {})` patterns on production fire-and-forget automation dispatches with structured warning logs that preserve the non-blocking behavior.
- **Problem:** Core event dispatch call sites in agent completion and deal status/stage transitions currently swallow rejected dispatch promises with no logs, which hides failures in automation handoff, idempotency persistence, and handler registration paths.
- **Expected Outcome (measurable):**
  - All production `dispatchEvent(...).catch(() => {})` call sites emit structured warning logs with event type and identifiers.
  - Fire-and-forget semantics remain unchanged; request/agent flows do not block on automation dispatch completion.
  - Operators can correlate dispatch failures from app logs without depending solely on Sentry spans.
- **Evidence of need:** Repo scan on 2026-04-04 found silent dispatch catches in `apps/web/lib/agent/agentRunner.ts`, `apps/web/app/api/deals/[id]/route.ts`, and `apps/web/app/api/deals/route.ts`, covering `agent.run.completed`, `deal.stageChanged`, and `deal.statusChanged` events.
- **Alignment:** Preserves the current automation/event architecture, keeps `.catch()` fire-and-forget behavior intact, and adds only observability metadata without changing workflow contracts.
- **Risk/rollback:** Low risk because the change is limited to logging in existing catch handlers. Rollback is straightforward by reverting the catch-body changes if log volume is unexpectedly noisy.
- **Acceptance criteria + test plan:** Replace silent catches in the production dispatch call sites with `logger.warn(...)` including event metadata and error message, then verify with `pnpm typecheck`, `pnpm lint`, and focused tests covering the touched surfaces.

### OBS-003 — Tool Execution Logging At Registry Boundary (P0)

- **Priority:** P0
- **Status:** In Progress (2026-04-04)
- **Scope:** Add structured application-level logging around tool execution in `apps/web/lib/agent/toolRegistry.ts` so every invoked tool records duration and outcome at the server registry boundary.
- **Problem:** Tool execution today is observable mainly through Sentry spans and trace exporters in the OpenAI package, but the web app does not emit structured logs for per-tool success, JSON-wrapped tool failures, or thrown invocation errors, making local and production log-based diagnosis harder.
- **Expected Outcome (measurable):**
  - Every tool invocation from the web registry emits a structured log with tool name, org id, duration, and status.
  - JSON-wrapped tool errors are classified separately from thrown execution errors.
  - Focused tests cover success, `{"error": ...}` tool responses, and thrown errors.
- **Evidence of need:** `apps/web/lib/agent/toolRegistry.ts` is the single execution choke point for `/api/agent/tools/execute`, and current code invokes tools without emitting application-level execution logs.
- **Alignment:** Preserves existing tool wiring, Sentry instrumentation, and auth-context injection while adding only lightweight structured logs at the registry boundary.
- **Risk/rollback:** Low risk because the change is additive and isolated to one invocation wrapper plus tests. Rollback is straightforward by reverting the wrapper and test additions if log volume is not useful.
- **Acceptance criteria + test plan:** Wrap tool invocation in timing/logging, emit `logger.info` for success and tool-returned errors plus `logger.warn` for thrown execution errors, and verify with focused registry tests plus `pnpm lint` and `pnpm typecheck` when dependencies are available.

### TEST-001 — API Route Coverage Tranche: Notifications + Runs (P1)

- **Priority:** P1
- **Status:** In Progress (2026-04-04)
- **Scope:** Add route-level regression coverage for the untested notifications endpoints and `/api/runs`, covering auth, success, validation, and internal failure paths.
- **Problem:** Core operator-facing notification routes and the run listing endpoint currently have no route tests, leaving auth regressions, filter parsing, and service/error handling unguarded.
- **Expected Outcome (measurable):**
  - `/api/notifications`, `/api/notifications/[id]`, `/api/notifications/mark-all-read`, and `/api/runs` have focused route coverage.
  - Tests lock unauthorized handling, key success behavior, and at least one error branch per route.
  - Mocking follows the established `resolveAuth` + service/Prisma pattern already used in nearby route tests.
- **Evidence of need:** Current route inventory shows these endpoints untested while adjacent routes like `/api/notifications/unread-count` and `/api/runs/dashboard` already have test coverage.
- **Alignment:** Adds only regression coverage; no runtime behavior changes.
- **Risk/rollback:** Low risk because the work is test-only. Rollback is straightforward by reverting the new test files.
- **Acceptance criteria + test plan:** Add four route test files covering auth, success, filter/input handling, typed `AppError` surfacing, and generic 500s. Verify with focused `apps/web` Vitest runs when dependencies are available.
- **Evidence (incremental, 2026-04-04):** Added focused route coverage for `notifications`, `notifications/[id]`, `notifications/mark-all-read`, `runs`, `entities`, `entities/[id]`, `deals/[id]/tasks`, `deals/[id]/tasks/[taskId]/run`, `deals/[id]/uploads`, `deals/[id]/activity`, `saved-searches`, `saved-searches/[id]`, `saved-searches/[id]/run`, `portfolio`, `portfolio/analytics`, `portfolio/stress-test`, `portfolio/concentration`, `portfolio/debt-maturity`, `portfolio/velocity`, `portfolio/capital-deployment`, `portfolio/optimize`, `portfolio/1031-matches/[dealId]`, `proactive/triggers`, `proactive/actions`, `proactive/actions/[id]/respond`, `cron/opportunity-scan`, `cron/change-detection`, `cron/market-monitor`, `cron/deadline-check`, `cron/calibration`, `cron/drift-monitor`, `cron/entity-revalidation`, `cron/parish-pack-refresh`, `cron/entitlement-precedent-backfill`, `admin/sentinel-alerts`, `admin/export`, `admin/knowledge/[id]`, and `admin/memory/[id]`, including SSE success/failure assertions for task execution, file-upload path coverage, cron auth/reliability behavior, monitor/backfill run accounting, sentinel alert persistence/retrieval coverage, CSV export streaming, and org-scoped delete flows. `opportunities` routes were already covered and were included in the expanded combined verification run. Installed workspace dependencies, built `packages/shared` and `packages/db`, and verified the tranche with focused `apps/web` Vitest runs plus full `pnpm lint` and `pnpm typecheck`.


## Completed

### PIPE-007 — Opportunity Thesis Engine + Feedback Loop (P1)

- **Priority:** P1
- **Status:** Done (2026-03-16)
- **Scope:** Turn raw saved-search parcel matches into ranked, explainable opportunity theses that learn from operator feedback without weakening existing auth, org scoping, or inbox workflows.
- **Problem:** The platform already generalizes beyond entitlement work, stores property-intelligence memory, and ships a dedicated `/opportunities` inbox, but opportunity matches still surface as mostly raw parcel rows with a score badge. The system does not yet explain why a parcel matters now, suggest the next diligence action, or learn from `pursue`/`dismiss` behavior to improve future ranking.
- **Expected Outcome (measurable):**
  - `/api/opportunities` returns an explainable thesis object plus a learned priority score for each visible opportunity.
  - The opportunity inbox surfaces `why now`, `angle`, `key risks`, and `next best action` instead of only raw parcel metadata.
  - Operator feedback persists an explicit positive signal (`pursue`) in addition to the existing `dismiss`/`seen` states and influences future opportunity ranking.
- **Evidence of need:** The current opportunity pipeline already creates `opportunity_matches` rows and ships a full-page inbox, but the feed still renders only score + parcel facts + create/deal actions. That leaves the system reactive and forces operators to mentally synthesize the thesis every time.
- **Alignment:** Reuses the existing saved-search/opportunity pipeline, org-scoped auth via `resolveAuth`, the current feedback/reward design direction, and additive schema evolution. No legacy entitlement behavior is removed, and no external AI dependency is required for the first slice.
- **Risk/rollback:** Medium. The work touches the opportunity schema, service/API read models, and inbox UI. Rollback is straightforward by reverting the additive column, thesis engine, and UI/API changes if ranking or feedback semantics regress.
- **Acceptance Criteria / Tests:**
  - [x] Added a first-class positive feedback state for opportunities with additive schema migration only.
  - [x] Added a deterministic thesis/ranking engine with focused unit coverage.
  - [x] Extended the opportunity service/API to expose thesis + priority score and to persist `pursue` feedback.
  - [x] Updated the inbox UI to render the thesis and send positive feedback on deal creation.
  - [x] Ran focused opportunity route/service tests plus the full repo verification gate.
- **Files:**
  - `packages/db/prisma/schema.prisma`
  - `packages/db/prisma/migrations/20260316214500_add_opportunity_pursued_at/migration.sql`
  - `apps/web/lib/opportunities/thesisEngine.ts`
  - `apps/web/lib/opportunities/thesisEngine.test.ts`
  - `apps/web/lib/services/saved-search.service.ts`
  - `apps/web/lib/services/saved-search.service.test.ts`
  - `apps/web/app/api/opportunities/route.ts`
  - `apps/web/app/api/opportunities/route.test.ts`
  - `apps/web/app/api/opportunities/[id]/route.ts`
  - `apps/web/app/api/opportunities/[id]/route.test.ts`
  - `apps/web/components/opportunities/OpportunityFeed.tsx`
- **Completion Evidence (2026-03-16):**
  - Added `pursued_at` to `opportunity_matches` with a saved-search feedback index so positive operator intent persists without destructive schema churn.
  - Added a deterministic thesis engine that learns parish and acreage preferences from prior `pursued` and `dismissed` outcomes, then emits `summary`, `whyNow`, `angle`, `nextBestAction`, `keyRisks`, `signals`, and `priorityScore`.
  - Updated the scoped opportunity service and APIs so inbox reads are reranked with explainable theses and `PATCH /api/opportunities/[id]` accepts `pursue` as explicit positive feedback.
  - Updated the inbox UI so each card shows the thesis, confidence, signals, and risks, and `Create Deal` records a `pursue` event before navigating into deal creation.
  - Verification passed:
    - `pnpm -C apps/web test -- app/api/opportunities/route.test.ts 'app/api/opportunities/[id]/route.test.ts' lib/opportunities/thesisEngine.test.ts lib/services/saved-search.service.test.ts`
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=placeholder pnpm build`

### MAP-008 — Map Regression Harness + Prospect Filter Hardening (P0)

- **Priority:** P0
- **Status:** Done (2026-03-12)
- **Scope:** Harden `/map` browser QA, polygon prospect filter correctness, comps-panel UX, and map-adjacent local/dev degradation behavior.
- **Problem:** The current map route lacked a repeatable browser harness for core flows, polygon prospecting accepted `searchText` / `excludeFloodZone` filters without applying them to the gateway SQL, the comps panel auto-fit the map on open while failing silently on degraded responses, and map side panels emitted avoidable 500s during local/dev runs when optional geofence storage was unavailable.
- **Expected Outcome (measurable):**
  - Headless Playwright can load and exercise `/map` reliably on a dedicated port with WebGL-capable launch options.
  - `POST /api/map/prospect` applies `searchText` and `excludeFloodZone` filters to the generated parcel SQL.
  - The map search submit path triggers a single explicit request per button click.
  - Opening comparable sales no longer recenters the map automatically, and comp failures surface an explicit panel message.
  - Bulk prospect deal creation is transactional so failed parcel writes do not leave partial prospect/deal state behind.
  - Geofence loading degrades to an empty state instead of surfacing 500s when schema/connectivity prerequisites are missing in local/dev.
- **Evidence of need:** Browser probing showed default headless `/map` runs failed MapLibre initialization without SwiftShader, local map runs surfaced `/api/geofences` 500s when the DB was absent, route inspection confirmed `/api/map/prospect` ignored `filters.searchText` and `filters.excludeFloodZone`, and map review found the comps tool auto-fit the viewport on open without showing degraded or failure feedback.
- **Alignment:** Preserved current auth/org-scoped route patterns, gateway-first parcel architecture, and the roadmap requirement for repeatable verification before UI mutation.
- **Risk/rollback:** Low-to-medium. Changes were isolated to the map page submit behavior, geofence GET degradation, prospect SQL generation, map overlay stacking, and Playwright test harness configuration. Rollback remains straightforward by reverting the map QA slice.
- **Acceptance Criteria / Tests:**
  - [x] Added a dedicated Playwright `/map` regression spec with mocked map APIs covering load, search, and polygon draw flow.
  - [x] Configured the Playwright harness to use a dedicated repo-owned production-style server plus SwiftShader-compatible launch args so `/map` renders in headless automation.
  - [x] Added comps-panel browser coverage for non-recentering open behavior and explicit degraded/failure messaging.
  - [x] Updated `/api/map/prospect` tests to assert the filter SQL includes `searchText` and `excludeFloodZone`.
  - [x] Updated `PUT /api/map/prospect` coverage to assert the bulk-create path runs inside a transaction and fails closed on parcel-write errors.
  - [x] Updated geofence route tests to assert empty-state degradation on schema drift / DB connectivity failures.
  - [x] Ran focused map tests plus the repo verification gate.
- **Files:**
  - `apps/web/app/map/page.tsx`
  - `apps/web/app/api/map/prospect/route.ts`
  - `apps/web/app/api/map/prospect/route.post.test.ts`
  - `apps/web/app/api/map/prospect/route.test.ts`
  - `apps/web/app/api/geofences/route.ts`
  - `apps/web/app/api/geofences/route.test.ts`
  - `apps/web/components/maps/MapLibreParcelMap.tsx`
  - `apps/web/components/maps/MapLibreParcelMap.test.tsx`
  - `apps/web/playwright.config.ts`
  - `apps/web/e2e/map.spec.ts`
- **Completion Evidence (2026-03-12):**
  - Fixed `/map` search so the explicit Search button no longer double-submits.
  - Restored prior theme on map-page unmount and suppressed invalid acreage rendering in parcel popups.
  - Raised the polygon draw controls above the analytical toolbar so the finish action remains clickable during draw mode.
  - Stopped the comparable-sales panel from auto-fitting the viewport on open and added explicit failure/empty-state feedback for degraded comp searches.
  - Applied `searchText` and `excludeFloodZone` directly in prospect SQL generation and covered that with route tests.
  - Wrapped `PUT /api/map/prospect` bulk deal creation in a transaction and added a failure-path test so prospect writes fail closed instead of leaving partial records behind.
  - Degraded `GET /api/geofences` to `{ geofences: [], degraded: true }` for schema drift / DB connectivity failures in local-dev paths.
  - Added `apps/web/e2e/map.spec.ts` to cover core map load, single-submit search, comps behavior, and polygon draw/prospect/clear flow with mocked APIs.
  - Verification passed:
    - `pnpm -C apps/web test -- app/api/map/prospect/route.post.test.ts app/api/geofences/route.test.ts components/maps/MapLibreParcelMap.test.tsx`
    - `pnpm -C apps/web exec playwright test e2e/map.spec.ts --reporter=list`
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=placeholder pnpm build`

### PIPE-006 — Dedicated Opportunities Inbox (P1)

- **Priority:** P1
- **Status:** Done (2026-03-11)
- **Scope:** Ship a full-page opportunity review inbox for saved-search matches, with direct navigation from prospecting and command center surfaces.
- **Problem:** Saved searches could be run and opportunity matches were generated, but the primary prospecting flow stopped at a toast. The only existing review surface was a limited command-center card, and its "View all opportunities" CTA routed back to prospecting instead of a true inbox.
- **Expected Outcome (measurable):**
  - Users can open a dedicated `/opportunities` route and review more than the command-center preview subset.
  - Prospecting saved filters can deep-link into the exact opportunity set they generated.
  - Command center preview can hand off to the inbox instead of sending users back to saved filters.
- **Evidence of need:** Repo signals showed the saved-search loop already created and stored `opportunityMatch` rows, but prospecting only exposed `Run` plus a success toast and the preview card hard-coded `router.push("/prospecting?tab=saved-filters")` for "View all opportunities."
- **Alignment:** Reused existing saved-search/opportunity APIs, auth (`resolveAuth`), navigation telemetry, and current shadcn card/button patterns. No new design system or growth layer was introduced.
- **Risk/rollback:** Low. The change is additive and mostly UI routing over existing data paths; rollback is reverting the route, API filter, and entry-point links.
- **Acceptance Criteria / Tests:**
  - [x] Added an authenticated `/opportunities` page using the existing opportunity feed component.
  - [x] Extended opportunity fetching to support an optional `savedSearchId` filter scoped to the authenticated user's searches.
  - [x] Updated existing entry points so command center preview and prospecting saved filters can open the inbox.
  - [x] Targeted verification passed:
    - `pnpm --dir apps/web exec vitest run lib/services/saved-search.service.test.ts`
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm build`
  - [x] Repo-wide `pnpm test` was run; the feature area passed, and the remaining blocker is the pre-existing root `tests/reflection.test.ts` dependency on live reflection embedding credentials.
- **Files:**
  - `apps/web/app/opportunities/page.tsx`
  - `apps/web/components/opportunities/OpportunityFeed.tsx`
  - `apps/web/app/api/opportunities/route.ts`
  - `apps/web/lib/services/saved-search.service.ts`
  - `apps/web/app/prospecting/page.tsx`
  - `apps/web/components/layout/Sidebar.tsx`
  - `apps/web/lib/services/saved-search.service.test.ts`
- **Completion Evidence (2026-03-11):**
  - Added a dedicated opportunity inbox route that renders the existing feed in full-page mode with a higher result cap.
  - Prospecting saved filters now surface total match counts, last-run status, and a direct "View matches" entry into the inbox.
  - Command center preview now hands off to `/opportunities` instead of bouncing users back to saved filters.
  - The opportunity API and service now support user-scoped `savedSearchId` filtering for deep links.

### MAP-006 — Fluid Map-Chat Integration Completion (P0)

- **Priority:** P0
- **Status:** Done (2026-03-11)
- **Scope:** Finish the shared map/chat transport, context, and UI integration so parcel tools, `/map`, and assistant messages use one consistent map-state contract.
- **Problem:** The typed map-action and wrapped tool-result groundwork landed, but the remaining UI and WebSocket surfaces still bypassed the shared context. `/map` kept its own selection and viewport state, the Cloudflare worker path could not forward map context or `map_action` events, and assistant messages could not render inline spatial previews from `__mapFeatures`.
- **Expected Outcome (measurable):**
  - SSE and WebSocket transports both accept `mapContext` input and can emit `map_action` events with the same shared schema.
  - `/map`, `ChatContainer`, and `MapChatPanel` read/write one shared `MapChatContext` for viewport, selected parcel IDs, referenced features, and pending map actions.
  - Assistant messages can persist `mapFeatures` and render an inline mini-map preview without scraping raw tool JSON.
- **Evidence of need:** The implementation plan in `~/.claude/plans/noble-marinating-wolf.md` was only partially complete in the starting tree: shared map action contracts and parcel tool wrappers existed, but `packages/shared`, the Cloudflare worker, `ChatContainer`, `/map`, and the message rendering surfaces did not yet consume the shared integration layer end to end.
- **Alignment:** Preserves the current map tooling architecture, avoids duplicated parcel/viewport state, keeps strict typed stream contracts across transports, and does not weaken auth/org-scoping or tool-result validation behavior.
- **Risk/rollback:** Medium UI/integration risk because the work touched shared chat and map surfaces. Rollback remains straightforward by reverting the scoped files, but partial completion would have left SSE and WebSocket behavior divergent and kept `/map` in a split-brain state.
- **Acceptance Criteria / Tests:**
  - Add the remaining shared stream and worker contract updates for `map_action` and `mapContext`.
  - Mount and consume `MapChatProvider` across chat/map surfaces, replacing local `/map` selection and viewport ownership.
  - Expose imperative map controls needed for pending map actions and connect them to the shared context.
  - Add assistant message `mapFeatures` support and render inline mini-map previews from typed features.
  - Run the full verification gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- **Completion note:** The remaining end-to-end integration is complete. Shared `MapChatContext` now drives `/map`, home chat, and the map side panel; both SSE and Cloudflare-worker transports serialize the same `mapContext`; assistant messages persist typed `mapFeatures` and render inline mini-map previews without raw JSON scraping.
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `packages/shared/src/types/mapChat.ts`
    - `apps/web/lib/chat/MapChatContext.tsx`
    - `apps/web/app/map/page.tsx`
    - `apps/web/components/chat/ChatContainer.tsx`
    - `apps/web/components/maps/MapChatPanel.tsx`
    - `apps/web/components/maps/MapLibreParcelMap.tsx`
    - `apps/web/components/chat/MiniMapMessage.tsx`
    - `apps/web/lib/agent/agentRunner.ts`
    - `infra/cloudflare-agent/src/durable-object.ts`
    - `apps/web/lib/chat/__tests__/MapChatContext.test.tsx`
    - `apps/web/lib/chat/__tests__/normalizeParcel.test.ts`
    - `apps/web/lib/chat/__tests__/toolResultWrapper.test.ts`
    - `apps/web/lib/chat/__tests__/streamPresenter.test.ts`
    - `apps/web/app/api/chat/route.test.ts`
  - Verification gate passed at repo root:
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `pnpm build`

### R-006 — Supabase Client Surface Reduction (P1)

- **Priority:** P1
- **Status:** Done (2026-02-28)
- **Scope:** Remove non-auth Supabase SDK usage from web app surfaces.
- **Problem:** Product features still depended on direct Supabase client reads/realtime/storage, which diverged from the local DB + gateway storage architecture and increased operational complexity.
- **Expected Outcome (measurable):**
  - `apps/web/components/notifications/NotificationFeed.tsx` no longer uses Supabase Realtime.
  - `apps/web/app/screening/intake/page.tsx` no longer uploads via Supabase Storage.
  - Legacy direct-query adapters in `apps/web/lib/data/` removed.
- **Evidence of need:** Runtime inventory identified the remaining non-auth Supabase usage limited to notifications realtime, screening intake uploads, and unused legacy data adapters.
- **Alignment:** Keeps auth/session boundaries on NextAuth/Auth.js while moving product behavior to existing API polling and backend pathways; no org-scope or auth boundary weakening.
- **Risk/rollback:** Low-medium; notification delivery becomes poll-based only, and screening intake document uploads are disabled in this form during storage migration. Rollback by restoring the removed Supabase integrations.
- **Acceptance Criteria / Tests:**
  - Remove Supabase import + realtime subscription from `NotificationFeed`.
  - Remove Supabase storage upload flow from screening intake page.
  - Delete unused legacy data adapters under `apps/web/lib/data/` (agents/workflows/runs adapters removed).
  - Verification gate passes: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

### AOS-001 — AgentOS Upgrade Foundation (P0)

- **Priority:** P0
- **Status:** Done
- **Scope:** Runtime modernization + retrieval infrastructure
- **Problem:** Agent runtime lacked TS-native Qdrant hybrid retrieval wiring, server-side context compaction controls, tool-output trimming controls, and post-run critic scaffolding.
- **Expected Outcome (measurable):**
  - Agent runtime can enable Qdrant dense+sparse hybrid retrieval through feature flags.
  - Responses API strict JSON wrapper supports `context_management: { strategy: "compaction" }`.
  - Tool-output trimming + trajectory capture + critic evaluation are available and safely toggleable.
- **Evidence:** Implemented feature-flagged `agentos` modules and runtime integrations across web/worker paths.
- **Alignment:** Enhances existing execution paths without replacing coordinator/session/guardrail architecture; preserves parity when flags are off.
- **Risk/rollback:** Medium integration risk; rollback is flag-based (`AGENTOS_ENABLED=0`) with zero behavior change.
- **Acceptance Criteria / Tests:**
  - Add `@qdrant/js-client-rest` dependency and Qdrant setup script under `infra/scripts`.
  - Add feature-flagged `agentos` config, qdrant client, tool trimmer, critic, trajectory, and cost utilities.
  - Wire retrieval adapters and worker retrieval context to AgentOS retrieval path with legacy fallback.
  - Upgrade default embeddings to `text-embedding-3-large` with `dimensions=1536`.
- **Files (target):**
  - `packages/openai/src/agentos/*`
  - `packages/openai/src/responses.ts`
  - `packages/openai/src/dataAgent/retrieval.ts`
  - `apps/web/lib/agent/retrievalAdapter.ts`
  - `apps/web/lib/agent/executeAgent.ts`
  - `apps/worker/src/activities/openai.ts`
  - `infra/scripts/setup_qdrant_collections.py`
  - `infra/local-api/requirements.txt`
  - `packages/shared/src/openaiModels.ts`
- **Completion note:** Foundation slice implemented with flag-safe runtime wiring and one-time Qdrant setup tooling.

### R-001 — chatgpt-apps Integration Verification & Hardening

- **Priority:** P0
- **Status:** Done
- **Scope:** Verification and reliability
- **Problem:** External GIS/zoning integration can fail silently or be insecure if env/config/rate-limit contracts drift.
- **Expected Outcome (measurable):**
  - 0 open verification blockers in `docs/chatgpt-apps-integration.md`
  - Legacy `POST /api/external/chatgpt-apps/parcel-geometry` is fully retired and replaced by the production geometry path
  - Active smoke coverage executes successfully for `GET /api/parcels/[parcelId]/geometry`
  - No raw Supabase/DB errors leaked from API route responses
- **Evidence:** Historical checkboxes in `docs/chatgpt-apps-integration.md` were closed as part of the route retirement + replacement work.
- **Alignment:** Supports existing secure two-header auth contract and existing API route patterns.
- **Risk/rollback:** Low runtime risk; rollout is route retirement + smoke-test hardening. Roll back by restoring the retired route only if the replacement endpoint regresses.
- **Acceptance Criteria / Tests:**
  - Env validation doc checklist completed
  - Legacy `chatgpt-apps` parcel geometry path removed from active runtime and smoke scripts
  - Replacement parcel geometry path is covered by route tests and production smoke coverage
- **Files (target):** `apps/web/app/api/parcels/[parcelId]/geometry/route.ts`, `apps/web/app/api/parcels/[parcelId]/geometry/route.test.ts`, `apps/web/components/maps/useParcelGeometry.ts`, `apps/web/__tests__/api/route-auth.test.ts`, `docs/chatgpt-apps-integration.md`, `scripts/parcels/smoke_map_parcel_prod.ts`, `scripts/smoke_endpoints.ts`
- **Completion note:** Updated docs checklist and route/service hardening are complete. Legacy `POST /api/external/chatgpt-apps/parcel-geometry` was retired on 2026-03-05 and replaced by `GET /api/parcels/[parcelId]/geometry`.
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `apps/web/app/api/parcels/[parcelId]/geometry/route.ts`
    - `apps/web/app/api/parcels/[parcelId]/geometry/route.test.ts`
    - `apps/web/components/maps/useParcelGeometry.ts`
    - `apps/web/__tests__/api/route-auth.test.ts`
    - `docs/chatgpt-apps-integration.md`
    - `scripts/parcels/smoke_map_parcel_prod.ts`
  - **Result:**
    - Implementation evidence is present in checklist + hardened replacement route.
    - Parcel geometry no longer depends on the legacy `chatgpt-apps` path.
    - Full `apps/web` test sweep: `pnpm -C apps/web test` passed in this pass.
    - Note: release validation should use `scripts/parcels/smoke_map_parcel_prod.ts` + `scripts/smoke_endpoints.ts` for the replacement parcel geometry flow.

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
- **Files (target):** `apps/web/lib/agent/__tests__/*`, `tests/episode.test.ts`, `apps/web/lib/agent/__tests__/executeAgent.runState-contract.test.ts`
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

### DA-007 — Event-Driven Long-Term Learning Promotion Runtime (P0)

- **Priority:** P0
- **Status:** Planned
- **Scope:** Agent learning promotion + prompt retrieval
- **Pre-add analysis result:** PASS (the active app schema already includes `trajectory_logs`, `episodic_entries`, `procedural_skills`, and `eval_results`, but runtime does not yet promote completed runs into those tables or inject the resulting procedural/episodic context back into future runs).
- **Problem:** Completed runs persist final output, evidence, and tool metadata, but the chat/runtime stack still lacks an asynchronous promotion pipeline that turns those outputs into durable trajectory logs, reusable episodes, procedural skills, and reinforcement updates tied to terminal deal outcomes.
- **Expected Outcome (measurable):**
  - Every completed run is queued asynchronously for long-term learning promotion without adding material chat latency.
  - Successful runs create at least one `episodic_entries` row and repeated successful patterns promote `procedural_skills`.
  - Verified property/entity facts continue to flow through `memoryWriteGate` / `MemoryVerified` rather than creating a competing truth store.
  - Future runs receive injected `[Relevant Procedures]` and `[Similar Prior Runs]` context blocks.
- **Evidence of need:** `apps/web/lib/agent/agentRunner.ts` already persists normalized final output/trust metadata and `apps/web/lib/automation/knowledgeCapture.ts` already captures terminal outcome records, but nothing currently bridges those runtime artifacts into the AgentOS v2 learning tables or prompt context.
- **Alignment:** Extends the existing four-layer memory architecture without replacing the current entity-truth or knowledge pipelines; keeps fact promotion behind the existing write gate and uses the repository’s event-driven automation conventions for async execution.
- **Risk/rollback:** Medium. Risks are duplicate promotion, noisy fact extraction, and prompt bloat. Roll back by disabling the new `agent.run.completed` dispatch/handler path while leaving the base chat runtime untouched.
- **Acceptance Criteria / Tests:**
  - Add schema + migration support for run promotion status fields, richer trajectory/episode/skill metadata, and `procedural_skill_episodes`.
  - Dispatch `agent.run.completed` after assistant message persistence, update run promotion status asynchronously, and persist promotion failures for observability.
  - Create focused tests for automation event wiring/registration, knowledge route acceptance of new content types, and tool/catalog exposure of the new procedural/episodic search tools.
  - Re-run the repo verification gate after implementation (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `OPENAI_API_KEY=placeholder pnpm build`).
- **Files (target):**
  - `packages/db/prisma/schema.prisma`
  - `packages/db/prisma/migrations/20260317_agent_learning_runtime/`
  - `apps/web/lib/agent/agentRunner.ts`
  - `apps/web/lib/automation/events.ts`
  - `apps/web/lib/automation/handlers.ts`
  - `apps/web/lib/automation/knowledgeCapture.ts`
  - `apps/web/lib/automation/agentLearningPromotion.ts`
  - `apps/web/lib/services/agentLearning.service.ts`
  - `apps/web/lib/services/trajectoryLog.service.ts`
  - `apps/web/lib/services/episodicMemory.service.ts`
  - `apps/web/lib/services/proceduralSkill.service.ts`
  - `apps/web/lib/services/outcomeReinforcement.service.ts`
  - `apps/web/lib/services/learningContextBuilder.ts`
  - `apps/web/lib/services/knowledgeBase.service.ts`
  - `apps/web/app/api/knowledge/route.ts`
  - `apps/web/app/api/admin/stats/route.ts`
  - `packages/openai/src/tools/*`
  - `packages/openai/src/agents/index.ts`

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

### AUI-002 — Chat Bootstrap Stability + Conversation Metadata Rehydration

- **Priority:** P1
- **Status:** Done
- **Scope:** Initial chat shell reliability and reopened-conversation fidelity
- **Problem:** Chat bootstrap reads were surfacing `500`s on initial page load when conversation or notification storage was temporarily unavailable, and reopened conversations dropped per-message metadata because `/api/chat/conversations/[id]` omitted it from the response.
- **Expected Outcome (measurable):**
  - Initial chat shell loads without `500` noise when conversation or notification storage is unavailable due to schema drift or transient DB connectivity failures.
  - Reopened conversations preserve structured message metadata needed for event rendering, tool result hydration, and map-feature rehydration.
- **Evidence:** Live local chat QA against the dev server reproduced `500` responses on `/api/chat/conversations` and `/api/notifications/unread-count` during initial authenticated shell load. Code inspection showed `apps/web/app/api/chat/conversations/[id]/route.ts` selected `toolCalls` but omitted `metadata` even though `ChatContainer` expects it when rebuilding saved messages.
- **Alignment:** Extends the existing degraded-read pattern already used on other non-destructive read routes and preserves the chat UI contract without weakening auth or org scoping.
- **Risk/rollback:** Low. Changes are limited to read-only chat/notification endpoints and response serialization. Rollback is straightforward by reverting the route handlers and focused tests.
- **Acceptance Criteria / Tests:**
  1. `GET /api/chat/conversations` returns `200 { conversations: [], degraded: true }` on schema drift or DB connectivity failures instead of surfacing `500`.
  2. `GET /api/notifications/unread-count` returns `200 { count: 0, degraded: true }` for the same failure classes.
  3. `GET /api/chat/conversations/[id]` includes message `metadata` so saved conversations can rehydrate structured chat state.
  4. Add route tests for auth rejection, degraded reads, and metadata persistence.
- **Files (target):**
  - `apps/web/app/api/chat/conversations/route.ts`
  - `apps/web/app/api/chat/conversations/[id]/route.ts`
  - `apps/web/app/api/chat/_lib/errorHandling.ts`
  - `apps/web/app/api/notifications/unread-count/route.ts`
  - `apps/web/app/api/chat/conversations/route.test.ts`
  - `apps/web/app/api/chat/conversations/[id]/route.test.ts`
  - `apps/web/app/api/notifications/unread-count/route.test.ts`
- **Completion note:** Hardened the chat bootstrap read routes with schema-drift and connectivity degradations, and restored `metadata` in the conversation detail payload so reopened chats preserve structured event state and map context.
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `pnpm -C apps/web test app/api/chat/conversations/route.test.ts 'app/api/chat/conversations/[id]/route.test.ts' app/api/notifications/unread-count/route.test.ts`
  - **Result:**
    - Chat bootstrap route regressions are covered with focused auth/degradation tests.
    - Conversation detail responses now preserve message metadata used by the chat UI.

### MAP-001 — MapLibre Vector Rendering + Multi-Select Parcel Boundary Intelligence (Option 3)

- **Priority:** P1
- **Status:** Done
- **Scope:** Geospatial visualization modernization, performance, and selection UX
- **Completion notes (2026-02-15):** Full MapLibre GPU-backed renderer (1,900+ lines) with: GeoJSON boundary/zoning/flood/point layers, Ctrl/Cmd+click multi-select, popup on click, cursor hover, base layer toggle (Streets/Satellite), overlay toggles with localStorage persistence, error/loading states, 4 analytical tools (Measure, CompSales, Heatmap, Isochrone), viewport-scoped geometry loading (debounced 300ms moveend → useParcelGeometry with ViewportBounds filtering + AbortController), maxFetch raised to 200, requestAnimationFrame-batched selection, explicit a/b/c subdomain tile URLs (MapLibre doesn't support `{s}`), shared tile URL resolver via `apps/web/components/maps/tileUrls.ts`.
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
- **Alignment:** Extends current map domain model (parcel + optional geometry + overlays) while preserving org authentication boundaries and existing API contracts (`/api/parcels/[parcelId]/geometry` and `/api/parcels` flow).
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
  - `apps/web/components/maps/MapLibreParcelMap.tsx`
  - `apps/web/components/maps/DealParcelMap.tsx`
  - `apps/web/components/maps/heatmapPresets.ts`
  - `apps/web/components/maps/mapStyles.ts`
  - `apps/web/components/maps/useParcelGeometry.ts`
  - `apps/web/app/api/parcels/[parcelId]/geometry/route.ts`
  - `apps/web/app/api/parcels/route.ts`
  - `apps/web/app/api/map/prospect/route.ts`
  - `apps/web/app/api/map/comps/route.ts`
  - `apps/web/package.json` (add `maplibre-gl`, optional `supercluster`)
- **Preliminary tests (performed before adding this item):**

- **Implementation Plan (Option 3, Advanced Vector Pipeline):**
  1. Phase 0 — Measurement Baseline
     - Instrument existing Leaflet map with lightweight metrics (selection latency, geometry fetch time, render blocks at 12+ layers).
     - Define test datasets:
       - small (<=200 parcels),
       - medium (~2,000 parcels),
       - heavy (>=10,000 parcels).
     - Capture baseline via Playwright smoke + browser performance traces for before/after comparison.
  2. Phase 1 — Engine Selection and Foundation
     - Add `maplibre-gl` renderer path behind feature flag.
     - Introduce `MAP_RENDERER` feature gate:
       - default to current Leaflet in this phase,
       - opt-in MapLibre path guarded by env or feature flag.
     - Consolidate map-level shared controls/tokens in `MapLibreParcelMap.tsx` and shared map utility modules.
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

### MAP-002 — Authenticated Polygon Draw + Parcel Search on `/map`

- **Priority:** P0
- **Status:** Done
- **Scope:** Map interaction parity and prospecting workflow enablement
- **Problem:** The `/map` route supports search and parcel rendering, but lacks polygon draw and polygon-based parcel search, blocking the core “draw area, filter/search within it, render results” workflow.
- **Expected Outcome (measurable):**
  - A logged-in user can draw a polygon on `/map` and fetch parcels within that polygon.
  - Optional search text further filters polygon results without removing auth requirements.
  - Result parcels render as markers, and boundaries render when geometry is available.
- **Evidence:** Local dev incident report (2026-02-19) requiring “full map interaction behavior (polygon/search/draw + parcel rendering)” behind authenticated session.
- **Alignment:** Reuses existing authenticated endpoint `POST /api/map/prospect` and existing Leaflet map surface; does not relax `resolveAuth()` gates.
- **Risk/rollback:** Low. UI-only changes plus a new client call path. Rollback by hiding the draw control and leaving existing `/api/parcels` search path unchanged.
- **Acceptance Criteria / Tests:**
  1. `/map` shows a draw control in Leaflet renderer.
  2. Drawing a polygon triggers `POST /api/map/prospect` and renders returned parcels.
  3. Clearing the polygon restores base parcel list behavior.
  4. Search text combines with polygon search when polygon is active.
  5. Unauthenticated users continue to receive 401 from protected map APIs.
- **Files (target):**
  - `apps/web/app/map/page.tsx`
  - `apps/web/components/maps/ParcelMap.tsx`
  - `apps/web/app/api/map/prospect/route.ts` (no contract changes expected)
  - `pnpm -C apps/web lint` ✅ (pass)
  - `pnpm -C apps/web exec vitest run` ✅ (38 files, 418 tests)
  - baseline finding: current map page composes parcel data from `/api/parcels?hasCoords=true` and geometry via `GET /api/parcels/[parcelId]/geometry` returning `geom_simplified`.
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `apps/web/app/map/page.tsx`
    - `apps/web/components/maps/ParcelMap.tsx`
    - `apps/web/app/api/map/prospect/route.ts`
    - `apps/web/app/api/map/comps/route.ts`
- **Result:**
   - Local UI smoke (Playwright) confirmed polygon draw triggers `POST /api/map/prospect` (200) and clearing polygon restores `GET /api/parcels` flow.
   - Full verification gate passed in this pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

### MAP-003 — Verify LA Property DB Runtime Configuration in Production

- **Priority:** P0
- **Status:** Done
- **Scope:** Critical path for map search and geometry reliability
- **Problem:** Map and parcel routes depend on gateway-backed property DB credentials; missing or stale production values can cause empty parcel geometry, empty search results, and map failures.
- **Expected Outcome (measurable):**
  - Production confirms the active property DB env vars are present and valid for the active `prod` deployment environment.
  - Runtime checks show the app resolves to the intended Louisiana property database path and not a fallback or placeholder configuration.
  - Any config gap is documented with root cause and remediation date.
- **Evidence of need:** Recent map incidents in production show empty parcel geometry and search behavior consistent with missing/incorrect property DB credentials.
- **Alignment:** Preserves current auth boundaries and does not change client-visible contracts.
- **Risk/rollback:** Low operational risk; rollback is reverting to existing env values once validated baseline is restored.
- **Acceptance Criteria / Tests:**
  1. Validate the active property DB env vars are visible in production Vercel/project config.
  2. Confirm the required values are non-empty and non-placeholder (`placeholder`, `***`, etc.) via runtime checks.
  3. Add a startup health check log in logs/monitoring for any request path that hits property DB fallback clients.
- **Files (target):**
  - `apps/web/lib/server/propertyDbEnv.ts` (env loading path)
  - `apps/web/app/api/parcels/route.ts` (fallback route behavior)
  - `apps/web/app/api/map/prospect/route.ts`
  - `apps/web/app/api/parcels/[parcelId]/geometry/route.ts`
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `apps/web/lib/server/propertyDbEnv.ts`
    - `apps/web/app/api/parcels/route.ts`
    - `apps/web/app/api/map/prospect/route.ts`
    - `apps/web/app/api/parcels/[parcelId]/geometry/route.ts`
    - `scripts/parcels/check_property_db_runtime.ts`
    - `vercel env ls production` (project `gallagher-cres`) shows the active property DB env vars configured in Production.
  - **Result:**
    - Added one-time runtime health logs for property DB fallback request paths with placeholder detection.
    - Added explicit runtime check script for non-placeholder env + RPC probe (`api_search_parcels`).

### MAP-004 — Execute/Verify Parish Parcel Backfill From CSV to Production LA Property DB

- **Priority:** P0
- **Status:** Done
- **Scope:** Restore map geometry and parcel search inputs
- **Problem:** Imported CSVs for Lafayette, East Baton Rouge, and Ascension are not yet guaranteed to be reflected in the LA property DB used by production parcel fallback routes.
- **Expected Outcome (measurable):**
  - Parish CSV rows are imported into the correct production LA property DB schema/table set.
  - Post-import counts and checksum checks for affected parishes are stable and match expected file totals.
  - Backfilled geometry/address fields are available for the target parish set.
- **Evidence of need:** CSV compare work found no matching rows for those parishes in the current live parcel source path, while UI map queries returned no viable geometry.
- **Alignment:** Reuses existing production parcel fallback architecture and does not alter NextAuth org-scoped workflows.
- **Risk/rollback:** Medium if import is duplicated or mis-specified. Use idempotent load semantics and dedupe keys; keep import source and timestamped logs for rollback trace.
- **Acceptance Criteria / Tests:**
  1. Produce and archive import runbook/output (source file paths, row counts, batch size, time).
  2. Verify row deltas for each parish and ensure duplicate-safe behavior.
  3. Re-run map-read verification after import shows expected growth in property fallback hit-rate.
- **Files (target):**
  - `scripts/parcels/` (if import tooling exists; otherwise create one-off operational SQL/script with explicit scope)
  - `infra/sql/property-db-rpc-functions.sql` (if RPC-assisted dedupe/matching is used)
  - `parcel_data_updated/` source dataset (operational artifact)
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `scripts/parcels/backfill_property_db_from_csv.ts`
    - `parcel_data_updated/ascension-parcels.csv`
    - `parcel_data_updated/east-baton-rouge-parcels.csv`
    - `parcel_data_updated/lafayette-parcels.csv`
  - **Result:**
    - Added idempotent parish CSV backfill tooling with `dry-run` and `--apply` modes.
    - Added before/apply counters by parish (`existing`, `missing`, `inserted`, `failed`) and timestamped run report output in `output/parcel-backfill/`.
    - Dedupe key strategy uses deterministic `source_key` (`parish_csv:<parish>:<parcelId>`) and `on_conflict=source_key`.

### MAP-005 — Validate Production Map Search + Polygon Flow After Backfill

- **Priority:** P0
- **Status:** Done
- **Scope:** End-to-end functional recovery and regression prevention
- **Problem:** Search and polygon flow can still fail even with envs and data present if `/api/parcels`, `/api/map/prospect`, and parcel-geometry fallback paths diverge.
- **Expected Outcome (measurable):**
  - `/api/parcels?hasCoords=true` returns parcel candidates in production for authenticated calls.
  - Address search on `/api/parcels?search=<address>` returns relevant matches and respects auth.
  - `POST /api/map/prospect` returns parcels filtered to polygon boundary and can still combine with `search`.
  - `GET /api/parcels/{parcelId}/geometry?detail_level=low` returns `geom_simplified` for query matches and falls back to the gateway geometry path in expected order.
- **Evidence of need:** Current live map does not render polygons and blocks address search-to-map workflows.
- **Alignment:** No changes to org security model; only validates and hardens existing contract behavior.
- **Risk/rollback:** Low; this is verification and can be repeated on every release.
- **Acceptance Criteria / Tests:**
  1. Run authenticated production smoke checklist in this order:
     - `GET /api/parcels?hasCoords=true`
     - `GET /api/parcels?search=<known-address>`
     - `POST /api/map/prospect` with valid polygon payload
     - `GET /api/parcels/{parcelId}/geometry?detail_level=low` for returned candidates
  2. Confirm browser map at `/map` shows polygons and marker/selection behavior with auth.
  3. Capture and attach logs showing non-empty response bodies and status codes for each endpoint.
- **Files (target):**
  - `apps/web/app/api/parcels/route.ts`
  - `apps/web/app/api/map/prospect/route.ts`
  - `apps/web/app/api/parcels/[parcelId]/geometry/route.ts`
  - `apps/web/app/map/page.tsx`
  - `apps/web/components/maps/ParcelMap.tsx`
- **Operational verification:**
  - **Status:** **IMPLEMENTATION VERIFIED**
  - **Evidence:**
    - `scripts/parcels/smoke_map_parcel_prod.ts`
    - `apps/web/app/api/map/prospect/route.post.test.ts`
    - `apps/web/app/api/parcels/[parcelId]/geometry/route.test.ts`
- **Result:**
    - Added ordered authenticated smoke runner for production endpoints:
      - `GET /api/parcels?hasCoords=true`
      - `GET /api/parcels?search=<known-address>`
      - `POST /api/map/prospect`
      - `GET /api/parcels/{parcelId}/geometry?detail_level=low`
    - Smoke output captures status code, row counts, sample payload keys, candidate parcel id, and pass/fail in timestamped reports under `output/parcel-smoke/`.
    - 2026-02-20 regression hardening: `/api/parcels` search now canonicalizes street suffix variants (`drive`/`dr`, etc.) and maps stringified `geom_simplified` payloads to centroid coordinates; parcel geometry route and auth proxy now guard uncaught abort/reset errors with normalized responses.
### MAP-001a — Deterministic Map Base-Tile Fallback (OSM offline-safe)

- **Priority:** P2
- **Status:** Done
- **Scope:** Map stability in disconnected/offline/CI environments
- **Completion notes (2026-02-15):** Local tile endpoint at `/api/map/tiles/[z]/[x]/[y]` returns 1x1 neutral-gray PNG (67 bytes) with aggressive cache headers. Shared tile URL resolver at `apps/web/components/maps/tileUrls.ts` with `NEXT_PUBLIC_MAP_TILE_MODE` env var (remote/local/auto). Both MapLibre (`getStreetTileUrls()`) and Leaflet (`getLeafletStreetTileUrl()`) renderers wired through resolver. `NEXT_PUBLIC_MAP_TILE_MODE=local` eliminates all external tile DNS errors.
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
  - `apps/web/.env.example` or `.env.local` documentation note (new/env guidance)
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
- **Evidence:** AUI-001 added renderer stubs for `agent_progress`, `agent_switch`, `tool_call` events, but the backend `apps/web/app/api/chat/route.ts` does not emit these event types into the SSE stream. The SDK produces them — we just need to forward them.
- **Alignment:** Builds directly on AUI-001's structured event renderers. No changes to agent execution pipeline.
- **Risk/rollback:** Low. SSE event additions are additive — old clients ignore unknown event types. Rollback by removing new SSE event lines from chat route.
- **Acceptance Criteria / Tests:**
  1. `apps/web/app/api/chat/route.ts` subscribes to `RunItemStreamEvent` and `RunAgentUpdatedStreamEvent` from the SDK runner
  2. New SSE event types emitted: `agent_switch` (agent name + model), `tool_start` (tool name + args summary), `tool_end` (tool name + result summary), `handoff` (from → to agent)
  3. Chat UI renders these via existing AUI-001 structured event components
  4. Unit test: synthetic stream with mixed text + tool + agent events renders correctly
  5. No regression in existing text streaming behavior
- **Files (target):**
  - `apps/web/app/api/chat/route.ts` — add stream event forwarding
  - `apps/web/components/chat/MessageBubble.tsx` — wire event renderers
  - `apps/web/components/chat/AgentStatusChip.tsx` — new: shows active agent name
  - `apps/web/components/chat/ToolStatusChip.tsx` — new: shows tool execution status
  - `apps/web/lib/chat/streamEventTypes.ts` — new: shared SSE event type definitions
- **Implementation Steps:**
  1. Define shared SSE event type schema in `apps/web/lib/chat/streamEventTypes.ts` (agent_switch, tool_start, tool_end, handoff)
  2. In `apps/web/app/api/chat/route.ts`, hook into the SDK runner's event stream — for each `RunItemStreamEvent` of type `tool_called`/`tool_result` and each `RunAgentUpdatedStreamEvent`, emit a corresponding SSE event
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
  - Verification commands run: `pnpm lint` ✅, `pnpm test` ✅, `pnpm typecheck` ✅, `pnpm build` ✅

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
    - `pnpm typecheck` ✅
    - `pnpm build` ✅

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
    - `pnpm typecheck` ✅
    - `pnpm build` ✅

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
    - `pnpm typecheck` ✅
    - `pnpm test` ✅
    - `pnpm build` ✅

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
    - `pnpm typecheck` ✅
    - `pnpm build` ✅

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
  - `packages/openai/src/agents/coordinator.ts` — update coordinator instructions to describe when to use consult-as-tool vs handoff
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
    - `pnpm typecheck` ✅
    - `pnpm build` ✅

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
  - `packages/openai/test/phase1/utils/retry.phase1.test.ts` — comprehensive retry tests
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
    - `pnpm typecheck` ✅
    - `pnpm build` ✅

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
- **Evidence:** Current manual history assembly in `apps/web/app/api/chat/route.ts` doesn't compact or deduplicate. Long conversations hit context limits.
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
- **Problem:** The A→G execution stream was completed across multiple implementation passes, but ROADMAP lacked a single formal compliance entry proving end-to-end closure against `docs/archive/2026-03-20-root-cleanup/Entitlement_OS_Meta_Prompt.md`.
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

### OBS-001 — Production Observability Stack for Full-Page and API Activity

- **Priority:** P0
- **Status:** Done (2026-03-09)
- **Scope:** End-to-end production monitoring, telemetry, and operator diagnostics
- **Problem:** Production incidents currently require ad hoc repro and log spelunking. We lack a unified observability path for page failures, API failures, request correlation, synthetic monitoring, and operator-visible diagnostics across the full app surface.
- **Expected Outcome (measurable):**
  - Browser telemetry captures route transitions, unhandled page errors, failed fetches, and client-side performance context with request/session correlation ids.
  - Server-side API routes emit structured request logs with request ids, auth/org context, latency, upstream dependency markers, and normalized error metadata.
  - Admin/operator surface exposes recent telemetry and synthetic-monitor results so incidents can be triaged without digging through raw console output.
  - Scheduled monitor covers critical authenticated and unauthenticated production journeys and records failures with enough context to fix them.
- **Evidence of need:** `/map` page parcel-load failures (`Failed to load parcels. Please refresh and try again.`) currently require manual investigation, and the current health monitor only covers a narrow healthcheck path.
- **Alignment:** Preserves auth/org-scoping boundaries, extends existing request-id and Sentry instrumentation, and supports the gateway-first production architecture without introducing silent fallbacks.
- **Risk/rollback:** Medium. Touches shared request lifecycle and client telemetry; rollback by disabling the new observability provider/routes/monitor script while preserving request-id propagation.
- **Acceptance Criteria / Tests:**
  - Shared observability helpers exist for structured server logging and client event ingestion.
  - Critical routes/pages emit correlated telemetry without weakening auth or leaking secrets.
  - Admin observability API exposes recent events and monitor snapshots behind existing admin auth controls.
  - Production monitor script validates key page/API flows and persists results for operator review.
  - Verification gate passes (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`).
- **Completion Evidence (2026-03-09):**
  - Shared observability stack is implemented and wired:
    - `apps/web/lib/server/observability.ts`
    - `apps/web/lib/server/observabilityStore.ts`
    - `apps/web/app/api/observability/events/route.ts`
    - `apps/web/app/api/admin/observability/route.ts`
    - `apps/web/components/observability/observability-provider.tsx`
    - `apps/web/components/observability/observability-boundary.tsx`
    - `apps/web/app/layout.tsx`
    - `scripts/observability/monitor_production.ts`
    - `scripts/observability/start_monitor_prod.sh`
  - Admin/auth and client observability tests pass:
    - `pnpm -C apps/web exec vitest run app/api/admin/observability/route.test.ts components/observability/client-telemetry.test.ts components/observability/observability-provider.test.tsx components/observability/observability-boundary.test.tsx`
  - Production monitor run executed and artifacts persisted:
    - `output/observability/monitor-2026-03-09-192011029Z.json`
    - `output/observability/monitor-2026-03-09-192011029Z.log`
  - Verification gate passed:
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=placeholder pnpm build`

### AIOPS-001 — Autonomous DevOps Self-Healing Sidecar

- **Priority:** P1
- **Status:** Done (2026-03-11)
- **Scope:** Autonomous production monitoring, diagnostics, patch planning, validation, and guarded deployment orchestration
- **Problem:** Production reliability work still depends on ad hoc operator loops across monitor artifacts, observability events, Sentry, test harnesses, patch drafting, and deploy commands. There is no single control plane that can observe gallagherpropco.com, classify incidents, trace likely code owners/files, generate candidate repairs, validate them, and advance only through guarded release stages.
- **Expected Outcome (measurable):**
  - A repo-local `ai-devops/` sidecar can run `monitor -> test -> analyze -> diagnose -> fix -> validate -> review -> deploy -> monitor` as a continuous loop without weakening existing auth, org-scoping, or deployment safety rules.
  - Monitor ingestion reuses current production observability signals (`scripts/observability/monitor_production.ts`, admin observability API, and optional Sentry) and persists normalized state/artifacts under `ai-devops/monitoring` and `ai-devops/artifacts`.
  - Patch generation defaults to guarded proposal mode, with auto-apply and auto-production deployment blocked behind explicit env safety flags, passing validation, and rollback metadata.
  - CI validates the sidecar’s TypeScript, analyzer logic, and smoke harnesses without changing the app’s core request path.
- **Evidence of need:** Current production checks on `https://gallagherpropco.com` show recurring `/api/health` 500, `/api/deals` 503, and parcel/prospect 502 gateway failures, while diagnosis still requires manual correlation across monitor output, admin observability, and route code.
- **Alignment:** Reuses existing observability/admin APIs, Vercel/GitHub deployment flow, and resilient-tool patterns; keeps the app runtime unchanged by implementing the autonomous system as an additive sidecar.
- **Risk/rollback:** Medium. Adds automation that can touch git/deploy flows if enabled. Rollback by disabling `ai-devops` workflows/scripts and removing the sidecar path without affecting the production app runtime.
- **Completion Evidence (2026-03-11):**
  - Sidecar architecture, agents, shared contracts, scripts, and harnesses landed under:
    - `ai-devops/README.md`
    - `ai-devops/shared/types.ts`
    - `ai-devops/shared/config.ts`
    - `ai-devops/shared/artifact-store.ts`
    - `ai-devops/shared/http.ts`
    - `ai-devops/shared/discovery.ts`
    - `ai-devops/shared/error-rules.ts`
    - `ai-devops/agents/orchestrator.ts`
    - `ai-devops/agents/monitor.ts`
    - `ai-devops/agents/qa-tester.ts`
    - `ai-devops/agents/log-analyzer.ts`
    - `ai-devops/agents/root-cause.ts`
    - `ai-devops/agents/patch-engineer.ts`
    - `ai-devops/agents/test-validator.ts`
    - `ai-devops/agents/code-review.ts`
    - `ai-devops/agents/deploy.ts`
    - `ai-devops/agents/chaos-agent.ts`
    - `ai-devops/scripts/run-agents.ts`
    - `ai-devops/scripts/run-tests.ts`
    - `ai-devops/scripts/analyze-logs.ts`
    - `ai-devops/tests/api-tests/harness.ts`
    - `ai-devops/tests/playwright/harness.ts`
    - `ai-devops/ci/github-actions.yml`
    - `.github/workflows/ai-devops.yml`
  - Root scripts and dependency wiring added in `package.json`.
  - Focused sidecar verification passed:
    - `pnpm ai-devops:typecheck`
    - `pnpm ai-devops:test:unit`
    - `pnpm ai-devops:run -- --once`
    - `pnpm ai-devops:analyze -- --refresh-monitor`
    - `pnpm ai-devops:test -- --mode ui`
  - Live production smoke evidence persisted in:
    - `ai-devops/monitoring/monitor-latest.json`
    - `ai-devops/monitoring/error-classification.json`
    - `ai-devops/artifacts/test-results.json`
    - `ai-devops/artifacts/log-analysis.json`
    - `ai-devops/artifacts/root-cause.json`
    - `ai-devops/artifacts/deployment-report.json`
  - Repo verification gate passed:
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=placeholder pnpm build`

### AIOPS-002 — Autonomous Remediation Execution Path (P1)

- **Priority:** P1
- **Status:** Done (2026-03-11)
- **Scope:** Promote the additive `ai-devops/` sidecar from guarded monitor-only operation into autonomous patch synthesis and CI-safe self-remediation via GitHub PRs.
- **Problem:** `AIOPS-001` landed the monitoring, QA, diagnosis, validation, and deploy-control scaffolding, but the default patch provider was still placeholder-only and the scheduled workflow still ran in proposal/disabled deploy mode. The sidecar could detect incidents, but it could not yet synthesize a real patch and advance it through a clean remediation branch automatically.
- **Expected Outcome (measurable):**
  - `ai-devops` has a built-in OpenAI-backed patch generator that consumes log-analysis/root-cause artifacts and returns structured unified diffs, tests, and rollback notes without requiring a separately maintained external diff service.
  - The deploy path can create a clean remediation branch and PR safely from automation, without bundling local dirty-worktree changes or generated monitoring artifacts.
  - The scheduled GitHub Actions workflow runs the remediation loop in `apply + pr/preview-safe` mode when required secrets are present, while preserving the existing production safety gates around review, validation, preview, and auto-production.
- **Evidence of need:** Current incidents on `https://gallagherpropco.com` were already being surfaced by the sidecar, but the latest runs still ended in placeholder patch output and skipped deployment because no real diff generator or autonomous PR path was wired.
- **Alignment:** Reuses the existing `ai-devops` sidecar, `packages/openai` strict JSON wrapper, current GitHub/Vercel release flow, and repo safety rules; keeps auto-production opt-in only.
- **Risk/rollback:** Medium. The main risks are unsafe patch drafts, dirty-worktree leakage into remediation branches, and CI credential/config mismatches. Rollback by returning the workflow to `propose`/`disabled`, removing the built-in patch command default, and disabling the autonomous PR stage.
- **Completion Evidence (2026-03-11):**
  - Added built-in patch synthesis using the repo OpenAI wrapper and local diff construction in:
    - `ai-devops/scripts/generate-patch.ts`
    - `ai-devops/shared/patch-generation.ts`
    - `ai-devops/shared/config.ts`
    - `ai-devops/shared/diff.ts`
  - Hardened deploy automation to use isolated git worktrees plus CI/local git strategy selection in:
    - `ai-devops/agents/deploy.ts`
    - `ai-devops/agents/test-validator.ts`
  - Added focused coverage for the new remediation path in:
    - `ai-devops/tests/api-tests/config.test.ts`
    - `ai-devops/tests/api-tests/deploy.test.ts`
    - `ai-devops/tests/api-tests/patch-generation.test.ts`
  - Updated autonomous remediation docs and workflow defaults in:
    - `ai-devops/README.md`
    - `ai-devops/ci/github-actions.yml`
    - `.github/workflows/ai-devops.yml`
    - `ai-devops/tsconfig.json`
  - Built-in patch provider smoke passed against current production incident artifacts, producing a git-style diff preview from `ai-devops/scripts/generate-patch.ts`.
  - One-shot orchestration smoke passed with the faster patch model defaults:
    - `AI_DEVOPS_PATCH_MODEL=gpt-5-mini AI_DEVOPS_PATCH_REASONING_EFFORT=low pnpm ai-devops:run -- --once`
  - Verification gate passed:
    - `pnpm ai-devops:typecheck`
    - `pnpm ai-devops:test:unit`
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=placeholder pnpm build`
- **Acceptance Criteria / Tests:**
  - `ai-devops/agents/*.ts` implements the orchestrator, monitor, QA, log analysis, root cause, patch engineer, test validation, code review, deploy, and chaos agents with shared artifact contracts.
  - `ai-devops/scripts/run-agents.ts`, `run-tests.ts`, and `analyze-logs.ts` execute the loop in one-shot or continuous modes.
  - `ai-devops/tests/api-tests` and `ai-devops/tests/playwright` provide automated API/UI coverage for `/`, `/login`, `/map`, `/deals`, `/api/health`, `/api/deals`, `/api/parcels`, `/api/map/prospect`, and `/api/map/comps`, including discovered-route manifest expansion.
  - Guardrails prevent unsafe deploys by default: proposal-only patch mode unless explicitly enabled, branch/PR workflow before production, validation gates, and rollback metadata.
  - CI workflow exists for the sidecar and focused verification passes for `ai-devops`.

### AIOPS-003 — Upstream-Outage Patch Suppression (P1)

- **Priority:** P1
- **Status:** Done (2026-03-11)
- **Scope:** Prevent the `PATCH_ENGINEER_AGENT` from generating repository diffs when the incident classifier already identifies an upstream gateway/backend/database outage as the sole actionable failure domain.
- **Problem:** After `AIOPS-002`, the patch engine could still produce code diffs during live gateway or backend outages. That creates noisy remediation PRs for incidents that should instead be resolved by restoring upstream health or environment alignment.
- **Expected Outcome (measurable):**
  - The patch engine returns a first-class suppressed proposal instead of a diff when every actionable error cluster is upstream-only.
  - Validation and review treat suppressed proposals as safe no-op outcomes, and deploy continues to skip because no repository files changed.
  - Mixed incidents still reach the patch generator; only pure upstream outage clusters are suppressed.
- **Evidence of need:** The latest prod incident run still generated a health-route diff even though log-analysis and root-cause artifacts prioritized gateway/property-db reachability and env alignment over repository code changes.
- **Alignment:** Reuses the existing diagnostic taxonomy, keeps remediation artifact visibility, and strengthens the deploy safety model without weakening existing validation or review gates.
- **Risk/rollback:** Low. The main risk is over-suppressing legitimate code regressions; rollback by removing the suppression helper and reverting validation/review special-casing for suppressed proposals.
- **Completion Evidence (2026-03-11):**
  - Added upstream-outage suppression heuristics and suppressed proposal generation in:
    - `ai-devops/shared/patch-suppression.ts`
    - `ai-devops/agents/patch-engineer.ts`
    - `ai-devops/shared/types.ts`
  - Taught validation and review to treat suppressed proposals as safe no-op outcomes in:
    - `ai-devops/agents/test-validator.ts`
    - `ai-devops/agents/code-review.ts`
  - Added focused unit coverage for suppression decisions and agent behavior in:
    - `ai-devops/tests/api-tests/patch-suppression.test.ts`
    - `ai-devops/tests/api-tests/patch-engineer.test.ts`
    - `ai-devops/tests/api-tests/review-validation.test.ts`
  - Updated operator docs in:
    - `ai-devops/README.md`
- **Acceptance Criteria / Tests:**
  - Pure `database_connectivity`, `upstream_failure`, and `gateway_unavailable` incident sets suppress patch generation.
  - Mixed incidents with non-upstream error clusters still allow patch synthesis.
  - Suppressed proposals do not produce diffs, do not fail validation, and are skipped safely by deploy controls.

### AIOPS-004 — Upstream Remediation Artifacting (P1)

- **Priority:** P1
- **Status:** Done (2026-03-12)
- **Scope:** When the patch engine suppresses code changes for a pure upstream outage, emit a concrete infra remediation artifact that identifies the affected routes, required env vars/headers, source files, and operator verification steps.
- **Problem:** `AIOPS-003` correctly stops noisy code patches during upstream outages, but the current suppressed proposal still leaves the operator with only a summary and rollback notes. The system should convert that suppression into an actionable remediation checklist tied to the actual gateway/env wiring in the repo.
- **Expected Outcome (measurable):**
  - Suppressed incident cycles generate a machine-readable remediation artifact with route-to-dependency mapping and targeted checks.
  - The artifact identifies the exact env vars, optional auth headers, and health endpoints implicated by the current outage cluster.
  - The live monitor loop keeps writing the latest remediation artifact for the current incident without proposing repository diffs.
- **Evidence of need:** The active `gallagherpropco.com` incident is still rooted in property-db/gateway reachability and Cloudflare Access alignment, so the next useful autonomous output is concrete operator guidance rather than another application-code patch attempt.
- **Alignment:** Extends the additive `ai-devops` sidecar, reuses the current route/error taxonomy, and preserves the no-diff suppression safety model.
- **Risk/rollback:** Low. The main risk is stale or over-generalized remediation guidance; rollback by removing the artifact generator and reverting to suppressed proposal summaries only.
- **Completion Evidence (2026-03-12):**
  - Added infra remediation report types and route-to-dependency mapping in:
    - `ai-devops/shared/types.ts`
    - `ai-devops/shared/upstream-remediation.ts`
  - Persisted suppression-aware artifacts from the patch engineer in:
    - `ai-devops/agents/patch-engineer.ts`
  - Added focused coverage for remediation report generation and artifact persistence in:
    - `ai-devops/tests/api-tests/upstream-remediation.test.ts`
    - `ai-devops/tests/api-tests/patch-engineer.test.ts`
  - Updated operator docs in:
    - `ai-devops/README.md`
  - Verified the active production incident now writes:
    - `ai-devops/artifacts/upstream-remediation.json`
    - `ai-devops/artifacts/patch-proposal.json`
    - `ai-devops/artifacts/patch.diff` (0 bytes during suppressed upstream outages)
  - Verified the continuous loop is running on the updated code path and refreshing:
    - `ai-devops/monitoring/system-state.json`
    - `ai-devops/artifacts/upstream-remediation.json`
    - `ai-devops/artifacts/patch-proposal.json`
- **Acceptance Criteria / Tests:**
  - Suppressed upstream-only incidents emit an active remediation artifact with affected route groups, dependency metadata, and operator check ids.
  - Suppressed incidents continue to emit an empty diff proposal and do not regress deploy safety behavior.
  - The continuous loop refreshes remediation artifacts for the live incident without proposing repository changes.

### AIOPS-005 — Direct Gateway Diagnostics (P1)

- **Priority:** P1
- **Status:** Done (2026-03-12)
- **Scope:** Add a direct gateway diagnostic path to `ai-devops` so each incident cycle can distinguish public app failures from upstream gateway/auth/env failures using the configured gateway credentials and Cloudflare Access headers.
- **Problem:** The sidecar currently sees only the public application symptoms. During gateway incidents it can suppress code patches and emit remediation guidance, but it still lacks a first-class direct probe of the underlying gateway contract. That leaves the analyzer unable to say whether the gateway itself is down, auth is rejected, or the app-to-gateway path is the only failing boundary.
- **Expected Outcome (measurable):**
  - The monitor writes a separate machine-readable direct gateway diagnostics artifact when `LOCAL_API_URL` and `LOCAL_API_KEY` are available in the runner.
  - Log analysis incorporates failing direct gateway probes as structured diagnostics without polluting the public app-health summary.
  - Suppression remains active for pure infra/env/auth gateway incidents; no repository diff is proposed for direct gateway failures.
- **Evidence of need:** The live `gallagherpropco.com` incident remains clustered around `LOCAL_API_URL`/`LOCAL_API_KEY` and Cloudflare Access alignment, but the current sidecar evidence is still limited to public app routes and secondary observability signals.
- **Alignment:** Extends the additive `ai-devops` sidecar, reuses the existing gateway env contract, and improves diagnosis precision without weakening deploy safety or org-scoped runtime behavior.
- **Risk/rollback:** Low. The main risk is runner-specific false positives if direct gateway secrets are absent or stale; rollback by removing the direct diagnostic artifact and analyzer hook.
- **Completion Evidence (2026-03-12):**
  - `ai-devops/shared/types.ts`
  - `ai-devops/shared/gateway-diagnostics.ts`
  - `ai-devops/shared/error-rules.ts`
  - `ai-devops/shared/patch-suppression.ts`
  - `ai-devops/agents/monitor.ts`
  - `ai-devops/agents/log-analyzer.ts`
  - `ai-devops/tests/api-tests/gateway-diagnostics.test.ts`
  - `ai-devops/tests/api-tests/log-analyzer.test.ts`
  - `ai-devops/tests/api-tests/patch-suppression.test.ts`
  - `ai-devops/README.md`
  - `ai-devops/artifacts/gateway-diagnostics.json`
- **Acceptance Criteria / Tests:**
  - Direct gateway diagnostics emit a dedicated artifact when the runner has the required gateway env contract.
  - The analyzer emits a `gateway-direct` cluster when direct probes fail, preserving route-level separation from the public app monitor.
  - Pure gateway/env/auth incidents remain patch-suppressed and keep `ai-devops/artifacts/patch.diff` empty.
  - Verified with `pnpm ai-devops:test:unit`, `pnpm ai-devops:typecheck`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `OPENAI_API_KEY=placeholder pnpm build`, and `pnpm ai-devops:run -- --once --json`.

### AIOPS-006 — Cloudflare Edge Failure Classification (P1)

- **Priority:** P1
- **Status:** Done (2026-03-12)
- **Scope:** Upgrade direct gateway diagnostics so `ai-devops` fingerprints Cloudflare-edge failures, classifies them separately from generic gateway outages, and emits remediation checks that point operators at tunnel, DNS, and Access policy verification.
- **Problem:** `AIOPS-005` proves whether the gateway itself is failing, but the analyzer still buckets current `530` responses as generic `gateway_unavailable`. That obscures the likely Cloudflare edge/tunnel boundary and leaves the remediation artifact less specific than the evidence now supports.
- **Expected Outcome (measurable):**
  - Direct gateway artifacts include failure fingerprints for Cloudflare-style edge responses.
  - Log analysis emits a dedicated edge-oriented incident class for direct gateway failures that are failing at the Cloudflare boundary.
  - Suppression and upstream remediation stay in sync for `gateway-direct` auth/env/edge incidents, including root-cause hints and targeted operator checks.
- **Evidence of need:** The live `gallagherpropco.com` incident is currently returning direct `530` responses from `https://api.gallagherpropco.com`, which is stronger evidence than a generic upstream outage and should steer operators toward edge/tunnel remediation instead of app code.
- **Alignment:** Extends the additive `ai-devops` sidecar, reuses the direct gateway artifact, and keeps the no-diff safety model in place while increasing incident precision.
- **Risk/rollback:** Low. The main risk is over-classifying ambiguous 5xx pages as Cloudflare edge failures; rollback by removing the fingerprint classifier and reverting to the generic gateway-direct bucket.
- **Completion Evidence (2026-03-12):**
  - Added direct gateway failure fingerprints and Cloudflare-edge-aware types in:
    - `ai-devops/shared/types.ts`
    - `ai-devops/shared/gateway-diagnostics.ts`
  - Added Cloudflare-edge incident classification and signal messaging in:
    - `ai-devops/agents/log-analyzer.ts`
    - `ai-devops/shared/error-rules.ts`
  - Kept suppression and upstream remediation aligned for gateway-direct edge/auth/env incidents in:
    - `ai-devops/shared/patch-suppression.ts`
    - `ai-devops/shared/upstream-remediation.ts`
  - Added focused coverage in:
    - `ai-devops/tests/api-tests/gateway-diagnostics.test.ts`
    - `ai-devops/tests/api-tests/log-analyzer.test.ts`
    - `ai-devops/tests/api-tests/upstream-remediation.test.ts`
    - `ai-devops/tests/api-tests/patch-suppression.test.ts`
  - Updated operator docs in:
    - `ai-devops/README.md`
  - Verified the active production incident now emits:
    - `ai-devops/artifacts/gateway-diagnostics.json` with Cloudflare-edge fingerprints
    - `ai-devops/artifacts/log-analysis.json` with `gateway-direct:cloudflare_edge_failure`
    - `ai-devops/artifacts/upstream-remediation.json` with Cloudflare/tunnel-specific operator checks
- **Acceptance Criteria / Tests:**
  - Direct gateway artifacts fingerprint Cloudflare-style failures without weakening the existing env/auth diagnostics.
  - The analyzer emits `cloudflare_edge_failure` for failing direct probes at the Cloudflare boundary and preserves patch suppression for upstream-only incidents.
  - Upstream remediation includes `gateway-direct` dependency metadata, Cloudflare/tunnel checks, and root-cause hints for gateway-direct cluster ids.
  - Verified with `pnpm ai-devops:test:unit`, `pnpm ai-devops:typecheck`, `pnpm ai-devops:run -- --once --json`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### AIOPS-007 — Edge Smoke Artifact Integration (P1)

- **Priority:** P1
- **Status:** Done (2026-03-12)
- **Scope:** Reuse the existing `pnpm smoke:gateway:edge-access` matrix inside `ai-devops` so Cloudflare-edge incidents persist a machine-readable smoke artifact and expose whether the gateway is failing in `without_access`, `with_access`, or both modes.
- **Problem:** `AIOPS-006` classifies the incident correctly, but the operator still has to run the edge smoke matrix manually to know whether the Cloudflare boundary is blocking unauthenticated requests correctly, failing authenticated requests, or both. That information should be captured automatically during an edge incident cycle.
- **Expected Outcome (measurable):**
  - `ai-devops` runs the existing edge smoke script only when direct gateway diagnostics indicate a Cloudflare-edge incident.
  - The smoke result is written as a dedicated artifact with pass/fail breakdown for `without_access` and `with_access` requests.
  - Log analysis and remediation can reference the smoke artifact so operators know whether to focus on Access policy drift, origin/tunnel reachability, or both.
- **Evidence of need:** The live `gallagherpropco.com` incident is returning `530` through the Cloudflare edge, and the repo already contains a validated smoke matrix for this boundary. The missing piece is wiring that matrix into the autonomous incident loop.
- **Alignment:** Reuses `scripts/smoke_gateway_edge_access.ts`, existing Cloudflare runbooks, and the additive `ai-devops` sidecar without weakening patch/deploy safety.
- **Risk/rollback:** Low. Main risks are longer incident cycles and noisy smoke failures when secrets are absent. Rollback by disabling the smoke invocation and reverting to checklist-only remediation.
- **Completion Evidence (2026-03-12):**
  - `ai-devops/shared/types.ts`
  - `ai-devops/shared/gateway-edge-smoke.ts`
  - `ai-devops/agents/qa-tester.ts`
  - `ai-devops/agents/patch-engineer.ts`
  - `ai-devops/agents/orchestrator.ts`
  - `ai-devops/shared/upstream-remediation.ts`
  - `ai-devops/scripts/run-tests.ts`
  - `scripts/smoke_gateway_edge_access.ts`
  - `ai-devops/tests/api-tests/gateway-edge-smoke.test.ts`
  - `ai-devops/tests/api-tests/upstream-remediation.test.ts`
  - `ai-devops/tests/api-tests/patch-engineer.test.ts`
  - `ai-devops/README.md`
  - `ai-devops/artifacts/gateway-edge-smoke.json`
- **Acceptance Criteria / Tests:**
  - Cloudflare-edge incidents run the smoke matrix only when direct diagnostics fingerprint the edge failure domain.
  - `ai-devops/artifacts/gateway-edge-smoke.json` is emitted and recorded under `artifacts/test-results.json -> gatewayEdgeSmoke`.
  - `ai-devops/artifacts/upstream-remediation.json` includes `edge-smoke-artifact` so operators can distinguish Access deny behavior from origin/tunnel pass-through.
  - Verified with `pnpm ai-devops:test:unit`, `pnpm ai-devops:typecheck`, `pnpm ai-devops:run -- --once --json`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### AIOPS-008 — Cloudflare Tunnel Failure Promotion (P1)

- **Priority:** P1
- **Status:** Done (2026-03-12)
- **Scope:** Promote the `with_access` edge-smoke pattern into a tunnel-specific incident class when Cloudflare Access passes but the downstream gateway still returns Cloudflare tunnel errors such as `1033`.
- **Problem:** `AIOPS-007` proves whether Access deny behavior is working, but the analyzer and remediation output still stop at `cloudflare_edge_failure`. In the current live incident, authenticated requests are not blocked at the edge; they are reaching a Cloudflare tunnel failure behind successful Access auth. The sidecar should express that explicitly.
- **Expected Outcome (measurable):**
  - `ai-devops` promotes Access-pass-through + Cloudflare tunnel signatures into a dedicated diagnostic kind instead of generic edge failure.
  - Root-cause output and upstream remediation shift from generic edge checks toward tunnel/origin checks when the smoke matrix proves Access is healthy.
  - Patch suppression remains active for the tunnel-specific incident class.
- **Evidence of need:** The live `gateway-edge-smoke.json` artifact shows `without_access=blocked-as-expected` and `with_access` responses returning Cloudflare `error-1033`, which means the problem is beyond Access policy and should be surfaced as such.
- **Alignment:** Builds directly on `AIOPS-006` and `AIOPS-007`, reuses the existing smoke artifact, and keeps the sidecar infra-first during upstream incidents.
- **Risk/rollback:** Low. Main risk is overfitting to a specific Cloudflare signature. Roll back by removing the tunnel-specific classification and falling back to generic `cloudflare_edge_failure`.
- **Completion Evidence (2026-03-12):**
  - `ai-devops/shared/types.ts`
  - `ai-devops/shared/error-rules.ts`
  - `ai-devops/shared/patch-suppression.ts`
  - `ai-devops/shared/upstream-remediation.ts`
  - `ai-devops/shared/gateway-edge-smoke.ts`
  - `ai-devops/agents/log-analyzer.ts`
  - `ai-devops/tests/api-tests/log-analyzer.test.ts`
  - `ai-devops/tests/api-tests/patch-suppression.test.ts`
  - `ai-devops/tests/api-tests/upstream-remediation.test.ts`
  - `ai-devops/README.md`
  - `ai-devops/artifacts/log-analysis.json`
  - `ai-devops/artifacts/root-cause.json`
  - `ai-devops/artifacts/upstream-remediation.json`
- **Acceptance Criteria / Tests:**
  - Access-pass-through plus Cloudflare `error-1033` is promoted to `cloudflare_tunnel_failure` instead of generic `cloudflare_edge_failure`.
  - Root-cause output points operators at `gpc-hp-tunnel`, `api.gallagherpropco.com -> localhost:8000`, and the origin service boundary.
  - Upstream remediation includes `cloudflare-tunnel` and a tunnel-aware `edge-smoke-artifact` summary while patch suppression remains active.
  - Verified with `pnpm ai-devops:test:unit`, `pnpm ai-devops:typecheck`, `pnpm ai-devops:run -- --once --json`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### AIOPS-009 — Tunnel Contract Artifact and Remediation Wiring (P1)

- **Priority:** P1
- **Status:** Done (2026-03-12)
- **Scope:** Emit a machine-readable `cloudflare-tunnel-contract.json` artifact from the documented Cloudflare tunnel topology and thread it into the upstream remediation output for tunnel-specific incidents.
- **Problem:** `AIOPS-008` correctly classifies the live outage as `cloudflare_tunnel_failure`, but the sidecar still makes operators translate prose hints back into the expected tunnel wiring manually. The monitor should publish the exact documented `tunnel -> hostname -> origin` contract and surface mismatches directly in remediation.
- **Expected Outcome (measurable):**
  - The monitor writes `ai-devops/artifacts/cloudflare-tunnel-contract.json` with the documented tunnel name, tunnel id, public API hostname, expected origin URL, and runtime wiring checks.
  - Tunnel-specific remediation links to the contract artifact and tells operators whether `LOCAL_API_URL` matches the documented public hostname.
  - Existing tunnel classification and patch suppression behavior remain unchanged.
- **Evidence of need:** The live incident is already narrowed to Cloudflare tunnel/origin reachability, and the repo docs define the exact expected topology (`gpc-hp-tunnel`, `api.gallagherpropco.com`, `localhost:8000`). That contract should be surfaced automatically during the incident loop instead of remaining doc-only.
- **Alignment:** Reuses `docs/CLOUDFLARE.md`, `apps/web/lib/server/propertyDbEnv.ts`, and the additive `ai-devops` artifact pipeline without changing deploy or patch safety.
- **Risk/rollback:** Low. Main risk is drift between docs and emitted artifact parsing. Roll back by removing the contract artifact wiring and falling back to doc references only.
- **Completion Evidence (2026-03-12):**
  - `ai-devops/shared/types.ts`
  - `ai-devops/shared/tunnel-contract.ts`
  - `ai-devops/agents/monitor.ts`
  - `ai-devops/agents/orchestrator.ts`
  - `ai-devops/agents/patch-engineer.ts`
  - `ai-devops/shared/upstream-remediation.ts`
  - `ai-devops/tests/api-tests/tunnel-contract.test.ts`
  - `ai-devops/tests/api-tests/upstream-remediation.test.ts`
  - `ai-devops/README.md`
  - `ai-devops/artifacts/cloudflare-tunnel-contract.json`
  - `ai-devops/artifacts/upstream-remediation.json`
- **Acceptance Criteria / Tests:**
  - The monitor emits `ai-devops/artifacts/cloudflare-tunnel-contract.json` with the documented tunnel name, tunnel id, API hostname, expected origin URL, and runtime alignment checks.
  - Tunnel-specific remediation includes `tunnel-contract-artifact` so operators can see whether `LOCAL_API_URL` matches the documented public route before debugging the connector/origin.
  - Tunnel classification and patch suppression behavior remain unchanged for the active incident.
  - Verified with `pnpm ai-devops:test:unit`, `pnpm ai-devops:typecheck`, `pnpm ai-devops:run -- --once --json`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### AIOPS-010 — Tunnel Incident Handoff Artifact (P1)

- **Priority:** P1
- **Status:** Done (2026-03-12)
- **Scope:** Emit a dedicated `cloudflare-tunnel-handoff.json` artifact that collapses the active tunnel incident into one operator packet containing the failing direct probes, edge-smoke tunnel evidence, documented tunnel contract, and the narrowed remediation checks.
- **Problem:** `AIOPS-009` makes the tunnel contract explicit, but the operator still has to read `gateway-diagnostics.json`, `gateway-edge-smoke.json`, `cloudflare-tunnel-contract.json`, and `upstream-remediation.json` separately to act on the outage. The sidecar should package the actionable tunnel evidence into one handoff artifact.
- **Expected Outcome (measurable):**
  - When `cloudflare_tunnel_failure` is active, `ai-devops` writes `ai-devops/artifacts/cloudflare-tunnel-handoff.json`.
  - The handoff artifact includes the active cluster summary, failing direct gateway probes with `cf-ray`/request ids, the edge-smoke tunnel count, the documented tunnel/origin contract, and the exact tunnel-focused remediation checks.
  - Existing suppression, remediation, and deployment behavior remain unchanged.
- **Evidence of need:** The live incident is now correctly identified as a tunnel/origin outage, but the operator context is still fragmented across multiple artifacts. A single handoff packet lowers the chance of missing the actual `gpc-hp-tunnel -> api.gallagherpropco.com -> localhost:8000` evidence chain during recovery.
- **Alignment:** Builds directly on `AIOPS-008` and `AIOPS-009`, reuses the existing artifact pipeline, and improves operator execution without weakening safety gates.
- **Risk/rollback:** Low. Main risk is duplicating stale information if the handoff artifact drifts from its source artifacts. Roll back by removing the handoff artifact and relying on the existing individual artifacts.
- **Completion Evidence (2026-03-12):**
  - `ai-devops/shared/tunnel-handoff.ts`
  - `ai-devops/shared/types.ts`
  - `ai-devops/agents/patch-engineer.ts`
  - `ai-devops/tests/api-tests/tunnel-handoff.test.ts`
  - `ai-devops/tests/api-tests/patch-engineer.test.ts`
  - `ai-devops/artifacts/cloudflare-tunnel-handoff.json`
- **Acceptance Criteria / Tests:**
  - When `cloudflare_tunnel_failure` is active, `ai-devops` writes `ai-devops/artifacts/cloudflare-tunnel-handoff.json`.
  - The handoff artifact includes the active cluster summary, direct gateway failures with request ids, edge smoke tunnel counts, the documented tunnel contract, and the exact tunnel-focused remediation checks.
  - Existing suppression, remediation, and deployment behavior remain unchanged.
  - Verified with `pnpm ai-devops:test:unit`, `pnpm ai-devops:typecheck`, `pnpm ai-devops:run -- --once --json`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### AIOPS-011 — Tunnel Incident Delta Tracking (P1)

- **Priority:** P1
- **Status:** Done (2026-03-12)
- **Scope:** Emit a dedicated `cloudflare-tunnel-delta.json` artifact that compares the current tunnel handoff packet against the prior cycle and reports whether the incident is new, stable, changed, or resolved.
- **Problem:** `AIOPS-010` packages the current tunnel outage well, but the operator still has to diff consecutive handoff artifacts manually to know whether the incident is worsening, recovering, or simply repeating with new request ids. The sidecar should publish the material cycle-to-cycle change state directly.
- **Expected Outcome (measurable):**
  - `ai-devops` writes `ai-devops/artifacts/cloudflare-tunnel-delta.json` on every cycle using the previous tunnel handoff artifact plus the newly generated one.
  - The delta artifact ignores noisy fields such as per-request ids and instead tracks material changes like active state, route groups, direct failure surfaces, edge-smoke tunnel counts, and contract alignment.
  - The artifact summarizes whether the incident is `new_incident`, `stable_incident`, `changed_incident`, `resolved_incident`, or `no_incident`.
- **Evidence of need:** The live `cloudflare_tunnel_failure` incident is persisting across cycles, but the current artifacts still force manual comparison to answer the operational question of whether the outage is stable or changing. That slows human response and makes later alerting harder to build.
- **Alignment:** Builds directly on `AIOPS-010`, reuses the existing handoff artifact and additive `ai-devops` persistence flow, and improves operator signal quality without changing suppression or deploy behavior.
- **Risk/rollback:** Low. Main risk is over-reporting change by treating volatile fields as material. Roll back by removing the delta artifact and continuing to rely on the raw handoff packet only.
- **Completion Evidence (2026-03-12):**
  - `ai-devops/shared/tunnel-delta.ts`
  - `ai-devops/shared/types.ts`
  - `ai-devops/agents/patch-engineer.ts`
  - `ai-devops/tests/api-tests/tunnel-delta.test.ts`
  - `ai-devops/tests/api-tests/patch-engineer.test.ts`
  - `ai-devops/artifacts/cloudflare-tunnel-delta.json`
- **Acceptance Criteria / Tests:**
  - The sidecar emits `ai-devops/artifacts/cloudflare-tunnel-delta.json` after each cycle.
  - Stable tunnel incidents do not flip to changed solely because request ids or timestamps rotated.
  - Material changes in active state, route groups, failure surfaces, edge-smoke counts, or contract alignment appear in the delta artifact with a concise summary.
  - Verified with `pnpm ai-devops:test:unit`, `pnpm ai-devops:typecheck`, `pnpm ai-devops:run -- --once --json`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

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

### INC-003 — Deals Route Import-Chain Hardening

- **Priority:** P0
- **Status:** Done (2026-03-05)
- **Scope:** Deals API auth resilience and gateway-backed parcel enrichment
- **Problem:** `GET /api/deals` and related deals routes can crash before auth resolution because route imports eagerly register automation handlers and pull in OpenAI/property-db modules with runtime env requirements. The same import chain also keeps parcel enrichment coupled to `@entitlement-os/openai` instead of the gateway-backed parcel APIs that are already deployed.
- **Expected Outcome (measurable):**
  - Unauthenticated deals endpoints return `401`/`403` instead of `500`.
  - Automation handlers register lazily at dispatch time, not route import time.
  - Parcel enrichment and artifact listing avoid top-level OpenAI/property-db initialization during request module load.
  - Regression coverage proves the hardened routes stay auth-safe and enrichment still normalizes parcel screening data.
- **Evidence of need:** Production `/api/deals` smoke checks returned `500` while adjacent auth-scoped routes returned `401`; Sentry incidents showed Prisma/OpenAI init failures occurring before request auth checks.
- **Alignment:** Preserves strict auth/org scoping, keeps server-only property-db access behind existing gateway auth, and avoids relaxing schema or evidence validation.
- **Risk/rollback:** Medium. Touches shared automation registration and enrichment plumbing. Rollback by restoring eager handler imports and prior property-db helper wiring if route behavior regresses.
- **Acceptance Criteria / Tests:**
  - `apps/web/lib/automation/handlers.ts` registers handlers through an idempotent lazy loader and no longer runs registration at module import time.
  - Deals routes stop importing `@/lib/automation/handlers.ts` solely for side effects.
  - `apps/web/lib/server/propertyDbRpc.ts` wraps gateway parcel/search/screening endpoints and normalizes responses for enrichment consumers.
  - `apps/web/lib/automation/enrichment.ts` and `apps/web/app/api/deals/[id]/parcels/[parcelId]/enrich/route.ts` use the gateway-backed helper instead of `@entitlement-os/openai`.
  - `apps/web/app/api/deals/[id]/artifacts/route.ts` loads OpenAI narrative helpers only inside the narrative generation path.
  - Regression tests cover lazy handler registration, property-db normalization, artifacts listing auth behavior, and deal parcel enrichment auth/happy paths.
  - Full verification gate passes (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `OPENAI_API_KEY=sk-placeholder pnpm build`), with any unrelated pre-existing failures explicitly documented if they remain.
- **Completion Evidence (2026-03-05):**
  - `apps/web/lib/automation/events.ts` now lazily imports `ensureHandlersRegistered()` at dispatch time and defers proactive trigger service loading until after event dispatch.
  - `apps/web/lib/automation/handlers.ts` keeps handler registration idempotent without module-import side effects, and deals routes no longer import the handler module only to trigger eager registration.
  - `apps/web/lib/server/propertyDbRpc.ts` now fronts gateway-backed parcel search/detail/screening calls, while `apps/web/lib/automation/enrichment.ts` and `apps/web/app/api/deals/[id]/parcels/[parcelId]/enrich/route.ts` consume the normalized helper instead of `@entitlement-os/openai`.
  - `apps/web/app/api/deals/[id]/artifacts/route.ts` now loads `createTextResponse` only inside `generateNarrative()`, removing top-level OpenAI initialization from auth-only artifact listing requests.
  - Added regression coverage in `apps/web/lib/automation/__tests__/handlers.test.ts`, `apps/web/lib/automation/__tests__/events.test.ts`, `apps/web/lib/automation/__tests__/enrichment.test.ts`, `apps/web/lib/server/propertyDbRpc.test.ts`, `apps/web/app/api/deals/[id]/artifacts/route.test.ts`, and `apps/web/app/api/deals/[id]/parcels/[parcelId]/enrich/route.test.ts`.
  - Verification gate passed locally: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `OPENAI_API_KEY=sk-placeholder pnpm build`.

---

## Infrastructure & Deployment Phases

### INFRA-001 — CLAUDE.md Modernization & Documentation Refactor

- **Priority:** P0
- **Status:** Done (2026-02-20)
- **Scope:** Developer experience and codebase clarity
- **Problem:** CLAUDE.md had grown to 397 lines with duplicated environment/architecture/tech stack information scattered across the codebase. Unclear single source of truth; hard to navigate for new agents or developers.
- **Expected Outcome (measurable):**
  - CLAUDE.md reduced to ~72 lines (core overview only)
  - 4 reference docs created in `docs/claude/`: `architecture.md`, `conventions.md`, `reference.md`, `workflows.md`
  - All tech stack, conventions, and workflows documented in DRY manner
  - All project instructions preserved, no loss of critical information
- **Evidence of need:** Growing codebase + multiple agent sessions showed need for cleaner developer ergonomics and clearer separation of concerns.
- **Alignment:** No functional changes; refactor-only for clarity. Preserves all existing guardrails and conventions.
- **Risk/rollback:** Zero risk; documentation-only changes. Rollback by reverting CLAUDE.md to single file if needed.
- **Acceptance Criteria / Tests:**
  - CLAUDE.md now contains only project overview, tech stack, repo structure, agent architecture, data model, automation philosophy, key rules, code style, CI/CD, and roadmap reference
  - `docs/claude/architecture.md` contains all layered architecture details, agent wiring, data model (18 Prisma models), automation philosophy, event dispatch patterns, Local Property API architecture
  - `docs/claude/conventions.md` contains code style (TypeScript/Tools/Commits/Error handling), file naming, multi-tenant scoping patterns, agent tool patterns, event dispatch patterns
  - `docs/claude/reference.md` contains all build commands, environment variables, CI/CD info, implementation roadmap tracker, gotchas
  - `docs/claude/workflows.md` contains agent tool wiring workflow, event dispatch pattern, property DB search normalization, Vercel deploy procedure, automation handler addition workflow
  - No information loss: cross-reference all sections to verify completeness
- **Files (target):**
  - `CLAUDE.md` (reduced from 397 to 72 lines)
  - `docs/claude/architecture.md` (new, ~210 lines)
  - `docs/claude/conventions.md` (new, ~46 lines)
  - `docs/claude/reference.md` (new, ~135 lines)
  - `docs/claude/workflows.md` (new, ~57 lines)
- **Completion Evidence (2026-02-20):**
  - All 4 reference docs created and cross-linked
  - CLAUDE.md streamlined with references to `docs/claude/*`
  - MEMORY.md updated with Architecture Decisions section
  - All developer guidance preserved and improved for navigability

### INFRA-002 — Local API FastAPI Implementation (api_server.py) Phase 2 Complete

- **Priority:** P0
- **Status:** Done (2026-02-20) with architecture decision pending
- **Scope:** Backend API layer for property database and vector search
- **Problem:** Vercel serverless functions cannot maintain persistent database connections. Local API layer required to support 560K parcel search, screening endpoints (flood/soils/wetlands/EPA/traffic/LDEQ), and Qdrant vector search for docs/memory.
- **Expected Outcome (measurable):**
  - Fully-implemented api_server.py with 8 endpoints ready for deployment
  - All parcel search, screening, and Qdrant endpoints functional with asyncpg pooling
  - Bearer token authentication with timing-safe comparison
  - In-memory LRU caching (1000 entries, 60s-3600s TTLs)
  - PostGIS geometry simplification with detail levels (low/medium/high)
- **Evidence of need:** Property database integration blocked without persistent connection layer; agents require screening + docs search to function.
- **Alignment:** Follows existing property DB tool patterns in agents; asyncpg pooling matches Prisma connection patterns.
- **Risk/rollback:** Implementation complete but discovery revealed architecture mismatch: actual Windows 11 deployment uses Docker Compose (gateway :8000) not bare-metal (:8081). Architecture decision required.
- **Acceptance Criteria / Tests:**
  - ✅ `POST /tool/parcel.bbox` *(legacy `/tool/*` route family in archived api_server.py; replaced in current runtime by `/tools/parcels/*` or app-level endpoints)*
  - ✅ `GET /tool/parcel.get` *(legacy `/tool/*` route family in archived api_server.py; replaced in current runtime by `GET /api/parcels/{id}` or equivalent app resolver)*
  - ✅ `GET /tool/parcel.geometry` *(legacy `/tool/*` route family in archived api_server.py; replaced by `GET /api/parcels/{id}/geometry`)*
  - ✅ `POST /tool/screening.flood` *(legacy `/tool/*` route family in archived api_server.py; replaced by `/api/screening/flood`)*
  - ✅ `POST /tool/docs.search` *(legacy `api_server.py` route family; now represented by `/api/knowledge` and `/api/search` flows)*
  - ✅ `GET /tool/docs.fetch` *(legacy `api_server.py` route family; now represented by `/api/knowledge` retrieval path)*
  - ✅ `POST /tool/memory.write` *(legacy `api_server.py` route family; replaced by `/api/memory/write`)*
  - ✅ `GET /health` — Public health check
  - ✅ Bearer token authentication with `secrets.compare_digest()`
  - ✅ asyncpg connection pooling (5-20 conns)
  - ✅ In-memory LRU cache (1000 entries, endpoint-specific TTLs)
  - ✅ JSON logging with request IDs
- **Files (target):**
  - ~~`infra/local-api/api_server.py`~~ **removed from tree 2026-03-20** — superseded by `main.py` + `admin_router.py`; prior file preserved only in git history (see `docs/archive/2026-03-20-root-cleanup/PHASE_3_DEPLOYMENT_BLOCKERS.md` Option B).
- **Completion Evidence (2026-02-20):**
  - api_server.py fully implemented with all 8 endpoints *(reference implementation; **removed from tree 2026-03-20** — canonical runtime is `main.py`)*
  - Asyncpg pooling + caching + JSON logging complete
  - Discovery: Actual deployment uses Docker Compose (not bare-metal :8081)
  - See docs/archive/2026-03-20-root-cleanup/PHASE_3_DEPLOYMENT_BLOCKERS.md for integration options (Option A: add as Docker service, Option B: adapt to existing :8000 gateway, Option C: use as reference)

### INFRA-003 — Phase 3: Deployment Readiness & Blocking Issues Resolution

- **Priority:** P0
- **Status:** ✅ Done (2026-02-20 21:15 UTC)
- **Scope:** Resolve critical blockers preventing deployment to Windows 11 server
- **Problem:** Windows 11 infrastructure audit (2026-02-20) revealed 3 critical blockers: (1) Cloudflare Tunnel token missing, (2) Ingress rules not configured, (3) Tool endpoints untested. Blocks all deployment work.
- **Expected Outcome (measurable):**
  - P0 Blocker resolved: Real CLOUDFLARE_TUNNEL_TOKEN in place, tunnel authenticates with Cloudflare edge
  - P1 Blocker resolved: Ingress rules configured for api.gallagherpropco.com ↔ localhost:8000 and tiles.gallagherpropco.com
  - P2 Blocker resolved: All 8 tool endpoints tested with Bearer auth, response schemas validated, caching headers verified
  - Post-deployment: Architecture decision made on api_server.py integration (Option A/B/C per docs/archive/2026-03-20-root-cleanup/PHASE_3_DEPLOYMENT_BLOCKERS.md)
- **Evidence of need:** Infrastructure audit (2026-02-20) explicitly documented 3 critical blockers with acceptance criteria.
- **Alignment:** Follows existing deployment patterns (Vercel + Cloudflare Tunnel + Local API). No breaking changes.
- **Risk/rollback:** Low risk if blockers resolved sequentially (P0 → P1 → P2). Rollback at each stage until full validation.
- **Acceptance Criteria / Tests (P0 — Cloudflare Token):**
  - Real `CLOUDFLARE_TUNNEL_TOKEN` replaces placeholder in `C:\gpc-cres-backend\.env`
  - `cloudflared tunnel list` shows tunnel status "CONNECTED"
  - `docker-compose logs cloudflared` shows "Connected to Cloudflare" message
- **Acceptance Criteria / Tests (P1 — Ingress Rules):**
  - Cloudflare dashboard (Workers > Tunnels > gpc-cres-backend) shows 3+ ingress rules configured
  - Rules include: api.gallagherpropco.com → localhost:8000, tiles.gallagherpropco.com → localhost:8000
  - `curl https://api.gallagherpropco.com/health` returns HTTP 200 (not connection error or 504)
  - Response time < 1s (validates routing works)
- **Acceptance Criteria / Tests (P2 — Endpoint Testing):**
  - All 8 tool endpoints tested with valid Bearer token: `Authorization: Bearer $GATEWAY_API_KEY`
  - POST `/tool/parcel.bbox` (legacy): Returns array of parcels, cache header present, <500ms latency
  - GET `/tool/parcel.get` (legacy): Returns single parcel JSON, <50ms latency
  - GET `/tool/parcel.geometry` (legacy): Returns GeoJSON boundary, <300ms latency
  - POST `/tool/screening.flood` (legacy): Returns flood risk data, <200ms latency
  - POST `/tool/docs.search`, GET `/tool/docs.fetch`, POST `/tool/memory.write` (legacy): All functional with Qdrant in archived gateway
  - GET /health: Returns 200 with status, timestamp, component health (no auth)
  - Error handling tested: Invalid auth → 401, missing params → 400, service error → 503
- **Files (target):**
  - `docs/archive/2026-03-20-root-cleanup/PHASE_3_DEPLOYMENT_BLOCKERS.md` (comprehensive blocking issues doc, created 2026-02-20)
  - `C:\gpc-cres-backend\.env` (CLOUDFLARE_TUNNEL_TOKEN update)
  - Cloudflare dashboard (ingress rule configuration)
  - Integration decision: api_server.py Option A/B/C (see docs/archive/2026-03-20-root-cleanup/PHASE_3_DEPLOYMENT_BLOCKERS.md lines 132-135)
  - Documentation updates: SPEC.md (architecture), CLAUDE.md (port references), agent tool definitions
- **Completion Evidence (2026-02-21, 3-prompt workflow COMPLETE):**
  - ✅ **P0 RESOLVED:** Cloudflare Tunnel token deployed, tunnel LIVE with 4 QUIC connections to Atlanta edge (atl01, atl08, atl10, atl12)
  - ✅ **P1 RESOLVED:** Ingress rules configured — api.gallagherpropco.com→gateway:8000, tiles.gallagherpropco.com→martin:3000, catch-all→404
  - ✅ **P2 RESOLVED (infrastructure):** All endpoints validated through tunnel with measured latencies:
    - GET /health: 108ms avg, 200 OK
    - POST /tools/parcel.bbox: 127ms avg, 200 OK
    - POST /tools/parcel.lookup: 112ms avg, 200 OK
    - POST /tools/memory.write: 115ms avg, 200 OK
    - GET /tiles/catalog: 110ms avg, 200 OK
    - POST /tools/docs.search: 502 (Qdrant `documents` collection not yet created — data issue only)
  - ✅ All 6 Docker containers healthy (gateway, martin, postgres, qdrant, pgadmin, cloudflared)
  - ✅ Bearer auth enforced on all endpoints, tunnel token persisted
  - ✅ Chat API route live: returns 401 unauthenticated, 400 missing message
  - ⚠️ **Remaining:** Create `documents` Qdrant collection + populate with EBR zoning data, browser chat end-to-end test

### INFRA-004 — Cloudflare Worker + Durable Object for Persistent Agent Chat

- **Priority:** P0
- **Status:** ✅ Done (2026-02-24)
- **Scope:** Move agent chat loop from Vercel serverless to Cloudflare Durable Object with persistent WebSocket connections
- **Problem:** Vercel serverless functions have a 60s timeout (300s on Enterprise) which limits complex multi-tool agent runs. No support for OpenAI hosted tools (web_search, file_search, code_interpreter) which require WebSocket mode. Every request is a cold function invocation with no persistent connection or context caching.
- **Expected Outcome (measurable):**
  - Agent chat runs with no timeout limit (Durable Object lifetime = WebSocket connection lifetime)
  - Hosted tools (web_search, file_search, code_interpreter) available to the coordinator agent
  - Multi-turn conversations use `previous_response_id` chaining for ~15-40% faster context retrieval
  - Tool calls route correctly: gateway tools to FastAPI, Vercel tools to Next.js auth/runtime services, hosted tools to OpenAI
- **Evidence of need:** Agent runs with 3+ tool calls regularly hit the 60s Vercel timeout. web_search_preview tool was filtered out of tool definitions because it requires WebSocket mode.
- **Alignment:** Follows existing architecture (Vercel for Prisma/auth, Cloudflare for edge compute, FastAPI gateway for property DB). Browser receives same `ChatStreamEvent` types as existing SSE transport — no UI breaking changes.
- **Risk/rollback:** Medium. Existing SSE `/api/chat` route preserved as fallback. Worker can be disabled by removing DNS route; chat falls back to Vercel SSE. Durable Object state is ephemeral (conversation context stored server-side by OpenAI via `store: true`).
- **Acceptance Criteria / Tests:**
  - Worker deploys to Cloudflare: `wrangler deploy` succeeds
  - Health check: `curl https://agents.gallagherpropco.com/health` returns `{"status":"ok"}`
  - Auth rejection: invalid/missing JWT returns 401
  - E2E basic: text streaming works via WebSocket (`test-ws-e2e.mjs` passes)
  - E2E tools: gateway tool execution works — `get_parcel_details` called and returns data (`test-ws-tools.mjs` passes)
  - E2E multi-turn: `previous_response_id` chaining works across turns (`test-ws-multiturn.mjs` passes)
  - Debug endpoints removed before production
  - Vercel auth endpoint: `POST /api/agent/auth/resolve` returns `{ orgId, userId }` from NextAuth session resolution
  - Vercel tool endpoint: `POST /api/agent/tools/execute` dispatches tool calls with org-scoped auth
- **Files:**
  - `infra/cloudflare-agent/src/index.ts` — Worker entry point (JWT validation, DO routing)
  - `infra/cloudflare-agent/src/durable-object.ts` — AgentChatDO (OpenAI WebSocket, tool loop, state management)
  - `infra/cloudflare-agent/src/tool-router.ts` — Routes tool calls to gateway vs Vercel vs hosted
  - `infra/cloudflare-agent/src/types.ts` — Shared types (Env, events, state)
  - `infra/cloudflare-agent/src/generated/tool-schemas.json` — 51 tool definitions (generated at build time)
  - `infra/cloudflare-agent/src/generated/instructions.json` — Coordinator system prompt (generated at build time)
  - `infra/cloudflare-agent/scripts/export-tools.ts` — Build script: extracts tool schemas + instructions
  - `infra/cloudflare-agent/scripts/test-ws-*.mjs` — 3 E2E test scripts
  - `infra/cloudflare-agent/wrangler.toml` — Wrangler config (DO binding, routes)
  - `infra/cloudflare-agent/package.json` — Dependencies
  - `apps/web/app/api/agent/auth/resolve/route.ts` — Auth resolution endpoint for Worker
  - `apps/web/app/api/agent/tools/execute/route.ts` — Tool execution endpoint for Worker
  - `apps/web/lib/agent/toolRegistry.ts` — Tool name → execute function dispatch map
  - `apps/web/lib/chat/useAgentWebSocket.ts` — Browser WebSocket client hook
  - `apps/web/components/chat/ChatContainer.tsx` — WebSocket transport integration
  - `packages/openai/src/agents/coordinator.ts` — Exported COORDINATOR_INSTRUCTIONS
  - `packages/openai/src/tools/index.ts` — Added 8 screening tools to coordinatorTools
  - `docs/CLOUDFLARE_AGENTS.md` — Architecture and deployment guide
- **Completion Evidence (2026-02-24, PR #69 merged to main):**
  - ✅ Worker deployed to `agents.gallagherpropco.com` via `wrangler deploy`
  - ✅ Health check: `{"status":"ok","worker":"entitlement-os-agent"}`
  - ✅ Auth: invalid tokens rejected with 401
  - ✅ E2E basic test: text streaming works (3 events: text_delta, text_delta, done)
  - ✅ E2E tool test: `get_parcel_details` gateway tool called and returned parcel data (86 events)
  - ✅ E2E multi-turn test: 2 turns with `previous_response_id` chaining verified
  - ✅ Debug endpoints (`/debug-auth`, `/debug-openai`, `/debug-openai-chat`) removed for production
  - ✅ 35 files committed, 6,253 insertions across Worker, Vercel endpoints, tool registry, and browser hook
  - ✅ Existing SSE `/api/chat` route preserved as fallback — zero breaking changes


## Completed (for traceability only)

### MAP-015 — Polygon Prospect SearchText Contract Recovery (P1)

- **Priority:** P1
- **Status:** Done (2026-03-16)
- **Scope:** Restore `filters.searchText` semantics in `POST /api/map/prospect` so polygon prospecting can narrow results by address, owner, or parcel identifier instead of ignoring the text filter.
- **Problem:** The current route records `hasSearchText` in observability but `buildPolygonSql()` never applies that value to the SQL query. Live production verification on 2026-03-16 at build `b276edfbe73b96259d3fa244cf3b46971f949f1d` returned the same first parcel (`7944 BOONE AVE`) and the same `total: 100` for both polygon-only requests and `filters.searchText="2774 HIGHLAND RD"`, proving the text filter is a no-op. That breaks the `/map` polygon-search contract and the saved-search/prospecting flows that send `searchText`.
- **Expected Outcome (measurable):**
  - `POST /api/map/prospect` applies `filters.searchText` in-database before the gateway row cap so polygon searches can narrow by address, owner, or parcel id.
  - Wildcard placeholder input like `searchText="*"` remains a no-op so the existing `/map` empty-search behavior does not regress.
  - Route regression coverage proves the generated SQL includes suffix-aware text matching when `searchText` is present and omits it for wildcard-only input.
- **Evidence of need:** A live authenticated production probe on 2026-03-16 showed `POST /api/map/prospect` returning `total: 100` with first address `7944 BOONE AVE` both with and without `filters.searchText="2774 HIGHLAND RD"`, and no returned parcel matched the requested address. The current `/map` page and `/prospecting` page both send `filters.searchText`, so the route contract is currently broken for shipped UI behavior.
- **Alignment:** Preserves the gateway-backed polygon route, keeps auth/org handling unchanged, and repairs an existing client contract instead of redefining monitor expectations.
- **Risk/rollback:** Low risk because the work stays inside the map prospect route, only changes SQL generation for an optional filter, and is covered by focused tests. Rollback is straightforward by reverting the SQL helper and route tests if downstream query behavior regresses.
- **Acceptance Criteria / Tests:**
  - `apps/web/app/api/map/prospect/route.ts` applies normalized, suffix-aware `searchText` matching to address/owner/parcel id fields.
  - `searchText="*"` does not add a restrictive SQL clause.
  - `apps/web/app/api/map/prospect/route.post.test.ts` covers both filtered and wildcard search-text behavior.
  - Re-run focused route tests plus `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence (2026-03-16):**
  - Updated `apps/web/app/api/map/prospect/route.ts` so `buildPolygonSql()` applies normalized, suffix-aware `searchText` matching to address, owner, and `parcel_id` before the gateway row cap while preserving `searchText="*"` as a no-op.
  - Added focused regressions in `apps/web/app/api/map/prospect/route.post.test.ts` covering both suffix-aware `searchText` SQL generation and wildcard passthrough behavior.
  - Focused verification passed:
    - `pnpm -C apps/web test -- app/api/map/prospect/route.post.test.ts app/api/map/prospect/route.test.ts`
  - Full verification gate passed:
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=placeholder pnpm build`
  - Live runtime evidence:
    - One-shot authenticated production monitor passed 12/12 on current live build `b276edfbe73b96259d3fa244cf3b46971f949f1d`; artifact: `output/observability/monitor-2026-03-16-232547543Z.json`.
    - Direct authenticated probes against that same live build still returned `total: 100` with first address `7944 BOONE AVE` for both polygon-only and `filters.searchText` requests (`4416 HEATH DR` and `2774 HIGHLAND RD`), confirming the current deployed build still ignores `searchText` until this patch is shipped.

### MAP-016 — Prospect Gateway Envelope Normalization (P1)

- **Priority:** P1
- **Status:** Done (2026-03-16)
- **Scope:** Normalize `/tools/parcels.sql` gateway payload envelopes in `POST /api/map/prospect` so production polygon prospecting can read wrapped and columnar SQL responses instead of silently treating them as empty result sets.
- **Problem:** After `MAP-015` shipped in PR `#107`, production build `c9ab99423cabf20e798dbdc38fa96393674b4e80` still returned `{ "parcels": [], "total": 0 }` for geometry-derived polygon probes that should have included `2774 HIGHLAND RD`. The root cause was response-shape drift: the route only handled raw row arrays or top-level `rows` objects, while the live gateway can return nested `data.rows` envelopes or columnar `columnNames + rows[][]` SQL payloads.
- **Expected Outcome (measurable):**
  - `POST /api/map/prospect` maps wrapped `data.rows` gateway payloads into parcel objects.
  - `POST /api/map/prospect` maps columnar `columnNames` + `rows[][]` SQL responses into parcel objects.
  - Focused route regressions prove both payload shapes return non-empty parcel envelopes instead of false empty responses.
- **Evidence of need:** On 2026-03-16, authenticated production probes against build `c9ab99423cabf20e798dbdc38fa96393674b4e80` returned a valid parcel for `GET /api/parcels?hasCoords=true&search=2774 HIGHLAND RD`, returned valid geometry for `/api/parcels/ext-00001e98-979c-485a-b71d-69c4f817dd70/geometry`, and still returned `total: 0` for the derived polygon sent to `POST /api/map/prospect`. That isolated the failure to the prospect route path rather than the parcel-search or geometry paths; follow-up live gateway inspection in `MAP-017` then confirmed a second SQL-contract defect remained after this envelope hardening landed.
- **Alignment:** Preserves the existing gateway-backed parcel architecture, keeps auth/org handling unchanged, and hardens the route against already-deployed gateway response shapes instead of redefining the route contract.
- **Risk/rollback:** Low risk because the change is isolated to read-only prospect-route parsing plus focused tests. Rollback is straightforward by reverting the normalization helpers and the added response-shape regressions if downstream parsing behavior regresses.
- **Acceptance Criteria / Tests:**
  - `apps/web/app/api/map/prospect/route.ts` normalizes nested `data.rows`, direct row arrays, and columnar `columnNames + rows[][]` payloads into parcel rows.
  - `apps/web/app/api/map/prospect/route.post.test.ts` covers wrapped and columnar gateway responses.
  - Re-run focused route tests plus `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence (2026-03-16):**
  - Updated `apps/web/app/api/map/prospect/route.ts` with `normalizeProspectGatewayRows()` and columnar row mapping so the route accepts direct rows, nested envelopes, and Cloudflare db-proxy SQL payloads.
  - Added focused regressions in `apps/web/app/api/map/prospect/route.post.test.ts` covering wrapped `data.rows` responses and columnar `columnNames + rows[][]` responses.
  - Focused verification passed:
    - `pnpm -C apps/web test -- app/api/map/prospect/route.post.test.ts app/api/map/prospect/route.test.ts`
  - Full verification gate passed:
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=placeholder pnpm build`

### MAP-017 — Prospect SQL Contract Recovery + Error Surfacing (P1)

- **Priority:** P1
- **Status:** Done (2026-03-16)
- **Scope:** Restore `POST /api/map/prospect` against the live `ebr_parcels` schema and stop masking gateway SQL failures as successful empty prospect responses.
- **Problem:** After `MAP-016` merged and deployed as build `161a4eaa5a9482f7a9fa8575dc68f9bfab1d18f7`, the authenticated production monitor still failed `POST /api/map/prospect` with `{"parcels":[],"total":0}`. Direct authenticated calls to the same gateway endpoint used by the route, `POST /tools/parcels.sql`, revealed the actual upstream response: `{"ok":false,"error":"SQL error: column \"zoning_type\" does not exist"}`. The route still selected `zoning_type` and `existing_land_use` from `ebr_parcels`, even though the live schema only exposed `id`, `parcel_id`, `address`, `area_sqft`, `owner`, `assessed_value`, `geom`, and `created_at`. Because the route only checked HTTP status and not `ok:false` JSON envelopes, it silently converted that SQL error into a false empty success.
- **Expected Outcome (measurable):**
  - `POST /api/map/prospect` only selects columns that exist on the live `ebr_parcels` gateway dataset.
  - Gateway `200` error envelopes with `ok:false` and `error` now fail closed as `GATEWAY_UNAVAILABLE` instead of returning `200 { parcels: [], total: 0 }`.
  - The authenticated production monitor and the geometry-derived `2774 HIGHLAND RD` polygon probe both return non-empty parcel results on the deployed build.
- **Evidence of need:** On 2026-03-16, a direct authenticated gateway probe against the live `LOCAL_API_URL/tools/parcels.sql` endpoint with the route’s polygon SQL returned `status=200` and `{"ok":false,"error":"SQL error: column \"zoning_type\" does not exist"}`. A schema probe via `SELECT * FROM ebr_parcels LIMIT 1` on that same gateway returned columns `id`, `parcel_id`, `address`, `area_sqft`, `owner`, `assessed_value`, `geom`, and `created_at`, confirming the route’s SQL projection was out of contract with the deployed dataset.
- **Alignment:** Preserves the gateway-backed parcel architecture, keeps auth/org handling unchanged, and hardens the route against both live schema drift and live gateway error-envelope semantics.
- **Risk/rollback:** Low risk because the change stays inside the read-only prospect route and its focused tests. Rollback is straightforward by reverting the SQL projection and error-envelope handling if downstream parcel dataset assumptions change again.
- **Acceptance Criteria / Tests:**
  - `apps/web/app/api/map/prospect/route.ts` selects only live `ebr_parcels` columns and preserves the `zoning` response field with a literal empty-string placeholder.
  - `apps/web/app/api/map/prospect/route.ts` throws `GATEWAY_UNAVAILABLE` when the gateway returns `ok:false` plus an `error` message in a `200` JSON response.
  - `apps/web/app/api/map/prospect/route.post.test.ts` covers the direct SQL-error envelope regression.
  - Re-run focused route tests plus `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence (2026-03-16):**
  - Updated `apps/web/app/api/map/prospect/route.ts` so the route now selects only live `ebr_parcels` columns, preserves `zoning` with a literal empty string, and throws `GATEWAY_UNAVAILABLE` when `/tools/parcels.sql` responds with `200 { ok: false, error: ... }`.
  - Added a focused regression in `apps/web/app/api/map/prospect/route.post.test.ts` covering the SQL-error envelope path and asserting the route no longer emits `zoning_type` in prospect SQL.
  - Direct live gateway probes confirmed the root cause before the fix: `POST /tools/parcels.sql` returned `{"ok":false,"error":"SQL error: column \"zoning_type\" does not exist"}` for the route's polygon SQL, while `SELECT * FROM ebr_parcels LIMIT 1` exposed only `id`, `parcel_id`, `address`, `area_sqft`, `owner`, `assessed_value`, `geom`, and `created_at`.
  - Verification passed:
    - `pnpm -C apps/web test -- app/api/map/prospect/route.post.test.ts app/api/map/prospect/route.test.ts`
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=placeholder pnpm build`

### MAP-018 — Prospect Search Normalization + Monitor Fixture Alignment (P1)

- **Priority:** P1
- **Status:** Done (2026-03-16)
- **Scope:** Make `POST /api/map/prospect` search matching work against uppercase assessor data and align the production monitor with a parcel address that is actually inside the scripted polygon.
- **Problem:** After `MAP-017`, direct live gateway probes showed a second functional defect in the shipped `searchText` path: the route normalized prospect fields with `LOWER(regexp_replace(..., '[^a-z0-9]+', ...))`, which strips uppercase letters before lowercasing. On the live `ebr_parcels` dataset that turned `2774 HIGHLAND RD` into `2774 `, so the suffix-aware search clause could not match address, owner, or parcel text even when the parcel was inside the polygon. Separately, the production monitor still defaulted to `4416 HEATH DR`, whose live centroid (`30.601889205397672, -91.15151656623976`) sits north of the monitor polygon's max latitude `30.5001`, so the monitor could keep reporting false failures after the route bug was fixed.
- **Expected Outcome (measurable):**
  - `POST /api/map/prospect` normalizes search fields by lowercasing before stripping non-alphanumerics, so uppercase assessor addresses remain searchable.
  - The production monitor defaults to an address fixture that is inside the scripted polygon and can therefore validate filtered prospect behavior.
  - A deployed production probe for the monitor polygon plus `searchText="2774 HIGHLAND RD"` returns a non-empty parcel envelope.
- **Evidence of need:** On 2026-03-16, direct gateway SQL against the live dataset returned `2774 HIGHLAND RD` for a simple `LOWER(address) LIKE '%2774 highland rd%'` plus polygon containment check, but the route-equivalent normalized search clause returned zero rows. A direct normalization probe showed the current SQL transformed the same address into `2774 ` because uppercase letters were stripped before `LOWER(...)` executed. Separate live gateway probes showed `4416 HEATH DR` exists in `ebr_parcels` with centroid latitude `30.601889205397672`, which is outside the monitor polygon capped at latitude `30.5001`.
- **Alignment:** Preserves the gateway-backed prospect route, keeps auth/org handling unchanged, and hardens production validation by using a deterministic in-polygon fixture instead of a false-negative address.
- **Risk/rollback:** Low risk because the change is isolated to the route's read-only search expression, one monitor fixture constant, and focused tests. Rollback is straightforward by reverting the normalization expression and monitor default if downstream query behavior unexpectedly changes.
- **Acceptance Criteria / Tests:**
  - `apps/web/app/api/map/prospect/route.ts` lowercases `address`, `owner`, and `parcel_id` before `regexp_replace(..., '[^a-z0-9]+', ' ', 'g')`.
  - `apps/web/app/api/map/prospect/route.post.test.ts` asserts the generated SQL uses the corrected lowercase-first normalization and still preserves wildcard passthrough.
  - `scripts/observability/monitor_production.ts` defaults `OBS_SEARCH_ADDRESS` to `2774 HIGHLAND RD`.
  - Re-run focused route tests plus `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
  - After deploy, the authenticated production monitor and a direct production `POST /api/map/prospect` probe with the monitor polygon plus `2774 HIGHLAND RD` return non-empty results.
- **Evidence (2026-03-16):**
  - Updated `apps/web/app/api/map/prospect/route.ts` so prospect search fields now normalize with `regexp_replace(LOWER(COALESCE(...)), '[^a-z0-9]+', ' ', 'g')`, which preserves uppercase assessor text through normalization.
  - Updated `apps/web/app/api/map/prospect/route.post.test.ts` to assert the lowercase-first normalization expression is emitted in generated SQL while wildcard-only `searchText="*"` still omits the restrictive clause.
  - Updated `scripts/observability/monitor_production.ts` so the documented/default search fixture is `2774 HIGHLAND RD`, an address whose live parcel centroid is inside the scripted monitor polygon.
  - Direct live gateway validation with the corrected normalization returned one row for `2774 HIGHLAND RD` under the monitor polygon, proving the fixed SQL path matches the live dataset.
  - Verification passed:
    - `pnpm -C apps/web test -- app/api/map/prospect/route.post.test.ts app/api/map/prospect/route.test.ts`
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=placeholder pnpm build`

### MAP-014 — Parcel Geometry Missing-Row Degradation Path (P1)

- **Priority:** P1
- **Status:** Done (2026-03-16)
- **Scope:** Separate parcel-geometry `404` causes in the route and surface a clean “geometry unavailable” state in the map UI when the gateway genuinely has no geometry row for a parcel.
- **Problem:** `apps/web/app/api/parcels/[parcelId]/geometry/route.ts` returned the same `404` both when the upstream gateway genuinely had no parcel-geometry row and when a returned row could not be parsed by `mapGatewayRowToGeometry()`. The map UI then collapsed both cases into a generic failed-shapes path, which made a missing geometry record look like a broken parcel.
- **Expected Outcome (measurable):**
  - Route logs distinguish upstream `404` from unparseable gateway rows.
  - The missing production parcel `000028d9-4de7-467a-b904-64238e593b34` degrades as “geometry unavailable” instead of a generic broken-shapes state.
  - Focused regressions cover both route logging paths and the map-side geometry-unavailable state.
- **Evidence of need:** Production browser verification on 2026-03-16 reproduced `GET /api/parcels/000028d9-4de7-467a-b904-64238e593b34/geometry?detail_level=low -> 404`. Direct gateway inspection in this session confirmed the upstream endpoint itself returns `404 {"detail":"Parcel geometry not found"}` for that parcel, so the live failure is a true missing-row case rather than a parser mismatch.
- **Alignment:** Preserves the gateway-backed parcel architecture, keeps real missing geometry on a `404`, and improves observability and client-side degradation without weakening auth or route normalization.
- **Risk/rollback:** Low risk because the work is isolated to one read-only route, the parcel-geometry client hook/UI messaging, and focused tests. Rollback is straightforward by reverting the route logging and client-side geometry-unavailable state if downstream behavior regresses.
- **Acceptance Criteria / Tests:**
  - Log gateway `404` and unparseable gateway-row cases separately in the parcel geometry route.
  - If no upstream row exists, keep the route on `404` while surfacing a “geometry unavailable” state in the map UI.
  - Add focused route regressions for gateway `404` and row-parse failure behavior.
  - Add focused map-side regression coverage for the geometry-unavailable state.
  - Re-run focused tests plus `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence (2026-03-16):**
  - Verified the live upstream parcel-geometry row for `000028d9-4de7-467a-b904-64238e593b34` genuinely does not exist: the gateway returned `404 {"detail":"Parcel geometry not found"}` for that parcel in this session.
  - Updated `apps/web/app/api/parcels/[parcelId]/geometry/route.ts` to log true gateway missing-row cases separately from unparseable row-shaping failures while keeping the route on `404` with `GEOMETRY_UNAVAILABLE`.
  - Updated `apps/web/components/maps/useParcelGeometry.ts` and `apps/web/components/maps/MapLibreParcelMap.tsx` so the client surfaces a dedicated “Geometry unavailable” state instead of treating a missing row like a generic parcel-shape failure.
  - Added route regressions in `apps/web/app/api/parcels/[parcelId]/geometry/route.test.ts` plus map-side regressions in `apps/web/components/maps/useParcelGeometry.test.tsx` and `apps/web/components/maps/MapLibreParcelMap.test.tsx`.
  - Focused verification passed:
    - `pnpm -C apps/web test -- 'app/api/parcels/[parcelId]/geometry/route.test.ts' components/maps/MapLibreParcelMap.test.tsx components/maps/useParcelGeometry.test.tsx`
  - Full gate passed:
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=placeholder pnpm build`

### MARKET-017 — Building Permits Feed Degraded-Mode Recovery (P1)

- **Priority:** P1
- **Status:** Done (2026-03-16)
- **Scope:** Harden the East Baton Rouge building permits feed so secondary Socrata query failures no longer collapse `/api/market/building-permits` into a `500`.
- **Problem:** `apps/web/lib/services/buildingPermits.service.ts` issued six parallel Socrata queries through `Promise.all`. Any single non-OK response rejected the entire feed, which bubbled through `apps/web/app/api/market/building-permits/route.ts` as a `500` even when the core totals data was still available.
- **Expected Outcome (measurable):**
  - Secondary Socrata query failures return partial building-permits data with warnings instead of failing the whole route.
  - Upstream failures are logged with the failed query name, HTTP status, and a short response snippet.
  - A last-good payload can be served when a critical query fails after a prior successful fetch.
- **Evidence of need:** Production browser verification on 2026-03-16 reproduced `GET /api/market/building-permits?days=30&designation=all&limit=25 -> 500` while the page shell still rendered. Code inspection confirmed the service used `Promise.all` across six Socrata calls, so a single upstream miss collapsed the feed.
- **Alignment:** Preserves the authenticated market-feed contract, keeps the BRLA Socrata source authoritative, and improves resilience without weakening route validation or auth.
- **Risk/rollback:** Low-to-medium risk because the work changes feed orchestration and introduces last-good caching, but it is isolated to one service, one route, and focused tests. Rollback is straightforward by reverting the degraded-mode logic if downstream consumers mis-handle the new response metadata.
- **Acceptance Criteria / Tests:**
  - Replace the all-or-nothing fetch fanout with a partial-failure strategy such as `Promise.allSettled`.
  - Log query-specific upstream failures with status plus a short response snippet.
  - Return partial data with warnings for secondary-query failures, or a cached last-good payload when critical queries fail and cache is available.
  - Extend `apps/web/lib/services/buildingPermits.service.test.ts` to cover partial failure and last-good fallback behavior.
  - Extend `apps/web/app/api/market/building-permits/route.test.ts` to cover degraded-but-successful responses in addition to generic `500`.
  - Re-run focused tests plus `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence (2026-03-16):**
  - Reworked `apps/web/lib/services/buildingPermits.service.ts` to use query-aware `Promise.allSettled` orchestration, structured upstream failure logging, last-good cache fallback for required-query failures, and degraded-mode response metadata (`warnings`, `partial`, `fallbackUsed`).
  - Kept `apps/web/app/api/market/building-permits/route.ts` on the authenticated `200` path for recovered degraded feeds while preserving the existing `500` for unrecoverable required-query failures.
  - Added partial-failure and cached-fallback regressions in `apps/web/lib/services/buildingPermits.service.test.ts` plus degraded-success coverage in `apps/web/app/api/market/building-permits/route.test.ts`.
  - Aligned the dashboard response typing in `apps/web/components/market/BuildingPermitsDashboard.tsx` with the new degraded-mode fields.
  - Focused verification passed:
    - `pnpm -C apps/web test -- app/api/market/building-permits/route.test.ts lib/services/buildingPermits.service.test.ts`
  - Full gate passed:
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=placeholder pnpm build`

### REF-001 — Jurisdictions Route Shaping + Reference Error Visibility (P1)

- **Priority:** P1
- **Status:** Done (2026-03-16)
- **Scope:** Harden `/api/jurisdictions` response shaping and make the `/reference` page fail visibly when jurisdictions loading fails instead of collapsing into an empty-state false negative.
- **Problem:** `/api/jurisdictions` returned `latestPack` straight from Prisma, including JSON lineage fields that could be malformed or mixed-type, and the route had no dedicated regression coverage. On the client, `apps/web/app/reference/page.tsx` treated non-200 responses as normal JSON, so a `500` quietly became `jurisdictions = []` and the UI showed “No jurisdictions found.” instead of the real failure.
- **Expected Outcome (measurable):**
  - `/api/jurisdictions` always returns a plain JSON-safe `latestPack` object with normalized `generatedAt`, `sourceUrls`, `sourceEvidenceIds`, `sourceSnapshotIds`, and `sourceContentHashes`.
  - Malformed or missing pack lineage on one jurisdiction no longer takes down the entire list, and the route logs the affected jurisdiction/pack context when normalization is required.
  - `/reference?tab=jurisdictions` surfaces an explicit error state when the jurisdictions fetch fails instead of rendering the empty-state fallback.
- **Evidence of need:** Production browser verification on 2026-03-16 captured `/api/jurisdictions` returning `500` while the `/reference` shell still rendered and presented an empty jurisdictions state. Code inspection showed the route passing raw Prisma pack rows through the response and the page fetcher using `fetch(url).then((response) => response.json())` without throwing on `!response.ok`.
- **Alignment:** Preserves org-scoped auth and the existing jurisdictions/parish-pack contract while making route serialization deterministic and surfacing failures honestly in the UI.
- **Risk/rollback:** Low risk because the work is isolated to one read-only route, one page fetch path, and tests. Rollback is straightforward by reverting the serializer and UI error handling if a downstream consumer depends on the raw response shape.
- **Acceptance Criteria / Tests:**
  - `/api/jurisdictions` builds a plain JSON response shape for `latestPack` instead of returning the raw Prisma object.
  - Route normalization tolerates malformed or missing lineage fields and logs the specific jurisdiction/pack context that needed recovery.
  - Add dedicated route tests for auth rejection, valid lineage serialization, and malformed/missing lineage recovery.
  - `/reference` throws on non-200 jurisdictions responses and renders an explicit jurisdictions error state.
  - Re-run focused tests plus `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence (2026-03-16):**
  - Hardened `/api/jurisdictions` shaping in `apps/web/app/api/jurisdictions/route.ts` with explicit Prisma payload typing, JSON-safe `latestPack` serialization, lineage normalization, and jurisdiction/pack-scoped malformed-lineage logging.
  - Updated `apps/web/app/reference/page.tsx` so the shared fetcher throws on non-OK responses and the jurisdictions tab renders an explicit error state instead of the empty fallback.
  - Added regressions in `apps/web/app/api/jurisdictions/route.test.ts` and `apps/web/app/reference/page.test.tsx` covering auth rejection, valid lineage serialization, malformed/missing lineage recovery, and visible client-side error handling.
  - Focused verification passed:
    - `pnpm -C apps/web test -- app/api/jurisdictions/route.test.ts app/reference/page.test.tsx`
  - Full gate passed:
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `OPENAI_API_KEY=placeholder pnpm build`

### CHAT-012 — Draft Chat Bootstrap ID Separation (P1)

- **Priority:** P1
- **Status:** Done (2026-03-16)
- **Scope:** Separate the WebSocket bootstrap/session identifier from the persisted conversation identifier so fresh chats stop probing nonexistent conversation records during initial load.
- **Problem:** The chat client generated a UUID for WebSocket bootstrap, wrote it into the URL as `conversationId`, then immediately treated that draft-only value like a persisted conversation record. On a fresh chat this caused `GET /api/chat/conversations/[id]` to hit a nonexistent row and return noisy `404`s before the user sent the first message.
- **Expected Outcome (measurable):**
  - Fresh chat load in WebSocket mode no longer writes a draft bootstrap UUID into the URL before the first persisted conversation exists.
  - The client does not call `GET /api/chat/conversations/[id]` for a draft-only bootstrap identifier.
  - The detail route returns a compatibility-safe `200 { conversation: null }` for missing draft ids instead of a `404`.
- **Evidence of need:** Production browser verification on 2026-03-16 reproduced a fresh chat session issuing `GET /api/chat/conversations/<uuid>` before first send and receiving `404`, even though no persisted conversation had been created yet. Code inspection tied the behavior to `apps/web/components/chat/ChatContainer.tsx`, `apps/web/lib/chat/useAgentWebSocket.ts`, and `apps/web/app/api/chat/conversations/[id]/route.ts`.
- **Alignment:** Preserves the current Cloudflare Worker transport contract, keeps auth and org-scoped Prisma reads unchanged, and narrows the fix to client bootstrap behavior plus a backward-compatible detail-route shield.
- **Risk/rollback:** Low-to-medium risk because the patch touches central chat bootstrap state, but it does not weaken auth, persistence, or route validation. Rollback is straightforward by reverting the client state split and route compatibility change if chat continuation behavior regresses.
- **Acceptance Criteria / Tests:**
  - WebSocket bootstrap uses a private session id that is not written into the URL for a fresh chat.
  - Fresh chat render does not fetch `/api/chat/conversations/[id]` before the first send.
  - Existing persisted conversations still load through the same detail route and sidebar flow.
  - Add a route regression for missing conversation ids returning `200 { conversation: null }`.
  - Add a client regression proving the fresh-chat bootstrap path does not fetch a nonexistent conversation.
  - Re-run focused chat tests plus `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence / Verification:**
  - Split draft transport-session state from persisted conversation state in [apps/web/components/chat/ChatContainer.tsx](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/components/chat/ChatContainer.tsx) so fresh WebSocket chats keep the bootstrap id private and only promote a conversation id into the URL when it is not a draft-session echo.
  - Updated [apps/web/lib/chat/useAgentWebSocket.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/lib/chat/useAgentWebSocket.ts) to take a transport `sessionId` while preserving the Worker's current query-param contract.
  - Hardened [apps/web/app/api/chat/conversations/[id]/route.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/app/api/chat/conversations/[id]/route.ts) so missing draft ids return `200 { conversation: null }`.
  - Added regressions in [apps/web/app/api/chat/conversations/[id]/route.test.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/app/api/chat/conversations/[id]/route.test.ts), [apps/web/lib/chat/__tests__/useAgentWebSocket.test.tsx](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/lib/chat/__tests__/useAgentWebSocket.test.tsx), and [apps/web/components/chat/ChatContainer.test.tsx](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/components/chat/ChatContainer.test.tsx).
  - Focused verification passed: `pnpm -C apps/web test -- 'app/api/chat/conversations/[id]/route.test.ts' 'lib/chat/__tests__/useAgentWebSocket.test.tsx' 'components/chat/ChatContainer.test.tsx'`.
  - Full verification gate passed: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### DEP-008 — OCR Runtime Refresh (P1)

- **Priority:** P1
- **Status:** Done (2026-03-14)
- **Scope:** Refresh the app's direct `tesseract.js` dependency to the current supported line without expanding into the broader document-processing architecture.
- **Problem:** After `DEP-007`, `tesseract.js` was the last remaining app-only package before the repo dropped into fully coupled migration tracks. The app uses it only in the OCR fallback inside `apps/web/lib/services/documentProcessing.service.ts`, so leaving it behind created isolated dependency drift on a narrow code surface.
- **Expected Outcome (measurable):**
  - `tesseract.js` is updated to `^7.0.0` in the app manifest and lockfile.
  - The existing OCR fallback still imports `createWorker` correctly under the new package version.
  - The full repo verification gate passes after the refresh.
- **Evidence of need:** A fresh 2026-03-14 `pnpm outdated -r --format json` audit still flagged `tesseract.js` `5.1.1 -> 7.0.0`, and repo inspection showed exactly one direct usage site in the document-processing OCR fallback.
- **Alignment:** Keeps the dependency work in a narrow app-only slice, preserves the current OCR fallback architecture, and avoids coupling this refresh to Tiptap/Yjs, Prisma 7, ESLint 10, or Wrangler 4.
- **Risk/rollback:** Low-to-medium risk because the package crosses major versions, but the code surface is narrow and the runtime contract in use is limited to `createWorker(...).recognize(...).terminate()`. Rollback is straightforward by reverting the manifest and lockfile changes if the focused smoke or repo gate regresses.
- **Acceptance Criteria / Tests:**
  - Update only `tesseract.js` to the current approved line.
  - Prove the app can still import `createWorker` from `tesseract.js` with a focused smoke check.
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence / Verification:**
  - Updated [apps/web/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/package.json) to declare `tesseract.js` `^7.0.0`.
  - Refreshed [pnpm-lock.yaml](/Users/gallagherpropertycompany/Documents/gallagher-cres/pnpm-lock.yaml) with `pnpm install`.
  - Focused module smoke passed: `pnpm -C apps/web exec node --input-type=module -e "const m = await import('tesseract.js'); console.log(typeof m.createWorker);"`.
  - Verification passed on the final code state: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### DEP-007 — Dotenv Tooling Refresh (P1)

- **Priority:** P1
- **Status:** Done (2026-03-14)
- **Scope:** Refresh the repo's direct `dotenv` and `dotenv-cli` dependencies to the current lines without broadening into unrelated env-loader or script refactors.
- **Problem:** After `DEP-006`, the smallest remaining outdated slice is the env-tooling pair: `dotenv` `16.6.1 -> 17.3.1` and `dotenv-cli` `8.0.0 -> 11.0.0`. The repo depends on `dotenv` in several Node/Playwright scripts and on `dotenv-cli` for the Prisma/db scripts in `packages/db`, so leaving them stale creates avoidable tooling drift while larger runtime migrations remain deferred.
- **Expected Outcome (measurable):**
  - Root `dotenv` is updated to `^17.3.1`.
  - `packages/db` `dotenv-cli` is updated to `^11.0.0` without breaking the existing `dotenv -e ../../.env -- <command>` script contract.
  - The full repo verification gate passes after the refresh.
- **Evidence of need:** A fresh 2026-03-14 `pnpm outdated -r --format json` audit still flagged `dotenv` and `dotenv-cli`, and the published `dotenv-cli@11.0.0` README still documented the same `-e` plus `--` command form currently used by the repo's db scripts.
- **Alignment:** Keeps the dependency work in a narrow tooling slice, preserves the existing script interface, and avoids coupling this refresh to Prisma 7, ESLint 10, Wrangler 4, or the collaborative-editor migration.
- **Risk/rollback:** Low-to-medium risk because the packages are tooling-facing rather than runtime-critical, but `dotenv-cli` sits on db workflows and must preserve command semantics. Rollback is straightforward by reverting the manifest and lockfile changes if the script smoke check or repo gate regresses.
- **Acceptance Criteria / Tests:**
  - Update only `dotenv` and `dotenv-cli` to the current approved lines.
  - Prove the `packages/db` Prisma wrapper still works with a focused `dotenv` CLI smoke invocation.
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence / Verification:**
  - Updated [package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/package.json) to declare `dotenv` `^17.3.1`.
  - Updated [packages/db/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/db/package.json) to declare `dotenv-cli` `^11.0.0`.
  - Refreshed [pnpm-lock.yaml](/Users/gallagherpropertycompany/Documents/gallagher-cres/pnpm-lock.yaml) with `pnpm install`.
  - Focused db-script smoke passed: `pnpm -C packages/db exec dotenv -e ../../.env -- prisma version`.
  - Verification passed on the final code state: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### DEP-006 — Prisma Adapter Patch Refresh (P1)

- **Priority:** P1
- **Status:** Done (2026-03-14)
- **Scope:** Refresh the existing Prisma adapter packages on their current major line without attempting the separate Prisma 7 client/CLI migration.
- **Problem:** After `DEP-005`, the lowest-risk remaining dependency work is the adapter pair already running on the 7.x line: `@prisma/adapter-pg` `7.4.2 -> 7.5.0` and `@prisma/driver-adapter-utils` `7.4.2 -> 7.5.0`. Leaving them behind creates drift inside the current adapter stack even though the repo is not yet taking the broader Prisma 7 migration.
- **Expected Outcome (measurable):**
  - `@prisma/adapter-pg` and `@prisma/driver-adapter-utils` are aligned to `7.5.0`.
  - The gateway adapter code continues to compile against the updated driver types with no behavioral changes.
  - The full repo verification gate passes after the refresh.
- **Evidence of need:** A fresh 2026-03-14 `pnpm outdated -r --format json` audit still flagged `@prisma/adapter-pg` and `@prisma/driver-adapter-utils`, and package metadata showed `@prisma/adapter-pg@7.5.0` depends directly on `@prisma/driver-adapter-utils@7.5.0`.
- **Alignment:** Keeps the dependency work in a narrow same-major adapter slice, preserves the existing Prisma 6 client/CLI baseline, and avoids coupling this refresh to the separate Prisma 7 migration.
- **Risk/rollback:** Low risk because the packages stay on the current major and the code surface using them is narrow. Rollback is straightforward by reverting the manifest/lockfile changes if typecheck or build regresses.
- **Acceptance Criteria / Tests:**
  - Update only `@prisma/adapter-pg` and `@prisma/driver-adapter-utils` to `7.5.0`.
  - Do not widen scope into `prisma` / `@prisma/client` major upgrades.
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence / Verification:**
  - Updated [package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/package.json) to declare `@prisma/adapter-pg` `^7.5.0`.
  - Updated [packages/db/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/db/package.json) to declare `@prisma/driver-adapter-utils` `^7.5.0`.
  - Refreshed [pnpm-lock.yaml](/Users/gallagherpropertycompany/Documents/gallagher-cres/pnpm-lock.yaml) with `pnpm install`.
  - Verification passed on the final code state: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### DEP-005 — Sonner Toast Runtime Refresh (P1)

- **Priority:** P1
- **Status:** Done (2026-03-14)
- **Scope:** Refresh the app's direct `sonner` dependency to the current approved latest line and verify that the existing toast/toaster wrapper still compiles and behaves under the standard repo gate.
- **Problem:** After `DEP-004`, `sonner` remained the last app-only outdated runtime package at `1.7.4 -> 2.0.7`. The app uses `toast.*` broadly but through a thin wrapper in `apps/web/components/ui/sonner.tsx`, so this was the last isolated UI-runtime candidate before the remaining coupled migrations.
- **Expected Outcome (measurable):**
  - `sonner` is updated to `^2.0.7` in the app manifest and lockfile.
  - Existing `toast.*` calls and the shared `Toaster` wrapper still compile, or are corrected in place if the major changed surface details.
  - The full repo verification gate passes after the refresh.
- **Evidence of need:** A fresh 2026-03-14 `pnpm outdated -r --format json` audit still flagged `sonner` `1.7.4 -> 2.0.7` in [apps/web/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/package.json), and repo inspection showed app usage is concentrated in direct `toast` calls plus a single wrapper component.
- **Alignment:** Keeps the dependency work in a narrow app-only slice, preserves runtime/security behavior, and avoids coupling this UI package refresh to Prisma 7, ESLint 10, Tiptap 3, or other higher-risk tracks.
- **Risk/rollback:** Low-to-medium risk because the upgrade crosses a major version, but the app surface is limited and the wrapper plus full repo gate provide a straightforward stop condition. Rollback is straightforward by reverting the manifest/lockfile change if compile or tests regress.
- **Acceptance Criteria / Tests:**
  - Update only `sonner` to the approved current line.
  - Fix any wrapper or toast-call regressions introduced by the refresh without widening scope into unrelated UI refactors.
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence / Verification:**
  - Updated [apps/web/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/package.json) to declare `sonner` `^2.0.7`.
  - Refreshed [pnpm-lock.yaml](/Users/gallagherpropertycompany/Documents/gallagher-cres/pnpm-lock.yaml) with `pnpm install`.
  - Verification passed on the final code state: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### DEP-004 — Lucide React Icon Pack Refresh (P1)

- **Priority:** P1
- **Status:** Done (2026-03-14)
- **Scope:** Refresh the app's direct `lucide-react` dependency to the current approved latest line and verify that the icon surface remains compile-safe across the UI.
- **Problem:** After `DEP-003`, `lucide-react` remained the next clean isolated outdated package at `0.452.0 -> 0.577.0`. The package is used broadly across the app, so leaving it stale compounded future UI-package drift, but it still fit a self-contained single-dependency refresh.
- **Expected Outcome (measurable):**
  - `lucide-react` is updated to `^0.577.0` in the app manifest and lockfile.
  - All current icon imports still compile or are corrected in-place if the package changed icon exports.
  - The full repo verification gate passes after the refresh.
- **Evidence of need:** A fresh 2026-03-14 `pnpm outdated -r --format json` audit still flagged `lucide-react` `0.452.0 -> 0.577.0` in [apps/web/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/package.json), and repo inspection showed the package is imported across many app UI surfaces.
- **Alignment:** Keeps the dependency work in a narrow app-only slice, preserves runtime/security behavior, and avoids coupling this UI package refresh to larger migration families such as Prisma 7, ESLint 10, or Tiptap 3.
- **Risk/rollback:** Low-to-medium risk because `lucide-react` is used widely and remains on a `0.x` versioning line, but the blast radius is still limited to import/compile behavior and is guarded by the standard repo gate. Rollback is straightforward by reverting the manifest/lockfile change if compile or UI tests regress.
- **Acceptance Criteria / Tests:**
  - Update only `lucide-react` to the approved current line.
  - Fix any icon-export regressions introduced by the refresh without widening scope into unrelated UI refactors.
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence / Verification:**
  - Updated [apps/web/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/package.json) to declare `lucide-react` `^0.577.0`.
  - Refreshed [pnpm-lock.yaml](/Users/gallagherpropertycompany/Documents/gallagher-cres/pnpm-lock.yaml) with `pnpm install`.
  - Verification passed on the final code state: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### DEP-003 — OpenAI SDK Manifest Alignment (P1)

- **Priority:** P1
- **Status:** Done (2026-03-14)
- **Scope:** Align the declared `openai` dependency with the currently approved latest patch/minor line in the app and shared wrapper package.
- **Problem:** After `DEP-002`, the next isolated remaining runtime upgrade was `openai` `6.25.0 -> 6.29.0`. The repo already resolved `6.25.0` in the lockfile, but both declaring manifests still advertised `^6.21.0`, which left version drift and future maintenance ambiguity.
- **Expected Outcome (measurable):**
  - The `openai` manifest declarations in the app and wrapper package are aligned to `^6.29.0`.
  - The lockfile resolves the new SDK version without pulling adjacent major upgrades.
  - The full repo verification gate passes after the refresh.
- **Evidence of need:** A fresh 2026-03-14 `pnpm outdated -r --format json` audit still flagged `openai` `6.25.0 -> 6.29.0` in [apps/web/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/package.json) and [packages/openai/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/package.json).
- **Alignment:** Keeps the dependency work on a narrow same-major SDK bump, preserves the existing Responses wrapper contract, and avoids coupling this refresh to higher-risk `@openai/agents` or Prisma changes.
- **Risk/rollback:** Low-to-medium risk because the SDK is central to runtime integrations, but the scope is limited to a same-major manifest/lockfile refresh with the standard repo gate as the stop condition. Rollback is straightforward by reverting the bump if verification fails.
- **Acceptance Criteria / Tests:**
  - Update only the declared `openai` version in the app and wrapper manifests.
  - Refresh the lockfile without widening scope into unrelated dependency families.
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence / Verification:**
  - Updated [apps/web/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/package.json) and [packages/openai/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/package.json) to declare `openai` `^6.29.0`.
  - Refreshed [pnpm-lock.yaml](/Users/gallagherpropertycompany/Documents/gallagher-cres/pnpm-lock.yaml) with `pnpm install`.
  - Verification passed on the final code state: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### DEP-002 — Tailwind Merge Alignment + UUID Dependency Removal (P1)

- **Priority:** P1
- **Status:** Done (2026-03-14)
- **Scope:** Apply the next low-risk dependency cleanup by aligning `tailwind-merge` with the app's Tailwind 4 stack and removing the now-unnecessary direct `uuid` dependency from app/server manifests.
- **Problem:** After `DEP-001`, the remaining lowest-risk dependency drift was concentrated in `tailwind-merge` and a stale direct `uuid` dependency. The app already runs Tailwind 4, and most of the repo already uses `crypto.randomUUID()`, but manifests still carried older declarations that added avoidable maintenance noise.
- **Expected Outcome (measurable):**
  - `tailwind-merge` is updated to the Tailwind 4 line without changing UI behavior.
  - Direct `uuid` usage is removed from runtime code and manifests in favor of native `crypto.randomUUID()`.
  - The full repo verification gate passes after the refresh.
- **Evidence of need:** A 2026-03-14 `pnpm outdated -r --format json` audit still flagged `tailwind-merge` `2.6.1 -> 3.5.0` and `uuid` `11.1.0 -> 13.0.0`. Repo inspection showed `tailwind-merge` is only consumed via `apps/web/lib/utils.ts`, the app is already on Tailwind 4, and the remaining direct `uuid` import was confined to `packages/server/src/services/memory-ingestion.service.ts` while the rest of the repo already used `crypto.randomUUID()`.
- **Alignment:** Keeps the dependency refresh focused on low-risk cleanup, preserves current runtime/security behavior, and avoids larger coupled upgrades such as Prisma 7, Tiptap 3, `@openai/agents`, ESLint 10, and Wrangler 4.
- **Risk/rollback:** Low risk because the change is limited to one small utility dependency bump plus replacing library UUID generation with the platform-native equivalent already used elsewhere. Rollback is straightforward by reverting the manifest/code changes if a regression appears.
- **Acceptance Criteria / Tests:**
  - Update only `tailwind-merge` to the Tailwind 4-compatible major.
  - Replace remaining direct `uuid` calls with `crypto.randomUUID()` and remove `uuid` from local manifests.
  - Do not widen scope into unrelated dependency families.
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence / Verification:**
  - Updated [apps/web/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/package.json) to `tailwind-merge` `^3.5.0` and removed the unused direct `uuid` dependency from the app manifest.
  - Removed the direct `uuid` dependency from [packages/server/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/server/package.json) and replaced the remaining `uuid` calls in [memory-ingestion.service.ts](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/server/src/services/memory-ingestion.service.ts) with `crypto.randomUUID()`.
  - Refreshed [pnpm-lock.yaml](/Users/gallagherpropertycompany/Documents/gallagher-cres/pnpm-lock.yaml) with `pnpm install`.
  - Verification passed on the final code state: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

### DEP-001 — Safe Dependency Refresh Batch 1 (P1)

- **Priority:** P1
- **Status:** Done (2026-03-14)
- **Scope:** Apply the first low-risk dependency refresh batch across the monorepo and remove deprecated ambient type packages that are no longer needed.
- **Problem:** A 2026-03-14 `pnpm outdated -r --format json` audit flagged stale patch/minor versions across core toolchain/runtime packages plus deprecated `@types/bcryptjs` and `@types/uuid`, which increases maintenance noise and compounds future upgrade risk.
- **Expected Outcome (measurable):**
  - The selected low-risk dependency set is updated in manifests and lockfile without widening scope into high-coupling majors.
  - Deprecated ambient type packages are removed with no runtime behavior change.
  - The full repo verification gate passes after the refresh.
- **Evidence of need:** The dependency audit flagged outdated versions for `postcss`, `@cloudflare/workers-types`, `@sentry/nextjs`, `@sentry/node`, `framer-motion`, `happy-dom`, `maplibre-gl`, `pg`, `recharts`, `typescript-eslint`, and `vitest`, plus deprecated `@types/bcryptjs` and `@types/uuid`.
- **Alignment:** Keeps the refresh within low-risk patch/minor maintenance boundaries, preserves existing security and org-scoping invariants, and intentionally avoids major migration surfaces such as Prisma 7, `@openai/agents`, Tiptap 3, Wrangler 4, and other higher-risk upgrades.
- **Risk/rollback:** Low risk because the changes are limited to manifest and lockfile maintenance. Rollback is straightforward by reverting the dependency commit if any verification failure is attributable to the refresh.
- **Acceptance Criteria / Tests:**
  - Update only the approved batch-1 dependency set: `postcss`, `@cloudflare/workers-types`, `@sentry/nextjs`, `@sentry/node`, `framer-motion`, `happy-dom`, `maplibre-gl`, `pg`, `recharts`, `typescript-eslint`, and `vitest`.
  - Remove deprecated `@types/bcryptjs` and `@types/uuid` where package-native typings are sufficient.
  - Do not introduce unrelated dependency upgrades or major-version migrations.
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.
- **Evidence / Verification:**
  - Updated the approved dependency batch in [package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/package.json), [apps/web/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/package.json), [infra/cloudflare-agent/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/infra/cloudflare-agent/package.json), [packages/artifacts/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/artifacts/package.json), [packages/db/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/db/package.json), [packages/evidence/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/evidence/package.json), [packages/openai/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/openai/package.json), [packages/server/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/server/package.json), and [packages/shared/package.json](/Users/gallagherpropertycompany/Documents/gallagher-cres/packages/shared/package.json), then refreshed the lockfile with `pnpm install`.
  - Removed deprecated `@types/bcryptjs` and `@types/uuid` entries from the app and server manifests because the runtime packages already provide sufficient typings.
  - Recharts 3.8 tightened tooltip formatter types; patched [apps/web/components/market/BuildingPermitsDashboard.tsx](/Users/gallagherpropertycompany/Documents/gallagher-cres/apps/web/components/market/BuildingPermitsDashboard.tsx) to accept the widened tooltip value/name contract without changing runtime behavior.
  - Verification passed on the final code state: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `OPENAI_API_KEY=placeholder pnpm build`.

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
