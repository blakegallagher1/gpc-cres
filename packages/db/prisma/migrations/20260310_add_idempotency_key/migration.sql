-- Add idempotency_key column for durable dedup of automation event dispatch.
-- Uses a standard (non-partial) unique index to match Prisma @unique semantics.
-- Postgres treats NULLs as distinct in unique indexes, so legacy rows without
-- keys coexist safely. This prevents prisma migrate from detecting drift.
ALTER TABLE automation_events ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Drop any pre-existing partial index (if present from earlier migration attempt)
-- then create the Prisma-compatible non-partial unique index.
DROP INDEX IF EXISTS "automation_events_idempotency_key_key";
CREATE UNIQUE INDEX "automation_events_idempotency_key_key"
  ON automation_events USING btree (idempotency_key);
