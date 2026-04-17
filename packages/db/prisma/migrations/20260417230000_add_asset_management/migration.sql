-- MOAT Phase 4-003 — Asset Management + Disposition Tracking
-- Three new tables scoped by (orgId, dealId) for post-close performance tracking.

-- Monthly performance snapshot per deal.
CREATE TABLE IF NOT EXISTS "asset_performance_periods" (
  "id" UUID NOT NULL,
  "org_id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "period_year" INTEGER NOT NULL,
  "period_month" INTEGER NOT NULL,
  "rent_billed" DECIMAL(14, 2),
  "rent_collected" DECIMAL(14, 2),
  "vacancy_units" INTEGER,
  "total_units" INTEGER,
  "operating_expense" DECIMAL(14, 2),
  "net_operating_income" DECIMAL(14, 2),
  "notes" TEXT,
  "captured_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_performance_periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "asset_performance_periods_org_deal_period_uniq"
  ON "asset_performance_periods" ("org_id", "deal_id", "period_year", "period_month");

CREATE INDEX IF NOT EXISTS "asset_performance_periods_org_deal_recent_idx"
  ON "asset_performance_periods" ("org_id", "deal_id", "period_year" DESC, "period_month" DESC);

ALTER TABLE "asset_performance_periods"
  ADD CONSTRAINT "asset_performance_periods_org_fkey"
  FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;

ALTER TABLE "asset_performance_periods"
  ADD CONSTRAINT "asset_performance_periods_deal_fkey"
  FOREIGN KEY ("deal_id", "org_id") REFERENCES "deals"("id", "org_id") ON DELETE CASCADE;

ALTER TABLE "asset_performance_periods"
  ADD CONSTRAINT "asset_performance_periods_captured_by_fkey"
  FOREIGN KEY ("captured_by") REFERENCES "users"("id") ON DELETE SET NULL;

-- One-off capital expenditures.
CREATE TABLE IF NOT EXISTS "capex_items" (
  "id" UUID NOT NULL,
  "org_id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "estimated_cost" DECIMAL(14, 2),
  "actual_cost" DECIMAL(14, 2),
  "planned_for" DATE,
  "completed_at" DATE,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "vendor" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "capex_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "capex_items_org_deal_status_idx"
  ON "capex_items" ("org_id", "deal_id", "status");

ALTER TABLE "capex_items"
  ADD CONSTRAINT "capex_items_org_fkey"
  FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;

ALTER TABLE "capex_items"
  ADD CONSTRAINT "capex_items_deal_fkey"
  FOREIGN KEY ("deal_id", "org_id") REFERENCES "deals"("id", "org_id") ON DELETE CASCADE;

-- Tenant lifecycle events. `tenant_id` intentionally has no FK so historical
-- events survive tenant removal and we avoid back-relation churn.
CREATE TABLE IF NOT EXISTS "tenant_change_events" (
  "id" UUID NOT NULL,
  "org_id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "tenant_id" UUID,
  "event_type" TEXT NOT NULL,
  "event_date" DATE NOT NULL,
  "rent_delta" DECIMAL(14, 2),
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_change_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tenant_change_events_org_deal_date_idx"
  ON "tenant_change_events" ("org_id", "deal_id", "event_date" DESC);

ALTER TABLE "tenant_change_events"
  ADD CONSTRAINT "tenant_change_events_org_fkey"
  FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;

ALTER TABLE "tenant_change_events"
  ADD CONSTRAINT "tenant_change_events_deal_fkey"
  FOREIGN KEY ("deal_id", "org_id") REFERENCES "deals"("id", "org_id") ON DELETE CASCADE;
