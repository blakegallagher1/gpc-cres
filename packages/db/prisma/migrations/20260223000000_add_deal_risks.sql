-- Add deal risks table (deal-scoped many-to-one).
CREATE TABLE IF NOT EXISTS "deal_risks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "category" text,
  "title" text,
  "description" text,
  "severity" text,
  "status" text,
  "owner" text,
  "source" text,
  "score" integer,
  "notes" text,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deal_risks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "deal_risks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "deal_risks_org_id_idx" ON "deal_risks" ("org_id");
CREATE INDEX IF NOT EXISTS "deal_risks_deal_id_idx" ON "deal_risks" ("deal_id");
