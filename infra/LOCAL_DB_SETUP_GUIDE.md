# Local PostgreSQL Setup Guide for Map Tiles

**Target Database:** `postgresql://postgres:Nola0528!@localhost:5432/cres_db`
**Hardware:** 12-core i7 processor
**Goal:** Maximum performance + parcel polygon rendering on /maps page

---

## Step 1: Run Database Setup Script

Execute the comprehensive SQL setup script to create all required tables, indexes, and functions:

```bash
cd /Users/gallagherpropertycompany/Documents/gallagher-cres

# Run the setup script
psql postgresql://postgres:Nola0528!@localhost:5432/cres_db -f infra/sql/local-db-setup.sql
```

**Expected output:**
```
=================================================================
SETUP COMPLETE!
Total parcels: XXXXX
Parcels with geometry: XXXXX
=================================================================
```

**⚠️ CRITICAL:** If "Parcels with geometry" shows 0, your data migration did NOT include the `geom` column. You'll need to re-migrate or import geometry data.

---

## Step 2: Verify Data Migration

Check that geometry data exists:

```sql
-- Connect to database
psql postgresql://postgres:Nola0528!@localhost:5432/cres_db

-- Check parcel count and geometry coverage
SELECT
  COUNT(*) AS total_parcels,
  COUNT(geom) AS parcels_with_geom,
  ROUND(100.0 * COUNT(geom) / COUNT(*), 2) AS geom_coverage_pct
FROM ebr_parcels;

-- Sample a few parcels to verify geometry format
SELECT
  parcel_id,
  address,
  ST_GeometryType(geom) AS geom_type,
  ST_SRID(geom) AS srid,
  ST_Area(geom::geography) * 10.764 AS area_sqft
FROM ebr_parcels
WHERE geom IS NOT NULL
LIMIT 5;
```

**Expected results:**
- `geom_coverage_pct` should be close to 100%
- `geom_type` should be `ST_Polygon` or `ST_MultiPolygon`
- `srid` should be `4326` (WGS84)
- `area_sqft` should match the `area_sqft` column values

---

## Step 3: Refresh Materialized View

The materialized view is critical for performance:

```sql
-- Refresh the materialized view (takes ~10-30 seconds for 560K parcels)
REFRESH MATERIALIZED VIEW mv_parcel_intelligence;

-- Verify the view has data
SELECT COUNT(*) FROM mv_parcel_intelligence;
```

**Expected:** Count should match the number of parcels with geometry from Step 2.

---

## Step 4: Test Vector Tile Function

Test the core function that generates Mapbox Vector Tiles:

```sql
-- Test tile generation for Baton Rouge (zoom 14, approximate tile coordinates)
-- Baton Rouge center: 30.4515° N, 91.1871° W
-- At zoom 14, this is approximately tile (3623, 6449)
SELECT
  get_parcel_mvt(14, 3623, 6449) IS NOT NULL AS tile_generated,
  octet_length(get_parcel_mvt(14, 3623, 6449)) AS tile_size_bytes
;

-- If tile_generated = false or tile_size_bytes = 0, there's a problem
```

**Troubleshooting if tile is NULL or 0 bytes:**
```sql
-- Check if parcels exist in this tile's bounding box
SELECT COUNT(*)
FROM mv_parcel_intelligence
WHERE ST_Intersects(
  geom,
  ST_Transform(ST_TileEnvelope(14, 3623, 6449)::geometry, 4326)
);
```

---

## Step 5: Apply PostgreSQL Performance Configuration

Copy the optimized configuration settings:

```bash
# Backup current config
sudo cp /etc/postgresql/*/main/postgresql.conf /etc/postgresql/*/main/postgresql.conf.backup

# Append performance settings (or manually edit postgresql.conf)
sudo cat infra/postgresql/postgresql-i7-12core.conf | sudo tee -a /etc/postgresql/*/main/postgresql.conf

# Restart PostgreSQL to apply changes
sudo systemctl restart postgresql
```

**Verify settings applied:**
```sql
SHOW shared_buffers;           -- Should show 8GB
SHOW effective_cache_size;     -- Should show 24GB
SHOW max_parallel_workers;     -- Should show 12
SHOW work_mem;                 -- Should show 128MB
```

