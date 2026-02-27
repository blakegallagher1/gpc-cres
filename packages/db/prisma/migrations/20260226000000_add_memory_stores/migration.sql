-- CreateTable
CREATE TABLE "MemoryDraft" (
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
CREATE TABLE "MemoryVerified" (
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
CREATE TABLE "MemoryRejected" (
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
CREATE INDEX "idx_draft_entity" ON "MemoryDraft"("entity_id");
CREATE INDEX "idx_draft_fact_type" ON "MemoryDraft"("fact_type");

-- CreateIndex
CREATE INDEX "idx_verified_entity" ON "MemoryVerified"("entity_id");
CREATE INDEX "idx_verified_fact_type" ON "MemoryVerified"("fact_type");

-- CreateIndex
CREATE INDEX "idx_rejected_entity" ON "MemoryRejected"("entity_id");

-- AddForeignKey
ALTER TABLE "MemoryDraft" ADD CONSTRAINT "MemoryDraft_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "internal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryVerified" ADD CONSTRAINT "MemoryVerified_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "internal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryRejected" ADD CONSTRAINT "MemoryRejected_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "internal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
