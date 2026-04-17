-- Add structured decision rationale to DealStageHistory so every stage move
-- carries auditable criteria + metrics alongside the free-text note.
ALTER TABLE "deal_stage_history"
  ADD COLUMN IF NOT EXISTS "decision_criteria" JSONB,
  ADD COLUMN IF NOT EXISTS "decision_metrics" JSONB,
  ADD COLUMN IF NOT EXISTS "decision_rationale" TEXT,
  ADD COLUMN IF NOT EXISTS "approval_request_id" UUID;

-- Deal-level collaboration thread. Separate from Conversation (which is
-- agent-scoped) so team discussion has its own surface with threading,
-- mentions, and soft-delete.
CREATE TABLE IF NOT EXISTS "deal_comments" (
  "id" UUID NOT NULL,
  "org_id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "author_user_id" UUID NOT NULL,
  "parent_comment_id" UUID,
  "body" TEXT NOT NULL,
  "mentions" UUID[] NOT NULL DEFAULT '{}',
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "deal_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "deal_comments_org_deal_created_idx"
  ON "deal_comments" ("org_id", "deal_id", "created_at");

CREATE INDEX IF NOT EXISTS "deal_comments_parent_idx"
  ON "deal_comments" ("parent_comment_id");

ALTER TABLE "deal_comments"
  ADD CONSTRAINT "deal_comments_org_fkey"
  FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;

ALTER TABLE "deal_comments"
  ADD CONSTRAINT "deal_comments_deal_fkey"
  FOREIGN KEY ("deal_id", "org_id") REFERENCES "deals"("id", "org_id") ON DELETE CASCADE;

ALTER TABLE "deal_comments"
  ADD CONSTRAINT "deal_comments_author_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;

ALTER TABLE "deal_comments"
  ADD CONSTRAINT "deal_comments_parent_fkey"
  FOREIGN KEY ("parent_comment_id") REFERENCES "deal_comments"("id") ON DELETE SET NULL;
