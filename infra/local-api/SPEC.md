# Local API Server — Production Specification

> **⚠️ DEPLOYMENT REALITY (verified 2026-02-20):** The actual deployment is a **Docker Compose stack** at `C:\gpc-cres-backend\docker-compose.yml`, NOT the bare-metal Python servers described in parts of this spec. The files `api_server.py` and `tile_server.py` in this directory are **reference implementations** that were never deployed. The deployed gateway runs on port **:8000** (not :8081), tiles via Martin on **:3000** (not :8080), and uses a **single GATEWAY_API_KEY** (not API_KEYS array). See `PHASE_3_DEPLOYMENT_BLOCKERS.md` for deployment evidence.

## Overview

You are a **FastAPI gateway** running inside Docker Compose on a Windows 11 desktop with a 12-core i7 processor and local PostgreSQL database. Your job is to serve **property data**, **vector tiles**, **document search**, and **memory retrieval** to the Entitlement OS frontend deployed on Vercel.

**Key architectural decisions:**
- **Service-to-service authentication** (Bearer token, single GATEWAY_API_KEY)
- **Separate subdomains** for tiles vs data/tools
- **Tool-safe endpoints** with strict request shaping
- **Qdrant integration** for document and memory retrieval
- **Server-side caching** and rate limiting

---

## Architecture

```
Vercel (Next.js)
    ↓ HTTPS (Single Cloudflare Tunnel, 4 QUIC connections)
    ↓
Docker Compose (Windows 11, 12-core i7)
    ├── gateway (FastAPI :8000) — api.gallagherpropco.com
    ├── martin (:3000, MVT tiles) — tiles.gallagherpropco.com
    ├── postgres (internal, :5432) — 560K parcels, PostGIS
    ├── qdrant (internal, :6333) — vector search
    ├── pgadmin (internal)
    └── cloudflared (tunnel agent)
```

**Single Cloudflare Tunnel with remotely-managed ingress:**
- `api.gallagherpropco.com` → gateway:8000 (FastAPI)
- `tiles.gallagherpropco.com` → martin:3000 (MVT tiles)
- Catch-all → http_status:404

**Why separate subdomains?**
- Independent cache policies (tiles immutable 7d, data short-lived)
- Separate rate limiting (tiles high-volume, tools low-volume)
- CDN optimization (tile subdomain gets aggressive edge caching)

---

## API Endpoints

### Tiles Subdomain (`tiles.gallagherpropco.com`)

**Port:** 8080
**Cache:** Aggressive (7 days, immutable)
**Rate Limit:** 1000 req/min

#### `GET /tiles/{z}/{x}/{y}.pbf`
Returns Mapbox Vector Tile (`.pbf`) for parcel boundaries.

**Response:**
- `200`: Vector tile binary data
- `204`: No data for this tile
- `400`: Invalid tile coordinates
- `503`: Martin unreachable

**Cache-Control:** `public, max-age=604800, immutable`

---

### Data/Tools Subdomain (`api.gallagherpropco.com`)

**Port:** 8081
**Cache:** Short-lived (60s max)
**Rate Limit:** 100 req/min per endpoint

