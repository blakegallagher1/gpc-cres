-- CreateTable: knowledge_embeddings (with org_id for multi-tenant isolation)
-- The table was defined in schema.prisma but never successfully created in production.
-- Creating the full table here with org_id built in.
-- Requires pgvector extension (CREATE EXTENSION vector) to be installed.

CREATE TABLE IF NOT EXISTS "knowledge_embeddings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "content_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "content_text" TEXT NOT NULL,
    "embedding" vector(1536),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_embeddings_pkey" PRIMARY KEY ("id")
);

-- Indexes for fast per-org, per-type, and per-source queries
CREATE INDEX IF NOT EXISTS "knowledge_embeddings_org_id_idx" ON "knowledge_embeddings"("org_id");
CREATE INDEX IF NOT EXISTS "knowledge_embeddings_content_type_idx" ON "knowledge_embeddings"("content_type");
CREATE INDEX IF NOT EXISTS "knowledge_embeddings_source_id_idx" ON "knowledge_embeddings"("source_id");
