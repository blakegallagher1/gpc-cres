-- Deal-level due-diligence contingency tracker. Each row represents a single
-- diligence item (title, survey, environmental, appraisal, financing, etc.)
-- with its own deadline, status, and owner. Open contingencies with nearing
-- deadlines are surfaced by the portfolio watcher via RaisedAlert entries.
CREATE TABLE IF NOT EXISTS "deal_contingencies" (
  "id" UUID NOT NULL,
  "org_id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "deadline" TIMESTAMPTZ(6),
  "owner_user_id" UUID,
  "satisfied_at" TIMESTAMPTZ(6),
  "satisfied_by" UUID,
  "satisfaction_notes" TEXT,
  "notice_days_before_deadline" INTEGER NOT NULL DEFAULT 7,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deal_contingencies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "deal_contingencies_org_deal_status_idx"
  ON "deal_contingencies" ("org_id", "deal_id", "status");

CREATE INDEX IF NOT EXISTS "deal_contingencies_org_deadline_idx"
  ON "deal_contingencies" ("org_id", "deadline");

ALTER TABLE "deal_contingencies"
  ADD CONSTRAINT "deal_contingencies_org_fkey"
  FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;

ALTER TABLE "deal_contingencies"
  ADD CONSTRAINT "deal_contingencies_deal_fkey"
  FOREIGN KEY ("deal_id", "org_id") REFERENCES "deals"("id", "org_id") ON DELETE CASCADE;

ALTER TABLE "deal_contingencies"
  ADD CONSTRAINT "deal_contingencies_owner_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
