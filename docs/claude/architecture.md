# Architecture

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
| Local API | FastAPI gateway (Docker Compose) + Martin + Qdrant | 0.115 / 0.30 |
| Tunnel | Cloudflare Tunnel (single, remotely-managed ingress) | — |
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
│   ├── openai/              # 13 agents + ~26 tools + retry/response utils
│   ├── shared/              # Zod schemas, enums, JSON schema utils
│   ├── evidence/            # URL snapshot, text extraction, hash comparison
│   └── artifacts/           # PDF + PPTX generation via Playwright + pptxgenjs
├── infra/
│   ├── local-api/           # FastAPI server: tiles proxy, parcel search, screening (Python)
│   ├── docker/              # docker-compose: Postgres + Temporal stack
│   └── sql/                 # Property DB RPC function definitions
├── legacy/python/           # Original Python agents (frozen reference, do NOT delete)
├── docs/                    # PLAN.md + SPEC.md + AUTOMATION-FRONTIER.md
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

**~28 unique tools** across 10 files in `packages/openai/src/tools/`, distributed into 14 agent-specific arrays:
- Deal CRUD, task management, parcel updates
- Property DB: search 560K parcels, 7 screening endpoints (flood, soils, wetlands, EPA, traffic, LDEQ, full)
- Zoning matrix lookup (EBR UDC), parish pack lookup
- Evidence snapshot, hash comparison
- Triage scoring, hard filter checks
- Buyer management + outreach logging

All 14 agents have tools wired. Market Trajectory uses Socrata (building permits) and Google Places (gentrification indicators).

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

**Database architecture:**
- **Entitlement OS DB** (Supabase `yjddspdbxuseowxndrak`) — system of record, Prisma-managed
- **Property Database** (local PostgreSQL `cres_db`) — 560K parcels, PostGIS, parcel search/screening/geometry served via local FastAPI server

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

## Local Property API (Docker Compose on Windows 11)

**Architecture:** Vercel serverless functions cannot hold persistent database connections. The local API layer solves this with a Docker Compose stack on a 12-core i7 Windows 11 desktop, exposed via a single Cloudflare Tunnel with remotely-managed ingress rules.

```
Vercel (gallagherpropco.com)
    ↓ HTTPS + Bearer Token
Cloudflare Edge (Atlanta: atl01, atl08, atl10, atl12)
    ├── api.gallagherpropco.com → gateway:8000 (FastAPI)
    │   └── Cache: 60s-3600s by endpoint
    └── tiles.gallagherpropco.com → martin:3000 (MVT tiles)
        └── Cache: 7d immutable
    ↓ Single Cloudflare Tunnel (4 QUIC connections)
Windows 11 Desktop (12-core i7) — Docker Compose
    ├── gateway (FastAPI :8000)
    │   ├── Auth: Bearer token (GATEWAY_API_KEY)
    │   ├── PostgreSQL: asyncpg pool
    │   ├── Qdrant: vector search
    │   └── Request shaping: max bbox 0.1 sq degrees, max 100 results
    ├── martin (:3000, MVT tile generation)
    ├── postgres (internal network, :5432)
    │   └── 560K parcels, 5 parishes, PostGIS
    ├── qdrant (internal network, :6333)
    ├── pgadmin (internal)
    └── cloudflared (tunnel agent)
```

**Why separate subdomains?**
- Independent cache policies (tiles immutable 7d, data short-lived)
- Separate rate limiting (tiles high-volume, tools low-volume)
- CDN optimization (tile subdomain gets aggressive edge caching)

**Tile proxy:** `apps/web/app/api/map/tiles/[z]/[x]/[y]/route.ts` proxies to `https://tiles.gallagherpropco.com/tiles/{z}/{x}/{y}.pbf` with Bearer token. Caching: 24h max-age, 7d stale-while-revalidate, immutable.

**Tiles (`tiles.gallagherpropco.com` → martin:3000):**
- `GET /tiles/{z}/{x}/{y}.pbf` — Vector tiles
- Cache: `public, max-age=604800, immutable`

**API Gateway (`api.gallagherpropco.com` → gateway:8000):**
All endpoints authenticated with Bearer token (`GATEWAY_API_KEY`).

**Parcel endpoints:**
- `POST /tools/parcel.bbox` — Search parcels within bounding box (max 0.1 sq degrees, 100 results, 60s cache)
- `POST /tools/parcel.lookup` — Single parcel by ID (300s cache)

**Qdrant endpoints:**
- `POST /tools/docs.search` — Search project documentation (300s cache, max 20 results)
- `POST /tools/memory.write` — Store conversation memory (no cache, max 10KB payload)

**Health check:**
- `GET /health` — No auth. Returns `{status, timestamp, database, qdrant}`

**Performance targets (p95):**
- Tile requests: <100ms
- Bbox search: <500ms
- Single parcel: <50ms
- Docs/memory: <300ms

**Rate limiter:** `apps/web/lib/server/rateLimiter.ts` — in-memory token bucket, 10 burst, ~100 req/min per route.

**Env vars (Vercel side):** `LOCAL_API_URL` points to either `https://tiles.gallagherpropco.com` or `https://api.gallagherpropco.com` depending on context. `LOCAL_API_KEY` = the GATEWAY_API_KEY; returns 503 if missing.

**Deployment:** Docker Compose at `C:\gpc-cres-backend\docker-compose.yml`. Single `.env` file with `GATEWAY_API_KEY` and `CLOUDFLARE_TUNNEL_TOKEN`. Cloudflare Tunnel ingress rules managed in dashboard (not local config file).
