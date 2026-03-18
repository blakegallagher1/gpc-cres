ALTER TABLE "runs"
  ADD COLUMN IF NOT EXISTS "memory_promotion_status" TEXT,
  ADD COLUMN IF NOT EXISTS "memory_promoted_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "memory_promotion_error" TEXT;

ALTER TABLE "trajectory_logs"
  ADD COLUMN IF NOT EXISTS "conversation_id" UUID,
  ADD COLUMN IF NOT EXISTS "deal_id" UUID,
  ADD COLUMN IF NOT EXISTS "jurisdiction_id" UUID,
  ADD COLUMN IF NOT EXISTS "tool_results" JSONB,
  ADD COLUMN IF NOT EXISTS "trust_json" JSONB,
  ADD COLUMN IF NOT EXISTS "evidence_citations" JSONB,
  ADD COLUMN IF NOT EXISTS "pack_versions_used" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS "trajectory_logs_org_id_run_id_idx"
  ON "trajectory_logs"("org_id", "run_id");

CREATE INDEX IF NOT EXISTS "trajectory_logs_org_id_deal_id_idx"
  ON "trajectory_logs"("org_id", "deal_id");

CREATE INDEX IF NOT EXISTS "trajectory_logs_org_id_conversation_id_idx"
  ON "trajectory_logs"("org_id", "conversation_id");

ALTER TABLE "episodic_entries"
  ADD COLUMN IF NOT EXISTS "run_id" UUID,
  ADD COLUMN IF NOT EXISTS "deal_id" UUID,
  ADD COLUMN IF NOT EXISTS "jurisdiction_id" UUID,
  ADD COLUMN IF NOT EXISTS "conversation_id" UUID,
  ADD COLUMN IF NOT EXISTS "user_id" UUID,
  ADD COLUMN IF NOT EXISTS "trajectory_log_id" UUID,
  ADD COLUMN IF NOT EXISTS "final_output_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "tool_sequence" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "retrieved_context_summary" JSONB,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "outcome_linked_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX IF NOT EXISTS "episodic_entries_org_id_run_id_agent_id_task_type_key"
  ON "episodic_entries"("org_id", "run_id", "agent_id", "task_type");

CREATE INDEX IF NOT EXISTS "episodic_entries_org_id_deal_id_idx"
  ON "episodic_entries"("org_id", "deal_id");

CREATE INDEX IF NOT EXISTS "episodic_entries_org_id_conversation_id_idx"
  ON "episodic_entries"("org_id", "conversation_id");

CREATE INDEX IF NOT EXISTS "episodic_entries_org_id_task_type_outcome_idx"
  ON "episodic_entries"("org_id", "task_type", "outcome");

ALTER TABLE "procedural_skills"
  ADD COLUMN IF NOT EXISTS "task_type" TEXT,
  ADD COLUMN IF NOT EXISTS "agent_id" TEXT,
  ADD COLUMN IF NOT EXISTS "trigger_conditions" JSONB,
  ADD COLUMN IF NOT EXISTS "evidence_requirements" JSONB,
  ADD COLUMN IF NOT EXISTS "failure_modes" JSONB,
  ADD COLUMN IF NOT EXISTS "last_promoted_at" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "procedural_skills_org_id_task_type_idx"
  ON "procedural_skills"("org_id", "task_type");

CREATE INDEX IF NOT EXISTS "procedural_skills_org_id_agent_id_idx"
  ON "procedural_skills"("org_id", "agent_id");

CREATE TABLE IF NOT EXISTS "procedural_skill_episodes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "org_id" UUID NOT NULL,
  "procedural_skill_id" UUID NOT NULL,
  "episodic_entry_id" UUID NOT NULL,
  "relation_type" TEXT NOT NULL,
  "weight" DOUBLE PRECISION NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "procedural_skill_episodes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "procedural_skill_episodes_procedural_skill_id_episodic_entry_id_key"
  ON "procedural_skill_episodes"("procedural_skill_id", "episodic_entry_id");

CREATE INDEX IF NOT EXISTS "procedural_skill_episodes_org_id_procedural_skill_id_idx"
  ON "procedural_skill_episodes"("org_id", "procedural_skill_id");

CREATE INDEX IF NOT EXISTS "procedural_skill_episodes_org_id_episodic_entry_id_idx"
  ON "procedural_skill_episodes"("org_id", "episodic_entry_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'procedural_skill_episodes_org_id_fkey'
  ) THEN
    ALTER TABLE "procedural_skill_episodes"
      ADD CONSTRAINT "procedural_skill_episodes_org_id_fkey"
      FOREIGN KEY ("org_id") REFERENCES "orgs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'procedural_skill_episodes_procedural_skill_id_fkey'
  ) THEN
    ALTER TABLE "procedural_skill_episodes"
      ADD CONSTRAINT "procedural_skill_episodes_procedural_skill_id_fkey"
      FOREIGN KEY ("procedural_skill_id") REFERENCES "procedural_skills"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'procedural_skill_episodes_episodic_entry_id_fkey'
  ) THEN
    ALTER TABLE "procedural_skill_episodes"
      ADD CONSTRAINT "procedural_skill_episodes_episodic_entry_id_fkey"
      FOREIGN KEY ("episodic_entry_id") REFERENCES "episodic_entries"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
