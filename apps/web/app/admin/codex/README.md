# Codex Admin Chat Integration

This feature adds an admin-only Codex control surface at `/admin/codex`.
It opens a live WebSocket bridge to the external Codex App Server, manages
threads, streams agent output, renders command/file change approvals, and shows
diff/status updates in a two-panel layout.

## What it does
- Renders a realtime chat UI for Codex turns.
- Uses a server relay API in this feature package:
  - `apps/web/app/api/admin/codex/route.ts`
  - Client connects over SSE and sends JSON-RPC payloads over `POST` to the relay.
- Supports a Worker+Durable Object relay endpoint for production reliability:
  - Set `NEXT_PUBLIC_CODEX_RELAY_URL` to `wss://agents.gallagherpropco.com/codex`.
  - The worker receives browser WebSocket connections and relays them to upstream Codex via `CODEX_APP_SERVER_URL`.
  - Avoid `codex-controller.gallagherpropco.com` for this path because Cloudflare Access blocks direct unauthenticated websocket handshakes.
- Enforces admin-only access via `layout.tsx`:
  - Credentials session via NextAuth + email allowlist (`isEmailAllowed`).
- Supports thread controls:
  - Start thread with default start config.
  - Resume selected thread from sidebar.
  - Resume archived thread data via `thread/list`.
  - Archive thread.
- Supports run-time controls:
  - Cmd/Ctrl+Enter to send.
  - Cmd/Ctrl+N to start a new thread.
  - Escape to dismiss approval modal (decline).
- Streams and renders:
  - Agent deltas + streaming cursor.
  - `turn/plan/updated` as a checklist.
  - `turn/diff/updated` as a live diff panel.
  - Command execution + command output + exit code badges.
  - File change blocks with diff preview and expand/collapse.
- Supports approvals:
  - Command execution approval modal.
  - File-change approval modal with per-file unified diffs.
  - Actions: Approve, Approve All Session, Decline, Cancel.
- Handles error states:
  - Turn failure with friendly message including `codexErrorInfo` guidance.
  - Reconnection indicators and full-screen retry state for relay disconnects.
- Auto-reconnect with exponential backoff.
- Persists the active thread in `localStorage` and auto-resumes it on load.

## Environment variables
- `CODEX_APP_SERVER_URL`
  - Full WebSocket URL for the external App Server (for example `wss://codex.yourdomain.com`).
- `NEXT_PUBLIC_CODEX_RELAY_URL`
  - Route the browser uses to connect to the relay.
  - Local/dev: `/api/admin/codex` (SSE+POST relay).
  - Worker relay: `wss://agents.gallagherpropco.com/codex`.
  - `codex-controller.gallagherpropco.com` is intentionally not used for websocket handoff.
    If that host is still set in an environment by mistake, the UI falls back to
    `wss://agents.gallagherpropco.com/codex` on `*.gallagherpropco.com`.
  - If unset in production, the UI now defaults to `wss://agents.gallagherpropco.com/codex` for
    `*.gallagherpropco.com` hosts.
- `NEXT_PUBLIC_CODEX_RELAY_URL`
  - Optional explicit relay URL override. If omitted on `*.gallagherpropco.com`, defaults to `wss://agents.gallagherpropco.com/codex`.
  - If you pass `https://agents.gallagherpropco.com/codex`, it is automatically normalized to `wss://...` for websocket transport.
  - If you pass `wss://agents.gallagherpropco.com` (without path), it is normalized to `wss://agents.gallagherpropco.com/codex`.
  - `codex-controller.gallagherpropco.com` is intentionally not used and is redirected to the worker relay.
- `NEXT_PUBLIC_DISABLE_AUTH` (optional, local dev only)
  - Set to `true` to bypass auth checks entirely on `/admin/codex`.
  - Never enable this in production.

## Notes
- Route path for relay: `apps/web/app/api/admin/codex/route.ts` (mounted as
  `/api/admin/codex`).

## How to test locally
1. Start the app server via existing repo workflow.
2. Set env vars:
   - `CODEX_APP_SERVER_URL`.
   - For local mock testing, use:
     - `CODEX_APP_SERVER_URL=ws://127.0.0.1:8765`
     - `NEXT_PUBLIC_DISABLE_AUTH=true`
     - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54323/entitlementos`
    - Ensure you are signed in as an admin user.
3. Open `/admin/codex` in the browser.
4. Start a thread and send:
   - `What files are in the root of this repo?`
   - Confirm a listed response returns in the chat.
5. Send:
   - `Create a new file called test.txt with the content 'hello world'`
   - Confirm file-change approval modal appears before execution.
6. Start a turn that triggers more than one approval and confirm queue behavior.
7. Kill and restart the App Server; confirm UI shows reconnecting state and recovers.

## Auth triage runbook
Use this flow for `CredentialsSignin` or `/admin/codex` forbidden states:

1. Verify runtime env on deployed target:
   - `AUTH_SECRET`
   - `AUTH_TRUST_HOST=true`
   - `NEXTAUTH_URL=https://gallagherpropco.com` (or correct origin)
   - `DATABASE_URL` / `DIRECT_DATABASE_URL`
2. Verify user login row in Postgres:
   - User exists in `users`.
   - `password_hash` is present and valid bcrypt hash.
   - User has at least one `org_membership` row.
3. Verify allowlist gate:
  - User email is in `DEFAULT_ALLOWED_EMAILS` from `apps/web/lib/auth/allowedEmails.ts` (currently `isEmailAllowed`).
4. Inspect Vercel function logs for `[auth]` messages:
   - `missing email or password`
   - `email not allowed`
   - `user not found`
   - `invalid password`
   - `no org membership`
5. Emergency-only break-glass fallback (time-boxed):
   - Set `AUTH_ENABLE_CREDENTIALS_FALLBACK=true`.
   - Set `AUTH_CREDENTIALS_FALLBACK_PASSWORD=<temporary password>`.
   - Remove both vars immediately after DB hash is repaired.
