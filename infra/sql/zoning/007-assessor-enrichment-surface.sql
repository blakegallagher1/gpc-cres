-- Assessor enrichment surface
--
-- Rerun before loading assessor field enrichments:
--   psql "$DATABASE_URL" -f infra/sql/zoning/007-assessor-enrichment-surface.sql
--
-- This table stores official assessor fields that are wider than the canonical
-- public.ebr_parcels import contract, keyed by parish + source parcel id.

BEGIN;

CREATE SCHEMA IF NOT EXISTS property;

CREATE TABLE IF NOT EXISTS property.parcel_assessor_enrichment (
    parish TEXT NOT NULL,
    parcel_id TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_uri TEXT NOT NULL,
    owner_mailing_address TEXT,
    owner_city_state_zip TEXT,
    site_address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    legal_description TEXT,
    land_value NUMERIC,
    improvement_value NUMERIC,
    market_value NUMERIC,
    assessed_value NUMERIC,
    sale_year INTEGER,
    sale_date DATE,
    sale_price NUMERIC,
    tax_amount NUMERIC,
    flood_zone TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_row_updated_at TIMESTAMPTZ,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (parish, parcel_id)
);

CREATE INDEX IF NOT EXISTS idx_parcel_assessor_enrichment_parish
    ON property.parcel_assessor_enrichment(parish);
CREATE INDEX IF NOT EXISTS idx_parcel_assessor_enrichment_owner_mailing
    ON property.parcel_assessor_enrichment(parish, owner_mailing_address)
    WHERE owner_mailing_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parcel_assessor_enrichment_values
    ON property.parcel_assessor_enrichment(parish, market_value, assessed_value)
    WHERE market_value IS NOT NULL OR assessed_value IS NOT NULL;

COMMIT;
