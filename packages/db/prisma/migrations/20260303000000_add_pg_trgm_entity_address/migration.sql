-- Enable pg_trgm extension for trigram-based fuzzy string matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index on canonical_address for fast similarity() lookups
-- Replaces the O(n) Jaccard JS loop in EntityResolutionService.findFuzzyMatch()
CREATE INDEX IF NOT EXISTS idx_internal_entities_address_trgm
  ON "internal_entities" USING GIN ("canonical_address" gin_trgm_ops);
