"""
Gallagher Property Company - AI Agent System API
FastAPI Application
"""

import asyncio
import csv
import io
import json
import os
import tempfile
import uuid
from contextlib import AsyncExitStack, asynccontextmanager
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from config.settings import settings
from models.schemas import AgentOutput, Document, Project, ProjectStatus, PropertyType, Task
from gpc_agents.deal_screener import compute_weighted_score
from tools.exports import (
    generate_dd_report,
    generate_ic_deck,
    generate_investment_memo,
    generate_underwriting_packet,
)
from tools.financial_calcs import FinancialCalculator
from tools.ingestion import extract_document
from tools.database import db
from tools.screening import (
    ScreeningPlaybook,
    ScreeningScoringInputs,
    compute_screening,
    playbook_from_db_settings,
)
from tools.screening_runtime import (
    apply_score_overrides,
    build_screening_inputs,
    find_low_confidence_keys,
)
from workflows.runner import (
    evaluate_project,
    quick_research,
    quick_underwrite,
    run_development_workflow,
    workflow_runner,
)
from tools.job_queue import JobQueue, QueueJob

try:
    from ypy_websocket.asgi_server import ASGIServer
    from ypy_websocket.websocket_server import WebsocketServer

    YPY_AVAILABLE = True
except ImportError:  # pragma: no cover - optional dependency
    ASGIServer = None
    WebsocketServer = None
    YPY_AVAILABLE = False

# ============================================
# Pydantic Models for API
# ============================================


class CreateProjectRequest(BaseModel):
    """Request to create a new project"""

    name: str
    address: Optional[str] = None
    parcel_id: Optional[str] = None
    property_type: Optional[str] = None
    acres: Optional[float] = None
    square_feet: Optional[float] = None
    asking_price: Optional[float] = None
    target_irr: Optional[float] = 0.20
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)


class UpdateProjectRequest(BaseModel):
    """Request to update a project"""

    name: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = None
    acres: Optional[float] = None
    asking_price: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None


class CreateTaskRequest(BaseModel):
    """Request to create a task"""

    title: str
    description: Optional[str] = None
    assigned_agent: Optional[str] = None
    due_date: Optional[str] = None


class AgentQueryRequest(BaseModel):
    """Request to query an agent"""

    query: str
    project_id: Optional[str] = None


class ParallelAnalysisRequest(BaseModel):
    """Request for parallel analysis"""

    analyses: List[str] = Field(default_factory=lambda: ["research", "risk", "finance"])


class QuickUnderwriteRequest(BaseModel):
    """Request for quick underwriting"""

    address: str
    property_type: str
    units: int
    monthly_rent: float
    asking_price: float


class CreateScreenerListingRequest(BaseModel):
    """Request to create a screener listing"""

    project_id: Optional[str] = None
    source: Optional[str] = None
    address: Optional[str] = None
    parcel_id: Optional[str] = None
    listing_data: Dict[str, Any] = Field(default_factory=dict)


class CreateScreenerCriteriaRequest(BaseModel):
    """Request to create screener criteria"""

    name: str
    description: Optional[str] = None
    weights: Dict[str, float] = Field(default_factory=dict)
    thresholds: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ScoreScreenerListingRequest(BaseModel):
    """Request to score a screener listing"""

    criteria_id: Optional[str] = None
    score_inputs: Optional[Dict[str, float]] = None


class CreateDdDealRequest(BaseModel):
    """Request to create a DD deal"""

    project_id: Optional[str] = None
    name: str
    status: str = "open"
    key_dates: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class IngestDdDocumentRequest(BaseModel):
    """Request to ingest DD document"""

    document_type: str
    title: Optional[str] = None
    storage_ref: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class GenerateDdChecklistRequest(BaseModel):
    """Request to generate DD checklist"""

    property_type: str
    phase: str


class FlagDdRedFlagsRequest(BaseModel):
    """Request to add DD red flags"""

    findings: List[Dict[str, Any]] = Field(default_factory=list)


class CreatePermitRequest(BaseModel):
    """Request to create permit record"""

    project_id: Optional[str] = None
    permit_type: str
    authority: Optional[str] = None
    status: str = "pending"
    dates: Dict[str, Any] = Field(default_factory=dict)
    permit_category: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None


class ZoningAnalysisRequest(BaseModel):
    """Request to create zoning analysis"""

    project_id: Optional[str] = None
    parcel_id: Optional[str] = None
    proposed_use: str
    zoning_code: Optional[str] = None
    constraints: Dict[str, Any] = Field(default_factory=dict)


class AgendaItemRequest(BaseModel):
    """Request to create agenda item"""

    body: str
    date: str
    topic: str
    source: Optional[str] = None
    jurisdiction: Optional[str] = None


class PolicyChangeRequest(BaseModel):
    """Request to create policy change"""

    body: str
    effective_date: str
    source: Optional[str] = None
    jurisdiction: Optional[str] = None


class MarketDataRequest(BaseModel):
    """Request for market data ingestion"""

    payload: Dict[str, Any] = Field(default_factory=dict)


class ScreeningIntakeDocumentRequest(BaseModel):
    """Document payload for screening intake"""

    file_name: str
    document_type: Optional[str] = None
    file_path: Optional[str] = None
    storage_path: Optional[str] = None
    storage_url: Optional[str] = None
    mime_type: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ScreeningIntakeRequest(BaseModel):
    """Request to intake a new screening deal"""

    name: Optional[str] = None
    address: str
    broker: str
    asking_price: Optional[float] = None
    property_type: str
    square_feet: Optional[float] = None
    source: Optional[str] = None
    contact: Optional[str] = None
    documents: List[ScreeningIntakeDocumentRequest] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ScreeningFieldValueRequest(BaseModel):
    """Request to upsert screening field values"""

    field_key: str
    value_number: Optional[float] = None
    value_text: Optional[str] = None
    value_json: Optional[Dict[str, Any]] = None
    confidence: Optional[float] = None
    source: Optional[str] = None
    citations: List[Dict[str, Any]] = Field(default_factory=list)


class ScreeningOverrideRequest(BaseModel):
    """Request to apply a screening override"""

    scope: str
    field_key: str
    value_number: Optional[float] = None
    value_text: Optional[str] = None
    value_json: Optional[Dict[str, Any]] = None
    reason: Optional[str] = None
    created_by: Optional[str] = None


class ScreeningReviewRequest(BaseModel):
    """Request to mark a screening run reviewed"""

    reviewed_by: Optional[str] = None


class ScreeningPlaybookRequest(BaseModel):
    """Request to update screening playbook settings"""

    settings: Dict[str, Any] = Field(default_factory=dict)
    created_by: Optional[str] = None


class CreateDealRoomRequest(BaseModel):
    """Request to create a deal room"""

    project_id: str
    name: str
    status: Optional[str] = "active"


class DealRoomMessageRequest(BaseModel):
    """Request to add a deal room message"""

    sender_type: str
    sender_id: Optional[str] = None
    content_md: str
    attachments: List[Dict[str, Any]] = Field(default_factory=list)


