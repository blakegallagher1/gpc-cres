-- Zoning code mapping + parcel zoning screening materialization
-- Handles split-zoned parcels (comma-separated zoning_type values)

BEGIN;

-- Step 1: Build the code mapping from parcel zoning_type to normalized district codes
TRUNCATE property.zoning_code_mapping;

-- Extract all distinct individual zoning codes from comma-separated zoning_type
WITH raw_codes AS (
    SELECT DISTINCT TRIM(unnest(string_to_array(zoning_type, ','))) AS raw_code
    FROM public.ebr_parcels
    WHERE zoning_type IS NOT NULL AND zoning_type != ''
)
INSERT INTO property.zoning_code_mapping (raw_code, normalized_code, district_code, mapped)
SELECT
    rc.raw_code,
    -- Normalize: uppercase dashes/slashes to underscores, lowercase
    LOWER(REPLACE(REPLACE(REPLACE(rc.raw_code, '-', '_'), '/', '_'), '.', '_')) AS normalized_code,
    zd.district_code,
    (zd.district_code IS NOT NULL) AS mapped
FROM raw_codes rc
LEFT JOIN property.zoning_districts zd
    ON LOWER(REPLACE(REPLACE(REPLACE(rc.raw_code, '-', '_'), '/', '_'), '.', '_')) = zd.district_code
ON CONFLICT (raw_code, normalized_code) DO UPDATE SET
    district_code = EXCLUDED.district_code,
    mapped = EXCLUDED.mapped;

-- Handle special mappings that don't normalize cleanly
-- A2.5 -> a2_5 (dots become underscores)
-- RE/A1 -> re_a1 (slash becomes underscore)
-- C-AB-1 -> c_ab_1 (dashes become underscores)
-- These should already work with the normalization above, but let's check for any unmapped

-- Step 2: Log unmapped codes for visibility
DO $$
DECLARE
    unmapped_count INT;
BEGIN
    SELECT COUNT(*) INTO unmapped_count FROM property.zoning_code_mapping WHERE mapped = false;
    RAISE NOTICE 'Unmapped zoning codes: %', unmapped_count;
END $$;

COMMIT;

-- Step 3: Materialize parcel zoning screening
BEGIN;

TRUNCATE property.parcel_zoning_screening;

-- Parse each parcel's zoning_type, map to district, join dimensional standards and use permissions
INSERT INTO property.parcel_zoning_screening (
    parcel_id, zoning_code, zoning_label, zoning_category, zoning_group,
    zoning_split_flag, zoning_codes_all,
    min_lot_area_sf, min_lot_width_ft,
    setback_front_ft, setback_side_ft, setback_corner_side_ft, setback_rear_ft,
    max_height_ft, max_density_du_ac,
    conforming_lot_area_flag, conforming_width_flag,
    theoretical_lot_split_count, theoretical_unit_count_by_right,
    residential_allowed_flag, multifamily_allowed_flag,
    commercial_allowed_flag, industrial_allowed_flag,
    warehouse_allowed_flag, mixed_use_possible_flag,
    c5_no_parking_flag,
    computed_at
)
WITH parsed AS (
    -- For each parcel, extract the primary (first) zoning code
    SELECT
        p.id AS parcel_id,
        p.zoning_type,
        p.area_sqft,
        TRIM(SPLIT_PART(p.zoning_type, ',', 1)) AS primary_raw_code,
        ARRAY(
            SELECT TRIM(x)
            FROM unnest(string_to_array(p.zoning_type, ',')) AS x
            WHERE TRIM(x) != ''
        ) AS all_codes,
        (POSITION(',' IN COALESCE(p.zoning_type, '')) > 0) AS is_split
    FROM public.ebr_parcels p
    WHERE p.zoning_type IS NOT NULL AND p.zoning_type != ''
),
mapped AS (
    SELECT
        pa.*,
        zcm.district_code
    FROM parsed pa
    LEFT JOIN property.zoning_code_mapping zcm
        ON TRIM(pa.primary_raw_code) = zcm.raw_code
        AND zcm.mapped = true
)
SELECT
    m.parcel_id,
    COALESCE(zd.district_code, LOWER(m.primary_raw_code)) AS zoning_code,
    zd.label AS zoning_label,
    zd.category AS zoning_category,
    zd.zoning_group,
    m.is_split AS zoning_split_flag,
    m.all_codes AS zoning_codes_all,
    -- Dimensional standards (prefer 'general' type, fall back to first available)
    ds.min_lot_area_sf,
    ds.min_lot_width_ft,
    ds.setback_front_ft,
    ds.setback_side_ft,
    ds.setback_corner_side_ft,
    ds.setback_rear_ft,
    ds.max_height_ft,
    ds.max_density_du_ac,
    -- Conforming flags
    CASE WHEN ds.min_lot_area_sf IS NOT NULL AND m.area_sqft IS NOT NULL
         THEN m.area_sqft >= ds.min_lot_area_sf ELSE NULL END AS conforming_lot_area_flag,
    -- Width conformance: estimate lot width as sqrt(area) * 0.7 (rough rectangle heuristic)
    CASE WHEN ds.min_lot_width_ft IS NOT NULL AND m.area_sqft IS NOT NULL
         THEN (SQRT(m.area_sqft) * 0.7) >= ds.min_lot_width_ft ELSE NULL END AS conforming_width_flag,
    -- Theoretical lot split count (area-based only)
    CASE WHEN ds.min_lot_area_sf IS NOT NULL AND ds.min_lot_area_sf > 0 AND m.area_sqft IS NOT NULL
         THEN GREATEST(FLOOR(m.area_sqft / ds.min_lot_area_sf)::INT, 1) ELSE NULL END AS theoretical_lot_split_count,
    -- Theoretical unit count by right
    CASE WHEN ds.max_density_du_ac IS NOT NULL AND m.area_sqft IS NOT NULL
         THEN FLOOR(m.area_sqft / 43560.0 * ds.max_density_du_ac)::INT ELSE NULL END AS theoretical_unit_count_by_right,
    -- Use permission flags
    EXISTS (SELECT 1 FROM property.zoning_use_permissions up
            WHERE up.district_code = m.district_code
            AND up.use_key IN ('single_family_detached', 'two_family', 'semi_detached', 'zero_lot_line', 'townhome')
            AND up.permission_code IN ('P', 'L')) AS residential_allowed_flag,
    EXISTS (SELECT 1 FROM property.zoning_use_permissions up
            WHERE up.district_code = m.district_code
            AND up.use_key = 'multifamily'
            AND up.permission_code IN ('P', 'L')) AS multifamily_allowed_flag,
    EXISTS (SELECT 1 FROM property.zoning_use_permissions up
            WHERE up.district_code = m.district_code
            AND up.use_key IN ('retail_sales', 'office', 'restaurant_with_alcohol', 'restaurant_without_alcohol', 'bank', 'personal_service', 'convenience_store')
            AND up.permission_code IN ('P', 'L')) AS commercial_allowed_flag,
    EXISTS (SELECT 1 FROM property.zoning_use_permissions up
            WHERE up.district_code = m.district_code
            AND up.use_key IN ('assembly_furniture_electronics', 'assembly_manufactured_parts', 'foundry', 'concrete_batching_mixing', 'food_processing')
            AND up.permission_code IN ('P', 'L')) AS industrial_allowed_flag,
    EXISTS (SELECT 1 FROM property.zoning_use_permissions up
            WHERE up.district_code = m.district_code
            AND up.use_key IN ('warehouse', 'office_warehouse', 'self_storage', 'wholesale_sales', 'cold_storage', 'freight_terminal')
            AND up.permission_code IN ('P', 'L')) AS warehouse_allowed_flag,
    -- Mixed use: both residential and commercial allowed
    (EXISTS (SELECT 1 FROM property.zoning_use_permissions up
             WHERE up.district_code = m.district_code
             AND up.use_key IN ('single_family_detached', 'multifamily', 'townhome')
             AND up.permission_code IN ('P', 'L'))
     AND EXISTS (SELECT 1 FROM property.zoning_use_permissions up
                 WHERE up.district_code = m.district_code
                 AND up.use_key IN ('retail_sales', 'office', 'restaurant_with_alcohol', 'restaurant_without_alcohol')
                 AND up.permission_code IN ('P', 'L'))) AS mixed_use_possible_flag,
    -- C5 no parking
    (COALESCE(zd.district_code, '') = 'c5') AS c5_no_parking_flag,
    now() AS computed_at
