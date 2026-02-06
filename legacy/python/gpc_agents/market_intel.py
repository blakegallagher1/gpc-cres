"""
Gallagher Property Company - Market Intelligence Agent
"""

from functools import partial
from typing import Any, Dict

from agents import Agent, WebSearchTool
from agents import function_tool as base_function_tool
from pydantic import BaseModel, Field

from config.settings import settings
from prompts.agent_prompts import MARKET_INTEL_PROMPT
from tools.database import db

function_tool = partial(base_function_tool, strict_mode=False)


class IngestCompetitorTransactionInput(BaseModel):
    """Input for competitor transaction ingestion"""

    payload: Dict[str, Any] = Field(default_factory=dict)


class IngestEconomicIndicatorInput(BaseModel):
    """Input for economic indicator ingestion"""

    payload: Dict[str, Any] = Field(default_factory=dict)


class IngestInfrastructureProjectInput(BaseModel):
    """Input for infrastructure project ingestion"""

    payload: Dict[str, Any] = Field(default_factory=dict)


class IngestAbsorptionDataInput(BaseModel):
    """Input for absorption data ingestion"""

    payload: Dict[str, Any] = Field(default_factory=dict)


class GenerateMarketSnapshotInput(BaseModel):
    """Input for market snapshot"""

    region: str
    property_type: str


@function_tool
async def ingest_competitor_transaction(
    input_data: IngestCompetitorTransactionInput,
) -> Dict[str, Any]:
    """
    Ingest a competitor transaction

    Args:
        input_data: Transaction payload

    Returns:
        Stored transaction
    """
    record = await db.create_competitor_transaction(input_data.payload)
    return {"transaction": record}


@function_tool
async def ingest_economic_indicator(input_data: IngestEconomicIndicatorInput) -> Dict[str, Any]:
    """
    Ingest an economic indicator

    Args:
        input_data: Indicator payload

    Returns:
        Stored indicator
    """
    record = await db.create_economic_indicator(input_data.payload)
    return {"indicator": record}


@function_tool
async def ingest_infrastructure_project(
    input_data: IngestInfrastructureProjectInput,
) -> Dict[str, Any]:
    """
    Ingest an infrastructure project

    Args:
        input_data: Project payload

    Returns:
        Stored project
    """
    record = await db.create_infrastructure_project(input_data.payload)
    return {"infrastructure_project": record}


@function_tool
async def ingest_absorption_data(input_data: IngestAbsorptionDataInput) -> Dict[str, Any]:
    """
    Ingest absorption metrics

    Args:
        input_data: Absorption payload

    Returns:
        Stored absorption data
    """
    record = await db.create_absorption_metric(input_data.payload)
    return {"absorption": record}


@function_tool
async def generate_market_snapshot(input_data: GenerateMarketSnapshotInput) -> Dict[str, Any]:
    """
    Generate a market snapshot for a region and property type

    Args:
        input_data: Region and property type

    Returns:
        Snapshot summary
    """
    competitors = await db.list_competitor_transactions(input_data.region, input_data.property_type)
    indicators = await db.list_economic_indicators(input_data.region)
    infrastructure = await db.list_infrastructure_projects(input_data.region)
    absorption = await db.list_absorption_metrics(input_data.region, input_data.property_type)

    summary = {
        "region": input_data.region,
        "property_type": input_data.property_type,
        "competitor_transactions": competitors,
        "economic_indicators": indicators,
        "infrastructure_projects": infrastructure,
        "absorption_metrics": absorption,
    }

    return summary


# Agent definition

market_intel_agent = Agent(
    name="Market Intelligence",
    instructions=MARKET_INTEL_PROMPT,
    tools=[
        ingest_competitor_transaction,
        ingest_economic_indicator,
        ingest_infrastructure_project,
        ingest_absorption_data,
        generate_market_snapshot,
        WebSearchTool(),
    ],
    model=settings.openai.flagship_model,
)
