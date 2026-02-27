-- Add tier column to MemoryDraft
ALTER TABLE "MemoryDraft" ADD COLUMN "tier" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX "idx_draft_tier" ON "MemoryDraft"("tier");

-- Add tier column to MemoryVerified
ALTER TABLE "MemoryVerified" ADD COLUMN "tier" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX "idx_verified_tier" ON "MemoryVerified"("tier");

-- Create MemoryFeedback table
CREATE TABLE "memory_feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "request_id" TEXT NOT NULL,
    "memory_id" UUID NOT NULL,
    "positive" BOOLEAN NOT NULL,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_feedback_request" ON "memory_feedback"("request_id");
CREATE INDEX "idx_feedback_memory" ON "memory_feedback"("memory_id");

ALTER TABLE "memory_feedback" ADD CONSTRAINT "memory_feedback_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
