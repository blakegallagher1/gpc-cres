"""
Gallagher Property Company - Entitlements & Permits Agent
"""

from functools import partial
from typing import Any, Dict, Optional

from agents import Agent, WebSearchTool
from agents import function_tool as base_function_tool
from pydantic import BaseModel, Field

from config.settings import settings
from prompts.agent_prompts import ENTITLEMENTS_PROMPT
from tools.database import db

function_tool = partial(base_function_tool, strict_mode=False)


class CreatePermitRecordInput(BaseModel):
    """Input for creating a permit record"""

    project_id: Optional[str] = None
    permit_type: str
    authority: Optional[str] = None
    status: str = "pending"
    dates: Dict[str, Any] = Field(default_factory=dict)
    permit_category: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None


class AnalyzeZoningInput(BaseModel):
    """Input for zoning/entitlements analysis"""

    project_id: Optional[str] = None
    parcel_id: Optional[str] = None
    proposed_use: str
    zoning_code: Optional[str] = None
    constraints: Dict[str, Any] = Field(default_factory=dict)


class IngestAgendaItemInput(BaseModel):
    """Input for agenda item ingestion"""

    body: str
    date: str
    topic: str
    source: Optional[str] = None
    jurisdiction: Optional[str] = None


class IngestPolicyChangeInput(BaseModel):
    """Input for policy change ingestion"""

    body: str
    effective_date: str
    source: Optional[str] = None
    jurisdiction: Optional[str] = None


class SaveEntitlementsSummaryInput(BaseModel):
    """Input for saving entitlements summary"""

    project_id: Optional[str] = None
    summary: str
    recommendation: str
    confidence: str = "medium"
    supporting_data: Dict[str, Any] = Field(default_factory=dict)


@function_tool
async def create_permit_record(input_data: CreatePermitRecordInput) -> Dict[str, Any]:
    """
    Create a permit record

    Args:
        input_data: Permit details

    Returns:
        Created permit
    """
    record = {
        "project_id": input_data.project_id,
        "permit_type": input_data.permit_type,
        "issuing_authority": input_data.authority,
        "status": input_data.status,
        "dates": input_data.dates,
        "permit_category": input_data.permit_category,
        "priority": input_data.priority,
        "notes": input_data.notes,
    }
    permit = await db.create_permit_record(record)
    return {"permit": permit}


@function_tool
async def analyze_zoning_entitlements(input_data: AnalyzeZoningInput) -> Dict[str, Any]:
    """
    Analyze zoning and entitlements

    Args:
        input_data: Zoning inputs

    Returns:
        Zoning analysis record
    """
    analysis = {
        "project_id": input_data.project_id,
        "parcel_id": input_data.parcel_id,
        "proposed_use": input_data.proposed_use,
        "zoning_code": input_data.zoning_code,
        "constraints": input_data.constraints,
    }
    stored = await db.create_zoning_analysis(analysis)
    return {"analysis": stored}


@function_tool
async def ingest_agenda_item(input_data: IngestAgendaItemInput) -> Dict[str, Any]:
    """
    Ingest an entitlement agenda item

    Args:
        input_data: Agenda item details

    Returns:
        Stored agenda item
    """
    record = {
        "body": input_data.body,
        "date": input_data.date,
        "topic": input_data.topic,
        "source": input_data.source,
        "jurisdiction": input_data.jurisdiction,
    }
    stored = await db.create_agenda_item(record)
    return {"agenda_item": stored}


@function_tool
async def ingest_policy_change(input_data: IngestPolicyChangeInput) -> Dict[str, Any]:
    """
    Ingest a policy change

    Args:
        input_data: Policy change details

    Returns:
        Stored policy change
    """
    record = {
        "body": input_data.body,
        "effective_date": input_data.effective_date,
        "source": input_data.source,
        "jurisdiction": input_data.jurisdiction,
    }
    stored = await db.create_policy_change(record)
    return {"policy_change": stored}


@function_tool
async def save_entitlements_summary(input_data: SaveEntitlementsSummaryInput) -> Dict[str, Any]:
    """Save entitlements summary to agent_outputs"""
    output = await db.save_agent_output(
        {
            "project_id": input_data.project_id,
            "agent_name": "entitlements",
            "task_type": "entitlements_summary",
            "input_data": {},
            "output_data": {
                "summary": input_data.summary,
                "recommendation": input_data.recommendation,
                "supporting_data": input_data.supporting_data,
            },
            "confidence": input_data.confidence,
        }
    )
    return {"saved": True, "output": output}


# Agent definition

entitlements_agent = Agent(
    name="Entitlements & Permits",
    instructions=ENTITLEMENTS_PROMPT,
    tools=[
        create_permit_record,
        analyze_zoning_entitlements,
        ingest_agenda_item,
        ingest_policy_change,
        save_entitlements_summary,
        WebSearchTool(),
    ],
    model=settings.openai.flagship_model,
)
