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

## Security and tenant isolation baseline

- All API routes must authenticate session, verify org membership, and scope DB access by `org_id`.
- Property DB uses local PostgreSQL (Docker Compose) with Prisma ORM.
- Route errors must follow generic client-safe responses (`400` validation, `401/403` auth, `500` internal) while logging server-side details only.
- Map popup/user-facing HTML content must sanitize user-sourced values before insertion.

## Required runtime envs (minimum)

- `DATABASE_URL` (local PostgreSQL)
- `OPENAI_API_KEY`
- `AUTH_SECRET` (NextAuth session signing)
- `LOCAL_API_URL` + `LOCAL_API_KEY` (gateway for storage/parcel data)

## Parcel geometry fallback contract

The map/parcel geometry pipeline uses this order:
1. Direct geometry lookup
2. Address-normalized lookup
3. RPC fallback (`rpc_get_parcel_geometry`)

## Chat runtime docs

- Runtime/API contracts: `docs/chat-runtime.md`
- Architecture specification: `docs/SPEC.md`
- Current implementation roadmap/status: `ROADMAP.md`
- Legacy Supabase Pro checklist (archived): `docs/SUPABASE_PRO_CHECKLIST.md`
