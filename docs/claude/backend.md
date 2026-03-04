# Backend: Local Property DB + FastAPI Gateway

Last synced with `infra/local-api/main.py`: 2026-03-04

## Architecture (verified 2026-03-04)

```
Vercel (gallagherpropco.com)
    ├── Prisma queries → CF Worker /db → Hyperdrive → tunnel → local Postgres
    └── Gateway calls → HTTPS + Bearer Token (LOCAL_API_KEY)
Cloudflare Edge (tunnel + Hyperdrive)
    ├── agents.gallagherpropco.com → CF Worker (Durable Objects + /db proxy)
    ├── api.gallagherpropco.com → gateway:8000 (FastAPI)
    └── tiles.gallagherpropco.com → martin:3000 (MVT tiles)
    ↓
Windows 11 Desktop (12-core i7) — Docker Compose at C:\gpc-cres-backend\docker-compose.yml
    ├── gateway (FastAPI :8000) — infra/local-api/main.py
    │   ├── Auth: Bearer token (GATEWAY_API_KEY), constant-time comparison
    │   ├── DB pool: asyncpg → entitlement_os (all data + PostGIS)
    │   ├── /db/query endpoint for Prisma SQL proxy (Vercel fallback)
    │   └── Security: X-Content-Type-Options: nosniff, X-Frame-Options: DENY
    ├── martin (:3000) — MVT tile generation from parcel geometries
    ├── entitlement-os-postgres (internal :5432) — entitlement_os, all data, PostGIS, SSL enabled
    ├── qdrant (internal :6333) — vector search (docs, memory)
    ├── pgadmin (internal)
    └── cloudflared (tunnel agent)
```

`LOCAL_API_KEY` (Vercel) is the same value as `GATEWAY_API_KEY`; both represent the same Bearer token.

Separate subdomains for independent cache policies (tiles: 7d immutable; data: 60s-3600s), separate rate limits, and CDN optimization.

## Database

All services use a single PostgreSQL database: `entitlement_os` on the `entitlement-os-postgres` container. The legacy `local-postgis` container was removed on 2026-03-04. Both Supabase projects archived (2026-03-04). Vercel reaches this DB via Cloudflare Hyperdrive (config `ebd13ab7df60414d9ba8244299467e5e`) through the CF Worker `/db` endpoint.

| Pool | Env Var | Target | Purpose |
|------|---------|--------|---------|
| `db_pool` | `DATABASE_URL` | `entitlement_os` on `entitlement-db` | Parcels, geometry, screening, tiles, stats |
| `app_db_pool` | `APPLICATION_DATABASE_URL` | `entitlement_os` on `entitlement-db` (same DB) | Deals CRUD, runs, orgs |

Both pools: min 2, max 10 connections, 60s command timeout. Both point to the same consolidated database.

## Authentication

All endpoints except `/health` require:
```
Authorization: Bearer <GATEWAY_API_KEY>
```
- Key source: `API_KEYS` or `GATEWAY_API_KEY` env var (comma-separated, supports multiple)
- Validation: `secrets.compare_digest()` (constant-time)
- No CORS by default; `ALLOWED_ORIGINS` env var enables it for specified domains
- Deals endpoints additionally require `X-Org-Id` and/or `X-User-Id` headers for tenant isolation

## Endpoint Inventory (20 endpoints)

Synced from `infra/local-api/main.py` — update this table when endpoints change.

### Health & Stats
| Method | Path | Auth | DB Pool | Description |
|--------|------|------|---------|-------------|
| GET | `/health` | No | — | Returns `{status, timestamp, database}` |
| GET | `/api/stats` | Yes | Property | Parcel counts, geometry coverage, total acres |

