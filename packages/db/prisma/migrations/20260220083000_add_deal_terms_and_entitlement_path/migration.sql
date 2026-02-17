-- Add acquisition terms and entitlement path tables (deal-scoped 1:1 records).
CREATE TABLE IF NOT EXISTS "deal_terms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "offer_price" numeric(14, 2),
  "earnest_money" numeric(14, 2),
  "closing_date" date,
  "title_company" text,
  "due_diligence_days" integer,
  "financing_contingency_days" integer,
  "loi_signed_at" date,
  "psa_signed_at" date,
  "title_review_due" date,
  "survey_due" date,
  "environmental_due" date,
  "seller_contact" text,
  "broker_contact" text,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deal_terms_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "deal_terms_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE,
  CONSTRAINT "deal_terms_deal_id_key" UNIQUE ("deal_id")
);

CREATE INDEX IF NOT EXISTS "deal_terms_org_id_idx" ON "deal_terms" ("org_id");
CREATE INDEX IF NOT EXISTS "deal_terms_deal_id_idx" ON "deal_terms" ("deal_id");

CREATE TABLE IF NOT EXISTS "entitlement_paths" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "recommended_strategy" text,
  "pre_app_meeting_date" date,
  "pre_app_meeting_notes" text,
  "application_type" text,
  "application_submitted_date" date,
  "application_number" text,
  "public_notice_date" date,
  "public_notice_period_days" integer,
  "hearing_scheduled_date" date,
  "hearing_body" text,
  "hearing_notes" text,
  "decision_date" date,
  "decision_type" text,
  "conditions" text[] NOT NULL DEFAULT '{}'::text[],
  "appeal_deadline" date,
  "appeal_filed" boolean,
  "condition_compliance_status" text,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entitlement_paths_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "entitlement_paths_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE,
  CONSTRAINT "entitlement_paths_deal_id_key" UNIQUE ("deal_id")
);

CREATE INDEX IF NOT EXISTS "entitlement_paths_org_id_idx" ON "entitlement_paths" ("org_id");
CREATE INDEX IF NOT EXISTS "entitlement_paths_deal_id_idx" ON "entitlement_paths" ("deal_id");
