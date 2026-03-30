---
name: server-ops
description: Use when diagnosing, deploying, restarting, or recovering Gallagher backend infrastructure on the Windows 11 server (Docker, FastAPI gateway, database, tiles, tunnel, CUA worker, and auth routes). Use for production health checks, log triage, and command sequences that require tunnel or admin-API access.
---

# Server Operations Skill — Windows PC Infrastructure

## Architecture Overview

A 12-core i7 Windows 11 PC runs **one Docker Compose stack** with all backend services. **Dual-path networking:** Tailscale mesh (primary) + Cloudflare Tunnel (fallback/public).

```
DUAL-PATH ARCHITECTURE:

Public Traffic (Cloudflare — CDN, DDoS, edge caching):
  Internet → Cloudflare Tunnel (9f7fb0d6) → Docker Compose Stack

Operator/Agent Traffic (Tailscale — direct WireGuard, 5ms):
  Mac/Codex VM → WireGuard P2P → Windows PC (100.67.140.126)
  Direct: SSH, Docker, Postgres, Admin API, all services

Docker Compose Stack:
  ├── gateway (FastAPI :8000)
  ├── martin (Tile server :3000)
  ├── entitlement-os-postgres (PostgreSQL :54323→5432)
  ├── qdrant (Vector DB :6333)
  ├── cua-worker (Browser automation :3001)
  ├── cloudflared (Tunnel agent)
  └── codex-server (WebSocket :8765)
```

**Self-healing:** Windows watchdog (`GPC-Watchdog` Scheduled Task) runs every 60s. Auto-restarts sshd, Tailscale, Docker Desktop, and all containers. Logs: `C:\gpc-cres-backend\logs\watchdog.log`. Heartbeat: `C:\gpc-cres-backend\logs\heartbeat.txt`.

**Preflight check:** Run `scripts/server-preflight.sh` before any server work session.

## Connection Methods (in order of preference)

### 0. Tailscale Direct (FASTEST — 5ms peer-to-peer WireGuard)

All services are directly accessible via the Windows PC's Tailscale IP (`100.67.140.126`).

| Service | Tailscale URL | Cloudflare Fallback |
|---------|--------------|-------------------|
| Admin API | `http://100.67.140.126:8000/admin` | `https://api.gallagherpropco.com/admin` |
| Gateway API | `http://100.67.140.126:8000` | `https://api.gallagherpropco.com` |
| SSH | `ssh bg` (alias for `cres_admin@100.67.140.126`) | `ssh bg-cf` |
| PostgreSQL | `psql -h 100.67.140.126 -p 54323` | `cloudflared access tcp ...` |
| Tiles | `http://100.67.140.126:3000` | `https://tiles.gallagherpropco.com` |
| CUA Worker | `http://100.67.140.126:3001` | `https://cua.gallagherpropco.com` |
| Qdrant | `http://100.67.140.126:6333` | `https://qdrant.gallagherpropco.com` |

### 1. Admin API (PREFERRED when Tailscale is down)
```bash
# Base URL
ADMIN_URL="https://api.gallagherpropco.com/admin"
AUTH="Authorization: Bearer $ADMIN_API_KEY"  # Set in ~/.zshrc

# Health check
curl -s -H "$AUTH" "$ADMIN_URL/health" | jq

# List containers with status
curl -s -H "$AUTH" "$ADMIN_URL/containers" | jq '.[] | {name, status, state}'

# Restart a container
curl -s -X POST -H "$AUTH" "$ADMIN_URL/containers/gpc-cua-worker/restart" | jq

# View container logs (last 100 lines)
curl -s -H "$AUTH" "$ADMIN_URL/containers/gateway/logs?tail=100"

# Run a SELECT query on the database
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  "$ADMIN_URL/db/query" -d '{"query": "SELECT count(*) FROM ebr_parcels"}' | jq

# Check database tables
curl -s -H "$AUTH" "$ADMIN_URL/db/tables" | jq
```

### 2. Gateway API (for property data operations)
```bash
GW_URL="https://api.gallagherpropco.com"
GW_AUTH="Authorization: Bearer $LOCAL_API_KEY"

# Health
curl -s -H "$GW_AUTH" "$GW_URL/health" | jq

# Search parcels
curl -s -H "$GW_AUTH" "$GW_URL/tools/parcel.lookup?address=1234+Main+St" | jq

# Bbox parcel search (map viewport)
curl -s -H "$GW_AUTH" "$GW_URL/tools/parcel.bbox?west=-91.2&south=30.4&east=-91.1&north=30.5&limit=100" | jq

# Run SQL (SELECT only, table allowlist enforced)
curl -s -X POST -H "$GW_AUTH" -H "Content-Type: application/json" \
  "$GW_URL/tools/parcels.sql" -d '{"sql": "SELECT id, address FROM ebr_parcels LIMIT 5"}' | jq

# Screening endpoints
curl -s -H "$GW_AUTH" "$GW_URL/api/screening/flood?parcel_id=XXXXX" | jq
```

