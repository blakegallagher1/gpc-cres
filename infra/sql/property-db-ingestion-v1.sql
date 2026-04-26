-- =============================================================================
-- Property DB Ingestion Contract v1
-- =============================================================================
-- Purpose:
--   Stage, validate, and transactionally promote parcel import runs without
--   hand-editing the canonical public.ebr_parcels table.
--
-- Guarantees:
--   - Every import has metadata in property.import_runs.
--   - Rows are loaded into staging.parcels_import_rows before promotion.
--   - Validation checks geometry validity, SRID, parcel identifiers, parish
--     consistency, duplicate source rows, and expected row counts.
--   - Promotion deletes matching parcel ids for the run/parish and reinserts
--     staged rows in one transaction.
--
-- Safe to rerun. Does not promote rows unless property.promote_parcel_import()
-- is explicitly called.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS property;
CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE IF NOT EXISTS property.import_runs (
  import_run_id text PRIMARY KEY,
  source_name text NOT NULL,
  source_uri text,
  source_sha256 text,
  parish text NOT NULL,
  expected_row_count bigint,
  status text NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged', 'validated', 'promoted', 'failed')),
  validation_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  promoted_at timestamptz,
  promoted_row_count bigint,
  notes text
);

CREATE TABLE IF NOT EXISTS staging.parcels_import_rows (
  import_run_id text NOT NULL REFERENCES property.import_runs(import_run_id) ON DELETE CASCADE,
  source_row_number integer NOT NULL,
  parcel_id text NOT NULL,
  address text,
  area_sqft integer,
  owner text,
  assessed_value numeric,
  geom geometry(Geometry, 4326) NOT NULL,
  zoning_type text,
  existing_land_use text,
  future_land_use text,
  parish text NOT NULL,
  acreage numeric,
  flood_zone text,
  centroid geometry(Point, 4326),
  zip text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (import_run_id, source_row_number)
);

CREATE INDEX IF NOT EXISTS idx_parcels_import_rows_run
  ON staging.parcels_import_rows (import_run_id);
CREATE INDEX IF NOT EXISTS idx_parcels_import_rows_run_parish_parcel
  ON staging.parcels_import_rows (import_run_id, parish, parcel_id);
CREATE INDEX IF NOT EXISTS idx_parcels_import_rows_geom
  ON staging.parcels_import_rows USING gist (geom);

