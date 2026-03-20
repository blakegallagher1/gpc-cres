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
│ apps/worker (@entitlement-os/worker)                         │
│ Temporal worker — parked for v2; not built in default CI    │
├─────────────────────────────────────────────────────────────┤
│ infra/local-api/main.py + admin_router.py                   │
│ FastAPI gateway (parcel, tools, screening, tiles proxy)       │
├─────────────────────────────────────────────────────────────┤
│ legacy/python/                                               │
│ Frozen reference (original Python agents) — do not delete   │
├─────────────────────────────────────────────────────────────┤
│ External: OpenAI · county/GIS sources · Martin tiles · Qdrant│
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Frontend**: Next.js, React, TailwindCSS, TypeScript
- **App & API routes**: Next.js (Vercel)
- **Database**: PostgreSQL with Prisma ORM (migrations in `packages/db/prisma/migrations`)
- **Gateway**: FastAPI + asyncpg (`infra/local-api/`), documented in `docs/claude/backend.md`
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

## What Agents Must NOT Do

- Do NOT modify Prisma migration files that have been applied to production
- Do NOT change production infrastructure without documenting in `docs/` per `ARCHIVE_POLICY.md`
- Do NOT modify `.env`, `.env.local`, or `.env.login` files
- Do NOT push to `main` directly — always use feature branches
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
