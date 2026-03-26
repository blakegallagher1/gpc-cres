# Architecture

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js (App Router) | 16.1.6 |
| UI | React + shadcn/ui + Radix + Tailwind | 19.0.0 |
| State | Zustand | 4.5.5 |
| Data Fetching | SWR | 2.4.0 |
| Agent SDK | @openai/agents (TypeScript) | 0.4.15 |
| ORM | Prisma | 6.4.1 |
| Database | PostgreSQL (local Docker + Cloudflare Hyperdrive) | 16 |
| Auth | NextAuth v5 (session-based JWT) | — |
| Collaboration | TipTap + Yjs | 2.11.7 / 13.6.15 |
| Workflow Viz | @xyflow/react | 12.3.2 |
| Package Manager | pnpm | 9.11.0 |
| Node | 22 | — |
| TypeScript | strict mode | 5.7.3 |
| Local API | FastAPI gateway (Docker Compose) + Martin + Qdrant | 0.115 / 0.30 |
| Agent Runtime | Cloudflare Workers + Durable Objects (WebSocket chat) | — |
| Browser Automation | Node.js + Playwright + Chromium (CUA Worker, Docker Compose) | 22 / 4.2 / 126 |
| Tunnel | Cloudflare Tunnel + Hyperdrive (DB proxy for Vercel) | — |
| Orchestration (parked) | Temporal | 1.24.2 |

## Repository Structure

```
entitlement-os/
├── apps/
│   ├── web/                 # Next.js frontend + API routes
│   │   ├── lib/automation/  # 12 event-driven automation handlers + 14 test suites
│   │   └── lib/server/      # Server-only modules (propertyDbEnv, rateLimiter)
│   └── worker/              # Temporal worker (parked for v2)
├── packages/
│   ├── db/                  # Prisma schema, client, migrations, seed
│   ├── openai/              # 13 agents + ~28 tools + retry/response utils
│   ├── shared/              # Zod schemas, enums, JSON schema utils
│   ├── evidence/            # URL snapshot, text extraction, hash comparison
│   ├── artifacts/           # PDF + PPTX generation via Playwright + pptxgenjs
│   └── server/              # @gpc/server — shared service modules (imports db + shared)
├── infra/
│   ├── cloudflare-agent/    # Cloudflare Worker + Durable Object for WebSocket agent chat
│   ├── local-api/           # FastAPI server: tiles proxy, parcel search, screening (Python)
│   ├── docker/              # docker-compose: Postgres + Temporal stack
│   └── sql/                 # Property DB RPC function definitions
├── legacy/python/           # Original Python agents (frozen reference, do NOT delete)
├── docs/                    # INDEX.md, SPEC.md, ROADMAP pointers, archived snapshots
└── .github/workflows/       # CI (ci.yml)
```

## Agent Architecture

14 agents in `packages/openai/src/agents/`, wired via `createConfiguredCoordinator()`:

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
| Market Trajectory | gpt-5.1 | Neighborhood trajectory, permit heatmaps, gentrification indicators |

**Tool wiring:** Module-level agent exports are tool-free. Tools are attached via `withTools()` inside `createConfiguredCoordinator()` — never on the bare exports.

**~29 unique tools** across 10 files in `packages/openai/src/tools/`, distributed into 14 agent-specific arrays:
- Deal CRUD, task management, parcel updates
- Property DB: search 560K parcels, 7 screening endpoints (flood, soils, wetlands, EPA, traffic, LDEQ, full)
- Zoning matrix lookup (EBR UDC), parish pack lookup
- Evidence snapshot, hash comparison
- Triage scoring, hard filter checks
- Buyer management + outreach logging
- Browser automation (`browser_task`) — tasks sent to CUA Worker for Playwright execution

All 14 agents have tools wired. Market Trajectory uses Socrata (building permits) and Google Places (gentrification indicators). EntitlementOS agent can execute browser automation via `browser_task` tool with playbook learning workflow (search KB → browse → save strategy).

## Agent Communication Layer (Cloudflare Worker + Durable Object)

