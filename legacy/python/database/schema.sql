-- ============================================
-- Gallagher Property Company - Database Schema
-- Supabase PostgreSQL
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Core Tables
-- ============================================

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    address TEXT,
    parcel_id TEXT,
    property_type TEXT,
    status TEXT DEFAULT 'prospecting',
    
    -- Physical attributes
    acres DECIMAL(10, 2),
    square_feet DECIMAL(12, 2),
    
    -- Financial
    asking_price DECIMAL(15, 2),
    purchase_price DECIMAL(15, 2),
    total_project_cost DECIMAL(15, 2),
    target_irr DECIMAL(5, 4) DEFAULT 0.20,
    
    -- Key dates
    acquisition_date DATE,
    construction_start DATE,
    projected_completion DATE,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Agent outputs table
CREATE TABLE IF NOT EXISTS agent_outputs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    task_type TEXT NOT NULL,
    
    -- Input/output data
    input_data JSONB DEFAULT '{}'::jsonb,
    output_data JSONB DEFAULT '{}'::jsonb,
    
    -- Quality metrics
    confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
    sources TEXT[],
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Task details
    title TEXT NOT NULL,
    description TEXT,
    assigned_agent TEXT,
    assignee_user_id UUID,
    sla_hours INTEGER,
    blocked_by_task_id UUID,
    swimlane TEXT,
    agent_generated BOOLEAN DEFAULT FALSE,
    source_event_id UUID,
    
    -- Status tracking
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked', 'cancelled')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    
    -- Dates
    due_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Document details
    document_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    
    -- Storage
    storage_provider TEXT DEFAULT 'supabase',
    storage_path TEXT,
    storage_url TEXT,
    extracted_text TEXT,
    classification JSONB DEFAULT '{}'::jsonb,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

-- ============================================
-- Deal Room Collaboration Tables
-- ============================================

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

-- Financial models table
CREATE TABLE IF NOT EXISTS financial_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Model details
    model_name TEXT NOT NULL,
    model_type TEXT NOT NULL, -- 'pro_forma', 'waterfall', 'sensitivity'
    
    -- Assumptions
    assumptions JSONB DEFAULT '{}'::jsonb,
    
    -- Results
    results JSONB DEFAULT '{}'::jsonb,
    cash_flows JSONB DEFAULT '[]'::jsonb,
    
    -- Scenarios
    base_case JSONB DEFAULT '{}'::jsonb,
    upside_case JSONB DEFAULT '{}'::jsonb,
    downside_case JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permits table
CREATE TABLE IF NOT EXISTS permits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Permit details
    permit_type TEXT NOT NULL,
    permit_number TEXT,
    issuing_authority TEXT,
    permit_category TEXT,
    priority TEXT,
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'under_review', 'approved', 'rejected', 'expired')),
    
    -- Dates
    applied_date DATE,
    approved_date DATE,
    expiration_date DATE,
    estimated_completion DATE,
    
    -- Notes
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Deal Screener Tables
-- ============================================

CREATE TABLE IF NOT EXISTS screener_listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    source TEXT,
    address TEXT,
    parcel_id TEXT,
    listing_data JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'new',
    score_total DECIMAL(6, 2),
    score_tier TEXT,
    score_detail JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS screener_criteria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    weights JSONB DEFAULT '{}'::jsonb,
    thresholds JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS screener_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID REFERENCES screener_listings(id) ON DELETE CASCADE,
    alert_type TEXT,
    message TEXT,
    severity TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Deal Screening (v1) Tables
-- ============================================

CREATE TABLE IF NOT EXISTS screening_playbooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version INTEGER NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE screening_playbooks
    ADD CONSTRAINT screening_playbooks_version_unique UNIQUE (version);

