#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

NAMESPACE_UUID = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")


MHP_LAND_SCOUT_PROMPT = """
You are the MHP Land Scout Agent for Gallagher Property Company, specializing in mobile home park
land evaluation and site concept planning.

## CORE CAPABILITIES
1. Parcel Suitability: Evaluate zoning, access, utilities, topography, and constraints.
2. Density & Yield: Calculate optimal pad count and lot configuration for target class.
3. Site Planning: Lay out streets, common areas, setbacks, and amenity placement.
4. Infrastructure: Estimate utility requirements, stormwater needs, and road specs.
5. Cost & Feasibility: Estimate development costs and produce a go/no-go recommendation.

## OUTPUT FORMAT
### MHP Site Concept Summary
**Parcel:** [Location / Parcel ID]
**Gross Acres:** X.X
**Net Acres:** X.X
**Target Class:** [Good/Better/Best]

**Density & Yield:**
- Proposed Pads: X
- Pad Size: X SF
- Streets: [Width + layout notes]
- Common Area: X SF

**Utilities & Infrastructure:**
- Water/Sewer: [Assumptions]
- Electric/Gas: [Assumptions]
- Stormwater: [Requirements]

**Cost Summary (Order of Magnitude):**
- Site Work: $X
- Utilities: $X
- Roads: $X
- Amenities: $X
- Total: $X

**Risks & Mitigations:**
1. [Risk]: [Mitigation]

**Recommendation:** [Proceed/Conditional/Pass]
"""


def stable_uuid(name: str) -> str:
    return str(uuid.uuid5(NAMESPACE_UUID, name))


