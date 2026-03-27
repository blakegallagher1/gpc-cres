# Local API Gateway - Production Spec

> Deployment reality verified against code in `infra/local-api/main.py` and compose in `infra/docker/docker-compose.yml`.

## Overview

The local API stack is a Docker Compose deployment that exposes a single FastAPI gateway and a separate Martin tile service behind Cloudflare Tunnel.

- FastAPI gateway: `gateway:8000` (public hostname: `api.gallagherpropco.com`)
- Martin tile service: `martin:3000` (public hostname: `tiles.gallagherpropco.com`)
- Property DB (PostgreSQL/PostGIS): container `5432`, host `54323`
- Qdrant: container `6333`

The Next.js app and worker call gateway/tile services via service-to-service bearer auth, not direct database URLs.

## Architecture

```text
Vercel (Next.js)
  -> HTTPS + Bearer token
Cloudflare Edge + Tunnel
  -> api.gallagherpropco.com   -> gateway:8000
  -> tiles.gallagherpropco.com -> martin:3000
Docker Compose (Windows host)
  -> gateway (FastAPI)
  -> martin (MVT)
  -> entitlement-db (Postgres/PostGIS)
  -> qdrant
  -> cloudflared
```

## Runtime Environment Contract

### Gateway (`infra/local-api/main.py`)

Required:
- `DATABASE_URL` (property DB)

Optional:
- `APPLICATION_DATABASE_URL` (if omitted, uses `DATABASE_URL`)
- `MARTIN_URL` (default: `http://localhost:3000`)
- `API_KEYS` (comma-separated bearer keys)
- `GATEWAY_API_KEY` (single-key fallback)
- `ALLOWED_ORIGINS` (comma-separated)

Auth behavior:
- All endpoints except `GET /health` require `Authorization: Bearer <key>`.
- Key comparison uses constant-time checks.

### App Runtime (`apps/web`)

For parcel/tile flows, app routes read:
- `LOCAL_API_URL`
- `LOCAL_API_KEY`

Optional:
- `TILE_SERVER_URL` (if omitted, tile host is derived by replacing `api.` with `tiles.`)
- `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` when Cloudflare Access is enabled.

`LOCAL_DATABASE_URI` is not the runtime contract for current app parcel/tile paths.

## API Surface (Current `main.py`)

### Public
- `GET /health`

### Authenticated - Deals
- `GET /deals`
- `POST /deals`

### Authenticated - Tiles and Parcels
- `GET /tiles/{z}/{x}/{y}.pbf`
- `GET /tiles/zoning/{z}/{x}/{y}.pbf`
- `POST /tools/parcel.lookup`
- `POST /tools/parcel.bbox`
- `POST /tools/parcel.point`
- `POST /tools/parcels.search`
- `POST /tools/parcels.sql`
- `GET /api/parcels/search`
- `GET /api/parcels/{parcel_id}`
- `GET /api/parcels/{parcel_id}/geometry`

### Authenticated - Screening
- `POST /api/screening/zoning`
- `POST /api/screening/flood`
- `POST /api/screening/soils`
- `POST /api/screening/wetlands`
- `POST /api/screening/epa`
- `POST /api/screening/traffic`
- `POST /api/screening/ldeq`
- `POST /api/screening/full`

### Authenticated - Storage
- `POST /storage/upload-bytes`
- `GET /storage/object-bytes`
- `GET /storage/download-url`
- `POST /storage/delete-object`

### Authenticated - Admin and Stats
- `GET /api/stats`
- `POST /db/query`
- `GET|POST|PATCH /admin/*` (via `admin_router`)

## Query Endpoint Contract

`POST /db/query` executes SQL with parameter binding.

Request shape:

```json
{
  "sql": "SELECT * FROM ebr_parcels WHERE parcel_id = $1",
  "params": ["123-456"]
}
```

Behavior:
- `SELECT` and statements containing `RETURNING` return rows.
- Other statements return `rowCount`.
- Missing `sql` returns `400`.

## Compose Port Contract

From `infra/docker/docker-compose.yml`:
- PostgreSQL host port: `54323`
- PostgreSQL container port: `5432`

Use host DSN from the workstation:

```bash
postgresql://postgres:postgres@localhost:54323/entitlement_os
```

## Integration Flows

### 1) Map tile rendering (`/map`)
1. Browser requests `GET /api/map/tiles/{z}/{x}/{y}` from Next.js.
2. Next.js route reads `LOCAL_API_URL` and `LOCAL_API_KEY`.
3. Route calls tile host (`TILE_SERVER_URL` or `LOCAL_API_URL` host swapped to `tiles.`).
4. Response is returned as `application/vnd.mapbox-vector-tile`.

### 2) Parcel geometry
1. Browser requests `GET /api/parcels/{parcelId}/geometry`.
2. Next.js route enforces auth/rate limits.
3. Route proxies to gateway `GET /api/parcels/{parcel_id}/geometry?detail_level=...`.
4. Gateway response is normalized and returned to client.

### 3) Agent and tools query
1. Tool adapter sends authenticated requests to `api.gallagherpropco.com`.
2. Gateway executes bounded parcel/tool logic.
3. Optional SQL path goes through `POST /db/query`.

## Operational Smoke Checks

```bash
# Gateway health
curl http://localhost:8000/health

# Authenticated parcel search
curl -H "Authorization: Bearer $GATEWAY_API_KEY" \
  "http://localhost:8000/api/parcels/search?q=Main%20St&limit=5"

# Authenticated SQL endpoint
curl -X POST http://localhost:8000/db/query \
  -H "Authorization: Bearer $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql":"SELECT COUNT(*) AS c FROM ebr_parcels"}'

# Host DB connectivity
psql postgresql://postgres:postgres@localhost:54323/entitlement_os -c "SELECT 1;"
```

## Non-Goals and Legacy Notes

- Legacy split-server prototypes (`api_server.py`, `tile_server.py`) were removed from the repo in 2026-03-20; they are not the active deployment path. Historical copies exist only in git history.
- Do not document or depend on `/api/query`; current endpoint is `/db/query`.
- Do not document app parcel/tile runtime as direct DB URI wiring.