**⚠️ Adjust for your RAM:**
If you have less than 32GB RAM, edit the config file values proportionally:
- `shared_buffers`: 25% of total RAM
- `effective_cache_size`: 75% of total RAM
- `maintenance_work_mem`: 10% of total RAM

---

## Step 6: Set Environment Variables

The Next.js tile endpoint needs to know about your local database:

### Option A: For local development (`.env.local`)

```bash
cd apps/web

# Create or edit .env.local
cat >> .env.local <<EOF

# Local PostgreSQL for map tiles
LOCAL_DATABASE_URI=postgresql://postgres:Nola0528!@localhost:5432/cres_db
EOF
```

### Option B: For Vercel deployment

```bash
# Set environment variable in Vercel project
vercel env add LOCAL_DATABASE_URI production
# When prompted, enter: postgresql://postgres:Nola0528!@localhost:5432/cres_db
# Note: This won't work for Vercel cloud - only for local testing
```

**⚠️ Important:** For Vercel cloud deployment, you'll need to use a publicly accessible database URL, not `localhost`. Consider:
- Supabase (current setup)
- Railway / Render PostgreSQL
- AWS RDS / GCP Cloud SQL
- Or keep using `MAP_DATABASE_URL` pointing to Supabase for production

---

## Step 7: Restart Next.js Development Server

```bash
cd apps/web

# Kill any running dev server
pkill -f "next dev"

# Start fresh with new env vars
npm run dev
```

---

## Step 8: Test Map Tile Endpoint

Open browser dev tools and test the tile endpoint directly:

```
http://localhost:3000/api/map/tiles/14/3623/6449
```

**Expected response:**
- HTTP 200 status
- Content-Type: `application/vnd.mapbox-vector-tile`
- Binary content (not empty, not JSON error)

**If you get HTTP 204 or empty response:**
- Check database connection in Next.js terminal logs
- Verify `LOCAL_DATABASE_URI` is set correctly
- Verify `get_parcel_mvt()` function exists and returns data (Step 4)

---

## Step 9: Debug Polygon Rendering on /maps Page

Navigate to `http://localhost:3000/maps` and open browser DevTools (F12).

### Check 1: Network Tab
1. Filter for `/api/map/tiles/`
2. You should see multiple tile requests (e.g., `/api/map/tiles/14/3623/6449`)
3. Each successful tile should:
   - Return HTTP 200
   - Show Content-Type: `application/vnd.mapbox-vector-tile`
   - Have non-zero size (e.g., 5-50 KB)

**If tiles return HTTP 204 (No Content):**
- Zoom out/in to different areas
- Check if you're zoomed in enough (function returns NULL below zoom 10)
- Verify parcels exist in that geographic area

### Check 2: Console Tab
Look for errors like:
- `Failed to fetch` → Network/CORS issue
- `Unexpected token` → Server returning JSON instead of MVT
- `Invalid MVT` → Malformed tile data

### Check 3: MapLibre GL Style
In DevTools Console, inspect the map layers:

```javascript
// Get map instance (assuming it's exposed globally or via React DevTools)
// Check if parcel layer is loaded
map.getStyle().layers.filter(l => l.id.includes('parcel'))

// Check if parcel source is loaded
map.getSource('parcels')
```

**Expected:** You should see a source named `parcels` with type `vector` and tiles array pointing to `/api/map/tiles/{z}/{x}/{y}`.

### Check 4: Individual Parcel Geometry
The app also fetches individual parcel geometries via `/api/external/chatgpt-apps/parcel-geometry`. Check Network tab for these requests:

```
POST /api/external/chatgpt-apps/parcel-geometry
```

**Request body:**
```json
{
  "parcelId": "some-parcel-id",
  "detailLevel": "low"
}
```

**Expected response:**
```json
{
  "ok": true,
  "data": {
    "geom_simplified": "{\"type\":\"Polygon\",\"coordinates\":[...]}",
    "bbox": [-91.2, 30.4, -91.1, 30.5],
    "area_sqft": 50000,
    ...
  }
}
```

**If this returns errors:**
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are still set (this endpoint uses Supabase, not local DB)
- Or update `apps/web/app/api/external/chatgpt-apps/parcel-geometry/route.ts` to use local DB instead

---

## Step 10: Common Issues & Fixes

### Issue: "Parcels with geometry: 0"