class DealRoomArtifactRequest(BaseModel):
    """Request to create deal room artifact"""

    type: str
    title: str
    created_by: Optional[str] = None


class DealRoomArtifactVersionRequest(BaseModel):
    """Request to add artifact version"""

    content_md: Optional[str] = None
    content_json: Dict[str, Any] = Field(default_factory=dict)
    created_by: Optional[str] = None
    source_run_id: Optional[str] = None


class AgentStreamRequest(BaseModel):
    """Request to stream an agent run"""

    query: str
    project_id: Optional[str] = None
    tone_profile_id: Optional[str] = None


class ScenarioRunRequest(BaseModel):
    """Request to run a scenario"""

    project_id: Optional[str] = None
    scenario_id: Optional[str] = None
    base_assumptions: Dict[str, Any] = Field(default_factory=dict)
    delta_assumptions: Dict[str, Any] = Field(default_factory=dict)


class IngestionUploadRequest(BaseModel):
    """Request to register ingestion document"""

    project_id: str
    document_type: str
    file_name: str
    file_path: str
    mime_type: Optional[str] = None
    storage_path: Optional[str] = None
    storage_url: Optional[str] = None


class ExportJobRequest(BaseModel):
    """Request to create export job"""

    project_id: str
    room_id: Optional[str] = None
    type: str
    payload: Dict[str, Any] = Field(default_factory=dict)


class ToneProfileRequest(BaseModel):
    """Request to create tone profile"""

    name: str
    description: Optional[str] = None
    system_prefix: str
    style_guidelines: Dict[str, Any] = Field(default_factory=dict)


class UserSettingsRequest(BaseModel):
    """Request to upsert user settings"""

    user_id: str
    default_tone_profile_id: Optional[str] = None
    notification_prefs: Dict[str, Any] = Field(default_factory=dict)


# ============================================
# FastAPI Application
# ============================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    print("🚀 Gallagher Property Company AI Agent System Starting...")
    print(f"   Environment: {settings.app_env}")
    print(f"   Flagship Model: {settings.openai.flagship_model}")
    print(f"   Tracing Enabled: {settings.agent.enable_tracing}")
    async with AsyncExitStack() as stack:
        collab_server = getattr(app.state, "collab_server", None)
        if collab_server:
            await stack.enter_async_context(collab_server)
        job_queue = JobQueue(
            handlers={
                "ingestion": _handle_ingestion_job,
                "export": _handle_export_job,
                "screening": _handle_screening_job,
            },
            worker_count=2,
            on_retry=_handle_job_retry,
            on_fail=_handle_job_failure,
        )
        app.state.job_queue = job_queue
        await job_queue.start()
        await _requeue_pending_jobs(job_queue)
        try:
            yield
        finally:
            await job_queue.stop()
            print("🛑 Shutting down...")


app = FastAPI(
    title="Gallagher Property Company - AI Agent System",
    description="""
    Multi-agent AI system for commercial real estate development workflows.

    ## Agents

    * **Coordinator**: Central orchestration and workflow management
    * **Research**: Market research, parcel analysis, comparables
    * **Finance**: Underwriting, pro formas, capital structure
    * **Legal**: Zoning, contracts, permits
    * **Design**: Site planning, capacity analysis
    * **Operations**: Scheduling, cost tracking
    * **Marketing**: Listings, offering memos, campaigns
    * **Risk**: Flood analysis, environmental, insurance
    * **Tax Strategist**: IRC references, IRS updates, tax implications
    """,
    version="1.0.0",
    lifespan=lifespan,
)

if YPY_AVAILABLE:
    collab_server = WebsocketServer()
    collab_asgi = ASGIServer(collab_server)
    app.mount("/collab", collab_asgi)
    app.state.collab_server = collab_server

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.is_development else ["https://gallagherproperty.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================
# Health Check
# ============================================


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "environment": settings.app_env,
        "model": settings.openai.flagship_model,
    }


# ============================================
# Project Endpoints
# ============================================


@app.post("/projects", response_model=Dict[str, Any])
async def create_project(request: CreateProjectRequest):
    """Create a new project"""
    project_data = request.model_dump(exclude_none=True)

    project = await db.create_project(project_data)
    if not project:
        raise HTTPException(status_code=500, detail="Failed to create project")

    return {"success": True, "project": project}


@app.get("/projects")
async def list_projects(status: Optional[str] = None):
    """List all projects, optionally filtered by status"""
    projects = await db.list_projects(status)
    return {"projects": projects, "count": len(projects)}


@app.get("/projects/{project_id}")
async def get_project(project_id: str):
    """Get project by ID"""
    project = await db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get related data
    tasks = await db.get_project_tasks(project_id)
    outputs = await db.get_agent_outputs(project_id)
    documents = await db.get_project_documents(project_id)

    return {"project": project, "tasks": tasks, "agent_outputs": outputs, "documents": documents}


@app.patch("/projects/{project_id}")
async def update_project(project_id: str, request: UpdateProjectRequest):
    """Update project"""
    updates = request.model_dump(exclude_none=True)

    project = await db.update_project(project_id, updates)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return {"success": True, "project": project}


# ============================================
# Task Endpoints
# ============================================


@app.post("/projects/{project_id}/tasks")
async def create_task(project_id: str, request: CreateTaskRequest):
    """Create a task for a project"""
    # Verify project exists
    project = await db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    task_data = request.model_dump(exclude_none=True)
    task_data["project_id"] = project_id

    task = await db.create_task(task_data)
    if not task:
        raise HTTPException(status_code=500, detail="Failed to create task")

    return {"success": True, "task": task}


@app.get("/projects/{project_id}/tasks")
async def get_project_tasks(project_id: str):
    """Get all tasks for a project"""
    tasks = await db.get_project_tasks(project_id)
    return {"tasks": tasks}


# ============================================
# Agent Workflow Endpoints
# ============================================


@app.post("/workflows/coordinator")
async def run_coordinator(request: AgentQueryRequest):
    """
    Run the Coordinator agent to orchestrate a workflow

    The Coordinator will analyze the request and delegate to appropriate specialist agents.
    """
    try:
        result = await run_development_workflow(request.query, request.project_id)
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/workflows/evaluate/{project_id}")
async def run_full_evaluation(project_id: str, background_tasks: BackgroundTasks):
    """
    Run a complete project evaluation with all agents

    This runs Research, Risk, Finance, Legal, and Design agents in parallel,
    then has the Coordinator synthesize the results.
    """
    try:
        result = await evaluate_project(project_id)
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/workflows/parallel/{project_id}")
async def run_parallel_analysis(project_id: str, request: ParallelAnalysisRequest):
    """Run multiple analyses in parallel"""
    try:
        result = await workflow_runner.run_parallel_analysis(project_id, request.analyses)
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Single Agent Endpoints
# ============================================


