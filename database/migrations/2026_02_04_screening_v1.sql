-- Deal Screening MVP (v1)
-- New normalized `screening_*` tables (keeps legacy `screener_*` intact)

CREATE TABLE IF NOT EXISTS screening_playbooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version INTEGER NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'screening_playbooks_version_unique'
    ) THEN
        ALTER TABLE screening_playbooks
            ADD CONSTRAINT screening_playbooks_version_unique UNIQUE (version);
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_screening_playbooks_one_active
    ON screening_playbooks (is_active)
    WHERE is_active;

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

CREATE INDEX IF NOT EXISTS idx_screening_runs_project_id ON screening_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_screening_runs_status ON screening_runs(status);
CREATE INDEX IF NOT EXISTS idx_screening_runs_created_at ON screening_runs(created_at DESC);

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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'screening_scores_run_unique'
    ) THEN
        ALTER TABLE screening_scores
            ADD CONSTRAINT screening_scores_run_unique UNIQUE (screening_run_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_screening_scores_run_id ON screening_scores(screening_run_id);
CREATE INDEX IF NOT EXISTS idx_screening_scores_overall_score ON screening_scores(overall_score DESC);

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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'screening_field_values_run_key_unique'
    ) THEN
        ALTER TABLE screening_field_values
            ADD CONSTRAINT screening_field_values_run_key_unique UNIQUE (screening_run_id, field_key);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_screening_field_values_run_id ON screening_field_values(screening_run_id);
CREATE INDEX IF NOT EXISTS idx_screening_field_values_key ON screening_field_values(field_key);

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

CREATE INDEX IF NOT EXISTS idx_screening_overrides_project_id ON screening_overrides(project_id);
CREATE INDEX IF NOT EXISTS idx_screening_overrides_scope ON screening_overrides(scope);
CREATE INDEX IF NOT EXISTS idx_screening_overrides_created_at ON screening_overrides(created_at DESC);

-- Ensure the updated_at trigger function exists (used by schema.sql; safe to define here too)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_screening_playbooks_updated_at') THEN
        CREATE TRIGGER update_screening_playbooks_updated_at
            BEFORE UPDATE ON screening_playbooks
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_screening_runs_updated_at') THEN
        CREATE TRIGGER update_screening_runs_updated_at
            BEFORE UPDATE ON screening_runs
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_screening_scores_updated_at') THEN
        CREATE TRIGGER update_screening_scores_updated_at
            BEFORE UPDATE ON screening_scores
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_screening_field_values_updated_at') THEN
        CREATE TRIGGER update_screening_field_values_updated_at
            BEFORE UPDATE ON screening_field_values
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Seed a default active playbook if none exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM screening_playbooks) THEN
        INSERT INTO screening_playbooks (version, is_active, settings)
        VALUES (
            1,
            TRUE,
            jsonb_build_object(
                'low_confidence_threshold', 0.70,
                'hard_filters', jsonb_build_object(
                    'min_dscr', 1.25,
                    'min_cap_rate', 0.07,
                    'min_yield_spread', 0.015
                ),
                'debt_template', jsonb_build_object(
                    'ltv', 0.65,
                    'interest_rate', 0.07,
                    'amort_years', 25,
                    'io_years', 0,
                    'debt_fee_rate', 0.01
                ),
                'closing_costs', jsonb_build_object(
                    'legal_pct', 0.005,
                    'title_pct', 0.003,
                    'due_diligence_flat', 25000
                ),
                'reserves', jsonb_build_object(
                    'capex_reserve_per_sf_year', 0.25
                ),
                'scoring_bands', jsonb_build_object(
                    'cap_rate', jsonb_build_array(0.07, 0.08, 0.09, 0.10, 0.11),
                    'dscr', jsonb_build_array(1.25, 1.40, 1.55, 1.70, 1.85),
                    'cash_on_cash', jsonb_build_array(0.06, 0.08, 0.10, 0.12, 0.14),
                    'yield_spread', jsonb_build_array(0.015, 0.020, 0.025, 0.030, 0.035),
                    'qualitative', jsonb_build_array(1, 2, 3, 4, 5)
                )
            )
        );
    END IF;
END $$;

