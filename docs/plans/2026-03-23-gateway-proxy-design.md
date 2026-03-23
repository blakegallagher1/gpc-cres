# Gateway Proxy Design: All-Cloudflare Edge Architecture

**Date:** 2026-03-23
**Status:** Approved
**Budget:** ~$5-10/mo (within existing CF paid tier)

## Problem Statement

The Windows 11 PC running the FastAPI gateway, Martin tile server, and property database is the backbone of Entitlement OS — but communicating with it is fragile and maintenance is painful:

1. **Reliability:** When the PC is off, rebooting, or the CF tunnel drops, the web app returns degraded/partial data with no clear signal to users.
2. **Deploys:** Pushing gateway code changes requires manual SSH (flaky WebSocket tunnel, 8-45s delays, Docker credential helper workaround).
3. **Maintenance:** Checking container health, tailing logs, restarting services, and running SQL all require SSH to a Windows box through an unreliable tunnel.

## Solution

Replace the direct Vercel → Cloudflare Tunnel → Gateway connection with a **Cloudflare Worker proxy** that caches all property data in **D1** (edge SQLite), backed by an **admin dashboard** on CF Pages, **GitHub Actions CI/CD**, and **CF Cron health monitoring**.

## Architecture

```
Browser/Vercel ──→ CF Worker ("Gateway Proxy")
                      │
                      ├──→ Windows Gateway (primary, when online)
                      ├──→ D1 cache (fallback, always available)
                      │
                      ├── /admin/* dashboard (CF Pages)
                      ├── GitHub Action → deploy to Windows
                      ├── Health cron (CF Cron Trigger every 2 min)
                      └── Data sync: Windows pushes to D1 every 15 min
```

### Design Principles

- **Single entry point:** Web app and agent tools only ever talk to `gateway.gallagherpropco.com` (the CF Worker).
- **Zero downtime reads:** D1 always has property data. If the gateway is down, D1 serves cached responses.
- **Transparent source tracking:** Every response includes `X-GPC-Source: gateway | d1-cache | d1-stale` and `staleness_seconds`.
- **Auth simplification:** Callers send one Bearer token. The Worker handles CF Access headers upstream.
- **Independent admin infra:** Admin dashboard runs on CF Pages — independent of Vercel and the Windows PC.

---

## Section 1: CF Worker Gateway Proxy

A Cloudflare Worker at `gateway.gallagherpropco.com` proxies all property data requests.

**Request flow:**
1. Receive request with Bearer token
2. Validate token
3. Try upstream gateway (3s timeout)
4. On success: cache response in D1, return with `X-GPC-Source: gateway`
5. On failure: serve from D1 cache with `X-GPC-Source: d1-cache` or `d1-stale`

**Endpoints:**

| Route | Upstream | D1 cached? |
|-------|----------|------------|
| `GET /parcels/search` | `POST /tools/parcel.bbox` | Yes |
| `GET /parcels/:id` | `GET /api/parcels/:id` | Yes |
| `POST /parcels/sql` | `POST /tools/parcels.sql` | Yes (by query hash) |
| `GET /screening/:type/:parcelId` | `POST /tools/screen.*` | Yes |
| `POST /screening/full/:parcelId` | `POST /api/screening/full` | Yes |

**Auth:** Callers send `Authorization: Bearer <GATEWAY_PROXY_TOKEN>`. Worker adds `CF-Access-Client-Id`, `CF-Access-Client-Secret`, and `Authorization: Bearer <LOCAL_API_KEY>` when calling upstream.

---

## Section 2: D1 Data Sync

### D1 Schema

```sql
CREATE TABLE parcels (
  parcel_id TEXT PRIMARY KEY,
  owner_name TEXT,
  site_address TEXT,
  zoning_type TEXT,
  acres REAL,
  legal_description TEXT,
  assessed_value REAL,
  geometry TEXT,
  raw_json TEXT,
  synced_at INTEGER NOT NULL
);

CREATE TABLE screening (
  parcel_id TEXT NOT NULL,
  screen_type TEXT NOT NULL,
  result_json TEXT NOT NULL,
  synced_at INTEGER NOT NULL,
  PRIMARY KEY (parcel_id, screen_type)
);

CREATE TABLE cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  ttl_seconds INTEGER DEFAULT 900
);
```

### Sync Strategy

- **Initial:** Full sync of ~198K parcels from Property DB. Windows-side Python script queries DB, batches 1000 rows, POSTs to `gateway.gallagherpropco.com/admin/sync`.
- **Incremental:** Every 15 min, sync only rows with `updated_at > last_sync`.
- **Screening:** Cached on first request. Optional full pre-sync for commonly accessed parcels.
- **Auth:** Separate internal sync token (not the user-facing Bearer token).
- **Monitoring:** `GET /admin/sync/status` returns last sync time, row counts, errors.

---

## Section 3: Admin Dashboard

