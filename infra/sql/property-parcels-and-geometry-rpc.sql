-- =============================================================================
-- Property Parcels View + Geometry RPC for Map Polygon Shapes
-- Target: yjddspdbxuseowxndrak.supabase.co (gpc-dashboard)
-- Prereqs: ebr_parcels table populated.
-- Run in Supabase SQL Editor. Then run property-db-rpc-functions.sql (adapted).
-- =============================================================================

-- 1. Create property schema and parcels view (maps ebr_parcels to RPC-expected shape)
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
  p.created_at AS ingested_at
FROM public.ebr_parcels p
WHERE p.geom IS NOT NULL;

-- 2. Search view for api_search_parcels
CREATE OR REPLACE VIEW property.v_parcel_search AS
SELECT
  p.id,
  lower(concat_ws(' ',
    p.parcel_id,
    coalesce(p.address, ''),
    coalesce(p.owner, '')
  )) AS search_text
FROM public.ebr_parcels p;

CREATE INDEX IF NOT EXISTS idx_ebr_parcels_parcel_id_lower
  ON public.ebr_parcels (lower(parcel_id));
CREATE INDEX IF NOT EXISTS idx_ebr_parcels_address_gin
  ON public.ebr_parcels USING gin (to_tsvector('simple', coalesce(address, '')));
CREATE INDEX IF NOT EXISTS idx_ebr_parcels_owner_gin
  ON public.ebr_parcels USING gin (to_tsvector('simple', coalesce(owner, '')));

-- 3. api_search_parcels (uses property.parcels)
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

-- 4. api_get_parcel by uuid
DROP FUNCTION IF EXISTS api_get_parcel(uuid);
CREATE OR REPLACE FUNCTION api_get_parcel(parcel_id uuid)
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
  WHERE p.id = api_get_parcel.parcel_id;
$$;

-- 5. api_get_parcel by text (parcel_uid or parcel_id)
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

-- 6. rpc_get_parcel_geometry — returns geom for map polygon shapes
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
      ELSE 0.0001
    END))::text AS geom_simplified,
    ARRAY[ST_XMin(p.geom), ST_YMin(p.geom), ST_XMax(p.geom), ST_YMax(p.geom)] AS bbox,
    jsonb_build_object(
      'lat', ST_Y(ST_Centroid(p.geom)),
      'lng', ST_X(ST_Centroid(p.geom))
    ) AS centroid,
    coalesce(p.area_sqft, (ST_Area(p.geom::geography) * 10.764)::numeric) AS area_sqft,
    4326 AS srid,
    'property_db_ebr'::text AS dataset_version
  FROM public.ebr_parcels p
  WHERE p.id::text = rpc_get_parcel_geometry.parcel_id
     OR p.parcel_id = rpc_get_parcel_geometry.parcel_id
     OR lower(p.parcel_id) = lower(rpc_get_parcel_geometry.parcel_id)
     OR replace(p.parcel_id, '-', '') = replace(rpc_get_parcel_geometry.parcel_id, '-', '')
  LIMIT 1;
$$;

GRANT USAGE ON SCHEMA property TO anon, authenticated, service_role;
GRANT SELECT ON property.parcels TO anon, authenticated, service_role;
GRANT SELECT ON property.v_parcel_search TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_search_parcels(text, text, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_get_parcel(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_get_parcel(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_get_parcel_geometry(text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
