-- Align Supabase schema to repo dashboard tables
-- Adds missing columns used by frontend/backend (idempotent)

-- Agents
ALTER TABLE IF EXISTS agents
    ADD COLUMN IF NOT EXISTS handoffs JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS tools JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS system_prompt TEXT,
    ADD COLUMN IF NOT EXISTS model TEXT,
    ADD COLUMN IF NOT EXISTS color TEXT,
    ADD COLUMN IF NOT EXISTS run_count INTEGER DEFAULT 0;

-- Workflows
ALTER TABLE IF EXISTS workflows
    ADD COLUMN IF NOT EXISTS nodes JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS edges JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS run_count INTEGER DEFAULT 0;

-- Runs
ALTER TABLE IF EXISTS runs
    ADD COLUMN IF NOT EXISTS workflow_id UUID,
    ADD COLUMN IF NOT EXISTS agent_id UUID,
    ADD COLUMN IF NOT EXISTS input JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS output JSONB,
    ADD COLUMN IF NOT EXISTS tokens_used INTEGER,
    ADD COLUMN IF NOT EXISTS cost DECIMAL(12, 4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cost_usd DECIMAL(12, 4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'runs_workflow_id_fkey'
    ) THEN
        ALTER TABLE runs
            ADD CONSTRAINT runs_workflow_id_fkey
            FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'runs_agent_id_fkey'
    ) THEN
        ALTER TABLE runs
            ADD CONSTRAINT runs_agent_id_fkey
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Traces
ALTER TABLE IF EXISTS traces
    ADD COLUMN IF NOT EXISTS run_id UUID,
    ADD COLUMN IF NOT EXISTS parent_id UUID,
    ADD COLUMN IF NOT EXISTS type TEXT,
    ADD COLUMN IF NOT EXISTS agent_id UUID,
    ADD COLUMN IF NOT EXISTS tool_name TEXT,
    ADD COLUMN IF NOT EXISTS input JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS output JSONB,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
    ADD COLUMN IF NOT EXISTS tokens_input INTEGER,
    ADD COLUMN IF NOT EXISTS tokens_output INTEGER,
    ADD COLUMN IF NOT EXISTS cost DECIMAL(12, 4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'traces_run_id_fkey'
    ) THEN
        ALTER TABLE traces
            ADD CONSTRAINT traces_run_id_fkey
            FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'traces_parent_id_fkey'
    ) THEN
        ALTER TABLE traces
            ADD CONSTRAINT traces_parent_id_fkey
            FOREIGN KEY (parent_id) REFERENCES traces(id) ON DELETE SET NULL;
    END IF;
END $$;
