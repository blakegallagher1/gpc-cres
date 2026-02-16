-- Add automation events table for automation dashboard and event logging.

CREATE TABLE IF NOT EXISTS "automation_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id" UUID,
  "handler_name" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "input_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "output_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "error" TEXT,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "completed_at" TIMESTAMPTZ(6),
  "duration_ms" INTEGER,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "automation_events_deal_id_idx" ON "automation_events" ("deal_id");
CREATE INDEX IF NOT EXISTS "automation_events_handler_name_idx" ON "automation_events" ("handler_name");
CREATE INDEX IF NOT EXISTS "automation_events_status_idx" ON "automation_events" ("status");
CREATE INDEX IF NOT EXISTS "automation_events_started_at_idx" ON "automation_events" ("started_at" DESC);
