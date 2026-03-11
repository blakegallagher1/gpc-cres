-- CreateEnum
CREATE TYPE "public"."alert_frequency" AS ENUM ('REALTIME', 'DAILY', 'WEEKLY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."artifact_type" ADD VALUE 'INVESTMENT_MEMO_PDF';
ALTER TYPE "public"."artifact_type" ADD VALUE 'OFFERING_MEMO_PDF';
ALTER TYPE "public"."artifact_type" ADD VALUE 'COMP_ANALYSIS_PDF';
ALTER TYPE "public"."artifact_type" ADD VALUE 'IC_DECK_PPTX';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."run_type" ADD VALUE 'SOURCE_INGEST';
ALTER TYPE "public"."run_type" ADD VALUE 'OPPORTUNITY_SCAN';
ALTER TYPE "public"."run_type" ADD VALUE 'DEADLINE_MONITOR';

-- DropForeignKey
ALTER TABLE "public"."CalibrationRecord" DROP CONSTRAINT "CalibrationRecord_segment_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."capital_sources" DROP CONSTRAINT "capital_sources_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."capital_sources" DROP CONSTRAINT "capital_sources_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."deal_financings" DROP CONSTRAINT "deal_financings_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."deal_financings" DROP CONSTRAINT "deal_financings_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."deal_financings" DROP CONSTRAINT "deal_financings_source_upload_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."deal_outcomes" DROP CONSTRAINT "deal_outcomes_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."deal_stakeholders" DROP CONSTRAINT "deal_stakeholders_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."deal_stakeholders" DROP CONSTRAINT "deal_stakeholders_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."deal_terms" DROP CONSTRAINT "deal_terms_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."deal_terms" DROP CONSTRAINT "deal_terms_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."development_budgets" DROP CONSTRAINT "development_budgets_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."development_budgets" DROP CONSTRAINT "development_budgets_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."entitlement_paths" DROP CONSTRAINT "entitlement_paths_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."entitlement_paths" DROP CONSTRAINT "entitlement_paths_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."environmental_assessments" DROP CONSTRAINT "environmental_assessments_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."environmental_assessments" DROP CONSTRAINT "environmental_assessments_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."environmental_assessments" DROP CONSTRAINT "environmental_assessments_source_upload_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."equity_waterfalls" DROP CONSTRAINT "equity_waterfalls_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."equity_waterfalls" DROP CONSTRAINT "equity_waterfalls_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."notification_preferences" DROP CONSTRAINT "notification_preferences_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."notifications" DROP CONSTRAINT "notifications_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."notifications" DROP CONSTRAINT "notifications_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."notifications" DROP CONSTRAINT "notifications_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."proactive_actions" DROP CONSTRAINT "proactive_actions_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."proactive_actions" DROP CONSTRAINT "proactive_actions_trigger_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."proactive_actions" DROP CONSTRAINT "proactive_actions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."proactive_triggers" DROP CONSTRAINT "proactive_triggers_created_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."proactive_triggers" DROP CONSTRAINT "proactive_triggers_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."property_surveys" DROP CONSTRAINT "property_surveys_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."property_surveys" DROP CONSTRAINT "property_surveys_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."property_titles" DROP CONSTRAINT "property_titles_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."property_titles" DROP CONSTRAINT "property_titles_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."saved_geofences" DROP CONSTRAINT "saved_geofences_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."saved_geofences" DROP CONSTRAINT "saved_geofences_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."tenant_leases" DROP CONSTRAINT "tenant_leases_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."tenant_leases" DROP CONSTRAINT "tenant_leases_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."tenant_leases" DROP CONSTRAINT "tenant_leases_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."tenants" DROP CONSTRAINT "tenants_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."tenants" DROP CONSTRAINT "tenants_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."tool_execution_metrics" DROP CONSTRAINT "tool_execution_metrics_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."tool_execution_metrics" DROP CONSTRAINT "tool_execution_metrics_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_preferences" DROP CONSTRAINT "user_preferences_org_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_preferences" DROP CONSTRAINT "user_preferences_user_id_fkey";

-- DropIndex
DROP INDEX "public"."deal_terms_deal_id_idx";

-- DropIndex
DROP INDEX "public"."entitlement_paths_deal_id_idx";

-- DropIndex
DROP INDEX "public"."idx_internal_entities_address_trgm";

-- AlterTable
ALTER TABLE "public"."CalibrationRecord" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."CalibrationSegment" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."MemoryDraft" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."MemoryRejected" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."MemoryVerified" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."automation_events" ADD COLUMN     "org_id" UUID NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."capital_deployments" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."capital_sources" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."causal_impact_traces" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."counterfactual_deal_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."deal_financings" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."deal_outcomes" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."deal_stakeholders" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."deal_terms" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."development_budgets" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."domain_docs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."drift_freeze_states" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."entities" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."entitlement_paths" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."entity_collision_alerts" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."environmental_assessments" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."episodic_entries" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."equity_waterfalls" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."eval_results" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."innovation_queue" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."internal_entities" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."knowledge_embeddings" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."memory_event_log" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."memory_feedback" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."memory_source_registry" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."notification_preferences" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."notifications" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."parcels" ADD COLUMN     "env_notes" TEXT,
ADD COLUMN     "flood_zone" TEXT,
ADD COLUMN     "soils_notes" TEXT,
ADD COLUMN     "traffic_notes" TEXT,
ADD COLUMN     "wetlands_notes" TEXT;

-- AlterTable
ALTER TABLE "public"."proactive_actions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."proactive_triggers" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "trigger_config" DROP DEFAULT,
ALTER COLUMN "conditions" DROP DEFAULT,
ALTER COLUMN "action_config" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."procedural_skills" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."property_surveys" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."property_titles" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."semantic_facts" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."tax_events" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."tenant_leases" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."tenants" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."tool_execution_metrics" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."tool_specs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."trajectory_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."uploads" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'available';

-- AlterTable
ALTER TABLE "public"."user_preferences" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "value" DROP DEFAULT;

-- DropTable
DROP TABLE "public"."Episode";

-- DropTable
DROP TABLE "public"."KGEvent";

-- DropTable
DROP TABLE "public"."KnowledgeEmbedding";

-- DropTable
DROP TABLE "public"."RewardSignal";

-- DropTable
DROP TABLE "public"."TemporalEdge";

-- DropTable
DROP TABLE "public"."saved_geofences";

-- CreateTable
CREATE TABLE "public"."approval_requests" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "stage_from" TEXT NOT NULL,
    "stage_to" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewer_notes" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "supporting_data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."assumption_actuals" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "assumption_name" TEXT NOT NULL,
    "projected_value" DECIMAL(14,4) NOT NULL,
    "actual_value" DECIMAL(14,4),
    "variance_pct" DECIMAL(8,4),
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assumption_actuals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."conversations" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "deal_id" UUID,
    "user_id" UUID NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."deal_risks" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "category" TEXT,
    "title" TEXT,
    "description" TEXT,
    "severity" TEXT,
    "status" TEXT,
    "owner" TEXT,
    "source" TEXT,
    "score" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deal_risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."document_extractions" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "upload_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "extracted_data" JSONB NOT NULL DEFAULT '{}',
    "raw_text" TEXT,
    "confidence" DECIMAL(4,3) NOT NULL DEFAULT 0,
    "extracted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."market_data_points" (
    "id" UUID NOT NULL,
    "parish" TEXT NOT NULL,
    "data_type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "market_data_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "agent_name" TEXT,
    "tool_calls" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."opportunity_matches" (
    "id" UUID NOT NULL,
    "saved_search_id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "match_score" DECIMAL(5,2) NOT NULL,
    "matched_criteria" JSONB NOT NULL DEFAULT '{}',
    "parcel_data" JSONB NOT NULL DEFAULT '{}',
    "seen_at" TIMESTAMPTZ(6),
    "dismissed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "opportunity_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."saved_searches" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL DEFAULT '{}',
    "alert_enabled" BOOLEAN NOT NULL DEFAULT false,
    "alert_frequency" "public"."alert_frequency" NOT NULL DEFAULT 'DAILY',
    "last_run_at" TIMESTAMPTZ(6),
    "match_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_requests_deal_id_idx" ON "public"."approval_requests"("deal_id" ASC);

-- CreateIndex
CREATE INDEX "approval_requests_requested_by_idx" ON "public"."approval_requests"("requested_by" ASC);

-- CreateIndex
CREATE INDEX "approval_requests_status_idx" ON "public"."approval_requests"("status" ASC);

-- CreateIndex
CREATE INDEX "assumption_actuals_assumption_name_idx" ON "public"."assumption_actuals"("assumption_name" ASC);

-- CreateIndex
CREATE INDEX "assumption_actuals_deal_id_idx" ON "public"."assumption_actuals"("deal_id" ASC);

-- CreateIndex
CREATE INDEX "conversations_deal_id_idx" ON "public"."conversations"("deal_id" ASC);

-- CreateIndex
CREATE INDEX "conversations_org_id_idx" ON "public"."conversations"("org_id" ASC);

-- CreateIndex
CREATE INDEX "conversations_user_id_idx" ON "public"."conversations"("user_id" ASC);

-- CreateIndex
CREATE INDEX "deal_risks_deal_id_idx" ON "public"."deal_risks"("deal_id" ASC);

-- CreateIndex
CREATE INDEX "deal_risks_org_id_idx" ON "public"."deal_risks"("org_id" ASC);

-- CreateIndex
CREATE INDEX "document_extractions_deal_id_idx" ON "public"."document_extractions"("deal_id" ASC);

-- CreateIndex
CREATE INDEX "document_extractions_deal_id_reviewed_idx" ON "public"."document_extractions"("deal_id" ASC, "reviewed" ASC);

-- CreateIndex
CREATE INDEX "document_extractions_org_id_idx" ON "public"."document_extractions"("org_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "document_extractions_upload_id_key" ON "public"."document_extractions"("upload_id" ASC);

-- CreateIndex
CREATE INDEX "market_data_points_data_type_idx" ON "public"."market_data_points"("data_type" ASC);

-- CreateIndex
CREATE INDEX "market_data_points_observed_at_idx" ON "public"."market_data_points"("observed_at" DESC);

-- CreateIndex
CREATE INDEX "market_data_points_parish_data_type_idx" ON "public"."market_data_points"("parish" ASC, "data_type" ASC);

-- CreateIndex
CREATE INDEX "market_data_points_parish_idx" ON "public"."market_data_points"("parish" ASC);

-- CreateIndex
CREATE INDEX "messages_conversation_id_idx" ON "public"."messages"("conversation_id" ASC);

-- CreateIndex
CREATE INDEX "opportunity_matches_saved_search_id_dismissed_at_idx" ON "public"."opportunity_matches"("saved_search_id" ASC, "dismissed_at" ASC);

-- CreateIndex
CREATE INDEX "opportunity_matches_saved_search_id_idx" ON "public"."opportunity_matches"("saved_search_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_matches_saved_search_id_parcel_id_key" ON "public"."opportunity_matches"("saved_search_id" ASC, "parcel_id" ASC);

-- CreateIndex
CREATE INDEX "opportunity_matches_saved_search_id_seen_at_idx" ON "public"."opportunity_matches"("saved_search_id" ASC, "seen_at" ASC);

-- CreateIndex
CREATE INDEX "saved_searches_alert_enabled_idx" ON "public"."saved_searches"("alert_enabled" ASC);

-- CreateIndex
CREATE INDEX "saved_searches_org_id_idx" ON "public"."saved_searches"("org_id" ASC);

-- CreateIndex
CREATE INDEX "saved_searches_user_id_idx" ON "public"."saved_searches"("user_id" ASC);

-- CreateIndex
CREATE INDEX "automation_events_org_id_deal_id_idx" ON "public"."automation_events"("org_id" ASC, "deal_id" ASC);

-- CreateIndex
CREATE INDEX "automation_events_org_id_idx" ON "public"."automation_events"("org_id" ASC);

-- CreateIndex
CREATE INDEX "parcels_org_id_address_idx" ON "public"."parcels"("org_id" ASC, "address" ASC);

-- AddForeignKey
ALTER TABLE "public"."CalibrationRecord" ADD CONSTRAINT "CalibrationRecord_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "public"."CalibrationSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."approval_requests" ADD CONSTRAINT "approval_requests_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."assumption_actuals" ADD CONSTRAINT "assumption_actuals_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capital_sources" ADD CONSTRAINT "capital_sources_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capital_sources" ADD CONSTRAINT "capital_sources_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deal_financings" ADD CONSTRAINT "deal_financings_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deal_financings" ADD CONSTRAINT "deal_financings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deal_outcomes" ADD CONSTRAINT "deal_outcomes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deal_risks" ADD CONSTRAINT "deal_risks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deal_risks" ADD CONSTRAINT "deal_risks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deal_stakeholders" ADD CONSTRAINT "deal_stakeholders_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deal_stakeholders" ADD CONSTRAINT "deal_stakeholders_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deal_terms" ADD CONSTRAINT "deal_terms_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deal_terms" ADD CONSTRAINT "deal_terms_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."development_budgets" ADD CONSTRAINT "development_budgets_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."development_budgets" ADD CONSTRAINT "development_budgets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_extractions" ADD CONSTRAINT "document_extractions_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_extractions" ADD CONSTRAINT "document_extractions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_extractions" ADD CONSTRAINT "document_extractions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_extractions" ADD CONSTRAINT "document_extractions_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."entitlement_paths" ADD CONSTRAINT "entitlement_paths_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."entitlement_paths" ADD CONSTRAINT "entitlement_paths_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."environmental_assessments" ADD CONSTRAINT "environmental_assessments_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."environmental_assessments" ADD CONSTRAINT "environmental_assessments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."equity_waterfalls" ADD CONSTRAINT "equity_waterfalls_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."equity_waterfalls" ADD CONSTRAINT "equity_waterfalls_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."opportunity_matches" ADD CONSTRAINT "opportunity_matches_saved_search_id_fkey" FOREIGN KEY ("saved_search_id") REFERENCES "public"."saved_searches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."proactive_actions" ADD CONSTRAINT "proactive_actions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."proactive_actions" ADD CONSTRAINT "proactive_actions_trigger_id_fkey" FOREIGN KEY ("trigger_id") REFERENCES "public"."proactive_triggers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."proactive_actions" ADD CONSTRAINT "proactive_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."proactive_triggers" ADD CONSTRAINT "proactive_triggers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."proactive_triggers" ADD CONSTRAINT "proactive_triggers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."property_surveys" ADD CONSTRAINT "property_surveys_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."property_surveys" ADD CONSTRAINT "property_surveys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."property_titles" ADD CONSTRAINT "property_titles_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."property_titles" ADD CONSTRAINT "property_titles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."saved_searches" ADD CONSTRAINT "saved_searches_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."saved_searches" ADD CONSTRAINT "saved_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_leases" ADD CONSTRAINT "tenant_leases_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_leases" ADD CONSTRAINT "tenant_leases_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_leases" ADD CONSTRAINT "tenant_leases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenants" ADD CONSTRAINT "tenants_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenants" ADD CONSTRAINT "tenants_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tool_execution_metrics" ADD CONSTRAINT "tool_execution_metrics_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tool_execution_metrics" ADD CONSTRAINT "tool_execution_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_preferences" ADD CONSTRAINT "user_preferences_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "public"."entitlement_graph_edges_org_id_jurisdiction_id_from_node_id_to_" RENAME TO "entitlement_graph_edges_org_id_jurisdiction_id_from_node_id_key";

-- RenameIndex
ALTER INDEX "public"."entitlement_graph_nodes_org_id_jurisdiction_id_node_type_node_k" RENAME TO "entitlement_graph_nodes_org_id_jurisdiction_id_node_type_no_key";

-- RenameIndex
ALTER INDEX "public"."entitlement_outcome_precedents_org_id_jurisdiction_id_precedent" RENAME TO "entitlement_outcome_precedents_org_id_jurisdiction_id_prece_key";

-- RenameIndex
ALTER INDEX "public"."entitlement_prediction_snapshots_org_id_jurisdiction_id_strateg" RENAME TO "entitlement_prediction_snapshots_org_id_jurisdiction_id_str_key";

-- RenameIndex
ALTER INDEX "public"."idx_parcels_org_property_db_id_prefix" RENAME TO "parcels_org_id_property_db_id_idx";

-- RenameIndex
ALTER INDEX "public"."proactive_actions_org_user_status_idx" RENAME TO "proactive_actions_org_id_user_id_status_idx";

-- RenameIndex
ALTER INDEX "public"."proactive_actions_trigger_idx" RENAME TO "proactive_actions_trigger_id_idx";

-- RenameIndex
ALTER INDEX "public"."proactive_actions_user_created_at_idx" RENAME TO "proactive_actions_user_id_created_at_idx";

-- RenameIndex
ALTER INDEX "public"."proactive_triggers_org_status_idx" RENAME TO "proactive_triggers_org_id_status_idx";

-- RenameIndex
ALTER INDEX "public"."tool_execution_metrics_org_tool_idx" RENAME TO "tool_execution_metrics_org_id_tool_name_idx";

-- RenameIndex
ALTER INDEX "public"."tool_execution_metrics_tool_created_idx" RENAME TO "tool_execution_metrics_tool_name_created_at_idx";

-- RenameIndex
ALTER INDEX "public"."user_preferences_org_user_active_idx" RENAME TO "user_preferences_org_id_user_id_is_active_idx";

-- RenameIndex
ALTER INDEX "public"."user_preferences_org_user_category_idx" RENAME TO "user_preferences_org_id_user_id_category_idx";

-- RenameIndex
ALTER INDEX "public"."user_preferences_org_user_category_key_key" RENAME TO "user_preferences_org_id_user_id_category_key_key";

-- RenameIndex
ALTER INDEX "public"."user_preferences_user_confidence_idx" RENAME TO "user_preferences_user_id_confidence_idx";

