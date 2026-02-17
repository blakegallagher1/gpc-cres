CREATE TABLE IF NOT EXISTS "capital_deployments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id" UUID NOT NULL,
  "org_id" UUID NOT NULL,
  "stage" TEXT NOT NULL,
  "capital_committed" DECIMAL(14,2) NOT NULL,
  "capital_deployed" DECIMAL(14,2) NOT NULL,
  "non_recoverable_expense" DECIMAL(14,2) NOT NULL,
  "deployment_date" DATE NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "capital_deployments_deal_id_fkey"
    FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "capital_deployments_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "capital_deployments_org_id_idx"
  ON "capital_deployments"("org_id");
CREATE INDEX IF NOT EXISTS "capital_deployments_deal_id_idx"
  ON "capital_deployments"("deal_id");
CREATE INDEX IF NOT EXISTS "capital_deployments_org_id_stage_idx"
  ON "capital_deployments"("org_id", "stage");
CREATE INDEX IF NOT EXISTS "capital_deployments_org_id_deployment_date_idx"
  ON "capital_deployments"("org_id", "deployment_date");
