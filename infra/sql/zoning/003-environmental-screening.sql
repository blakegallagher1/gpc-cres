-- Environmental screening materialization
-- Spatial joins: FEMA flood, soils, wetlands, EPA facilities → parcel-level facts

BEGIN;

TRUNCATE property.parcel_environmental_screening;

-- Build temporary centroid table for faster joins
CREATE TEMP TABLE tmp_parcel_centroids AS
SELECT
    id AS parcel_id,
    COALESCE(parcel_id::TEXT, id::TEXT) AS source_parcel_id,
    ST_PointOnSurface(ST_MakeValid(geom)) AS pt,
    area_sqft,
    ST_CollectionExtract(ST_MakeValid(geom), 3) AS geom
FROM public.ebr_parcels
WHERE geom IS NOT NULL;

CREATE INDEX ON tmp_parcel_centroids USING gist (pt);
CREATE INDEX ON tmp_parcel_centroids USING gist (geom);

CREATE TEMP TABLE tmp_fema_flood_valid AS
SELECT
    zone,
    bfe,
    ST_Subdivide(ST_CollectionExtract(ST_MakeValid(geom), 3), 256) AS geom
FROM public.fema_flood
WHERE parish ILIKE 'East Baton Rouge'
  AND geom IS NOT NULL
  AND NOT ST_IsEmpty(ST_CollectionExtract(ST_MakeValid(geom), 3));

CREATE TEMP TABLE tmp_wetlands_valid AS
SELECT
    id,
    ST_Subdivide(ST_CollectionExtract(ST_MakeValid(geom), 3), 256) AS geom
FROM public.wetlands
WHERE parish ILIKE 'East Baton Rouge'
  AND geom IS NOT NULL
  AND NOT ST_IsEmpty(ST_CollectionExtract(ST_MakeValid(geom), 3));

CREATE INDEX ON tmp_fema_flood_valid USING gist (geom);
CREATE INDEX ON tmp_wetlands_valid USING gist (geom);

-- FEMA flood zone by centroid (most common zone for each parcel)
CREATE TEMP TABLE tmp_flood AS
SELECT DISTINCT ON (pc.parcel_id)
    pc.parcel_id,
    COALESCE(ff.zone, ae.flood_zone) AS fema_flood_zone,
    ff.bfe AS base_flood_elevation,
    (COALESCE(ff.zone, ae.flood_zone) IN ('AE', 'A', 'AO', 'AH', 'VE', 'V')) AS floodplain_flag,
    (COALESCE(ff.zone, ae.flood_zone) = 'FLOODWAY' OR COALESCE(ff.zone, ae.flood_zone) ILIKE '%floodway%') AS floodway_flag
FROM tmp_parcel_centroids pc
LEFT JOIN tmp_fema_flood_valid ff
    ON ff.geom && pc.pt
    AND ST_Intersects(pc.pt, ff.geom)
LEFT JOIN property.parcel_assessor_enrichment ae
    ON ae.parish = 'East Baton Rouge'
    AND ae.parcel_id = pc.source_parcel_id
    AND ae.flood_zone IS NOT NULL
WHERE ff.zone IS NOT NULL OR ae.flood_zone IS NOT NULL
ORDER BY pc.parcel_id,
    CASE COALESCE(ff.zone, ae.flood_zone)
        WHEN 'FLOODWAY' THEN 1
        WHEN 'AE' THEN 2
        WHEN 'A' THEN 3
        WHEN 'AO' THEN 4
        WHEN 'AH' THEN 5
        WHEN 'VE' THEN 6
        WHEN 'X' THEN 7
        ELSE 6
    END;

CREATE TEMP TABLE tmp_flood_area AS
SELECT
    pc.parcel_id,
    ROUND((SUM(ST_Area(ST_Intersection(pc.geom, ST_CollectionExtract(ST_MakeValid(ff.geom), 3)))) / NULLIF(ST_Area(pc.geom), 0) * 100)::NUMERIC, 2) AS percent_parcel_in_flood
FROM tmp_parcel_centroids pc
JOIN tmp_fema_flood_valid ff
    ON ff.zone IN ('AE', 'A', 'AO', 'AH', 'VE', 'V', 'FLOODWAY')
    AND ff.geom && pc.geom
    AND ST_Intersects(pc.geom, ff.geom)
GROUP BY pc.parcel_id, pc.geom;

-- Soils by centroid
CREATE TEMP TABLE tmp_soils AS
SELECT DISTINCT ON (pc.parcel_id)
    pc.parcel_id,
    s.drainage_class AS soil_type,
    (COALESCE(s.hydric_rating, '') ILIKE '%yes%' OR COALESCE(s.hydric_rating, '') ILIKE '%all hydric%') AS soil_hydric_flag
