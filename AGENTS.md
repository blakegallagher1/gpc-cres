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

## External Integrations

### chatgpt-apps (GIS / Zoning / Amenities)

Secure server-only integration with a Supabase PostGIS database for canonical GIS, zoning, and amenities data. Full docs: `docs/chatgpt-apps-integration.md`.

**Key files:**
- `apps/web/lib/server/chatgptAppsClient.ts` — server-only RPC client (two-header auth)
- `apps/web/lib/server/rateLimiter.ts` — in-memory token bucket rate limiter
- `apps/web/app/api/external/chatgpt-apps/` — 5 proxy API routes
- `scripts/smoke_chatgpt_apps_integration.ts` — 10-case smoke test (direct Supabase calls)

**Auth pattern:** Two headers required — `apikey` (anon key for Kong gateway) + `Authorization: Bearer` (external_reader JWT for PostgREST). The `external_reader` DB role can only EXECUTE 6 whitelisted RPCs; it has zero table access.

**Env vars (server-only, never `NEXT_PUBLIC_`):**
- `CHATGPT_APPS_SUPABASE_URL` — project REST API URL
- `CHATGPT_APPS_SUPABASE_ANON_KEY` — standard anon key (Kong passthrough)
- `CHATGPT_APPS_SUPABASE_EXT_JWT` — custom JWT for `external_reader` role

**6 RPCs:** `rpc_get_parcel_geometry`, `rpc_get_parcel_dimensions`, `rpc_zoning_lookup`, `rpc_zoning_lookup_by_point`, `rpc_get_amenities_cache`, `rpc_upsert_amenities_cache`

## Legacy Python

The previous Python system is parked under `legacy/python/` for reference only.
Do not delete it. Avoid touching it unless the user explicitly requests legacy fixes.

