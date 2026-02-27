-- AlterTable: Add confidenceVector to MemoryDraft
ALTER TABLE "MemoryDraft" ADD COLUMN "confidence_vector" JSONB;

-- AlterTable: Add confidenceVector to MemoryVerified
ALTER TABLE "MemoryVerified" ADD COLUMN "confidence_vector" JSONB;

-- AlterTable: Add causalMetadata to MemoryEventLog
ALTER TABLE "memory_event_log" ADD COLUMN "causal_metadata" JSONB;

-- CreateTable: CausalImpactTrace
CREATE TABLE "causal_impact_traces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "origin_event_id" UUID NOT NULL,
    "source_domain" TEXT NOT NULL,
    "target_domain" TEXT NOT NULL,
    "impact_delta" DOUBLE PRECISION NOT NULL,
    "impact_cap" DOUBLE PRECISION NOT NULL,
    "clamped_delta" DOUBLE PRECISION NOT NULL,
    "propagation_path" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "causal_impact_traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable: InnovationQueue
CREATE TABLE "innovation_queue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "memory_verified_id" UUID,
    "memory_draft_id" UUID,
    "fact_type" TEXT NOT NULL,
    "source_reliability" DOUBLE PRECISION NOT NULL,
    "agreement_score" DOUBLE PRECISION NOT NULL,
    "novelty_reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_decision" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "innovation_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CounterfactualDealLog
CREATE TABLE "counterfactual_deal_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "outcome" TEXT NOT NULL,
    "rejection_reason" TEXT,
    "stage_at_close" TEXT NOT NULL,
    "projection_snapshot" JSONB,
    "actual_metrics" JSONB,
    "lessons_learned" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "counterfactual_deal_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EntityCollisionAlert
CREATE TABLE "entity_collision_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "entity_id_a" UUID NOT NULL,
    "entity_id_b" UUID NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "address_a" TEXT NOT NULL,
    "address_b" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "resolution" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "entity_collision_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DriftFreezeState
CREATE TABLE "drift_freeze_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "segment_id" UUID NOT NULL,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "consecutive_worsenings" INTEGER NOT NULL DEFAULT 0,
    "last_mae" DOUBLE PRECISION,
    "previous_mae" DOUBLE PRECISION,
    "frozen_at" TIMESTAMPTZ(6),
    "unfrozen_at" TIMESTAMPTZ(6),
    "unfrozen_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "drift_freeze_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_causal_trace_entity" ON "causal_impact_traces"("entity_id");
CREATE INDEX "idx_causal_trace_origin" ON "causal_impact_traces"("origin_event_id");
CREATE INDEX "idx_causal_trace_domains" ON "causal_impact_traces"("source_domain", "target_domain");

CREATE INDEX "idx_innovation_entity" ON "innovation_queue"("entity_id");
CREATE INDEX "idx_innovation_status" ON "innovation_queue"("status");

CREATE INDEX "idx_counterfactual_deal" ON "counterfactual_deal_logs"("deal_id");
CREATE INDEX "idx_counterfactual_outcome" ON "counterfactual_deal_logs"("outcome");

CREATE INDEX "idx_collision_entity_a" ON "entity_collision_alerts"("entity_id_a");
CREATE INDEX "idx_collision_entity_b" ON "entity_collision_alerts"("entity_id_b");
CREATE INDEX "idx_collision_status" ON "entity_collision_alerts"("status");

CREATE UNIQUE INDEX "uq_drift_freeze_segment" ON "drift_freeze_states"("org_id", "segment_id");

-- AddForeignKey
ALTER TABLE "causal_impact_traces" ADD CONSTRAINT "causal_impact_traces_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "causal_impact_traces" ADD CONSTRAINT "causal_impact_traces_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "internal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "innovation_queue" ADD CONSTRAINT "innovation_queue_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "innovation_queue" ADD CONSTRAINT "innovation_queue_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "internal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "counterfactual_deal_logs" ADD CONSTRAINT "counterfactual_deal_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "counterfactual_deal_logs" ADD CONSTRAINT "counterfactual_deal_logs_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "entity_collision_alerts" ADD CONSTRAINT "entity_collision_alerts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entity_collision_alerts" ADD CONSTRAINT "entity_collision_alerts_entity_id_a_fkey" FOREIGN KEY ("entity_id_a") REFERENCES "internal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "drift_freeze_states" ADD CONSTRAINT "drift_freeze_states_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
