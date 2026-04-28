-- Zoning code mapping + parcel zoning screening materialization
-- Handles split-zoned parcels (comma-separated zoning_type values)

BEGIN;

-- Supplemental municipal and inactive zoning districts observed in parcel
-- backfills. These are intentionally jurisdiction-aware placeholders so the
-- parcel screening stays mapped even when the source code is from Central,
-- Zachary, or an inactive EBR district rather than the current EBR UDC matrix.
INSERT INTO property.zoning_districts (district_code, label, category, zoning_group, notes, source_json)
VALUES
    ('b', 'Off-Street Parking', 'special', 'special', 'Inactive EBR district: Off-Street Parking.', '{"jurisdiction":"East Baton Rouge","status":"inactive"}'::jsonb),
    ('b2', 'Neighborhood Business District B-2', 'commercial', 'commercial', 'City of Central municipal zoning district.', '{"jurisdiction":"Central"}'::jsonb),
    ('b3', 'General Commercial/Business District B-3', 'commercial', 'commercial', 'City of Central municipal zoning district.', '{"jurisdiction":"Central"}'::jsonb),
    ('b4', 'General Commercial/Business District B-4', 'commercial', 'commercial', 'City of Central municipal zoning district.', '{"jurisdiction":"Central"}'::jsonb),
    ('b5', 'Large Scale Commercial/Business District B-5', 'commercial', 'commercial', 'City of Central municipal zoning district.', '{"jurisdiction":"Central"}'::jsonb),
    ('bdd', 'Bluebonnet Design District', 'design', 'special', 'EBR Bluebonnet Design District.', '{"jurisdiction":"East Baton Rouge"}'::jsonb),
    ('bp', 'Business Park', 'business', 'industrial', 'City of Zachary business park district.', '{"jurisdiction":"Zachary"}'::jsonb),
    ('cn', 'Neighborhood Commercial', 'commercial', 'commercial', 'City of Zachary Neighborhood Commercial district.', '{"jurisdiction":"Zachary"}'::jsonb),
    ('cw2', 'Commercial Warehousing Two', 'warehousing', 'industrial', 'Inactive EBR district: Commercial Warehousing Two.', '{"jurisdiction":"East Baton Rouge","status":"inactive"}'::jsonb),
    ('i', 'Industry', 'industrial', 'industrial', 'City of Zachary Industry district.', '{"jurisdiction":"Zachary"}'::jsonb),
    ('jdd', 'Jefferson Highway Design District', 'design', 'special', 'Inactive EBR Jefferson Highway Design District.', '{"jurisdiction":"East Baton Rouge","status":"inactive"}'::jsonb),
    ('ord', 'Office, Research and Development District', 'office', 'commercial', 'City of Central Office, Research and Development district.', '{"jurisdiction":"Central"}'::jsonb),
    ('r1', 'Single-Family Residence District R-1', 'residential', 'residential', 'City of Central municipal residential district.', '{"jurisdiction":"Central"}'::jsonb),
    ('r2', 'Single-Family Residence District R-2', 'residential', 'residential', 'City of Central municipal residential district.', '{"jurisdiction":"Central"}'::jsonb),
    ('r3', 'Single-Family Attached/Multi-Family Residence District R-3', 'residential', 'residential', 'City of Central municipal residential district.', '{"jurisdiction":"Central"}'::jsonb),
    ('ra', 'Rural/Agricultural District', 'rural', 'residential', 'City of Central Rural/Agricultural district.', '{"jurisdiction":"Central"}'::jsonb),
    ('re', 'Residential Estate', 'residential', 'residential', 'City of Zachary Residential Estate district.', '{"jurisdiction":"Zachary"}'::jsonb),
    ('rs', 'Residential Suburban', 'residential', 'residential', 'City of Zachary Residential Suburban district.', '{"jurisdiction":"Zachary"}'::jsonb),
    ('ru', 'Residential Urban', 'residential', 'residential', 'City of Zachary Residential Urban district.', '{"jurisdiction":"Zachary"}'::jsonb),
    ('uc', 'Urban Center', 'mixed_use', 'mixed_use', 'City of Zachary Urban Center district.', '{"jurisdiction":"Zachary"}'::jsonb)
