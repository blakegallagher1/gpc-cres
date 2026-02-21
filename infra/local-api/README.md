# Local PostgreSQL API for Vercel Integration

**Docker Compose stack exposing local PostgreSQL + Martin tiles + Qdrant to Vercel cloud functions.**

> **⚠️ DEPLOYMENT REALITY (verified 2026-02-20):** The actual deployment is a Docker Compose stack at `C:\gpc-cres-backend\docker-compose.yml`. The Python files in this directory (`api_server.py`, `tile_server.py`, `main.py`) are **reference implementations** that were never deployed. The deployed gateway runs on port :8000 with a single `GATEWAY_API_KEY`.

---

## Quick Start (Docker Compose — actual deployment)

```bash
# On Windows 11 server:
cd C:\gpc-cres-backend
docker-compose up -d

# Test health
curl https://api.gallagherpropco.com/health

# Test with auth
curl -H "Authorization: Bearer $GATEWAY_API_KEY" \
  -X POST https://api.gallagherpropco.com/tools/parcel.bbox \
  -H "Content-Type: application/json" \
  -d '{"minLat": 30.2, "maxLat": 30.3, "minLng": -91.2, "maxLng": -91.1}'
```

**Reference docs:**
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Legacy deployment guide (bare-metal, outdated)
- [CLOUDFLARE_TUNNEL_SETUP.md](./CLOUDFLARE_TUNNEL_SETUP.md) - Tunnel configuration reference
- `PHASE_3_DEPLOYMENT_BLOCKERS.md` (repo root) - Deployment verification evidence

---

## Architecture

```
Vercel (gallagherpropco.com)
    ↓ HTTPS + Bearer Token
Cloudflare Edge (Atlanta: atl01, atl08, atl10, atl12)
    ├── api.gallagherpropco.com → gateway:8000 (FastAPI)
    └── tiles.gallagherpropco.com → martin:3000 (MVT tiles)
    ↓ Single Cloudflare Tunnel (4 QUIC connections)
Docker Compose (Windows 11, 12-core i7)
    ├── gateway (FastAPI :8000) — Auth + parcel/memory endpoints
    ├── martin (:3000) — MVT tile generation
    ├── postgres (:5432 internal) — 560K parcels, PostGIS
    ├── qdrant (:6333 internal) — vector search
    ├── pgadmin (internal)
    └── cloudflared (tunnel agent)
```

### Why This Architecture?

1. **Vercel → Local:** Web app hosted on Vercel needs to access local database
2. **Cloudflare Tunnel:** Secure localhost exposure (no port forwarding, no dynamic DNS)
3. **FastAPI Gateway:** Authentication + unified API endpoint for all operations
4. **Martin:** Lightweight tile server (read-only, tile-only, separate subdomain)
5. **PostgreSQL:** 12-core i7 server with 560K parcels + PostGIS
6. **Docker Compose:** Single `docker-compose up -d` deploys entire stack

---

## Project Structure

```
infra/local-api/
├── README.md                      # This file
├── DEPLOYMENT.md                  # Complete deployment guide
├── CLOUDFLARE_TUNNEL_SETUP.md     # Tunnel configuration
├── main.py                        # FastAPI server (461 lines)
├── requirements.txt               # Python dependencies
├── .env.example                   # Environment template
└── .env                          # Actual config (git-ignored)
```

---

## API Endpoints

### Public (No Auth):
- `GET /health` - Health check (database + Martin status)

### Authenticated (Bearer Token):
- `GET /tiles/{z}/{x}/{y}.pbf` - Vector tiles (proxied to Martin)
- `GET /api/parcels/search?q=...&parish=...&limit=25` - Search parcels
- `GET /api/parcels/{id}` - Get parcel details
- `GET /api/parcels/{id}/geometry?detail_level=low` - Get GeoJSON geometry
- `POST /api/screening/flood` - Flood zone screening
- `POST /api/screening/full` - Full parcel screening (flood, soils, wetlands, EPA, traffic, LDEQ)
- `POST /api/query` - Dynamic SQL execution (for agents)
- `GET /api/stats` - Database statistics

