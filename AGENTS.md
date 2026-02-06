# Entitlement OS Repository Guidelines

This repo is **Entitlement OS v1.0**: an internal, automation-first operating system for a repeatable entitlement-flip business in the Baton Rouge region.

The authoritative product/architecture spec lives at:
- `docs/SPEC.md`

## Project Structure

This is a **pnpm workspaces** monorepo:

- `apps/web/` - Next.js (TypeScript) App Router (UI + API route handlers)
- `apps/worker/` - Temporal Worker service (Node/TypeScript), long-running
- `packages/db/` - Prisma schema, migrations, seed, Prisma client singleton
- `packages/shared/` - Zod schemas, types/enums, validators (citations enforcement)
- `packages/openai/` - OpenAI Responses API wrapper (strict JSON Schema outputs)
- `packages/evidence/` - evidence fetch/snapshot/hash/extract utilities
- `packages/artifacts/` - PPTX/PDF generators (PptxGenJS + Playwright print)
- `infra/docker/` - local dev docker compose (Postgres + Temporal dev server + Temporal UI)
- `legacy/python/` - deprecated Python system, preserved for reference (do not modify unless asked)

## Build, Test, Dev Commands

Run commands from the repo root:

- `pnpm install`
- `pnpm dev` (runs `apps/web` + `apps/worker` in parallel)
- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

Database (Prisma, no manual SQL changes):

- `pnpm db:migrate` (development migrations)
- `pnpm db:deploy` (production migration deploy)
- `pnpm db:seed`

Local infra (Docker):

- `docker compose -f infra/docker/docker-compose.yml up -d`
- Temporal UI: `http://localhost:8080`

If `pnpm` is not available, install pnpm 9+ (repo is pinned in root `package.json`).

## Coding Standards

- TypeScript everywhere in `apps/*` and `packages/*`.
- Prefer explicit types on exported functions.
- Keep JSON schemas as **Zod** in `packages/shared` and derive JSON Schema for OpenAI Structured Outputs.
- Enforce **citation completeness** server-side; do not accept AI output that fails validators.
- No secrets in git. Use `.env` populated from `.env.example`.

## Security Rules (Non-Negotiable)

- All DB rows are scoped by `org_id`.
- Every API route must:
  1) authenticate Supabase session
  2) confirm org membership
  3) scope all queries by `org_id`
- Supabase Storage buckets are private; access is via **signed URLs** only.
- OpenAI API key and Supabase service role key must only be used server-side (web route handlers / worker).

## Testing

- Unit tests live alongside packages (Vitest).
- Integration tests are separate and must not run by default unless explicitly invoked (see package scripts).
- Required coverage areas:
  - schema validation + citation enforcement
  - evidence hashing + deterministic key generation
  - artifact idempotency via `runs.input_hash`
  - change detection triggers refresh

## Legacy Python

The previous Python system is parked under `legacy/python/` for reference only.
Do not delete it. Avoid touching it unless the user explicitly requests legacy fixes.

