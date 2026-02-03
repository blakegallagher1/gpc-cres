# Gallagher Property Company - AI Agent System
## Project Implementation Summary

### Date: January 2026
### Version: 1.0.0

---

## Executive Summary

This document summarizes the implementation of a production-grade multi-agent AI system for commercial real estate development workflows. The system comprises 8 specialized agents plus a coordinator, built with the latest OpenAI Agents SDK (v0.7.0) and GPT-5.2 flagship model.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    COORDINATOR AGENT                            │
│         (Orchestration, Routing, State Management)              │
│                    GPT-5.2 | Flagship                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ RESEARCH │ │ FINANCE  │ │  LEGAL   │ │  DESIGN  │           │
│  │  AGENT   │ │  AGENT   │ │  AGENT   │ │  AGENT   │           │
│  │ GPT-5.1  │ │ GPT-5.2  │ │ GPT-5.1  │ │ GPT-5.1  │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│  │OPERATIONS│ │MARKETING │ │   RISK   │                        │
│  │  AGENT   │ │  AGENT   │ │  AGENT   │                        │
│  │ GPT-5.1  │ │ GPT-5.1  │ │ GPT-5.1  │                        │
│  └──────────┘ └──────────┘ └──────────┘                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Agent Specifications

### 1. Coordinator Agent
- **Model**: GPT-5.2
- **Purpose**: Central orchestration and workflow management
- **Key Capabilities**:
  - Task decomposition and routing
  - Sequential, parallel, and iterative workflow patterns
  - State management and conflict resolution
  - Output synthesis from multiple agents
- **Tools**: `get_project_status`, `update_project_state`, `create_task`, `route_to_agents`
- **Handoffs**: All 7 specialist agents

### 2. Research Agent
- **Model**: GPT-5.1
- **Purpose**: Market research, parcel analysis, and feasibility studies
- **Key Capabilities**:
  - Land scouting and parcel research
  - Market data retrieval (vacancy, rents, absorption)
  - Comparable property analysis
  - Due diligence support
- **Tools**: `search_parcels`, `get_market_data`, `analyze_comparables`, `research_parcel`, `get_location_analysis`
- **Integrations**: Perplexity Sonar Pro API, Google Maps/Places API
- **Handoffs**: Risk Agent, Finance Agent

### 3. Finance Agent
- **Model**: GPT-5.2
- **Purpose**: Underwriting, financial modeling, and capital structure
- **Key Capabilities**:
  - Pro forma development with 5-year projections
  - IRR, Equity Multiple, Cash-on-Cash calculations
  - GP/LP waterfall modeling
  - Debt sizing (DSCR, LTV, Debt Yield)
  - Sensitivity analysis
- **Tools**: `build_proforma`, `model_waterfall`, `size_debt`, `run_sensitivity`
- **Calculations**: IRR, NPV, Equity Multiple, DSCR, LTV, Mortgage Payments
- **Handoffs**: Legal Agent, Risk Agent

### 4. Legal Agent
- **Model**: GPT-5.1
- **Purpose**: Contracts, zoning, permits, and compliance
- **Key Capabilities**:
  - Zoning compliance analysis (EBR Parish UDC)
  - Contract drafting (PSA, leases, JV agreements)
  - Contract review with issue identification
  - Permit tracking
- **Tools**: `analyze_zoning`, `draft_document`, `review_contract`, `track_permits`
- **Specialty**: Louisiana civil law, East Baton Rouge Parish regulations
- **Handoffs**: Finance Agent, Research Agent

### 5. Design Agent
- **Model**: GPT-5.1
- **Purpose**: Site planning and development capacity
- **Key Capabilities**:
  - Development capacity calculations (FAR, coverage)
  - Conceptual site plan generation
  - Construction cost estimation
- **Tools**: `calculate_development_capacity`, `generate_site_plan`, `estimate_construction_cost`
- **Property Types**: Mobile home parks, flex industrial, commercial, multifamily
- **Handoffs**: Legal Agent, Finance Agent

### 6. Operations Agent
- **Model**: GPT-5.1
- **Purpose**: Construction management and project execution
- **Key Capabilities**:
  - CPM scheduling with critical path
  - Budget tracking and variance analysis
  - Contractor evaluation
  - Status reporting
- **Tools**: `create_schedule`, `track_costs`, `evaluate_contractor`, `generate_status_report`
- **Handoffs**: Finance Agent, Legal Agent, Risk Agent

### 7. Marketing Agent
- **Model**: GPT-5.1
- **Purpose**: Property marketing, leasing, and disposition
- **Key Capabilities**:
  - Marketing plan development
  - Platform-specific listings (CoStar, LoopNet, Crexi)
  - Prospect pipeline analysis
  - Offering memorandum creation
