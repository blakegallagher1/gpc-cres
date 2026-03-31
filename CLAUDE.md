# CLAUDE.md

Last reviewed: 2026-03-25

**🟢 CUA BROWSER AGENT DEPLOYED (2026-03-25):**
- ✅ CUA Worker Container: Node.js + Playwright + Chromium on Windows server (`gpc-cua-worker`)
- ✅ CUA tunnel route: `cua.gallagherpropco.com` → gateway:8000 (with Host header proxy to cua-worker:3001)
- ✅ Browser task tool: `browser_task` in agent tools, uses OpenAI Responses API with computer_call type (GPT-5.4 native)
- ✅ UI components: `CuaModelToggle` (gpt-5.4 / gpt-5.4-mini selector), `BrowserSessionCard` (live screenshot display)
- ✅ Agent prompt: Browser Automation section + playbook learning workflow in EntitlementOS agent
- **See `docs/plans/2026-03-25-cua-browser-agent-design.md` and `docs/plans/2026-03-25-cua-browser-agent-implementation.md` for details**

**🟢 MARCH 2026 STABILIZATION COMPLETE (2026-03-10):**
- ✅ Map perf: initial load fanout 4→1 query, geometry batch 5→8 with 50ms delay, cache headers on all map routes
- ✅ Workflow reliability: durable DB-backed idempotency (`automation_events.idempotency_key` unique index), 30s handler timeout, 6-code error taxonomy
- ✅ Stability sentinel: automated 10-min cron (`/api/cron/stability-sentinel`) monitoring chat/map/workflow surfaces with threshold-based pass/fail
- ✅ Alert pipeline: self-hosted webhook at `/api/admin/sentinel-alerts` persists alerts to DB, Sentry integration
- **See `docs/runbooks/STABILITY_RELEASE_RUNBOOK_2026-03-10.md` and `docs/runbooks/STABILITY_SENTINEL_RUNBOOK.md` for operations**

## Infrastructure Access — READ FIRST

- **SSH to Windows server**: Always use Tailscale. Host alias: `bg`
  - `ssh bg "command here"`
  - NEVER use `cloudflared access tcp`, `ssh.gallagherpropco.com`, or CF Access service tokens for SSH
  - NEVER use SSL when connecting to PostgreSQL on the Windows server
- **Database (direct)**: PostgreSQL on Windows server via Tailscale IP or `bg` host
  - `ssh bg "docker exec -i gpc-cres-backend-postgres-1 psql -U postgres -d entitlement_os -c 'SELECT ...'"`
- **Cloudflare** is for DNS/CDN/Workers/Hyperdrive only — NOT for tunneling to the server
- **Docker Desktop recovery**: If containers are unresponsive, SSH via Tailscale and use the schtasks GUI-session restart trick — see `docs/memory/docker-desktop-recovery-2026-03-31.md`

## Project Overview

**Entitlement OS** — Internal operating system for Gallagher Property Company, a commercial real estate investment and development firm focused on light industrial, outdoor storage, and truck parking in Louisiana. The platform combines a 14-agent AI coordinator with a deal pipeline UI, property database integration, and document generation to manufacture certainty in entitlement processes.

**Live at:** gallagherpropco.com
**Deployed on:** Vercel (frontend) + Local 12-core i7 Windows 11 (Docker Compose: FastAPI gateway :8000, Martin tiles :3000, PostgreSQL/Qdrant internal, Cloudflare Tunnel + Hyperdrive)

**Architecture (verified 2026-03-21):** TWO Docker Compose stacks on Windows 11, on SEPARATE Docker networks. See "Database Topology" below. Vercel reaches app DB via Cloudflare Hyperdrive (config `ebd13ab7df60414d9ba8244299467e5e`) through CF Worker `/db` endpoint. Prisma gateway adapter: `packages/db/src/gateway-adapter.ts`. Both Supabase projects archived (2026-03-04).

**Remote DB access:** See "Database Topology" section below. The CF DB tunnel (`db.gallagherpropco.com`) connects to the **app DB only** — it does NOT have property/screening tables. To query property data, use the gateway's `/tools/parcels.sql` endpoint.

**Remote SSH:** `ssh bg` via Tailscale (see Infrastructure Access above). The old CF Access path (`ssh.gallagherpropco.com`) is DEPRECATED and unreliable — do not use it.

