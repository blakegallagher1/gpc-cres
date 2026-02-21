# Local API Deployment Guide

## Quick Start (5 Minutes)

Complete deployment from scratch.

---

## Prerequisites Checklist

- [ ] PostgreSQL 16+ running with `cres_db` database
- [ ] Martin tile server running on port 3000
- [ ] Database setup script executed (`infra/sql/local-db-setup.sql`)
- [ ] Python 3.11+ installed
- [ ] Cloudflare account with domain

---

## Step 1: Install Python Dependencies

```bash
cd infra/local-api

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

---

## Step 2: Configure Environment

```bash
# Copy example config
cp .env.example .env

# Edit .env
vim .env  # or nano .env
```

**Fill in these critical values:**

```bash
# Database (update password)
DATABASE_URL=postgresql://postgres:Nola0528!@localhost:5432/cres_db

# Martin URL (verify port)
MARTIN_URL=http://localhost:3000

# Generate API keys (run this command)
# openssl rand -hex 32
API_KEYS=YOUR_GENERATED_KEY_HERE

# Vercel domains
ALLOWED_ORIGINS=https://gallagherpropco.com,https://*.vercel.app
```

**Generate API Key:**
```bash
openssl rand -hex 32
# Example output: a1b2c3d4e5f6...
# Copy this to API_KEYS in .env
```

---

## Step 3: Test Local Server

```bash
# Make sure PostgreSQL and Martin are running
psql postgresql://postgres:Nola0528!@localhost:5432/cres_db -c "SELECT version();"
curl http://localhost:3000/health  # Martin health check

# Start FastAPI server
python main.py
```

**Expected output:**
```
======================================================================
🚀 GPC Local Property Database API
======================================================================
📍 Server: http://localhost:8080
📖 Docs:   http://localhost:8080/docs
🗄️  Database: postgresql://postgres:***@localhost:5432/cres_db
🗺️  Martin: http://localhost:3000
🔑 API Keys: 1 configured
======================================================================
INFO:     Started server process [12345]
INFO:     Uvicorn running on http://0.0.0.0:8080
```

**Test endpoints:**

```bash
# 1. Health check (no auth required)
curl http://localhost:8080/health

# 2. Tile endpoint (requires auth)
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:8080/tiles/14/3623/6449.pbf \
  --output test.pbf

# 3. Parcel search
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:8080/api/parcels/search?q=Main%20St&limit=5"

# 4. API docs (interactive)
open http://localhost:8080/docs
```

If all tests pass, move to Step 4.

---

## Step 4: Set Up Cloudflare Tunnel

Follow the complete guide in `CLOUDFLARE_TUNNEL_SETUP.md`.

**Quick version:**

```bash
# Install cloudflared
brew install cloudflare/cloudflare/cloudflared

# Authenticate
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create gpc-local-api

# Configure DNS
cloudflared tunnel route dns gpc-local-api api.gallagherpropco.com

# Create config file
cat > ~/.cloudflared/config.yml <<EOF
tunnel: YOUR_TUNNEL_ID
credentials-file: /Users/YOUR_USERNAME/.cloudflared/YOUR_TUNNEL_ID.json
ingress:
  - hostname: api.gallagherpropco.com
    service: http://localhost:8080
  - service: http_status:404
EOF

# Test tunnel
cloudflared tunnel run gpc-local-api
```

**Test public endpoint:**
```bash
curl https://api.gallagherpropco.com/health
```

---

## Step 5: Run as a Service

### macOS (Recommended):

```bash
# Create launchd plist (see CLOUDFLARE_TUNNEL_SETUP.md)
cat > ~/Library/LaunchAgents/com.cloudflare.tunnel.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cloudflare.tunnel</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/cloudflared</string>
        <string>tunnel</string>
        <string>run</string>
        <string>gpc-local-api</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

# Load service
launchctl load ~/Library/LaunchAgents/com.cloudflare.tunnel.plist
```

### FastAPI as a service:

Create `~/Library/LaunchAgents/com.gpc.api.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.gpc.api</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/YOUR_USERNAME/Documents/gallagher-cres/infra/local-api/venv/bin/python</string>
        <string>/Users/YOUR_USERNAME/Documents/gallagher-cres/infra/local-api/main.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USERNAME/Documents/gallagher-cres/infra/local-api</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/gpc-api.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/gpc-api-error.log</string>