**Cause:** Data migration didn't include `geom` column.

**Fix:**
```sql
-- If you have lat/lng columns, create point geometries:
UPDATE ebr_parcels
SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
WHERE lng IS NOT NULL AND lat IS NOT NULL;

-- If you have a separate geometry export file (e.g., from Supabase):
-- Export from Supabase:
-- SELECT id, parcel_id, ST_AsGeoJSON(geom) as geom_json FROM parcels;
-- Then import and parse the GeoJSON
```

### Issue: Tiles return HTTP 204 everywhere

**Cause:** Either no data in area, or zoom level too low.

**Fix:**
- Check zoom level (must be >= 10)
- Verify data exists: `SELECT COUNT(*) FROM ebr_parcels WHERE geom IS NOT NULL;`
- Check tile coordinates match Baton Rouge area

### Issue: "password authentication failed"

**Cause:** Incorrect password or PostgreSQL not configured for password auth.

**Fix:**
```bash
# Check pg_hba.conf allows password auth
sudo cat /etc/postgresql/*/main/pg_hba.conf | grep "local.*md5"

# Should have lines like:
# local   all   postgres   md5
# host    all   all   127.0.0.1/32   md5

# If not, edit pg_hba.conf and restart PostgreSQL
```

### Issue: Map shows base layer but no parcels

**Possible causes:**
1. Vector tile endpoint returning 204 (no data)
2. MapLibre style not configured to render parcel layer
3. Parcel layer exists but has opacity 0 or wrong color

**Fix:**
```javascript
// In DevTools console, check layer style:
map.getLayer('parcels-fill')?.paint

// Should show something like:
// { 'fill-color': '#088', 'fill-opacity': 0.3 }
```

---

## Performance Monitoring

Once everything is working, monitor performance:

```sql
-- Top 20 slowest queries
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Index usage statistics
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Materialized view freshness (add updated_at column if needed)
SELECT
  COUNT(*) AS total_records,
  MIN(created_at) AS oldest_parcel,
  MAX(created_at) AS newest_parcel
FROM mv_parcel_intelligence;
```

---

## Maintenance Tasks

### Daily: Refresh materialized view
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_parcel_intelligence;
```

### Weekly: Vacuum and analyze
```sql
VACUUM ANALYZE ebr_parcels;
VACUUM ANALYZE mv_parcel_intelligence;
```

### Monthly: Reindex
```sql
REINDEX INDEX CONCURRENTLY idx_ebr_parcels_geom;
REINDEX INDEX CONCURRENTLY idx_mv_parcel_intelligence_geom;
```

---

## Next Steps

Once parcel polygons are rendering:

1. **Update CLAUDE.md** to document local DB setup
2. **Update `.env.example`** to include `LOCAL_DATABASE_URI`
3. **Consider Martin tile server** for production (pre-rendered tiles, faster than on-the-fly generation)
4. **Set up monitoring** (pg_stat_statements, query logging)
5. **Benchmark performance** (tile generation time, concurrent requests)

---

## Martin Tile Server Integration (Optional)

If you want to use Martin instead of Next.js API routes:

```bash
# Install Martin
cargo install martin

# Configure Martin to serve tiles from get_parcel_mvt function
martin postgresql://postgres:Nola0528!@localhost:5432/cres_db --keep-alive 75

# Martin will auto-discover get_parcel_mvt and serve at:
# http://localhost:3000/parcels/{z}/{x}/{y}.pbf

# Update apps/web/components/maps/tileUrls.ts:
# return "http://localhost:3000/parcels/{z}/{x}/{y}.pbf"
```

**Benefits of Martin:**
- Pre-rendered tile caching
- Built-in compression
- Automatic function discovery
- Production-ready performance

---

## Questions or Issues?

If you encounter issues not covered here:

1. **Check PostgreSQL logs:**
   ```bash
   sudo tail -f /var/log/postgresql/postgresql-*.log
   ```

2. **Check Next.js logs:**
   Look for connection errors or query failures in terminal

3. **Verify environment:**
   ```bash
   cd apps/web
   node -e "console.log(process.env.LOCAL_DATABASE_URI)"
   ```

4. **Test direct database connection:**
   ```bash
   psql postgresql://postgres:Nola0528!@localhost:5432/cres_db -c "SELECT version();"
   ```