**Admin API:** `https://api.gallagherpropco.com/admin` with `Authorization: Bearer $ADMIN_API_KEY` (in `~/.zshrc`). **NOTE:** Admin routes exist in repo code (`infra/local-api/admin_router.py`) but are NOT deployed on the production gateway yet. Deploy requires SSH.

## Database Topology (CRITICAL — verified 2026-03-21)

The Windows PC runs **two separate Docker networks** with **two Postgres containers**:

| Database | Docker Network | Contains | Accessible Via |
|----------|---------------|----------|---------------|
| **Property DB** | `172.18.x` | `ebr_parcels` (198K), `fema_flood`, `soils`, `wetlands`, `epa_facilities`, `mv_parcel_intelligence` | Gateway only (`api.gallagherpropco.com`) |
| **App DB** | `172.19.x` | Prisma tables (`deals`, `conversations`, `parcels`, `automation_events`, etc.) | CF tunnel (`db.gallagherpropco.com`) + Hyperdrive |

**Key implications:**
- `cloudflared access tcp --hostname db.gallagherpropco.com` → connects to **App DB** (172.19.x). Property tables (`ebr_parcels`, etc.) DO NOT EXIST here.
- Gateway at `api.gallagherpropco.com` → connects to **Property DB** (172.18.x). This is the ONLY remote path to property data.
- To query property data: use `/tools/parcels.sql` endpoint (SELECT only, table allowlist: `ebr_parcels, epa_facilities, fema_flood, ldeq_permits, soils, traffic_counts, wetlands`)
- To run DDL on property DB: requires SSH → `docker exec` into the property DB container. No other path exists.
- The deployed gateway code differs from the repo — deployed has `/tools/screen.*` routes, repo has `/api/screening/*`. Screen endpoints on prod return 500 (broken).
- Windows Firewall blocks ALL LAN ports (22, 5432, 54323, 8000, 8765, 445). Remote access is via Tailscale (`ssh bg`) or Cloudflare Tunnel services (for Vercel/Workers only, not for agent SSH).

## Gateway Proxy (gateway.gallagherpropco.com)

All property data requests go through the CF Worker at `gateway.gallagherpropco.com`. The Worker proxies to the Windows gateway when online, falls back to D1 (Cloudflare edge SQLite) when offline. Every response includes `X-GPC-Source: gateway | d1-cache | d1-stale` header.

- **Worker code:** `infra/gateway-proxy/` (TypeScript, deployed via `wrangler deploy`)
- **Client package:** `packages/gateway-client/` — `GatewayClient` class used by web app + agent tools
- **Server singleton:** `apps/web/lib/server/gatewayClient.ts` — `getGatewayClient()`
- **D1 database:** `gpc-gateway-cache` (id: `52176b29-712b-4da2-a41d-1c2c80119ceb`)
- **Admin dashboard:** `infra/admin-dashboard/` (CF Pages, deploy via `wrangler pages deploy`)
- **CI/CD:** `.github/workflows/deploy-gateway.yml` — auto-deploys on push to `infra/local-api/**`
- **Health monitoring:** CF Cron every 2 min with auto-restart, history in D1
- **Data sync:** Windows PC pushes to D1 every 15 min via `infra/gateway-proxy/scripts/sync-to-d1.py`
- **Env vars (Vercel):** `GATEWAY_PROXY_URL`, `GATEWAY_PROXY_TOKEN` (replacing direct `LOCAL_API_KEY`, `CF_ACCESS_CLIENT_*`)
- **Worker secrets:** `GATEWAY_PROXY_TOKEN`, `LOCAL_API_KEY`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `SYNC_TOKEN`

### Key endpoints
| Route | Auth | Purpose |
|-------|------|---------|
| GET /health | None | Worker health check |
| GET /parcels/search?q=...&limit=... | Bearer | Search parcels (proxied) |
| GET /parcels/:id | Bearer | Get parcel details (proxied) |
| POST /parcels/sql | Bearer | Run SQL query (proxied) |
| GET /screening/:type/:parcelId | Bearer | Environmental screening (proxied) |
| POST /admin/sync | X-Sync-Token | Receive parcel data batches |
| GET /admin/sync/status | Bearer | Sync status |
| POST /admin/deploys/report | Bearer | Record deploy event |
| GET /admin/health/history | Bearer | Health check history |

