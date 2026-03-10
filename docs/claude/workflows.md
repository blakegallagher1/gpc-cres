# Workflows

## Agent Tool Wiring Workflow

1. Define tool in `packages/openai/src/tools/<toolFile>.ts`
2. Export tool from `packages/openai/src/tools/index.ts`
3. Import tool into `packages/openai/src/agents/index.ts`
4. Add tool to agent-specific array (e.g., `coordinatorTools`, `financeTools`)
5. Wire tools in `createConfiguredCoordinator()` using `withTools(agent, toolArray)`

**Never** wire tools on module-level agent exports — they must be tool-free.

## Event Dispatch Pattern

1. Import handlers at route top: `import "@/lib/automation/handlers"`
2. Import dispatch function: `import { dispatchEvent } from "@/lib/automation/events"`
3. Read existing record state if dispatch depends on detecting a change
4. Perform DB mutation
5. Dispatch event with `.catch(() => {})`:
   ```typescript
   dispatchEvent({
     type: "parcel.created",
     payload: { parcelId, dealId, orgId }
   }).catch(() => {});
   ```
6. Return API response (never block on event dispatch)

**Reliability guarantees (2026-03-10):**
- **Idempotency:** Dispatch computes a key from `eventType:orgId:entityId`, deduped in-memory (10s) and durably via `automation_events.idempotency_key` unique index (`INSERT ... ON CONFLICT DO NOTHING`).
- **Handler timeout:** Each handler has 30s max via `Promise.race`. Timeout is classified as `TRANSIENT_UPSTREAM`.
- **Error taxonomy:** Failures are classified into 6 codes: `TRANSIENT_UPSTREAM`, `TRANSIENT_DB`, `PERMANENT_VALIDATION`, `PERMANENT_CONFIG`, `PERMANENT_NOT_FOUND`, `UNKNOWN`. Code + `retryable` flag stored in `automation_events.output_data`.
- **Throwing typed errors:** Use `new AutomationError(msg, code)` from `events.ts` for explicit classification. Untyped errors are classified by message pattern matching via `classifyError()`.

## Property DB Search Normalization

Before searching property DB, normalize addresses:

```typescript
const normalized = address
  .replace(/'/g, '')  // Strip apostrophes
  .replace(/\s+/g, ' ')  // Collapse whitespace
  .trim();
```

## Vercel Deploy Procedure

1. Delete `apps/web/.next/` to avoid FUNCTION_PAYLOAD_TOO_LARGE
2. Run `vercel --archive=tgz` (repo >15K files)
3. Restore `apps/web/.env.local` after `vercel link` (it overwrites the file)
4. Verify env vars in Vercel dashboard

## Cloudflare Worker Deploy Procedure

1. `cd infra/cloudflare-agent`
2. `npx wrangler deploy` (runs `predeploy` script to export tool schemas automatically)
3. Verify with `npx wrangler tail` — check for `[DO]` log lines
4. Secrets managed via `npx wrangler secret put <KEY>` (OPENAI_API_KEY, LOCAL_API_KEY, LOCAL_API_URL, VERCEL_URL; optionally CF_ACCESS_CLIENT_ID/CF_ACCESS_CLIENT_SECRET)

**Enabling WebSocket transport:** Set `NEXT_PUBLIC_AGENT_WS_URL=wss://agents.gallagherpropco.com` in Vercel env vars, then redeploy Vercel. The browser `ChatContainer.tsx` auto-detects this and uses WebSocket instead of SSE.

## Adding New Automation Handler

1. Create handler in `apps/web/lib/automation/<handlerName>.ts`
2. Export handler function matching signature: `(payload: EventPayload) => Promise<void>`
3. Register handler in `apps/web/lib/automation/handlers.ts`:
   ```typescript
   registerHandler("event.type", handlerFunction);
   ```
4. Write test suite in `apps/web/lib/automation/__tests__/<handlerName>.test.ts`
5. Dispatch event from relevant API routes
6. Update `docs/AUTOMATION-FRONTIER.md` with handler details

**Note:** New handlers automatically get idempotency protection (via the `dispatchEvent` durable key), 30s timeout, and error classification. No additional wiring needed.

## Stability Sentinel Operations

The sentinel runs every 10 minutes via Vercel Cron and monitors chat/map/workflow health.

**Vercel Cron route:** `/api/cron/stability-sentinel` — probes endpoints, queries `automation_events` via Prisma/Hyperdrive, evaluates thresholds, alerts on failure.

**CLI runner:** `scripts/observability/stability-sentinel.ts` — richer version with authenticated latency probes, used for ad-hoc runs and development.

**Key env vars (Vercel production):**
- `CRON_SECRET` — auth for cron invocation
- `SENTINEL_ALERT_WEBHOOK_URL` — self-hosted at `/api/admin/sentinel-alerts`
- `SENTINEL_PRODUCTION_MODE` — `true` (enforces workflow DB visibility)
- `LOCAL_API_KEY` — used as fallback auth token for CLI runner probes

**Threshold tuning:** All overridable via `SENTINEL_*` env vars. See `docs/runbooks/STABILITY_SENTINEL_RUNBOOK.md`.

**Alert query:** `GET /api/admin/sentinel-alerts` (auth: `CRON_SECRET`) returns last 24h of persisted sentinel alerts.