FROM mapped m
LEFT JOIN property.zoning_districts zd ON zd.district_code = m.district_code
LEFT JOIN LATERAL (
    SELECT * FROM property.zoning_dimensional_standards s
    WHERE s.district_code = m.district_code
    ORDER BY CASE s.standard_type
        WHEN 'general' THEN 1
        WHEN 'single_family' THEN 2
        WHEN 'residential' THEN 3
        WHEN 'nonresidential' THEN 4
        WHEN 'townhouse' THEN 5
        WHEN 'multifamily' THEN 6
        ELSE 7 END
    LIMIT 1
) ds ON true
ON CONFLICT (parcel_id) DO UPDATE SET
    zoning_code = EXCLUDED.zoning_code,
    zoning_label = EXCLUDED.zoning_label,
    zoning_category = EXCLUDED.zoning_category,
    zoning_group = EXCLUDED.zoning_group,
    zoning_split_flag = EXCLUDED.zoning_split_flag,
    zoning_codes_all = EXCLUDED.zoning_codes_all,
    min_lot_area_sf = EXCLUDED.min_lot_area_sf,
    min_lot_width_ft = EXCLUDED.min_lot_width_ft,
    setback_front_ft = EXCLUDED.setback_front_ft,
    setback_side_ft = EXCLUDED.setback_side_ft,
    setback_corner_side_ft = EXCLUDED.setback_corner_side_ft,
    setback_rear_ft = EXCLUDED.setback_rear_ft,
    max_height_ft = EXCLUDED.max_height_ft,
    max_density_du_ac = EXCLUDED.max_density_du_ac,
    conforming_lot_area_flag = EXCLUDED.conforming_lot_area_flag,
    conforming_width_flag = EXCLUDED.conforming_width_flag,
    theoretical_lot_split_count = EXCLUDED.theoretical_lot_split_count,
    theoretical_unit_count_by_right = EXCLUDED.theoretical_unit_count_by_right,
    residential_allowed_flag = EXCLUDED.residential_allowed_flag,
    multifamily_allowed_flag = EXCLUDED.multifamily_allowed_flag,
    commercial_allowed_flag = EXCLUDED.commercial_allowed_flag,
    industrial_allowed_flag = EXCLUDED.industrial_allowed_flag,
    warehouse_allowed_flag = EXCLUDED.warehouse_allowed_flag,
    mixed_use_possible_flag = EXCLUDED.mixed_use_possible_flag,
    c5_no_parking_flag = EXCLUDED.c5_no_parking_flag,
    computed_at = EXCLUDED.computed_at;

COMMIT;