Deployed at `agents.gallagherpropco.com`. Provides persistent WebSocket transport for agent chat, replacing the SSE-only path for longer-running multi-tool conversations.

```
[Browser] ←WebSocket→ [CF Worker] → [Durable Object (per conversationId)]
                                         ├── WebSocket → OpenAI Responses API (wss://api.openai.com/v1/responses)
                                         ├── HTTP POST → api.gallagherpropco.com (gateway tools: parcel, screening)
                                         └── HTTP POST → gallagherpropco.com/api/agent/tools/execute (Vercel tools: deals, tasks, etc.)
```

**Key files:** `infra/cloudflare-agent/src/index.ts` (Worker entry), `infra/cloudflare-agent/src/durable-object.ts` (AgentChatDO), `infra/cloudflare-agent/src/tool-router.ts` (gateway vs Vercel routing).

**Browser hook:** `apps/web/lib/chat/useAgentWebSocket.ts` — React hook connecting to DO via `wss://agents.gallagherpropco.com/ws?token=<jwt>&conversationId=<uuid>`.

**Dual transport:** Feature-flagged via `NEXT_PUBLIC_AGENT_WS_URL`. When set, `ChatContainer.tsx` uses WebSocket; otherwise falls back to SSE (`POST /api/chat`).

**Tool routing:** Gateway tools (parcel lookup, screening) go to `api.gallagherpropco.com` with `LOCAL_API_KEY`. Vercel tools (deals, tasks, knowledge) go to `gallagherpropco.com/api/agent/tools/execute` with the user's Auth.js/NextAuth bearer token. Hosted tools (web_search) execute server-side on OpenAI.

**Durable Object state:** Keyed by `conversationId`. Stores `lastResponseId` for OpenAI response chaining via `previous_response_id`. Uses Hibernation API (`acceptWebSocket`) — instance variables reset between messages, recovered from `this.state.storage`.

**Detailed architecture:** See `docs/CLOUDFLARE_AGENTS.md`.

## CUA Browser Agent (Computer Use Automation)

Native browser automation for agents via OpenAI Responses API `{ type: "computer" }` tool. Powered by GPT-5.4 native computer_call capability.

```
[Vercel] → [CF Tunnel] → [gateway:8000] → [middleware proxy Host: "cua."] → [cua-worker:3001]
                             ↓
                    [Fastify HTTP server]
                         ↓
                  [Playwright Browser]
                         ↓
              [OpenAI Responses API computer_call loop]
```

**Key components:**
- **CUA Worker Container** (`gpc-cua-worker`): Node.js 22 + Fastify + Playwright 4.2 + Chromium 126, running on Windows server Docker Compose
- **Source**: `infra/cua-worker/` (TypeScript, build artifacts in `dist/`)
- **Endpoints**: GET /health, POST /tasks (start task), GET /tasks/:id (poll), GET /tasks/:id/events (SSE)
- **Port**: 3001 on `gpc-cres-backend_internal` Docker network (internal to Windows server)
- **Tunnel route**: `cua.gallagherpropco.com` → gateway:8000 with `httpHostHeader: "cua.gallagherpropco.com"`
- **Gateway middleware** (`infra/local-api/main.py`): Checks Host header for "cua." prefix, proxies to cua-worker:3001
- **Browser task tool** (`packages/openai/src/tools/browserTools.ts`): Sends CF Access headers, polls CUA worker for completion
- **Agent integration**: `browser_task` in `BASE_ALLOWED_TOOLS`, added to `entitlementOsTools` array
- **UI components**: `CuaModelToggle.tsx` (GPT-5.4 / GPT-5.4-mini selector), `BrowserSessionCard.tsx` (screenshot streamer)
- **Agent prompt**: Browser Automation section in EntitlementOS agent with playbook learning (search KB before browsing, save successful strategies)

