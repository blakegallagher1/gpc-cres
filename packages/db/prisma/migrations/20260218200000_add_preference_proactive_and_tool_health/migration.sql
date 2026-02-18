-- Preference extraction + proactive triggers + resilient tool health telemetry.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'preference_category') THEN
    CREATE TYPE "preference_category" AS ENUM (
      'DEAL_CRITERIA',
      'FINANCIAL',
      'COMMUNICATION',
      'WORKFLOW',
      'RISK_TOLERANCE',
      'TIMING'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'preference_value_type') THEN
    CREATE TYPE "preference_value_type" AS ENUM (
      'NUMBER',
      'STRING',
      'ARRAY',
      'BOOLEAN',
      'RANGE',
      'OBJECT'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'preference_source') THEN
    CREATE TYPE "preference_source" AS ENUM (
      'CONVERSATION',
      'DEAL_ACTION',
      'EXPLICIT_SETTING',
      'INFERRED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proactive_trigger_type') THEN
    CREATE TYPE "proactive_trigger_type" AS ENUM (
      'SCHEDULED',
      'EVENT',
      'WEBHOOK',
      'ANOMALY'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proactive_action_type') THEN
    CREATE TYPE "proactive_action_type" AS ENUM (
      'NOTIFY',
      'RUN_WORKFLOW',
      'CREATE_TASK',
      'AUTO_TRIAGE'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proactive_action_status') THEN
    CREATE TYPE "proactive_action_status" AS ENUM (
      'PENDING',
      'APPROVED',
      'REJECTED',
      'MODIFY_REQUESTED',
      'AUTO_EXECUTED',
      'EXPIRED',
      'FAILED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proactive_priority') THEN
    CREATE TYPE "proactive_priority" AS ENUM (
      'LOW',
      'MEDIUM',
      'HIGH',
      'URGENT'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tool_execution_status') THEN
    CREATE TYPE "tool_execution_status" AS ENUM (
      'SUCCESS',
      'FALLBACK',
      'INFERRED',
      'FAILED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "user_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "category" preference_category NOT NULL,
  "key" text NOT NULL,
  "value" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "value_type" preference_value_type NOT NULL,
  "confidence" double precision NOT NULL DEFAULT 0.5,
  "source_count" integer NOT NULL DEFAULT 1,
  "last_source_message_id" uuid,
  "last_extracted_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "extracted_from" preference_source NOT NULL DEFAULT 'CONVERSATION',
  "evidence_snippet" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_preferences_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "user_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "user_preferences_org_user_category_key_key"
    UNIQUE ("org_id", "user_id", "category", "key")
);

CREATE INDEX IF NOT EXISTS "user_preferences_org_user_category_idx"
  ON "user_preferences" ("org_id", "user_id", "category");
CREATE INDEX IF NOT EXISTS "user_preferences_user_confidence_idx"
  ON "user_preferences" ("user_id", "confidence");
CREATE INDEX IF NOT EXISTS "user_preferences_org_user_active_idx"
  ON "user_preferences" ("org_id", "user_id", "is_active");

CREATE TABLE IF NOT EXISTS "proactive_triggers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "created_by" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "trigger_type" proactive_trigger_type NOT NULL,
  "trigger_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "conditions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "action_type" proactive_action_type NOT NULL,
  "action_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "target_users" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "max_runs_per_day" integer NOT NULL DEFAULT 10,
  "max_auto_cost" double precision NOT NULL DEFAULT 5,
  "require_approval" boolean NOT NULL DEFAULT true,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "last_run_at" timestamptz(6),
  "run_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "proactive_triggers_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "proactive_triggers_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "proactive_triggers_org_status_idx"
  ON "proactive_triggers" ("org_id", "status");
CREATE INDEX IF NOT EXISTS "proactive_triggers_trigger_type_idx"
  ON "proactive_triggers" ("trigger_type");
CREATE INDEX IF NOT EXISTS "proactive_triggers_created_by_idx"
  ON "proactive_triggers" ("created_by");

CREATE TABLE IF NOT EXISTS "proactive_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "trigger_id" uuid,
  "org_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "action_type" proactive_action_type NOT NULL,
  "priority" proactive_priority NOT NULL DEFAULT 'MEDIUM',
  "title" text NOT NULL,
  "description" text NOT NULL,
  "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "match_confidence" double precision,
  "status" proactive_action_status NOT NULL DEFAULT 'PENDING',
  "action_taken" text,
  "action_result" jsonb,
  "user_response" text,
  "user_note" text,
  "responded_at" timestamptz(6),
  "cost" double precision NOT NULL DEFAULT 0,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" timestamptz(6) NOT NULL,
  CONSTRAINT "proactive_actions_trigger_id_fkey"
    FOREIGN KEY ("trigger_id") REFERENCES "proactive_triggers"("id") ON DELETE SET NULL,
  CONSTRAINT "proactive_actions_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "proactive_actions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "proactive_actions_org_user_status_idx"
  ON "proactive_actions" ("org_id", "user_id", "status");
CREATE INDEX IF NOT EXISTS "proactive_actions_user_created_at_idx"
  ON "proactive_actions" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "proactive_actions_trigger_idx"
  ON "proactive_actions" ("trigger_id");

CREATE TABLE IF NOT EXISTS "tool_execution_metrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid,
  "user_id" uuid,
  "tool_name" text NOT NULL,
  "status" tool_execution_status NOT NULL,
  "latency_ms" integer NOT NULL,
  "fallback_used" boolean NOT NULL DEFAULT false,
  "warning_count" integer NOT NULL DEFAULT 0,
  "confidence" double precision,
  "source" text,
  "error" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tool_execution_metrics_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE SET NULL,
  CONSTRAINT "tool_execution_metrics_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "tool_execution_metrics_org_tool_idx"
  ON "tool_execution_metrics" ("org_id", "tool_name");
CREATE INDEX IF NOT EXISTS "tool_execution_metrics_tool_created_idx"
  ON "tool_execution_metrics" ("tool_name", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "tool_execution_metrics_status_idx"
  ON "tool_execution_metrics" ("status");
