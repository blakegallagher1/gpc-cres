-- Migration: Add org_id to automation_events for multi-tenant isolation
-- Applied via: admin API POST /admin/db/query or SSH
-- Date: 2026-03-04

BEGIN;

-- Step 1: Add nullable column
ALTER TABLE automation_events ADD COLUMN IF NOT EXISTS org_id UUID;

-- Step 2: Backfill from deals table (most events have a deal_id)
UPDATE automation_events ae
SET org_id = d.org_id
FROM deals d
WHERE ae.deal_id = d.id AND ae.org_id IS NULL;

-- Step 3: Fill remaining events (no deal_id) with the first org
UPDATE automation_events
SET org_id = (SELECT id FROM orgs LIMIT 1)
WHERE org_id IS NULL;

-- Step 4: Make NOT NULL
ALTER TABLE automation_events ALTER COLUMN org_id SET NOT NULL;

-- Step 5: Add indexes
CREATE INDEX IF NOT EXISTS idx_automation_events_org_id ON automation_events (org_id);
CREATE INDEX IF NOT EXISTS idx_automation_events_org_id_deal_id ON automation_events (org_id, deal_id);

COMMIT;
