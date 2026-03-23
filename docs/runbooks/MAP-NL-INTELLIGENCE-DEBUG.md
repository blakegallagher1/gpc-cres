# Map NL Intelligence — Debug & Iteration Runbook

**Date:** 2026-03-23
**Status:** Feature deployed but not working end-to-end. Needs debugging.
**Goal:** Get natural language queries working in the map search bar (e.g., "How many parcels are zoned C2?")

---

## What Was Built

Three-phase feature across these commits on `main`:

| Commit | What |
|--------|------|
| `9a28556` | Design doc |
| `2a10702` | Phase 1: `query_property_db_sql` tool upgrade, `compute_drive_time_area` isochrone tool, `MapResultCard` component, `__mapAction` pipeline, coordinator routing |
| `7c829b4` | Fix GeoJSON types for Vercel build |
| `e5019c8` | Phase 2: Smart search bar with NL detection + result card rendering |
| `145942e` | Phase 3: Structured card parsing (tables, stats grids) |
| `358e8db` | Fix: demote `query_property_db`, strengthen routing to `query_property_db_sql` |

## The Problem

When a user types "How many parcels are zoned C2 in East Baton Rouge?" in the map search bar or the /chat page:

1. The agent picks `query_property_db` (structured filter tool) instead of `query_property_db_sql` (SQL tool)
2. Even when it does pick the SQL tool, the gateway at `api.gallagherpropco.com` was returning 404 for `/tools/parcels.sql`

The gateway was redeployed with the updated `main.py` (confirmed via OpenAPI spec — `/tools/parcels.sql` now shows in the spec). But the feature still doesn't work end-to-end.

## Debug Checklist

### 1. Verify the gateway `/tools/parcels.sql` endpoint works

SSH into the Windows PC and test directly:

```bash
# From Mac → Hetzner relay → Windows PC
export SSHPASS='Nola0528!'
ssh root@5.161.99.123
sshpass -e ssh -o ProxyCommand='cloudflared access ssh --hostname ssh.gallagherpropco.com' -o StrictHostKeyChecking=no cres_admin@ssh.gallagherpropco.com
```

Once on Windows, test the gateway locally:
```powershell
# Get the gateway API key
type C:\gpc-cres-backend\.env | findstr GATEWAY_API_KEY

# Test the SQL endpoint
curl -X POST http://localhost:8000/tools/parcels.sql -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" -d "{\"sql\": \"SELECT zoning_type, COUNT(*) AS cnt FROM ebr_parcels WHERE zoning_type = 'C2' GROUP BY zoning_type\"}"
```

**Expected:** `{"ok": true, "rows": [{"zoning_type": "C2", "cnt": SOME_NUMBER}], "rowCount": 1}`

If you get 404: the gateway restart didn't pick up the new `main.py`. Check:
```powershell
# Verify main.py has the endpoint
findstr "parcels.sql" C:\gpc-cres-backend\infra\local-api\main.py
# Should show: @app.post("/tools/parcels.sql")

# Restart the container
docker restart fastapi-gateway
# Wait 5-10 seconds, then retry the curl
```

If you get 500/503: the database pool isn't connected. Check:
```powershell
docker logs fastapi-gateway --tail 50
```

### 2. Verify Vercel can reach the gateway through Cloudflare

The Vercel function calls the gateway via `LOCAL_API_URL` with CF Access headers. Check env vars:

```bash
npx vercel env ls | grep -E 'LOCAL_API|CF_ACCESS'
```

Required env vars on Vercel (production):
- `LOCAL_API_URL` = `https://api.gallagherpropco.com`
- `LOCAL_API_KEY` = gateway bearer token
- `CF_ACCESS_CLIENT_ID` = Cloudflare Access service token client ID
- `CF_ACCESS_CLIENT_SECRET` = Cloudflare Access service token client secret

If CF Access headers are missing, the gateway returns a Cloudflare 403 HTML page which the tool parses as a JSON error.

Test from Vercel runtime: add a temporary debug log in `packages/openai/src/tools/propertyDbTools.ts` in the `gatewayPost` function (line ~83):
```typescript
console.log(`[gatewayPost] ${path} status=${res.status} ok=${res.ok}`);
```
Then check Vercel function logs after making a query.

