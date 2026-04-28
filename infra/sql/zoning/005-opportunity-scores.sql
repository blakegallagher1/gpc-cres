-- Opportunity scores: lot split, upzoning, adaptive reuse, industrial
-- Depends on: parcel_zoning_screening, parcel_environmental_screening, parcel_owner_analysis

BEGIN;

-- Keep scoring runnable before FutureBR/future land use has been imported.
DO $$
DECLARE
    has_future_land_use BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ebr_parcels'
          AND column_name = 'future_land_use'
    ) INTO has_future_land_use;

    IF has_future_land_use THEN
        EXECUTE $sql$
            CREATE TEMP TABLE tmp_opportunity_inputs ON COMMIT DROP AS
            SELECT id, area_sqft, assessed_value, NULLIF(TRIM(future_land_use), '') AS future_land_use
            FROM public.ebr_parcels
        $sql$;
    ELSE
        CREATE TEMP TABLE tmp_opportunity_inputs ON COMMIT DROP AS
        SELECT id, area_sqft, assessed_value, NULL::TEXT AS future_land_use
        FROM public.ebr_parcels;
    END IF;
END $$;

TRUNCATE property.parcel_opportunity_scores;

INSERT INTO property.parcel_opportunity_scores (
    parcel_id,
    lot_split_score, lot_split_theoretical_lots, lot_split_possible_by_area, minor_subdivision_flag,
    upzoning_score, density_delta,
    adaptive_reuse_score, residential_conversion_flag,
    industrial_score, industrial_zoning_flag,
    overall_opportunity_score, top_opportunity_type,
    computed_at
)
SELECT
    p.id AS parcel_id,

    -- LOT SPLIT SCORE (0-100)
    -- Components: theoretical lots, conforming area, not in floodway, not wetlands-heavy
    CASE WHEN zs.theoretical_lot_split_count IS NOT NULL THEN
        LEAST(100, ROUND((
            -- Base: 10 pts per theoretical lot above 1 (max 50)
            LEAST(50, GREATEST(0, (COALESCE(zs.theoretical_lot_split_count, 1) - 1) * 10))
            -- Conforming area bonus (20 pts)
            + CASE WHEN zs.conforming_lot_area_flag THEN 20 ELSE 0 END
            -- Conforming width bonus (10 pts)
            + CASE WHEN zs.conforming_width_flag THEN 10 ELSE 0 END
            -- Flood penalty
            - CASE WHEN es.floodway_flag THEN 40
                   WHEN es.floodplain_flag THEN 20
                   ELSE 0 END
            -- Wetlands penalty
            - CASE WHEN COALESCE(es.wetlands_area_pct, 0) > 50 THEN 20
                   WHEN es.wetlands_flag THEN 5
                   ELSE 0 END
            -- Residential zoning bonus (by-right splits are easier)
            + CASE WHEN zs.residential_allowed_flag THEN 10 ELSE 0 END
            -- Large lot bonus (>1 acre gets 10 extra)
            + CASE WHEN p.area_sqft > 43560 THEN 10 ELSE 0 END
        )::NUMERIC, 2))
    ELSE NULL END AS lot_split_score,

    zs.theoretical_lot_split_count AS lot_split_theoretical_lots,
    (COALESCE(zs.theoretical_lot_split_count, 0) >= 2) AS lot_split_possible_by_area,
    (COALESCE(zs.theoretical_lot_split_count, 0) BETWEEN 2 AND 5) AS minor_subdivision_flag,

    -- UPZONING SCORE (0-100)
    -- Components: current density vs potential, future land use alignment, adjacency
    CASE WHEN zs.zoning_code IS NOT NULL THEN
        LEAST(100, ROUND((
            -- Density headroom: if current density is low and adjacent to higher density
            CASE WHEN zs.max_density_du_ac IS NOT NULL AND zs.max_density_du_ac < 6 THEN
                CASE WHEN zs.zoning_group = 'residential' THEN 30 -- low density residential has upzone potential
                     ELSE 15 END
            WHEN zs.max_density_du_ac IS NOT NULL AND zs.max_density_du_ac < 12 THEN 15
            ELSE 0 END
            -- Future land use support (if present)
            + CASE WHEN p.future_land_use IS NOT NULL AND p.future_land_use != '' THEN 20 ELSE 0 END
            -- Large lot bonus (upzoning big parcels = more yield)
            + CASE WHEN p.area_sqft > 43560 THEN 20
                   WHEN p.area_sqft > 21780 THEN 10
                   ELSE 0 END
            -- Not in floodway
            - CASE WHEN es.floodway_flag THEN 30 ELSE 0 END
            -- Mixed use possible = already partially upzoned
            + CASE WHEN zs.mixed_use_possible_flag THEN 10 ELSE 0 END
        )::NUMERIC, 2))
    ELSE NULL END AS upzoning_score,

    -- Density delta: theoretical upzone potential
    CASE WHEN zs.max_density_du_ac IS NOT NULL THEN
        GREATEST(0, 20 - zs.max_density_du_ac) -- assuming ~20 du/ac is plausible upzone target
    ELSE NULL END AS density_delta,

    -- ADAPTIVE REUSE SCORE (0-100)
    -- Components: existing improvement, parking advantage, residential conversion
    CASE WHEN zs.zoning_code IS NOT NULL THEN
        LEAST(100, ROUND((
            -- Has existing assessed value (implies improvements)
            + CASE WHEN p.assessed_value > 0 THEN 20 ELSE 0 END
            -- C5 no-parking advantage
            + CASE WHEN zs.c5_no_parking_flag THEN 30 ELSE 0 END
            -- Multifamily allowed (residential conversion possible)
            + CASE WHEN zs.multifamily_allowed_flag THEN 20 ELSE 0 END
            -- Commercial zoning with residential allowed = conversion opportunity
            + CASE WHEN zs.zoning_group IN ('commercial', 'other') AND zs.residential_allowed_flag THEN 15 ELSE 0 END
            -- Mixed use possible
            + CASE WHEN zs.mixed_use_possible_flag THEN 15 ELSE 0 END
        )::NUMERIC, 2))
    ELSE NULL END AS adaptive_reuse_score,

    (zs.zoning_group IN ('commercial', 'other', 'special') AND zs.residential_allowed_flag) AS residential_conversion_flag,

    -- INDUSTRIAL SCORE (0-100)
    -- Components: industrial/warehouse zoning, lot size, no residential conflict
    CASE WHEN zs.zoning_code IS NOT NULL THEN
        LEAST(100, ROUND((
            -- Industrial/warehouse zoning
            + CASE WHEN zs.industrial_allowed_flag THEN 30 ELSE 0 END
            + CASE WHEN zs.warehouse_allowed_flag THEN 20 ELSE 0 END
            -- Large lot (industrial needs space)
            + CASE WHEN p.area_sqft > 217800 THEN 30 -- >5 acres
                   WHEN p.area_sqft > 87120 THEN 20 -- >2 acres
                   WHEN p.area_sqft > 43560 THEN 10 -- >1 acre
                   ELSE 0 END
            -- No residential conflict (not adjacent to primarily residential)
            + CASE WHEN zs.zoning_group = 'industrial' THEN 20 ELSE 0 END
            -- Flood penalty (industrial sites need reliable access)
            - CASE WHEN es.floodway_flag THEN 30
                   WHEN es.floodplain_flag THEN 10
                   ELSE 0 END
        )::NUMERIC, 2))
    ELSE NULL END AS industrial_score,

    (zs.zoning_group = 'industrial' OR zs.industrial_allowed_flag OR zs.warehouse_allowed_flag) AS industrial_zoning_flag,

    -- OVERALL OPPORTUNITY SCORE: max of the four sub-scores
    GREATEST(
        COALESCE(
            CASE WHEN zs.theoretical_lot_split_count IS NOT NULL THEN
                LEAST(100, ROUND((
                    LEAST(50, GREATEST(0, (COALESCE(zs.theoretical_lot_split_count, 1) - 1) * 10))
                    + CASE WHEN zs.conforming_lot_area_flag THEN 20 ELSE 0 END
                    + CASE WHEN zs.conforming_width_flag THEN 10 ELSE 0 END
                    - CASE WHEN es.floodway_flag THEN 40 WHEN es.floodplain_flag THEN 20 ELSE 0 END
                    - CASE WHEN COALESCE(es.wetlands_area_pct, 0) > 50 THEN 20 WHEN es.wetlands_flag THEN 5 ELSE 0 END
                    + CASE WHEN zs.residential_allowed_flag THEN 10 ELSE 0 END
                    + CASE WHEN p.area_sqft > 43560 THEN 10 ELSE 0 END
                )::NUMERIC, 2))
            ELSE NULL END, 0),
        COALESCE(
            CASE WHEN zs.zoning_code IS NOT NULL THEN
                LEAST(100, ROUND((
                    CASE WHEN zs.max_density_du_ac IS NOT NULL AND zs.max_density_du_ac < 6 THEN
                        CASE WHEN zs.zoning_group = 'residential' THEN 30 ELSE 15 END
                    WHEN zs.max_density_du_ac IS NOT NULL AND zs.max_density_du_ac < 12 THEN 15 ELSE 0 END
                    + CASE WHEN p.future_land_use IS NOT NULL AND p.future_land_use != '' THEN 20 ELSE 0 END
                    + CASE WHEN p.area_sqft > 43560 THEN 20 WHEN p.area_sqft > 21780 THEN 10 ELSE 0 END
                    - CASE WHEN es.floodway_flag THEN 30 ELSE 0 END
                    + CASE WHEN zs.mixed_use_possible_flag THEN 10 ELSE 0 END
                )::NUMERIC, 2))
            ELSE NULL END, 0),
        COALESCE(
            CASE WHEN zs.zoning_code IS NOT NULL THEN
                LEAST(100, ROUND((
                    CASE WHEN p.assessed_value > 0 THEN 20 ELSE 0 END
                    + CASE WHEN zs.c5_no_parking_flag THEN 30 ELSE 0 END
                    + CASE WHEN zs.multifamily_allowed_flag THEN 20 ELSE 0 END
                    + CASE WHEN zs.zoning_group IN ('commercial', 'other') AND zs.residential_allowed_flag THEN 15 ELSE 0 END
                    + CASE WHEN zs.mixed_use_possible_flag THEN 15 ELSE 0 END
                )::NUMERIC, 2))
            ELSE NULL END, 0),
        COALESCE(
            CASE WHEN zs.zoning_code IS NOT NULL THEN
                LEAST(100, ROUND((
                    CASE WHEN zs.industrial_allowed_flag THEN 30 ELSE 0 END
                    + CASE WHEN zs.warehouse_allowed_flag THEN 20 ELSE 0 END
                    + CASE WHEN p.area_sqft > 217800 THEN 30 WHEN p.area_sqft > 87120 THEN 20 WHEN p.area_sqft > 43560 THEN 10 ELSE 0 END
                    + CASE WHEN zs.zoning_group = 'industrial' THEN 20 ELSE 0 END
                    - CASE WHEN es.floodway_flag THEN 30 WHEN es.floodplain_flag THEN 10 ELSE 0 END
                )::NUMERIC, 2))
            ELSE NULL END, 0)
    ) AS overall_opportunity_score,

    -- Top opportunity type
    CASE GREATEST(
        COALESCE(CASE WHEN zs.theoretical_lot_split_count >= 2 THEN
            LEAST(100, (COALESCE(zs.theoretical_lot_split_count, 1) - 1) * 10 + CASE WHEN zs.conforming_lot_area_flag THEN 20 ELSE 0 END)
        ELSE 0 END, 0),
        COALESCE(CASE WHEN zs.max_density_du_ac IS NOT NULL AND zs.max_density_du_ac < 12 THEN 30 ELSE 0 END, 0),
        COALESCE(CASE WHEN zs.c5_no_parking_flag OR (zs.multifamily_allowed_flag AND p.assessed_value > 0) THEN 30 ELSE 0 END, 0),
        COALESCE(CASE WHEN zs.industrial_allowed_flag OR zs.warehouse_allowed_flag THEN 30 ELSE 0 END, 0)
    )
        WHEN COALESCE(CASE WHEN zs.theoretical_lot_split_count >= 2 THEN
            LEAST(100, (COALESCE(zs.theoretical_lot_split_count, 1) - 1) * 10 + CASE WHEN zs.conforming_lot_area_flag THEN 20 ELSE 0 END)
        ELSE 0 END, 0) THEN 'lot_split'
        WHEN COALESCE(CASE WHEN zs.max_density_du_ac IS NOT NULL AND zs.max_density_du_ac < 12 THEN 30 ELSE 0 END, 0) THEN 'upzoning'
        WHEN COALESCE(CASE WHEN zs.c5_no_parking_flag OR (zs.multifamily_allowed_flag AND p.assessed_value > 0) THEN 30 ELSE 0 END, 0) THEN 'adaptive_reuse'
        WHEN COALESCE(CASE WHEN zs.industrial_allowed_flag OR zs.warehouse_allowed_flag THEN 30 ELSE 0 END, 0) THEN 'industrial'
        ELSE NULL
    END AS top_opportunity_type,

    now() AS computed_at
FROM tmp_opportunity_inputs p
LEFT JOIN property.parcel_zoning_screening zs ON zs.parcel_id = p.id
LEFT JOIN property.parcel_environmental_screening es ON es.parcel_id = p.id;

COMMIT;