@app.post("/agents/tax")
async def run_tax_agent(request: AgentQueryRequest):
    """Run the Tax Strategist agent directly."""
    try:
        result = await workflow_runner.run_single_agent("tax", request.query, request.project_id)
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agents/{agent_name}")
async def run_single_agent(agent_name: str, request: AgentQueryRequest):
    """
    Run a single agent directly

    Available agents: research, finance, legal, design, operations, marketing, risk, tax
    """
    valid_agents = [
        "research",
        "finance",
        "legal",
        "design",
        "operations",
        "marketing",
        "risk",
        "tax",
        "coordinator",
        "deal_screener",
        "due_diligence",
        "entitlements",
        "market_intel",
    ]

    if agent_name not in valid_agents:
        raise HTTPException(
            status_code=400, detail=f"Invalid agent. Choose from: {', '.join(valid_agents)}"
        )

    try:
        result = await workflow_runner.run_single_agent(
            agent_name, request.query, request.project_id
        )
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Quick Tools Endpoints
# ============================================


@app.post("/tools/quick-research")
async def run_quick_research(request: AgentQueryRequest):
    """Quick research on an address"""
    try:
        # Extract address and property type from query
        result = await quick_research(request.query, "mobile_home_park")
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/tools/quick-underwrite")
async def run_quick_underwrite(request: QuickUnderwriteRequest):
    """Quick underwriting for a property"""
    try:
        result = await quick_underwrite(
            address=request.address,
            property_type=request.property_type,
            units=request.units,
            lot_rent=request.monthly_rent,
            asking_price=request.asking_price,
        )
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Deal Screener Endpoints
# ============================================


@app.post("/api/screener/listings")
async def create_screener_listing(request: CreateScreenerListingRequest):
    """Create a deal screener listing"""
    try:
        listing = await db.create_screener_listing(request.model_dump())
        return {"success": True, "listing": listing}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/screener/criteria")
async def create_screener_criteria(request: CreateScreenerCriteriaRequest):
    """Create deal screener criteria"""
    try:
        criteria = await db.create_screener_criteria(request.model_dump())
        return {"success": True, "criteria": criteria}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/screener/score/{listing_id}")
async def score_screener_listing(listing_id: str, request: ScoreScreenerListingRequest):
    """Score a deal screener listing"""
    try:
        listing = await db.get_screener_listing(listing_id)
        if not listing:
            raise HTTPException(status_code=404, detail="Listing not found")

        score_inputs = request.score_inputs
        if not score_inputs:
            listing_data = listing.get("listing_data") or {}
            score_inputs = listing_data.get("scores") if isinstance(listing_data, dict) else {}
        score_inputs = {k: float(v) for k, v in (score_inputs or {}).items() if v is not None}

        if request.criteria_id:
            criteria = await db.get_screener_criteria(request.criteria_id)
            if not criteria:
                raise HTTPException(status_code=404, detail="Criteria not found")
            weights = criteria.get("weights") or {}
            breakdown = compute_weighted_score(score_inputs, weights=weights or None)
        else:
            breakdown = compute_weighted_score(score_inputs)

        updated = await db.update_screener_listing(
            listing_id,
            {
                "score_total": breakdown["total_score"],
                "score_tier": breakdown["tier"],
                "score_detail": breakdown,
                "status": "scored",
            },
        )

        if breakdown["tier"] == "D":
            await db.create_screener_alert(
                {
                    "listing_id": listing_id,
                    "alert_type": "low_score",
                    "severity": "high",
                    "message": "Listing scored below acceptable threshold",
                }
            )

        return {"success": True, "listing": updated, "score": breakdown}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/screener/listings")
async def list_screener_listings(status: Optional[str] = None):
    """List deal screener listings"""
    listings = await db.list_screener_listings(status)
    return {"listings": listings}


@app.get("/api/screener/alerts")
async def list_screener_alerts(listing_id: Optional[str] = None):
    """List screener alerts"""
    alerts = await db.list_screener_alerts(listing_id)
    return {"alerts": alerts}


# ============================================
# Due Diligence Endpoints
# ============================================


@app.post("/api/dd/deals")
async def create_dd_deal(request: CreateDdDealRequest):
    """Create a due diligence deal"""
    try:
        deal = await db.create_dd_deal(request.model_dump())
        return {"success": True, "deal": deal}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/dd/deals/{dd_deal_id}/documents")
async def add_dd_document(dd_deal_id: str, request: IngestDdDocumentRequest):
    """Add a DD document"""
    try:
        record = request.model_dump()
        record["dd_deal_id"] = dd_deal_id
        doc = await db.add_dd_document(record)
        return {"success": True, "document": doc}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/dd/deals/{dd_deal_id}/checklist")
async def add_dd_checklist(dd_deal_id: str, request: GenerateDdChecklistRequest):
    """Generate DD checklist items"""
    try:
        templates = {
            "acquisition": [
                "Review title report and vesting deeds",
                "Order Phase I environmental report",
                "Collect rent roll and operating statements",
                "Verify zoning compliance and permitted uses",
            ],
            "development": [
                "Confirm utility availability and capacity",
                "Collect survey, ALTA, and boundary details",
                "Review entitlements timeline and fee schedule",
                "Validate construction budget and GMP",
            ],
            "operations": [
                "Inspect physical condition and deferred maintenance",
                "Confirm insurance coverage and claims history",
                "Review vendor contracts and service agreements",
                "Assess market comps and leasing velocity",
            ],
        }
        base_items = templates.get(request.phase.lower(), templates["acquisition"])
        items = [
            {
                "property_type": request.property_type,
                "phase": request.phase,
                "item": item,
                "status": "pending",
            }
            for item in base_items
        ]
        stored = await db.add_dd_checklist_items(dd_deal_id, items)
        return {"success": True, "items": stored}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/dd/deals/{dd_deal_id}/red_flags")
async def add_dd_red_flags(dd_deal_id: str, request: FlagDdRedFlagsRequest):
    """Add DD red flags"""
    try:
        flags = []
        for finding in request.findings:
            flags.append(
                {
                    "dd_deal_id": dd_deal_id,
                    "title": finding.get("title"),
                    "severity": finding.get("severity", "medium"),
                    "details": finding.get("details"),
                    "source": finding.get("source"),
                    "status": finding.get("status", "open"),
                }
            )
        stored = await db.add_dd_red_flags(dd_deal_id, flags)
        return {"success": True, "red_flags": stored}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/dd/deals/{dd_deal_id}")
async def get_dd_deal(dd_deal_id: str):
    """Get DD deal details"""
    deal = await db.get_dd_deal(dd_deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail="DD deal not found")
    documents = await db.list_dd_documents(dd_deal_id)
    checklist = await db.list_dd_checklist_items(dd_deal_id)
    red_flags = await db.list_dd_red_flags(dd_deal_id)
    return {
        "deal": deal,
        "documents": documents,
        "checklist": checklist,
        "red_flags": red_flags,
    }


# ============================================
# Entitlements Endpoints
# ============================================


@app.post("/api/permits")
async def create_permit(request: CreatePermitRequest):
    """Create permit record"""
    try:
        permit = await db.create_permit_record(request.model_dump())
        return {"success": True, "permit": permit}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/permits")
