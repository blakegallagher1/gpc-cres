-- Add org_id to knowledge_embeddings for multi-tenant isolation
ALTER TABLE "knowledge_embeddings" ADD COLUMN "org_id" UUID NOT NULL DEFAULT gen_random_uuid();

-- Remove the DEFAULT after backfill (column must be NOT NULL but no rows exist yet in prod)
ALTER TABLE "knowledge_embeddings" ALTER COLUMN "org_id" DROP DEFAULT;

-- Index for fast per-org queries
CREATE INDEX "knowledge_embeddings_org_id_idx" ON "knowledge_embeddings"("org_id");
