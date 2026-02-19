# Entitlement OS Monorepo

Last reviewed: 2026-02-19


Next.js + Temporal + Prisma/Supabase + OpenAI agent runtime for entitlement workflows, chat orchestration, memory, and evidence-backed automation.

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

## Chat runtime docs

- Runtime/API contracts: `docs/chat-runtime.md`
- Architecture specification: `docs/SPEC.md`
- Current implementation roadmap/status: `ROADMAP.md`
