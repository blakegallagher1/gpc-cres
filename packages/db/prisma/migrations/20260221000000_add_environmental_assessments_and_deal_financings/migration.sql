-- Add environmental assessments and deal financings tables (deal-scoped many-to-one).
CREATE TABLE IF NOT EXISTS "environmental_assessments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "report_type" text,
  "report_date" date,
  "consultant_name" text,
  "report_title" text,
  "recs" text[] NOT NULL DEFAULT '{}'::text[],
  "de_minimis_conditions" text[] NOT NULL DEFAULT '{}'::text[],
  "phase_ii_recommended" boolean,
  "phase_ii_scope" text,
  "estimated_remediation_cost" numeric(14, 2),
  "source_upload_id" uuid,
  "notes" text,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "environmental_assessments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "environmental_assessments_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE,
  CONSTRAINT "environmental_assessments_source_upload_id_fkey" FOREIGN KEY ("source_upload_id") REFERENCES "uploads"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "environmental_assessments_org_id_idx" ON "environmental_assessments" ("org_id");
CREATE INDEX IF NOT EXISTS "environmental_assessments_deal_id_idx" ON "environmental_assessments" ("deal_id");
CREATE INDEX IF NOT EXISTS "environmental_assessments_report_date_idx" ON "environmental_assessments" ("report_date");

CREATE TABLE IF NOT EXISTS "deal_financings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "lender_name" text,
  "facility_name" text,
  "loan_type" text,
  "loan_amount" numeric(14, 2),
  "commitment_date" date,
  "funded_date" date,
  "interest_rate" numeric(6, 4),
  "loan_term_months" integer,
  "amortization_years" integer,
  "ltv_percent" numeric(6, 4),
  "dscr_requirement" numeric(6, 4),
  "origination_fee_percent" numeric(6, 4),
  "source_upload_id" uuid,
  "status" text,
  "notes" text,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deal_financings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "deal_financings_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE,
  CONSTRAINT "deal_financings_source_upload_id_fkey" FOREIGN KEY ("source_upload_id") REFERENCES "uploads"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "deal_financings_org_id_idx" ON "deal_financings" ("org_id");
CREATE INDEX IF NOT EXISTS "deal_financings_deal_id_idx" ON "deal_financings" ("deal_id");
