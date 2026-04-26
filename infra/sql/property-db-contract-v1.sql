-- =============================================================================
-- Property DB Contract v1
-- =============================================================================
-- Purpose:
--   Make the live parcel database contract explicit and repeatable.
--
-- Guarantees:
--   - property.parcels is the canonical parcel view.
--   - public.ebr_parcels remains the legacy physical table.
--   - parish filtering is supported by an index on public.ebr_parcels.
--   - property.contract_versions records the applied contract version.
--
-- Safe to rerun. Does not drop tables or mutate parcel rows.
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS property;

CREATE TABLE IF NOT EXISTS property.contract_versions (
  contract_key text PRIMARY KEY,
  version text NOT NULL,
  description text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW property.parcels AS
SELECT
  p.id,
  p.parish,
  p.parcel_id AS parcel_uid,
  p.owner AS owner_name,
  p.address AS situs_address,
  NULL::text AS legal_desc,
  (p.area_sqft / 43560.0)::numeric AS acreage,
  p.geom,
  p.flood_zone,
  p.zoning_type,
  lower(regexp_replace(coalesce(nullif(p.parish, ''), 'unknown'), '[^a-z0-9]+', '_', 'g'))::text AS source_key,
  p.created_at AS ingested_at,
  p.parcel_id,
  p.address,
  p.owner,
  p.zip
FROM public.ebr_parcels p
WHERE p.geom IS NOT NULL;

CREATE OR REPLACE VIEW property.v_parcel_search AS
SELECT
  p.id,
  lower(concat_ws(' ',
    p.parcel_id,
    coalesce(p.address, ''),
    coalesce(p.owner, '')
  )) AS search_text
FROM public.ebr_parcels p;

CREATE INDEX IF NOT EXISTS idx_ebr_parcels_parish_parcel_id
  ON public.ebr_parcels (parish, parcel_id)
  WHERE parish IS NOT NULL;

INSERT INTO property.contract_versions (contract_key, version, description, applied_at)
VALUES (
  'property.parcels',
  'property-db-contract-v1',
  'Canonical multi-parish parcel view over public.ebr_parcels with indexed parish filtering.',
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
      EXECUTE format('GRANT SELECT ON property.parcels TO %I', target_role);
      EXECUTE format('GRANT SELECT ON property.v_parcel_search TO %I', target_role);
      EXECUTE format('GRANT SELECT ON property.contract_versions TO %I', target_role);
    END IF;
  END LOOP;
END $$;

COMMIT;