async def list_permits(project_id: Optional[str] = None):
    """List permits"""
    permits = await db.list_permits(project_id)
    return {"permits": permits}


@app.post("/api/zoning/analysis")
async def create_zoning_analysis(request: ZoningAnalysisRequest):
    """Create zoning analysis record"""
    try:
        analysis = await db.create_zoning_analysis(request.model_dump())
        return {"success": True, "analysis": analysis}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agendas")
async def list_agendas(jurisdiction: Optional[str] = None):
    """List agenda items"""
    items = await db.list_agenda_items(jurisdiction)
    return {"agenda_items": items}


@app.post("/api/agendas")
async def create_agenda(request: AgendaItemRequest):
    """Create agenda item"""
    try:
        item = await db.create_agenda_item(request.model_dump())
        return {"success": True, "agenda_item": item}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/policies")
async def create_policy(request: PolicyChangeRequest):
    """Create policy change"""
    try:
        policy = await db.create_policy_change(request.model_dump())
        return {"success": True, "policy_change": policy}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/policies")
async def list_policies(jurisdiction: Optional[str] = None):
    """List policy changes"""
    policies = await db.list_policy_changes(jurisdiction)
    return {"policy_changes": policies}


# ============================================
# Market Intelligence Endpoints
# ============================================


@app.post("/api/market/competitors")
async def create_competitor_transaction(request: MarketDataRequest):
    """Create competitor transaction"""
    try:
        record = await db.create_competitor_transaction(request.payload)
        return {"success": True, "transaction": record}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/market/economic")
async def create_economic_indicator(request: MarketDataRequest):
    """Create economic indicator"""
    try:
        record = await db.create_economic_indicator(request.payload)
        return {"success": True, "indicator": record}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/market/infrastructure")
async def create_infrastructure_project(request: MarketDataRequest):
    """Create infrastructure project"""
    try:
        record = await db.create_infrastructure_project(request.payload)
        return {"success": True, "infrastructure_project": record}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/market/absorption")
async def create_absorption_metric(request: MarketDataRequest):
    """Create absorption metric"""
    try:
        record = await db.create_absorption_metric(request.payload)
        return {"success": True, "absorption": record}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/market/snapshot")
async def get_market_snapshot(region: str, property_type: str):
    """Get market snapshot"""
    snapshot = await db.get_market_snapshot(region, property_type)
    return {"snapshot": snapshot}

# ============================================
# Agent Output Endpoints
# ============================================


@app.get("/projects/{project_id}/outputs")
async def get_agent_outputs(project_id: str, agent_name: Optional[str] = None):
    """Get agent outputs for a project"""
    outputs = await db.get_agent_outputs(project_id, agent_name)
    return {"outputs": outputs}


# ============================================
# Deal Room Endpoints
# ============================================


@app.post("/deal-rooms")
async def create_deal_room(request: CreateDealRoomRequest):
    """Create a deal room"""
    room = await db.create_deal_room(
        {"project_id": request.project_id, "name": request.name, "status": request.status}
    )
    return {"room": room}


@app.get("/deal-rooms/{room_id}")
async def get_deal_room(room_id: str):
    """Get deal room with artifacts and members"""
    room = await db.get_deal_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Deal room not found")
    artifacts = await db.list_deal_room_artifacts(room_id)
    members = await db.get_deal_room_members(room_id)
    return {"room": room, "artifacts": artifacts, "members": members}


@app.get("/deal-rooms/{room_id}/events")
async def list_deal_room_events(room_id: str):
    """List deal room events"""
    events = await db.list_deal_room_events(room_id)
    return {"events": events}


@app.get("/deal-rooms/{room_id}/messages")
async def list_deal_room_messages(room_id: str):
    """List deal room messages"""
    messages = await db.list_deal_room_messages(room_id)
    return {"messages": messages}


@app.post("/deal-rooms/{room_id}/messages")
async def add_deal_room_message(room_id: str, request: DealRoomMessageRequest):
    """Add deal room message"""
    message = await db.add_deal_room_message(
        {
            "room_id": room_id,
            "sender_type": request.sender_type,
            "sender_id": request.sender_id,
            "content_md": request.content_md,
            "attachments": request.attachments,
        }
    )
    await db.add_deal_room_event(
        {
            "room_id": room_id,
            "event_type": "agent_update" if request.sender_type == "agent" else "system",
            "payload": {"message_id": message.get("id")},
        }
    )
    return {"message": message}


@app.post("/deal-rooms/{room_id}/artifacts")
async def create_deal_room_artifact(room_id: str, request: DealRoomArtifactRequest):
    """Create a deal room artifact"""
    artifact = await db.create_deal_room_artifact(
        {
            "room_id": room_id,
            "type": request.type,
            "title": request.title,
            "created_by": request.created_by,
        }
    )
    await db.add_deal_room_event(
        {
            "room_id": room_id,
            "event_type": "artifact_update",
            "payload": {"artifact_id": artifact.get("id")},
        }
    )
    return {"artifact": artifact}


@app.post("/deal-rooms/{room_id}/artifacts/{artifact_id}/versions")
async def add_deal_room_artifact_version(
    room_id: str, artifact_id: str, request: DealRoomArtifactVersionRequest
):
    """Add artifact version"""
    version = await db.add_deal_room_artifact_version(
        {
            "artifact_id": artifact_id,
            "content_md": request.content_md,
            "content_json": request.content_json,
            "created_by": request.created_by,
            "source_run_id": request.source_run_id,
        }
    )
    await db.update_deal_room_artifact(artifact_id, {"current_version_id": version.get("id")})
    await db.add_deal_room_event(
        {
            "room_id": room_id,
            "event_type": "artifact_update",
            "payload": {"artifact_id": artifact_id, "version_id": version.get("id")},
        }
    )
    return {"version": version}


# ============================================
# Agent Streaming
# ============================================


def _format_sse(event: str, data: Dict[str, Any]) -> str:
    payload = json.dumps(data)
    return f"event: {event}\ndata: {payload}\n\n"


def _chunk_text(text: str, chunk_size: int = 300) -> List[str]:
    return [text[i : i + chunk_size] for i in range(0, len(text), chunk_size)] or [""]


@app.post("/agents/{agent_name}/stream")
async def stream_agent_run(agent_name: str, request: AgentStreamRequest):
    """Stream an agent run via SSE"""

    async def event_generator():
        run_id = str(uuid.uuid4())
        yield _format_sse("start", {"run_id": run_id})
        result = await workflow_runner.run_single_agent(
            agent_name, request.query, project_id=request.project_id
        )
        output_text = result.get("output", "")
        for chunk in _chunk_text(output_text):
            yield _format_sse("chunk", {"run_id": run_id, "content": chunk})
            await asyncio.sleep(0.01)
        yield _format_sse("complete", {"run_id": run_id})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ============================================
# Scenario Sandbox
# ============================================


