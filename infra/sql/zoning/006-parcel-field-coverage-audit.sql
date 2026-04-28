-- Parcel field coverage audit
--
-- Rerun after each parish, zoning, owner, environmental, or opportunity import:
--   psql "$DATABASE_URL" -f infra/sql/zoning/006-parcel-field-coverage-audit.sql
--
-- Optional run label:
--   psql "$DATABASE_URL" \
--     -c "SET parcel_coverage.run_label = 'after ascension zoning import';" \
--     -f infra/sql/zoning/006-parcel-field-coverage-audit.sql

BEGIN;

CREATE SCHEMA IF NOT EXISTS property;

CREATE TABLE IF NOT EXISTS property.parcel_field_coverage_audit_runs (
    id BIGSERIAL PRIMARY KEY,
    run_label TEXT,
    parcel_source_schema TEXT NOT NULL DEFAULT 'public',
    parcel_source_relation TEXT NOT NULL DEFAULT 'ebr_parcels',
    total_parcel_count BIGINT NOT NULL,
    source_relation_inventory JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS property.parcel_field_coverage_audit_results (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL REFERENCES property.parcel_field_coverage_audit_runs(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL,
    field_family TEXT NOT NULL,
    field_name TEXT NOT NULL,
    source_schema TEXT NOT NULL,
    source_relation TEXT NOT NULL,
    source_column TEXT NOT NULL,
    source_relation_kind TEXT,
    source_row_count BIGINT NOT NULL DEFAULT 0,
    total_parcel_count BIGINT NOT NULL,
    populated_count BIGINT NOT NULL DEFAULT 0,
    null_count BIGINT NOT NULL DEFAULT 0,
    coverage_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
    missing_entirely BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL,
    notes TEXT,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (run_id, field_family, field_name, source_schema, source_relation, source_column)
);

CREATE INDEX IF NOT EXISTS idx_parcel_field_coverage_run
    ON property.parcel_field_coverage_audit_results(run_id, display_order);
CREATE INDEX IF NOT EXISTS idx_parcel_field_coverage_missing
    ON property.parcel_field_coverage_audit_results(run_id, missing_entirely)
    WHERE missing_entirely = true;
CREATE INDEX IF NOT EXISTS idx_parcel_field_coverage_family
    ON property.parcel_field_coverage_audit_results(run_id, field_family);

CREATE TEMP TABLE tmp_parcel_field_coverage_spec (
    display_order INTEGER NOT NULL,
    field_family TEXT NOT NULL,
    field_name TEXT NOT NULL,
    source_schema TEXT NOT NULL,
    source_relation TEXT NOT NULL,
    source_column TEXT NOT NULL,
    notes TEXT
) ON COMMIT DROP;

INSERT INTO tmp_parcel_field_coverage_spec (
    display_order,
    field_family,
    field_name,
    source_schema,
    source_relation,
    source_column,
    notes
)
VALUES
    (10, 'parcel identity', 'internal parcel uuid', 'public', 'ebr_parcels', 'id', 'Base parcel row identifier.'),
    (20, 'parcel identity', 'assessor parcel id', 'public', 'ebr_parcels', 'parcel_id', 'Assessor or source parcel number.'),
    (30, 'parcel identity', 'parcel intelligence row', 'public', 'mv_parcel_intelligence', 'parcel_id', 'Existing materialized view coverage check.'),
    (40, 'source geography', 'parish', 'public', 'ebr_parcels', 'parish', 'Parish-level import progress anchor.'),
    (50, 'source geography', 'source name', 'property', 'parcel_assessor_enrichment', 'source_name', 'Original source system or endpoint name when captured.'),
    (60, 'source geography', 'parcel created at', 'public', 'ebr_parcels', 'created_at', 'Import timestamp currently stored on parcel rows.'),

    (100, 'geometry and area', 'parcel geometry', 'public', 'ebr_parcels', 'geom', 'Parcel boundary geometry.'),
    (110, 'geometry and area', 'area square feet', 'public', 'ebr_parcels', 'area_sqft', 'Parcel area in square feet.'),
    (120, 'geometry and area', 'acreage', 'public', 'ebr_parcels', 'acreage', 'Parcel area in acres when sourced directly.'),
    (130, 'geometry and area', 'parcel centroid', 'public', 'ebr_parcels', 'centroid', 'Stored parcel centroid geometry.'),

    (150, 'parcel intelligence view', 'view internal parcel uuid', 'public', 'mv_parcel_intelligence', 'id', 'Existing materialized view parcel UUID.'),
    (160, 'parcel intelligence view', 'view site address', 'public', 'mv_parcel_intelligence', 'address', 'Existing materialized view site address.'),
    (170, 'parcel intelligence view', 'view area square feet', 'public', 'mv_parcel_intelligence', 'area_sqft', 'Existing materialized view parcel area.'),
    (180, 'parcel intelligence view', 'view owner name', 'public', 'mv_parcel_intelligence', 'owner', 'Existing materialized view owner field.'),
    (190, 'parcel intelligence view', 'view assessed value', 'public', 'mv_parcel_intelligence', 'assessed_value', 'Existing materialized view assessed value.'),
    (195, 'parcel intelligence view', 'view geometry', 'public', 'mv_parcel_intelligence', 'geom', 'Existing materialized view geometry.'),
    (198, 'parcel intelligence view', 'view centroid', 'public', 'mv_parcel_intelligence', 'centroid', 'Existing materialized view centroid.'),

    (200, 'site address', 'site address', 'public', 'ebr_parcels', 'address', 'Physical/site address from parcel source.'),
    (210, 'site address', 'city', 'property', 'parcel_assessor_enrichment', 'city', 'City parsed from assessor mailing city/state/ZIP when source splits address fields.'),
    (220, 'site address', 'state', 'property', 'parcel_assessor_enrichment', 'state', 'State parsed from assessor mailing city/state/ZIP when source splits address fields.'),
    (230, 'site address', 'zip code', 'property', 'parcel_assessor_enrichment', 'zip', 'ZIP parsed from assessor mailing city/state/ZIP when source splits address fields.'),

    (300, 'owner', 'raw owner name', 'public', 'ebr_parcels', 'owner', 'Raw owner string from parcel source.'),
    (310, 'owner', 'owner normalized name', 'property', 'parcel_owner_analysis', 'owner_name_normalized', 'Owner name normalized by zoning owner-analysis surface.'),
    (320, 'owner', 'owner type', 'property', 'parcel_owner_analysis', 'owner_type', 'Individual, LLC, trust, government, church, institutional, or unknown.'),
    (330, 'owner', 'same owner parcel count', 'property', 'parcel_owner_analysis', 'parcel_count_same_owner', 'Count of parcels with the same normalized owner.'),
    (340, 'owner', 'multi parcel owner flag', 'property', 'parcel_owner_analysis', 'multi_parcel_owner_flag', 'Owner controls more than one parcel.'),
    (350, 'owner', 'public owner flag', 'property', 'parcel_owner_analysis', 'public_owner_flag', 'Government or public agency owner classification.'),
    (360, 'owner', 'absentee owner flag', 'property', 'parcel_owner_analysis', 'absentee_owner_flag', 'Future owner-analysis field; currently missing until mailing address logic exists.'),
    (370, 'owner', 'owner mailing address', 'property', 'parcel_assessor_enrichment', 'owner_mailing_address', 'Mailing address from source when available.'),

    (400, 'legal and assessment', 'legal description', 'property', 'parcel_assessor_enrichment', 'legal_description', 'Legal description from assessor/source.'),
    (410, 'legal and assessment', 'assessed value', 'property', 'parcel_assessor_enrichment', 'assessed_value', 'Assessed value from assessor enrichment used by opportunity scoring.'),
    (420, 'legal and assessment', 'land value', 'property', 'parcel_assessor_enrichment', 'land_value', 'Land-only assessed or market value when available.'),
    (430, 'legal and assessment', 'improvement value', 'property', 'parcel_assessor_enrichment', 'improvement_value', 'Building/improvement value when available or derived from market value less land value.'),
    (440, 'legal and assessment', 'market value', 'property', 'parcel_assessor_enrichment', 'market_value', 'Total market value when available.'),
    (450, 'legal and assessment', 'tax amount', 'property', 'parcel_assessor_enrichment', 'tax_amount', 'Current annual tax amount when available.'),
    (460, 'legal and assessment', 'last sale date', 'property', 'parcel_assessor_enrichment', 'sale_date', 'Last transfer date when available.'),
    (470, 'legal and assessment', 'last sale price', 'property', 'parcel_assessor_enrichment', 'sale_price', 'Last transfer price when available.'),

    (500, 'zoning raw and mapped', 'raw zoning type', 'public', 'ebr_parcels', 'zoning_type', 'Raw source zoning code.'),
    (510, 'zoning raw and mapped', 'zoning code', 'property', 'parcel_zoning_screening', 'zoning_code', 'Mapped primary zoning district code.'),
    (520, 'zoning raw and mapped', 'zoning label', 'property', 'parcel_zoning_screening', 'zoning_label', 'Mapped district label.'),
    (530, 'zoning raw and mapped', 'zoning category', 'property', 'parcel_zoning_screening', 'zoning_category', 'Mapped zoning category.'),
    (540, 'zoning raw and mapped', 'zoning group', 'property', 'parcel_zoning_screening', 'zoning_group', 'Normalized zoning group.'),
    (550, 'zoning raw and mapped', 'split zoning flag', 'property', 'parcel_zoning_screening', 'zoning_split_flag', 'Parcel has multiple raw zoning codes.'),
    (560, 'zoning raw and mapped', 'all zoning codes', 'property', 'parcel_zoning_screening', 'zoning_codes_all', 'All parsed raw zoning codes.'),
    (570, 'land use', 'existing land use', 'public', 'ebr_parcels', 'existing_land_use', 'Existing land use from parcel/source import.'),
    (580, 'land use', 'future land use', 'public', 'ebr_parcels', 'future_land_use', 'FutureBR/future land use import field when present.'),

    (600, 'zoning dimensional standards', 'minimum lot area square feet', 'property', 'parcel_zoning_screening', 'min_lot_area_sf', 'Mapped dimensional standard.'),
    (610, 'zoning dimensional standards', 'minimum lot width feet', 'property', 'parcel_zoning_screening', 'min_lot_width_ft', 'Mapped dimensional standard.'),
    (620, 'zoning dimensional standards', 'front setback feet', 'property', 'parcel_zoning_screening', 'setback_front_ft', 'Mapped dimensional standard.'),
    (630, 'zoning dimensional standards', 'side setback feet', 'property', 'parcel_zoning_screening', 'setback_side_ft', 'Mapped dimensional standard.'),
    (640, 'zoning dimensional standards', 'corner side setback feet', 'property', 'parcel_zoning_screening', 'setback_corner_side_ft', 'Mapped dimensional standard.'),
    (650, 'zoning dimensional standards', 'rear setback feet', 'property', 'parcel_zoning_screening', 'setback_rear_ft', 'Mapped dimensional standard.'),
    (660, 'zoning dimensional standards', 'maximum height feet', 'property', 'parcel_zoning_screening', 'max_height_ft', 'Mapped dimensional standard.'),
    (670, 'zoning dimensional standards', 'maximum density du acre', 'property', 'parcel_zoning_screening', 'max_density_du_ac', 'Mapped dimensional standard.'),
    (680, 'zoning dimensional standards', 'conforming lot area flag', 'property', 'parcel_zoning_screening', 'conforming_lot_area_flag', 'Parcel area meets mapped minimum lot area.'),
    (690, 'zoning dimensional standards', 'conforming width flag', 'property', 'parcel_zoning_screening', 'conforming_width_flag', 'Estimated parcel width meets mapped minimum lot width.'),

    (700, 'zoning use permissions', 'residential allowed flag', 'property', 'parcel_zoning_screening', 'residential_allowed_flag', 'By-right or limited residential use available.'),
    (710, 'zoning use permissions', 'multifamily allowed flag', 'property', 'parcel_zoning_screening', 'multifamily_allowed_flag', 'By-right or limited multifamily use available.'),
    (720, 'zoning use permissions', 'commercial allowed flag', 'property', 'parcel_zoning_screening', 'commercial_allowed_flag', 'By-right or limited commercial use available.'),
    (730, 'zoning use permissions', 'industrial allowed flag', 'property', 'parcel_zoning_screening', 'industrial_allowed_flag', 'By-right or limited industrial use available.'),
    (740, 'zoning use permissions', 'warehouse allowed flag', 'property', 'parcel_zoning_screening', 'warehouse_allowed_flag', 'By-right or limited warehouse use available.'),
    (750, 'zoning use permissions', 'mixed use possible flag', 'property', 'parcel_zoning_screening', 'mixed_use_possible_flag', 'Residential and commercial uses both available.'),
    (760, 'zoning use permissions', 'best by right use', 'property', 'parcel_zoning_screening', 'best_by_right_use', 'Future use-ranking output.'),
    (770, 'zoning use permissions', 'highest value plausible use', 'property', 'parcel_zoning_screening', 'highest_value_plausible_use', 'Future use-ranking output.'),
    (780, 'zoning use permissions', 'approval required for target use', 'property', 'parcel_zoning_screening', 'approval_required_for_target_use', 'Future entitlement-path output.'),

    (790, 'environmental', 'raw flood zone', 'property', 'parcel_assessor_enrichment', 'flood_zone', 'Flood zone from parcel/source import.'),
    (800, 'environmental', 'fema flood zone', 'property', 'parcel_environmental_screening', 'fema_flood_zone', 'FEMA flood zone from environmental screening.'),
    (810, 'environmental', 'floodplain flag', 'property', 'parcel_environmental_screening', 'floodplain_flag', 'Parcel centroid intersects floodplain zone.'),
    (820, 'environmental', 'floodway flag', 'property', 'parcel_environmental_screening', 'floodway_flag', 'Parcel centroid intersects floodway zone.'),
    (830, 'environmental', 'base flood elevation', 'property', 'parcel_environmental_screening', 'base_flood_elevation', 'FEMA base flood elevation when available.'),
    (840, 'environmental', 'percent parcel in flood', 'property', 'parcel_environmental_screening', 'percent_parcel_in_flood', 'Future exact flood-intersection percentage.'),
    (850, 'environmental', 'soil type', 'property', 'parcel_environmental_screening', 'soil_type', 'Centroid soil drainage class.'),
    (860, 'environmental', 'hydric soil flag', 'property', 'parcel_environmental_screening', 'soil_hydric_flag', 'Hydric soil classification flag.'),
    (870, 'environmental', 'wetlands flag', 'property', 'parcel_environmental_screening', 'wetlands_flag', 'Centroid wetlands intersection flag.'),
    (880, 'environmental', 'wetlands area percent', 'property', 'parcel_environmental_screening', 'wetlands_area_pct', 'Future exact wetlands-intersection percentage.'),
    (890, 'environmental', 'epa nearby flag', 'property', 'parcel_environmental_screening', 'epa_facility_nearby_flag', 'EPA facility within 500m.'),
    (900, 'environmental', 'epa facility count 500m', 'property', 'parcel_environmental_screening', 'epa_facility_count_500m', 'EPA facility count within 500m.'),
    (910, 'environmental', 'epa violation nearby flag', 'property', 'parcel_environmental_screening', 'epa_violation_nearby_flag', 'EPA facility with recent violations within 500m.'),
    (920, 'environmental', 'drainage risk score', 'property', 'parcel_environmental_screening', 'drainage_risk_score', 'Composite drainage risk score.'),

    (1000, 'opportunity scores', 'lot split score', 'property', 'parcel_opportunity_scores', 'lot_split_score', 'Lot split opportunity score.'),
    (1010, 'opportunity scores', 'lot split theoretical lots', 'property', 'parcel_opportunity_scores', 'lot_split_theoretical_lots', 'Area-based theoretical lot count.'),
    (1020, 'opportunity scores', 'lot split possible by area', 'property', 'parcel_opportunity_scores', 'lot_split_possible_by_area', 'Area-only lot split flag.'),
    (1030, 'opportunity scores', 'minor subdivision flag', 'property', 'parcel_opportunity_scores', 'minor_subdivision_flag', 'Area-only minor subdivision flag.'),
    (1040, 'opportunity scores', 'upzoning score', 'property', 'parcel_opportunity_scores', 'upzoning_score', 'Upzoning opportunity score.'),
    (1050, 'opportunity scores', 'density delta', 'property', 'parcel_opportunity_scores', 'density_delta', 'Potential dwelling-unit density delta.'),
    (1060, 'opportunity scores', 'futurebr support score', 'property', 'parcel_opportunity_scores', 'futurebr_support_score', 'Future FutureBR support output.'),
    (1070, 'opportunity scores', 'adaptive reuse score', 'property', 'parcel_opportunity_scores', 'adaptive_reuse_score', 'Adaptive reuse opportunity score.'),
    (1080, 'opportunity scores', 'residential conversion flag', 'property', 'parcel_opportunity_scores', 'residential_conversion_flag', 'Residential conversion opportunity flag.'),
    (1090, 'opportunity scores', 'industrial score', 'property', 'parcel_opportunity_scores', 'industrial_score', 'Industrial opportunity score.'),
    (1100, 'opportunity scores', 'industrial zoning flag', 'property', 'parcel_opportunity_scores', 'industrial_zoning_flag', 'Industrial/warehouse zoning flag.'),
    (1110, 'opportunity scores', 'overall opportunity score', 'property', 'parcel_opportunity_scores', 'overall_opportunity_score', 'Maximum opportunity score across sub-scores.'),
    (1120, 'opportunity scores', 'top opportunity type', 'property', 'parcel_opportunity_scores', 'top_opportunity_type', 'Highest-scoring opportunity family.');

DO $$
DECLARE
    audit_run_id BIGINT;
    base_parcel_count BIGINT;
    column_category CHAR;
    column_type TEXT;
    populated BIGINT;
    relation_kind TEXT;
    relation_oid OID;
    source_rows BIGINT;
    spec RECORD;
    status_value TEXT;
    value_predicate TEXT;
BEGIN
    IF to_regclass('public.ebr_parcels') IS NULL THEN
        RAISE EXCEPTION 'public.ebr_parcels is required for parcel field coverage audit';
    END IF;

    EXECUTE 'SELECT COUNT(*) FROM public.ebr_parcels' INTO base_parcel_count;

    INSERT INTO property.parcel_field_coverage_audit_runs (
        run_label,
        total_parcel_count,
        source_relation_inventory
    )
    SELECT
        NULLIF(current_setting('parcel_coverage.run_label', true), ''),
        base_parcel_count,
        jsonb_agg(DISTINCT jsonb_build_object(
            'schema', source_schema,
            'relation', source_relation
        ))
    FROM tmp_parcel_field_coverage_spec
    RETURNING id INTO audit_run_id;

    FOR spec IN
        SELECT *
        FROM tmp_parcel_field_coverage_spec
        ORDER BY display_order, field_family, field_name
    LOOP
        populated := 0;
        relation_kind := NULL;
        relation_oid := NULL;
        source_rows := 0;
        status_value := 'relation_missing';

        SELECT
            cls.oid,
            CASE cls.relkind
                WHEN 'r' THEN 'table'
                WHEN 'p' THEN 'partitioned table'
                WHEN 'v' THEN 'view'
                WHEN 'm' THEN 'materialized view'
                WHEN 'f' THEN 'foreign table'
                ELSE cls.relkind::TEXT
            END
        INTO relation_oid, relation_kind
        FROM pg_class cls
        JOIN pg_namespace ns ON ns.oid = cls.relnamespace
        WHERE ns.nspname = spec.source_schema
          AND cls.relname = spec.source_relation
          AND cls.relkind IN ('r', 'p', 'v', 'm', 'f');

        IF relation_oid IS NOT NULL THEN
            EXECUTE format('SELECT COUNT(*) FROM %I.%I', spec.source_schema, spec.source_relation)
            INTO source_rows;

            SELECT
                typ.typcategory,
                format_type(att.atttypid, att.atttypmod)
            INTO column_category, column_type
            FROM pg_attribute att
            JOIN pg_type typ ON typ.oid = att.atttypid
            WHERE att.attrelid = relation_oid
              AND att.attname = spec.source_column
              AND att.attnum > 0
              AND NOT att.attisdropped;

            IF column_type IS NULL THEN
                status_value := 'column_missing';
            ELSE
                IF column_category = 'A' THEN
                    value_predicate := format('%1$I IS NOT NULL AND cardinality(%1$I) > 0', spec.source_column);
                ELSIF column_category = 'S' THEN
                    value_predicate := format('NULLIF(BTRIM(%1$I::TEXT), '''') IS NOT NULL', spec.source_column);
                ELSE
                    value_predicate := format('%1$I IS NOT NULL', spec.source_column);
                END IF;

                EXECUTE format(
                    'SELECT COUNT(*) FILTER (WHERE %s) FROM %I.%I',
                    value_predicate,
                    spec.source_schema,
                    spec.source_relation
                )
                INTO populated;

                status_value := CASE
                    WHEN populated = 0 THEN 'no_values'
                    WHEN base_parcel_count > 0 AND populated >= base_parcel_count THEN 'complete'
                    ELSE 'partial'
                END;
            END IF;
        END IF;

        INSERT INTO property.parcel_field_coverage_audit_results (
            run_id,
            display_order,
            field_family,
            field_name,
            source_schema,
            source_relation,
            source_column,
            source_relation_kind,
            source_row_count,
            total_parcel_count,
            populated_count,
            null_count,
            coverage_percent,
            missing_entirely,
            status,
            notes
        )
        VALUES (
            audit_run_id,
            spec.display_order,
            spec.field_family,
            spec.field_name,
            spec.source_schema,
            spec.source_relation,
            spec.source_column,
            relation_kind,
            source_rows,
            base_parcel_count,
            populated,
            GREATEST(base_parcel_count - LEAST(populated, base_parcel_count), 0),
            CASE
                WHEN base_parcel_count = 0 THEN 0
                ELSE ROUND((populated::NUMERIC / base_parcel_count::NUMERIC) * 100, 2)
            END,
            status_value IN ('relation_missing', 'column_missing', 'no_values'),
            status_value,
            spec.notes
        );
    END LOOP;
END $$;

CREATE OR REPLACE VIEW property.latest_parcel_field_coverage_audit AS
SELECT
    runs.created_at AS run_created_at,
    runs.run_label,
    results.display_order,
    results.field_family,
    results.field_name,
    format('%I.%I', results.source_schema, results.source_relation) AS source_table_or_view,
    results.source_column,
    results.source_relation_kind,
    results.source_row_count,
    results.total_parcel_count,
    results.populated_count,
    results.null_count,
    results.coverage_percent,
    results.missing_entirely,
    results.status,
    results.notes
FROM property.parcel_field_coverage_audit_results results
JOIN property.parcel_field_coverage_audit_runs runs ON runs.id = results.run_id
WHERE results.run_id = (
    SELECT latest.id
    FROM property.parcel_field_coverage_audit_runs latest
    ORDER BY latest.created_at DESC, latest.id DESC
    LIMIT 1
);

CREATE OR REPLACE VIEW property.latest_parcel_field_family_coverage_summary AS
SELECT
    field_family,
    COUNT(*) AS requested_field_count,
    COUNT(*) FILTER (WHERE NOT missing_entirely) AS present_field_count,
    COUNT(*) FILTER (WHERE missing_entirely) AS missing_field_count,
    ROUND(AVG(coverage_percent), 2) AS average_field_coverage_percent,
    MIN(coverage_percent) AS lowest_field_coverage_percent,
    MAX(coverage_percent) AS highest_field_coverage_percent
FROM property.latest_parcel_field_coverage_audit
GROUP BY field_family;

COMMIT;

SELECT
    field_family,
    field_name,
    source_table_or_view,
    source_column,
    populated_count,
    null_count,
    coverage_percent,
    missing_entirely,
    status
FROM property.latest_parcel_field_coverage_audit
ORDER BY display_order, field_family, field_name;