#### `GET /health`
**No auth required.** Returns system status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-20T10:00:00Z",
  "database": "connected",
  "martin": "up",
  "qdrant": "up"
}
```

---

#### `POST /tool/parcel.bbox`
Search parcels within bounding box.

**Auth:** Bearer token required
**Request shaping:**
- Max bbox area: 0.1 sq degrees (~100 sq km)
- Max results: 100
- Cache: 60s by bbox hash

**Request:**
```json
{
  "bbox": {
    "minLat": 30.40,
    "minLng": -91.20,
    "maxLat": 30.45,
    "maxLng": -91.15
  },
  "filters": {
    "searchText": "Main St",
    "parish": "East Baton Rouge",
    "minAcres": 1.0,
    "maxAcres": 5.0
  },
  "limit": 25
}
```

**Response:**
```json
{
  "ok": true,
  "count": 12,
  "cached": false,
  "data": [
    {
      "id": "uuid-here",
      "parcel_uid": "EBR-123456",
      "site_address": "123 Main St",
      "owner_name": "John Doe",
      "acreage": 1.25,
      "zoning": "C2",
      "flood_zone": "X",
      "lat": 30.41,
      "lng": -91.15,
      "parish": "East Baton Rouge"
    }
  ]
}
```

**Errors:**
- `400`: Bbox too large or invalid
- `401`: Missing/invalid Bearer token
- `429`: Rate limit exceeded

---

#### `GET /tool/parcel.get?id={parcel_id}`
Get single parcel by ID.

**Auth:** Bearer token required
**Cache:** 300s

**Response:**
```json
{
  "ok": true,
  "data": {
    "id": "uuid-here",
    "parcel_uid": "EBR-123456",
    "site_address": "123 Main St",
    "owner_name": "John Doe",
    "acreage": 1.25,
    "assessed_value": 125000,
    "sale_date": "2024-06-15",
    "sale_price": 150000,
    "zoning": "C2",
    "flood_zone": "X",
    "lat": 30.41,
    "lng": -91.15,
    "parish": "East Baton Rouge"
  }
}
```

---

#### `GET /tool/parcel.geometry?id={parcel_id}&detail={low|medium|high}`
Get parcel boundary GeoJSON.

**Auth:** Bearer token required
**Cache:** 3600s
**Detail levels:**
- `low`: ~10 points (default)
- `medium`: ~50 points
- `high`: ~200 points

**Response:**
```json
{
  "ok": true,
  "data": {
    "parcel_uid": "EBR-123456",
    "geom_simplified": {
      "type": "Polygon",
      "coordinates": [[
        [-91.1500, 30.4100],
        [-91.1495, 30.4100],
        [-91.1495, 30.4105],
        [-91.1500, 30.4105],
        [-91.1500, 30.4100]
      ]]
    }
  }
}
```

---

#### `POST /tool/screening.flood`
Screen parcel for flood risk.

**Auth:** Bearer token required
**Cache:** 3600s

**Request:**
```json
{
  "parcelId": "EBR-123456",
  "lat": 30.41,
  "lng": -91.15
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "parcelId": "EBR-123456",
    "floodZone": "X",
    "floodRisk": "low",
    "firmPanel": "22033C0305E",
    "effectiveDate": "2024-01-01"
  }
}
```

---

#### `POST /tool/docs.search`
Search project documentation (Qdrant).

**Auth:** Bearer token required
**Max results:** 20
**Cache:** 300s

**Request:**
```json
{
  "query": "EBR zoning C2 setback requirements",
  "limit": 5,
  "filter": {
    "parish": "East Baton Rouge",
    "docType": "zoning"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "count": 3,
  "data": [
    {
      "score": 0.92,
      "content": "C2 Commercial: Front setback 25ft, side 10ft...",
      "metadata": {
        "source": "EBR UDC Chapter 9",
        "section": "9.3.2",
        "parish": "East Baton Rouge",
        "docType": "zoning"
      }
    }
  ]
}
```

---

#### `GET /tool/docs.fetch?id={doc_id}`
Fetch full document by ID (Qdrant).

**Auth:** Bearer token required
**Cache:** 3600s

**Response:**
```json
{
  "ok": true,
  "data": {
    "id": "doc-uuid-here",
    "title": "EBR Unified Development Code - Chapter 9",
    "content": "...",
    "metadata": {
      "source": "EBR UDC",
      "updated": "2024-01-15",
      "parish": "East Baton Rouge"
    }
  }
}
```

---

#### `POST /tool/memory.write`
Store conversation memory (Qdrant).

**Auth:** Bearer token required
**Max payload:** 10KB
**No cache**

**Request:**
```json
{
  "conversationId": "conv-123",
  "userId": "user-456",
  "content": "Blake prefers outdoor storage deals in EBR with C2 zoning.",
  "metadata": {
    "type": "user_preference",
    "topic": "deal_criteria"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "id": "memory-uuid-here",
  "indexed": true
}
```

---

## Authentication

**All endpoints except `/health` require:**
```
Authorization: Bearer <API_KEY>
```

**Validation:**
- Constant-time comparison (`secrets.compare_digest`)
- API keys stored in `.env` (comma-separated)
- Invalid key → `401 Unauthorized`

**No CORS** — service-to-service auth only.

---

## Database Schema

**Table:** `ebr_parcels` (560K rows)

| Column | Type | Example |
|--------|------|---------|
| `id` | UUID | `uuid-here` |
| `parcel_uid` | TEXT | `EBR-123456` |
| `site_address` | TEXT | `123 Main St` |
| `owner` | TEXT | `John Doe` |
| `area_sqft` | FLOAT | `54450` (1.25 acres) |
| `assessed_value` | INTEGER | `125000` |
| `sale_date` | DATE | `2024-06-15` |
| `sale_price` | INTEGER | `150000` |
| `zone_code` | TEXT | `C2` |
| `flood_zone` | TEXT | `X` |
| `latitude` | FLOAT | `30.41` |
| `longitude` | FLOAT | `-91.15` |
| `parish` | TEXT | `East Baton Rouge` |
| `geom` | GEOMETRY | PostGIS Polygon |

**PostGIS functions available:**
- `ST_Within(point, bbox)` — bbox filtering
- `ST_Simplify(geom, tolerance)` — geometry simplification
- `ST_AsGeoJSON(geom)` — GeoJSON output

---

## Performance Requirements

**Target latency (p95):**
- Tile requests: <100ms
- Bbox search: <500ms
- Single parcel: <50ms
- Screening: <200ms
- Docs/memory: <300ms

**Connection pool:**
- Min: 5 connections
- Max: 20 connections
- Timeout: 60s

**Rate limiting (per endpoint, per minute):**
- Tiles: 1000 req/min
- Bbox search: 100 req/min
- Other tools: 100 req/min

**Caching (server-side):**
- In-memory LRU cache (max 1000 entries)
- TTL varies by endpoint (see above)
- Cache key = hash(endpoint + params)

---

## Running in Production (Windows 11)

**Install dependencies:**
```powershell
pip install fastapi uvicorn asyncpg httpx python-dotenv qdrant-client
```

**Run tile server (port 8080):**
```powershell
python tile_server.py
```

**Run data/tools server (port 8081):**
```powershell
python api_server.py
```

**Use Windows Task Scheduler** to auto-start on boot.

**Cloudflare Tunnel setup:**
```powershell
cloudflared tunnel create gpc-tiles
cloudflared tunnel create gpc-api

# Configure ingress
# ~/.cloudflared/config.yml
```

---

## Communication Flows

**1. Vercel requests tile:**
```
Vercel (apps/web/app/api/map/tiles/[z]/[x]/[y]/route.ts)
  → HTTPS GET tiles.gallagherpropco.com/tiles/14/3842/6745.pbf
  → Cloudflare Tunnel → Local API :8080
  → Proxy to Martin :3000/parcels/14/3842/6745.pbf
  → Return .pbf binary
```

**2. Agent searches parcels:**
```
Agent (packages/openai/src/tools/propertyDbTools.ts)
  → POST api.gallagherpropco.com/tool/parcel.bbox
  → Cloudflare Tunnel → Local API :8081
  → PostgreSQL query with bbox filter
  → Return JSON array (max 100)
```

**3. Agent retrieves zoning docs:**
```
Agent (packages/openai/src/tools/zoningTools.ts)
  → POST api.gallagherpropco.com/tool/docs.search
  → Cloudflare Tunnel → Local API :8081
  → Qdrant vector search
  → Return top 5 matches with scores
```

---

## Monitoring & Logs

**Log format (JSON):**
```json
{
  "timestamp": "2026-02-20T10:00:00Z",
  "level": "INFO",
  "endpoint": "/tool/parcel.bbox",
  "method": "POST",
  "status": 200,
  "latency_ms": 145,
  "cache_hit": false,
  "result_count": 12
}
```

**Health checks:**
- Vercel hits `/health` every 60s
- Alert if database disconnected >5min
- Alert if Martin unreachable >2min
- Alert if Qdrant down >2min

---

This spec is complete and ready to implement.
