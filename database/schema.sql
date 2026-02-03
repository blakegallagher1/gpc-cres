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
    storage_provider TEXT DEFAULT 'backblaze_b2',
    storage_url TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

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
