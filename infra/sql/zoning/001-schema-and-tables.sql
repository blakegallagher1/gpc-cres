-- EBR Zoning Rules & Parcel Screening Schema
-- Creates property schema and all tables for zoning data pipeline

BEGIN;

CREATE SCHEMA IF NOT EXISTS property;

-- 1. Master district list
CREATE TABLE IF NOT EXISTS property.zoning_districts (
    district_code   TEXT PRIMARY KEY,
    label           TEXT NOT NULL,
    category        TEXT,
    zoning_group    TEXT,
    notes           TEXT,
    source_json     JSONB,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- 2. Dimensional standards per district (multiple rows per district for different building types)
CREATE TABLE IF NOT EXISTS property.zoning_dimensional_standards (
    id              SERIAL PRIMARY KEY,
    district_code   TEXT NOT NULL REFERENCES property.zoning_districts(district_code),
    standard_type   TEXT NOT NULL, -- 'general', 'single_family', 'townhouse', 'multifamily', 'residential', 'nonresidential'
    min_lot_area_sf NUMERIC,
    min_lot_width_ft NUMERIC,
    setback_front_ft NUMERIC,
    setback_side_ft  NUMERIC,
    setback_corner_side_ft NUMERIC,
    setback_rear_ft  NUMERIC,
    max_height_ft    NUMERIC,
    max_density_du_ac NUMERIC,
    max_lot_coverage  NUMERIC,
    far              NUMERIC,
    citation_ref     TEXT,
    notes            TEXT,
    UNIQUE (district_code, standard_type)
);

-- 3. Use permission matrix (district × use type)
CREATE TABLE IF NOT EXISTS property.zoning_use_permissions (
    id              SERIAL PRIMARY KEY,
    district_code   TEXT NOT NULL REFERENCES property.zoning_districts(district_code),
    use_key         TEXT NOT NULL,
    use_label       TEXT,
    permission_code TEXT NOT NULL, -- P, L, C, M
    citation_ref    TEXT,
    notes           TEXT,
    UNIQUE (district_code, use_key)
);

-- 4. Parking rules by use type and character area
CREATE TABLE IF NOT EXISTS property.zoning_parking_rules (
    id              SERIAL PRIMARY KEY,
    use_type        TEXT NOT NULL,
    character_area  TEXT NOT NULL, -- 'rural_suburban', 'urban_walkable', 'downtown', 'any'
    spaces_formula  TEXT,
    sf_per_space    NUMERIC,
    spaces_per_unit NUMERIC,
    citation_ref    TEXT,
    notes           TEXT,
    raw_json        JSONB,
    UNIQUE (use_type, character_area)
);

-- 5. Entitlement path details per permission code
CREATE TABLE IF NOT EXISTS property.zoning_entitlement_paths (
    permission_code     TEXT PRIMARY KEY,
    label               TEXT NOT NULL,
    path                TEXT,
    approval_body       TEXT,
    public_hearing      BOOLEAN,
    estimated_timeline_weeks TEXT,
    estimated_cost_range TEXT,
    risk                TEXT,
    notes               TEXT
);

-- 6. Mapping from parcel zoning_type values to normalized district codes
CREATE TABLE IF NOT EXISTS property.zoning_code_mapping (
    id              SERIAL PRIMARY KEY,
    raw_code        TEXT NOT NULL,
    normalized_code TEXT NOT NULL,
    district_code   TEXT REFERENCES property.zoning_districts(district_code),
    mapped          BOOLEAN DEFAULT false,
    notes           TEXT,
    UNIQUE (raw_code, normalized_code)
);

CREATE INDEX IF NOT EXISTS idx_zcm_raw ON property.zoning_code_mapping(raw_code);
CREATE INDEX IF NOT EXISTS idx_zcm_district ON property.zoning_code_mapping(district_code);

-- 7. Parcel zoning screening (materialized per-parcel zoning facts)
CREATE TABLE IF NOT EXISTS property.parcel_zoning_screening (
    parcel_id           UUID PRIMARY KEY REFERENCES public.ebr_parcels(id),
    zoning_code         TEXT,
    zoning_label        TEXT,
    zoning_category     TEXT,
    zoning_group        TEXT,
    zoning_split_flag   BOOLEAN DEFAULT false,
    zoning_codes_all    TEXT[],
    -- Dimensional standards (from primary zoning district)
    min_lot_area_sf     NUMERIC,
    min_lot_width_ft    NUMERIC,
    setback_front_ft    NUMERIC,
    setback_side_ft     NUMERIC,
    setback_corner_side_ft NUMERIC,
    setback_rear_ft     NUMERIC,
    max_height_ft       NUMERIC,
    max_density_du_ac   NUMERIC,
    -- Conforming flags
    conforming_lot_area_flag BOOLEAN,
    conforming_width_flag    BOOLEAN,
    -- Theoretical yields
    theoretical_lot_split_count INTEGER,
    theoretical_unit_count_by_right INTEGER,
    theoretical_unit_count_upzoned INTEGER,
    setback_buildable_area_sf NUMERIC,
    -- Use permission flags (from primary zoning)
    residential_allowed_flag   BOOLEAN DEFAULT false,
    multifamily_allowed_flag   BOOLEAN DEFAULT false,
    commercial_allowed_flag    BOOLEAN DEFAULT false,
    industrial_allowed_flag    BOOLEAN DEFAULT false,
    warehouse_allowed_flag     BOOLEAN DEFAULT false,
    mixed_use_possible_flag    BOOLEAN DEFAULT false,
    -- Best use analysis
    best_by_right_use          TEXT,
    highest_value_plausible_use TEXT,
    approval_required_for_target_use TEXT,
    -- Parking
    c5_no_parking_flag         BOOLEAN DEFAULT false,
    -- Metadata
    computed_at     TIMESTAMPTZ DEFAULT now()
);

-- 8. Parcel environmental screening
CREATE TABLE IF NOT EXISTS property.parcel_environmental_screening (
    parcel_id               UUID PRIMARY KEY REFERENCES public.ebr_parcels(id),
    fema_flood_zone         TEXT,
    floodplain_flag         BOOLEAN DEFAULT false,
    floodway_flag           BOOLEAN DEFAULT false,
    base_flood_elevation    NUMERIC,
    percent_parcel_in_flood NUMERIC,
    soil_type               TEXT,
    soil_hydric_flag        BOOLEAN DEFAULT false,
    wetlands_flag           BOOLEAN DEFAULT false,
    wetlands_area_pct       NUMERIC,
    epa_facility_nearby_flag BOOLEAN DEFAULT false,
    epa_facility_count_500m  INTEGER DEFAULT 0,
    epa_violation_nearby_flag BOOLEAN DEFAULT false,
    drainage_risk_score     NUMERIC,
    computed_at             TIMESTAMPTZ DEFAULT now()
);

-- 9. Parcel owner analysis
CREATE TABLE IF NOT EXISTS property.parcel_owner_analysis (
    parcel_id               UUID PRIMARY KEY REFERENCES public.ebr_parcels(id),
    owner_name_normalized   TEXT,
    owner_type              TEXT, -- 'individual', 'llc', 'trust', 'government', 'church', 'institutional', 'unknown'
    multi_parcel_owner_flag BOOLEAN DEFAULT false,
    parcel_count_same_owner INTEGER DEFAULT 1,
    public_owner_flag       BOOLEAN DEFAULT false,
    absentee_owner_flag     BOOLEAN,
    computed_at             TIMESTAMPTZ DEFAULT now()
);

-- 10. Parcel opportunity scores
CREATE TABLE IF NOT EXISTS property.parcel_opportunity_scores (
    parcel_id                   UUID PRIMARY KEY REFERENCES public.ebr_parcels(id),
    -- Lot split
    lot_split_score             NUMERIC,
    lot_split_theoretical_lots  INTEGER,
    lot_split_possible_by_area  BOOLEAN DEFAULT false,
    minor_subdivision_flag      BOOLEAN DEFAULT false,
    -- Upzoning
    upzoning_score              NUMERIC,
    density_delta               NUMERIC,
    futurebr_support_score      TEXT,
    -- Adaptive reuse
    adaptive_reuse_score        NUMERIC,
    residential_conversion_flag BOOLEAN DEFAULT false,
    -- Industrial
    industrial_score            NUMERIC,
    industrial_zoning_flag      BOOLEAN DEFAULT false,
    -- Composite
    overall_opportunity_score   NUMERIC,
    top_opportunity_type        TEXT,
    computed_at                 TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pzs_zoning ON property.parcel_zoning_screening(zoning_code);
CREATE INDEX IF NOT EXISTS idx_pzs_group ON property.parcel_zoning_screening(zoning_group);
CREATE INDEX IF NOT EXISTS idx_pes_flood ON property.parcel_environmental_screening(fema_flood_zone);
CREATE INDEX IF NOT EXISTS idx_pos_overall ON property.parcel_opportunity_scores(overall_opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_pos_lot_split ON property.parcel_opportunity_scores(lot_split_score DESC);
CREATE INDEX IF NOT EXISTS idx_poa_type ON property.parcel_owner_analysis(owner_type);
CREATE INDEX IF NOT EXISTS idx_poa_multi ON property.parcel_owner_analysis(multi_parcel_owner_flag) WHERE multi_parcel_owner_flag = true;

COMMIT;
