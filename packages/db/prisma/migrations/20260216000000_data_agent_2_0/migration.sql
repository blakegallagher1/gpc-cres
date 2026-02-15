-- Data Agent 2.0 memory and retrieval migration.
-- Creates episodic memory tables, reinforcement table, temporal graph tables,
-- and vector/trigram support for hybrid retrieval.

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE IN ('42501', '42710', '58P01') THEN
        RAISE NOTICE 'Could not install pg_trgm extension in this environment; continuing with fallback sparse search.';
      ELSE
        RAISE;
      END IF;
  END;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
  ELSIF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pgvector') THEN
    CREATE EXTENSION IF NOT EXISTS pgvector;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "KnowledgeEmbedding" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "content_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "content_text" TEXT NOT NULL,
  "embedding" DOUBLE PRECISION[],
  "vector_embedding" DOUBLE PRECISION[],
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  BEGIN
    ALTER TABLE "KnowledgeEmbedding"
      ALTER COLUMN "embedding" TYPE vector(1536) USING NULL;
    ALTER TABLE "KnowledgeEmbedding"
      ALTER COLUMN "vector_embedding" TYPE vector(1536) USING NULL;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE = '42704' THEN
        RAISE NOTICE 'pgvector is unavailable on this cluster; keeping vector columns as double precision arrays.';
      ELSE
        RAISE;
      END IF;
  END;
END $$;

CREATE TABLE IF NOT EXISTS "Episode" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "agent_intent" TEXT NOT NULL,
  "evidence_hash" TEXT NOT NULL,
  "retrieval_meta" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "model_outputs" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "confidence" DOUBLE PRECISION,
  "outcome_signal" TEXT,
  "next_state_hash" TEXT,
  "summary" TEXT
);

CREATE TABLE IF NOT EXISTS "KGEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "subject_id" TEXT NOT NULL,
  "predicate" TEXT NOT NULL,
  "object_id" TEXT NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "source_hash" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "TemporalEdge" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "from_event" UUID NOT NULL,
  "to_event" UUID NOT NULL,
  "relation" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "RewardSignal" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "episode_id" UUID NOT NULL,
  "user_score" INTEGER NOT NULL,
  "auto_score" DOUBLE PRECISION NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  BEGIN
    CREATE INDEX IF NOT EXISTS "idx_episode_summary_trgm" ON "Episode" USING GIN ("summary" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "idx_kgevent_subject_trgm" ON "KGEvent" USING GIN ("subject_id" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "idx_kgevent_predicate_trgm" ON "KGEvent" USING GIN ("predicate" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "idx_kgevent_object_trgm" ON "KGEvent" USING GIN ("object_id" gin_trgm_ops);
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE = '42704' THEN
        RAISE NOTICE 'Skipping trigram indexes because pg_trgm operators are not available in this environment.';
      ELSE
        RAISE;
      END IF;
  END;
END $$;