- **Tools**: `create_marketing_plan`, `generate_listing`, `analyze_prospects`, `create_offering_memo`
- **Handoffs**: Research Agent, Finance Agent, Legal Agent

### 8. Risk Agent
- **Model**: GPT-5.1
- **Purpose**: Risk assessment and mitigation
- **Key Capabilities**:
  - FEMA flood zone analysis
  - Market risk assessment
  - Environmental evaluation
  - Insurance cost estimation
  - Comprehensive risk assessment
- **Tools**: `analyze_flood_risk`, `assess_market_risk`, `evaluate_environmental`, `estimate_insurance`, `comprehensive_risk_assessment`
- **Integrations**: FEMA Flood Map API
- **Handoffs**: Research Agent, Legal Agent, Finance Agent

---

## Technology Stack

| Category | Technology | Version |
|----------|------------|---------|
| **AI/LLM** | OpenAI Agents SDK | 0.7.0 |
| **Models** | GPT-5.2 (flagship) | Latest |
| **Models** | GPT-5.1 (standard) | Latest |
| **Research** | Perplexity Sonar Pro | API v1 |
| **Research** | OpenAI web_search | Built-in |
| **Database** | Supabase (PostgreSQL) | Latest |
| **Storage** | Backblaze B2 | S3-compatible |
| **Maps** | Google Maps API | v3 |
| **Flood** | FEMA Flood Map API | v1 |
| **Framework** | FastAPI | 0.110+ |
| **Validation** | Pydantic | 2.0+ |
| **HTTP** | httpx | 0.27+ |
| **Language** | Python | 3.11+ |

---

## Project Structure

```
gallagher-cres/
├── agents/                     # Agent implementations
│   ├── __init__.py            # Agent initialization and handoffs
│   ├── coordinator.py         # Coordinator Agent
│   ├── research.py            # Research Agent
│   ├── finance.py             # Finance Agent
│   ├── legal.py               # Legal Agent
│   ├── design.py              # Design Agent
│   ├── operations.py          # Operations Agent
│   ├── marketing.py           # Marketing Agent
│   └── risk.py                # Risk Agent
├── config/                     # Configuration
│   └── settings.py            # Environment settings
├── database/                   # Database schema
│   └── schema.sql             # Supabase PostgreSQL schema
├── models/                     # Pydantic models
│   └── schemas.py             # Data models and schemas
├── prompts/                    # Agent prompts
│   └── agent_prompts.py       # System prompts for all agents
├── tools/                      # Shared tools
│   ├── database.py            # Supabase database operations
│   ├── external_apis.py       # Perplexity, Google Maps, FEMA
│   ├── storage.py             # Backblaze B2 storage
│   └── financial_calcs.py     # Financial calculation utilities
├── workflows/                  # Workflow orchestration
│   └── runner.py              # Main workflow runner
├── tests/                      # Test suite
│   └── test_agents.py         # Agent tests
├── main.py                     # FastAPI application
├── requirements.txt            # Python dependencies
├── pyproject.toml             # Modern Python project config
├── Dockerfile                 # Container image
├── docker-compose.yml         # Docker Compose config
├── Makefile                   # Development tasks
├── README.md                  # User documentation
└── PROJECT_SUMMARY.md         # This document
```

---

## Database Schema

### Core Tables

#### projects
- `id` (UUID, PK)
- `name`, `address`, `parcel_id`
- `property_type`, `status`
- `acres`, `square_feet`
- `asking_price`, `target_irr`
- `created_at`, `updated_at`

#### agent_outputs
- `id` (UUID, PK)
- `project_id` (FK)
- `agent_name`, `task_type`
- `input_data`, `output_data` (JSONB)
- `confidence`, `sources`
- `created_at`

#### tasks
- `id` (UUID, PK)
- `project_id` (FK)
- `title`, `description`
- `assigned_agent`, `status`
- `due_date`, `created_at`

#### documents
- `id` (UUID, PK)
- `project_id` (FK)
- `document_type`, `file_path`
- `storage_url`, `metadata`

#### financial_models
- `id` (UUID, PK)
- `project_id` (FK)
- `model_name`, `model_type`
- `assumptions`, `results` (JSONB)
- `cash_flows`, `base_case`, `upside_case`, `downside_case`

#### permits
- `id` (UUID, PK)
- `project_id` (FK)
- `permit_type`, `permit_number`
- `status`, `dates`

---

## API Endpoints

### Projects
- `POST /projects` - Create project
- `GET /projects` - List projects
- `GET /projects/{id}` - Get project
- `PATCH /projects/{id}` - Update project

### Tasks
- `POST /projects/{id}/tasks` - Create task
- `GET /projects/{id}/tasks` - List tasks

