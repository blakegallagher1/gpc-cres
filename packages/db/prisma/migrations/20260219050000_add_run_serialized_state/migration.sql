-- SDK-011: Persist serialized run checkpoints for interruption/resumption.
ALTER TABLE "runs"
ADD COLUMN IF NOT EXISTS "serialized_state" JSONB;
