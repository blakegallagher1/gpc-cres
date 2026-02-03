"""
Gallagher Property Company - AI Agent System API
FastAPI Application
"""

import asyncio
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config.settings import settings
from models.schemas import AgentOutput, Document, Project, ProjectStatus, PropertyType, Task
from tools.database import db
from workflows.runner import (
    evaluate_project,
    quick_research,
    quick_underwrite,
    run_development_workflow,
    workflow_runner,
)

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
    yield
    # Shutdown
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
    """,
    version="1.0.0",
    lifespan=lifespan,
)

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


@app.post("/agents/{agent_name}")
async def run_single_agent(agent_name: str, request: AgentQueryRequest):
    """
    Run a single agent directly

    Available agents: research, finance, legal, design, operations, marketing, risk
    """
    valid_agents = [
        "research",
        "finance",
        "legal",
        "design",
        "operations",
        "marketing",
        "risk",
        "coordinator",
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
# Agent Output Endpoints
# ============================================


@app.get("/projects/{project_id}/outputs")
async def get_agent_outputs(project_id: str, agent_name: Optional[str] = None):
    """Get agent outputs for a project"""
    outputs = await db.get_agent_outputs(project_id, agent_name)
    return {"outputs": outputs}


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