### 3. SSH (last resort — flaky over tunnel)
```bash
ssh cres_admin@ssh.gallagherpropco.com

# CRITICAL: Add 8-45 second delays between commands
# "websocket: bad handshake" = sshd stopped on Windows → need physical access or Codex recovery

# Docker commands once connected
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker logs gateway --tail 50
docker restart gateway
docker exec -it entitlement-os-postgres psql -U postgres -d entitlement_os
```

### 4. CF Database Tunnel (Prisma/App DB only)
```bash
# Start tunnel (connects to App DB — NO property tables here)
cloudflared access tcp --hostname db.gallagherpropco.com --url localhost:54399

# Then connect
psql "postgresql://postgres:PASSWORD@localhost:54399/entitlement_os"
```

## Database Topology

**SINGLE PostgreSQL container** (`entitlement-os-postgres`) with ONE database (`entitlement_os`):

| Schema/Table | Records | Purpose |
|-------------|---------|---------|
| `ebr_parcels` | ~560K | Multi-parish parcels (EBR, Ascension, Livingston, West BR, Iberville) |
| `fema_flood` | ~5.2K | FEMA flood zone polygons |
| `soils` | ~37K | Soil survey data |
| `wetlands` | ~39K | NWI wetland polygons |
| `epa_facilities` | ~6.7K | EPA facility locations |
| Prisma tables | varies | `deals`, `conversations`, `messages`, `parcels`, `automation_events`, etc. |

**Key geometry columns:**
- `ebr_parcels.centroid` — Point geometry (used by Martin for tiles)
- `ebr_parcels.geom` — Polygon geometry (used for geometry lookups)
- Screening tables use `geom` columns with PostGIS spatial functions

## Docker Compose Services

### Container Names vs Service Names
| Service Name | Container Name | Port |
|-------------|---------------|------|
| gateway | gateway | 8000 |
| martin | martin | 3000 |
| db / postgres | entitlement-os-postgres | 5432 |
| qdrant | qdrant | 6333 |
| cua-worker | gpc-cua-worker | 3001 |
| cloudflared | cloudflared | — |