def build_seed_data() -> Dict[str, List[Dict[str, Any]]]:
    from prompts.agent_prompts import (
        COORDINATOR_PROMPT,
        DESIGN_PROMPT,
        FINANCE_PROMPT,
        LEGAL_PROMPT,
        MARKETING_PROMPT,
        OPERATIONS_PROMPT,
        RESEARCH_PROMPT,
        RISK_PROMPT,
    )

    agent_ids = {
        "coordinator": stable_uuid("agent:coordinator"),
        "research": stable_uuid("agent:research"),
        "finance": stable_uuid("agent:finance"),
        "legal": stable_uuid("agent:legal"),
        "design": stable_uuid("agent:design"),
        "operations": stable_uuid("agent:operations"),
        "marketing": stable_uuid("agent:marketing"),
        "risk": stable_uuid("agent:risk"),
        "mhp_land_scout": stable_uuid("agent:mhp_land_scout"),
    }

    workflow_ids = {
        "wf_property_analysis": stable_uuid("workflow:wf_property_analysis"),
        "wf_development_review": stable_uuid("workflow:wf_development_review"),
    }

    run_ids = {
        "run_001": stable_uuid("run:run_001"),
        "run_002": stable_uuid("run:run_002"),
        "run_003": stable_uuid("run:run_003"),
    }

    agents = [
        {
            "id": agent_ids["coordinator"],
            "name": "Coordinator",
            "description": (
                "Central orchestrator that manages workflow delegation, routes tasks to specialized "
                "agents, and synthesizes multi-agent outputs into cohesive recommendations."
            ),
            "model": "gpt-5.2",
            "system_prompt": COORDINATOR_PROMPT.strip(),
            "tools": [
                {
                    "name": "delegate_task",
                    "description": "Delegate a task to a specialized agent",
                    "parameters": {},
                },
                {
                    "name": "synthesize_outputs",
                    "description": "Combine multiple agent outputs",
                    "parameters": {},
                },
                {
                    "name": "create_workflow",
                    "description": "Create a multi-step workflow",
                    "parameters": {},
                },
                {
                    "name": "track_progress",
                    "description": "Track workflow execution progress",
                    "parameters": {},
                },
            ],
            "handoffs": [
                agent_ids["research"],
                agent_ids["finance"],
                agent_ids["legal"],
                agent_ids["design"],
                agent_ids["operations"],
                agent_ids["marketing"],
                agent_ids["risk"],
            ],
            "config": {"slug": "coordinator"},
            "status": "active",
            "run_count": 0,
            "color": "#1F2937",
        },
        {
            "id": agent_ids["research"],
            "name": "Market Research",
            "description": (
                "Analyzes market conditions, comparable properties, demographic trends, and economic "
                "indicators to inform acquisition and development decisions."
            ),
            "model": "gpt-5.2",
            "system_prompt": RESEARCH_PROMPT.strip(),
            "tools": [
                {
                    "name": "market_research",
                    "description": "Research market conditions",
                    "parameters": {},
                },
                {
                    "name": "analyze_comps",
                    "description": "Analyze comparable properties",
                    "parameters": {},
                },
                {
                    "name": "demographic_analysis",
                    "description": "Analyze demographic trends",
                    "parameters": {},
                },
                {
                    "name": "fema_flood_lookup",
                    "description": "Check FEMA flood zone",
                    "parameters": {},
                },
                {
                    "name": "location_analysis",
                    "description": "Analyze location characteristics",
                    "parameters": {},
                },
                {"name": "rent_forecast", "description": "Forecast rent growth", "parameters": {}},
            ],
            "handoffs": [agent_ids["finance"], agent_ids["coordinator"]],
            "config": {"slug": "research"},
            "status": "active",
            "run_count": 0,
            "color": "#3B82F6",
        },
        {
            "id": agent_ids["finance"],
            "name": "Financial Analyst",
            "description": (
                "Builds detailed financial models including pro formas, IRR calculations, DSCR "
                "analysis, sensitivity tables, and investment waterfalls."
            ),
            "model": "gpt-5.2",
            "system_prompt": FINANCE_PROMPT.strip(),
            "tools": [
                {
                    "name": "build_pro_forma",
                    "description": "Build 10-year pro forma",
                    "parameters": {},
                },
                {"name": "calculate_irr", "description": "Calculate IRR", "parameters": {}},
                {"name": "calculate_dscr", "description": "Calculate DSCR", "parameters": {}},
                {
                    "name": "sensitivity_analysis",
                    "description": "Run sensitivity analysis",
                    "parameters": {},
                },
                {
                    "name": "waterfall_model",
                    "description": "Model investment waterfall",
                    "parameters": {},
                },
                {"name": "cap_rate_analysis", "description": "Analyze cap rates", "parameters": {}},
                {
                    "name": "loan_scenarios",
                    "description": "Compare loan scenarios",
                    "parameters": {},
                },
                {"name": "exit_analysis", "description": "Model exit scenarios", "parameters": {}},
            ],
            "handoffs": [agent_ids["coordinator"], agent_ids["risk"]],
            "config": {"slug": "finance"},
            "status": "active",
            "run_count": 0,
            "color": "#10B981",
        },
        {
            "id": agent_ids["legal"],
            "name": "Legal Review",
            "description": (
                "Reviews zoning compliance, regulatory requirements, contract terms, and identifies "
                "legal risks in development projects."
            ),
            "model": "gpt-5.2",
            "system_prompt": LEGAL_PROMPT.strip(),
            "tools": [
                {
                    "name": "zoning_analysis",
                    "description": "Analyze zoning compliance",
                    "parameters": {},
                },
                {
                    "name": "contract_review",
                    "description": "Review contract terms",
                    "parameters": {},
                },
                {
                    "name": "permit_checklist",
                    "description": "Generate permit checklist",
                    "parameters": {},
                },
                {
                    "name": "environmental_check",
                    "description": "Check environmental requirements",
                    "parameters": {},
                },
                {
                    "name": "regulatory_timeline",
                    "description": "Estimate regulatory timeline",
                    "parameters": {},
                },
            ],
            "handoffs": [agent_ids["coordinator"], agent_ids["risk"]],
            "config": {"slug": "legal"},
            "status": "idle",
            "run_count": 0,
            "color": "#8B5CF6",
        },
        {
            "id": agent_ids["design"],
            "name": "Design Advisor",
            "description": (
                "Provides space planning recommendations, sustainability analysis, building code "
                "compliance, and coordinates with architects."
            ),
            "model": "gpt-5.2",
            "system_prompt": DESIGN_PROMPT.strip(),
            "tools": [
                {
                    "name": "space_planning",
                    "description": "Optimize space layout",
                    "parameters": {},
                },
                {
                    "name": "sustainability_analysis",
                    "description": "Analyze sustainability options",
                    "parameters": {},
                },
                {
                    "name": "code_compliance",
                    "description": "Check building code compliance",
                    "parameters": {},
                },
                {"name": "site_layout", "description": "Optimize site layout", "parameters": {}},
                {
                    "name": "material_recommendations",
                    "description": "Recommend materials",
                    "parameters": {},
                },
            ],
            "handoffs": [agent_ids["coordinator"], agent_ids["operations"]],
            "config": {"slug": "design"},
            "status": "active",
            "run_count": 0,
            "color": "#F59E0B",
        },
        {
            "id": agent_ids["operations"],
            "name": "Operations",
            "description": (
                "Manages project scheduling, resource allocation, contractor coordination, and "
                "construction timeline optimization."
            ),
            "model": "gpt-5.2",
            "system_prompt": OPERATIONS_PROMPT.strip(),
            "tools": [
                {
                    "name": "create_schedule",
                    "description": "Create project schedule",
                    "parameters": {},
                },
                {
                    "name": "resource_allocation",
                    "description": "Allocate resources",
                    "parameters": {},
                },
                {
                    "name": "timeline_optimization",
                    "description": "Optimize timeline",
                    "parameters": {},
                },
                {
                    "name": "budget_tracking",
                    "description": "Track budget vs actual",
                    "parameters": {},
                },
                {
                    "name": "contractor_coordination",
                    "description": "Coordinate contractors",
                    "parameters": {},
                },
            ],
            "handoffs": [agent_ids["coordinator"], agent_ids["finance"]],
            "config": {"slug": "operations"},
            "status": "idle",
            "run_count": 0,
            "color": "#EF4444",
        },
        {
            "id": agent_ids["marketing"],
            "name": "Marketing",
            "description": (
                "Develops positioning strategies, marketing materials, digital campaigns, and tenant "
                "acquisition plans."
            ),
            "model": "gpt-5.2",
            "system_prompt": MARKETING_PROMPT.strip(),
            "tools": [
                {
                    "name": "positioning_strategy",
                    "description": "Develop positioning strategy",
                    "parameters": {},
                },
                {
                    "name": "marketing_materials",
                    "description": "Create marketing materials",
                    "parameters": {},
                },
                {
                    "name": "digital_campaign",
                    "description": "Plan digital campaign",
                    "parameters": {},
                },
                {
                    "name": "tenant_acquisition",
                    "description": "Plan tenant acquisition",
                    "parameters": {},
                },
                {"name": "lease_up_plan", "description": "Create lease-up plan", "parameters": {}},
                {
                    "name": "competitive_analysis",
                    "description": "Analyze competition",
                    "parameters": {},
                },
            ],
            "handoffs": [agent_ids["coordinator"], agent_ids["research"]],
            "config": {"slug": "marketing"},
            "status": "active",
            "run_count": 0,
            "color": "#EC4899",
        },
        {
            "id": agent_ids["risk"],
            "name": "Risk Manager",
            "description": (
                "Identifies project risks, assesses mitigation strategies, reviews insurance "
                "requirements, and monitors risk exposure."
            ),
            "model": "gpt-5.2",
            "system_prompt": RISK_PROMPT.strip(),
            "tools": [
                {
                    "name": "risk_assessment",
                    "description": "Assess project risks",
                    "parameters": {},
                },
                {
                    "name": "mitigation_strategies",
                    "description": "Develop mitigation strategies",
                    "parameters": {},
                },
                {
                    "name": "insurance_review",
                    "description": "Review insurance needs",
                    "parameters": {},
                },
                {"name": "market_risk", "description": "Analyze market risks", "parameters": {}},
                {
                    "name": "construction_risk",
                    "description": "Assess construction risks",
                    "parameters": {},
                },
            ],
            "handoffs": [agent_ids["coordinator"], agent_ids["finance"]],
            "config": {"slug": "risk"},
            "status": "idle",
            "run_count": 0,
            "color": "#6B7280",
        },
        {
            "id": agent_ids["mhp_land_scout"],
            "name": "MHP Land Scout",
            "description": (
                "Expert in Mobile Home Park land evaluation. Analyzes parcel suitability, calculates "
                "optimal density, estimates development costs, and generates complete site concept "
                "plans with full regulatory compliance."
            ),
            "model": "gpt-5.2",
            "system_prompt": MHP_LAND_SCOUT_PROMPT.strip(),
            "tools": [
                {
                    "name": "calculate_density",
                    "description": "Calculate optimal density",
                    "parameters": {},
                },
                {
                    "name": "analyze_lot_configuration",
                    "description": "Analyze lot config",
                    "parameters": {},
                },
                {
                    "name": "calculate_street_requirements",
                    "description": "Determine street widths",
                    "parameters": {},
                },
                {
                    "name": "estimate_utility_requirements",
                    "description": "Estimate utility needs",
                    "parameters": {},
                },
                {
                    "name": "calculate_common_space",
                    "description": "Calculate common space",
                    "parameters": {},
                },
                {
                    "name": "analyze_stormwater",
                    "description": "Analyze stormwater",
                    "parameters": {},
                },
                {
                    "name": "estimate_development_cost",
                    "description": "Estimate development costs",
                    "parameters": {},
                },
                {
                    "name": "generate_site_concept",
                    "description": "Generate site concept",
                    "parameters": {},
                },
                {
                    "name": "get_regulatory_requirements",
                    "description": "Get regulatory requirements",
                    "parameters": {},
                },
            ],
            "handoffs": [
                agent_ids["research"],
                agent_ids["finance"],
                agent_ids["legal"],
                agent_ids["risk"],
                agent_ids["design"],
            ],
            "config": {"slug": "mhp_land_scout"},
            "status": "active",
            "run_count": 0,
            "color": "#14B8A6",
        },
    ]

    workflows = [
        {
            "id": workflow_ids["wf_property_analysis"],
            "name": "Property Analysis Pipeline",
            "description": "Complete property analysis with market research, financial modeling, and legal review",
            "nodes": [
                {
                    "id": "start",
                    "type": "start",
                    "position": {"x": 400, "y": 50},
                    "data": {"label": "Start"},
                },
                {
                    "id": "research",
                    "type": "agent",
                    "position": {"x": 250, "y": 150},
                    "data": {"agentId": agent_ids["research"], "label": "Market Research"},
                },
                {
                    "id": "finance",
                    "type": "agent",
                    "position": {"x": 400, "y": 250},
                    "data": {"agentId": agent_ids["finance"], "label": "Financial Analysis"},
                },
                {
                    "id": "legal",
                    "type": "agent",
                    "position": {"x": 550, "y": 250},
                    "data": {"agentId": agent_ids["legal"], "label": "Legal Review"},
                },
                {
                    "id": "end",
                    "type": "end",
                    "position": {"x": 400, "y": 400},
                    "data": {"label": "End"},
                },
            ],
            "edges": [
                {"id": "e1", "source": "start", "target": "research"},
                {"id": "e2", "source": "research", "target": "finance"},
                {"id": "e3", "source": "research", "target": "legal"},
                {"id": "e4", "source": "finance", "target": "end"},
                {"id": "e5", "source": "legal", "target": "end"},
            ],
            "config": {"slug": "wf_property_analysis"},
            "run_count": 45,
        },
        {
            "id": workflow_ids["wf_development_review"],
            "name": "Development Review",
            "description": "Comprehensive development review with design, operations, and risk assessment",
            "nodes": [
                {
                    "id": "start",
                    "type": "start",
                    "position": {"x": 400, "y": 50},
                    "data": {"label": "Start"},
                },
                {
                    "id": "design",
                    "type": "agent",
                    "position": {"x": 250, "y": 150},
                    "data": {"agentId": agent_ids["design"], "label": "Design Advisor"},
                },
                {
                    "id": "ops",
                    "type": "agent",
                    "position": {"x": 550, "y": 150},
                    "data": {"agentId": agent_ids["operations"], "label": "Operations"},
                },
                {
                    "id": "risk",
                    "type": "agent",
                    "position": {"x": 400, "y": 250},
                    "data": {"agentId": agent_ids["risk"], "label": "Risk Manager"},
                },
                {
                    "id": "end",
                    "type": "end",
                    "position": {"x": 400, "y": 400},
                    "data": {"label": "End"},
                },
            ],
            "edges": [
                {"id": "e1", "source": "start", "target": "design"},
                {"id": "e2", "source": "start", "target": "ops"},
                {"id": "e3", "source": "design", "target": "risk"},
                {"id": "e4", "source": "ops", "target": "risk"},
                {"id": "e5", "source": "risk", "target": "end"},
            ],
            "config": {"slug": "wf_development_review"},
            "run_count": 32,
        },
    ]

    runs = [
        {
            "id": run_ids["run_001"],
            "agent_id": agent_ids["coordinator"],
            "workflow_id": workflow_ids["wf_property_analysis"],
            "status": "success",
            "input": {
                "property_address": "123 Main St, Lafayette, LA",
                "property_type": "multifamily",
                "units": 24,
            },
            "output": {
                "recommendation": "Proceed with acquisition",
                "target_price": 2400000,
                "projected_irr": 18.5,
            },
            "tokens_used": 4523,
            "cost": 0.135,
            "cost_usd": 0.135,
            "started_at": "2024-01-28T10:00:00Z",
            "completed_at": "2024-01-28T10:02:34Z",
            "duration_ms": 154000,
        },
        {
            "id": run_ids["run_002"],
            "agent_id": agent_ids["coordinator"],
            "workflow_id": workflow_ids["wf_development_review"],
            "status": "error",
            "input": {"project_name": "Oakwood Commons", "budget": 5000000},
            "output": {
                "error": (
                    "Risk assessment failed - flood zone designation requires additional mitigation"
                ),
                "risk_level": "high",
            },
            "tokens_used": 2890,
            "cost": 0.086,
            "cost_usd": 0.086,
            "started_at": "2024-01-28T09:30:00Z",
            "completed_at": "2024-01-28T09:31:20Z",
            "duration_ms": 80000,
        },
        {
            "id": run_ids["run_003"],
            "agent_id": agent_ids["mhp_land_scout"],
            "workflow_id": None,
            "status": "running",
            "input": {"parcel_acres": 15.5, "location": "Lafayette, LA", "target_class": "good"},
            "output": None,
            "tokens_used": 1200,
            "cost": 0.036,
            "cost_usd": 0.036,
            "started_at": "2024-01-28T11:00:00Z",
            "completed_at": None,
            "duration_ms": None,
        },
    ]

    traces = [
        {
            "id": stable_uuid("trace:run_001:1"),
            "run_id": run_ids["run_001"],
            "parent_id": None,
            "type": "custom",
            "name": "start",
            "agent_id": agent_ids["coordinator"],
            "tool_name": None,
            "input": {
                "property_address": "123 Main St, Lafayette, LA",
                "property_type": "multifamily",
            },
            "output": None,
            "started_at": "2024-01-28T10:00:00Z",
            "completed_at": "2024-01-28T10:00:05Z",
            "duration_ms": 5000,
            "tokens_input": 120,
            "tokens_output": 0,
            "cost": 0,
            "metadata": {"agent_id": agent_ids["coordinator"], "agent_slug": "coordinator"},
        },
        {
            "id": stable_uuid("trace:run_001:2"),
            "run_id": run_ids["run_001"],
            "parent_id": None,
            "type": "tool",
            "name": "market_research",
            "agent_id": agent_ids["research"],
            "tool_name": "market_research",
            "input": {"location": "123 Main St, Lafayette, LA"},
            "output": {
                "summary": "Strong submarket demand; vacancy 4.2%; rent growth 3.1% YoY.",
                "confidence": "medium",
            },
            "started_at": "2024-01-28T10:00:05Z",
            "completed_at": "2024-01-28T10:00:47Z",
            "duration_ms": 42000,
            "tokens_input": 450,
            "tokens_output": 620,
            "cost": 0.018,
            "metadata": {"agent_id": agent_ids["research"], "agent_slug": "research"},
        },
        {
            "id": stable_uuid("trace:run_001:3"),
            "run_id": run_ids["run_001"],
            "parent_id": None,
            "type": "tool",
            "name": "build_pro_forma",
            "agent_id": agent_ids["finance"],
            "tool_name": "build_pro_forma",
            "input": {"units": 24, "market": "Lafayette, LA"},
            "output": {"levered_irr": 18.5, "equity_multiple": 2.0, "dscr_year1": 1.32},
            "started_at": "2024-01-28T10:00:50Z",
            "completed_at": "2024-01-28T10:01:50Z",
            "duration_ms": 60000,
            "tokens_input": 520,
            "tokens_output": 740,
            "cost": 0.022,
            "metadata": {"agent_id": agent_ids["finance"], "agent_slug": "finance"},
        },
        {
            "id": stable_uuid("trace:run_001:4"),
            "run_id": run_ids["run_001"],
            "parent_id": None,
            "type": "tool",
            "name": "zoning_analysis",
            "agent_id": agent_ids["legal"],
            "tool_name": "zoning_analysis",
            "input": {"parcel": "123 Main St, Lafayette, LA"},
            "output": {"zoning": "MF-2", "compliant": True},
            "started_at": "2024-01-28T10:01:55Z",
            "completed_at": "2024-01-28T10:02:15Z",
            "duration_ms": 20000,
            "tokens_input": 260,
            "tokens_output": 310,
            "cost": 0.01,
            "metadata": {"agent_id": agent_ids["legal"], "agent_slug": "legal"},
        },
        {
            "id": stable_uuid("trace:run_001:5"),
            "run_id": run_ids["run_001"],
            "parent_id": None,
            "type": "custom",
            "name": "end",
            "agent_id": agent_ids["coordinator"],
            "tool_name": None,
            "input": None,
            "output": {"recommendation": "Proceed with acquisition", "target_price": 2400000},
            "started_at": "2024-01-28T10:02:20Z",
            "completed_at": "2024-01-28T10:02:34Z",
            "duration_ms": 14000,
            "tokens_input": 90,
            "tokens_output": 210,
            "cost": 0.01,
            "metadata": {"agent_id": agent_ids["coordinator"], "agent_slug": "coordinator"},
        },
        {
            "id": stable_uuid("trace:run_002:1"),
            "run_id": run_ids["run_002"],
            "parent_id": None,
            "type": "custom",
            "name": "start",
            "agent_id": agent_ids["coordinator"],
            "tool_name": None,
            "input": {"project_name": "Oakwood Commons", "budget": 5000000},
            "output": None,
            "started_at": "2024-01-28T09:30:00Z",
            "completed_at": "2024-01-28T09:30:04Z",
            "duration_ms": 4000,
            "tokens_input": 80,
            "tokens_output": 0,
            "cost": 0,
            "metadata": {"agent_id": agent_ids["coordinator"], "agent_slug": "coordinator"},
        },
        {
            "id": stable_uuid("trace:run_002:2"),
            "run_id": run_ids["run_002"],
            "parent_id": None,
            "type": "tool",
            "name": "site_layout",
            "agent_id": agent_ids["design"],
            "tool_name": "site_layout",
            "input": {"project_name": "Oakwood Commons"},
            "output": {
                "notes": "Site layout constrained by drainage easement; reduced buildable area."
            },
            "started_at": "2024-01-28T09:30:04Z",
            "completed_at": "2024-01-28T09:30:34Z",
            "duration_ms": 30000,
            "tokens_input": 300,
            "tokens_output": 420,
            "cost": 0.012,
            "metadata": {"agent_id": agent_ids["design"], "agent_slug": "design"},
        },
        {
            "id": stable_uuid("trace:run_002:3"),
            "run_id": run_ids["run_002"],
            "parent_id": None,
            "type": "tool",
            "name": "risk_assessment",
            "agent_id": agent_ids["risk"],
            "tool_name": "risk_assessment",
            "input": {"project_name": "Oakwood Commons"},
            "output": {"risk_level": "high", "issue": "Flood zone AE - mitigation required"},
            "started_at": "2024-01-28T09:30:34Z",
            "completed_at": "2024-01-28T09:31:09Z",
            "duration_ms": 35000,
            "tokens_input": 320,
            "tokens_output": 500,
            "cost": 0.014,
            "metadata": {"agent_id": agent_ids["risk"], "agent_slug": "risk"},
        },
        {
            "id": stable_uuid("trace:run_002:4"),
            "run_id": run_ids["run_002"],
            "parent_id": None,
            "type": "custom",
            "name": "error",
            "agent_id": agent_ids["coordinator"],
            "tool_name": None,
            "input": None,
            "output": {
                "error": "Risk assessment failed - flood zone designation requires additional mitigation"
            },
            "started_at": "2024-01-28T09:31:09Z",
            "completed_at": "2024-01-28T09:31:20Z",
            "duration_ms": 11000,
            "tokens_input": 60,
            "tokens_output": 90,
            "cost": 0.005,
            "metadata": {"agent_id": agent_ids["coordinator"], "agent_slug": "coordinator"},
        },
        {
            "id": stable_uuid("trace:run_003:1"),
            "run_id": run_ids["run_003"],
            "parent_id": None,
            "type": "custom",
            "name": "start",
            "agent_id": agent_ids["mhp_land_scout"],
            "tool_name": None,
            "input": {"parcel_acres": 15.5, "location": "Lafayette, LA"},
            "output": None,
            "started_at": "2024-01-28T11:00:00Z",
            "completed_at": "2024-01-28T11:00:03Z",
            "duration_ms": 3000,
            "tokens_input": 70,
            "tokens_output": 0,
            "cost": 0,
            "metadata": {"agent_id": agent_ids["mhp_land_scout"], "agent_slug": "mhp_land_scout"},
        },
        {
            "id": stable_uuid("trace:run_003:2"),
            "run_id": run_ids["run_003"],
            "parent_id": None,
            "type": "tool",
            "name": "generate_site_concept",
            "agent_id": agent_ids["mhp_land_scout"],
            "tool_name": "generate_site_concept",
            "input": {"parcel_acres": 15.5, "target_class": "good"},
            "output": None,
            "started_at": "2024-01-28T11:00:03Z",
            "completed_at": None,
            "duration_ms": None,
            "tokens_input": 420,
            "tokens_output": 0,
            "cost": 0.009,
            "metadata": {"agent_id": agent_ids["mhp_land_scout"], "agent_slug": "mhp_land_scout"},
        },
    ]

    return {"agents": agents, "workflows": workflows, "runs": runs, "traces": traces}


