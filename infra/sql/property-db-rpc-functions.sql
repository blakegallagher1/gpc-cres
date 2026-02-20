-- =============================================================================
-- Louisiana Property Database — RPC Functions for Agent Tools
-- Target: yjddspdbxuseowxndrak.supabase.co (gpc-dashboard)
-- Run this in the Supabase SQL Editor for the gpc-dashboard project.
-- =============================================================================

-- Drop existing functions to allow signature changes
DROP FUNCTION IF EXISTS api_search_parcels(text, text, int);
DROP FUNCTION IF EXISTS api_get_parcel(uuid);
DROP FUNCTION IF EXISTS api_screen_flood(uuid);
DROP FUNCTION IF EXISTS api_screen_soils(uuid);
DROP FUNCTION IF EXISTS api_screen_wetlands(uuid);
DROP FUNCTION IF EXISTS api_screen_epa(uuid, double precision);
DROP FUNCTION IF EXISTS api_screen_traffic(uuid, double precision);
DROP FUNCTION IF EXISTS api_screen_ldeq(uuid, double precision);
DROP FUNCTION IF EXISTS api_screen_full(uuid);

-- 1. Search Parcels
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
  FROM parcels p
  JOIN v_parcel_search v ON v.id = p.id
  WHERE v.search_text ILIKE '%' || api_search_parcels.search_text || '%'
    AND (api_search_parcels.parish IS NULL OR p.parish ILIKE '%' || api_search_parcels.parish || '%')
  LIMIT api_search_parcels.limit_rows;
$$;

-- 2. Get Parcel by ID (full details without geometry)
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
  ingested_at timestamptz
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
    p.ingested_at
  FROM parcels p
  WHERE p.id = parcel_id;
$$;

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

-- Grant execute to anon and authenticated roles (full signatures)
GRANT EXECUTE ON FUNCTION api_search_parcels(text, text, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_get_parcel(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_screen_flood(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_screen_soils(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_screen_wetlands(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_screen_epa(uuid, double precision) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_screen_traffic(uuid, double precision) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_screen_ldeq(uuid, double precision) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_screen_full(uuid) TO anon, authenticated, service_role;

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
