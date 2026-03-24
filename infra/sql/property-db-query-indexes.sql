-- Property DB Query Indexes
-- Run via SSH or cloudflared proxy against the entitlement_os database.
-- All use CREATE INDEX CONCURRENTLY for zero-downtime creation.
--
-- Usage:
--   cloudflared access tcp --hostname db.gallagherpropco.com --url localhost:54399
--   psql postgresql://postgres:postgres@localhost:54399/entitlement_os -f infra/sql/property-db-query-indexes.sql
--
-- NOTE: CONCURRENTLY cannot run inside a transaction block.
--       Use psql (not pgAdmin/DBeaver) and do NOT wrap in BEGIN/COMMIT.

-- 1. Zoning type lookup (most common filter)
--    Normalizes C-2/C2/c-2 to uppercase no-hyphen form
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ebr_parcels_zoning_type
  ON ebr_parcels (upper(replace(zoning_type, '-', '')));

-- 2. Area for acreage sorts/filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ebr_parcels_area_sqft
  ON ebr_parcels (area_sqft DESC NULLS LAST);

-- 3. Composite for "largest parcels with zoning X" pattern
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ebr_parcels_zoning_area
  ON ebr_parcels (upper(replace(zoning_type, '-', '')), area_sqft DESC NULLS LAST)
  WHERE zoning_type IS NOT NULL AND area_sqft IS NOT NULL;

-- 4. Primary key lookup on parcel_id (critical for D1 sync keyset pagination)
--    Added 2026-03-24. Improved query speed from 18 rows/s to 1,087 rows/s.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ebr_parcels_parcel_id
  ON ebr_parcels (parcel_id);
