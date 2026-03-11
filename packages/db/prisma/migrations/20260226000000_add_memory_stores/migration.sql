-- CreateTable
CREATE TABLE IF NOT EXISTS "internal_entities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "canonical_address" TEXT,
    "parcel_id" TEXT,
    "type" TEXT NOT NULL DEFAULT 'property',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "memory_event_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "deal_id" UUID,
    "thread_id" TEXT,
    "user_id" UUID,
    "source_type" TEXT NOT NULL,
    "fact_type" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "conflict_flag" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" TEXT NOT NULL,
    "model_trace_id" TEXT,
    "tool_name" TEXT,
    "latency_ms" INTEGER,
    "token_usage" INTEGER,
    "cost_usd" DOUBLE PRECISION,

    CONSTRAINT "memory_event_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "memory_source_registry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "source_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "reliability" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_source_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MemoryDraft" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "fact_type" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "economic_weight" DOUBLE PRECISION NOT NULL,
    "volatility_class" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "conflict_flag" BOOLEAN NOT NULL DEFAULT false,
    "request_id" TEXT NOT NULL,
    "event_log_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MemoryVerified" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "fact_type" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "economic_weight" DOUBLE PRECISION NOT NULL,
    "volatility_class" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "request_id" TEXT NOT NULL,
    "event_log_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryVerified_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MemoryRejected" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "fact_type" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "rejection_reason" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "event_log_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryRejected_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "internal_entities_org_id_canonical_address_key"
  ON "internal_entities"("org_id", "canonical_address");
CREATE INDEX IF NOT EXISTS "internal_entities_parcel_id_idx" ON "internal_entities"("parcel_id");
CREATE INDEX IF NOT EXISTS "internal_entities_type_idx" ON "internal_entities"("type");
CREATE UNIQUE INDEX IF NOT EXISTS "memory_source_registry_source_key_key"
  ON "memory_source_registry"("source_key");
CREATE INDEX IF NOT EXISTS "memory_event_log_entity_id_idx" ON "memory_event_log"("entity_id");
CREATE INDEX IF NOT EXISTS "memory_event_log_deal_id_idx" ON "memory_event_log"("deal_id");
CREATE INDEX IF NOT EXISTS "memory_event_log_request_id_idx" ON "memory_event_log"("request_id");
CREATE INDEX IF NOT EXISTS "memory_event_log_status_idx" ON "memory_event_log"("status");
CREATE INDEX IF NOT EXISTS "memory_event_log_timestamp_idx" ON "memory_event_log"("timestamp");
CREATE INDEX IF NOT EXISTS "memory_event_log_fact_type_idx" ON "memory_event_log"("fact_type");
CREATE INDEX IF NOT EXISTS "memory_event_log_source_type_idx" ON "memory_event_log"("source_type");
CREATE INDEX IF NOT EXISTS "idx_draft_entity" ON "MemoryDraft"("entity_id");
CREATE INDEX IF NOT EXISTS "idx_draft_fact_type" ON "MemoryDraft"("fact_type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_verified_entity" ON "MemoryVerified"("entity_id");
CREATE INDEX IF NOT EXISTS "idx_verified_fact_type" ON "MemoryVerified"("fact_type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_rejected_entity" ON "MemoryRejected"("entity_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'internal_entities_org_id_fkey'
  ) THEN
    ALTER TABLE "internal_entities"
      ADD CONSTRAINT "internal_entities_org_id_fkey"
      FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'memory_event_log_org_id_fkey'
  ) THEN
    ALTER TABLE "memory_event_log"
      ADD CONSTRAINT "memory_event_log_org_id_fkey"
      FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'memory_event_log_entity_id_fkey'
  ) THEN
    ALTER TABLE "memory_event_log"
      ADD CONSTRAINT "memory_event_log_entity_id_fkey"
      FOREIGN KEY ("entity_id") REFERENCES "internal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'memory_source_registry_org_id_fkey'
  ) THEN
    ALTER TABLE "memory_source_registry"
      ADD CONSTRAINT "memory_source_registry_org_id_fkey"
      FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MemoryDraft_entity_id_fkey'
  ) THEN
    ALTER TABLE "MemoryDraft"
      ADD CONSTRAINT "MemoryDraft_entity_id_fkey"
      FOREIGN KEY ("entity_id") REFERENCES "internal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MemoryVerified_entity_id_fkey'
  ) THEN
    ALTER TABLE "MemoryVerified"
      ADD CONSTRAINT "MemoryVerified_entity_id_fkey"
      FOREIGN KEY ("entity_id") REFERENCES "internal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MemoryRejected_entity_id_fkey'
  ) THEN
    ALTER TABLE "MemoryRejected"
      ADD CONSTRAINT "MemoryRejected_entity_id_fkey"
      FOREIGN KEY ("entity_id") REFERENCES "internal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
