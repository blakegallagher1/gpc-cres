"""
Gallagher Property Company - Due Diligence Agent
"""

from functools import partial
from typing import Any, Dict, List, Optional

from agents import Agent, WebSearchTool
from agents import function_tool as base_function_tool
from pydantic import BaseModel, Field

from config.settings import settings
from prompts.agent_prompts import DUE_DILIGENCE_PROMPT
from tools.database import db

function_tool = partial(base_function_tool, strict_mode=False)


class CreateDdDealInput(BaseModel):
    """Input for creating a due diligence deal"""

    project_id: Optional[str] = None
    name: str
    status: str = "open"
    key_dates: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class IngestDdDocumentInput(BaseModel):
    """Input for ingesting a due diligence document"""

    dd_deal_id: str
    document_type: str
    title: Optional[str] = None
    storage_ref: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class GenerateDdChecklistInput(BaseModel):
    """Input for generating a due diligence checklist"""

    dd_deal_id: str
    property_type: str
    phase: str


class FlagDdRedFlagsInput(BaseModel):
    """Input for recording red flags"""

    dd_deal_id: str
    findings: List[Dict[str, Any]] = Field(default_factory=list)


class SaveDdSummaryInput(BaseModel):
    """Input for saving DD summary"""

    project_id: Optional[str] = None
    dd_deal_id: Optional[str] = None
    summary: str
    recommendation: str
    confidence: str = "medium"
    supporting_data: Dict[str, Any] = Field(default_factory=dict)


_CHECKLIST_TEMPLATES = {
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


def _build_checklist(property_type: str, phase: str) -> List[Dict[str, Any]]:
    base_items = _CHECKLIST_TEMPLATES.get(phase.lower(), _CHECKLIST_TEMPLATES["acquisition"])
    return [
        {
            "phase": phase,
            "name": item,
            "status": "pending",
            "metadata": {"property_type": property_type},
        }
        for item in base_items
    ]


@function_tool
async def create_dd_deal(input_data: CreateDdDealInput) -> Dict[str, Any]:
    """
    Create a new due diligence deal record

    Args:
        input_data: Deal metadata

    Returns:
        Created deal record
    """
    record = {
        "project_id": input_data.project_id,
        "name": input_data.name,
        "status": input_data.status,
        "key_dates": input_data.key_dates,
        "metadata": input_data.metadata,
    }
    deal = await db.create_dd_deal(record)
    return {"deal": deal}


@function_tool
async def ingest_dd_document(input_data: IngestDdDocumentInput) -> Dict[str, Any]:
    """
    Ingest a due diligence document

    Args:
        input_data: Document metadata

    Returns:
        Created document record
    """
    record = {
        "dd_deal_id": input_data.dd_deal_id,
        "document_type": input_data.document_type,
        "title": input_data.title,
        "storage_ref": input_data.storage_ref,
        "metadata": input_data.metadata,
    }
    doc = await db.add_dd_document(record)
    return {"document": doc}


@function_tool
async def generate_dd_checklist(input_data: GenerateDdChecklistInput) -> Dict[str, Any]:
    """
    Generate a due diligence checklist

    Args:
        input_data: DD deal, property type, and phase

    Returns:
        Checklist items inserted
    """
    items = _build_checklist(input_data.property_type, input_data.phase)
    stored = await db.add_dd_checklist_items(input_data.dd_deal_id, items)
    return {"items": stored, "count": len(stored)}


@function_tool
async def flag_dd_red_flags(input_data: FlagDdRedFlagsInput) -> Dict[str, Any]:
    """
    Record red flags for a DD deal

    Args:
        input_data: Findings list

    Returns:
        Red flags inserted
    """
    normalized = []
    for finding in input_data.findings:
        description = finding.get("description") or finding.get("details") or finding.get("title")
        normalized.append(
            {
                "dd_deal_id": input_data.dd_deal_id,
                "severity": finding.get("severity", "medium"),
                "description": description,
                "category": finding.get("category"),
                "status": finding.get("status", "open"),
                "metadata": {
                    "title": finding.get("title"),
                    "details": finding.get("details"),
                    "source": finding.get("source"),
                },
            }
        )
    flags = await db.add_dd_red_flags(input_data.dd_deal_id, normalized)
    return {"red_flags": flags, "count": len(flags)}


@function_tool
async def save_dd_summary(input_data: SaveDdSummaryInput) -> Dict[str, Any]:
    """Save DD summary to agent_outputs"""
    output = await db.save_agent_output(
        {
            "project_id": input_data.project_id,
            "agent_name": "due_diligence",
            "task_type": "dd_summary",
            "input_data": {"dd_deal_id": input_data.dd_deal_id},
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

due_diligence_agent = Agent(
    name="Due Diligence",
    instructions=DUE_DILIGENCE_PROMPT,
    tools=[
        create_dd_deal,
        ingest_dd_document,
        generate_dd_checklist,
        flag_dd_red_flags,
        save_dd_summary,
        WebSearchTool(),
    ],
    model=settings.openai.flagship_model,
)
