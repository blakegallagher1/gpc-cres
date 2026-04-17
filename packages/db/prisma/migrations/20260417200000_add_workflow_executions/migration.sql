-- Persisted DAG-based workflow executions. The orchestrator writes a row
-- per run, streams per-step results into `step_results`, and captures the
-- final outcome in `output` + `status`. Used by the chat agent's
-- `execute_workflow` tool and by the UI WorkflowProgressCard.
CREATE TABLE IF NOT EXISTS "workflow_executions" (
  "id" UUID NOT NULL,
  "org_id" UUID NOT NULL,
  "deal_id" UUID,
  "template_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "current_step_key" TEXT,
  "steps_total" INTEGER NOT NULL DEFAULT 0,
  "steps_completed" INTEGER NOT NULL DEFAULT 0,
  "input" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "output" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "step_results" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "error" TEXT,
  "error_step_key" TEXT,
  "started_by" UUID,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  "duration_ms" INTEGER,
  CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workflow_executions_org_started_idx"
  ON "workflow_executions" ("org_id", "started_at" DESC);

CREATE INDEX IF NOT EXISTS "workflow_executions_org_deal_started_idx"
  ON "workflow_executions" ("org_id", "deal_id", "started_at" DESC);

CREATE INDEX IF NOT EXISTS "workflow_executions_status_idx"
  ON "workflow_executions" ("status");

ALTER TABLE "workflow_executions"
  ADD CONSTRAINT "workflow_executions_org_fkey"
  FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;
