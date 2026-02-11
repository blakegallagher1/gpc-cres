# CLAUDE.md

## Project Overview

**Entitlement OS** — Internal operating system for Gallagher Property Company, a commercial real estate investment and development firm focused on light industrial, outdoor storage, and truck parking in Louisiana. The platform combines a 13-agent AI coordinator with a deal pipeline UI, property database integration, and document generation to manufacture certainty in entitlement processes.

**Live at:** gallagherpropco.com
**Deployed on:** Vercel (frontend) — Temporal worker parked for v2

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js (App Router) | 16.1.6 |
| UI | React + shadcn/ui + Radix + Tailwind | 19.0.0 |
| State | Zustand | 4.5.5 |
| Data Fetching | SWR | 2.4.0 |
| Agent SDK | @openai/agents (TypeScript) | 0.1.0 |
| ORM | Prisma | 6.4.1 |
| Database | PostgreSQL via Supabase | 16 |
| Auth | Supabase Auth (Google OAuth + email) | 2.93.3 |
| Collaboration | TipTap + Yjs | 2.11.7 / 13.6.15 |
| Workflow Viz | @xyflow/react | 12.3.2 |
| Package Manager | pnpm | 9.11.0 |
| Node | 22 | — |
| TypeScript | strict mode | 5.7.3 |
| Orchestration (parked) | Temporal | 1.24.2 |

## Repository Structure

```
entitlement-os/
├── apps/
│   ├── web/                 # Next.js frontend + API routes
│   │   ├── lib/automation/  # 12 event-driven automation handlers + 14 test suites
│   │   ├── lib/server/      # Server-only modules (chatgptAppsClient, rateLimiter)
│   │   └── app/api/external/chatgpt-apps/  # 5 proxy routes to chatgpt-apps Supabase
│   └── worker/              # Temporal worker (parked for v2)
├── packages/
│   ├── db/                  # Prisma schema, client, migrations, seed
│   ├── openai/              # 13 agents + ~26 tools + retry/response utils
│   ├── shared/              # Zod schemas, enums, JSON schema utils
│   ├── evidence/            # URL snapshot, text extraction, hash comparison
│   └── artifacts/           # PDF + PPTX generation via Playwright + pptxgenjs
├── infra/
│   ├── docker/              # docker-compose: Postgres + Temporal stack
│   └── sql/                 # Property DB RPC function definitions
├── legacy/python/           # Original Python agents (frozen reference, do NOT delete)
├── docs/                    # PLAN.md + SPEC.md + AUTOMATION-FRONTIER.md
└── .github/workflows/       # CI (ci.yml)
```

## Build Commands

All commands run from repo root unless noted.

```bash
# Full monorepo
pnpm install                 # Install all workspace deps
pnpm build                   # Build all packages + apps
pnpm dev                     # Dev mode (all packages parallel)
pnpm typecheck               # Type-check all packages
pnpm lint                    # Lint all packages
pnpm test                    # Test all packages (vitest + jest in apps/web)

# Database (Prisma)
pnpm db:migrate              # Run migrations (dev)
pnpm db:deploy               # Deploy migrations (prod)
pnpm db:seed                 # Seed: GPC org + 3 parishes

# Single package
pnpm --filter @entitlement-os/db generate    # Regenerate Prisma client
pnpm --filter @entitlement-os/openai build   # Build agent package
```

### Frontend dev (from apps/web/)

```bash
npm run dev                  # Next.js dev server :3000
npm run build                # Production build
npm run lint                 # ESLint
npm run test                 # Jest
```

### Vercel deploy build chain (defined in apps/web/vercel.json)

```
db generate → shared build → db build → openai build → next build
```

## Agent Architecture

13 agents in `packages/openai/src/agents/`, wired via `createConfiguredCoordinator()`:

| Agent | Model | Purpose |
|-------|-------|---------|
| Coordinator | gpt-5.2 | Routes to specialists, manages deal context |
| Finance | gpt-5.2 | Pro formas, debt sizing, IRR/equity analysis |
| Legal | gpt-5.2 | Zoning, entitlements, Louisiana civil law |
| Research | gpt-5.2 | Land scouting, market analysis, comps |
| Risk | gpt-5.1 | Flood, environmental, financial, regulatory risk |
| Screener | gpt-5.1 | Triage scoring (KILL/HOLD/ADVANCE) |
| Due Diligence | gpt-5.1 | Phase checklists, red flags, document tracking |
| Entitlements | gpt-5.1 | Permit tracking, CUP/rezoning paths |
| Design | gpt-5.1 | Site planning, density optimization |
| Operations | gpt-5.1 | Construction scheduling, budgets |
| Marketing | gpt-5.1 | Buyer outreach, leasing strategy |
| Tax Strategist | gpt-5.1 | IRC 1031, depreciation, cost segregation |
| Market Intel | gpt-5.1 | Competitor tracking, absorption trends |

