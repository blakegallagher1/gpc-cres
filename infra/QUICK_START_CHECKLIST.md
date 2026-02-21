# Local PostgreSQL Map Tiles - Quick Start Checklist

**Target:** `postgresql://postgres:Nola0528!@localhost:5432/cres_db` (12-core i7)

---

## ✅ Pre-Flight Checks

- [ ] PostgreSQL 16+ installed and running
- [ ] PostGIS extension available (`sudo apt-get install postgis` or equivalent)
- [ ] Database `cres_db` exists
- [ ] User `postgres` has password `Nola0528!`
- [ ] EBR parcel data migrated from Supabase (including `geom` column)

**Verify database connection:**
```bash
psql postgresql://postgres:Nola0528!@localhost:5432/cres_db -c "SELECT version();"
```

---

## ✅ Database Setup

- [ ] Run SQL setup script:
  ```bash
  psql postgresql://postgres:Nola0528!@localhost:5432/cres_db \
    -f infra/sql/local-db-setup.sql
  ```

- [ ] Verify geometry data exists:
  ```sql
  SELECT COUNT(*), COUNT(geom) FROM ebr_parcels;
  ```
  _(Should see thousands of rows with geom)_

- [ ] Refresh materialized view:
  ```sql
  REFRESH MATERIALIZED VIEW mv_parcel_intelligence;
  ```

- [ ] Test tile generation:
  ```sql
  SELECT octet_length(get_parcel_mvt(14, 3623, 6449));
  ```
  _(Should return >0 bytes)_

---

## ✅ Performance Tuning

- [ ] Backup current PostgreSQL config:
  ```bash
  sudo cp /etc/postgresql/*/main/postgresql.conf \
         /etc/postgresql/*/main/postgresql.conf.backup
  ```

- [ ] Apply performance settings:
  ```bash
  sudo cat infra/postgresql/postgresql-i7-12core.conf | \
    sudo tee -a /etc/postgresql/*/main/postgresql.conf
  ```

- [ ] Restart PostgreSQL:
  ```bash
  sudo systemctl restart postgresql
  ```

- [ ] Verify settings applied:
  ```sql
  SHOW shared_buffers;        -- Should be 8GB
  SHOW max_parallel_workers;  -- Should be 12
  ```

---

## ✅ Environment Variables

- [ ] Set `LOCAL_DATABASE_URI` in `apps/web/.env.local`:
  ```bash
  echo "LOCAL_DATABASE_URI=postgresql://postgres:Nola0528!@localhost:5432/cres_db" \
    >> apps/web/.env.local
  ```

- [ ] Verify env var is set:
  ```bash
  cd apps/web
  node -e "require('dotenv').config({ path: '.env.local' }); \
           console.log(process.env.LOCAL_DATABASE_URI)"
  ```

---

## ✅ Next.js Application

- [ ] Restart dev server:
  ```bash
  cd apps/web
  pkill -f "next dev"
  npm run dev
  ```

- [ ] Test tile endpoint in browser:
  ```
  http://localhost:3000/api/map/tiles/14/3623/6449
  ```
  _(Should download a .pbf file or show binary content, NOT JSON error)_

---

## ✅ Map Rendering Test

- [ ] Open `/maps` page:
  ```
  http://localhost:3000/maps
  ```

- [ ] Open Browser DevTools (F12) → Network tab

- [ ] Filter for `/api/map/tiles/`

- [ ] Verify tile requests:
  - [ ] Multiple tile URLs appear (e.g., `/api/map/tiles/14/3623/6449`)
  - [ ] Each returns HTTP 200 (not 204)
  - [ ] Content-Type is `application/vnd.mapbox-vector-tile`
  - [ ] Size is >0 bytes (typically 5-50 KB per tile)

- [ ] Check Console tab for errors
  - [ ] No "Failed to fetch" errors
  - [ ] No "Invalid MVT" errors

- [ ] Visually confirm:
  - [ ] Base map loads (streets or satellite)
  - [ ] Parcel boundaries/polygons are visible in East Baton Rouge area

---

## ✅ Troubleshooting Steps

**If tiles return HTTP 204 (No Content):**
- [ ] Check zoom level (must be >= 10)
- [ ] Pan to East Baton Rouge area (30.4515°N, 91.1871°W)
- [ ] Verify data in that area:
  ```sql
  SELECT COUNT(*) FROM mv_parcel_intelligence
  WHERE ST_Intersects(
    geom,
    ST_MakeEnvelope(-91.3, 30.3, -91.0, 30.6, 4326)
  );
  ```