@app.post("/scenarios/run")
async def run_scenario(request: ScenarioRunRequest):
    """Run a scenario and return delta results"""
    base = request.base_assumptions or {}
    delta = request.delta_assumptions or {}
    assumptions = {**base, **delta}

    noi = float(assumptions.get("noi", 0) or 0)
    exit_cap = float(assumptions.get("exit_cap_rate", 0.06) or 0.06)
    debt_service = float(assumptions.get("debt_service", 0) or 0)
    cash_flows = assumptions.get("cash_flows") or []

    property_value = float(FinancialCalculator.calculate_property_value(Decimal(noi), exit_cap))
    dscr = FinancialCalculator.calculate_dscr(Decimal(noi), Decimal(debt_service))
    irr = FinancialCalculator.calculate_irr([float(x) for x in cash_flows]) if cash_flows else 0.0

    results = {
        "noi": noi,
        "exit_cap_rate": exit_cap,
        "property_value": property_value,
        "dscr": dscr,
        "irr": irr,
    }

    scenario_run = None
    if request.scenario_id:
        scenario_run = await db.create_scenario_run(
            {"scenario_id": request.scenario_id, "delta_assumptions": delta, "results": results}
        )

    return {"results": results, "scenario_run": scenario_run}


# ============================================
# Background Job Orchestration
# ============================================


async def _handle_ingestion_job(payload: Dict[str, Any]) -> None:
    await _process_ingestion_job(payload["document_id"], payload["job_id"])


async def _handle_export_job(payload: Dict[str, Any]) -> None:
    await _run_export_job(payload["job_id"], payload["job_type"], payload["payload"])


async def _handle_screening_job(payload: Dict[str, Any]) -> None:
    await _process_screening_run(payload["run_id"])


async def _requeue_pending_jobs(job_queue: JobQueue) -> None:
    ingestion_jobs = await db.list_ingestion_jobs(["queued", "running"])
    for job in ingestion_jobs:
        job_id = job.get("id")
        document_id = job.get("document_id")
        if not job_id or not document_id:
            continue
        if job.get("status") == "running":
            await db.update_ingestion_job(job_id, {"status": "queued"})
        await job_queue.enqueue("ingestion", {"job_id": job_id, "document_id": document_id})

    export_jobs = await db.list_export_jobs(["queued", "running"])
    for job in export_jobs:
        job_id = job.get("id")
        job_type = job.get("type")
        if not job_id or not job_type:
            continue
        payload = job.get("payload") or {}
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except json.JSONDecodeError:
                payload = {}
        if job.get("status") == "running":
            await db.update_export_job(job_id, {"status": "queued"})
        await job_queue.enqueue(
            "export", {"job_id": job_id, "job_type": job_type, "payload": payload}
        )

    screening_runs = await db.list_screening_runs(statuses=["queued", "running"])
    for run in screening_runs:
        run_id = run.get("id")
        if not run_id:
            continue
        if run.get("status") == "running":
            await db.update_screening_run(run_id, {"status": "queued"})
        await job_queue.enqueue("screening", {"run_id": run_id})


async def _handle_job_retry(job: QueueJob, exc: Exception, delay: float) -> None:
    if job.job_type == "ingestion":
        await db.update_ingestion_job(
            job.payload["job_id"], {"status": "queued", "errors": str(exc)}
        )
    elif job.job_type == "export":
        await db.update_export_job(
            job.payload["job_id"], {"status": "queued", "errors": str(exc)}
        )
    elif job.job_type == "screening":
        await db.update_screening_run(
            job.payload["run_id"], {"status": "queued", "errors": str(exc)}
        )


async def _handle_job_failure(job: QueueJob, exc: Exception) -> None:
    completed_at = datetime.utcnow().isoformat()
    if job.job_type == "ingestion":
        await db.update_ingestion_job(
            job.payload["job_id"],
            {"status": "failed", "errors": str(exc), "completed_at": completed_at},
        )
    elif job.job_type == "export":
        await db.update_export_job(
            job.payload["job_id"],
            {"status": "failed", "errors": str(exc), "completed_at": completed_at},
        )
    elif job.job_type == "screening":
        await db.update_screening_run(
            job.payload["run_id"],
            {"status": "failed", "errors": str(exc), "completed_at": completed_at},
        )


def _parse_json_payload(value: Any, default: Any) -> Any:
    if value is None:
        return default
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return default
    return value


async def _ensure_active_screening_playbook(created_by: Optional[str] = None) -> Dict[str, Any]:
    playbook = await db.get_active_screening_playbook()
    if playbook:
        return playbook
    settings = ScreeningPlaybook().model_dump()
    return await db.create_screening_playbook_version(1, settings, created_by=created_by, activate=True)


async def _get_latest_screening_run(project_id: str) -> Optional[Dict[str, Any]]:
    runs = await db.list_screening_runs(project_id=project_id)
    return runs[0] if runs else None


async def _clone_screening_field_values(
    source_run_id: str, target_run_id: str
) -> List[Dict[str, Any]]:
    values = await db.list_screening_field_values(source_run_id)
    payload: List[Dict[str, Any]] = []
    for value in values:
        payload.append(
            {
                "screening_run_id": target_run_id,
                "field_key": value.get("field_key"),
                "value_text": value.get("value_text"),
                "value_number": value.get("value_number"),
                "value_bool": value.get("value_bool"),
                "value_date": value.get("value_date"),
                "value_json": _parse_json_payload(value.get("value_json"), {}),
                "unit": value.get("unit"),
                "confidence": value.get("confidence"),
                "extraction_method": value.get("extraction_method"),
                "source_document_id": value.get("source_document_id"),
                "citation_ids": value.get("citation_ids") or [],
            }
        )
    if not payload:
        return []
    return await db.upsert_screening_field_values(payload)