### Deals CRUD (Application DB)
| Method | Path | Auth | Headers | Description |
|--------|------|------|---------|-------------|
| GET | `/deals` | Yes | — | List deals. Query: `org_id` (required), `status`, `sku`, `search`, `limit` (max 500). Returns deals with triage tier/score. |
| POST | `/deals` | Yes | `X-Org-Id`, `X-User-Id` | Create deal. Body: `{name, sku, jurisdictionId, notes?, targetCloseDate?, parcelAddress?, apn?}`. Valid SKUs: `SMALL_BAY_FLEX`, `OUTDOOR_STORAGE`, `TRUCK_PARKING`. |
| PATCH | `/deals` | Yes | `X-Org-Id` | Bulk actions. Body: `{action: "delete"|"update-status", ids: string[], status?}`. For update-status, response includes `updatedDeals: [{id, fromStatus, toStatus}]` for automation. |
| GET | `/deals/{id}` | Yes | `X-Org-Id`, `X-User-Id` | Single deal with jurisdiction, parcels, tasks, artifacts, uploads, triage run. |
| PATCH | `/deals/{id}` | Yes | `X-Org-Id`, `X-User-Id` | Update deal. Body: `{name?, status?, notes?, targetCloseDate?, sku?, jurisdictionId?}`. Returns `updatedDeals` if status changed. |
| DELETE | `/deals/{id}` | Yes | `X-Org-Id`, `X-User-Id` | Delete deal. |

### Storage (B2 S3-compatible)
| Method | Path | Auth | Headers | Description |
|--------|------|------|---------|-------------|
| POST | `/storage/upload-session` | Yes | `X-Org-Id`, `X-User-Id` | Create pending upload, return signed PUT URL. Body: `{dealId, filename, contentType, sizeBytes, kind?}`. |
| POST | `/storage/upload-bytes` | Yes | `X-Org-Id`, `X-User-Id` | Server-side upload. Multipart: `kind=artifact\|evidence_snapshot\|evidence_extract\|staging`, metadata, `file`. For artifact: creates DB row. For staging: `objectKey` required, must start with `staging/{orgId}/`. |
| POST | `/storage/finalize` | Yes | `X-Org-Id`, `X-User-Id` | Verify object in B2, mark upload available. Body: `{artifactId}`. |
| GET | `/storage/object-bytes` | Yes | `X-Org-Id`, `X-User-Id` | Raw bytes by key. Query: `key`. Valid keys: `uploads/`, `artifacts/`, `evidence/`, `staging/`. |
| GET | `/storage/download-url` | Yes | `X-Org-Id`, `X-User-Id` | Signed GET URL. Query: `id`, `type=upload\|artifact\|evidence_snapshot\|evidence_extract`. |
| GET | `/storage/list` | Yes | `X-Org-Id`, `X-User-Id` | List uploads for deal. Query: `dealId`, `limit`. |
| DELETE | `/storage/objects/{object_id}` | Yes | `X-Org-Id`, `X-User-Id` | Delete upload from B2 and DB. |

### Tiles Proxy (Martin)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/tiles/{z}/{x}/{y}.pbf` | Yes | Proxy to Martin. Validates coords (z: 0-22). Cache: 24h immutable. Returns MVT binary or 204. |

### Parcel Tool Endpoints (used by `propertyDbTools.ts`)
| Method | Path | Auth | Body | Description |
|--------|------|------|------|-------------|
| POST | `/tools/parcel.lookup` | Yes | `{parcel_id}` | Single parcel via `api_get_parcel` RPC, with inline fallback query. |
| POST | `/tools/parcel.bbox` | Yes | `{west, south, east, north, limit?, parish?}` | Bbox search, max 100 results. |

### Parcel API Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/parcels/search` | Yes | Text search (address, owner, parcel ID). Query: `q`, `parish?`, `limit?` (max 100). Uses `api_search_parcels` RPC. |
| GET | `/api/parcels/{parcel_id}` | Yes | Get parcel by UUID or parcel_uid. Uses `api_get_parcel` RPC. |
| GET | `/api/parcels/{parcel_id}/geometry` | Yes | GeoJSON geometry. Query: `detail_level` (low/medium/high). Uses `rpc_get_parcel_geometry` RPC. |

### Screening Endpoints (used by `propertyDbTools.ts`)

