-- =============================================================================
-- Entitlement OS DB — Observability, Materialized Views, Vector Tiles
-- Target: yjddspdbxuseowxndrak (Entitlement OS Supabase)
-- Run via Supabase MCP or SQL Editor.
-- =============================================================================

-- 0. ebr_parcels table (for load_ebr_parcels.ts and mv_parcel_intelligence)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS ebr_parcels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id text NOT NULL UNIQUE,
  address text,
  area_sqft numeric,
  owner text,
  assessed_value numeric,
  geom geometry(Geometry, 4326),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ebr_parcels_geom ON ebr_parcels USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_ebr_parcels_parcel_id ON ebr_parcels (parcel_id);

-- 1. Observability: pg_stat_statements for slow query detection
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Log queries > 500ms (catch expensive PostGIS/MVT). Supabase may require
-- dashboard config: Settings > Database > Log settings.
DO $$
BEGIN
  PERFORM set_config('log_min_duration_statement', '500', false);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM set_config('log_checkpoints', 'on', false);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM set_config('log_lock_waits', 'on', false);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Materialized View: Pre-computed parcel intelligence (sub-100ms AI tool queries)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_parcel_intelligence AS
SELECT
  p.id,
  p.parcel_id,
  p.address,
  p.area_sqft,
  p.owner,
  p.assessed_value,
  p.geom,
  ST_Centroid(p.geom) AS centroid,
  ST_XMin(p.geom) AS bbox_minx,
  ST_YMin(p.geom) AS bbox_miny,
  ST_XMax(p.geom) AS bbox_maxx,
  ST_YMax(p.geom) AS bbox_maxy
FROM ebr_parcels p
WHERE p.geom IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_parcel_intelligence_parcel_id
  ON mv_parcel_intelligence (parcel_id);
CREATE INDEX IF NOT EXISTS idx_mv_parcel_intelligence_geom
  ON mv_parcel_intelligence USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_mv_parcel_intelligence_centroid
  ON mv_parcel_intelligence USING gist (centroid);

-- 3. pg_cron: nightly refresh at 3:00 AM UTC
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- Idempotent: unschedule first, then schedule
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-mv-parcel-intelligence');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'refresh-mv-parcel-intelligence',
  '0 3 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_parcel_intelligence$$
);

-- 4. ST_AsMVT RPC for vector tiles
CREATE OR REPLACE FUNCTION get_parcel_mvt(z int, x int, y int)
RETURNS bytea
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $$
DECLARE
  tile_extent geometry;
  tile_bbox_4326 geometry;
  result bytea;
BEGIN
  IF z < 10 THEN
    RETURN NULL;
  END IF;

  tile_extent := ST_TileEnvelope(z, x, y);
  tile_bbox_4326 := ST_Transform(tile_extent::geometry, 4326);

  SELECT ST_AsMVT(tile, 'parcels', 4096, 'geom')::bytea INTO result
  FROM (
    SELECT
      parcel_id,
      address,
      area_sqft,
      owner,
      assessed_value,
      ST_AsMVTGeom(
        ST_Transform(ST_CurveToLine(geom), 3857),
        tile_extent::geometry,
        4096,
        256,
        true
      ) AS geom
    FROM mv_parcel_intelligence
    WHERE geom IS NOT NULL
      AND ST_Intersects(geom, tile_bbox_4326)
  ) tile;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION get_parcel_mvt(int, int, int) IS
  'Returns Mapbox Vector Tile (.pbf) of parcel boundaries. Use DATABASE_URL on port 6543 (Supavisor) for serverless.';
