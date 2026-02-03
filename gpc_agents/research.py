"""
Gallagher Property Company - Research Agent
"""

from functools import partial
from typing import Any, Dict, List, Optional, cast

from agents import Agent
from agents import function_tool as base_function_tool
from pydantic import BaseModel

from config.settings import settings
from prompts.agent_prompts import RESEARCH_PROMPT
from tools.database import db
from tools.external_apis import gmaps, perplexity

function_tool = partial(base_function_tool, strict_mode=False)


class SearchParcelsInput(BaseModel):
    """Input for parcel search"""

    location: str
    min_acres: float = 0
    max_acres: float = 1000
    zoning_codes: Optional[List[str]] = None
    max_price: Optional[float] = None


class GetMarketDataInput(BaseModel):
    """Input for market data retrieval"""

    submarket: str
    property_type: str


class AnalyzeComparablesInput(BaseModel):
    """Input for comparable analysis"""

    subject_address: str
    property_type: str
    search_radius_miles: float = 3.0


class ResearchParcelInput(BaseModel):
    """Input for comprehensive parcel research"""

    address: str
    parcel_id: Optional[str] = None
    property_type: Optional[str] = None


@function_tool
async def search_parcels(input_data: SearchParcelsInput) -> Dict[str, Any]:
    """
    Search for available parcels matching criteria using Perplexity

    Args:
        input_data: Search criteria

    Returns:
        List of matching parcels with details
    """
    query = f"""
    Find available commercial real estate parcels for sale in {input_data.location}
    between {input_data.min_acres} and {input_data.max_acres} acres.
    """

    if input_data.zoning_codes:
        query += f" Zoning: {', '.join(input_data.zoning_codes)}."
    if input_data.max_price:
        query += f" Maximum price: ${input_data.max_price:,.0f}."

    query += """
    For each parcel found, provide:
    1. Address and parcel ID
    2. Size in acres
    3. Asking price
    4. Zoning designation
    5. Current use
    6. Contact information
    7. Listing source

    Focus on properties suitable for mobile home parks, flex industrial, or small commercial development.
    """

    result = await perplexity.search(query, search_recency_filter="month")

    return {
        "search_criteria": input_data.model_dump(),
        "results": result["answer"],
        "sources": result["citations"],
        "confidence": "medium",
    }


@function_tool
async def get_market_data(input_data: GetMarketDataInput) -> Dict[str, Any]:
    """
    Retrieve current market metrics for a submarket

    Args:
        input_data: Submarket and property type

    Returns:
        Market metrics including vacancy, rents, absorption
    """
    result = await perplexity.research_market(
        submarket=input_data.submarket, property_type=input_data.property_type
    )

    return {
        "submarket": input_data.submarket,
        "property_type": input_data.property_type,
        "market_data": result["answer"],
        "sources": result["citations"],
        "data_date": "current",
        "confidence": "high",
    }


@function_tool
async def analyze_comparables(input_data: AnalyzeComparablesInput) -> Dict[str, Any]:
    """
    Find and analyze comparable properties

    Args:
        input_data: Subject property details

    Returns:
        Comparable sales and leases with adjustments
    """
    result = await perplexity.research_comparables(
        address=input_data.subject_address,
        property_type=input_data.property_type,
        radius_miles=input_data.search_radius_miles,
    )

    return {
        "subject_address": input_data.subject_address,
        "property_type": input_data.property_type,
        "search_radius": input_data.search_radius_miles,
        "comparables": result["answer"],
        "sources": result["citations"],
        "confidence": "medium",
    }


@function_tool
async def research_parcel(input_data: ResearchParcelInput) -> Dict[str, Any]:
    """
    Comprehensive parcel research combining multiple data sources

    Args:
        input_data: Parcel address and optional details

    Returns:
        Complete research report with parcel attributes, market context, and comparables
    """
    # Parallel data gathering
    parcel_research = await perplexity.research_parcel(
        address=input_data.address, parcel_id=input_data.parcel_id
    )

    location_analysis = await gmaps.analyze_location_access(
        address=input_data.address, property_type=input_data.property_type or "mobile_home_park"
    )

    return {
        "address": input_data.address,
        "parcel_research": parcel_research["answer"],
        "location_analysis": location_analysis,
        "sources": parcel_research["citations"],
        "recommendation": (
            "See detailed analysis above. Review flood zone, zoning compliance, and market "
            "demand before proceeding."
        ),
        "confidence": "high",
    }


@function_tool
async def get_location_analysis(address: str, property_type: str) -> Dict[str, Any]:
    """
    Analyze location accessibility and nearby amenities

    Args:
        address: Property address
        property_type: Type of property for context

    Returns:
        Location analysis with nearby amenities
    """
    return await gmaps.analyze_location_access(address, property_type)


@function_tool
async def save_research_output(project_id: str, research_data: Dict[str, Any]) -> Dict[str, Any]:
    """Save research output to database"""
    output = await db.save_agent_output(
        {
            "project_id": project_id,
            "agent_name": "research_agent",
            "task_type": research_data.get("task_type", "research"),
            "input_data": research_data.get("input", {}),
            "output_data": research_data.get("output", {}),
            "confidence": research_data.get("confidence", "medium"),
            "sources": research_data.get("sources", []),
        }
    )
    return output or {"status": "saved"}


# Research Agent definition
research_agent = Agent(
    name="Research Agent",
    model=settings.openai.standard_model,  # gpt-5.1 for research tasks
    instructions=RESEARCH_PROMPT,
    tools=[
        search_parcels,
        get_market_data,
        analyze_comparables,
        research_parcel,
        get_location_analysis,
        save_research_output,
        cast(Any, {"type": "web_search"}),  # OpenAI built-in for quick lookups
    ],
    handoffs=[],  # Will be configured after all agents defined
)