### 3. Verify the agent picks the RIGHT tool

The coordinator's system prompt (in `packages/openai/src/agents/coordinator.ts` ~line 291) has routing rules:

```
ROUTING RULES (FOLLOW STRICTLY):
1. If user asks "how many", "count", "total" → query_property_db_sql
7. DEFAULT: When in doubt, use query_property_db_sql
```

But the agent keeps picking `query_property_db`. This means either:
- The deployed Vercel code still has the OLD coordinator prompt (check Vercel deployment timestamp vs commit timestamp)
- The model is ignoring the routing rules (try making them even more explicit)

**To verify which code is deployed:** Check the Vercel deployment:
```bash
npx vercel ls | head -5
npx vercel inspect <deployment-url>
```
The deployment should be from commit `358e8db` or later.

**Nuclear option:** If the model keeps picking the wrong tool, remove `queryPropertyDb` from the coordinator tools list entirely in `packages/openai/src/tools/index.ts` (line ~423). It's a strictly worse version of `queryPropertyDbSql`.

### 4. Verify the NL detection on the map page

The map search bar at `/map` has NL detection in `apps/web/app/map/page.tsx`. When you type "How many parcels are zoned C2?" it should:
1. Match NL pattern `^(how many|...)`
2. Call `handleNlQuery()` which POSTs to `/api/chat`
3. Parse SSE response and show a MapResultCard

If instead you see "No parcels found for that search" — the NL detection failed and it went through the normal address search path. Open browser DevTools console and check:
- Is there a POST to `/api/chat`? (NL path)
- Or a GET to `/api/parcels/suggest`? (address path)

If it's going to the address path, the `isNaturalLanguageQuery()` function (same file, ~line 305) didn't match. The patterns should match "how many" at start of string. Debug by adding a console.log:
```typescript
console.log('[NL detect]', q, nlPatterns.some((p) => p.test(q)));
```

### 5. Verify SSE stream parsing

If the `/api/chat` call succeeds but no card appears, the SSE parsing may be failing. In browser DevTools Network tab, find the `/api/chat` request, look at the EventStream tab. You should see events like:
```
data: {"type":"status","status":"planning","message":"Analyzing map context..."}
data: {"type":"tool_start","name":"query_property_db_sql",...}
data: {"type":"tool_result","result":"{\"rowCount\":1,\"rows\":[...]}"}
data: {"type":"text_delta","delta":"There are..."}
data: {"type":"done","conversationId":"...","status":"success"}
```

If you see `tool_result` events with SQL rows, but no card renders, the card parsing logic in `handleNlQuery` (same file) isn't extracting the rows. The tool_result event format may differ from what the parser expects.

---

## Access Credentials

### Hetzner Relay (SSH jump host)
- **Host:** `5.161.99.123` (root@)
- **SSH key:** Your Mac's default SSH key should work

### Windows PC (via relay)
- **Hostname:** `ssh.gallagherpropco.com` (through Cloudflare Tunnel)
- **User:** `cres_admin`
- **Password:** `Nola0528!`
- **Connection:** `sshpass -e ssh -o ProxyCommand='cloudflared access ssh --hostname ssh.gallagherpropco.com' -o StrictHostKeyChecking=no cres_admin@ssh.gallagherpropco.com`
- **Note:** Must go through the Hetzner relay first (`ssh root@5.161.99.123`)

### Gateway (Docker on Windows PC)
- **Container:** `fastapi-gateway`
- **Internal URL:** `http://localhost:8000`
- **External URL:** `https://api.gallagherpropco.com` (behind CF Access)
- **Code mount:** `C:\gpc-cres-backend\infra\local-api\main.py` → `/app/main.py`
- **API key env var:** `GATEWAY_API_KEY` in `C:\gpc-cres-backend\.env`
- **Restart:** `docker restart fastapi-gateway`
- **Logs:** `docker logs fastapi-gateway --tail 100`

### Vercel
- **Project:** `gallagher-cres` in `blakes-projects-54064dd5`
- **Production URL:** `gallagherpropco.com`
- **CLI:** `npx vercel` (authenticated)
- **Env vars:** `npx vercel env ls`
- **Logs:** `npx vercel logs <deployment-url>`
- **Deploy:** Auto-deploys from `main` branch pushes