CREATE TABLE IF NOT EXISTS screening_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    playbook_version INTEGER NOT NULL,
    playbook_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    trigger TEXT NOT NULL DEFAULT 'intake',
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'failed', 'complete')),
    needs_review BOOLEAN NOT NULL DEFAULT FALSE,
    low_confidence_keys TEXT[] DEFAULT '{}'::text[],
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID,
    errors TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS screening_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    screening_run_id UUID REFERENCES screening_runs(id) ON DELETE CASCADE,
    overall_score NUMERIC(3, 2) CHECK (overall_score IS NULL OR (overall_score >= 1 AND overall_score <= 5)),
    financial_score NUMERIC(3, 2) CHECK (financial_score IS NULL OR (financial_score >= 1 AND financial_score <= 5)),
    qualitative_score NUMERIC(3, 2) CHECK (qualitative_score IS NULL OR (qualitative_score >= 1 AND qualitative_score <= 5)),
    is_provisional BOOLEAN NOT NULL DEFAULT TRUE,
    hard_filter_failed BOOLEAN NOT NULL DEFAULT FALSE,
    hard_filter_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    missing_keys TEXT[] DEFAULT '{}'::text[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE screening_scores
    ADD CONSTRAINT screening_scores_run_unique UNIQUE (screening_run_id);

CREATE TABLE IF NOT EXISTS screening_field_values (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    screening_run_id UUID REFERENCES screening_runs(id) ON DELETE CASCADE,
    field_key TEXT NOT NULL,
    value_text TEXT,
    value_number NUMERIC(18, 4),
    value_bool BOOLEAN,
    value_date DATE,
    value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    unit TEXT,
    confidence NUMERIC(4, 3),
    extraction_method TEXT NOT NULL DEFAULT 'manual',
    source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    citation_ids UUID[] DEFAULT '{}'::uuid[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE screening_field_values
    ADD CONSTRAINT screening_field_values_run_key_unique UNIQUE (screening_run_id, field_key);

CREATE TABLE IF NOT EXISTS screening_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    scope TEXT NOT NULL DEFAULT 'field' CHECK (scope IN ('field', 'score')),
    field_key TEXT,
    value_text TEXT,
    value_number NUMERIC(18, 4),
    value_bool BOOLEAN,
    value_date DATE,
    value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    unit TEXT,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Due Diligence Tables
-- ============================================

CREATE TABLE IF NOT EXISTS dd_deals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    key_dates JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dd_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dd_deal_id UUID REFERENCES dd_deals(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    title TEXT,
    storage_ref TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dd_checklist_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dd_deal_id UUID REFERENCES dd_deals(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    phase TEXT,
    category TEXT,
    assigned_to TEXT,
    due_date DATE,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dd_red_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dd_deal_id UUID REFERENCES dd_deals(id) ON DELETE CASCADE,
    severity TEXT,
    description TEXT NOT NULL,
    category TEXT,
    status TEXT DEFAULT 'open',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Entitlements Tables
-- ============================================

CREATE TABLE IF NOT EXISTS zoning_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    parcel_id TEXT,
    proposed_use TEXT NOT NULL,
    zoning_code TEXT,
    analysis JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agenda_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    body TEXT NOT NULL,
    date DATE NOT NULL,
    topic TEXT NOT NULL,
    source TEXT,
    jurisdiction TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS policy_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    body TEXT NOT NULL,
    effective_date DATE,
    source TEXT,
    jurisdiction TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Market Intelligence Tables
-- ============================================

CREATE TABLE IF NOT EXISTS competitor_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region TEXT,
    property_type TEXT,
    address TEXT,
    transaction_date DATE,
    price DECIMAL(15, 2),
    size DECIMAL(12, 2),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS economic_indicators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region TEXT,
    indicator_name TEXT,
    value DECIMAL(18, 4),
    period TEXT,
    source TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS infrastructure_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region TEXT,
    name TEXT,
    status TEXT,
    description TEXT,
    start_date DATE,
    completion_date DATE,
    budget DECIMAL(15, 2),
    source TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS absorption_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region TEXT,
    property_type TEXT,
    period TEXT,
    absorption_rate DECIMAL(8, 4),
    net_absorption DECIMAL(12, 2),
    vacancy_rate DECIMAL(6, 4),
    data_source TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contractors table
CREATE TABLE IF NOT EXISTS contractors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Company info
    company_name TEXT NOT NULL,
    trade TEXT NOT NULL,
    
    -- Contact
    contact_name TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    
    -- Credentials
    license_number TEXT,
    insurance_expiry DATE,
    bonding_capacity DECIMAL(12, 2),
    
    -- Performance
    performance_rating DECIMAL(2, 1), -- 0.0 to 5.0
    safety_rating DECIMAL(2, 1),
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project contractors junction table
CREATE TABLE IF NOT EXISTS project_contractors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    contractor_id UUID REFERENCES contractors(id) ON DELETE CASCADE,
    
    role TEXT NOT NULL,
    contract_amount DECIMAL(12, 2),
    contract_date DATE,
    
    UNIQUE(project_id, contractor_id, role)
);

-- ============================================
-- Agent Dashboard Tables
-- ============================================

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    model TEXT NOT NULL,
    system_prompt TEXT,
    tools JSONB DEFAULT '[]'::jsonb,
    handoffs JSONB DEFAULT '[]'::jsonb,
    config JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'idle' CHECK (status IN ('active', 'idle', 'error')),
    run_count INTEGER DEFAULT 0,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workflows table
CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    nodes JSONB DEFAULT '[]'::jsonb,
    edges JSONB DEFAULT '[]'::jsonb,
    config JSONB DEFAULT '{}'::jsonb,
    run_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Runs table
CREATE TABLE IF NOT EXISTS runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('success', 'running', 'error', 'pending', 'cancelled')),
    input JSONB DEFAULT '{}'::jsonb,
    output JSONB,
    tokens_used INTEGER,
    cost DECIMAL(12, 4) DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER
);

-- Traces table
CREATE TABLE IF NOT EXISTS traces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES traces(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('llm', 'tool', 'handoff', 'custom')),
    name TEXT NOT NULL,
    input JSONB DEFAULT '{}'::jsonb,
    output JSONB,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    duration_ms INTEGER,
    tokens_input INTEGER,
    tokens_output INTEGER,
    cost DECIMAL(12, 4) DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================
-- Indexes
-- ============================================

-- Projects indexes
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_property_type ON projects(property_type);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

-- Agent outputs indexes
CREATE INDEX IF NOT EXISTS idx_agent_outputs_project_id ON agent_outputs(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_agent_name ON agent_outputs(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_created_at ON agent_outputs(created_at DESC);

-- Tasks indexes
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

-- Documents indexes
CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_document_type ON documents(document_type);

-- Financial models indexes
CREATE INDEX IF NOT EXISTS idx_financial_models_project_id ON financial_models(project_id);

-- Permits indexes
CREATE INDEX IF NOT EXISTS idx_permits_project_id ON permits(project_id);
CREATE INDEX IF NOT EXISTS idx_permits_status ON permits(status);

-- Deal screener indexes
CREATE INDEX IF NOT EXISTS idx_screener_listings_project_id ON screener_listings(project_id);
CREATE INDEX IF NOT EXISTS idx_screener_listings_status ON screener_listings(status);
CREATE INDEX IF NOT EXISTS idx_screener_listings_created_at ON screener_listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_screener_criteria_created_at ON screener_criteria(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_screener_alerts_listing_id ON screener_alerts(listing_id);
CREATE INDEX IF NOT EXISTS idx_screener_alerts_created_at ON screener_alerts(created_at DESC);

-- Deal screening indexes
CREATE UNIQUE INDEX IF NOT EXISTS uniq_screening_playbooks_one_active
    ON screening_playbooks (is_active)
    WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_screening_runs_project_id ON screening_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_screening_runs_status ON screening_runs(status);
CREATE INDEX IF NOT EXISTS idx_screening_runs_created_at ON screening_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_screening_scores_run_id ON screening_scores(screening_run_id);
CREATE INDEX IF NOT EXISTS idx_screening_scores_overall_score ON screening_scores(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_screening_field_values_run_id ON screening_field_values(screening_run_id);
CREATE INDEX IF NOT EXISTS idx_screening_field_values_key ON screening_field_values(field_key);
CREATE INDEX IF NOT EXISTS idx_screening_overrides_project_id ON screening_overrides(project_id);
CREATE INDEX IF NOT EXISTS idx_screening_overrides_scope ON screening_overrides(scope);
CREATE INDEX IF NOT EXISTS idx_screening_overrides_created_at ON screening_overrides(created_at DESC);

-- Due diligence indexes
CREATE INDEX IF NOT EXISTS idx_dd_deals_project_id ON dd_deals(project_id);
CREATE INDEX IF NOT EXISTS idx_dd_deals_status ON dd_deals(status);
CREATE INDEX IF NOT EXISTS idx_dd_documents_dd_deal_id ON dd_documents(dd_deal_id);
CREATE INDEX IF NOT EXISTS idx_dd_checklist_items_dd_deal_id ON dd_checklist_items(dd_deal_id);
CREATE INDEX IF NOT EXISTS idx_dd_checklist_items_status ON dd_checklist_items(status);
CREATE INDEX IF NOT EXISTS idx_dd_red_flags_dd_deal_id ON dd_red_flags(dd_deal_id);
CREATE INDEX IF NOT EXISTS idx_dd_red_flags_status ON dd_red_flags(status);

-- Entitlements indexes
CREATE INDEX IF NOT EXISTS idx_zoning_analysis_project_id ON zoning_analysis(project_id);
CREATE INDEX IF NOT EXISTS idx_agenda_items_date ON agenda_items(date DESC);
CREATE INDEX IF NOT EXISTS idx_policy_changes_effective_date ON policy_changes(effective_date DESC);

-- Market intelligence indexes
CREATE INDEX IF NOT EXISTS idx_competitor_transactions_region ON competitor_transactions(region);
CREATE INDEX IF NOT EXISTS idx_competitor_transactions_property_type ON competitor_transactions(property_type);
CREATE INDEX IF NOT EXISTS idx_competitor_transactions_date ON competitor_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_economic_indicators_region ON economic_indicators(region);
CREATE INDEX IF NOT EXISTS idx_economic_indicators_indicator_name ON economic_indicators(indicator_name);
CREATE INDEX IF NOT EXISTS idx_infrastructure_projects_region ON infrastructure_projects(region);
CREATE INDEX IF NOT EXISTS idx_infrastructure_projects_status ON infrastructure_projects(status);
CREATE INDEX IF NOT EXISTS idx_absorption_data_region ON absorption_data(region);
CREATE INDEX IF NOT EXISTS idx_absorption_data_property_type ON absorption_data(property_type);

-- Agents indexes
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at DESC);

-- Workflows indexes
CREATE INDEX IF NOT EXISTS idx_workflows_updated_at ON workflows(updated_at DESC);

-- Runs indexes
CREATE INDEX IF NOT EXISTS idx_runs_agent_id ON runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at DESC);

-- Traces indexes
CREATE INDEX IF NOT EXISTS idx_traces_run_id ON traces(run_id);
CREATE INDEX IF NOT EXISTS idx_traces_started_at ON traces(started_at DESC);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE screener_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE screener_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE screener_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_red_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoning_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE economic_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE infrastructure_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE absorption_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE traces ENABLE ROW LEVEL SECURITY;

-- Create policies (simplified - adjust based on auth requirements)
-- For now, allow all access (update with proper auth in production)
CREATE POLICY "Allow all" ON projects FOR ALL USING (true);
CREATE POLICY "Allow all" ON agent_outputs FOR ALL USING (true);
CREATE POLICY "Allow all" ON tasks FOR ALL USING (true);
CREATE POLICY "Allow all" ON documents FOR ALL USING (true);
CREATE POLICY "Allow all" ON financial_models FOR ALL USING (true);
CREATE POLICY "Allow all" ON permits FOR ALL USING (true);
CREATE POLICY "Allow all" ON screener_listings FOR ALL USING (true);
CREATE POLICY "Allow all" ON screener_criteria FOR ALL USING (true);
CREATE POLICY "Allow all" ON screener_alerts FOR ALL USING (true);
CREATE POLICY "Allow all" ON screening_playbooks FOR ALL USING (true);
CREATE POLICY "Allow all" ON screening_runs FOR ALL USING (true);
CREATE POLICY "Allow all" ON screening_scores FOR ALL USING (true);
CREATE POLICY "Allow all" ON screening_field_values FOR ALL USING (true);
CREATE POLICY "Allow all" ON screening_overrides FOR ALL USING (true);
CREATE POLICY "Allow all" ON dd_deals FOR ALL USING (true);
CREATE POLICY "Allow all" ON dd_documents FOR ALL USING (true);
CREATE POLICY "Allow all" ON dd_checklist_items FOR ALL USING (true);
CREATE POLICY "Allow all" ON dd_red_flags FOR ALL USING (true);
CREATE POLICY "Allow all" ON zoning_analysis FOR ALL USING (true);
CREATE POLICY "Allow all" ON agenda_items FOR ALL USING (true);
CREATE POLICY "Allow all" ON policy_changes FOR ALL USING (true);
CREATE POLICY "Allow all" ON competitor_transactions FOR ALL USING (true);
CREATE POLICY "Allow all" ON economic_indicators FOR ALL USING (true);
CREATE POLICY "Allow all" ON infrastructure_projects FOR ALL USING (true);
CREATE POLICY "Allow all" ON absorption_data FOR ALL USING (true);
CREATE POLICY "Allow all" ON contractors FOR ALL USING (true);
CREATE POLICY "Allow all" ON project_contractors FOR ALL USING (true);
CREATE POLICY "Allow all" ON agents FOR ALL USING (true);
CREATE POLICY "Allow all" ON workflows FOR ALL USING (true);
CREATE POLICY "Allow all" ON runs FOR ALL USING (true);
CREATE POLICY "Allow all" ON traces FOR ALL USING (true);

-- ============================================
-- Functions and Triggers
-- ============================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update trigger to tables with updated_at
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_permits_updated_at
    BEFORE UPDATE ON permits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_screener_listings_updated_at
    BEFORE UPDATE ON screener_listings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_screener_criteria_updated_at
    BEFORE UPDATE ON screener_criteria
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_screening_playbooks_updated_at
    BEFORE UPDATE ON screening_playbooks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_screening_runs_updated_at
    BEFORE UPDATE ON screening_runs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_screening_scores_updated_at
    BEFORE UPDATE ON screening_scores
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_screening_field_values_updated_at
    BEFORE UPDATE ON screening_field_values
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dd_deals_updated_at
    BEFORE UPDATE ON dd_deals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_financial_models_updated_at
    BEFORE UPDATE ON financial_models
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflows_updated_at
    BEFORE UPDATE ON workflows
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to get project summary
CREATE OR REPLACE FUNCTION get_project_summary(project_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'project', row_to_json(p),
        'task_count', (SELECT COUNT(*) FROM tasks WHERE project_id = project_uuid),
        'pending_tasks', (SELECT COUNT(*) FROM tasks WHERE project_id = project_uuid AND status = 'pending'),
        'recent_outputs', (SELECT jsonb_agg(ao) FROM agent_outputs ao WHERE project_id = project_uuid ORDER BY created_at DESC LIMIT 5),
        'document_count', (SELECT COUNT(*) FROM documents WHERE project_id = project_uuid)
    )
    INTO result
    FROM projects p
    WHERE p.id = project_uuid;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Sample Data (Optional - for testing)
-- ============================================

-- Insert sample project (uncomment if needed)
-- INSERT INTO projects (name, address, property_type, status, acres, asking_price)
-- VALUES (
--     'Airline Highway MHP Site',
--     '12345 Airline Highway, Baton Rouge, LA 70816',
--     'mobile_home_park',
--     'prospecting',
--     10.5,
--     1200000
-- );
