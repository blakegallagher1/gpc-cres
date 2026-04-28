-- Environmental screening materialization
-- Spatial joins: FEMA flood, soils, wetlands, EPA facilities → parcel-level facts

BEGIN;

TRUNCATE property.parcel_environmental_screening;

-- Build temporary centroid table for faster joins
CREATE TEMP TABLE tmp_parcel_centroids AS
SELECT id AS parcel_id, ST_PointOnSurface(geom) AS pt, area_sqft, geom
FROM public.ebr_parcels
WHERE geom IS NOT NULL;

CREATE INDEX ON tmp_parcel_centroids USING gist (pt);
CREATE INDEX ON tmp_parcel_centroids USING gist (geom);

-- FEMA flood zone by centroid (most common zone for each parcel)
CREATE TEMP TABLE tmp_flood AS
SELECT DISTINCT ON (pc.parcel_id)
    pc.parcel_id,
    ff.zone AS fema_flood_zone,
    ff.bfe AS base_flood_elevation,
    (ff.zone IN ('AE', 'A', 'AO', 'AH', 'VE', 'V')) AS floodplain_flag,
    (ff.zone = 'FLOODWAY' OR ff.zone ILIKE '%floodway%') AS floodway_flag
FROM tmp_parcel_centroids pc
JOIN public.fema_flood ff ON ST_Intersects(pc.pt, ff.geom)
ORDER BY pc.parcel_id,
    CASE ff.zone
        WHEN 'FLOODWAY' THEN 1
        WHEN 'AE' THEN 2
        WHEN 'A' THEN 3
        WHEN 'AO' THEN 4
        WHEN 'AH' THEN 5
        WHEN 'VE' THEN 6
        WHEN 'X' THEN 7
        ELSE 6
    END;

-- Soils by centroid
CREATE TEMP TABLE tmp_soils AS
SELECT DISTINCT ON (pc.parcel_id)
    pc.parcel_id,
    s.drainage_class AS soil_type,
    (COALESCE(s.hydric_rating, '') ILIKE '%yes%' OR COALESCE(s.hydric_rating, '') ILIKE '%all hydric%') AS soil_hydric_flag
FROM tmp_parcel_centroids pc
JOIN public.soils s ON ST_Intersects(pc.pt, s.geom)
ORDER BY pc.parcel_id, s.id;

-- Wetlands: flag + area percentage
CREATE TEMP TABLE tmp_wetlands AS
SELECT
    pc.parcel_id,
    true AS wetlands_flag,
    LEAST(
        ROUND(
            (SUM(ST_Area(ST_Intersection(pc.geom, w.geom)::geography)) /
             NULLIF(MAX(ST_Area(pc.geom::geography)), 0) * 100)::NUMERIC,
        2),
    100) AS wetlands_area_pct
FROM tmp_parcel_centroids pc
JOIN public.wetlands w ON ST_Intersects(pc.geom, w.geom)
GROUP BY pc.parcel_id;

-- EPA facilities within ~500m of centroid (using ~0.005 degree bbox for speed)
CREATE TEMP TABLE tmp_epa AS
SELECT
    pc.parcel_id,
    COUNT(*) AS epa_facility_count_500m,
    SUM(CASE WHEN e.violations_last_3yr > 0 THEN 1 ELSE 0 END) > 0 AS epa_violation_nearby_flag
FROM tmp_parcel_centroids pc
JOIN public.epa_facilities e ON e.geom IS NOT NULL
    AND ST_DWithin(pc.pt, e.geom, 0.005)
GROUP BY pc.parcel_id;

-- Combine into final screening table
INSERT INTO property.parcel_environmental_screening (
    parcel_id, fema_flood_zone, floodplain_flag, floodway_flag, base_flood_elevation,
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
LEFT JOIN tmp_soils ts ON ts.parcel_id = pc.parcel_id
LEFT JOIN tmp_wetlands tw ON tw.parcel_id = pc.parcel_id
LEFT JOIN tmp_epa te ON te.parcel_id = pc.parcel_id;

DROP TABLE tmp_parcel_centroids;
DROP TABLE tmp_flood;
DROP TABLE tmp_soils;
DROP TABLE tmp_wetlands;
DROP TABLE tmp_epa;

COMMIT;