**Tool wiring:** Module-level agent exports are tool-free. Tools are attached via `withTools()` inside `createConfiguredCoordinator()` — never on the bare exports.

**~26 unique tools** across 8 files in `packages/openai/src/tools/`, distributed into 13 agent-specific arrays:
- Deal CRUD, task management, parcel updates
- Property DB: search 560K parcels, 7 screening endpoints (flood, soils, wetlands, EPA, traffic, LDEQ, full)
- Zoning matrix lookup (EBR UDC), parish pack lookup
- Evidence snapshot, hash comparison
- Triage scoring, hard filter checks
- Buyer management + outreach logging

All 13 agents now have tools wired (Design: 6, Tax: 4 — previously had zero).

## Data Model (Prisma — 18 models)

**Core:** Org → User → OrgMembership (multi-tenant)
**Deals:** Deal → Parcel, Task, Artifact, Upload
**Buyers:** Buyer → Outreach (per deal)
**Knowledge:** Jurisdiction → JurisdictionSeedSource, ParishPackVersion
**Evidence:** EvidenceSource → EvidenceSnapshot
**Runs:** Run (TRIAGE, ARTIFACT_GEN, etc.)
**Chat:** Conversation → Message

**Key fields added for automation:**
- `Deal.source` — nullable `String?`, tagged `[AUTO] <source>` for auto-created deals (intake)

**Enums:** `sku_type` (SMALL_BAY_FLEX, OUTDOOR_STORAGE, TRUCK_PARKING), `deal_status` (11 stages INTAKE→EXITED/KILLED), `task_status`, `artifact_type`, `run_type` (TRIAGE, ARTIFACT_GEN, BUYER_LIST_BUILD, CHANGE_DETECT, ENRICHMENT, INTAKE_PARSE, DOCUMENT_CLASSIFY, BUYER_OUTREACH_DRAFT, ADVANCEMENT_CHECK)

**Three Supabase projects:**
- Entitlement OS DB (`yjddspdbxuseowxndrak`) — system of record, Prisma-managed
- Louisiana Property DB (`jueyosscalcljgdorrpy`) — 560K parcels, 5 parishes, 9 RPC functions (read-only via `LA_PROPERTY_DB_URL` + `LA_PROPERTY_DB_KEY`)
- chatgpt-apps GIS DB (`jueyosscalcljgdorrpy`) — same Supabase project as Property DB, accessed via separate `external_reader` role with two-header auth. 6 RPC functions for geometry, dimensions, zoning, and amenities cache. See `docs/chatgpt-apps-integration.md`.

## Environment Variables

### Root `.env`
```
DATABASE_URL, DIRECT_DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, OPENAI_API_KEY,
TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE, TEMPORAL_TASK_QUEUE
```

