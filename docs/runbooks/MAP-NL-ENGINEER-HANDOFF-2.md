# Map NL Intelligence — Engineer Handoff #2

**Date:** 2026-03-23 4:20 PM CDT
**Priority:** P0 — Chat is completely broken on production
**Branch:** `main` (latest commit `3c4b833`)

---

## What's been fixed (working in code, verified locally)

1. **Tool routing** — `query_property_db` removed from all tool arrays + tool policy filter now executes (was dead code behind a `clone()` gate). The agent MUST use `query_property_db_sql`.
2. **WebSocket disabled** — `WS_ENABLED = false` hardcoded in `ChatContainer.tsx` because CF Worker has stale tool schemas. Chat now uses REST `/api/chat` path.
3. **NL detection** — Map search bar guards debounce/suggest paths so NL queries don't leak to address search.
4. **Gateway SQL endpoint** — `/tools/parcels.sql` deployed and confirmed working (returns 11,936 C2 parcels).
5. **Deal lookup** — Made non-fatal in `agentRunner.ts` so missing deals don't crash chat.

## What's still broken

The REST `/api/chat` path requires Prisma (for conversation persistence, run tracking, auth context). Prisma uses a gateway adapter that routes queries over HTTPS. **The DB connection chain is broken.**

### The DB connection problem

There are TWO possible paths for Prisma on Vercel:

| Path | GATEWAY_DATABASE_URL | Route | Status |
|------|---------------------|-------|--------|
| **CF Worker** | `https://agents.gallagherpropco.com` | Vercel → CF Worker `/db` → Hyperdrive → CF Tunnel → App DB | **SSL error**: "Protocol Error: Origin database does not support SSL" |
| **FastAPI Gateway** | `https://api.gallagherpropco.com` | Vercel → CF Access → Gateway `/db` → asyncpg → App DB | **403 Forbidden**: CF Access blocks because service token may not match API gateway Access policy |

Currently set to CF Worker path (reverted to restore login). Both paths fail for different reasons.

### Root causes

1. **CF Worker path (Hyperdrive SSL)**: Hyperdrive config `ebd13ab7df60414d9ba8244299467e5e` connects through CF tunnel `db.gallagherpropco.com` to App DB. Hyperdrive tries SSL negotiation but fails even though Postgres has SSL on. Likely self-signed cert or tunnel-layer SSL conflict.

2. **FastAPI Gateway path (CF Access 403)**: The Prisma gateway adapter (`packages/db/src/gateway-adapter.ts`) now includes CF Access headers (`CF-Access-Client-Id`, `CF-Access-Client-Secret`). But the service token on Vercel may be configured for a different CF Access application than the one protecting `api.gallagherpropco.com`.

3. **Auth "Unauthorized" error**: The latest test returned "Error: Unauthorized" on `/api/chat`. This means `resolveAuth()` failed — either the session cookie is invalid, or the JWT verification failed. If NextAuth can't reach the DB to verify the session, it returns null.

## What needs to happen (in priority order)

### 1. Fix the Prisma DB connection (P0)

Pick ONE path and make it work:

**Option A: Fix the CF Worker/Hyperdrive path (recommended — it was working before)**
- Check the CF Worker's `/db` route at `agents.gallagherpropco.com`
- The Hyperdrive config: `ebd13ab7df60414d9ba8244299467e5e`
- Check if Hyperdrive has a `disable_ssl` or `sslmode` option
- Or check if the CF tunnel to `db.gallagherpropco.com` needs SSL passthrough configuration
- Test: `curl -X POST https://agents.gallagherpropco.com/db -H "Content-Type: application/json" -d '{"sql":"SELECT 1","params":[]}'` (needs auth headers)

**Option B: Fix the FastAPI Gateway path**
- Verify which CF Access application protects `api.gallagherpropco.com`
- Verify the service token (`CF_ACCESS_CLIENT_ID` on Vercel) is authorized for that application
- The gateway adapter now sends CF Access headers (commit `6dabd48`)
- The gateway has a `/db` route alias (commit `e1bb276`)
- Test: change `GATEWAY_DATABASE_URL` to `https://api.gallagherpropco.com` on Vercel and verify

