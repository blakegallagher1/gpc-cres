DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'trajectory_logs'
  ) THEN
    WITH ranked AS (
      SELECT
        "id",
        "agent_id",
        ROW_NUMBER() OVER (
          PARTITION BY "run_id", "agent_id"
          ORDER BY "created_at", "id"
        ) AS duplicate_rank
      FROM "trajectory_logs"
      WHERE "run_id" IS NOT NULL
        AND "agent_id" IS NOT NULL
    )
    UPDATE "trajectory_logs" AS logs
    SET "agent_id" = CONCAT(ranked."agent_id", ':duplicate:', LEFT(logs."id"::TEXT, 8))
    FROM ranked
    WHERE logs."id" = ranked."id"
      AND ranked.duplicate_rank > 1;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "trajectory_logs_run_id_agent_id_key"
  ON "trajectory_logs"("run_id", "agent_id");

CREATE TABLE IF NOT EXISTS "property_observations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "org_id" UUID NOT NULL,
  "observation_key" TEXT NOT NULL,
  "observation_type" TEXT NOT NULL,
  "property_key" TEXT NOT NULL,
  "parcel_id" TEXT,
  "canonical_address" TEXT NOT NULL,
  "source_route" TEXT NOT NULL,
  "source_system" TEXT NOT NULL DEFAULT 'gpc-app',
  "payload_json" JSONB NOT NULL,
  "source_hash" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
  "freshness_tier" TEXT NOT NULL DEFAULT 'live',
  "observed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "promoted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "property_observations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "property_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "org_id" UUID NOT NULL,
  "property_key" TEXT NOT NULL,
  "parcel_id" TEXT,
  "canonical_address" TEXT,
  "summary_text" TEXT,
  "facts_json" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "signals_json" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "last_observation_at" TIMESTAMPTZ(6),
  "last_synthesized_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "property_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "property_learning_candidates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "org_id" UUID NOT NULL,
  "observation_id" UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "candidate_key" TEXT NOT NULL,
  "candidate_type" TEXT NOT NULL,
  "property_key" TEXT NOT NULL,
  "statement" TEXT NOT NULL,
  "payload_json" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "status" TEXT NOT NULL DEFAULT 'candidate',
  "grade_score" DOUBLE PRECISION,
  "grade_json" JSONB,
  "rejection_reason" TEXT,
  "promoted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "property_learning_candidates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "property_learning_evals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "org_id" UUID NOT NULL,
  "candidate_id" UUID NOT NULL,
  "eval_key" TEXT NOT NULL,
  "grader_version" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "passed" BOOLEAN NOT NULL,
  "grade_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "property_learning_evals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "property_observations_org_id_observation_key_key"
  ON "property_observations"("org_id", "observation_key");
CREATE INDEX IF NOT EXISTS "property_observations_org_id_property_key_idx"
  ON "property_observations"("org_id", "property_key");
CREATE INDEX IF NOT EXISTS "property_observations_org_id_parcel_id_idx"
  ON "property_observations"("org_id", "parcel_id");
CREATE INDEX IF NOT EXISTS "property_observations_org_id_observed_at_idx"
  ON "property_observations"("org_id", "observed_at");
CREATE INDEX IF NOT EXISTS "property_observations_source_hash_idx"
  ON "property_observations"("source_hash");

CREATE UNIQUE INDEX IF NOT EXISTS "property_profiles_org_id_property_key_key"
  ON "property_profiles"("org_id", "property_key");
CREATE INDEX IF NOT EXISTS "property_profiles_org_id_parcel_id_idx"
  ON "property_profiles"("org_id", "parcel_id");
CREATE INDEX IF NOT EXISTS "property_profiles_org_id_last_observation_at_idx"
  ON "property_profiles"("org_id", "last_observation_at");

CREATE UNIQUE INDEX IF NOT EXISTS "property_learning_candidates_org_id_candidate_key_key"
  ON "property_learning_candidates"("org_id", "candidate_key");
CREATE INDEX IF NOT EXISTS "property_learning_candidates_org_id_property_key_idx"
  ON "property_learning_candidates"("org_id", "property_key");
CREATE INDEX IF NOT EXISTS "property_learning_candidates_org_id_status_idx"
  ON "property_learning_candidates"("org_id", "status");
CREATE INDEX IF NOT EXISTS "property_learning_candidates_org_id_candidate_type_idx"
  ON "property_learning_candidates"("org_id", "candidate_type");
CREATE INDEX IF NOT EXISTS "property_learning_candidates_observation_id_idx"
  ON "property_learning_candidates"("observation_id");
CREATE INDEX IF NOT EXISTS "property_learning_candidates_profile_id_idx"
  ON "property_learning_candidates"("profile_id");

CREATE UNIQUE INDEX IF NOT EXISTS "property_learning_evals_org_id_eval_key_key"
  ON "property_learning_evals"("org_id", "eval_key");
CREATE INDEX IF NOT EXISTS "property_learning_evals_org_id_passed_idx"
  ON "property_learning_evals"("org_id", "passed");
CREATE INDEX IF NOT EXISTS "property_learning_evals_candidate_id_idx"
  ON "property_learning_evals"("candidate_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_observations_org_id_fkey'
  ) THEN
    ALTER TABLE "property_observations"
      ADD CONSTRAINT "property_observations_org_id_fkey"
      FOREIGN KEY ("org_id") REFERENCES "orgs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_profiles_org_id_fkey'
  ) THEN
    ALTER TABLE "property_profiles"
      ADD CONSTRAINT "property_profiles_org_id_fkey"
      FOREIGN KEY ("org_id") REFERENCES "orgs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_learning_candidates_org_id_fkey'
  ) THEN
    ALTER TABLE "property_learning_candidates"
      ADD CONSTRAINT "property_learning_candidates_org_id_fkey"
      FOREIGN KEY ("org_id") REFERENCES "orgs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_learning_candidates_observation_id_fkey'
  ) THEN
    ALTER TABLE "property_learning_candidates"
      ADD CONSTRAINT "property_learning_candidates_observation_id_fkey"
      FOREIGN KEY ("observation_id") REFERENCES "property_observations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_learning_candidates_profile_id_fkey'
  ) THEN
    ALTER TABLE "property_learning_candidates"
      ADD CONSTRAINT "property_learning_candidates_profile_id_fkey"
      FOREIGN KEY ("profile_id") REFERENCES "property_profiles"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_learning_evals_org_id_fkey'
  ) THEN
    ALTER TABLE "property_learning_evals"
      ADD CONSTRAINT "property_learning_evals_org_id_fkey"
      FOREIGN KEY ("org_id") REFERENCES "orgs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_learning_evals_candidate_id_fkey'
  ) THEN
    ALTER TABLE "property_learning_evals"
      ADD CONSTRAINT "property_learning_evals_candidate_id_fkey"
      FOREIGN KEY ("candidate_id") REFERENCES "property_learning_candidates"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
