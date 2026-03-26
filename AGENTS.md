# AGENTS.md — Entitlement OS (gallagher-cres)

## Project Overview

Entitlement OS is a full-stack real estate entitlement intelligence platform. It provides
parcel-level data, zoning analysis, entitlement tracking, and AI-powered research for
commercial real estate development workflows. The platform is a pnpm monorepo with a
Next.js frontend, shared TypeScript packages, a FastAPI gateway (`infra/local-api/main.py`)
for parcel/tools behind Cloudflare Tunnel, and optional Python reference code under
`legacy/python/`.

**Production URLs:**
- Frontend: Vercel (`gallagherpropco.com`)
- Data/tools API: FastAPI gateway behind Cloudflare (`api.gallagherpropco.com` → host :8000)
- Database: PostgreSQL via Prisma; Vercel runtime often uses Cloudflare Hyperdrive to Postgres

**Auth:** NextAuth (app session). See `docs/SPEC.md` and `docs/claude/architecture.md` for the current contract.

## Architecture Map

```
┌─────────────────────────────────────────────────────────────┐
│ apps/web (gpc-agent-dashboard)                             │
│ Next.js · React · TailwindCSS · Vercel                      │
├─────────────────────────────────────────────────────────────┤
│ packages/                                                    │
│  shared · db (Prisma) · evidence · artifacts · openai ·     │
│  server (@gpc/server)                                        │
├─────────────────────────────────────────────────────────────┤
│ infra/cloudflare-agent/ (Durable Object + WebSocket)        │
│ Agent runtime at agents.gallagherpropco.com                  │
├─────────────────────────────────────────────────────────────┤
│ infra/cua-worker/ (CUA Browser Agent)                        │
│ Node.js + Playwright, Responses API computer_call loop       │
├─────────────────────────────────────────────────────────────┤
│ apps/worker (@entitlement-os/worker)                         │
│ Temporal worker — parked for v2; not built in default CI    │
├─────────────────────────────────────────────────────────────┤
│ infra/local-api/main.py + admin_router.py                   │
│ FastAPI gateway (parcel, tools, screening, tiles, CUA proxy) │
├─────────────────────────────────────────────────────────────┤
│ legacy/python/                                               │
│ Frozen reference (original Python agents) — do not delete   │
├─────────────────────────────────────────────────────────────┤
│ External: OpenAI · county/GIS · Martin tiles · Qdrant       │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Frontend**: Next.js, React, TailwindCSS, TypeScript
- **App & API routes**: Next.js (Vercel)
- **Database**: PostgreSQL with Prisma ORM (migrations in `packages/db/prisma/migrations`)
- **Gateway**: FastAPI + asyncpg (`infra/local-api/`), documented in `docs/claude/backend.md`
- **Agent Runtime**: Cloudflare Workers + Durable Objects (WebSocket chat)
- **Browser Automation**: Node.js + Playwright + Chromium (CUA Worker, Docker Compose)
- **Package Manager**: pnpm 9.x (workspaces)
- **Testing**: Vitest (unit + integration), Playwright (e2e)
- **Linting**: ESLint 9.x with typescript-eslint
- **CI/CD**: GitHub Actions (see `.github/workflows/ci.yml` — selected packages + `gpc-agent-dashboard`)
- **Observability**: See `apps/web` observability modules and `docs/OBSERVABILITY_MONITOR.md`

## Dependency Flow Rules (STRICT)

Actual workspace packages live under `packages/`:

| Package | Role |
|---------|------|
| `@entitlement-os/shared` | Shared schemas, enums, utilities |
| `@entitlement-os/db` | Prisma client, migrations — **must not** import `apps/web` or domain app layers |
| `@entitlement-os/evidence`, `@entitlement-os/artifacts` | Domain libraries |
| `@entitlement-os/openai` | Agents, tools, Responses API integration |
| `@gpc/server` | Server-side services (`packages/server`) |

**Rules:**

- Higher-level packages may import lower-level ones; never the reverse (no `packages/db` → `apps/web`).
- `packages/db` must NEVER import from `apps/web` or from `@entitlement-os/openai` / `@entitlement-os/evidence` / `@entitlement-os/artifacts` / `@gpc/server`.
- Circular dependencies between packages are a CI-blocking violation.
- Prefer adding shared types to `@entitlement-os/shared` rather than new leaf packages unless `ROADMAP.md` approves a split.

## Code Conventions

- **TypeScript strict mode** everywhere (`"strict": true` in tsconfig)
- **No `any` types** without explicit ESLint disable + documented reason
- **Zod schemas** for all API request/response validation
- **Server components by default** in Next.js — `'use client'` only when needed
- **Named exports only** — no default exports except Next.js pages
- **Barrel files** (`index.ts`) in each package for public API
- **Absolute imports** via workspace packages (`@entitlement-os/db`, `@gpc/server`, etc.)

## Testing Requirements

- `pnpm test` must pass before any commit
- Unit tests: Vitest, colocated in `__tests__/` or `*.test.ts`
- Integration tests: `tests/` at root (episode, retrieval, reflection, reward, smoke)
- E2E tests: Playwright in `apps/web/tests/`
- Coverage target: 80% for new packages
- All parcel data operations must have smoke tests against production

## Linting & Pre-Commit

- `pnpm lint` runs ESLint across all workspaces
- `pnpm typecheck` runs TypeScript compiler checks across all packages
- Pre-commit: lint + typecheck + test must all pass
- No lint suppressions without a comment explaining why

## Documentation Standards

- `docs/` directory is the canonical documentation location
- `docs/INDEX.md` is the documentation manifest
- `docs/server-manifest.json` summarizes the Windows PC backend + tunnel + Vercel env **names** (not secrets); operators still use `docs/SERVER_MANAGEMENT.md` and `docs/CLOUDFLARE.md` for procedures
- `docs/SPEC.md` is the product specification
- Active implementation status: `ROADMAP.md` (not archived planning snapshots)
- `docs/PLAN.md` is an **archived** snapshot — non-authoritative; use `ROADMAP.md` for current work
- Architecture changes require updating `docs/` before merge
- `AGENTS.md` at root is the agent behavior source of truth
- `CLAUDE.md` at root contains Claude Code project instructions

## CI/CD

- GitHub Actions workflows in `.github/workflows/`
- PR checks: lint → typecheck → test → build (see workflow for filtered packages)
- Production deploys: Vercel (frontend); gateway on host per `docs/SERVER_MANAGEMENT.md`
- Database migrations: `pnpm db:migrate:local` (dev) / `pnpm db:deploy` (prod)

## Shipping Runbook (Codex Agents)

**MANDATORY: Always ship your work.** When verification passes (tests, lint, typecheck, build),
you MUST commit and push to GitHub before reporting completion. Never leave changes uncommitted.
Do not ask for permission to ship — shipping is part of completing the task. Follow this sequence:

1. **Stage**: `git add <files>` (never `git add -A` unless you're sure)
2. **Commit**: Use `~/.codex/bin/gcommit "feat(scope): message"` — NOT raw `git commit`.
   The Codex CLI has a hardcoded git safety layer that blocks `git commit` even when
   execution rules allow it. The `gcommit` wrapper bypasses this by invoking git via
   its full path.
3. **Push**: Use `~/.codex/bin/gpush` — NOT raw `git push`. Same bypass reason.
4. **Combined**: `~/.codex/bin/gship "message"` does stage + commit + push in one step.
5. **If wrappers also fail**: Use the GitHub MCP server (`gh` CLI) to create a PR instead
   of pushing directly. `gh pr create --title "..." --body "..."` is always allowed.

**Playwright cleanup** — after every Playwright run, immediately reset generated file drift:
```bash
git checkout -- apps/web/next-env.d.ts apps/web/tsconfig.json
```
These files get rewritten by Next.js during Playwright's webserver startup. Never commit them.

**Branch policy**: Small fixes and test updates can go directly to `main`. Large features
should use feature branches (`feat/`, `fix/`, `refactor/`).

## Server Access (Windows 11 Backend)

The production backend runs on a 12-core i7 Windows 11 machine via Docker Compose.

**Services:**
| Service | Internal Port | Public URL |
|---------|--------------|------------|
| FastAPI gateway | :8000 | `https://api.gallagherpropco.com` |
| Martin tile server | :3000 | `https://tiles.gallagherpropco.com` |
| PostgreSQL | :5432 | `https://db.gallagherpropco.com` (via `cloudflared` tunnel) |
| Qdrant vector DB | :6333 | `https://qdrant.gallagherpropco.com` |