async def _create_screening_run(
    project_id: str,
    trigger: str,
    created_by: Optional[str] = None,
    playbook: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    active_playbook = playbook or await _ensure_active_screening_playbook(created_by=created_by)
    settings = _parse_json_payload(active_playbook.get("settings"), {})
    version = active_playbook.get("version") or 1
    run = await db.create_screening_run(
        {
            "project_id": project_id,
            "playbook_version": version,
            "playbook_snapshot": settings,
            "trigger": trigger,
            "status": "queued",
        }
    )
    return run

# ============================================
# Ingestion
# ============================================


@app.post("/ingestion/upload")
async def register_ingestion_document(request: IngestionUploadRequest):
    """Register a document for ingestion and return storage details"""
    document = await db.save_document(
        {
            "project_id": request.project_id,
            "document_type": request.document_type,
            "file_name": request.file_name,
            "file_path": request.file_path,
            "mime_type": request.mime_type,
            "storage_path": request.storage_path,
            "storage_url": request.storage_url,
        }
    )
    return {"document": document, "upload_url": None}


async def _process_ingestion_job(document_id: str, job_id: str) -> None:
    await db.update_ingestion_job(job_id, {"status": "running", "errors": None})
    record = await db.get_document(document_id)
    if not record:
        raise RuntimeError("Document not found")
    file_path = record.get("file_path")
    temp_path: str | None = None
    try:
        if not file_path:
            storage_url = record.get("storage_url")
            if storage_url:
                suffix = os.path.splitext(storage_url.split("?")[0])[1]
                async with httpx.AsyncClient(timeout=30) as client:
                    response = await client.get(storage_url)
                    response.raise_for_status()
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    tmp.write(response.content)
                    temp_path = tmp.name
                    file_path = temp_path
            else:
                raise RuntimeError("Missing document file path")

        extracted = extract_document(file_path, record.get("mime_type"))
        await db.update_document(
            document_id,
            {
                "extracted_text": extracted.get("text"),
                "classification": extracted.get("classification", {}),
            },
        )
        await db.update_ingestion_job(
            job_id,
            {
                "status": "complete",
                "extracted_data": extracted,
                "completed_at": datetime.utcnow().isoformat(),
                "errors": None,
            },
        )
    except Exception as exc:  # pylint: disable=broad-exception-caught
        raise RuntimeError(f"Ingestion failed: {exc}") from exc
    finally:
        if temp_path:
            try:
                os.remove(temp_path)
            except OSError:
                pass


@app.post("/ingestion/process/{document_id}")
async def process_ingestion(document_id: str, request: Request):
    """Process ingestion job for a document"""
    document = await db.get_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    job = await db.create_ingestion_job(
        {"project_id": document.get("project_id"), "document_id": document_id, "status": "queued"}
    )
    job_id = job.get("id")
    if not job_id:
        raise HTTPException(status_code=500, detail="Failed to create ingestion job")
    job_queue: JobQueue | None = getattr(request.app.state, "job_queue", None)
    if not job_queue:
        raise HTTPException(status_code=500, detail="Job queue unavailable")
    await job_queue.enqueue("ingestion", {"job_id": job_id, "document_id": document_id})
    return {"job": job}


# ============================================
# Screening (Deal Screening MVP)
# ============================================


async def _process_screening_run(run_id: str) -> None:
    run = await db.get_screening_run(run_id)
    if not run:
        raise RuntimeError("Screening run not found")
    project_id = run.get("project_id")
    if not project_id:
        raise RuntimeError("Screening run missing project")
    started_at = datetime.utcnow().isoformat()
    await db.update_screening_run(run_id, {"status": "running", "started_at": started_at, "errors": None})

    playbook_settings = _parse_json_payload(run.get("playbook_snapshot"), {})
    playbook = playbook_from_db_settings(playbook_settings)

    field_values = await db.list_screening_field_values(run_id)
    overrides = await db.list_screening_overrides(project_id)
    inputs = build_screening_inputs(field_values, overrides)

    computation = compute_screening(playbook, inputs)
    low_confidence = find_low_confidence_keys(
        field_values, playbook.low_confidence_threshold, overrides
    )
    needs_review = bool(low_confidence)

    scores_payload = {
        "screening_run_id": run_id,
        "overall_score": computation.scores.overall_score,
        "financial_score": computation.scores.financial_score,
        "qualitative_score": computation.scores.qualitative_score,
        "is_provisional": computation.scores.is_provisional,
        "hard_filter_failed": computation.scores.hard_filter_failed,
        "hard_filter_reasons": computation.scores.hard_filter_reasons,
        "missing_keys": computation.scores.missing_keys,
    }
    await db.upsert_screening_score(scores_payload)

    completed_at = datetime.utcnow().isoformat()
    await db.update_screening_run(
        run_id,
        {
            "status": "complete",
            "needs_review": needs_review,
            "low_confidence_keys": low_confidence,
            "completed_at": completed_at,
            "errors": None,
        },
    )


@app.post("/screening/intake")
async def screening_intake(request: ScreeningIntakeRequest, request_context: Request):
    """Intake a new deal for screening."""
    project_payload = {
        "name": request.name or request.address,
        "address": request.address,
        "property_type": request.property_type,
        "square_feet": request.square_feet,
        "asking_price": request.asking_price,
        "metadata": {
            "broker": request.broker,
            "source": request.source,
            "contact": request.contact,
            **(request.metadata or {}),
        },
    }
    project = await db.create_project(project_payload)
    if not project:
        raise HTTPException(status_code=500, detail="Failed to create project")

    room = await db.create_deal_room(
        {"project_id": project.get("id"), "name": f"{project.get('name')} Deal Room"}
    )

    task_titles = [
        "Request rent roll + T-12 from broker",
        "Verify occupancy and lease expirations",
        "Validate asking price vs comps",
    ]
    tasks = []
    for title in task_titles:
        tasks.append(
            await db.create_task(
                {
                    "project_id": project.get("id"),
                    "title": title,
                    "status": "pending",
                    "priority": "medium",
                }
            )
        )

    documents: List[Dict[str, Any]] = []
    ingestion_jobs: List[Dict[str, Any]] = []
    job_queue: JobQueue | None = getattr(request_context.app.state, "job_queue", None)
    if not job_queue:
        raise HTTPException(status_code=500, detail="Job queue unavailable")

    for doc in request.documents:
        document = await db.save_document(
            {
                "project_id": project.get("id"),
                "document_type": doc.document_type or "offering_memo",
                "file_name": doc.file_name,
                "file_path": doc.file_path,
                "mime_type": doc.mime_type,
                "storage_path": doc.storage_path,
                "storage_url": doc.storage_url,
                "metadata": doc.metadata,
            }
        )
        documents.append(document)
        job = await db.create_ingestion_job(
            {"project_id": project.get("id"), "document_id": document.get("id"), "status": "queued"}
        )
        ingestion_jobs.append(job)
        await job_queue.enqueue(
            "ingestion", {"job_id": job.get("id"), "document_id": document.get("id")}
        )

    playbook = await _ensure_active_screening_playbook()
    run = await _create_screening_run(project.get("id"), "intake", playbook=playbook)

    field_payload: List[Dict[str, Any]] = []
    if request.asking_price is not None:
        field_payload.append(
            {
                "screening_run_id": run.get("id"),
                "field_key": "price_basis",
                "value_number": request.asking_price,
                "extraction_method": "manual",
                "confidence": 1.0,
            }
        )
    if request.square_feet is not None:
        field_payload.append(
            {
                "screening_run_id": run.get("id"),
                "field_key": "square_feet",
                "value_number": request.square_feet,
                "extraction_method": "manual",
                "confidence": 1.0,
            }
        )
    for key, value in {
        "address": request.address,
        "broker": request.broker,
        "source": request.source,
        "contact": request.contact,
        "property_type": request.property_type,
    }.items():
        if value:
            field_payload.append(
                {
                    "screening_run_id": run.get("id"),
                    "field_key": key,
                    "value_text": value,
                    "extraction_method": "manual",
                    "confidence": 1.0,
                }
            )
    if field_payload:
        await db.upsert_screening_field_values(field_payload)

    await job_queue.enqueue("screening", {"run_id": run.get("id")})

    return {
        "project": project,
        "deal_room": room,
        "tasks": tasks,
        "documents": documents,
        "ingestion_jobs": ingestion_jobs,
        "screening_run": run,
    }


@app.get("/screening/deals")
async def list_screening_deals(
    status: Optional[str] = None,
    needs_review: Optional[bool] = None,
    min_score: Optional[float] = None,
    max_score: Optional[float] = None,
    search: Optional[str] = None,
):
    """List screening deals with latest run and score."""
    projects = await db.list_projects()
    if search:
        query = search.lower()
        filtered: List[Dict[str, Any]] = []
        for project in projects:
            metadata = _parse_json_payload(project.get("metadata"), {})
            haystack = " ".join(
                [
                    str(project.get("name") or ""),
                    str(project.get("address") or ""),
                    json.dumps(metadata),
                ]
            ).lower()
            if query in haystack:
                filtered.append(project)
                continue
            documents = await db.get_project_documents(project.get("id"))
            doc_match = any(query in (doc.get("extracted_text") or "").lower() for doc in documents)
            if doc_match:
                filtered.append(project)
        projects = filtered

    deals: List[Dict[str, Any]] = []
    for project in projects:
        latest_run = await _get_latest_screening_run(project.get("id"))
        score_record = None
        overrides: List[Dict[str, Any]] = []
        if latest_run:
            score_record = await db.get_screening_score(latest_run.get("id"))
            overrides = await db.list_screening_overrides(project.get("id"))

        base_scores = {
            "overall_score": score_record.get("overall_score") if score_record else None,
            "financial_score": score_record.get("financial_score") if score_record else None,
            "qualitative_score": score_record.get("qualitative_score") if score_record else None,
        }
        final_scores = apply_score_overrides(base_scores, overrides)
        overall_score = final_scores.get("overall_score")

        if status:
            if not latest_run or latest_run.get("status") != status:
                continue
        if needs_review is not None:
            if not latest_run or latest_run.get("needs_review") != needs_review:
                continue
        if min_score is not None:
            if overall_score is None or overall_score < min_score:
                continue
        if max_score is not None:
            if overall_score is None or overall_score > max_score:
                continue

        deals.append(
            {
                "project": project,
                "latest_run": latest_run,
                "score": score_record,
                "final_scores": final_scores,
            }
        )

    deals.sort(
        key=lambda entry: entry["final_scores"].get("overall_score")
        if entry["final_scores"].get("overall_score") is not None
        else -1,
        reverse=True,
    )
    return {"deals": deals, "count": len(deals)}


@app.get("/screening/deals/{project_id}")
async def get_screening_deal(project_id: str):
    """Get screening detail for a project."""
    project = await db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    documents = await db.get_project_documents(project_id)
    runs = await db.list_screening_runs(project_id=project_id)
    latest_run = runs[0] if runs else None
    overrides = await db.list_screening_overrides(project_id)

    score_record = await db.get_screening_score(latest_run.get("id")) if latest_run else None
    field_values = await db.list_screening_field_values(latest_run.get("id")) if latest_run else []

    computation = None
    final_scores = None
    if latest_run:
        playbook_settings = _parse_json_payload(latest_run.get("playbook_snapshot"), {})
        playbook = playbook_from_db_settings(playbook_settings)
        inputs = build_screening_inputs(field_values, overrides)
        computation = compute_screening(playbook, inputs)
        base_scores = {
            "overall_score": computation.scores.overall_score,
            "financial_score": computation.scores.financial_score,
            "qualitative_score": computation.scores.qualitative_score,
        }
        final_scores = apply_score_overrides(base_scores, overrides)

    history: List[Dict[str, Any]] = []
    for run in runs:
        run_score = await db.get_screening_score(run.get("id"))
        history.append({"run": run, "score": run_score})

    return {
        "project": project,
        "documents": documents,
        "latest_run": latest_run,
        "score": score_record,
        "final_scores": final_scores,
        "field_values": field_values,
        "overrides": overrides,
        "computation": computation.model_dump() if computation else None,
        "history": history,
    }


@app.post("/screening/deals/{project_id}/rerun")
async def rerun_screening(project_id: str, request_context: Request):
    """Create a new screening run and enqueue."""
    project = await db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    latest_run = await _get_latest_screening_run(project_id)
    run = await _create_screening_run(project_id, "manual_rerun")
    if latest_run:
        await _clone_screening_field_values(latest_run.get("id"), run.get("id"))
    job_queue: JobQueue | None = getattr(request_context.app.state, "job_queue", None)
    if not job_queue:
        raise HTTPException(status_code=500, detail="Job queue unavailable")
    await job_queue.enqueue("screening", {"run_id": run.get("id")})
    return {"run": run}


@app.post("/screening/deals/{project_id}/fields")
async def upsert_screening_fields(
    project_id: str, request: ScreeningFieldValueRequest, request_context: Request
):
    """Upsert screening field values and re-run scoring."""
    project = await db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    latest_run = await _get_latest_screening_run(project_id)
    run = await _create_screening_run(project_id, "field_update")
    if latest_run:
        await _clone_screening_field_values(latest_run.get("id"), run.get("id"))

    value_json = dict(request.value_json or {})
    if request.citations:
        value_json.setdefault("citations", request.citations)

    field_payload = [
        {
            "screening_run_id": run.get("id"),
            "field_key": request.field_key,
            "value_number": request.value_number,
            "value_text": request.value_text,
            "value_json": value_json,
            "confidence": request.confidence,
            "extraction_method": request.source or "manual",
        }
    ]
    await db.upsert_screening_field_values(field_payload)

    job_queue: JobQueue | None = getattr(request_context.app.state, "job_queue", None)
    if not job_queue:
        raise HTTPException(status_code=500, detail="Job queue unavailable")
    await job_queue.enqueue("screening", {"run_id": run.get("id")})
    return {"run": run, "field_values": field_payload}


@app.post("/screening/deals/{project_id}/overrides")
async def create_screening_override(
    project_id: str, request: ScreeningOverrideRequest, request_context: Request
):
    """Create a screening override."""
    project = await db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    override = await db.create_screening_override(
        {
            "project_id": project_id,
            "scope": request.scope,
            "field_key": request.field_key,
            "value_number": request.value_number,
            "value_text": request.value_text,
            "value_json": request.value_json or {},
            "notes": request.reason,
            "created_by": request.created_by,
        }
    )

    run = None
    if request.scope == "field":
        latest_run = await _get_latest_screening_run(project_id)
        run = await _create_screening_run(project_id, "field_override")
        if latest_run:
            await _clone_screening_field_values(latest_run.get("id"), run.get("id"))
        job_queue: JobQueue | None = getattr(request_context.app.state, "job_queue", None)
        if not job_queue:
            raise HTTPException(status_code=500, detail="Job queue unavailable")
        await job_queue.enqueue("screening", {"run_id": run.get("id")})

    return {"override": override, "run": run}


@app.post("/screening/runs/{run_id}/review")
async def mark_screening_reviewed(run_id: str, request: ScreeningReviewRequest):
    """Mark a screening run reviewed."""
    run = await db.get_screening_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Screening run not found")
    updated = await db.update_screening_run(
        run_id,
        {
            "needs_review": False,
            "reviewed_at": datetime.utcnow().isoformat(),
            "reviewed_by": request.reviewed_by,
        },
    )
    return {"run": updated}


@app.get("/screening/playbook")
async def get_screening_playbook():
    """Fetch active playbook and version history."""
    active = await db.get_active_screening_playbook()
    versions = await db.list_screening_playbooks()
    if not active:
        active = await _ensure_active_screening_playbook()
        versions = await db.list_screening_playbooks()
    return {"active": active, "versions": versions}


@app.put("/screening/playbook")
async def update_screening_playbook(request: ScreeningPlaybookRequest, request_context: Request):
    """Create a new playbook version and re-run screenings."""
    versions = await db.list_screening_playbooks()
    next_version = (versions[0].get("version") if versions else 0) + 1
    playbook = await db.create_screening_playbook_version(
        next_version, request.settings or {}, created_by=request.created_by, activate=True
    )

    projects = await db.list_projects()
    job_queue: JobQueue | None = getattr(request_context.app.state, "job_queue", None)
    if not job_queue:
        raise HTTPException(status_code=500, detail="Job queue unavailable")

    reruns: List[Dict[str, Any]] = []
    for project in projects:
        latest_run = await _get_latest_screening_run(project.get("id"))
        run = await _create_screening_run(
            project.get("id"), "playbook_update", playbook=playbook
        )
        if latest_run:
            await _clone_screening_field_values(latest_run.get("id"), run.get("id"))
        reruns.append(run)
        await job_queue.enqueue("screening", {"run_id": run.get("id")})

    return {"playbook": playbook, "reruns": reruns}


@app.get("/screening/export")
async def export_screening_deals():
    """Export latest screening summary to CSV."""
    projects = await db.list_projects()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "project_id",
            "name",
            "address",
            "status",
            "overall_score",
            "financial_score",
            "qualitative_score",
            "cap_rate",
            "yield_on_cost",
            "dscr",
            "cash_on_cash",
            "needs_review",
        ]
    )

    for project in projects:
        latest_run = await _get_latest_screening_run(project.get("id"))
        if not latest_run:
            continue
        score_record = await db.get_screening_score(latest_run.get("id"))
        field_values = await db.list_screening_field_values(latest_run.get("id"))
        overrides = await db.list_screening_overrides(project.get("id"))
        playbook_settings = _parse_json_payload(latest_run.get("playbook_snapshot"), {})
        playbook = playbook_from_db_settings(playbook_settings)
        inputs = build_screening_inputs(field_values, overrides)
        computation = compute_screening(playbook, inputs)
        base_scores = {
            "overall_score": computation.scores.overall_score,
            "financial_score": computation.scores.financial_score,
            "qualitative_score": computation.scores.qualitative_score,
        }
        final_scores = apply_score_overrides(base_scores, overrides)
        writer.writerow(
            [
                project.get("id"),
                project.get("name"),
                project.get("address"),
                latest_run.get("status"),
                final_scores.get("overall_score"),
                final_scores.get("financial_score"),
                final_scores.get("qualitative_score"),
                computation.metrics.cap_rate_used,
                computation.metrics.yield_on_cost,
                computation.metrics.dscr,
                computation.metrics.cash_on_cash,
                latest_run.get("needs_review"),
            ]
        )

    output.seek(0)
    headers = {"Content-Disposition": "attachment; filename=screening_export.csv"}
    return StreamingResponse(output, media_type="text/csv", headers=headers)


