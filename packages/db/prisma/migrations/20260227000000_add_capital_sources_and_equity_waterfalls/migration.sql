-- Add capital stack tables (sources + equity waterfall tiers).
CREATE TABLE IF NOT EXISTS "capital_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "name" text NOT NULL,
  "source_kind" text NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "notes" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "capital_sources_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "capital_sources_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "capital_sources_org_id_idx" ON "capital_sources" ("org_id");
CREATE INDEX IF NOT EXISTS "capital_sources_deal_id_idx" ON "capital_sources" ("deal_id");
CREATE INDEX IF NOT EXISTS "capital_sources_org_id_deal_id_idx" ON "capital_sources" ("org_id", "deal_id");

CREATE TABLE IF NOT EXISTS "equity_waterfalls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "tier_name" text NOT NULL,
  "hurdle_irr_pct" numeric(8,4) NOT NULL,
  "lp_distribution_pct" numeric(8,4) NOT NULL,
  "gp_distribution_pct" numeric(8,4) NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "equity_waterfalls_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "equity_waterfalls_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "equity_waterfalls_org_id_idx" ON "equity_waterfalls" ("org_id");
CREATE INDEX IF NOT EXISTS "equity_waterfalls_deal_id_idx" ON "equity_waterfalls" ("deal_id");
CREATE INDEX IF NOT EXISTS "equity_waterfalls_org_id_deal_id_idx" ON "equity_waterfalls" ("org_id", "deal_id");