**Option C: Make DB persistence optional (engineer's suggestion)**
- If Prisma fails, run the agent in ephemeral mode (no conversation persistence)
- This lets the agent answer questions even when the DB is down
- The agent's tool calls to the property DB go through a separate gateway path (`LOCAL_API_URL`) that IS working

### 2. Verify the auth chain (P0)

After fixing Prisma:
- Hard refresh gallagherpropco.com, sign in with Google
- Verify `/api/chat` returns a response (not 401)
- The `resolveAuth()` function uses `getToken()` from NextAuth which reads the JWT cookie — this should NOT need DB access
- But if the session was created when DB was broken, the cookie may be invalid

### 3. Test the NL query (P1)

Once auth + DB work:
```
How many parcels are zoned C2 in East Baton Rouge?
```

Expected: Agent calls `query_property_db_sql` → runs `SELECT zoning_type, COUNT(*) FROM ebr_parcels WHERE zoning_type = 'C2' GROUP BY zoning_type` → returns clean text "There are 11,936 parcels zoned C2"

If agent calls `query_property_db` instead: the tool doesn't exist in the coordinator's tool array — investigate `createConfiguredCoordinator()` in `packages/openai/src/agents/index.ts`.

### 4. Re-enable WebSocket (P2, after CF Worker tool schemas are updated)

When ready to re-enable WebSocket:
1. Regenerate `infra/cloudflare-agent/src/generated/tool-schemas.json` from current tool definitions (must NOT include `query_property_db`)
2. Deploy CF Worker with updated schemas
3. Change `WS_ENABLED` back to `Boolean(process.env.NEXT_PUBLIC_AGENT_WS_URL)` in `ChatContainer.tsx`
4. Re-add `NEXT_PUBLIC_AGENT_WS_URL` on Vercel

## Access credentials

### Hetzner Relay → Windows PC
```bash
ssh root@5.161.99.123
export SSHPASS='Nola0528!'
sshpass -e ssh -o ProxyCommand='cloudflared access ssh --hostname ssh.gallagherpropco.com' -o StrictHostKeyChecking=no cres_admin@ssh.gallagherpropco.com
```

### Gateway (Docker on Windows PC)
- Container: `fastapi-gateway` (healthy, restarted today)
- Internal: `http://localhost:8000`
- External: `https://api.gallagherpropco.com` (behind CF Access)
- Code mount: `C:\gpc-cres-backend\infra\local-api\main.py`
- DB endpoints: `/db` and `/db/query` (both work, same handler)
- Property DB: `/tools/parcels.sql` (confirmed working, 11,936 C2 parcels)

### App DB (Prisma target)
- Container: `entitlement-os-postgres`
- Internal: `postgresql://postgres:postgres@entitlement-db:5432/entitlement_os`
- SSL: ON (but Hyperdrive can't negotiate it)
- CF tunnel: `db.gallagherpropco.com`
- Hyperdrive: `ebd13ab7df60414d9ba8244299467e5e`

### Vercel env vars (current state)
```
GATEWAY_DATABASE_URL = https://agents.gallagherpropco.com  (CF Worker path)
DATABASE_URL = [Hyperdrive connection string]
LOCAL_API_URL = https://api.gallagherpropco.com
LOCAL_API_KEY = [gateway bearer token]
CF_ACCESS_CLIENT_ID = [service token ID]
CF_ACCESS_CLIENT_SECRET = [service token secret]
NEXT_PUBLIC_AGENT_WS_URL = [REMOVED — was agents.gallagherpropco.com]
```

### Cloudflare
- Dashboard: `dash.cloudflare.com` (Blake's account)
- Hyperdrive config: `ebd13ab7df60414d9ba8244299467e5e` (name: `entitlement-os-db`)
- Tunnel: `gallagherpropco` with ingress for api/ssh/tiles/db

## Key files changed today

| File | Change |
|------|--------|
| `packages/openai/src/tools/index.ts` | Removed `queryPropertyDb` from coordinatorTools, screenerTools, dueDiligenceTools |
| `packages/openai/src/tools/toolCatalog.ts` | Alias: `queryPropertyDb → query_property_db_sql` |
| `packages/openai/src/agents/coordinator.ts` | Updated routing rules to prefer SQL tool |
| `apps/web/lib/agent/executeAgent.ts` | Fixed tool policy filter (was dead code behind clone gate), added pre-filter diagnostic log |
| `apps/web/components/chat/ChatContainer.tsx` | `WS_ENABLED = false` hardcoded |
| `apps/web/lib/agent/agentRunner.ts` | Deal lookup non-fatal |
| `apps/web/app/map/page.tsx` | NL detection guards on debounce/suggest, result card stack |
| `packages/db/src/gateway-adapter.ts` | Added CF Access headers to gateway fetch |
| `infra/local-api/main.py` | Added `/db` route alias, deployed with `/tools/parcels.sql` |
| `infra/cloudflare-agent/src/generated/tool-schemas.json` | Removed `query_property_db` (not yet deployed to CF Worker) |
| `infra/cloudflare-agent/src/tool-router.ts` | Removed `query_property_db` routing |

## Summary

The NL intelligence feature (tool routing, SQL generation, result cards, NL detection) is code-complete and verified locally. The blocker is a **Prisma DB connection issue** that prevents the REST chat path from working on production. Fix the DB connection and everything else should fall into place.