# ============================================
# Packaging
# ============================================


async def _run_export_job(job_id: str, job_type: str, payload: Dict[str, Any]) -> None:
    await db.update_export_job(job_id, {"status": "running", "errors": None})
    try:
        project_id = payload.get("project_id")
        project = await db.get_project(project_id) if project_id else {}
        output_dir = "output/exports"
        files: Dict[str, str] = {}

        if job_type == "memo":
            memo_sections = payload.get("memo_sections") or [
                "Executive Summary",
                "Investment Highlights",
            ]
            files = generate_investment_memo(output_dir, project or {}, memo_sections)
        elif job_type == "ic_deck":
            slides = payload.get("slides") or ["Deal Overview", "Market Context", "Underwriting"]
            files = generate_ic_deck(output_dir, project or {}, slides)
        elif job_type == "underwriting_packet":
            assumptions = payload.get("assumptions") or {}
            results = payload.get("results") or {}
            files = generate_underwriting_packet(output_dir, project or {}, assumptions, results)
        elif job_type == "dd_report":
            items = payload.get("items") or []
            files = generate_dd_report(output_dir, project or {}, items)
        else:
            raise ValueError(f"Unsupported export type: {job_type}")

        await db.update_export_job(
            job_id,
            {
                "status": "complete",
                "output_files": [{"path": path, "label": key} for key, path in files.items()],
                "completed_at": datetime.utcnow().isoformat(),
                "errors": None,
            },
        )
    except Exception as exc:  # pylint: disable=broad-exception-caught
        raise RuntimeError(f"Export job failed: {exc}") from exc