</dict>
</plist>
```

Load it:
```bash
launchctl load ~/Library/LaunchAgents/com.gpc.api.plist
```

**Check logs:**
```bash
tail -f /tmp/gpc-api.log
tail -f /tmp/cloudflared.log
```

---

## Step 6: Configure Vercel

### Add Environment Variables

Go to Vercel Dashboard → Your Project → Settings → Environment Variables

Add for **Production** and **Preview**:

| Name | Value | Environment |
|------|-------|-------------|
| `LOCAL_API_URL` | `https://api.gallagherpropco.com` | Production, Preview |
| `LOCAL_API_KEY` | (your generated API key from Step 2) | Production, Preview |

### Update Next.js Code

See example in `CLOUDFLARE_TUNNEL_SETUP.md` Step 9.

Key pattern:
```typescript
const response = await fetch(
  `${process.env.LOCAL_API_URL}/tiles/${z}/${x}/${y}.pbf`,
  {
    headers: {
      Authorization: `Bearer ${process.env.LOCAL_API_KEY}`,
    },
  }
);
```

**Files to update:**
- `apps/web/app/api/map/tiles/[z]/[x]/[y]/route.ts` - Tile proxy
- Any routes that query property database directly

### Redeploy Vercel

```bash
cd apps/web
vercel --prod
```

---

## Step 7: Verify End-to-End

### 1. Check local services:
```bash
# PostgreSQL
psql postgresql://postgres:Nola0528!@localhost:5432/cres_db -c "SELECT COUNT(*) FROM ebr_parcels WHERE geom IS NOT NULL;"

# Martin
curl http://localhost:3000/health

# FastAPI
curl http://localhost:8080/health

# Cloudflare Tunnel
curl https://api.gallagherpropco.com/health
```

### 2. Test Vercel → Local API:
```bash
# Tile endpoint (through Vercel)
curl https://gallagherpropco.com/api/map/tiles/14/3623/6449

# Should return MVT binary data, NOT JSON error
```

### 3. Test map rendering:
Open `https://gallagherpropco.com/maps` and verify:
- [ ] Base map loads
- [ ] Parcel polygons appear in East Baton Rouge area
- [ ] Network tab shows successful tile requests (HTTP 200)
- [ ] No console errors

---

## Troubleshooting

### Issue: "Connection refused" from Vercel

**Cause:** Local API or tunnel not running

**Fix:**
```bash
# Check if services are running
lsof -i :8080  # FastAPI
launchctl list | grep cloudflare  # Tunnel

# Restart if needed
launchctl unload ~/Library/LaunchAgents/com.gpc.api.plist
launchctl load ~/Library/LaunchAgents/com.gpc.api.plist
```

### Issue: "401 Unauthorized"

**Cause:** API key mismatch

**Fix:**
```bash
# Check local .env
cat infra/local-api/.env | grep API_KEYS

# Check Vercel env var
vercel env ls

# Make sure they match!
```

### Issue: Tiles return 204 everywhere

**Cause:** No data in database or materialized view stale

**Fix:**
```bash
psql postgresql://postgres:Nola0528!@localhost:5432/cres_db <<EOF
-- Refresh materialized view
REFRESH MATERIALIZED VIEW mv_parcel_intelligence;

-- Verify data exists
SELECT COUNT(*) FROM mv_parcel_intelligence WHERE geom IS NOT NULL;

-- Test tile function
SELECT octet_length(get_parcel_mvt(14, 3623, 6449));
EOF
```

### Issue: High latency from Vercel

**Cause:** Database query slow or network latency

**Fix:**
```bash
# Check query performance
psql postgresql://postgres:Nola0528!@localhost:5432/cres_db <<EOF
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
WHERE query LIKE '%get_parcel_mvt%'
ORDER BY mean_exec_time DESC
LIMIT 5;
EOF

# If slow, check indexes
SELECT indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE tablename = 'mv_parcel_intelligence';
```

---

## Performance Monitoring

### Database Stats:
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.gallagherpropco.com/api/stats
```

### FastAPI Logs:
```bash
tail -f /tmp/gpc-api.log
```

### Cloudflare Analytics:
- Go to Cloudflare Dashboard → Analytics → Traffic
- View requests to `api.gallagherpropco.com`

---

## Maintenance

### Daily:
```bash
# Refresh materialized view (if data changes)
psql postgresql://postgres:Nola0528!@localhost:5432/cres_db \
  -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_parcel_intelligence;"
