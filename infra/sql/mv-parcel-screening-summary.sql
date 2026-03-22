-- =============================================================================
-- Parcel Screening Summary Materialized View
-- Target: entitlement-os-postgres (local Docker)
-- Purpose: Pre-join all screening tables for every parcel with geometry
-- Performance: Sub-100ms lookups, refreshed nightly at 2:00 AM UTC
-- =============================================================================

-- 1. Enable required extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Materialized View: mv_parcel_screening_summary
--    LEFT JOINs all screening data so parcels without data still appear
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_parcel_screening_summary AS
WITH flood_agg AS (
  SELECT
    p.parcel_id,
    p.id AS parcel_uuid,
    COUNT(*) AS flood_zone_count,
    COALESCE(
      jsonb_agg(jsonb_build_object(
        'zone', f.zone,
        'bfe', f.bfe,
        'panel_id', f.panel_id,
        'effective_date', f.effective_date,
        'overlap_pct', ROUND((ST_Area(ST_Intersection(f.geom, p.geom)) / NULLIF(ST_Area(p.geom), 0) * 100)::numeric, 1)
      ) ORDER BY f.zone),
      '[]'::jsonb
    ) AS flood_zones,
    EXISTS (
      SELECT 1 FROM fema_flood f2
      WHERE ST_Intersects(f2.geom, p.geom)
        AND f2.zone IN ('A', 'AE', 'AH', 'AO', 'V', 'VE')
    ) AS in_sfha
  FROM ebr_parcels p
  LEFT JOIN fema_flood f ON ST_Intersects(f.geom, p.geom)
  WHERE p.geom IS NOT NULL
  GROUP BY p.id, p.parcel_id
),
soil_agg AS (
  SELECT
    p.parcel_id,
    p.id AS parcel_uuid,
    COUNT(*) AS soil_unit_count,
    COALESCE(
      jsonb_agg(jsonb_build_object(
        'mapunit_key', s.mapunit_key,
        'drainage_class', s.drainage_class,
        'hydric_rating', s.hydric_rating,
        'shrink_swell', s.shrink_swell,
        'overlap_pct', ROUND((ST_Area(ST_Intersection(s.geom, p.geom)) / NULLIF(ST_Area(p.geom), 0) * 100)::numeric, 1)
      ) ORDER BY s.mapunit_key),
      '[]'::jsonb
    ) AS soil_units,
    EXISTS (
      SELECT 1 FROM soils s2
      WHERE ST_Intersects(s2.geom, p.geom)
        AND s2.hydric_rating = 'Yes'
    ) AS has_hydric
  FROM ebr_parcels p
  LEFT JOIN soils s ON ST_Intersects(s.geom, p.geom)
  WHERE p.geom IS NOT NULL
  GROUP BY p.id, p.parcel_id
),
wetland_agg AS (
  SELECT
    p.parcel_id,
    p.id AS parcel_uuid,
    COUNT(*) AS wetland_count,
    COALESCE(
      jsonb_agg(jsonb_build_object(
        'wetland_type', w.wetland_type,
        'overlap_pct', ROUND((ST_Area(ST_Intersection(w.geom, p.geom)) / NULLIF(ST_Area(p.geom), 0) * 100)::numeric, 1)
      ) ORDER BY w.wetland_type),
      '[]'::jsonb
    ) AS wetlands,
    EXISTS (
      SELECT 1 FROM wetlands w2
      WHERE ST_Intersects(w2.geom, p.geom)
    ) AS has_wetlands
  FROM ebr_parcels p
  LEFT JOIN wetlands w ON ST_Intersects(w.geom, p.geom)
  WHERE p.geom IS NOT NULL
  GROUP BY p.id, p.parcel_id
),
epa_agg AS (
  SELECT
    p.parcel_id,
    p.id AS parcel_uuid,
    COUNT(*) AS epa_facility_count,
    COALESCE(
      jsonb_agg(jsonb_build_object(
        'registry_id', e.registry_id,
        'name', e.name,
        'status', e.status,
        'street_address', e.street_address,
        'city', e.city,
        'naics', e.naics,
        'violations_last_3yr', e.violations_last_3yr,
        'penalties_last_3yr', e.penalties_last_3yr,
        'distance_miles', ROUND((ST_Distance(e.geom::geography, ST_Centroid(p.geom)::geography) / 1609.34)::numeric, 2)
      ) ORDER BY ST_Distance(e.geom, ST_Centroid(p.geom))),
      '[]'::jsonb
    ) AS epa_facilities
  FROM ebr_parcels p
  LEFT JOIN epa_facilities e ON ST_DWithin(e.geom::geography, ST_Centroid(p.geom)::geography, 1609.34)
  WHERE p.geom IS NOT NULL
  GROUP BY p.id, p.parcel_id
)
SELECT
  p.id,
  p.parcel_id,
  p.address,
  p.owner,
  p.area_sqft,
  p.assessed_value,
  p.geom,
  ST_Centroid(p.geom) AS centroid,
  -- Flood screening
  COALESCE(f.flood_zone_count, 0) AS flood_zone_count,
  COALESCE(f.flood_zones, '[]'::jsonb) AS flood_zones,
  COALESCE(f.in_sfha, FALSE) AS in_sfha,
  -- Soil screening
  COALESCE(s.soil_unit_count, 0) AS soil_unit_count,
  COALESCE(s.soil_units, '[]'::jsonb) AS soil_units,
  COALESCE(s.has_hydric, FALSE) AS has_hydric,
  -- Wetland screening
  COALESCE(w.wetland_count, 0) AS wetland_count,
  COALESCE(w.wetlands, '[]'::jsonb) AS wetlands,
  COALESCE(w.has_wetlands, FALSE) AS has_wetlands,
  -- EPA screening (1 mile radius)
  COALESCE(e.epa_facility_count, 0) AS epa_facility_count,
  COALESCE(e.epa_facilities, '[]'::jsonb) AS epa_facilities,
  -- Composite screening flags
  (COALESCE(f.in_sfha, FALSE) OR COALESCE(s.has_hydric, FALSE) OR COALESCE(w.has_wetlands, FALSE)) AS has_environmental_constraints,
  (COALESCE(e.epa_facility_count, 0) > 0) AS has_nearby_epa_facilities,
  p.created_at
