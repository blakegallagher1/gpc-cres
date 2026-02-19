# Gallagher Property Company - AI Agent System

Last reviewed: 2026-02-19


A production-grade multi-agent system for commercial real estate development workflows, built with the OpenAI Agents SDK.

## Overview

This system comprises **8 specialized agents** plus a **Coordinator** that orchestrates the complete development lifecycle from land acquisition through disposition:

```
┌─────────────────────────────────────────────────────────────────┐
│                    COORDINATOR AGENT                            │
│         (Orchestration, Routing, State Management)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ RESEARCH │ │ FINANCE  │ │  LEGAL   │ │  DESIGN  │           │
│  │  AGENT   │ │  AGENT   │ │  AGENT   │ │  AGENT   │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│  │OPERATIONS│ │MARKETING │ │   RISK   │                        │
│  │  AGENT   │ │  AGENT   │ │  AGENT   │                        │
│  └──────────┘ └──────────┘ └──────────┘                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Category | Technology |
|----------|------------|
| **AI/LLM** | OpenAI Agents SDK v0.7.0, GPT-5.2 (flagship), GPT-5.1 |
| **Research** | Perplexity Sonar Pro API, OpenAI web_search |
| **Database** | Supabase (PostgreSQL + Auth + Realtime) |
| **File Storage** | Backblaze B2 |
| **External APIs** | Google Maps, Places, FEMA Flood Maps |
| **Framework** | FastAPI, Pydantic, asyncio |
| **Language** | Python 3.11+ |

## Quick Start

### 1. Installation

```bash
# Clone the repository
git clone <repository-url>
cd gallagher-cres

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Environment Configuration

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your API keys
nano .env
```

Required environment variables:

```bash
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_FLAGSHIP_MODEL=gpt-5.2
OPENAI_STANDARD_MODEL=gpt-5.1

# Perplexity
PERPLEXITY_API_KEY=pplx-...

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Google APIs
GOOGLE_MAPS_API_KEY=AIza...

# Backblaze B2
B2_APPLICATION_KEY_ID=...
B2_APPLICATION_KEY=...
```

### 3. Database Setup

```bash
# Run the schema SQL in Supabase SQL Editor
# File: database/schema.sql
```

### 4. Run the API

```bash
# Development mode
python main.py

# Or with uvicorn directly
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

## API Documentation

Once running, view interactive API docs at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Agent Capabilities

### Coordinator Agent
- **Purpose**: Central orchestration layer
- **Model**: GPT-5.2
- **Capabilities**:
  - Task decomposition and routing
  - Workflow orchestration (sequential, parallel, iterative)
  - State management
  - Output synthesis
  - Conflict resolution

### Research Agent
- **Purpose**: Market research and feasibility analysis
- **Model**: GPT-5.1
- **Tools**:
  - `search_parcels`: Find available parcels
  - `get_market_data`: Retrieve submarket metrics
  - `analyze_comparables`: Find comparable sales/leases
  - `research_parcel`: Comprehensive parcel research
  - `get_location_analysis`: Location accessibility analysis
- **Integrations**: Perplexity Sonar Pro, Google Maps/Places

### Finance Agent
- **Purpose**: Underwriting and financial modeling
- **Model**: GPT-5.2
- **Tools**:
  - `build_proforma`: Development pro forma with returns
  - `model_waterfall`: GP/LP waterfall distributions
  - `size_debt`: Debt sizing based on DSCR/LTV
  - `run_sensitivity`: Sensitivity analysis
- **Calculations**: IRR, Equity Multiple, Cash-on-Cash, DSCR

### Legal Agent
- **Purpose**: Contracts, zoning, and permits
- **Model**: GPT-5.1
- **Tools**:
  - `analyze_zoning`: Zoning compliance analysis
  - `draft_document`: Draft PSA, leases, contracts
  - `review_contract`: Contract review with issues
  - `track_permits`: Permit status tracking
- **Specialty**: Louisiana civil law, EBR Parish UDC

### Design Agent
- **Purpose**: Site planning and development capacity
- **Model**: GPT-5.1
- **Tools**:
  - `calculate_development_capacity`: Max yield analysis
  - `generate_site_plan`: Conceptual site plan
  - `estimate_construction_cost`: Cost estimation
- **Coverage**: MHP, flex industrial, commercial, multifamily

### Operations Agent
- **Purpose**: Construction management
- **Model**: GPT-5.1
- **Tools**:
  - `create_schedule`: CPM scheduling
  - `track_costs`: Budget tracking and variances
  - `evaluate_contractor`: Contractor qualification
  - `generate_status_report`: Project status reports

### Marketing Agent
- **Purpose**: Property marketing and disposition
- **Model**: GPT-5.1
- **Tools**:
  - `create_marketing_plan`: Marketing strategy
  - `generate_listing`: Platform-specific listings
  - `analyze_prospects`: Pipeline analysis
  - `create_offering_memo`: Investment OM

### Risk Agent
- **Purpose**: Risk assessment and mitigation
- **Model**: GPT-5.1
- **Tools**:
  - `analyze_flood_risk`: FEMA flood zone analysis
  - `assess_market_risk`: Market cycle positioning
  - `evaluate_environmental`: Environmental history
  - `estimate_insurance`: Insurance cost estimation
  - `comprehensive_risk_assessment`: All-category risk review

## Usage Examples

### Create a Project

```bash
curl -X POST "http://localhost:8000/projects" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Airline Highway MHP",
    "address": "12345 Airline Highway, Baton Rouge, LA 70816",
    "property_type": "mobile_home_park",
    "acres": 10.5,
    "asking_price": 1200000
  }'
```

