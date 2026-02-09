# Gallagher Property Company - AI Agent System
## One-Page Application Summary

Last updated: 2026-02-04

## What This Application Does
Gallagher Property Company (GPC) built a multi-agent AI platform that supports the full
commercial real estate (CRE) development lifecycle. It centralizes project intake, screening,
underwriting, due diligence, entitlements, design, construction operations, marketing,
risk management, and tax strategy into a single orchestrated system. The platform exposes
these capabilities through a FastAPI backend and stores project state, tasks, and agent
outputs in Supabase for auditability and collaboration.

## How It Works
- FastAPI service exposes endpoints to create projects, run single-agent analyses, and
  execute coordinated workflows.
- A Coordinator agent routes requests, sequences work across specialist agents, and
  synthesizes results into actionable recommendations.
- Data persistence runs through Supabase (projects, tasks, outputs, deal screening,
  diligence items, entitlements, and market intelligence).
- External intelligence comes from Perplexity (web research with citations), Google
  Maps/Places (location analysis), FEMA flood data, and a local IRC tax reference library.
- Core workflows include quick research, quick underwriting, parallel analysis, and a
  full development workflow runner.

## Agent Roster And Capabilities
| Agent | Focus | Key Capabilities |
| --- | --- | --- |
| Coordinator | Orchestration | Routes tasks, manages project state and tasks, synthesizes multi-agent outputs. |
| Deal Screener | Intake screening | Ingests listings, scores against weighted criteria, tiers deals, saves screening summaries. |
| Research | Market + parcel research | Parcel search, market data retrieval, comparable analysis, location/parcel research with citations. |
| Finance | Underwriting | Builds pro formas, sizes debt, models GP/LP waterfalls, runs sensitivity analysis. |
| Legal | Zoning + contracts | Zoning analysis, contract drafting/review, permit tracking support. |
| Design | Site planning | Development capacity analysis, conceptual site plans, construction cost estimates. |
| Operations | Execution | CPM scheduling, budget tracking, contractor evaluation, status reporting. |
| Marketing | Leasing + disposition | Marketing plans, listing generation, prospect analysis, offering memorandum creation. |
| Risk | Risk management | Flood, market, environmental, and insurance risk analysis, comprehensive risk assessment. |
| Due Diligence | DD management | Creates DD deals, ingests documents, generates checklists, flags red flags, saves summaries. |
| Entitlements | Zoning + permits | Entitlements analysis, permit record creation, agenda/policy change ingestion. |
| Market Intelligence | Market signals | Ingests competitor transactions, economic indicators, infrastructure projects, absorption data; generates market snapshots. |
| Tax Strategist | Tax planning | IRC reference lookups from the internal library and recent tax update research with citations. |

## Technology Snapshot
- OpenAI Agents SDK with configurable flagship and standard models (defaults: `gpt-5.2`, `gpt-5.1`).
- FastAPI + Pydantic backend, asyncio orchestration, and Supabase for data storage.
- External data sources: Perplexity Sonar Pro, Google Maps/Places, FEMA flood maps.

