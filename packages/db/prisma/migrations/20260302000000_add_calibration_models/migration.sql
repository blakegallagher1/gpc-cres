-- Phase 3: calibration v1 models + DealOutcome outcome snapshots.

-- Calibration segments (grouping buckets for bias adjustments).
CREATE TABLE IF NOT EXISTS "CalibrationSegment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" text NOT NULL,
  "property_type" text NOT NULL,
  "market" text NOT NULL,
  "strategy" text NOT NULL,
  "leverage_band" text NOT NULL,
  "vintage_year" integer NOT NULL,
  "noi_bias" double precision,
  "rehab_bias" double precision,
  "exit_cap_bias" double precision,
  "lease_up_bias" double precision,
  "sample_n" integer NOT NULL DEFAULT 0,
  "variance" double precision,
  "mae" double precision,
  "last_updated" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_calibration_segment" ON "CalibrationSegment" (
  "property_type",
  "market",
  "strategy",
  "leverage_band",
  "vintage_year"
);

-- Individual calibration records tied to outcomes.
CREATE TABLE IF NOT EXISTS "CalibrationRecord" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" text NOT NULL,
  "segment_id" uuid NOT NULL,
  "deal_outcome_id" uuid NOT NULL,
  "metric_key" text NOT NULL,
  "projected_value" double precision NOT NULL,
  "actual_value" double precision NOT NULL,
  "delta" double precision NOT NULL,
  "volatility_class" text NOT NULL,
  "effective_weight" double precision NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_cal_record_segment" ON "CalibrationRecord" ("segment_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CalibrationRecord_segment_id_fkey'
  ) THEN
    ALTER TABLE "CalibrationRecord"
      ADD CONSTRAINT "CalibrationRecord_segment_id_fkey"
      FOREIGN KEY ("segment_id") REFERENCES "CalibrationSegment"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Deal outcomes: attach entity + final/projection snapshots for calibration ingestion.
ALTER TABLE "deal_outcomes"
  ADD COLUMN IF NOT EXISTS "entity_id" uuid,
  ADD COLUMN IF NOT EXISTS "final_metrics" jsonb,
  ADD COLUMN IF NOT EXISTS "projection_snapshot" jsonb;

CREATE INDEX IF NOT EXISTS "deal_outcomes_entity_id_idx" ON "deal_outcomes" ("entity_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deal_outcomes_entity_id_fkey'
  ) THEN
    ALTER TABLE "deal_outcomes"
      ADD CONSTRAINT "deal_outcomes_entity_id_fkey"
      FOREIGN KEY ("entity_id") REFERENCES "internal_entities"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
