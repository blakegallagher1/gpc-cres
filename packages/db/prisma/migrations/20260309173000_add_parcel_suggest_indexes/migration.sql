-- Improve org-scoped parcel suggestion lookups.
CREATE INDEX IF NOT EXISTS idx_parcels_org_address_prefix
  ON "parcels" ("org_id", lower("address") text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_parcels_org_property_db_id_prefix
  ON "parcels" ("org_id", "property_db_id");

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_parcels_address_trgm
  ON "parcels" USING GIN (lower("address") gin_trgm_ops);