**If "password authentication failed":**
- [ ] Check PostgreSQL allows password auth:
  ```bash
  sudo grep "local.*md5" /etc/postgresql/*/main/pg_hba.conf
  ```
- [ ] Edit `pg_hba.conf` if needed, then restart PostgreSQL

**If map shows base layer but no parcels:**
- [ ] Check MapLibre style in DevTools console:
  ```javascript
  map.getLayer('parcels-fill')
  map.getSource('parcels')
  ```
- [ ] Verify layer visibility, opacity, and color settings

**If "Parcels with geometry: 0":**
- [ ] Data migration missing `geom` column
- [ ] Re-export from Supabase including geometry:
  ```sql
  -- In Supabase DB:
  SELECT id, parcel_id, address, area_sqft, owner,
         ST_AsText(geom) as geom_wkt
  FROM parcels
  WHERE parish = 'East Baton Rouge';
  ```

---

## ✅ Performance Verification

- [ ] Check query performance:
  ```sql
  SELECT query, calls, mean_exec_time
  FROM pg_stat_statements
  WHERE query LIKE '%get_parcel_mvt%'
  ORDER BY mean_exec_time DESC
  LIMIT 5;
  ```
  _(Tile generation should be <100ms average)_

- [ ] Check index usage:
  ```sql
  SELECT indexrelname, idx_scan
  FROM pg_stat_user_indexes
  WHERE tablename = 'mv_parcel_intelligence';
  ```
  _(idx_scan should be >0 for geom index)_

---

## ✅ Maintenance Setup

- [ ] Schedule daily materialized view refresh (cron or pg_cron):
  ```bash
  # Add to crontab
  0 3 * * * psql postgresql://postgres:Nola0528!@localhost:5432/cres_db \
    -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_parcel_intelligence;"
  ```

- [ ] Enable pg_stat_statements monitoring:
  ```sql
  CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
  SELECT * FROM pg_stat_statements LIMIT 1;
  ```

---

## 🎯 Success Criteria

You're done when:
1. ✅ SQL setup script runs without errors
2. ✅ Materialized view contains geometry data
3. ✅ Test tile function returns bytes (not NULL)
4. ✅ PostgreSQL performance settings verified
5. ✅ `LOCAL_DATABASE_URI` env var set
6. ✅ Next.js dev server running
7. ✅ `/api/map/tiles/{z}/{x}/{y}` returns HTTP 200 + MVT binary
8. ✅ `/maps` page shows parcel polygons in East Baton Rouge

---

## 📊 Expected Performance Benchmarks

On 12-core i7 with optimized config:

- **Tile generation**: <50ms average (at zoom 14)
- **Materialized view refresh**: <30 seconds for 560K parcels
- **Concurrent tile requests**: 20+ req/sec sustained
- **Memory usage**: ~8GB shared_buffers + ~2-3GB OS cache
- **Index scan time**: <10ms for typical viewport

---

## 🚀 Next Steps After Setup

1. **Document in CLAUDE.md:**
   - Update "Louisiana Property Database" section
   - Add `LOCAL_DATABASE_URI` env var documentation
   - Note that local DB replaces Supabase for map tiles

2. **Update `.env.example`:**
   ```bash
   echo "LOCAL_DATABASE_URI=postgresql://postgres:PASSWORD@localhost:5432/cres_db" \
     >> apps/web/.env.example
   ```

3. **Consider Martin tile server** for production:
   - Pre-rendered tile caching
   - Better performance than on-the-fly generation
   - See `infra/LOCAL_DB_SETUP_GUIDE.md` for setup

4. **Set up monitoring dashboard:**
   - pg_stat_statements for query performance
   - Tile request logs for traffic patterns
   - Materialized view freshness alerts

5. **Benchmark before/after:**
   - Record current Supabase tile generation time
   - Compare with local PostgreSQL performance
   - Document improvements

---

## 📝 Notes

- Local DB is ONLY for map tiles (get_parcel_mvt function)
- Individual parcel geometry endpoint (`/api/external/chatgpt-apps/parcel-geometry`) still uses Supabase unless you update that route
- Martin tile server is optional but recommended for production
- Keep Supabase credentials for non-map features (auth, storage, etc.)

---

**File Locations:**
- SQL Setup: `infra/sql/local-db-setup.sql`
- PostgreSQL Config: `infra/postgresql/postgresql-i7-12core.conf`
- Full Guide: `infra/LOCAL_DB_SETUP_GUIDE.md`
- This Checklist: `infra/QUICK_START_CHECKLIST.md`
