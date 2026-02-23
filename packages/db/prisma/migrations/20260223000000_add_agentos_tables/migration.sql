-- CreateEnum
CREATE TYPE "episodic_outcome" AS ENUM ('SUCCESS', 'FAILURE', 'PARTIAL');

-- CreateEnum
CREATE TYPE "risk_level" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "domain_source_type" AS ENUM ('ZONING_CODE', 'MARKET_REPORT', 'INTERNAL_MEMO', 'SCHEMA_DOC');

-- AlterTable: Add trajectory column to runs
ALTER TABLE "runs" ADD COLUMN "trajectory" JSONB;

-- CreateTable
CREATE TABLE "episodic_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "agent_id" TEXT NOT NULL,
    "task_type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "embedding_id" TEXT NOT NULL,
    "outcome" "episodic_outcome" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "episodic_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_facts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value_json" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "provenance_episode_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "semantic_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedural_skills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "skill_md_content" TEXT NOT NULL,
    "tool_sequence" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "success_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evaluator_avg_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dedupe_hash" TEXT NOT NULL,
    "embedding_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "procedural_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_docs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "source_type" "domain_source_type" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content_pointer" TEXT NOT NULL,
    "embedding_id" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "domain_docs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trajectory_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "agent_id" TEXT NOT NULL,
    "task_input" TEXT NOT NULL,
    "retrieved_context_summary" JSONB NOT NULL,
    "plan" TEXT,
    "tool_calls" JSONB NOT NULL,
    "intermediate_steps" JSONB NOT NULL,
    "final_output" TEXT NOT NULL,
    "reflection" JSONB,
    "evaluator_score" DOUBLE PRECISION,
    "latency_ms" INTEGER NOT NULL,
    "token_usage" JSONB NOT NULL,
    "cost_usd" DOUBLE PRECISION NOT NULL,
    "risk_events" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trajectory_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_specs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "input_schema_json" JSONB NOT NULL,
    "output_schema_json" JSONB NOT NULL,
    "risk_level" "risk_level" NOT NULL,
    "retry_policy" JSONB NOT NULL,
    "permission_scope" TEXT NOT NULL,
    "cost_stats" JSONB NOT NULL,
    "latency_stats" JSONB NOT NULL,
    "error_rate" DOUBLE PRECISION NOT NULL,
    "embedding_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tool_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "trajectory_log_id" UUID NOT NULL,
    "dimension_scores" JSONB NOT NULL,
    "overall_score" DOUBLE PRECISION NOT NULL,
    "rationale" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "episodic_entries_org_id_agent_id_idx" ON "episodic_entries"("org_id", "agent_id");
CREATE INDEX "episodic_entries_org_id_task_type_idx" ON "episodic_entries"("org_id", "task_type");
CREATE INDEX "episodic_entries_org_id_outcome_idx" ON "episodic_entries"("org_id", "outcome");
CREATE INDEX "episodic_entries_created_at_idx" ON "episodic_entries"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "semantic_facts_org_id_key_key" ON "semantic_facts"("org_id", "key");
CREATE INDEX "semantic_facts_org_id_updated_at_idx" ON "semantic_facts"("org_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "procedural_skills_org_id_dedupe_hash_key" ON "procedural_skills"("org_id", "dedupe_hash");
CREATE INDEX "procedural_skills_org_id_success_rate_idx" ON "procedural_skills"("org_id", "success_rate");
CREATE INDEX "procedural_skills_org_id_evaluator_avg_score_idx" ON "procedural_skills"("org_id", "evaluator_avg_score");

-- CreateIndex
CREATE INDEX "domain_docs_org_id_source_type_idx" ON "domain_docs"("org_id", "source_type");
CREATE INDEX "domain_docs_org_id_tags_idx" ON "domain_docs"("org_id", "tags");

-- CreateIndex
CREATE INDEX "trajectory_logs_org_id_agent_id_idx" ON "trajectory_logs"("org_id", "agent_id");
CREATE INDEX "trajectory_logs_org_id_created_at_idx" ON "trajectory_logs"("org_id", "created_at");
CREATE INDEX "trajectory_logs_evaluator_score_idx" ON "trajectory_logs"("evaluator_score");

-- CreateIndex
CREATE UNIQUE INDEX "tool_specs_org_id_name_key" ON "tool_specs"("org_id", "name");
CREATE INDEX "tool_specs_org_id_risk_level_idx" ON "tool_specs"("org_id", "risk_level");

-- CreateIndex
CREATE INDEX "eval_results_org_id_idx" ON "eval_results"("org_id");
CREATE INDEX "eval_results_trajectory_log_id_idx" ON "eval_results"("trajectory_log_id");
CREATE INDEX "eval_results_overall_score_idx" ON "eval_results"("overall_score");

-- AddForeignKey
ALTER TABLE "episodic_entries" ADD CONSTRAINT "episodic_entries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_facts" ADD CONSTRAINT "semantic_facts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedural_skills" ADD CONSTRAINT "procedural_skills_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_docs" ADD CONSTRAINT "domain_docs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectory_logs" ADD CONSTRAINT "trajectory_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trajectory_logs" ADD CONSTRAINT "trajectory_logs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_specs" ADD CONSTRAINT "tool_specs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_trajectory_log_id_fkey" FOREIGN KEY ("trajectory_log_id") REFERENCES "trajectory_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