CF Pages app at `admin.gallagherpropco.com`. Protected by Cloudflare Access (Blake only).

**Views:**

1. **Health Overview** — Gateway status (green/yellow/red), last sync time, D1 cache stats, container statuses, last deploy info.
2. **Containers** — List containers with status/uptime. Actions: restart, stop, start, view logs. Routes through Worker → gateway `/admin/*`.
3. **SQL Explorer** — Query editor for Property DB and App DB. Results table. Saved queries in D1.
4. **Deploys** — Last 10 deploys with status. "Deploy Now" button (triggers GitHub Action). Rollback button.
5. **Sync Status** — Last sync time, row counts, errors, "Force Sync" button.

**Tech:** Static HTML + vanilla JS (or lightweight Preact). No build step. Deployed via `wrangler pages deploy`.

**Prerequisite:** The admin API (`infra/local-api/admin_router.py`) must be deployed to the production gateway first.

---

## Section 4: CI/CD via GitHub Actions

**Trigger:** Push to `main` when `infra/local-api/**` or `docker-compose*.yml` changes. Also `workflow_dispatch` for manual triggers.

**Steps:**
1. Install `cloudflared` in GitHub Action runner
2. SSH to Windows PC via CF tunnel (using service token)
3. `cd C:\gpc-cres-backend && git pull --ff-only && docker compose up -d --build gateway`
4. Wait 30s, probe gateway `/health`
5. On success: post deploy status to admin dashboard
6. On failure: rollback to previous commit, rebuild, alert

**GitHub Secrets:** `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `WINDOWS_SSH_KEY`, `GATEWAY_ADMIN_TOKEN`

**Docker credential fix:** Add `.docker/config.json` override on Windows that removes credential helper for headless builds.

---

## Section 5: Health Monitoring & Auto-Recovery

CF Cron Trigger every 2 minutes.

**Probes:**
1. `GET gateway /health` (3s timeout)
2. `GET gateway /tools/parcel.bbox` smoke test (5s timeout)
3. `GET tiles.gallagherpropco.com` alive check

**Escalation ladder:**

| Duration | Action |
|----------|--------|
| 0-2 min | First detection, retry |
| 2-4 min | Auto-restart gateway container via admin API |
| 4-10 min | Alert: Sentry + Slack |
| 10+ min | Escalation: "Manual intervention needed" |
| 30+ min | D1 staleness warnings in web app responses |

**History:** 7 days of probe results in D1, viewable as uptime chart in admin dashboard.

**Replaces:** Vercel-hosted stability sentinel for gateway health. Existing sentinel continues for Vercel-side endpoints.

---

## Section 6: Web App Changes

### New Package: `packages/gateway-client/`

```typescript
class GatewayClient {
  constructor(baseUrl: string, token: string)
  searchParcels(params: BboxSearch): Promise<GatewayResponse<Parcel[]>>
  getParcel(parcelId: string): Promise<GatewayResponse<Parcel>>
  screen(parcelId: string, type?: ScreenType): Promise<GatewayResponse<ScreeningResult>>
  sql(query: string): Promise<GatewayResponse<Row[]>>
}

interface GatewayResponse<T> {
  data: T
  source: 'gateway' | 'd1-cache' | 'd1-stale'
  staleness_seconds: number | null
}
```

### Files Changed

| File | Change |
|------|--------|
| `apps/web/app/api/parcels/route.ts` | Remove 3-level fallback, use `gatewayClient.searchParcels()` |
| `packages/openai/src/tools/propertyDbTools.ts` | Remove `gatewayPost()`, retry logic, CF headers. Use `gatewayClient`. |
| `apps/web/lib/server/propertyDbRpc.ts` | Delete entirely |
| `packages/openai/src/tools/` (screen tools) | Replace `propertyDbRpc("screen_*")` with `gatewayClient.screen()` |

### Environment Variables

| Var | Change |
|-----|--------|
| `LOCAL_API_KEY` | Remove from Vercel — only in CF Worker |
| `CF_ACCESS_CLIENT_ID` | Remove from Vercel — only in CF Worker |
| `CF_ACCESS_CLIENT_SECRET` | Remove from Vercel — only in CF Worker |
| `GATEWAY_PROXY_URL` | New: `https://gateway.gallagherpropco.com` |
| `GATEWAY_PROXY_TOKEN` | New: single Bearer token |

---

## Migration Order (No Big Bang)

1. Deploy CF Worker in pass-through mode (proxies to gateway, no D1)
2. Switch web app to Worker URL (env var change on Vercel)
3. Verify identical behavior
4. Enable D1 caching in Worker
5. Deploy sync script on Windows
6. Deploy admin dashboard to CF Pages
7. Set up GitHub Action for CI/CD
8. Enable health monitoring cron
9. Remove old fallback code from web app
10. Delete `propertyDbRpc.ts` and scattered retry/auth logic