FROM tmp_parcel_centroids pc
JOIN public.soils s
    ON s.parish ILIKE 'East Baton Rouge'
    AND s.geom && pc.pt
    AND ST_Intersects(pc.pt, s.geom)
ORDER BY pc.parcel_id, s.id;

CREATE TEMP TABLE tmp_wetlands AS
SELECT
    pc.parcel_id,
    true AS wetlands_flag,
    ROUND((SUM(ST_Area(ST_Intersection(pc.geom, ST_CollectionExtract(ST_MakeValid(w.geom), 3)))) / NULLIF(ST_Area(pc.geom), 0) * 100)::NUMERIC, 2) AS wetlands_area_pct
FROM tmp_parcel_centroids pc
JOIN tmp_wetlands_valid w
    ON w.geom && pc.geom
    AND ST_Intersects(pc.geom, w.geom)
GROUP BY pc.parcel_id, pc.geom;

-- EPA facilities within 500m of centroid. Use bbox prefilter for the GiST index
-- and geography distance for the actual meter-based measurement.
CREATE TEMP TABLE tmp_epa AS
SELECT
    pc.parcel_id,
    COUNT(*) AS epa_facility_count_500m,
    SUM(CASE WHEN e.violations_last_3yr > 0 THEN 1 ELSE 0 END) > 0 AS epa_violation_nearby_flag
FROM tmp_parcel_centroids pc
JOIN public.epa_facilities e ON e.geom IS NOT NULL
    AND e.parish ILIKE 'East Baton Rouge'
    AND e.geom && ST_Expand(pc.pt, 0.006)
    AND ST_DWithin(pc.pt::geography, e.geom::geography, 500)
GROUP BY pc.parcel_id;

-- Combine into final screening table
INSERT INTO property.parcel_environmental_screening (
    parcel_id, fema_flood_zone, floodplain_flag, floodway_flag, base_flood_elevation,
    percent_parcel_in_flood,
    soil_type, soil_hydric_flag,
    wetlands_flag, wetlands_area_pct,
    epa_facility_nearby_flag, epa_facility_count_500m, epa_violation_nearby_flag,
    drainage_risk_score, computed_at
)
SELECT
    pc.parcel_id,
    tf.fema_flood_zone,
    COALESCE(tf.floodplain_flag, false),
    COALESCE(tf.floodway_flag, false),
    tf.base_flood_elevation,
    fa.percent_parcel_in_flood,
    ts.soil_type,
    COALESCE(ts.soil_hydric_flag, false),
    COALESCE(tw.wetlands_flag, false),
    tw.wetlands_area_pct,
    COALESCE(te.epa_facility_count_500m > 0, false),
    COALESCE(te.epa_facility_count_500m, 0),
    COALESCE(te.epa_violation_nearby_flag, false),
    -- Drainage risk score (0-100): weighted combination of flood, hydric soil, wetlands
    LEAST(100, ROUND((
        CASE WHEN tf.floodway_flag THEN 50
             WHEN tf.floodplain_flag THEN 30
             WHEN tf.fema_flood_zone = 'X' THEN 0
             WHEN tf.fema_flood_zone IS NOT NULL THEN 15
             ELSE 0 END
        + CASE WHEN ts.soil_hydric_flag THEN 20 ELSE 0 END
        + CASE WHEN tw.wetlands_area_pct > 50 THEN 30
               WHEN tw.wetlands_area_pct > 10 THEN 15
               WHEN tw.wetlands_flag THEN 5
               ELSE 0 END
    )::NUMERIC, 2)),
    now()
FROM tmp_parcel_centroids pc
LEFT JOIN tmp_flood tf ON tf.parcel_id = pc.parcel_id
LEFT JOIN tmp_flood_area fa ON fa.parcel_id = pc.parcel_id
LEFT JOIN tmp_soils ts ON ts.parcel_id = pc.parcel_id
LEFT JOIN tmp_wetlands tw ON tw.parcel_id = pc.parcel_id
LEFT JOIN tmp_epa te ON te.parcel_id = pc.parcel_id;

DROP TABLE IF EXISTS tmp_parcel_centroids;
DROP TABLE IF EXISTS tmp_flood;
DROP TABLE IF EXISTS tmp_flood_area;
DROP TABLE IF EXISTS tmp_soils;
DROP TABLE IF EXISTS tmp_wetlands;
DROP TABLE IF EXISTS tmp_fema_flood_valid;
DROP TABLE IF EXISTS tmp_wetlands_valid;
DROP TABLE IF EXISTS tmp_epa;

COMMIT;
