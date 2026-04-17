-- MOAT-P4-001: email-to-deal ingestion audit log.
--
-- Stores every inbound broker/prospect email the webhook receives, regardless
-- of whether parsing or auto-deal creation succeeds. `parsed_deal_id` is an
-- unlinked UUID pointer (no FK) so operators can audit/reparse history without
-- coupling to the deal lifecycle; if a deal is deleted the pointer becomes
-- dangling, which is acceptable for an audit trail.
CREATE TABLE IF NOT EXISTS "inbound_emails" (
  "id" UUID NOT NULL,
  "org_id" UUID,
  "source" TEXT NOT NULL,
  "from_address" TEXT NOT NULL,
  "to_address" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body_text" TEXT NOT NULL,
  "body_html" TEXT,
  "message_id" TEXT,
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "parsed_at" TIMESTAMPTZ(6),
  "parsed_deal_id" UUID,
  "parse_status" TEXT NOT NULL DEFAULT 'pending',
  "parse_error" TEXT,
  "parsed_fields" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "raw_headers" JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "inbound_emails_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inbound_emails_message_id_key"
  ON "inbound_emails" ("message_id")
  WHERE "message_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "inbound_emails_org_id_idx"
  ON "inbound_emails" ("org_id");

CREATE INDEX IF NOT EXISTS "inbound_emails_received_at_idx"
  ON "inbound_emails" ("received_at" DESC);

CREATE INDEX IF NOT EXISTS "inbound_emails_parsed_deal_id_idx"
  ON "inbound_emails" ("parsed_deal_id");

ALTER TABLE "inbound_emails"
  ADD CONSTRAINT "inbound_emails_org_fkey"
  FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE SET NULL;
