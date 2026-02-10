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
│   └── worker/              # Temporal worker (parked for v2)
├── packages/
│   ├── db/                  # Prisma schema, client, migrations, seed
│   ├── openai/              # 13 agents + 26 tools + retry/response utils
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
pnpm test                    # Test all packages (vitest)

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

**26 tools** across 8 files in `packages/openai/src/tools/`:
- Deal CRUD, task management, parcel updates
- Property DB: search 560K parcels, 7 screening endpoints (flood, soils, wetlands, EPA, traffic, LDEQ, full)
- Zoning matrix lookup (EBR UDC), parish pack lookup
- Evidence snapshot, hash comparison
- Triage scoring, hard filter checks
- Buyer management + outreach logging

## Data Model (Prisma — 18 models)

**Core:** Org → User → OrgMembership (multi-tenant)
**Deals:** Deal → Parcel, Task, Artifact, Upload
**Buyers:** Buyer → Outreach (per deal)
**Knowledge:** Jurisdiction → JurisdictionSeedSource, ParishPackVersion
**Evidence:** EvidenceSource → EvidenceSnapshot
**Runs:** Run (TRIAGE, ARTIFACT_GEN, etc.)
**Chat:** Conversation → Message

**Enums:** `sku_type` (SMALL_BAY_FLEX, OUTDOOR_STORAGE, TRUCK_PARKING), `deal_status` (11 stages INTAKE→EXITED/KILLED), `task_status`, `artifact_type`, `run_type`

**Two Supabase projects:**
- Entitlement OS DB (`yjddspdbxuseowxndrak`) — system of record, Prisma-managed
- Louisiana Property DB (`jueyosscalcljgdorrpy`) — 560K parcels, 5 parishes, 9 RPC functions (read-only via `LA_PROPERTY_DB_URL` + `LA_PROPERTY_DB_KEY`)

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
CRON_SECRET
```

## Automation Philosophy

See `docs/AUTOMATION-FRONTIER.md` for the full automation frontier map.

**Core principle:** Agents advise, humans decide at capital commitment points. The 11 deal statuses represent increasingly irreversible commitments. Automation is safe pre-triage (data-only, reversible). Post-triage, every stage transition requires human approval.

**12 automation loops** are defined (intake, enrichment, triage, task execution, stage advancement, document processing, change detection, parish pack refresh, artifact generation, buyer outreach, dead agent revival, ops). Each has observe/decide/act design + guardrails.

**3 dead agents** (Design, Tax, Market Intel) have zero tools wired — see frontier doc for what they need.

**2 cron jobs** wired and deployed:
- `change-detection` (daily 6 AM) — monitors jurisdiction seed sources for content changes, creates review tasks
- `parish-pack-refresh` (weekly Sunday 4 AM) — regenerates stale parish packs via OpenAI Responses API + web search, with evidence grounding and citation validation

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

### Don't Do This
- Don't delete `legacy/python/` or `apps/worker/` — parked for reference/v2
- Don't use Chat Completions API — use OpenAI Responses API
- Don't add Docker dependencies for v1 — deploy to Vercel, use Vercel Cron for background jobs
- Don't commit `.env.local` or any file with secrets
- Don't use `any` type — use `Record<string, unknown>` for dynamic objects

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
