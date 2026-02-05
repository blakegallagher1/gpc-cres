-- Deal Room + Copilot + What-If + Citations + Packaging + Ingestion + Workstreams

CREATE TABLE IF NOT EXISTS deal_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deal_room_members (
    room_id UUID REFERENCES deal_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role TEXT DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS deal_room_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES deal_rooms(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'agent', 'system')),
    sender_id UUID,
    content_md TEXT NOT NULL,
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deal_room_artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES deal_rooms(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('memo', 'proforma', 'schedule', 'checklist', 'other')),
    title TEXT NOT NULL,
    current_version_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deal_room_artifact_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artifact_id UUID REFERENCES deal_room_artifacts(id) ON DELETE CASCADE,
    content_md TEXT,
    content_json JSONB DEFAULT '{}'::jsonb,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    source_run_id UUID
);

ALTER TABLE deal_room_artifacts
    ADD CONSTRAINT deal_room_artifacts_current_version_fk
    FOREIGN KEY (current_version_id)
    REFERENCES deal_room_artifact_versions(id)
    ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS deal_room_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES deal_rooms(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (
        event_type IN (
            'agent_update',
            'artifact_update',
            'task_created',
            'scenario_run',
            'export_ready',
            'ingestion_complete',
            'system'
        )
    ),
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS citations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    run_id UUID,
    source_type TEXT NOT NULL CHECK (source_type IN ('web', 'file', 'db')),
    title TEXT,
    url TEXT,
    snippet TEXT,
    accessed_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS claim_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID,
    artifact_version_id UUID REFERENCES deal_room_artifact_versions(id) ON DELETE SET NULL,
    claim_text TEXT NOT NULL,
    citation_ids UUID[] DEFAULT '{}'::uuid[],
    confidence NUMERIC(4, 3),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scenarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    base_assumptions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scenario_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE,
    delta_assumptions JSONB DEFAULT '{}'::jsonb,
    results JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS export_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    room_id UUID REFERENCES deal_rooms(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('memo', 'ic_deck', 'underwriting_packet', 'dd_report')),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'failed', 'complete')),
    payload JSONB DEFAULT '{}'::jsonb,
    output_files JSONB DEFAULT '[]'::jsonb,
    errors TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'failed', 'complete')),
    extracted_data JSONB DEFAULT '{}'::jsonb,
    errors TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tone_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    system_prefix TEXT NOT NULL,
    style_guidelines JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY,
    default_tone_profile_id UUID REFERENCES tone_profiles(id) ON DELETE SET NULL,
    notification_prefs JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_user_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sla_hours INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_by_task_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS swimlane TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS agent_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_event_id UUID;

ALTER TABLE tasks
    ADD CONSTRAINT tasks_blocked_by_fk
    FOREIGN KEY (blocked_by_task_id)
    REFERENCES tasks(id)
    ON DELETE SET NULL;

ALTER TABLE tasks
    ADD CONSTRAINT tasks_source_event_fk
    FOREIGN KEY (source_event_id)
    REFERENCES deal_room_events(id)
    ON DELETE SET NULL;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_text TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS classification JSONB DEFAULT '{}'::jsonb;
ALTER TABLE documents ALTER COLUMN storage_provider SET DEFAULT 'supabase';
