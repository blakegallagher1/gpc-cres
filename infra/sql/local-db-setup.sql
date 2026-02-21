-- =============================================================================
-- LOCAL POSTGRESQL SETUP FOR MAP TILES
-- Target: postgresql://postgres:Nola0528!@localhost:5432/cres_db
-- Purpose: High-performance parcel geometry + vector tiles for 12-core i7
-- =============================================================================

-- STEP 1: Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- STEP 2: Create ebr_parcels table (if not exists)
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

-- STEP 3: Create spatial indexes for high-performance queries
CREATE INDEX IF NOT EXISTS idx_ebr_parcels_geom
  ON ebr_parcels USING gist (geom);

CREATE INDEX IF NOT EXISTS idx_ebr_parcels_parcel_id
  ON ebr_parcels (parcel_id);

CREATE INDEX IF NOT EXISTS idx_ebr_parcels_address_trgm
  ON ebr_parcels USING gin (address gin_trgm_ops);

-- STEP 4: Create materialized view for sub-100ms queries
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

-- STEP 5: Create indexes on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_parcel_intelligence_id
  ON mv_parcel_intelligence (id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_parcel_intelligence_parcel_id
  ON mv_parcel_intelligence (parcel_id);

CREATE INDEX IF NOT EXISTS idx_mv_parcel_intelligence_geom
  ON mv_parcel_intelligence USING gist (geom);

CREATE INDEX IF NOT EXISTS idx_mv_parcel_intelligence_centroid
  ON mv_parcel_intelligence USING gist (centroid);

-- STEP 6: Vector tile function (Mapbox Vector Tile generation)
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
  -- Skip rendering at low zoom levels (< 10) for performance
  IF z < 10 THEN
    RETURN NULL;
  END IF;

  -- Calculate tile bounding box
  tile_extent := ST_TileEnvelope(z, x, y);
  tile_bbox_4326 := ST_Transform(tile_extent::geometry, 4326);

  -- Generate MVT using materialized view for performance
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
  'Returns Mapbox Vector Tile (.pbf) of parcel boundaries for map rendering';

-- STEP 7: Property schema for RPC functions (api_search_parcels, etc.)
CREATE SCHEMA IF NOT EXISTS property;

CREATE OR REPLACE VIEW property.parcels AS
SELECT
  p.id,
  'East Baton Rouge'::text AS parish,
  p.parcel_id AS parcel_uid,
  p.owner AS owner_name,
  p.address AS situs_address,
  NULL::text AS legal_desc,
  (p.area_sqft / 43560.0)::numeric AS acreage,
  p.geom,
  'EBR'::text AS source_key,
  p.created_at AS ingested_at,
  p.area_sqft
FROM ebr_parcels p
WHERE p.geom IS NOT NULL;

-- STEP 8: Search view for api_search_parcels
CREATE OR REPLACE VIEW property.v_parcel_search AS
SELECT
  p.id,
  lower(concat_ws(' ',
    p.parcel_id,
    coalesce(p.address, ''),
    coalesce(p.owner, '')
  )) AS search_text
FROM ebr_parcels p;

-- STEP 9: api_search_parcels function
DROP FUNCTION IF EXISTS api_search_parcels(text, text, int);
CREATE OR REPLACE FUNCTION api_search_parcels(
  search_text text,
  parish text DEFAULT NULL,
  limit_rows int DEFAULT 25
)
RETURNS TABLE(
  id uuid,
  parish_name text,
  parcel_uid text,
  owner_name text,
  situs_address text,
  acreage numeric,
  lat double precision,
  lng double precision
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id,
    p.parish AS parish_name,
    p.parcel_uid,
    p.owner_name,
    p.situs_address,
    p.acreage,
    ST_Y(ST_Centroid(p.geom)) AS lat,
    ST_X(ST_Centroid(p.geom)) AS lng
  FROM property.parcels p
  JOIN property.v_parcel_search v ON v.id = p.id
  WHERE (
    (trim(api_search_parcels.search_text) = '*' OR trim(api_search_parcels.search_text) = '')
    OR (
      v.search_text ILIKE '%' || replace(trim(api_search_parcels.search_text), ' ', '%') || '%'
      OR p.parcel_uid ILIKE '%' || api_search_parcels.search_text || '%'
      OR p.situs_address ILIKE '%' || api_search_parcels.search_text || '%'
      OR p.owner_name ILIKE '%' || api_search_parcels.search_text || '%'
    )
  )
  AND (api_search_parcels.parish IS NULL OR p.parish ILIKE '%' || api_search_parcels.parish || '%')
  LIMIT api_search_parcels.limit_rows;
$$;

-- STEP 10: api_get_parcel by text (parcel_uid or parcel_id)
DROP FUNCTION IF EXISTS api_get_parcel(text);
CREATE OR REPLACE FUNCTION api_get_parcel(parcel_id text)
RETURNS TABLE(
  id uuid,
  parish text,
  parcel_uid text,
  owner_name text,
  situs_address text,
  legal_desc text,
  acreage numeric,
  lat double precision,
  lng double precision,
  source_key text,
  ingested_at timestamptz,
  geom_simplified text,
  bbox double precision[]
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id,
    p.parish,
    p.parcel_uid,
    p.owner_name,
    p.situs_address,
    p.legal_desc,
    p.acreage,
    ST_Y(ST_Centroid(p.geom)) AS lat,
    ST_X(ST_Centroid(p.geom)) AS lng,
    p.source_key,
    p.ingested_at,
    ST_AsGeoJSON(p.geom)::text AS geom_simplified,
    ARRAY[ST_XMin(p.geom), ST_YMin(p.geom), ST_XMax(p.geom), ST_YMax(p.geom)] AS bbox
  FROM property.parcels p
  WHERE p.id::text = api_get_parcel.parcel_id
     OR p.parcel_uid = api_get_parcel.parcel_id
     OR lower(p.parcel_uid) = lower(api_get_parcel.parcel_id)
     OR replace(p.parcel_uid, '-', '') = replace(api_get_parcel.parcel_id, '-', '')
  LIMIT 1;
$$;

-- STEP 11: rpc_get_parcel_geometry — for parcel polygon rendering
DROP FUNCTION IF EXISTS rpc_get_parcel_geometry(text, text);
CREATE OR REPLACE FUNCTION rpc_get_parcel_geometry(
  parcel_id text,
  detail_level text DEFAULT 'low'
)
RETURNS TABLE(
  geom_simplified text,
  bbox double precision[],
  centroid jsonb,
  area_sqft numeric,
  srid int,
  dataset_version text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ST_AsGeoJSON(ST_SimplifyPreserveTopology(p.geom, CASE
      WHEN rpc_get_parcel_geometry.detail_level = 'high' THEN 0.00001
      WHEN rpc_get_parcel_geometry.detail_level = 'medium' THEN 0.0001
      ELSE 0.001
    END))::text AS geom_simplified,
    ARRAY[ST_XMin(p.geom), ST_YMin(p.geom), ST_XMax(p.geom), ST_YMax(p.geom)] AS bbox,
    jsonb_build_object(
      'lat', ST_Y(ST_Centroid(p.geom)),
      'lng', ST_X(ST_Centroid(p.geom))
    ) AS centroid,
    coalesce(p.area_sqft, (ST_Area(p.geom::geography) * 10.764)::numeric) AS area_sqft,
    4326 AS srid,
    'local_cres_db'::text AS dataset_version
  FROM ebr_parcels p
  WHERE p.id::text = rpc_get_parcel_geometry.parcel_id
     OR p.parcel_id = rpc_get_parcel_geometry.parcel_id
     OR lower(p.parcel_id) = lower(rpc_get_parcel_geometry.parcel_id)
     OR replace(p.parcel_id, '-', '') = replace(rpc_get_parcel_geometry.parcel_id, '-', '')
  LIMIT 1;
$$;

-- STEP 12: Verify data
DO $$
DECLARE
  parcel_count int;
  geom_count int;
BEGIN
  SELECT COUNT(*) INTO parcel_count FROM ebr_parcels;
  SELECT COUNT(*) INTO geom_count FROM ebr_parcels WHERE geom IS NOT NULL;

  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'SETUP COMPLETE!';
  RAISE NOTICE 'Total parcels: %', parcel_count;
  RAISE NOTICE 'Parcels with geometry: %', geom_count;
  RAISE NOTICE '=================================================================';

  IF geom_count = 0 THEN
    RAISE WARNING 'No parcels have geometry! This will cause map rendering to fail.';
    RAISE WARNING 'Verify your data migration from Supabase included the geom column.';
  END IF;
END $$;
