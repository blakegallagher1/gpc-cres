-- Add property title and property survey tables (deal-scoped 1:1).
CREATE TABLE IF NOT EXISTS "property_titles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "title_insurance_received" boolean,
  "exceptions" text[] NOT NULL DEFAULT '{}'::text[],
  "liens" text[] NOT NULL DEFAULT '{}'::text[],
  "easements" text[] NOT NULL DEFAULT '{}'::text[],
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "property_titles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "property_titles_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE,
  CONSTRAINT "property_titles_deal_id_key" UNIQUE ("deal_id")
);

CREATE INDEX IF NOT EXISTS "property_titles_org_id_idx" ON "property_titles" ("org_id");
CREATE INDEX IF NOT EXISTS "property_titles_deal_id_idx" ON "property_titles" ("deal_id");

CREATE TABLE IF NOT EXISTS "property_surveys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "survey_completed_date" date,
  "acreage_confirmed" numeric(12, 4),
  "encroachments" text[] NOT NULL DEFAULT '{}'::text[],
  "setbacks" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "property_surveys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "property_surveys_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE,
  CONSTRAINT "property_surveys_deal_id_key" UNIQUE ("deal_id")
);

CREATE INDEX IF NOT EXISTS "property_surveys_org_id_idx" ON "property_surveys" ("org_id");
CREATE INDEX IF NOT EXISTS "property_surveys_deal_id_idx" ON "property_surveys" ("deal_id");