def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (dict, list)):
        payload = json.dumps(value, ensure_ascii=True)
        return f"'{sql_escape(payload)}'::jsonb"
    return f"'{sql_escape(str(value))}'"


def build_sql(data: Dict[str, List[Dict[str, Any]]]) -> str:
    sections: List[str] = []

    def insert_section(table: str, columns: List[str], rows: List[Dict[str, Any]]) -> None:
        if not rows:
            return
        values_sql = []
        for row in rows:
            values = [sql_literal(row.get(col)) for col in columns]
            values_sql.append(f"({', '.join(values)})")
        sections.append(f"-- {table} seed")
        sections.append(
            f"INSERT INTO {table} ({', '.join(columns)})\nVALUES\n  "
            + ",\n  ".join(values_sql)
            + "\nON CONFLICT (id) DO NOTHING;\n"
        )

    insert_section(
        "agents",
        [
            "id",
            "name",
            "description",
            "model",
            "system_prompt",
            "tools",
            "handoffs",
            "config",
            "status",
            "run_count",
            "color",
        ],
        data["agents"],
    )

    insert_section(
        "workflows",
        ["id", "name", "description", "nodes", "edges", "config", "run_count"],
        data["workflows"],
    )

    insert_section(
        "runs",
        [
            "id",
            "agent_id",
            "workflow_id",
            "status",
            "input",
            "output",
            "tokens_used",
            "cost",
            "cost_usd",
            "started_at",
            "completed_at",
            "duration_ms",
        ],
        data["runs"],
    )

    insert_section(
        "traces",
        [
            "id",
            "run_id",
            "parent_id",
            "type",
            "name",
            "agent_id",
            "tool_name",
            "input",
            "output",
            "started_at",
            "completed_at",
            "duration_ms",
            "tokens_input",
            "tokens_output",
            "cost",
            "metadata",
        ],
        data["traces"],
    )

    sections.append("-- Verification queries")
    sections.append("SELECT COUNT(*) AS agent_count FROM agents;")
    sections.append("SELECT COUNT(*) AS workflow_count FROM workflows;")
    sections.append("SELECT COUNT(*) AS run_count FROM runs;")
    sections.append(
        "SELECT run_id, COUNT(*) AS trace_count FROM traces GROUP BY run_id ORDER BY run_id;"
    )

    return "\n".join(sections).strip() + "\n"


def seed_supabase(data: Dict[str, List[Dict[str, Any]]], url: str, key: str) -> None:
    try:
        from supabase import create_client
    except ImportError as exc:  # pragma: no cover - runtime dependency
        raise RuntimeError(
            "supabase package is required. Run: pip install -r requirements.txt"
        ) from exc

    supabase = create_client(url, key)

    for table in ["agents", "workflows", "runs", "traces"]:
        rows = data[table]
        if not rows:
            continue
        result = supabase.table(table).upsert(rows, on_conflict="id").execute()
        error = getattr(result, "error", None)
        if error:
            raise RuntimeError(f"Supabase upsert failed for {table}: {error}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the Supabase GPC dashboard tables.")
    parser.add_argument(
        "--write-sql", type=Path, help="Write a SQL seed file instead of seeding Supabase."
    )
    args = parser.parse_args()

    data = build_seed_data()

    if args.write_sql:
        sql = build_sql(data)
        args.write_sql.write_text(sql)
        print(f"Wrote SQL seed to {args.write_sql}")
        return

    load_dotenv()
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        raise SystemExit(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY in env."
        )

    seed_supabase(data, url, key)
    print("Seed complete.")


if __name__ == "__main__":
    main()