ON CONFLICT (district_code) DO UPDATE SET
    label = EXCLUDED.label,
    category = EXCLUDED.category,
    zoning_group = EXCLUDED.zoning_group,
    notes = EXCLUDED.notes,
    source_json = EXCLUDED.source_json;

-- The current property DB may or may not already have zoning columns on
-- public.ebr_parcels. Build a stable temp input table so this script can run
-- before or after zoning backfill/import work.
DO $$
DECLARE
    has_zoning_type BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ebr_parcels'
          AND column_name = 'zoning_type'
    ) INTO has_zoning_type;

    IF has_zoning_type THEN
        EXECUTE $sql$
            CREATE TEMP TABLE tmp_parcel_zoning_inputs ON COMMIT DROP AS
            SELECT id, area_sqft, NULLIF(TRIM(zoning_type), '') AS zoning_type
            FROM public.ebr_parcels
        $sql$;
    ELSE
        CREATE TEMP TABLE tmp_parcel_zoning_inputs ON COMMIT DROP AS
        SELECT id, area_sqft, NULL::TEXT AS zoning_type
        FROM public.ebr_parcels;
    END IF;
END $$;

-- Step 1: Build the code mapping from parcel zoning_type to normalized district codes
TRUNCATE property.zoning_code_mapping;

