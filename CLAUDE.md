# CLAUDE.md

Last reviewed: 2026-03-10

**🟢 MARCH 2026 STABILIZATION COMPLETE (2026-03-10):**
- ✅ Map perf: initial load fanout 4→1 query, geometry batch 5→8 with 50ms delay, cache headers on all map routes
- ✅ Workflow reliability: durable DB-backed idempotency (`automation_events.idempotency_key` unique index), 30s handler timeout, 6-code error taxonomy
- ✅ Stability sentinel: automated 10-min cron (`/api/cron/stability-sentinel`) monitoring chat/map/workflow surfaces with threshold-based pass/fail
- ✅ Alert pipeline: self-hosted webhook at `/api/admin/sentinel-alerts` persists alerts to DB, Sentry integration
- **See `docs/runbooks/STABILITY_RELEASE_RUNBOOK_2026-03-10.md` and `docs/runbooks/STABILITY_SENTINEL_RUNBOOK.md` for operations**

## Project Overview

**Entitlement OS** — Internal operating system for Gallagher Property Company, a commercial real estate investment and development firm focused on light industrial, outdoor storage, and truck parking in Louisiana. The platform combines a 14-agent AI coordinator with a deal pipeline UI, property database integration, and document generation to manufacture certainty in entitlement processes.

**Live at:** gallagherpropco.com
**Deployed on:** Vercel (frontend) + Local 12-core i7 Windows 11 (Docker Compose: FastAPI gateway :8000, Martin tiles :3000, PostgreSQL/Qdrant internal, Cloudflare Tunnel + Hyperdrive)

**Architecture (verified 2026-03-21):** TWO Docker Compose stacks on Windows 11, on SEPARATE Docker networks. See "Database Topology" below. Vercel reaches app DB via Cloudflare Hyperdrive (config `ebd13ab7df60414d9ba8244299467e5e`) through CF Worker `/db` endpoint. Prisma gateway adapter: `packages/db/src/gateway-adapter.ts`. Both Supabase projects archived (2026-03-04).

**Remote DB access:** See "Database Topology" section below. The CF DB tunnel (`db.gallagherpropco.com`) connects to the **app DB only** — it does NOT have property/screening tables. To query property data, use the gateway's `/tools/parcels.sql` endpoint.

**Remote SSH:** `ssh cres_admin@ssh.gallagherpropco.com` (requires `~/.ssh/config` ProxyCommand). If you get `websocket: bad handshake`, sshd is stopped on the Windows PC — see `docs/SERVER_MANAGEMENT.md` troubleshooting.

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
- Windows Firewall blocks ALL LAN ports (22, 5432, 54323, 8000, 8765, 445). Only Cloudflare Tunnel services are accessible remotely.

## Key Rules

### Do This
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

## Skill Routing Awareness

For domain-specific tasks, route to skill docs in `skills/`:

- `skills/underwriting` — financial and valuation analysis.
- `skills/entitlement-os` — entitlement phase work; load phase file sub-skills as needed.
- `skills/market-trajectory` — market trend and comp trajectory analysis.
- `skills/property-report` — investment memo and artifact generation tasks.
- `skills/data-extraction` — county/assessor fetch and parcel import workflows.
- `skills/parcel-ops` — parcel lookup, geometry retrieval, and map diagnostics.

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