CREATE OR REPLACE FUNCTION property.validate_parcel_import(
  p_import_run_id text,
  p_max_expected_delta numeric DEFAULT 0.05
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  run_record property.import_runs%ROWTYPE;
  row_count bigint;
  invalid_geom_count bigint;
  bad_srid_count bigint;
  missing_parcel_count bigint;
  parish_mismatch_count bigint;
  duplicate_count bigint;
  expected_ok boolean;
  report jsonb;
  is_ok boolean;
BEGIN
  SELECT *
  INTO run_record
  FROM property.import_runs
  WHERE import_run_id = p_import_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import run % does not exist', p_import_run_id;
  END IF;

  SELECT COUNT(*)::bigint
  INTO row_count
  FROM staging.parcels_import_rows
  WHERE import_run_id = p_import_run_id;

  SELECT COUNT(*)::bigint
  INTO invalid_geom_count
  FROM staging.parcels_import_rows
  WHERE import_run_id = p_import_run_id
    AND NOT ST_IsValid(geom);

  SELECT COUNT(*)::bigint
  INTO bad_srid_count
  FROM staging.parcels_import_rows
  WHERE import_run_id = p_import_run_id
    AND ST_SRID(geom) <> 4326;

  SELECT COUNT(*)::bigint
  INTO missing_parcel_count
  FROM staging.parcels_import_rows
  WHERE import_run_id = p_import_run_id
    AND length(trim(parcel_id)) = 0;

  SELECT COUNT(*)::bigint
  INTO parish_mismatch_count
  FROM staging.parcels_import_rows
  WHERE import_run_id = p_import_run_id
    AND parish <> run_record.parish;

  SELECT COALESCE(SUM(duplicate_rows - 1), 0)::bigint
  INTO duplicate_count
  FROM (
    SELECT parish, parcel_id, COUNT(*)::bigint AS duplicate_rows
    FROM staging.parcels_import_rows
    WHERE import_run_id = p_import_run_id
    GROUP BY parish, parcel_id
    HAVING COUNT(*) > 1
  ) duplicates;

  expected_ok := run_record.expected_row_count IS NULL OR (
    row_count BETWEEN
      floor(run_record.expected_row_count * (1 - p_max_expected_delta))::bigint
      AND ceil(run_record.expected_row_count * (1 + p_max_expected_delta))::bigint
  );

  is_ok := row_count > 0
    AND invalid_geom_count = 0
    AND bad_srid_count = 0
    AND missing_parcel_count = 0
    AND parish_mismatch_count = 0
    AND duplicate_count = 0
    AND expected_ok;

  report := jsonb_build_object(
    'ok', is_ok,
    'importRunId', p_import_run_id,
    'parish', run_record.parish,
    'rowCount', row_count,
    'expectedRowCount', run_record.expected_row_count,
    'checks', jsonb_build_object(
      'hasRows', row_count > 0,
      'validGeometries', invalid_geom_count = 0,
      'srid4326', bad_srid_count = 0,
      'parcelIdsPresent', missing_parcel_count = 0,
      'parishMatchesRun', parish_mismatch_count = 0,
      'noDuplicateParcelsInRun', duplicate_count = 0,
      'expectedRowCountWithinDelta', expected_ok
    ),
    'failures', jsonb_build_object(
      'invalidGeometryRows', invalid_geom_count,
      'badSridRows', bad_srid_count,
      'missingParcelIdRows', missing_parcel_count,
      'parishMismatchRows', parish_mismatch_count,
      'duplicateParcelRows', duplicate_count
    )
  );

  UPDATE property.import_runs
  SET status = CASE WHEN is_ok THEN 'validated' ELSE 'failed' END,
      validation_report = report,
      validated_at = now()
  WHERE import_run_id = p_import_run_id;

  RETURN report;
END;
$$;

CREATE OR REPLACE FUNCTION property.promote_parcel_import(
  p_import_run_id text,
  p_max_expected_delta numeric DEFAULT 0.05
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  run_record property.import_runs%ROWTYPE;
  validation_result jsonb;
  deleted_count bigint;
  inserted_count bigint;
BEGIN
  validation_result := property.validate_parcel_import(p_import_run_id, p_max_expected_delta);
  IF NOT (validation_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'Import run % failed validation: %', p_import_run_id, validation_result::text;
  END IF;

  SELECT *
  INTO run_record
  FROM property.import_runs
  WHERE import_run_id = p_import_run_id
  FOR UPDATE;

  DELETE FROM public.ebr_parcels existing
  USING staging.parcels_import_rows staged
  WHERE staged.import_run_id = p_import_run_id
    AND existing.parish = staged.parish
    AND existing.parcel_id = staged.parcel_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  INSERT INTO public.ebr_parcels (
    id,
    parcel_id,
    address,
    area_sqft,
    owner,
    assessed_value,
    geom,
    created_at,
    zoning_type,
    existing_land_use,
    future_land_use,
    parish,
    acreage,
    flood_zone,
    centroid,
    zip
  )
  SELECT
    gen_random_uuid(),
    parcel_id,
    address,
    COALESCE(area_sqft, CASE WHEN acreage IS NULL THEN NULL ELSE round(acreage * 43560)::integer END),
    owner,
    assessed_value,
    geom,
    now(),
    zoning_type,
    existing_land_use,
    future_land_use,
    parish,
    COALESCE(acreage, CASE WHEN area_sqft IS NULL THEN NULL ELSE area_sqft::numeric / 43560 END),
    flood_zone,
    COALESCE(centroid, ST_PointOnSurface(geom)::geometry(Point, 4326)),
    zip
  FROM staging.parcels_import_rows
  WHERE import_run_id = p_import_run_id
  ORDER BY source_row_number;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  UPDATE property.import_runs
  SET status = 'promoted',
      promoted_at = now(),
      promoted_row_count = inserted_count,
      validation_report = validation_result || jsonb_build_object(
        'promoted', true,
        'deletedRows', deleted_count,
        'insertedRows', inserted_count
      )
  WHERE import_run_id = p_import_run_id;

  RETURN jsonb_build_object(
    'ok', true,
    'importRunId', p_import_run_id,
    'parish', run_record.parish,
    'deletedRows', deleted_count,
    'insertedRows', inserted_count
  );
END;
$$;

INSERT INTO property.contract_versions (contract_key, version, description, applied_at)
VALUES (
  'property.ingestion',
  'property-db-ingestion-v1',
  'Staging, validation, and transactional promotion contract for parcel imports.',
  now()
)
ON CONFLICT (contract_key) DO UPDATE
SET version = EXCLUDED.version,
    description = EXCLUDED.description,
    applied_at = EXCLUDED.applied_at;

DO $$
DECLARE
  target_role text;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA property TO %I', target_role);
      EXECUTE format('GRANT USAGE ON SCHEMA staging TO %I', target_role);
      EXECUTE format('GRANT SELECT ON property.import_runs TO %I', target_role);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON staging.parcels_import_rows TO %I', target_role);
      EXECUTE format('GRANT EXECUTE ON FUNCTION property.validate_parcel_import(text, numeric) TO %I', target_role);
      EXECUTE format('GRANT EXECUTE ON FUNCTION property.promote_parcel_import(text, numeric) TO %I', target_role);
    END IF;
  END LOOP;
END $$;

COMMIT;