-- Extract all distinct individual zoning codes from comma-separated zoning_type
WITH raw_codes AS (
    SELECT DISTINCT TRIM(unnest(string_to_array(zoning_type, ','))) AS raw_code
    FROM tmp_parcel_zoning_inputs
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

UPDATE property.zoning_code_mapping
SET district_code = LOWER(REPLACE(REPLACE(REPLACE(raw_code, '-', '_'), '/', '_'), '.', '_')),
    mapped = true,
    notes = 'Mapped by supplemental municipal/inactive zoning dictionary.'
WHERE raw_code IN ('B', 'B2', 'B3', 'B4', 'B5', 'BDD', 'BP', 'CN', 'CW2', 'I', 'JDD', 'ORD', 'R1', 'R2', 'R3', 'RA', 'RE', 'RS', 'RU', 'UC');

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

-- Step 3: Materialize parcel zoning screening
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
    best_by_right_use, highest_value_plausible_use, approval_required_for_target_use,
    c5_no_parking_flag,
    computed_at
)
WITH parsed AS (
    -- For each parcel, extract the primary (first) zoning code. Keep parcels
    -- without zoning so downstream tables remain one row per parcel.
    SELECT
        p.id AS parcel_id,
        p.zoning_type,
        p.area_sqft,
        NULLIF(TRIM(SPLIT_PART(COALESCE(p.zoning_type, ''), ',', 1)), '') AS primary_raw_code,
        ARRAY(
            SELECT TRIM(x)
            FROM unnest(string_to_array(p.zoning_type, ',')) AS x
            WHERE TRIM(x) != ''
        ) AS all_codes,
        (POSITION(',' IN COALESCE(p.zoning_type, '')) > 0) AS is_split
    FROM tmp_parcel_zoning_inputs p
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
    COALESCE(m.all_codes, ARRAY[]::TEXT[]) AS zoning_codes_all,
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
    CASE
        WHEN EXISTS (SELECT 1 FROM property.zoning_use_permissions up
                     WHERE up.district_code = m.district_code
                       AND up.use_key IN ('assembly_furniture_electronics', 'assembly_manufactured_parts', 'warehouse', 'office_warehouse')
                       AND up.permission_code IN ('P', 'L')) THEN 'industrial / warehouse'
        WHEN EXISTS (SELECT 1 FROM property.zoning_use_permissions up
                     WHERE up.district_code = m.district_code
                       AND up.use_key IN ('retail_sales', 'office', 'restaurant_without_alcohol', 'bank', 'personal_service')
                       AND up.permission_code IN ('P', 'L')) THEN 'commercial'
        WHEN EXISTS (SELECT 1 FROM property.zoning_use_permissions up
                     WHERE up.district_code = m.district_code
                       AND up.use_key = 'multifamily'
                       AND up.permission_code IN ('P', 'L')) THEN 'multifamily residential'
        WHEN EXISTS (SELECT 1 FROM property.zoning_use_permissions up
                     WHERE up.district_code = m.district_code
                       AND up.use_key IN ('single_family_detached', 'two_family', 'semi_detached', 'zero_lot_line', 'townhome')
                       AND up.permission_code IN ('P', 'L')) THEN 'residential'
        WHEN m.district_code IS NOT NULL THEN COALESCE(zd.zoning_group, zd.category, 'mapped zoning district')
        ELSE NULL
    END AS best_by_right_use,
    CASE
        WHEN EXISTS (SELECT 1 FROM property.zoning_use_permissions up
                     WHERE up.district_code = m.district_code
                       AND up.use_key IN ('warehouse', 'office_warehouse')
                       AND up.permission_code IN ('P', 'L')) AND m.area_sqft >= 87120 THEN 'industrial / warehouse'
        WHEN EXISTS (SELECT 1 FROM property.zoning_use_permissions up
                     WHERE up.district_code = m.district_code
                       AND up.use_key = 'multifamily'
                       AND up.permission_code IN ('P', 'L')) AND COALESCE(ds.max_density_du_ac, 0) >= 12 THEN 'multifamily residential'
        WHEN EXISTS (SELECT 1 FROM property.zoning_use_permissions up
                     WHERE up.district_code = m.district_code
                       AND up.use_key IN ('retail_sales', 'office', 'restaurant_without_alcohol', 'bank', 'personal_service')
                       AND up.permission_code IN ('P', 'L')) THEN 'commercial'
        WHEN EXISTS (SELECT 1 FROM property.zoning_use_permissions up
                     WHERE up.district_code = m.district_code
                       AND up.use_key = 'multifamily'
                       AND up.permission_code IN ('P', 'L')) THEN 'multifamily residential'
        WHEN EXISTS (SELECT 1 FROM property.zoning_use_permissions up
                     WHERE up.district_code = m.district_code
                       AND up.use_key IN ('assembly_furniture_electronics', 'assembly_manufactured_parts', 'warehouse', 'office_warehouse')
                       AND up.permission_code IN ('P', 'L')) THEN 'industrial / warehouse'
        WHEN EXISTS (SELECT 1 FROM property.zoning_use_permissions up
                     WHERE up.district_code = m.district_code
                       AND up.use_key IN ('single_family_detached', 'two_family', 'semi_detached', 'zero_lot_line', 'townhome')
                       AND up.permission_code IN ('P', 'L')) THEN 'residential'
        WHEN m.district_code IS NOT NULL THEN COALESCE(zd.zoning_group, zd.category, 'mapped zoning district')
        ELSE NULL
    END AS highest_value_plausible_use,
    CASE
        WHEN m.district_code IS NULL THEN NULL
        WHEN EXISTS (SELECT 1 FROM property.zoning_use_permissions up
                     WHERE up.district_code = m.district_code
                       AND up.permission_code = 'P') THEN 'by right'
        WHEN EXISTS (SELECT 1 FROM property.zoning_use_permissions up
                     WHERE up.district_code = m.district_code
                       AND up.permission_code = 'L') THEN 'limited use standards'
        WHEN EXISTS (SELECT 1 FROM property.zoning_use_permissions up
                     WHERE up.district_code = m.district_code
                       AND up.permission_code = 'C') THEN 'conditional use permit'
        WHEN EXISTS (SELECT 1 FROM property.zoning_use_permissions up
                     WHERE up.district_code = m.district_code
                       AND up.permission_code = 'M') THEN 'minor conditional use permit'
        ELSE 'entitlement review required'
    END AS approval_required_for_target_use,
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
    best_by_right_use = EXCLUDED.best_by_right_use,
    highest_value_plausible_use = EXCLUDED.highest_value_plausible_use,
    approval_required_for_target_use = EXCLUDED.approval_required_for_target_use,
    c5_no_parking_flag = EXCLUDED.c5_no_parking_flag,
    computed_at = EXCLUDED.computed_at;

COMMIT;
