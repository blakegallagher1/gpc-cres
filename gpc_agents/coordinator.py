"""
Gallagher Property Company - Coordinator Agent
"""

from functools import partial
from typing import Any, Dict, Optional

from agents import Agent, WebSearchTool
from agents import function_tool as base_function_tool
from pydantic import BaseModel

from config.settings import settings
from prompts.agent_prompts import COORDINATOR_PROMPT
from tools.database import db

function_tool = partial(base_function_tool, strict_mode=False)


class ProjectStatusInput(BaseModel):
    """Input for getting project status"""

    project_id: str


class UpdateProjectInput(BaseModel):
    """Input for updating project state"""

    project_id: str
    updates: Dict[str, Any]


class CreateTaskInput(BaseModel):
    """Input for creating a task"""

    project_id: str
    title: str
    description: Optional[str] = None
    assigned_agent: Optional[str] = None
    due_date: Optional[str] = None


@function_tool
async def get_project_status(input_data: ProjectStatusInput) -> Dict[str, Any]:
    """
    Fetch project status from database

    Args:
        input_data: ProjectStatusInput with project_id

    Returns:
        Project data including status, tasks, and recent agent outputs
    """
    project = await db.get_project(input_data.project_id)
    if not project:
        return {"error": "Project not found"}

    # Get related data
    tasks = await db.get_project_tasks(input_data.project_id)
    recent_outputs = await db.get_agent_outputs(input_data.project_id)

    return {
        "project": project,
        "tasks": tasks,
        "recent_outputs": recent_outputs[:5],  # Last 5 outputs
    }


@function_tool
async def update_project_state(input_data: UpdateProjectInput) -> Dict[str, Any]:
    """
    Update project state in database

    Args:
        input_data: UpdateProjectInput with project_id and updates

    Returns:
        Updated project data
    """
    updated = await db.update_project(input_data.project_id, input_data.updates)
    return updated or {"error": "Failed to update project"}


@function_tool
async def create_task(input_data: CreateTaskInput) -> Dict[str, Any]:
    """
    Create a new task in the database

    Args:
        input_data: CreateTaskInput with task details

    Returns:
        Created task data
    """
    task_data = {
        "project_id": input_data.project_id,
        "title": input_data.title,
        "description": input_data.description,
        "assigned_agent": input_data.assigned_agent,
        "status": "pending",
    }
    if input_data.due_date:
        task_data["due_date"] = input_data.due_date

    task = await db.create_task(task_data)
    return task or {"error": "Failed to create task"}


@function_tool
async def route_to_agents(query: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Analyze query and determine which agents should handle it

    Args:
        query: User's request/query
        context: Optional project context

    Returns:
        Routing decision with primary and supporting agents
    """
    _ = context
    query_lower = query.lower()

    # Define routing rules
    routing_map = {
        "research": {
            "keywords": [
                "find land",
                "parcel",
                "market",
                "comparable",
                "comp",
                "demographic",
                "research",
            ],
            "primary": "research_agent",
            "supporting": ["risk_agent", "finance_agent"],
        },
        "finance": {
            "keywords": [
                "finance",
                "underwrite",
                "pro forma",
                "irr",
                "returns",
                "cash flow",
                "loan",
                "debt",
                "equity",
            ],
            "primary": "finance_agent",
            "supporting": ["legal_agent", "risk_agent"],
        },
        "legal": {
            "keywords": [
                "contract",
                "agreement",
                "lease",
                "zoning",
                "permit",
                "entitlement",
                "legal",
            ],
            "primary": "legal_agent",
            "supporting": ["finance_agent", "research_agent"],
        },
        "design": {
            "keywords": [
                "design",
                "site plan",
                "building",
                "layout",
                "architecture",
                "programming",
            ],
            "primary": "design_agent",
            "supporting": ["legal_agent", "research_agent"],
        },
        "operations": {
            "keywords": [
                "construction",
                "schedule",
                "contractor",
                "budget tracking",
                "project status",
            ],
            "primary": "operations_agent",
            "supporting": ["finance_agent", "risk_agent"],
        },
        "marketing": {
            "keywords": ["market", "lease up", "sale", "disposition", "offering memo", "listing"],
            "primary": "marketing_agent",
            "supporting": ["research_agent", "finance_agent"],
        },
        "tax": {
            "keywords": [
                "tax",
                "irc",
                "irs",
                "depreciation",
                "1031",
                "basis",
                "recapture",
                "capital gains",
                "salt",
            ],
            "primary": "tax_strategist_agent",
            "supporting": ["finance_agent", "legal_agent"],
        },
        "risk": {
            "keywords": ["risk", "flood", "environmental", "insurance", "assessment"],
            "primary": "risk_agent",
            "supporting": ["research_agent", "finance_agent", "legal_agent"],
        },
    }

    # Score each category
    scores: Dict[str, int] = {}
    for category, config in routing_map.items():
        score = sum(1 for kw in config["keywords"] if kw in query_lower)
        if score > 0:
            scores[category] = score

    # Determine primary and supporting agents
    if scores:
        primary_category = max(scores, key=lambda k: scores[k])
        routing = routing_map[primary_category]
        return {
            "primary_agent": routing["primary"],
            "supporting_agents": routing["supporting"],
            "reasoning": f"Query matched '{primary_category}' category with score {scores[primary_category]}",
            "all_scores": scores,
        }

    # Default to full evaluation
    return {
        "primary_agent": "research_agent",
        "supporting_agents": ["risk_agent", "finance_agent", "legal_agent", "design_agent"],
        "reasoning": "No specific category matched; conducting comprehensive evaluation",
        "all_scores": {},
    }


# Coordinator Agent definition
# Note: Handoffs to other agents will be configured after all agents are defined
coordinator_agent = Agent(
    name="Coordinator",
    model=settings.openai.flagship_model,  # gpt-5.2 for complex orchestration
    instructions=COORDINATOR_PROMPT,
    tools=[
        get_project_status,
        update_project_state,
        create_task,
        route_to_agents,
        WebSearchTool(),  # OpenAI built-in
    ],
    # Handoffs will be added after all agents are defined
    handoffs=[],
)