```

### Weekly:
```bash
# Vacuum and analyze
psql postgresql://postgres:Nola0528!@localhost:5432/cres_db \
  -c "VACUUM ANALYZE ebr_parcels; VACUUM ANALYZE mv_parcel_intelligence;"
```

### Monthly:
```bash
# Check for slow queries
psql postgresql://postgres:Nola0528!@localhost:5432/cres_db \
  -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

---

## Adding Custom Endpoints

To add new endpoints for agents:

1. **Edit `main.py`:**

```python
@app.post("/api/custom-analysis")
async def custom_analysis(
    request: Request,
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Custom endpoint for agent analysis.
    """
    body = await request.json()
    parcel_id = body.get("parcelId")

    # Your custom logic here
    rows = await conn.fetch(
        "SELECT * FROM your_custom_rpc_function($1)",
        parcel_id
    )

    return {
        "ok": True,
        "data": [dict(row) for row in rows],
    }
```

2. **Restart FastAPI:**
```bash
launchctl unload ~/Library/LaunchAgents/com.gpc.api.plist
launchctl load ~/Library/LaunchAgents/com.gpc.api.plist
```

3. **Test:**
```bash
curl -X POST https://api.gallagherpropco.com/api/custom-analysis \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"parcelId": "abc123"}'
```

4. **Document in OpenAPI:**
Visit `https://api.gallagherpropco.com/docs` to see auto-generated docs

---

## Security Checklist

- [ ] API keys are strong random values (32+ chars)
- [ ] API keys not committed to git
- [ ] `.env` file is in `.gitignore`
- [ ] CORS origins restricted to Vercel domains only
- [ ] Cloudflare Tunnel is the only public access (no port forwarding)
- [ ] Database password changed from default
- [ ] Vercel environment variables set to "Encrypted"
- [ ] No sensitive data in FastAPI logs

---

## Next Steps

Once deployed and working:

1. **Update CLAUDE.md** to document the new architecture
2. **Update agent tools** to use the new API endpoints
3. **Add more custom endpoints** as needed for agent workflows
4. **Set up monitoring** (Cloudflare Analytics, FastAPI request logging)
5. **Benchmark performance** (tile generation time, query latency)

---

## Support

- **FastAPI Docs:** http://localhost:8080/docs (when running locally)
- **Cloudflare Tunnel Docs:** https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- **PostgreSQL Performance:** https://www.postgresql.org/docs/current/performance-tips.html
- **Martin Tile Server:** https://github.com/maplibre/martin

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          Vercel Cloud                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Next.js App (gallagherpropco.com)                       │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  API Routes:                                       │  │  │
│  │  │  - /api/map/tiles/{z}/{x}/{y}                     │  │  │
│  │  │  - /api/parcels/search                            │  │  │
│  │  │  - /api/screening/*                               │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS + Bearer Token
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Cloudflare Edge                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  api.gallagherpropco.com                                 │  │
│  │  - DDoS Protection                                       │  │
│  │  - TLS Termination                                       │  │
│  │  - CDN (static assets)                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Cloudflare Tunnel
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Local Server (12-core i7)                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  cloudflared (tunnel daemon)                             │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │                                     │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │  FastAPI Server (:8080)                                  │  │
│  │  - API Key Authentication                                │  │
│  │  - Request Routing                                       │  │
│  │  - PostgreSQL Connection Pool                            │  │
│  └─────┬──────────────────────────────────┬─────────────────┘  │
│        │                                  │                     │
│  ┌─────▼──────────────┐         ┌────────▼────────────┐        │
│  │  Martin (:3000)    │         │  PostgreSQL         │        │
│  │  - Vector Tiles    │         │  - cres_db          │        │
│  │  - MVT Generation  │         │  - PostGIS          │        │
│  │  - Read-only       │         │  - 560K parcels     │        │
│  └────────────────────┘         │  - Materialized View│        │
│                                 └─────────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

---

**Deployment complete!** 🚀

Visit `https://gallagherpropco.com/maps` to see parcel polygons rendering from your local server.
