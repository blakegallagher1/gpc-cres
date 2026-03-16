ALTER TABLE "opportunity_matches"
ADD COLUMN "pursued_at" TIMESTAMPTZ(6);

CREATE INDEX "opportunity_matches_saved_search_id_pursued_at_idx"
ON "opportunity_matches"("saved_search_id", "pursued_at");