### Workflows
- `POST /workflows/coordinator` - Run coordinated workflow
- `POST /workflows/evaluate/{id}` - Full project evaluation
- `POST /workflows/parallel/{id}` - Parallel analysis

### Agents
- `POST /agents/{name}` - Run single agent
- Available agents: research, finance, legal, design, operations, marketing, risk

### Tools
- `POST /tools/quick-research` - Quick property research
- `POST /tools/quick-underwrite` - Quick underwriting

### Health
- `GET /health` - Health check

---

## Key Features

### 1. Multi-Agent Orchestration
- Coordinator routes tasks to appropriate agents
- Supports sequential, parallel, and iterative workflows
- Automatic handoff between agents based on context

### 2. Real-Time Research
- Perplexity Sonar Pro integration for current market data
- Google Maps/Places for location analysis
- FEMA flood zone lookups

### 3. Financial Modeling
- Complete pro forma with 5-year projections
- IRR, Equity Multiple, Cash-on-Cash calculations
- Waterfall distribution modeling
- Sensitivity analysis on key variables

### 4. Louisiana Specialization
- East Baton Rouge Parish UDC expertise
- Louisiana civil law considerations
- Local market focus (Baton Rouge MSA)

### 5. Document Management
- Backblaze B2 for file storage
- Contract drafting and review
- Offering memorandum generation

### 6. Risk Assessment
- FEMA flood zone analysis
- Environmental risk evaluation
- Insurance cost estimation
- Comprehensive risk scoring

---

## Investment Criteria

GPC Target Metrics (built into Finance Agent):
- **Target IRR**: 15-25% (levered)
- **Target Equity Multiple**: 1.8-2.5x
- **Hold Period**: 3-7 years
- **Max LTV**: 75% (stabilized), 65% (construction)
- **Min DSCR**: 1.25x

---

## Usage Examples

### Create Project and Evaluate
```python
from workflows.runner import workflow_runner

# Create project
project = await db.create_project({
    "name": "Airline Highway MHP",
    "address": "12345 Airline Highway, Baton Rouge, LA",
    "property_type": "mobile_home_park",
    "acres": 10.5,
    "asking_price": 1200000
})

# Run full evaluation
result = await workflow_runner.run_full_evaluation(project['id'])
```

### Quick Underwriting
```python
result = await quick_underwrite(
    address="12345 Airline Highway, Baton Rouge, LA",
    property_type="mobile_home_park",
    units=80,
    lot_rent=450,
    asking_price=1200000
)
```

### Coordinated Workflow
```python
result = await run_development_workflow(
    """Research the parcel at 12345 Airline Highway, 
    check zoning and flood zone, and run financials 
    for 80 pads at $450/month.""",
    project_id="<project-id>"
)
```

---

## Deployment

### Local Development
```bash
# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with API keys

# Run database migrations
# (Run schema.sql in Supabase SQL Editor)

# Start development server
make dev
# or
uvicorn main:app --reload
```

### Docker
```bash
# Build image
make docker-build

# Run container
make docker-run

# Or use docker-compose
make docker-up
```

### Production
```bash
# Set production environment
export APP_ENV=production

# Run with gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker
```

---

## Testing

```bash
# Run unit tests
make test

# Run all tests including integration
make test-all

# Run with coverage
make test-coverage
```

---

## Environment Variables

### Required
- `OPENAI_API_KEY` - OpenAI API key
- `PERPLEXITY_API_KEY` - Perplexity API key
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key

### Optional
- `GOOGLE_MAPS_API_KEY` - Google Maps API
- `B2_APPLICATION_KEY_ID` - Backblaze B2 key ID
- `B2_APPLICATION_KEY` - Backblaze B2 application key
- `AGENT_MAX_TURNS` - Max agent turns (default: 50)
- `AGENT_ENABLE_TRACING` - Enable tracing (default: true)

---

## Model Configuration

### Flagship Model (Complex Reasoning)
- Use: Coordinator, Finance Agent
- Model: GPT-5.2
- Reasoning: High for complex financial modeling

### Standard Model (General Tasks)
- Use: Research, Legal, Design, Operations, Marketing, Risk
- Model: GPT-5.1
- Reasoning: Medium for most tasks

---

## Future Enhancements

### Phase 5 Roadmap
- [ ] Real-time market data feeds (CoStar, REIS)
- [ ] Advanced visualization (charts, maps)
- [ ] Mobile application
- [ ] AI-powered document parsing
- [ ] Predictive analytics (rent forecasts)
- [ ] Integration with accounting systems
- [ ] Automated reporting
- [ ] Machine learning for comp selection

---

## Support

For technical support:
- Email: tech@gallagherproperty.com
- Documentation: See README.md
- API Docs: `/docs` when server is running

---

## License

Proprietary - Gallagher Property Company

---

**Built with ❤️ by Gallagher Property Company**
