-- Cartographer spatial intelligence models.
-- Creates tables for saved theses, layers, fit scores, assemblage candidates,
-- hypothetical site plans, and curiosity trails.
-- All tables are scoped by org_id for multi-tenancy.

-- SavedThesis
CREATE TABLE IF NOT EXISTS "saved_thesis" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "weights" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_by" TEXT
);
CREATE INDEX IF NOT EXISTS "idx_saved_thesis_org_id" ON "saved_thesis" ("org_id");
CREATE INDEX IF NOT EXISTS "idx_saved_thesis_org_name" ON "saved_thesis" ("org_id", "name");

-- SavedLayer
CREATE TABLE IF NOT EXISTS "saved_layer" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "layer_type" TEXT NOT NULL,
  "sql_query" TEXT,
  "geojson_snapshot" JSONB,
  "style" JSONB,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_by" TEXT
);
CREATE INDEX IF NOT EXISTS "idx_saved_layer_org_id" ON "saved_layer" ("org_id");
CREATE INDEX IF NOT EXISTS "idx_saved_layer_org_type" ON "saved_layer" ("org_id", "layer_type");

-- SiteFitScore
CREATE TABLE IF NOT EXISTS "site_fit_score" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" TEXT NOT NULL,
  "thesis_id" UUID,
  "thesis_name" TEXT NOT NULL,
  "parcel_id" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "breakdown" JSONB NOT NULL,
  "computed_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_site_fit_score_org_id" ON "site_fit_score" ("org_id");
CREATE INDEX IF NOT EXISTS "idx_site_fit_score_org_thesis" ON "site_fit_score" ("org_id", "thesis_id");
CREATE INDEX IF NOT EXISTS "idx_site_fit_score_org_parcel" ON "site_fit_score" ("org_id", "parcel_id");

-- AssemblageCandidate
CREATE TABLE IF NOT EXISTS "assemblage_candidate" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" TEXT NOT NULL,
  "assemblage_name" TEXT NOT NULL,
  "parcel_ids" JSONB NOT NULL,
  "total_acreage" DOUBLE PRECISION NOT NULL,
  "combined_geometry" JSONB,
  "fit_score" DOUBLE PRECISION,
  "notes" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "computed_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_assemblage_candidate_org_id" ON "assemblage_candidate" ("org_id");
CREATE INDEX IF NOT EXISTS "idx_assemblage_candidate_org_score" ON "assemblage_candidate" ("org_id", "fit_score");

-- HypotheticalSitePlan
CREATE TABLE IF NOT EXISTS "hypothetical_site_plan" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" TEXT NOT NULL,
  "plan_name" TEXT NOT NULL,
  "parcel_ids" JSONB NOT NULL,
  "zones" JSONB NOT NULL,
  "total_acreage" DOUBLE PRECISION NOT NULL,
  "notes" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "computed_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_by" TEXT
);
CREATE INDEX IF NOT EXISTS "idx_hypothetical_site_plan_org_id" ON "hypothetical_site_plan" ("org_id");

-- MapCuriosityTrail
CREATE TABLE IF NOT EXISTS "map_curiosity_trail" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "suggested_actions" JSONB NOT NULL,
  "relevance_score" DOUBLE PRECISION NOT NULL,
  "viewport_bbox" JSONB,
  "accepted" BOOLEAN NOT NULL DEFAULT false,
  "dismissed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_by" TEXT
);
CREATE INDEX IF NOT EXISTS "idx_map_curiosity_trail_org_id" ON "map_curiosity_trail" ("org_id");
CREATE INDEX IF NOT EXISTS "idx_map_curiosity_trail_org_accepted" ON "map_curiosity_trail" ("org_id", "accepted");
