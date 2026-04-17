-- Persisted portfolio alerts raised by the portfolio watcher cron.
CREATE TABLE IF NOT EXISTS "portfolio_alerts" (
  "id" UUID NOT NULL,
  "org_id" UUID NOT NULL,
  "deal_id" UUID,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "detail" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "fingerprint" TEXT NOT NULL,
  "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledged_at" TIMESTAMPTZ(6),
  "acknowledged_by" UUID,
  "snoozed_until" TIMESTAMPTZ(6),
  "resolved_at" TIMESTAMPTZ(6),
  CONSTRAINT "portfolio_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "portfolio_alerts_org_fingerprint_key"
  ON "portfolio_alerts" ("org_id", "fingerprint");

CREATE INDEX IF NOT EXISTS "portfolio_alerts_org_first_seen_idx"
  ON "portfolio_alerts" ("org_id", "first_seen_at" DESC);

CREATE INDEX IF NOT EXISTS "portfolio_alerts_org_deal_idx"
  ON "portfolio_alerts" ("org_id", "deal_id");

ALTER TABLE "portfolio_alerts"
  ADD CONSTRAINT "portfolio_alerts_org_fkey"
  FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;

-- Per-org investment criteria overriding default fit-score thresholds.
CREATE TABLE IF NOT EXISTS "org_investment_criteria" (
  "id" UUID NOT NULL,
  "org_id" UUID NOT NULL,
  "min_irr_pct" DECIMAL(5, 2),
  "max_ltv_pct" DECIMAL(5, 2),
  "min_dscr" DECIMAL(5, 2),
  "preferred_asset_classes" TEXT[] NOT NULL DEFAULT '{}',
  "preferred_strategies" TEXT[] NOT NULL DEFAULT '{}',
  "preferred_states" TEXT[] NOT NULL DEFAULT '{}',
  "min_acreage" DECIMAL(12, 4),
  "max_acreage" DECIMAL(12, 4),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" UUID,
  CONSTRAINT "org_investment_criteria_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_investment_criteria_org_id_key"
  ON "org_investment_criteria" ("org_id");

ALTER TABLE "org_investment_criteria"
  ADD CONSTRAINT "org_investment_criteria_org_fkey"
  FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;