FROM ebr_parcels p
LEFT JOIN flood_agg f ON p.parcel_id = f.parcel_id
LEFT JOIN soil_agg s ON p.parcel_id = s.parcel_id
LEFT JOIN wetland_agg w ON p.parcel_id = w.parcel_id
LEFT JOIN epa_agg e ON p.parcel_id = e.parcel_id
WHERE p.geom IS NOT NULL;

-- 3. Create indexes on materialized view for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_parcel_screening_summary_parcel_id
  ON mv_parcel_screening_summary (parcel_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_parcel_screening_summary_id
  ON mv_parcel_screening_summary (id);

CREATE INDEX IF NOT EXISTS idx_mv_parcel_screening_summary_centroid
  ON mv_parcel_screening_summary USING gist (centroid);

CREATE INDEX IF NOT EXISTS idx_mv_parcel_screening_summary_geom
  ON mv_parcel_screening_summary USING gist (geom);

CREATE INDEX IF NOT EXISTS idx_mv_parcel_screening_summary_in_sfha
  ON mv_parcel_screening_summary (in_sfha)
  WHERE in_sfha = TRUE;

CREATE INDEX IF NOT EXISTS idx_mv_parcel_screening_summary_has_wetlands
  ON mv_parcel_screening_summary (has_wetlands)
  WHERE has_wetlands = TRUE;

CREATE INDEX IF NOT EXISTS idx_mv_parcel_screening_summary_has_hydric
  ON mv_parcel_screening_summary (has_hydric)
  WHERE has_hydric = TRUE;

CREATE INDEX IF NOT EXISTS idx_mv_parcel_screening_summary_has_epa
  ON mv_parcel_screening_summary (has_nearby_epa_facilities)
  WHERE has_nearby_epa_facilities = TRUE;

-- 4. pg_cron schedule: Refresh at 2:00 AM UTC daily
-- Idempotent: unschedule first, then schedule
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-mv-parcel-screening-summary');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'refresh-mv-parcel-screening-summary',
  '0 2 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_parcel_screening_summary$$
);

-- 5. Success notification
DO $$
BEGIN
  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'Materialized View Created: mv_parcel_screening_summary';
  RAISE NOTICE 'Refresh Schedule: 2:00 AM UTC daily';
  RAISE NOTICE 'Indexes: 8 (parcel_id, id, centroid, geom, 4x screening flags)';
  RAISE NOTICE '=================================================================';
END $$;
