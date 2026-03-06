# Entitlement OS Monorepo

Last reviewed: 2026-02-19


Next.js + Temporal + Prisma + OpenAI agent runtime for entitlement workflows, chat orchestration, memory, and evidence-backed automation.

## Core capabilities

- Multi-agent chat runtime with SSE streaming
- Session-backed conversation memory with compaction + deduplication
- Tool approval flow (`/api/chat/tool-approval`)
- Serialized run checkpointing + resume (`/api/chat/resume`)
- Data Agent memory/retrieval pipeline and evidence capture

## Workspace layout

- `apps/web` — Next.js app (UI + API routes)
- `apps/worker` — Temporal worker
- `packages/db` — Prisma schema + migrations
- `packages/openai` — OpenAI runtime wrappers/utilities
- `packages/shared` — shared schemas/types
- `docs` — architecture/spec/roadmap docs

## Local setup

```bash
pnpm install
cp .env.example .env
pnpm dev
```

## Build and test

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Smoke verification

- `pnpm smoke:endpoints` — Proves every parcel/deal/geometry read is served through the Cloudflare-tunneled gateway Postgres path and separately confirms the semantic-only `recall_property_intelligence` Qdrant tool still returns hits.
- `pnpm smoke:gateway:edge-access` — Calls the FastAPI gateway directly with and without Cloudflare Access headers to prove every parcel/property endpoint (SQL, lookup, screening) is only reachable via the tunnel and that semantic `/tool/*` calls stay edge-protected.
- `bash scripts/verify-production-features.sh` — Full production harness that replays the five gateway features (cache, batch screening, push events, Qdrant property intelligence, error handling) to ensure local Postgres remains authoritative and Qdrant is only used for semantic recall.

## Production observability monitor

Run the production monitor to validate critical pages and APIs and persist a JSON+log report:

```bash
BASE_URL=https://gallagherpropco.com \
AUTH_BEARER=<nextauth-jwt> \
HEALTH_TOKEN=<health-token> \
pnpm observability:monitor:prod
```

Optional envs:
- `OBS_SESSION_COOKIE` — NextAuth session cookie if you want authenticated page checks (`/map`, `/deals`).
- `OBS_EMIT_TELEMETRY=false` — Skip the `/api/observability/events` ingest check.
- `OBS_ALLOW_PARTIAL=true` — Do not fail the run if auth/health tokens are missing.
- `OBS_OUTPUT_DIR=output/observability` — Override report output path.
- `OBS_SEARCH_ADDRESS="4416 HEATH DR"` — Override parcel/comps search address.

Reports are written to `output/observability/`.

## Security and tenant isolation baseline

- All API routes must authenticate session, verify org membership, and scope DB access by `org_id`.
- Property DB traffic **always** traverses the Cloudflare tunnel + FastAPI gateway; even Vercel serverless functions reach PostgreSQL through Hyperdrive + `GATEWAY_DATABASE_URL`. This is the only allowed path to Postgres in production.
- Route errors must follow generic client-safe responses (`400` validation, `401/403` auth, `500` internal) while logging server-side details only.
- Map popup/user-facing HTML content must sanitize user-sourced values before insertion.

### Authoritative data + semantic recall path

1. Vercel API routes proxy through Cloudflare Hyperdrive via `GATEWAY_DATABASE_URL` and `LOCAL_API_KEY`, which fans out to the Docker Compose PostgreSQL instance on the gateway host.
2. Gateway endpoints (parcel search, screening, deals, automation tools) enforce Cloudflare Access headers (`CF_ACCESS_CLIENT_ID/SECRET`) before touching Postgres.
3. Semantic/property-intelligence recall uses Qdrant collections only for fuzzy search and memory; exact records always come from Postgres.
4. Agents and tools must treat Qdrant as auxiliary — no writes land there without first persisting to Postgres.

## Required runtime envs (minimum)

- `DATABASE_URL` (local PostgreSQL for local dev)
- `OPENAI_API_KEY`
- `AUTH_SECRET` (NextAuth session signing)
- `LOCAL_API_URL` + `LOCAL_API_KEY` + `CF_ACCESS_CLIENT_ID` + `CF_ACCESS_CLIENT_SECRET` (gateway auth)
- `GATEWAY_DATABASE_URL` (Hyperdrive HTTPS endpoint for Prisma on Vercel)
- `QDRANT_URL` + optional `QDRANT_API_KEY` (semantic recall)

## Parcel geometry fallback contract

The map/parcel geometry pipeline uses this order:
1. Direct geometry lookup
2. Address-normalized lookup
3. RPC fallback (`rpc_get_parcel_geometry`)

## Chat runtime docs

- Runtime/API contracts: `docs/chat-runtime.md`
- Architecture specification: `docs/SPEC.md`
- Current implementation roadmap/status: `ROADMAP.md`
- Legacy Supabase Pro checklist (archived; not used in production): `docs/SUPABASE_PRO_CHECKLIST.md`