### Cloudflare
- **Dashboard:** `dash.cloudflare.com` (Blake's account)
- **Tunnel:** `gallagherpropco` tunnel with ingress rules:
  - `api.gallagherpropco.com` → `http://localhost:8000` (gateway)
  - `ssh.gallagherpropco.com` → `ssh://localhost:22` (Windows SSH)
  - `tiles.gallagherpropco.com` → `http://localhost:3000` (Martin)
- **Access:** Service token needed for Vercel → gateway communication

### Property Database
- **Container:** `local-postgis` on Windows PC (Docker network 172.18.x)
- **Tables:** `ebr_parcels` (198K rows, has `zoning_type` column — 96.9% populated), `fema_flood`, `soils`, `wetlands`, `epa_facilities`
- **Direct access:** `docker exec -it local-postgis psql -U postgres -d cres_db`

---

## Key Files

| File | Purpose |
|------|---------|
| `packages/openai/src/tools/propertyDbTools.ts` | All property DB tools including `queryPropertyDbSql` (line ~601) |
| `packages/openai/src/tools/spatialTools.ts` | Isochrone/drive-time tool |
| `packages/openai/src/tools/index.ts` | Tool registration — coordinator tools list (line ~367) |
| `packages/openai/src/agents/coordinator.ts` | Coordinator system prompt with routing rules (line ~291) |
| `apps/web/app/map/page.tsx` | Map page — NL detection, `handleNlQuery`, result cards |
| `apps/web/app/api/chat/route.ts` | Chat API route — SSE streaming, parcel context building |
| `apps/web/components/maps/MapResultCard.tsx` | Summary card component |
| `apps/web/lib/agent/executeAgent.ts` | Map action emission from tool results |
| `apps/web/lib/chat/toolResultWrapper.ts` | `__mapFeatures` and `__mapAction` parsing |
| `infra/local-api/main.py` | Gateway code (deployed to Windows PC Docker) |

---

## Test Prompts

Once fixed, verify with these queries in the map search bar:

1. **Aggregate:** "How many parcels are zoned C2 in East Baton Rouge?"
   → Agent should call `query_property_db_sql` with `SELECT zoning_type, COUNT(*) ...`
   → Stats card should appear on map

2. **Address lookup:** "Tell me about 222 St Louis St in Baton Rouge"
   → Agent should call `search_parcels` → `screen_full`
   → Detail card, fly-to, highlight

3. **Filter search:** "Find 10 parcels at least 5 acres zoned M1 or M2"
   → Agent should call `query_property_db_sql` with WHERE clause
   → List card with table

4. **Normal address (should NOT trigger NL):** "7618 Copperfield Ct"
   → Should go through normal suggest dropdown, NOT the agent

---

## Architecture Diagram

```
User types in map search bar
    │
    ├─ isNaturalLanguageQuery() = true?
    │   │
    │   ▼
    │  handleNlQuery()
    │   │
    │   ▼
    │  POST /api/chat { message, mapContext }
    │   │
    │   ▼
    │  Chat route → buildParcelContext → runAgentWorkflow
    │   │
    │   ▼
    │  Agent Coordinator (OpenAI Responses API)
    │   │
    │   ├─► query_property_db_sql → gatewayPost("/tools/parcels.sql")
    │   │     │
    │   │     ▼
    │   │   Gateway (api.gallagherpropco.com) → PostgreSQL (cres_db)
    │   │     │
    │   │     ▼
    │   │   Returns {ok, rows, rowCount}
    │   │
    │   ├─► Tool result has __mapFeatures → emit map_action SSE events
    │   │
    │   └─► Agent synthesizes text response
    │         │
    │         ▼
    │       SSE stream back to browser
    │         │
    │         ▼
    │       handleNlQuery parses events:
    │         - map_action → mapDispatch (highlight, flyTo, addLayer)
    │         - tool_result → extract rows for card
    │         - text → narrative for card
    │         │
    │         ▼
    │       MapResultCard rendered on map
    │
    └─ isNaturalLanguageQuery() = false?
        │
        ▼
       Normal address suggest flow (unchanged)
```
