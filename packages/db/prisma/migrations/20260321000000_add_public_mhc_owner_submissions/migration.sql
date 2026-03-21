CREATE TABLE IF NOT EXISTS "public_mhc_owner_submissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "first_name" TEXT NOT NULL,
  "last_name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "company" TEXT,
  "location_address_1" TEXT NOT NULL,
  "location_address_2" TEXT,
  "location_city" TEXT NOT NULL,
  "location_state" VARCHAR(2) NOT NULL,
  "location_postal_code" VARCHAR(10) NOT NULL,
  "notes" TEXT,
  "source" TEXT,
  "honeypot_value" TEXT,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "referrer" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "public_mhc_owner_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_public_mhc_owner_submissions_created_at"
  ON "public_mhc_owner_submissions" ("created_at");

CREATE INDEX IF NOT EXISTS "idx_public_mhc_owner_submissions_email"
  ON "public_mhc_owner_submissions" ("email");