### Frontend (`apps/web/.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
OPENAI_API_KEY, LA_PROPERTY_DB_URL, LA_PROPERTY_DB_KEY, ALLOWED_LOGIN_EMAILS,
CRON_SECRET,
CHATGPT_APPS_SUPABASE_URL, CHATGPT_APPS_SUPABASE_ANON_KEY, CHATGPT_APPS_SUPABASE_EXT_JWT
```

## Automation Philosophy

See `docs/AUTOMATION-FRONTIER.md` for the full automation frontier map.

**Core principle:** Agents advise, humans decide at capital commitment points. The 11 deal statuses represent increasingly irreversible commitments. Automation is safe pre-triage (data-only, reversible). Post-triage, every stage transition requires human approval.

**All 12 automation loops wired** with event-driven handlers in `apps/web/lib/automation/`. 14 test suites, 302 tests. Event dispatch from 7 API routes. See `docs/AUTOMATION-FRONTIER.md` for the full handler registry and event map.

| # | Loop | Handler | Event Trigger |
|---|------|---------|---------------|
| 1 | Deal Intake | `intake.ts` | `intake.received` |
| 2 | Parcel Enrichment | `enrichment.ts` | `parcel.created` |
| 3 | Auto-Triage | `triage.ts` | `parcel.enriched` |
| 4 | Task Execution | `taskExecution.ts` | `task.created`, `task.completed` |
| 5 | Stage Advancement | `advancement.ts` | `task.completed`, `deal.statusChanged` |
| 6 | Document Processing | `documents.ts` | `upload.created` |
| 7 | Change Detection | cron route | Daily 6 AM |
| 8 | Parish Pack Refresh | cron route | Weekly Sunday 4 AM |
| 9 | Artifact Generation | API routes | POST trigger + auto on triage |
| 10 | Buyer Outreach | `buyerOutreach.ts` | `deal.statusChanged`, `triage.completed` |
| 11 | Dead Agent Revival | `agents/index.ts` | Design: 6 tools, Tax: 4 tools |
| 12 | Ops | `ops.ts` | Migration safety, health, alerting |

**Shared automation infra** in `lib/automation/`: `config.ts` (frozen guardrails), `events.ts` (8 event types, fire-and-forget dispatch), `gates.ts` (human gate enforcement), `notifications.ts` ([AUTO] task creation), `taskAllowlist.ts` (agent-executable detection), `handlers.ts` (idempotent handler registry).

**Event dispatch wired in 7 API routes:**

| API Route | Event Dispatched |
|-----------|-----------------|
| `deals/[id]/parcels` POST | `parcel.created` |
| `deals/[id]/route` PATCH | `deal.statusChanged` (when status field changes) |
| `deals/[id]/tasks` POST | `task.created` |
| `deals/[id]/tasks` PATCH | `task.completed` (when status → DONE) |
| `deals/[id]/tasks/[taskId]/run` | `task.completed` (after agent marks DONE) |
| `deals/[id]/triage` POST | `triage.completed` |
| `deals/[id]/uploads` POST | `upload.created` |

**Pattern:** All event dispatches use `.catch(() => {})` — fire-and-forget, never blocks the API response. Handler errors are logged but never propagated. Import `@/lib/automation/handlers` at route top to ensure handler registration.

**Test coverage:** 14 test suites, 302 tests in `lib/automation/__tests__/`. Uses Jest (NOT vitest) with `jest.mock()`/`jest.requireMock()` pattern for Prisma mocking.

## chatgpt-apps Integration (GIS / Zoning / Amenities)

Server-only integration with chatgpt-apps Supabase for canonical GIS data. Full docs: `docs/chatgpt-apps-integration.md`.

**Two-header auth pattern** (both required on every request):
- `apikey` header = `CHATGPT_APPS_SUPABASE_ANON_KEY` (passes Kong API gateway)
- `Authorization: Bearer` = `CHATGPT_APPS_SUPABASE_EXT_JWT` (PostgREST sets DB role to `external_reader`)

**Client:** `apps/web/lib/server/chatgptAppsClient.ts` — imports `server-only`, 6 typed RPC wrappers, timeout/retry, application-level error detection.

**Rate limiter:** `apps/web/lib/server/rateLimiter.ts` — in-memory token bucket, 10 burst, ~100 req/min per route.

**6 RPC functions** (all `SECURITY DEFINER`, `external_reader` has EXECUTE-only, zero table access):

| RPC | Wrapper | Description |
|-----|---------|-------------|
| `rpc_get_parcel_geometry` | `getParcelGeometry()` | bbox, centroid, GeoJSON (detail: low/medium/high) |
| `rpc_get_parcel_dimensions` | `getParcelDimensions()` | width, depth, frontage, confidence |
| `rpc_zoning_lookup` | `getZoningByParcel()` | Zoning codes by parcel ID |
| `rpc_zoning_lookup_by_point` | `getZoningByPoint()` | Zoning codes by lat/lng/parish |
| `rpc_get_amenities_cache` | `getAmenitiesCache()` | Read cached amenities |
| `rpc_upsert_amenities_cache` | `upsertAmenitiesCache()` | Write amenities cache |

**5 API proxy routes** at `/api/external/chatgpt-apps/`:

| Route | Method | RPC |
|-------|--------|-----|
| `parcel-geometry` | POST | `rpc_get_parcel_geometry` |
| `parcel-dimensions` | POST | `rpc_get_parcel_dimensions` |
| `zoning-by-parcel` | POST | `rpc_zoning_lookup` |
| `zoning-by-point` | POST | `rpc_zoning_lookup_by_point` |
| `amenities-cache` | GET/POST | `rpc_get_amenities_cache` / `rpc_upsert_amenities_cache` |

**Smoke test:** `scripts/smoke_chatgpt_apps_integration.ts` — 10 cases testing directly against Supabase (not through API routes). Run with `npx tsx scripts/smoke_chatgpt_apps_integration.ts`.

## Key Rules

### Do This
- Use `.nullable()` (not `.optional()`) for Zod tool parameters — OpenAI structured outputs requires it
- Use plain `z.string()` — never `z.string().url()` or `z.string().email()` (OpenAI rejects `format:` constraints)
- Force-add `apps/web/lib/` files to git — root `.gitignore` has `lib/` pattern
- Delete `apps/web/.next/` before CLI deploys to avoid FUNCTION_PAYLOAD_TOO_LARGE
- Use `--archive=tgz` flag for Vercel CLI deploys (>15K files)
- Restore `.env.local` after `vercel link` (it overwrites the file)
- Wire agent tools in `createConfiguredCoordinator()`, not on module-level exports
- Scope all DB queries with `orgId` for multi-tenant isolation
- Use `prisma.findFirstOrThrow({ where: { id, orgId } })` pattern for access control
- Normalize addresses before property DB search (strip apostrophes, collapse whitespace)
- Dispatch automation events with `.catch(() => {})` — never let event dispatch fail an API response
- Import `@/lib/automation/handlers` at top of any API route that dispatches events (ensures handler registration)
- Read existing record state before update when dispatch depends on detecting a change (e.g., `select: { id: true, status: true }` before PATCH)
- Use `AUTOMATION_CONFIG` from `lib/automation/config.ts` for all guardrail thresholds — never hardcode rate limits
- Use `import "server-only"` in any module that touches chatgpt-apps keys — prevents client-side bundling
- Use two-header auth for chatgpt-apps: `apikey` = anon key, `Authorization: Bearer` = ext JWT — using one key for both headers will fail

### Don't Do This
- Don't delete `legacy/python/` or `apps/worker/` — parked for reference/v2
- Don't use Chat Completions API — use OpenAI Responses API
- Don't add Docker dependencies for v1 — deploy to Vercel, use Vercel Cron for background jobs
- Don't commit `.env.local` or any file with secrets
- Don't use `any` type — use `Record<string, unknown>` for dynamic objects
- Don't auto-advance deals past TRIAGE_DONE — all post-triage status transitions require human approval (see `gates.ts`)
- Don't auto-send buyer outreach emails — `buyerOutreach.neverAutoSend` is `true`; handlers only create review tasks
- Don't call `dispatchEvent()` without the `.catch(() => {})` — unhandled promise rejections crash the route
- Don't use `orderBy: { joinedAt }` on OrgMembership — the field is `createdAt`
- Don't prefix chatgpt-apps env vars with `NEXT_PUBLIC_` — they are server-only secrets
- Don't use chatgpt-apps ext JWT as the `apikey` header — Kong will reject with 401

## Code Style

- **TypeScript**: ESLint 9 + typescript-eslint. Strict mode. Components PascalCase, hooks `use*` prefix.
- **Tools**: snake_case names (e.g., `get_deal_context`). Functions camelCase. Constants UPPER_SNAKE_CASE.
- **Commits**: Short imperative with optional scope: `tools: add flood lookup`, `ui: rewrite ParcelTable`
- **Error handling**: Tool execute functions return `JSON.stringify({ error: "..." })` on failure. API routes use try/catch returning `NextResponse.json({ error }, { status })`.

## CI/CD

GitHub Actions (`ci.yml`): push to `main` + PRs. Backend (Python 3.11) + Frontend (Node 22).
**Known issue:** CI still references old `frontend/` paths — needs update to `apps/web/`.

Vercel: Git-triggered deploys on push to `main`. Build command in `apps/web/vercel.json`.
Cron jobs: `/api/cron/change-detection` (daily 6 AM), `/api/cron/parish-pack-refresh` (weekly Sunday 4 AM).

## Implementation Roadmap

Read `IMPLEMENTATION_PLAN.md` at the repo root for the full 9-phase feature roadmap, all architectural conventions, and shared infrastructure patterns.

**Currently executing: Phase 4A — Document Processing Pipeline**

Rules:
- Do NOT work on phases beyond the currently executing phase unless explicitly instructed
- When making architectural decisions, check future phases in `IMPLEMENTATION_PLAN.md` to ensure compatibility
- Follow the **Shared Infrastructure Conventions** section for all new tables, services, API routes, background jobs, and components
- If existing codebase patterns conflict with the plan's defaults, match the codebase

### Phase Tracker
Update status after each sub-phase ships:

| Sub-Phase | Status |
|-----------|--------|
| 1A: Shared Infra + Notifications | ✅ Done |
| 1B: Smart Alerts & Opportunity Surfacing | ✅ Done |
| 1C: Deadline Tracking & Escalation | ✅ Done |
| 2A: PDF Generation Engine | ✅ Done |
| 2B: Agent-Triggered Generation | ✅ Done |
| 2C: PPTX Generation | ✅ Done |
| 3A: Interactive Pro Forma Builder | ✅ Done |
| 3B: Sensitivity & Scenario Analysis | ✅ Done |
| 3C: Waterfall Distribution Modeling | ✅ Done |
| 3D: Debt Comparison Tool | ✅ Done |
| 4A: Document Processing Pipeline | 🔄 Active |
| 4B: Type-Specific Extractors | ⬜ |
| 5A: Enhanced Map Rendering | ⬜ |
| 5B: Analytical Map Tools | ⬜ |
| 5C: Prospecting Mode | ⬜ |
| 6A: Portfolio Analytics Engine | ⬜ |
| 7A: Automation Dashboard | ⬜ |
| 7B: Approval Workflows | ⬜ |
| 8A: Automated Market Monitoring | ⬜ |
| 9A: Outcome Tracking | ⬜ |
| 9B: Knowledge Base & RAG | ⬜ |