@app.post("/exports")
async def create_export_job(request: ExportJobRequest, request_context: Request):
    """Create an export job"""
    payload = dict(request.payload)
    payload["project_id"] = request.project_id
    if request.room_id:
        payload["room_id"] = request.room_id
    job = await db.create_export_job(
        {
            "project_id": request.project_id,
            "room_id": request.room_id,
            "type": request.type,
            "status": "queued",
            "payload": payload,
            "output_files": [],
        }
    )
    job_id = job.get("id")
    if not job_id:
        raise HTTPException(status_code=500, detail="Failed to create export job")
    job_queue: JobQueue | None = getattr(request_context.app.state, "job_queue", None)
    if not job_queue:
        raise HTTPException(status_code=500, detail="Job queue unavailable")
    await job_queue.enqueue(
        "export", {"job_id": job_id, "job_type": request.type, "payload": payload}
    )
    return {"job": job}


@app.get("/exports/{job_id}")
async def get_export_job(job_id: str):
    """Get export job status"""
    job = await db.get_export_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Export job not found")
    return {"job": job}


# ============================================
# Tone Profiles
# ============================================


@app.post("/tone-profiles")
async def create_tone_profile(request: ToneProfileRequest):
    """Create tone profile"""
    profile = await db.create_tone_profile(request.model_dump())
    return {"profile": profile}


@app.get("/tone-profiles")
async def list_tone_profiles():
    """List tone profiles"""
    profiles = await db.list_tone_profiles()
    return {"profiles": profiles}


@app.post("/user-settings")
async def upsert_user_settings(request: UserSettingsRequest):
    """Upsert user settings"""
    settings_record = await db.upsert_user_settings(request.model_dump())
    return {"settings": settings_record}


# ============================================
# Main Entry Point
# ============================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.is_development,
        log_level=settings.app_log_level.lower(),
    )