### Docker Quirks on Windows
1. **`docker restart` doesn't re-read bind mounts** — use `docker stop X && docker start X` or `docker compose up --force-recreate X`
2. **Linux containers** use `/var/run/docker.sock`, NOT `//./pipe/docker_engine` (Windows named pipe)
3. **`docker-credential-desktop.exe`** fails with "A specified logon session does not exist" during SSH builds — temporarily rename to `.bak`, build, then restore
4. **SCP to Windows** mangles nested quotes — use simpler command structures
5. **Bind mount paths** use `/c/path/to/dir` format (not `C:\`)

## Cloudflare Tunnel Routing

**Tunnel ID:** `9f7fb0d6-ecb1-4b98-b523-9a60013187b7`

| Hostname | Internal Service | Auth | Notes |
|----------|-----------------|------|-------|
| `api.gallagherpropco.com` | `http://gateway:8000` | Bearer token | FastAPI gateway |
| `tiles.gallagherpropco.com` | `http://martin:3000` | None | MVT tiles, CORS enabled |
| `cua.gallagherpropco.com` | `http://gateway:8000` | Bearer + CF Access | Gateway proxies to cua-worker:3001 via Host header detection |
| `db.gallagherpropco.com` | `tcp://entitlement-os-postgres:5432` | CF Access service token | App DB only |
| `ssh.gallagherpropco.com` | `ssh://host.docker.internal:22` | CF Access email auth | Flaky |
| `qdrant.gallagherpropco.com` | `http://qdrant:6333` | CF Access | Vector DB |

**CUA routing detail:** The `cua.` hostname routes to `gateway:8000` with `httpHostHeader: "cua.gallagherpropco.com"`. The gateway middleware detects `"cua."` in the Host header and reverse-proxies to `cua-worker:3001`.

### Modifying Tunnel Config via API
```bash
# Get current config
curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel/9f7fb0d6-ecb1-4b98-b523-9a60013187b7/configurations" \
  -H "Authorization: Bearer $CF_API_TOKEN" | jq

# Update config (increment version number!)
curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel/9f7fb0d6-ecb1-4b98-b523-9a60013187b7/configurations" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"config": {"ingress": [...], "version": N+1}}'
```

## Common Failure Modes & Recovery

### 1. Gateway Returns 502/503
**Diagnosis:**
```bash
# Check gateway container
curl -s -H "$AUTH" "$ADMIN_URL/containers" | jq '.[] | select(.name=="gateway") | .status'
# Check gateway logs
curl -s -H "$AUTH" "$ADMIN_URL/containers/gateway/logs?tail=50"
```
**Fix:** Restart gateway: `curl -s -X POST -H "$AUTH" "$ADMIN_URL/containers/gateway/restart"`

### 2. Tiles Return 204 (Empty) for Valid Coordinates
**Diagnosis:** Martin is healthy but returning empty tiles.
```bash
# Test specific tile (Baton Rouge at zoom 13)
curl -s -o /dev/null -w "%{http_code} %{size_download}" \
  "https://tiles.gallagherpropco.com/ebr_parcels/13/2020/3367"
# Should return: 200 60000+ (not 204 0)

# Check Martin catalog
curl -s "https://tiles.gallagherpropco.com/catalog" | jq '.tiles | keys'
```
**Fix:** Martin can't find geometry data → check `ebr_parcels.centroid` column exists, restart Martin container.

### 3. Map Shows No Parcels (Frontend)
**Diagnosis tree:**
1. Check zoom level — parcel tiles have `minzoom: 10`, won't load below that
2. Check tile server: `curl -s "https://tiles.gallagherpropco.com/health"` → should return "OK"
3. Test correct tile coords for Baton Rouge:
   - z13: `/ebr_parcels/13/2020/3367` (should be 200, ~60KB)
   - z12: `/ebr_parcels/12/1010/1683` (should be 200, ~3.7MB)
4. If tiles 200 but map empty → MapLibre source stuck (see below)

**MapLibre stuck source fix:** If map initializes below minzoom, the vector source gets stuck. The component has a `zoomend` handler that auto-detects and force-reloads via `setTiles()`. If still broken, hard-refresh the page.

### 4. SSH "websocket: bad handshake"
**Cause:** sshd service is stopped on Windows PC.
**Fix options:**
- Physical access: Start OpenSSH from Windows Services
- Codex recovery: Use Codex WebSocket relay to restart sshd
- Scheduled Task: Windows has a recovery task that restarts sshd

### 5. CUA Worker Task Fails
**Diagnosis:**
```bash
# Check worker health
curl -s -H "$GW_AUTH" "https://cua.gallagherpropco.com/health"

# Check a task status
curl -s -H "$GW_AUTH" "https://cua.gallagherpropco.com/tasks/{taskId}"

# Check worker logs
curl -s -H "$AUTH" "$ADMIN_URL/containers/gpc-cua-worker/logs?tail=50"
```
**Common issues:**
- 404 on /tasks → CUA worker not running, restart it
- Task stuck "running" → Playwright timeout, check Chromium memory (shm_size must be 1g+)
- 400 "Unsupported parameter" → API format mismatch (must use Responses API `input`, NOT `messages`)

### 6. Database Connection Failures
**Diagnosis:**
```bash
# Check DB container
curl -s -H "$AUTH" "$ADMIN_URL/containers" | jq '.[] | select(.name | contains("postgres"))'

# Test DB connectivity through gateway
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  "$ADMIN_URL/db/query" -d '{"query": "SELECT 1 as ok"}'
```
**Fix:** Restart postgres: `curl -s -X POST -H "$AUTH" "$ADMIN_URL/containers/entitlement-os-postgres/restart"`

### 7. Cloudflare Tunnel Disconnected
**Diagnosis:** All `.gallagherpropco.com` subdomains timeout.
```bash
# Check tunnel status in CF dashboard
curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel/9f7fb0d6-ecb1-4b98-b523-9a60013187b7" \
  -H "Authorization: Bearer $CF_API_TOKEN" | jq '.result.status'
```
**Fix:** Restart cloudflared container (requires SSH or physical access). If Docker Compose is down, needs physical access to Windows PC.

### 8. Vercel Can't Reach Database (GATEWAY_DATABASE_URL)
**Cause:** Prisma on Vercel uses `GATEWAY_DATABASE_URL` + `LOCAL_API_KEY` to route queries through the FastAPI gateway's `/db` endpoint. If either env var is missing, Prisma falls back to direct TCP which Vercel can't reach.
**Fix:** Ensure both `GATEWAY_DATABASE_URL=https://api.gallagherpropco.com` and `LOCAL_API_KEY` are set in Vercel environment variables (Production + Preview).

### 9. Google OAuth Returns auth_unavailable
**Symptom:** User clicks "Continue with Google" → Google account selection succeeds → redirected back to `/login?error=auth_unavailable`. The `/api/auth/callback/google` endpoint takes 7-14 seconds before redirecting.

**Root cause (most likely):** The NextAuth callback does DB provisioning (user lookup/create, org membership) via Prisma, which routes through the gateway `/db` endpoint. A 7+ second callback = Prisma gateway retries exhausted = the /db endpoint is unreachable from Vercel.

**Diagnosis (Tailscale-first):**
```bash
# 1. Is gateway alive?
curl -sf http://100.67.140.126:8000/health

# 2. Does /db work with the deployed bearer token?
curl -s -X POST -H "Authorization: Bearer $LOCAL_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{"sql":"SELECT 1 as ok","args":[]}' \
  https://gateway.gallagherpropco.com/db

# 3. Check gateway logs for /db errors
ssh bg 'docker logs gateway --tail 50 2>&1 | grep -i "/db\|error\|auth"'

# 4. Direct DB check
psql -h 100.67.140.126 -p 54323 -U postgres -d entitlement_os \
  -c "SELECT id, email FROM users LIMIT 3"

# 5. Run the automated auth smoke test
scripts/verify-auth.sh
```

**Fix paths:**
- If /db returns 401 → bearer token mismatch. Check Vercel env vars: `LOCAL_API_KEY` should match the first entry in the gateway's `API_KEYS`.
- If /db times out → gateway can't reach Postgres. `ssh bg 'docker ps'` to check container health.
- If direct psql works but /db doesn't → gateway's DB pool is exhausted or misconfigured. Restart gateway: `ssh bg 'docker restart gateway'`
- If all infra checks pass → it's a code bug in the signIn callback. Check `apps/web/app/api/auth/[...nextauth]/route.ts`.

## Deploying Code to the Server

### Gateway (FastAPI)
```bash
# Option 1: Admin API deploy endpoint
curl -s -X POST -H "$AUTH" "$ADMIN_URL/deploy/gateway" -d '{"action": "pull-and-restart"}'

# Option 2: SSH
ssh cres_admin@ssh.gallagherpropco.com
cd /c/gpc-cres-backend
git pull --ff-only
docker restart gateway
```

### CUA Worker
```bash
# Build locally, SCP to server, restart
# Source is at infra/cua-worker/ in the repo
# Deployed to /c/temp/cua-worker/ on Windows PC via bind mount
ssh cres_admin@ssh.gallagherpropco.com
cd /c/temp/cua-worker
# Update files...
docker stop gpc-cua-worker && docker start gpc-cua-worker
```

### Docker Compose (full stack)
```bash
ssh cres_admin@ssh.gallagherpropco.com
cd /c/gpc-cres-backend
docker compose pull
docker compose up -d --force-recreate
```

## Environment Variables Reference

### Gateway Container
| Variable | Purpose |
|----------|---------|
| `API_KEYS` | Comma-separated Bearer tokens for gateway auth |
| `ADMIN_API_KEY` | Separate token for /admin/* routes |
| `OPENAI_API_KEY` | OpenAI API key (used by CUA worker) |
| `DATABASE_URL` | PostgreSQL connection string |
| `B2_*` | Backblaze B2 storage credentials |

### Vercel (apps/web)
| Variable | Purpose |
|----------|---------|
| `GATEWAY_DATABASE_URL` | `https://api.gallagherpropco.com` — Prisma gateway adapter |
| `LOCAL_API_KEY` | Bearer token for gateway + DB proxy auth |
| `CUA_WORKER_URL` | `https://cua.gallagherpropco.com` |
| `CF_ACCESS_CLIENT_ID` | CF Access service token for tunnel auth |
| `CF_ACCESS_CLIENT_SECRET` | CF Access service token secret |
| `GATEWAY_PROXY_URL` | `https://gateway.gallagherpropco.com` |
| `GATEWAY_PROXY_TOKEN` | Bearer token for gateway proxy worker |

## Quick Diagnostic Checklist

When something is broken, run through this in order:

```bash
# 1. Is the tunnel alive?
curl -s --max-time 5 "https://api.gallagherpropco.com/health" | jq

# 2. Are all containers running?
curl -s -H "$AUTH" "$ADMIN_URL/containers" | jq '.[] | {name, status}'

# 3. Is the database responding?
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  "$ADMIN_URL/db/query" -d '{"query": "SELECT count(*) FROM ebr_parcels"}'

# 4. Are tiles serving?
curl -s -o /dev/null -w "%{http_code}" "https://tiles.gallagherpropco.com/health"

# 5. Is CUA worker alive?
curl -s --max-time 5 "https://cua.gallagherpropco.com/health"

# 6. Check gateway logs for errors
curl -s -H "$AUTH" "$ADMIN_URL/containers/gateway/logs?tail=20"
```

If step 1 fails → tunnel is down → need physical/Codex access to restart cloudflared.
If step 1 passes but others fail → specific container issue → restart via Admin API.