### Run Coordinated Workflow

```bash
curl -X POST "http://localhost:8000/workflows/coordinator" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "I found a 10-acre parcel on Airline Highway in Baton Rouge for $1.2M. Can you research it, check zoning and flood zone, and run preliminary financials for 80 pads at $450/month?",
    "project_id": "<project-id>"
  }'
```

### Run Full Evaluation

```bash
curl -X POST "http://localhost:8000/workflows/evaluate/<project-id>"
```

### Quick Underwriting

```bash
curl -X POST "http://localhost:8000/tools/quick-underwrite" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "12345 Airline Highway, Baton Rouge, LA",
    "property_type": "mobile_home_park",
    "units": 80,
    "monthly_rent": 450,
    "asking_price": 1200000
  }'
```

### Run Single Agent

```bash
curl -X POST "http://localhost:8000/agents/research" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Research the mobile home park market in East Baton Rouge Parish",
    "project_id": "<project-id>"
  }'
```

## Python SDK Usage

```python
import asyncio
from workflows.runner import (
    run_development_workflow,
    evaluate_project,
    quick_research,
    quick_underwrite
)

# Run a coordinated workflow
async def example():
    result = await run_development_workflow(
        """I found a 10-acre parcel on Airline Highway in Baton Rouge 
        that might work for a mobile home park. The asking price is $1.2M. 
        Can you research it and give me a go/no-go recommendation?"""
    )
    print(result)

# Run full evaluation
async def evaluate():
    result = await evaluate_project("<project-id>")
    print(result)

asyncio.run(example())
```

## Workflow Patterns

### Sequential Pattern
```
Coordinator → Research → Risk → Finance → Synthesis
```

### Parallel Pattern
```
Coordinator → [Research + Risk + Finance + Legal + Design] → Synthesis
```

### Iterative Pattern
```
Coordinator → Initial Analysis → Identify Gaps → Deep Dive → Final Recommendation
```

## Database Schema

### Core Tables
- `projects`: Project information and status
- `agent_outputs`: Agent analysis outputs
- `tasks`: Project tasks and assignments
- `documents`: File storage references
- `financial_models`: Pro formas and waterfalls
- `permits`: Permit tracking

See `database/schema.sql` for full schema.

## Investment Criteria

GPC Target Metrics:
- **Target IRR**: 15-25% (levered)
- **Target Equity Multiple**: 1.8-2.5x
- **Hold Period**: 3-7 years
- **Max LTV**: 75% (stabilized), 65% (construction)
- **Min DSCR**: 1.25x

## Geographic Focus

- **Primary**: East Baton Rouge Parish, Louisiana
- **Secondary**: Greater Baton Rouge MSA
- **Property Types**: Mobile home parks, flex industrial, small commercial, multifamily

## Configuration

### Model Selection
Edit `config/settings.py` or environment variables:

```bash
# Flagship model for complex reasoning (Coordinator, Finance)
OPENAI_FLAGSHIP_MODEL=gpt-5.2

# Standard model for general tasks
OPENAI_STANDARD_MODEL=gpt-5.1

# Cost-effective model for simple tasks
OPENAI_MINI_MODEL=gpt-5.2-mini
```

### Agent Behavior
```bash
# Maximum turns per workflow
AGENT_MAX_TURNS=50

# Request timeout
AGENT_TIMEOUT_SECONDS=300

# Enable tracing for debugging
AGENT_ENABLE_TRACING=true
```

## Development

### Running Tests
```bash
pytest tests/
```

### Code Formatting
```bash
black .
isort .
```

### Type Checking
```bash
mypy .
```

## Deployment

### Docker
```bash
# Build image
docker build -t gallagher-cres .

# Run container
docker run -p 8000:8000 --env-file .env gallagher-cres
```

### Production Checklist
- [ ] Set `APP_ENV=production`
- [ ] Configure proper CORS origins
- [ ] Enable authentication/authorization
- [ ] Set up monitoring and alerting
- [ ] Configure rate limiting
- [ ] Enable request logging
- [ ] Set up backup schedules

## Troubleshooting

### Common Issues

**OpenAI API errors**
- Verify `OPENAI_API_KEY` is set correctly
- Check API rate limits

**Supabase connection errors**
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
- Check network connectivity

**Perplexity API errors**
- Verify `PERPLEXITY_API_KEY`
- Check API credits

### Debug Mode
```bash
APP_DEBUG=true
APP_LOG_LEVEL=DEBUG
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

Proprietary - Gallagher Property Company

## Support

For support, contact:
- Email: tech@gallagherproperty.com
- Slack: #gpc-ai-agent-support

## Roadmap

### Phase 1: Foundation ✓
- [x] Core agent framework
- [x] Database schema
- [x] Basic API

### Phase 2: Core Agents ✓
- [x] Research Agent with Perplexity
- [x] Finance Agent with pro formas
- [x] Risk Agent with flood analysis

### Phase 3: Supporting Agents ✓
- [x] Legal Agent
- [x] Design Agent
- [x] Operations Agent
- [x] Marketing Agent

### Phase 4: Integration ✓
- [x] Full workflow testing
- [x] API endpoints
- [x] Documentation

### Phase 5: Enhancement (Future)
- [ ] Real-time market data feeds
- [ ] Advanced visualization
- [ ] Mobile app
- [ ] AI-powered document parsing
- [ ] Predictive analytics

---

Built with ❤️ by Gallagher Property Company