All external access goes through Cloudflare Tunnel.

**Admin API (preferred over SSH):**
```bash
# Health check
curl -H "Authorization: Bearer $ADMIN_API_KEY" https://api.gallagherpropco.com/admin/health

# Query database
curl -X POST -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT count(*) FROM ebr_parcels"}' \
  https://api.gallagherpropco.com/admin/db/query

# Container logs
curl -H "Authorization: Bearer $ADMIN_API_KEY" https://api.gallagherpropco.com/admin/containers/gateway/logs

# Key endpoints: /admin/health, /admin/db/schema, /admin/db/query, /admin/db/tables,
# /admin/containers, /admin/containers/{name}/logs, /admin/containers/{name}/restart,
# /admin/deploy/gateway, /admin/deploy/reload, /admin/env
```

**Gateway API (parcel/screening data):**
```bash
# Parcel search
curl -H "Authorization: Bearer $LOCAL_API_KEY" \
  "https://api.gallagherpropco.com/api/parcel/search?q=KEYWORD"

# Parcel bbox search (map)
curl -H "Authorization: Bearer $LOCAL_API_KEY" \
  "https://api.gallagherpropco.com/api/parcel/bbox?west=-91.2&south=30.3&east=-91.0&north=30.5"

# Full screening
curl -H "Authorization: Bearer $LOCAL_API_KEY" \
  "https://api.gallagherpropco.com/api/screening/full?parcel_id=PARCEL_ID"
```

