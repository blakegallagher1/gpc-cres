-- Add rent roll tables (tenants + tenant leases) and development budget detail.
CREATE TABLE IF NOT EXISTS "tenants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "name" text NOT NULL,
  "contact_name" text,
  "email" text,
  "phone" text,
  "notes" text,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenants_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "tenants_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "tenants_org_id_idx" ON "tenants" ("org_id");
CREATE INDEX IF NOT EXISTS "tenants_deal_id_idx" ON "tenants" ("deal_id");

CREATE TABLE IF NOT EXISTS "tenant_leases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "lease_name" text,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "rented_area_sf" numeric(12, 4) NOT NULL,
  "rent_per_sf" numeric(10, 4) NOT NULL,
  "annual_escalation_pct" numeric(6, 4) NOT NULL DEFAULT 0,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_leases_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "tenant_leases_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE,
  CONSTRAINT "tenant_leases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "tenant_leases_org_id_idx" ON "tenant_leases" ("org_id");
CREATE INDEX IF NOT EXISTS "tenant_leases_deal_id_idx" ON "tenant_leases" ("deal_id");
CREATE INDEX IF NOT EXISTS "tenant_leases_tenant_id_idx" ON "tenant_leases" ("tenant_id");

CREATE TABLE IF NOT EXISTS "development_budgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "line_items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "contingencies" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "development_budgets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "development_budgets_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE,
  CONSTRAINT "development_budgets_deal_id_key" UNIQUE ("deal_id")
);

CREATE INDEX IF NOT EXISTS "development_budgets_org_id_idx" ON "development_budgets" ("org_id");
CREATE INDEX IF NOT EXISTS "development_budgets_deal_id_idx" ON "development_budgets" ("deal_id");

ALTER TABLE IF EXISTS "tenant_leases"
  ALTER COLUMN "annual_escalation_pct" SET DEFAULT 0;

ALTER TABLE IF EXISTS "development_budgets"
  ALTER COLUMN "line_items" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "contingencies" SET DEFAULT '{}'::jsonb;
