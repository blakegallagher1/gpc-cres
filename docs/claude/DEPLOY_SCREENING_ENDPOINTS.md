# Deploy Screening Endpoints to Windows Backend

**Date:** 2026-02-22
**Target:** Windows 11 backend at `C:\gpc-cres-backend\`
**Tunnel:** `api.gallagherpropco.com` -> `gateway:8000`

## What Changed

We added 7 screening endpoints to the FastAPI gateway (`main.py`) that call existing PostgreSQL RPC functions on `entitlement_os`. These endpoints let the AI agents screen parcels for flood, soils, wetlands, EPA, traffic, LDEQ, and a combined full screen.

### New Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `POST /tools/screen.flood` | POST | Bearer | FEMA flood zone screening |
| `POST /tools/screen.soils` | POST | Bearer | USDA soil conditions |
| `POST /tools/screen.wetlands` | POST | Bearer | NWI wetlands presence |
| `POST /tools/screen.epa` | POST | Bearer | EPA facilities within radius |
| `POST /tools/screen.traffic` | POST | Bearer | Traffic counts within radius |
| `POST /tools/screen.ldeq` | POST | Bearer | LDEQ permits within radius |
| `POST /tools/screen.full` | POST | Bearer | All 6 screens combined |

### Removed Endpoints

The old mock endpoints (`POST /api/screening/flood` and `POST /api/screening/full`) that returned hardcoded fake data have been replaced by the real `/tools/screen.*` endpoints above.

---

## Prerequisites

1. The SQL RPC functions must exist on `entitlement_os`. If they don't, run the SQL file first (Step 1 below).
2. The gateway container uses `DATABASE_URL` to connect to `entitlement_os` — this is already configured.
3. The `GATEWAY_API_KEY` should be sourced from secure config (`YOUR_GATEWAY_API_KEY` in docs and examples).

---

## Step 1: Ensure SQL RPC Functions Exist on entitlement_os

Connect to the `entitlement_os` PostgreSQL instance and run the screening RPC function definitions. These functions query against the `parcels`, `fema_flood`, `soils`, `wetlands`, `epa_facilities`, `traffic_counts`, and `ldeq_permits` tables.

Open a psql session or pgAdmin connected to `entitlement_os` and execute:

```sql
-- Drop existing functions to allow signature changes
DROP FUNCTION IF EXISTS api_screen_flood(uuid);
DROP FUNCTION IF EXISTS api_screen_soils(uuid);
DROP FUNCTION IF EXISTS api_screen_wetlands(uuid);
DROP FUNCTION IF EXISTS api_screen_epa(uuid, double precision);
DROP FUNCTION IF EXISTS api_screen_traffic(uuid, double precision);
DROP FUNCTION IF EXISTS api_screen_ldeq(uuid, double precision);
DROP FUNCTION IF EXISTS api_screen_full(uuid);