All screening endpoints: `POST`, auth required, body `{parcel_id}`, resolve parcel_uid → UUID via `_resolve_parcel_uuid()`, return `{ok, data}`.

| Path | RPC Function | Extra Params |
|------|-------------|--------------|
| `/tools/screen.flood` | `api_screen_flood(uuid)` | — |
| `/tools/screen.soils` | `api_screen_soils(uuid)` | — |
| `/tools/screen.wetlands` | `api_screen_wetlands(uuid)` | — |
| `/tools/screen.epa` | `api_screen_epa(uuid, radius)` | `radius_miles` (default 1.0) |
| `/tools/screen.traffic` | `api_screen_traffic(uuid, radius)` | `radius_miles` (default 0.5) |
| `/tools/screen.ldeq` | `api_screen_ldeq(uuid, radius)` | `radius_miles` (default 1.0) |
| `/tools/screen.full` | `api_screen_full(uuid)` | — (runs all 6 screens) |
| `/api/screening/zoning` | Zoning district lookup | `parcel_id` |

## Vercel Integration

| Env Var | Value | Used By |
|---------|-------|---------|
| `LOCAL_API_URL` | `https://api.gallagherpropco.com` | `propertyDbTools.ts`, API routes |
| `LOCAL_API_KEY` | `GATEWAY_API_KEY` value | Bearer token for all requests |

Key Vercel-side files that call the backend:
- `apps/web/app/api/map/tiles/[z]/[x]/[y]/route.ts` — tile proxy
- `packages/openai/src/tools/propertyDbTools.ts` — agent tool definitions (parcel search, lookup, screening)
- `apps/web/lib/server/propertyDbEnv.ts` — env validation (fail-fast on missing keys)

## RPC Functions (PostgreSQL)

Defined in `infra/sql/property-db-rpc-functions.sql`:
- `api_get_parcel(text)` — single parcel lookup
- `api_search_parcels(text, text, int)` — text search
- `rpc_get_parcel_geometry(text, text)` — geometry with simplification
- `api_screen_flood(uuid)` — FEMA flood zone screening
- `api_screen_soils(uuid)` — USDA soil conditions
- `api_screen_wetlands(uuid)` — NWI wetlands
- `api_screen_epa(uuid, float)` — nearby EPA facilities
- `api_screen_traffic(uuid, float)` — traffic count stations
- `api_screen_ldeq(uuid, float)` — LDEQ environmental permits
- `api_screen_full(uuid)` — composite screening (all 6)

## Adding New Endpoints

Follow the existing pattern in `main.py`:
```python
@app.post("/tools/<resource>.<action>")
async def tools_resource_action(
    request: Request,
    api_key: str = Depends(verify_api_key),
):
    if not db_pool:
        raise HTTPException(status_code=503, detail="Property database not configured")
    body = await request.json()
    # ... validate, query, return {ok: True, data: ...}
```

After adding: update this file's endpoint inventory table.

## Operational Notes

- **Host:** Windows 11 desktop, 12-core i7, Docker Compose
- **Remote management:** See `docs/SERVER_MANAGEMENT.md` — Cloudflare SSH + `pnpm server:*` scripts
- **Docker Compose path:** `C:\gpc-cres-backend\docker-compose.yml`
- **Cloudflare Tunnel:** See `docs/CLOUDFLARE.md` — single tunnel, ingress rules managed in dashboard (not local config)
- **Logs:** Uvicorn JSON logs, security headers on all responses
- **Server startup:** `python main.py` (port 8000, reload enabled in dev)
- **Health check:** `GET /health` (no auth) — used by Vercel 60s polling

## Key Invariants

- Bearer auth on every endpoint except `/health`
- Deals endpoints enforce org-scoping via `X-Org-Id` header + `org_id` in WHERE clauses
- Screening endpoints resolve `parcel_uid` → UUID before calling RPC (flexible matching: case-insensitive, dash-stripped)
- Never expose raw database errors to client — return generic 4xx/5xx + log server-side
- `infra/local-api/SPEC.md` is the original design spec; this file is the current truth
