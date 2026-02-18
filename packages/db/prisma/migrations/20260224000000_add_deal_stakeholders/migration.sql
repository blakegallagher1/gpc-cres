-- Add deal stakeholders table (deal-scoped many-to-one).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'deal_stakeholder_role'
  ) THEN
    CREATE TYPE "deal_stakeholder_role" AS ENUM (
      'SPONSOR',
      'EQUITY_PARTNER',
      'LENDER',
      'BROKER',
      'LAWYER',
      'TITLE_COMPANY',
      'CONTRACTOR',
      'OTHER'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "deal_stakeholders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "role" "deal_stakeholder_role" NOT NULL,
  "name" text NOT NULL,
  "company" text,
  "email" text,
  "phone" text,
  "equity_ownership" numeric(6, 4),
  "decision_rights" text[] NOT NULL DEFAULT '{}',
  "notes" text,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deal_stakeholders_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "deal_stakeholders_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "deal_stakeholders_org_id_idx" ON "deal_stakeholders" ("org_id");
CREATE INDEX IF NOT EXISTS "deal_stakeholders_deal_id_idx" ON "deal_stakeholders" ("deal_id");