## CUA Browser Agent (Computer Use Automation)

Native browser automation for agents via OpenAI Responses API `{ type: "computer" }` tool (GPT-5.4 native computer_call).

- **CUA Worker Container** (`gpc-cua-worker`): Node.js + Playwright + Chromium, running on Windows server Docker Compose
  - Source: `infra/cua-worker/` (TypeScript, Fastify server)
  - Endpoints: GET /health, POST /tasks, GET /tasks/:id, GET /tasks/:id/events (SSE)
  - Port 3001 on `gpc-cres-backend_internal` Docker network
- **Tunnel route**: `cua.gallagherpropco.com` → gateway:8000 (middleware proxies Host header "cua." to cua-worker:3001)
- **Browser task tool** (`packages/openai/src/tools/browserTools.ts`): Sends CF Access headers, polls CUA worker for task completion
- **Agent integration**: Added to `BASE_ALLOWED_TOOLS` and `entitlementOsTools` array
- **UI components**: `CuaModelToggle.tsx` (model selector), `BrowserSessionCard.tsx` (live screenshot)
- **Agent prompt**: Browser Automation section in EntitlementOS agent with playbook learning (search KB → browse → save strategy)
- **Env var (Vercel)**: `CUA_WORKER_URL=https://cua.gallagherpropco.com`

## Autonomous Development Pipeline

4-layer autonomous coding pipeline connecting Claude Code (planning/review) with Codex CLI (implementation).

**Pipeline runner:** `scripts/codex-auto/pipeline.sh`

| Layer | What | Entry Point |
|-------|------|-------------|
| L1: Dual-Brain | Claude plans, Codex implements | `pipeline.sh dispatch <tasks/>` |
| L2: Agents SDK | Multi-agent orchestration with gates | `pipeline.sh orchestrate "objective"` |
| L3: CI/CD | Auto-fix failures, auto-review PRs | `pipeline.sh fix` / GitHub Actions |
| L4: Cloud | Parallel background via @codex | chatgpt.com/codex + issue templates |

**GitHub Actions:**
- `codex-autofix.yml` — Triggers on CI failure, opens fix PR
- `codex-review.yml` — Structured PR review on every PR

**Task dispatch:** Create YAML task files (schema: `scripts/codex-auto/schemas/task.schema.json`), run `pipeline.sh dispatch <dir>`.

**Multi-agent:** `pipeline.sh orchestrate "objective" [slug]` — PM coordinates DB/Web/OpenAI/QA agents with gated handoffs. Progress: `output/codex-agents-workflow/<slug>/progress.json`.

## Key Rules

### Do This
- Use `getGatewayClient()` from `@/lib/server/gatewayClient` for property data — do not call gateway directly
- Use `.nullable()` (not `.optional()`) for Zod tool parameters — OpenAI structured outputs requires it
- Use plain `z.string()` — never `z.string().url()` or `z.string().email()` (OpenAI rejects `format:` constraints)
- Wire agent tools in `createConfiguredCoordinator()`, not on module-level exports
- Scope all DB queries with `orgId` for multi-tenant isolation
- Dispatch automation events with `.catch(() => {})` — fire-and-forget, never blocks API response
- Import `@/lib/automation/handlers.ts` at top of any API route that dispatches events (ensures handler registration)
- Use `import "server-only"` in modules that touch server-only secrets — prevents client-side bundling
- Force-add `apps/web/lib/` files to git — root `.gitignore` has `lib/` pattern
- Delete `apps/web/.next/` before CLI deploys to avoid FUNCTION_PAYLOAD_TOO_LARGE
- Use `--archive=tgz` for Vercel CLI deploys (>15K files)

### Don't Do This
- Don't delete `legacy/python/` or `apps/worker/` — parked for reference/v2 (Python porting source + Temporal worker sources; `apps/worker` is not built in default CI—see `.github/workflows/ci.yml`)
- Don't use Chat Completions API — use OpenAI Responses API
- Don't auto-advance deals past TRIAGE_DONE — all post-triage status transitions require human approval (see `gates.ts`)
- Don't auto-send buyer outreach emails — `buyerOutreach.neverAutoSend` is `true`; handlers only create review tasks
- Don't call `dispatchEvent()` without `.catch(() => {})` — unhandled promise rejections crash the route
- Don't prefix server-only secrets with `NEXT_PUBLIC_` — they must stay server-side only
- Don't use `any` type — use `Record<string, unknown>` for dynamic objects
- Don't use `cloudflared access tcp` for anything — use Tailscale (`ssh bg`) instead
- Don't try to SSH via `ssh.gallagherpropco.com` (CF Access path, deprecated and often broken)
- Don't attempt direct connections to `api.gallagherpropco.com` with CF Access headers for DB queries — use Tailscale
- Don't use SSL when connecting to PostgreSQL on the Windows server

