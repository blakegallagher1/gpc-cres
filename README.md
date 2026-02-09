# Entitlement OS (Baton Rouge Entitlement-Flip OS) v1.0

Entitlement OS is an internal, automation-first operating system for running a repeatable entitlement-flip business in the Baton Rouge region.

Core design goals:
- speed-to-approval
- certainty-to-exit
- auditability (proof of every zoning/process claim, with evidence snapshots)

Authoritative spec:
- `docs/SPEC.md`

## Monorepo Layout

- `apps/web` - Next.js (TypeScript) App Router (UI + API routes)
- `apps/worker` - Temporal worker service (Node/TypeScript)
- `packages/db` - Prisma schema/migrations/seed + Prisma client
- `packages/shared` - Zod schemas + validators (citation enforcement)
- `packages/openai` - OpenAI Responses API wrapper (strict JSON Schema outputs)
- `packages/evidence` - evidence snapshot + hashing + extraction utilities
- `packages/artifacts` - PPTX/PDF generation (PptxGenJS + Playwright)
- `infra/docker` - local dev infra (Postgres + Temporal dev server + UI)
- `legacy/python` - preserved legacy Python system (deprecated)

## Prereqs

- Node.js 22 (see `.node-version`)
- pnpm 9+
- Docker Desktop

## Local Development

1) Start local infra (Postgres + Temporal dev server + Temporal UI)

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

Temporal UI is available at `http://localhost:8080`.

2) Configure environment variables

```bash
cp .env.example .env
```

Fill in:
- `DATABASE_URL` / `DIRECT_DATABASE_URL` (local Postgres or Supabase)
- Supabase project keys + URLs (Auth + Storage)
- `OPENAI_API_KEY`
- Temporal connection settings

3) Install deps

```bash
pnpm install
```

4) Run migrations + seed

```bash
pnpm db:migrate
pnpm db:seed
```

5) Run web + worker

```bash
pnpm dev
```

Default local ports:
- Web: `http://localhost:3000`
- Temporal UI: `http://localhost:8080`

## Production Deployment Notes (v1 defaults)

- Web (`apps/web`): deploy on a Node runtime (Vercel is fine; do not force Edge-only).
- Worker (`apps/worker`): deploy as a long-running container (Render/Fly/ECS). Use a Playwright-compatible base image.
- Temporal: Temporal Cloud recommended for production.
- Supabase: dedicated Supabase project for Auth + Storage (private buckets `artifacts`, `evidence`, `uploads`).

Secrets:
- OpenAI API key and Supabase service role key must never be exposed to the browser.