-- 3. Flood Zone Screening
CREATE OR REPLACE FUNCTION api_screen_flood(parcel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  parcel_geom geometry;
BEGIN
  SELECT geom INTO parcel_geom FROM parcels WHERE id = parcel_id;
  IF parcel_geom IS NULL THEN
    RETURN jsonb_build_object('error', 'Parcel not found');
  END IF;

  SELECT jsonb_build_object(
    'parcel_id', parcel_id,
    'flood_zones', COALESCE(jsonb_agg(jsonb_build_object(
      'zone', f.zone,
      'bfe', f.bfe,
      'panel_id', f.panel_id,
      'effective_date', f.effective_date,
      'overlap_pct', ROUND((ST_Area(ST_Intersection(f.geom, parcel_geom)) / NULLIF(ST_Area(parcel_geom), 0) * 100)::numeric, 1)
    )), '[]'::jsonb),
    'in_sfha', EXISTS (
      SELECT 1 FROM fema_flood f2
      WHERE ST_Intersects(f2.geom, parcel_geom)
        AND f2.zone IN ('A', 'AE', 'AH', 'AO', 'V', 'VE')
    )
  ) INTO result
  FROM fema_flood f
  WHERE ST_Intersects(f.geom, parcel_geom);

  RETURN result;
END;
$$;

-- 4. Soils Screening
CREATE OR REPLACE FUNCTION api_screen_soils(parcel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  parcel_geom geometry;
BEGIN
  SELECT geom INTO parcel_geom FROM parcels WHERE id = parcel_id;
  IF parcel_geom IS NULL THEN
    RETURN jsonb_build_object('error', 'Parcel not found');
  END IF;

  SELECT jsonb_build_object(
    'parcel_id', parcel_id,
    'soils', COALESCE(jsonb_agg(jsonb_build_object(
      'mapunit_key', s.mapunit_key,
      'drainage_class', s.drainage_class,
      'hydric_rating', s.hydric_rating,
      'shrink_swell', s.shrink_swell,
      'overlap_pct', ROUND((ST_Area(ST_Intersection(s.geom, parcel_geom)) / NULLIF(ST_Area(parcel_geom), 0) * 100)::numeric, 1)
    )), '[]'::jsonb),
    'has_hydric', EXISTS (
      SELECT 1 FROM soils s2
      WHERE ST_Intersects(s2.geom, parcel_geom)
        AND s2.hydric_rating = 'Yes'
    )
  ) INTO result
  FROM soils s
  WHERE ST_Intersects(s.geom, parcel_geom);

  RETURN result;
END;
$$;

-- 5. Wetlands Screening
CREATE OR REPLACE FUNCTION api_screen_wetlands(parcel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  parcel_geom geometry;
BEGIN
  SELECT geom INTO parcel_geom FROM parcels WHERE id = parcel_id;
  IF parcel_geom IS NULL THEN
    RETURN jsonb_build_object('error', 'Parcel not found');
  END IF;

  SELECT jsonb_build_object(
    'parcel_id', parcel_id,
    'wetlands', COALESCE(jsonb_agg(jsonb_build_object(
      'wetland_type', w.wetland_type,
      'overlap_pct', ROUND((ST_Area(ST_Intersection(w.geom, parcel_geom)) / NULLIF(ST_Area(parcel_geom), 0) * 100)::numeric, 1)
    )), '[]'::jsonb),
    'has_wetlands', EXISTS (
      SELECT 1 FROM wetlands w2
      WHERE ST_Intersects(w2.geom, parcel_geom)
    )
  ) INTO result
  FROM wetlands w
  WHERE ST_Intersects(w.geom, parcel_geom);

  RETURN result;
END;
$$;

-- 6. EPA Screening (proximity-based)
CREATE OR REPLACE FUNCTION api_screen_epa(
  parcel_id uuid,
  radius_miles double precision DEFAULT 1.0
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  parcel_geom geometry;
  radius_m double precision;
BEGIN
  SELECT geom INTO parcel_geom FROM parcels WHERE id = parcel_id;
  IF parcel_geom IS NULL THEN
    RETURN jsonb_build_object('error', 'Parcel not found');
  END IF;

  radius_m := radius_miles * 1609.34;

  SELECT jsonb_build_object(
    'parcel_id', parcel_id,
    'radius_miles', radius_miles,
    'facilities', COALESCE(jsonb_agg(jsonb_build_object(
      'registry_id', e.registry_id,
      'name', e.name,
      'status', e.status,
      'street_address', e.street_address,
      'city', e.city,
      'naics', e.naics,
      'violations_last_3yr', e.violations_last_3yr,
      'penalties_last_3yr', e.penalties_last_3yr,
      'distance_miles', ROUND((ST_Distance(e.geom::geography, ST_Centroid(parcel_geom)::geography) / 1609.34)::numeric, 2)
    ) ORDER BY ST_Distance(e.geom, ST_Centroid(parcel_geom))), '[]'::jsonb),
    'count', (SELECT COUNT(*) FROM epa_facilities e2
              WHERE ST_DWithin(e2.geom::geography, ST_Centroid(parcel_geom)::geography, radius_m))
  ) INTO result
  FROM epa_facilities e
  WHERE ST_DWithin(e.geom::geography, ST_Centroid(parcel_geom)::geography, radius_m);

  RETURN result;
END;
$$;

-- 7. Traffic Screening (proximity-based)
CREATE OR REPLACE FUNCTION api_screen_traffic(
  parcel_id uuid,
  radius_miles double precision DEFAULT 0.5
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  parcel_geom geometry;
  radius_m double precision;
BEGIN
  SELECT geom INTO parcel_geom FROM parcels WHERE id = parcel_id;
  IF parcel_geom IS NULL THEN
    RETURN jsonb_build_object('error', 'Parcel not found');
  END IF;

  radius_m := radius_miles * 1609.34;

  SELECT jsonb_build_object(
    'parcel_id', parcel_id,
    'radius_miles', radius_miles,
    'road_segments', COALESCE(jsonb_agg(jsonb_build_object(
      'route_name', t.route_name,
      'aadt', t.aadt,
      'count_year', t.count_year,
      'truck_pct', t.truck_pct,
      'distance_miles', ROUND((ST_Distance(t.geom::geography, ST_Centroid(parcel_geom)::geography) / 1609.34)::numeric, 2)
    ) ORDER BY ST_Distance(t.geom, ST_Centroid(parcel_geom))), '[]'::jsonb)
  ) INTO result
  FROM traffic_counts t
  WHERE ST_DWithin(t.geom::geography, ST_Centroid(parcel_geom)::geography, radius_m);

  RETURN result;
END;
$$;

-- 8. LDEQ Screening (proximity-based)
CREATE OR REPLACE FUNCTION api_screen_ldeq(
  parcel_id uuid,
  radius_miles double precision DEFAULT 1.0
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  parcel_geom geometry;
  radius_m double precision;
BEGIN
  SELECT geom INTO parcel_geom FROM parcels WHERE id = parcel_id;
  IF parcel_geom IS NULL THEN
    RETURN jsonb_build_object('error', 'Parcel not found');
  END IF;

  radius_m := radius_miles * 1609.34;

  SELECT jsonb_build_object(
    'parcel_id', parcel_id,
    'radius_miles', radius_miles,
    'permits', COALESCE(jsonb_agg(jsonb_build_object(
      'permit_number', l.permit_number,
      'facility_name', l.facility_name,
      'permit_type', l.permit_type,
      'status', l.status,
      'issue_date', l.issue_date,
      'expiration_date', l.expiration_date,
      'distance_miles', ROUND((ST_Distance(l.geom::geography, ST_Centroid(parcel_geom)::geography) / 1609.34)::numeric, 2)
    ) ORDER BY ST_Distance(l.geom, ST_Centroid(parcel_geom))), '[]'::jsonb)
  ) INTO result
  FROM ldeq_permits l
  WHERE ST_DWithin(l.geom::geography, ST_Centroid(parcel_geom)::geography, radius_m);

  RETURN result;
END;
$$;

-- 9. Full Site Screening (combines all screens)
CREATE OR REPLACE FUNCTION api_screen_full(parcel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  flood_result jsonb;
  soils_result jsonb;
  wetlands_result jsonb;
  epa_result jsonb;
  traffic_result jsonb;
  ldeq_result jsonb;
  parcel_info record;
BEGIN
  SELECT
    p.id, p.parish, p.parcel_uid, p.owner_name, p.situs_address, p.acreage,
    ST_Y(ST_Centroid(p.geom)) AS lat, ST_X(ST_Centroid(p.geom)) AS lng
  INTO parcel_info
  FROM parcels p WHERE p.id = parcel_id;

  IF parcel_info IS NULL THEN
    RETURN jsonb_build_object('error', 'Parcel not found');
  END IF;

  flood_result := api_screen_flood(parcel_id);
  soils_result := api_screen_soils(parcel_id);
  wetlands_result := api_screen_wetlands(parcel_id);
  epa_result := api_screen_epa(parcel_id, 1.0);
  traffic_result := api_screen_traffic(parcel_id, 0.5);
  ldeq_result := api_screen_ldeq(parcel_id, 1.0);

  RETURN jsonb_build_object(
    'parcel', jsonb_build_object(
      'id', parcel_info.id,
      'parish', parcel_info.parish,
      'parcel_uid', parcel_info.parcel_uid,
      'owner_name', parcel_info.owner_name,
      'situs_address', parcel_info.situs_address,
      'acreage', parcel_info.acreage,
      'lat', parcel_info.lat,
      'lng', parcel_info.lng
    ),
    'flood', flood_result,
    'soils', soils_result,
    'wetlands', wetlands_result,
    'epa', epa_result,
    'traffic', traffic_result,
    'ldeq', ldeq_result
  );
END;
$$;
```

If any of these tables don't exist (`fema_flood`, `soils`, `wetlands`, `epa_facilities`, `traffic_counts`, `ldeq_permits`), the functions will still install but return empty results for those screens. The `parcels` table with `geom` column is required.

---

## Step 2: Copy Updated main.py to Windows Backend

On the Windows machine, replace the gateway's `main.py`:

```powershell
# From the gpc-cres repo (wherever you have it cloned on Windows):
cd C:\gpc-cres-backend

# Back up the current file
copy gateway\main.py gateway\main.py.bak

# Copy the new file from the repo
# Option A: If you have the repo cloned on Windows:
copy C:\Users\Blake\Documents\gpc-cres\infra\local-api\main.py gateway\main.py

# Option B: Download directly from GitHub (after merge):
curl -o gateway\main.py https://raw.githubusercontent.com/blakegallagher1/gpc-cres/main/infra/local-api/main.py
```

If your docker-compose mounts `main.py` from a specific path, make sure you copy to that path. Check your `docker-compose.yml` for the volume mount, e.g.:

```yaml
gateway:
  volumes:
    - ./gateway/main.py:/app/main.py
```

---

## Step 3: Restart the Gateway Container

```powershell
cd C:\gpc-cres-backend
docker compose restart gateway
```

Wait a few seconds for the container to restart, then check logs:

```powershell
docker compose logs gateway --tail 20
```

You should see:
```
Property DB pool created
Application DB pool created
```

---

## Step 4: Verify New Endpoints

Test each new endpoint from the Windows machine or any machine with network access:

```powershell
# Health check (no auth)
curl https://api.gallagherpropco.com/health

# Flood screening
curl -X POST https://api.gallagherpropco.com/tools/screen.flood ^
-H "Authorization: Bearer YOUR_GATEWAY_API_KEY" ^
  -H "Content-Type: application/json" ^
  -d "{\"parcel_id\":\"016-1466-5\"}"

# EPA screening (with radius)
curl -X POST https://api.gallagherpropco.com/tools/screen.epa ^
-H "Authorization: Bearer YOUR_GATEWAY_API_KEY" ^
  -H "Content-Type: application/json" ^
  -d "{\"parcel_id\":\"016-1466-5\", \"radius_miles\": 1.0}"

# Full screening (all 6 screens combined)
curl -X POST https://api.gallagherpropco.com/tools/screen.full ^
-H "Authorization: Bearer YOUR_GATEWAY_API_KEY" ^
  -H "Content-Type: application/json" ^
  -d "{\"parcel_id\":\"016-1466-5\"}"
```

Expected responses:
- `{"ok": true, "data": {"parcel_id": "...", "flood_zones": [...], "in_sfha": false}}` for flood
- `{"ok": true, "data": {"parcel_id": "...", "radius_miles": 1.0, "facilities": [...], "count": N}}` for EPA
- `{"ok": true, "data": {"parcel": {...}, "flood": {...}, "soils": {...}, ...}}` for full

If a screening table doesn't exist (e.g., no `fema_flood` table), the RPC function will return an error or empty result — that's expected until you populate those tables.

---

## Step 5: Verify from Mac Dev Environment

From the Mac (where the Entitlement OS dev server runs):

```bash
# Test flood screening via production gateway
curl -s -X POST https://api.gallagherpropco.com/tools/screen.flood \
-H "Authorization: Bearer YOUR_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"parcel_id":"016-1466-5"}'

# Test full screening
curl -s -X POST https://api.gallagherpropco.com/tools/screen.full \
-H "Authorization: Bearer YOUR_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"parcel_id":"016-1466-5"}'
```

---

## Existing Endpoints (Unchanged)

These endpoints continue to work as before:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /health` | GET | Public health check |
| `GET /deals` | GET | List deals (requires Bearer + org_id param) |
| `POST /deals` | POST | Create deal (requires Bearer + X-Org-Id/X-User-Id) |
| `PATCH /deals` | PATCH | Bulk deal actions |
| `GET /tiles/{z}/{x}/{y}.pbf` | GET | Martin tile proxy |
| `POST /tools/parcel.lookup` | POST | Parcel detail lookup |
| `POST /tools/parcel.bbox` | POST | Bounding box parcel search |
| `GET /api/parcels/search` | GET | Text search parcels |
| `GET /api/parcels/{id}` | GET | Get parcel by ID |
| `GET /api/parcels/{id}/geometry` | GET | Get parcel GeoJSON |
| `GET /api/stats` | GET | Database statistics |

---

## Rollback

If something breaks:

```powershell
cd C:\gpc-cres-backend
copy gateway\main.py.bak gateway\main.py
docker compose restart gateway
```

---

## Architecture Reminder

```
Mac (Vercel dev / gallagherpropco.com)
  |
  | HTTPS + Bearer token
  v
Cloudflare Edge
  |
  | Tunnel (QUIC)
  v
Windows 11 (Docker Compose)
  |
  +-- gateway:8000 (FastAPI) -- main.py with /tools/screen.* endpoints
  |     |
  |     +-- localhost:5432 (entitlement_os) -- screening RPC functions
  |     +-- localhost:5432 (entitlement_os) -- deals/orgs
  |
  +-- martin:3000 (vector tiles)
  +-- qdrant:6333 (vector search)

Postgres 5432 is NEVER exposed to the internet.
```