## Production Troubleshooting

### Auth returns `auth_unavailable` or `auth_db_unreachable`
1. The DB is unreachable from Vercel → the gateway `/db` endpoint is down
2. SSH via Tailscale: `ssh bg`
3. Check Docker Desktop: `docker ps` — if it errors or shows no containers, Docker Desktop crashed
4. Recovery: use the schtasks GUI-session restart trick documented in `docs/memory/docker-desktop-recovery-2026-03-31.md`
5. Verify: `curl http://localhost:8000/health` and `curl http://localhost:8000/db` from the server

### Full auth chain
Google OAuth → Vercel signIn callback → Prisma → CF Hyperdrive → gateway proxy `/db` endpoint → PostgreSQL on Windows

### Known Single Points of Failure
- Docker Desktop on the Windows PC going down breaks ALL production auth (Vercel → gateway → DB chain). The `/health` endpoint can return OK while `/db` is dead.
- Future consideration: move gateway to a dedicated Linux host (Railway, Fly.io, or a VM) to eliminate this SPOF.

### Always start debugging with
`ssh bg` — never waste time on Cloudflare tunnels or direct DB connections.

## Skill Routing Awareness

For domain-specific tasks, route to skill docs in `skills/`:

- `skills/underwriting` — financial and valuation analysis.
- `skills/entitlement-os` — entitlement phase work; load phase file sub-skills as needed.
- `skills/market-trajectory` — market trend and comp trajectory analysis.
- `skills/property-report` — investment memo and artifact generation tasks.
- `skills/data-extraction` — county/assessor fetch and parcel import workflows.
- `skills/parcel-ops` — parcel lookup, geometry retrieval, and map diagnostics.
- `skills/server-ops` — Windows PC server debugging, Docker, gateway, database, tiles, tunnel ops.

Use routing rules from each skill:

- Deterministic by exact match when the user asks for a specific skill.
- Auto-routed by `description` criteria (`Use when` / `Don't use when`) when intent is implicit.
- Keep domain routing strict with explicit negative-routing examples.
- For `entitlement-os`, load the requested phase sub-skill for phase-gated execution.

Execution security posture for skill-backed flows:

- Shell default posture is network deny-all, narrowed by workflow allowlist.
- Secrets flow through `domain_secrets` style environment bindings, never raw strings.
- Artifact writes and heavy compute happen in workflow filesystem locations, not via stdout-only channels.

## ROADMAP-FIRST IMPLEMENTATION PROTOCOL (MANDATORY)

Before implementing or changing any feature:

1. Check `ROADMAP.md` first.
2. Only work items that are actively marked (`Planned`/in-progress) in that file.
3. When adding new ideas, require a value-analysis before planning:
   - Problem statement and impacted user path
   - Measurable expected outcome
   - Evidence from logs/tests/reports that this is needed
   - Alignment with existing architecture, security, and org-scoping rules
   - Acceptance criteria and test plan
4. If value is unclear or impact is low, mark as `Deferred` with reason and expected revisit date.
5. After completion, update `ROADMAP.md` with results/evidence and status.

The same protocol applies to every future agent session to avoid ad-hoc implementation drift.

## Context Discipline

- Do NOT pre-read files speculatively
- Do NOT read test files unless fixing a test
- Read `docs/claude/` files only when directly relevant to current task

## Detailed Documentation

For architecture, conventions, workflows, and reference details, see:
- `docs/claude/architecture.md` — Tech stack, agents, data model, automation, local API
- `docs/claude/backend.md` — FastAPI gateway, endpoint inventory, Docker Compose, DB pools
- `docs/claude/conventions.md` — Code style, naming, patterns
- `docs/claude/workflows.md` — Agent tool wiring, event dispatch, property DB search, Vercel deploy
- `docs/claude/reference.md` — Build commands, env vars, CI/CD, gotchas
