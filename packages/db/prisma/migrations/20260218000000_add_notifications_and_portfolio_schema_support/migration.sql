-- Add notification enums if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typname = 'notification_type'
  ) THEN
    CREATE TYPE "notification_type" AS ENUM ('ALERT', 'OPPORTUNITY', 'DEADLINE', 'SYSTEM', 'MARKET', 'AUTOMATION');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typname = 'notification_priority'
  ) THEN
    CREATE TYPE "notification_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
  END IF;
END $$;

-- Extend deals with financial model/assumption fields expected by Prisma reads.
ALTER TABLE "deals"
  ADD COLUMN IF NOT EXISTS "source" text,
  ADD COLUMN IF NOT EXISTS "financial_model_assumptions" jsonb,
  ADD COLUMN IF NOT EXISTS "financial_model_scenarios" jsonb,
  ADD COLUMN IF NOT EXISTS "waterfall_structures" jsonb,
  ADD COLUMN IF NOT EXISTS "debt_comparisons" jsonb;

-- Notifications table (idempotent create for newly deployed environments).
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "deal_id" uuid,
  "type" notification_type NOT NULL DEFAULT 'SYSTEM',
  "title" text NOT NULL,
  "body" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "priority" notification_priority NOT NULL DEFAULT 'MEDIUM',
  "read_at" timestamptz(6),
  "dismissed_at" timestamptz(6),
  "action_url" text,
  "source_agent" text,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "notifications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "notifications_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL
);

ALTER TABLE "notifications"
  ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "notifications_user_id_read_at_idx" ON "notifications" ("user_id", "read_at");
CREATE INDEX IF NOT EXISTS "notifications_user_id_created_at_idx" ON "notifications" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "notifications_deal_id_idx" ON "notifications" ("deal_id");

-- Ensure any pre-existing notifications table has expected schema/columns.
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "org_id" uuid,
  ADD COLUMN IF NOT EXISTS "user_id" uuid,
  ADD COLUMN IF NOT EXISTS "deal_id" uuid,
  ADD COLUMN IF NOT EXISTS "type" notification_type,
  ADD COLUMN IF NOT EXISTS "title" text,
  ADD COLUMN IF NOT EXISTS "body" text,
  ADD COLUMN IF NOT EXISTS "metadata" jsonb,
  ADD COLUMN IF NOT EXISTS "priority" notification_priority,
  ADD COLUMN IF NOT EXISTS "read_at" timestamptz(6),
  ADD COLUMN IF NOT EXISTS "dismissed_at" timestamptz(6),
  ADD COLUMN IF NOT EXISTS "action_url" text,
  ADD COLUMN IF NOT EXISTS "source_agent" text,
  ADD COLUMN IF NOT EXISTS "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "notifications"
  ALTER COLUMN "type" SET DEFAULT 'SYSTEM',
  ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb,
  ALTER COLUMN "priority" SET DEFAULT 'MEDIUM',
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- If a pre-existing table is partially present, ensure relation columns enforce constraints.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_org_id_fkey'
  ) THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_org_id_fkey"
      FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_user_id_fkey'
  ) THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_deal_id_fkey'
  ) THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_deal_id_fkey"
      FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Notification preferences.
CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "type" notification_type NOT NULL,
  "channel" text NOT NULL DEFAULT 'in_app',
  "enabled" boolean NOT NULL DEFAULT true,
  "threshold_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "notification_preferences_user_id_type_key" UNIQUE ("user_id", "type")
);

ALTER TABLE "notification_preferences"
  ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "channel" text,
  ADD COLUMN IF NOT EXISTS "enabled" boolean,
  ADD COLUMN IF NOT EXISTS "threshold_config" jsonb,
  ADD COLUMN IF NOT EXISTS "type" notification_type,
  ADD COLUMN IF NOT EXISTS "user_id" uuid,
  ADD COLUMN IF NOT EXISTS "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_user_id_type_key"
  ON "notification_preferences" ("user_id", "type");
