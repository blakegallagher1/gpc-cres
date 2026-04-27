-- Persist operator-authored workflow definitions used by the automation builder.
-- These are separate from canonical deal workflow templates and can be run
-- through workflow_executions for auditable operator history.
CREATE TABLE IF NOT EXISTS "operator_workflow_definitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "org_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "nodes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "edges" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "run_type" TEXT NOT NULL DEFAULT 'TRIAGE',
  "run_message" TEXT NOT NULL,
  "execution_template_key" TEXT,
  "source" TEXT NOT NULL DEFAULT 'custom',
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operator_workflow_definitions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "operator_workflow_definitions_org_updated_idx"
  ON "operator_workflow_definitions" ("org_id", "updated_at" DESC);

ALTER TABLE "operator_workflow_definitions"
  ADD CONSTRAINT "operator_workflow_definitions_org_fkey"
  FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
