# Apps/Web (Next.js 16)

Last reviewed: 2026-02-19


Web application and API surface for Entitlement OS.

## Key API routes

- `POST /api/chat` — start/continue an agent chat run (SSE stream)
- `POST /api/chat/tool-approval` — approve/reject a pending tool call
- `POST /api/chat/resume` — resume a run from serialized checkpoint state
- `GET /api/chat/conversations` — list org-scoped conversations
- `GET /api/chat/conversations/[id]` — fetch conversation with messages

## Chat runtime behavior (implemented)

- Session-backed memory via `PrismaChatSession` (`apps/web/lib/chat/session.ts`)
- Automatic compaction for long conversations
- Deduplication of repeated non-user context/tool messages
- Conversation persistence by `conversationId`
- Run checkpoint persistence via `runs.serialized_state`

## Environment variables

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_BACKEND_URL`

Optional runtime tuning:

- `AGENT_SESSION_COMPACTION_TOKEN_THRESHOLD` (default `6000`)
- `AGENT_SESSION_COMPACTION_KEEP_RECENT_MESSAGES` (default `24`)
- `AGENT_SESSION_DEDUPE_LOOKBACK` (default `200`)

## Local commands

```bash
pnpm -C apps/web dev
pnpm -C apps/web test
pnpm -C apps/web build
```

## Reference docs

- `docs/chat-runtime.md`
- `docs/SPEC.md`
- `ROADMAP.md`