**Interactive docs:** [http://localhost:8080/docs](http://localhost:8080/docs) (when running locally)

---

## Environment Variables

See `.env.example` for full list. Critical values:

```bash
# Database
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/cres_db

# Martin tile server
MARTIN_URL=http://localhost:3000

# API authentication (generate with: openssl rand -hex 32)
API_KEYS=your-secret-key-here,another-key-here

# CORS (Vercel domains)
ALLOWED_ORIGINS=https://gallagherpropco.com,https://*.vercel.app
```

---

## Security Features

1. **API Key Authentication:**
   - Bearer token validation
   - Constant-time comparison (timing attack prevention)
   - Multiple key support (comma-separated)

2. **CORS Protection:**
   - Restricted to Vercel domains only
   - No wildcard origins in production

3. **SQL Injection Prevention:**
   - Parameterized queries via asyncpg
   - Dangerous keyword blocking for dynamic queries

4. **Cloudflare Tunnel:**
   - No port forwarding required
   - No home IP exposure
   - TLS encryption + DDoS protection

---

## Performance

**PostgreSQL Optimizations:**
- Connection pooling (5-20 connections via asyncpg)
- Materialized views (`mv_parcel_intelligence`)
- GIST spatial indexes
- Parallel queries (12-core i7)
- JIT compilation for PostGIS

**Expected Performance:**
- Tile generation: <50ms (zoom 14)
- Parcel search: <100ms
- Geometry fetch: <50ms
- Concurrent requests: 20+ req/sec

**Config:** See `infra/postgresql/postgresql-i7-12core.conf`

---

## Adding Custom Endpoints

Edit `main.py` to add new endpoints for agent workflows:

```python
@app.post("/api/custom-analysis")
async def custom_analysis(
    request: Request,
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_db),
):
    body = await request.json()
    # Your custom logic here
    rows = await conn.fetch("SELECT * FROM your_rpc($1)", body.get("param"))
    return {"ok": True, "data": [dict(row) for row in rows]}
```

Restart server:
```bash
launchctl unload ~/Library/LaunchAgents/com.gpc.api.plist
launchctl load ~/Library/LaunchAgents/com.gpc.api.plist
```

Docs auto-update at `/docs`.

---

## Troubleshooting

### Server won't start:
```bash
# Check PostgreSQL
psql postgresql://postgres:Nola0528!@localhost:5432/cres_db -c "SELECT version();"

# Check Martin
curl http://localhost:3000/health

# Check port 8080 availability
lsof -i :8080
```

### 401 Unauthorized:
```bash
# Verify API key in .env matches Vercel env var
cat .env | grep API_KEYS
vercel env ls
```

### Tiles return 204:
```bash
# Refresh materialized view
psql postgresql://postgres:Nola0528!@localhost:5432/cres_db \
  -c "REFRESH MATERIALIZED VIEW mv_parcel_intelligence;"
```

**Full troubleshooting:** See [DEPLOYMENT.md](./DEPLOYMENT.md#troubleshooting)

---

## Documentation

| File | Purpose |
|------|---------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Step-by-step deployment (5 minutes) |
| [CLOUDFLARE_TUNNEL_SETUP.md](./CLOUDFLARE_TUNNEL_SETUP.md) | Tunnel configuration + systemd/launchd setup |
| `.env.example` | Environment variable template |
| [http://localhost:8080/docs](http://localhost:8080/docs) | Interactive API docs (OpenAPI) |

---

## Why FastAPI?

**Chosen over Express.js because:**
- ✅ Fast async I/O (asyncpg vs pg)
- ✅ Auto-generated OpenAPI docs
- ✅ Type validation (Pydantic)
- ✅ Better for spatial queries
- ✅ Lower memory footprint
- ✅ Built-in dependency injection

---

## Next Steps

1. **Deploy:** Follow [DEPLOYMENT.md](./DEPLOYMENT.md)
2. **Configure Tunnel:** Follow [CLOUDFLARE_TUNNEL_SETUP.md](./CLOUDFLARE_TUNNEL_SETUP.md)
3. **Update Vercel:** Set `LOCAL_API_URL` and `LOCAL_API_KEY` env vars
4. **Update Next.js:** Proxy API routes to local server
5. **Test:** Visit `https://gallagherpropco.com/maps`

---

## Support

- **API Docs:** http://localhost:8080/docs
- **FastAPI:** https://fastapi.tiangolo.com
- **Cloudflare Tunnel:** https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- **PostgreSQL:** See `infra/LOCAL_DB_SETUP_GUIDE.md`

---

**Ready to deploy?** → [DEPLOYMENT.md](./DEPLOYMENT.md)

