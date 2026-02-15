-- Add lineage and evidence coverage metadata to parish pack versions.
ALTER TABLE "parish_pack_versions"
  ADD COLUMN IF NOT EXISTS "source_evidence_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "source_snapshot_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "source_content_hashes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "official_only" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "source_urls" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "pack_coverage_score" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "canonical_schema_version" TEXT,
  ADD COLUMN IF NOT EXISTS "coverage_source_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "input_hash" TEXT;