**Files:**
- `infra/cua-worker/src/server.ts` — Fastify HTTP server + task management
- `infra/cua-worker/src/responses-loop.ts` — OpenAI Responses API computer_call loop
- `infra/cua-worker/src/browser-session.ts` — Playwright browser wrapper
- `packages/openai/src/tools/browserTools.ts` — agent tool for browser tasks
- `apps/web/components/chat/CuaModelToggle.tsx` — model selector
- `apps/web/components/chat/BrowserSessionCard.tsx` — screenshot display

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

**Database architecture (consolidated 2026-03-04):**
- **Single PostgreSQL** (local Docker `entitlement-os-postgres` / `entitlement_os`) — all app data (deals, orgs, tasks) + spatial data (560K parcels, PostGIS). Prisma-managed schema.
- **Vercel access:** Cloudflare Hyperdrive (config `ebd13ab7df60414d9ba8244299467e5e`) → CF Worker `/db` → tunnel → local Postgres. Prisma gateway adapter in `packages/db/src/gateway-adapter.ts`.
- **Qdrant** — vector DB for property intelligence embeddings at `qdrant.gallagherpropco.com`

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

**Shared automation infra** in `apps/web/lib/automation/`: `config.ts` (frozen guardrails), `events.ts` (8 event types, fire-and-forget dispatch, two-layer idempotency, 30s handler timeout, 6-code error taxonomy), `gates.ts` (human gate enforcement), `notifications.ts` ([AUTO] task creation), `taskAllowlist.ts` (agent-executable detection), `handlers.ts` (idempotent handler registry).

**Dispatch reliability (2026-03-10):** `dispatchEvent()` enforces two-layer idempotency: L1 in-memory dedup (10s window, same-instance), L2 durable DB guard (`automation_events.idempotency_key` unique index, cross-instance via `INSERT ... ON CONFLICT DO NOTHING`). Handlers time out at 30s via `Promise.race`. Failures are classified into 6 error codes (`TRANSIENT_UPSTREAM`, `TRANSIENT_DB`, `PERMANENT_VALIDATION`, `PERMANENT_CONFIG`, `PERMANENT_NOT_FOUND`, `UNKNOWN`) with retryability signaling. Failures are recorded with `errorCode` and `retryable` in `automation_events.output_data`.

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

**Pattern:** All event dispatches use `.catch(() => {})` — fire-and-forget, never blocks the API response. Handler errors are logged but never propagated. Import `@/lib/automation/handlers.ts` at route top to ensure handler registration.

**Stability sentinel (2026-03-10):** Automated production monitoring via Vercel Cron every 10 minutes at `/api/cron/stability-sentinel`. Probes chat tool execution (405/5xx), map endpoints (latency p95, error rates), and workflow health (idempotency violations, failure rates) via Prisma/Hyperdrive. Alerts persist to `automation_events` via self-hosted webhook (`/api/admin/sentinel-alerts`) and Sentry. CLI runner at `scripts/observability/stability-sentinel.ts` supports authenticated latency probes (service token pattern via `LOCAL_API_KEY` + `x-agent-tool-auth` headers). Thresholds configurable via `SENTINEL_*` env vars. See `docs/runbooks/STABILITY_SENTINEL_RUNBOOK.md`.

**Test coverage:** `apps/web` automation tests run under Vitest (`pnpm --filter gpc-agent-dashboard test -- lib/automation/__tests__`). Exact suite/test counts are intentionally omitted because they drift frequently.

## Local Property API (Docker Compose on Windows 11)

**Full reference:** See `/docs/claude/backend.md` for the canonical backend documentation including architecture diagram, endpoint inventory (`infra/local-api/main.py` core routes + `infra/local-api/admin_router.py` admin routes), auth details, database pools, RPC functions, and operational notes.

**Summary:** Docker Compose on Windows 11 (12-core i7). FastAPI gateway (:8000) + Martin tiles (:3000) + PostgreSQL `entitlement_os` (560K parcels, deals, orgs) + Qdrant. Single Cloudflare Tunnel: `api.gallagherpropco.com` → gateway, `tiles.gallagherpropco.com` → martin. Bearer token auth. Vercel connects via `LOCAL_API_URL` + `LOCAL_API_KEY` env vars.