**Direct DB access (when Admin API is insufficient):**
```bash
# Start tunnel (runs in foreground — use a separate terminal)
cloudflared access tcp --hostname db.gallagherpropco.com --url localhost:54399

# Then connect
psql postgresql://postgres:postgres@localhost:54399/entitlement_os
```

**SSH (last resort — prefer Admin API):**
```bash
ssh cres_admin@ssh.gallagherpropco.com
# Requires ProxyCommand in ~/.ssh/config — see docs/SERVER_MANAGEMENT.md
```

**Env vars available** (set in shell, passed via `.codex/config.toml`):
- `ADMIN_API_KEY` — Admin API bearer token
- `LOCAL_API_KEY` — Gateway API bearer token
- `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` — Cloudflare Access service token (bypasses CF Access 403)

**Vercel → Postgres:** Cloudflare Hyperdrive (config `ebd13ab7df60414d9ba8244299467e5e`) through CF Worker `/db` endpoint. Prisma adapter: `packages/db/src/gateway-adapter.ts`.

**Comprehensive server operations guide:** `skills/server-ops/SKILL.md` — Full diagnostic checklist, failure modes, recovery procedures, Docker quirks, tunnel config, deployment commands, and environment variables. **Read this file first** when debugging any server issue.

**Reference docs:** `docs/SERVER_MANAGEMENT.md`, `docs/CLOUDFLARE.md`, `docs/server-manifest.json`

## CUA Browser Agent (Computer Use Automation)

**Running the CUA Worker:**
```bash
# From C:\gpc-cres-backend\ on Windows server
docker-compose up -d gpc-cua-worker

# Verify health
curl -H "Authorization: Bearer $LOCAL_API_KEY" https://cua.gallagherpropco.com/health
```

**Agent tool integration:**
- Tool: `browser_task` in `packages/openai/src/tools/browserTools.ts`
- Sends OpenAI Responses API `{ type: "computer" }` task to CUA Worker
- Uses CF Access headers for tunnel authentication
- Polls worker task status via GET `/tasks/:id`
- Streams screenshots via GET `/tasks/:id/events` (SSE)

**Key files:**
- CUA Worker: `infra/cua-worker/src/{server.ts, responses-loop.ts, browser-session.ts}`
- Agent tool: `packages/openai/src/tools/browserTools.ts`
- UI: `apps/web/components/chat/{CuaModelToggle.tsx, BrowserSessionCard.tsx}`
- Env var: `CUA_WORKER_URL` (Vercel production)

**Models:** GPT-5.4 (full capabilities) and GPT-5.4-mini (faster, cost-optimized) selectable via `CuaModelToggle` component in chat header.

## What Agents Must NOT Do

- Do NOT modify Prisma migration files that have been applied to production
- Do NOT change production infrastructure without documenting in `docs/` per `ARCHIVE_POLICY.md`
- Do NOT modify `.env`, `.env.local`, or `.env.login` files
- Prefer feature branches for large changes, but pushing small fixes directly to `main` is acceptable
- Do NOT modify `packages/db/prisma/migrations/` without running `pnpm db:migrate:local` to verify
- Do NOT add new pnpm workspace packages without updating root `pnpm-workspace.yaml` / lockfile
- Do NOT remove or modify production observability instrumentation without review
- Do NOT bypass ESLint rules without documented justification
- Do NOT delete `legacy/python/` or `apps/worker/` without an explicit governance change (see `CLAUDE.md`)

## Key Scripts

```bash
pnpm dev                    # Start all services in dev mode
pnpm build                  # Build all packages + apps
pnpm lint                   # Lint all workspaces
pnpm typecheck              # TypeScript compiler checks
pnpm test                   # Run all tests
pnpm db:migrate:local       # Apply DB migrations locally
pnpm db:deploy              # Apply DB migrations to production
pnpm smoke:endpoints        # Smoke test production endpoints
pnpm observability:monitor:prod  # Monitor production observability
```
