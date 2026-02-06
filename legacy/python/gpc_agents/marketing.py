"""
Gallagher Property Company - Marketing Agent
"""

from datetime import date
from decimal import Decimal
from functools import partial
from typing import Any, Dict, List, Optional

from agents import Agent, WebSearchTool
from agents import function_tool as base_function_tool
from pydantic import BaseModel

from config.settings import settings
from prompts.agent_prompts import MARKETING_PROMPT
from tools.database import db

function_tool = partial(base_function_tool, strict_mode=False)


class CreateMarketingPlanInput(BaseModel):
    """Input for marketing plan creation"""

    property_data: Dict[str, Any]
    objectives: Dict[str, Any]
    budget: float


class GenerateListingInput(BaseModel):
    """Input for property listing generation"""

    property_data: Dict[str, Any]
    platform: str  # costar, loopnet, crexi, company_website


class AnalyzeProspectsInput(BaseModel):
    """Input for prospect analysis"""

    property_id: str
    prospect_data: Optional[List[Dict]] = None


class CreateOfferingMemoInput(BaseModel):
    """Input for offering memorandum creation"""

    property_data: Dict[str, Any]
    financials: Dict[str, Any]
    photos: Optional[List[str]] = None


# Platform-specific listing formats
LISTING_TEMPLATES = {
    "costar": {
        "max_length": 2000,
        "sections": ["headline", "description", "highlights", "location"],
        "format": "professional",
    },
    "loopnet": {
        "max_length": 1500,
        "sections": ["headline", "description", "features"],
        "format": "professional",
    },
    "crexi": {
        "max_length": 3000,
        "sections": ["overview", "investment_highlights", "property_details", "market"],
        "format": "detailed",
    },
    "company_website": {
        "max_length": 5000,
        "sections": ["overview", "features", "location", "financials", "contact"],
        "format": "comprehensive",
    },
}


@function_tool
async def create_marketing_plan(input_data: CreateMarketingPlanInput) -> Dict[str, Any]:
    """
    Create comprehensive marketing plan

    Args:
        input_data: Property data, objectives, and budget

    Returns:
        Marketing plan with channels, timeline, and budget allocation
    """
    property_data = input_data.property_data
    objectives = input_data.objectives
    budget = Decimal(input_data.budget)

    campaign_type = objectives.get("campaign_type", "lease_up")
    target_launch = objectives.get("target_launch_date", date.today().isoformat())

    # Define marketing channels based on property type and campaign
    channels = []

    # Digital marketing
    digital_budget = budget * Decimal(0.35)
    channels.append(
        {
            "channel_name": "Digital Marketing",
            "budget": float(digital_budget),
            "timeline": "Months 1-6",
            "tactics": [
                "CoStar/LoopNet premium listings",
                "Crexi marketplace listing",
                "Targeted email campaigns",
                "LinkedIn advertising",
                "Google Ads geotargeted campaign",
            ],
            "kpis": ["Impressions", "Click-through rate", "Leads generated", "Cost per lead"],
        }
    )

    # Broker outreach
    broker_budget = budget * Decimal(0.30)
    channels.append(
        {
            "channel_name": "Broker Network",
            "budget": float(broker_budget),
            "timeline": "Months 1-3",
            "tactics": [
                "Broker open house events",
                "Commission incentives",
                "Direct broker outreach",
                "Market email blasts",
            ],
            "kpis": ["Broker attendance", "Showings generated", "Deals from brokers"],
        }
    )

    # Signage
    signage_budget = budget * Decimal(0.15)
    channels.append(
        {
            "channel_name": "Signage",
            "budget": float(signage_budget),
            "timeline": "Month 1",
            "tactics": [
                "Monument sign design & installation",
                "Directional signs",
                "Banners",
                "Site branding",
            ],
            "kpis": ["Drive-by inquiries", "Brand awareness"],
        }
    )

    # Collateral
    collateral_budget = budget * Decimal(0.10)
    channels.append(
        {
            "channel_name": "Marketing Collateral",
            "budget": float(collateral_budget),
            "timeline": "Month 1-2",
            "tactics": [
                "Offering memorandum",
                "Property brochure",
                "Fact sheet",
                "Virtual tour/video",
            ],
            "kpis": ["Materials distributed", "Engagement rate"],
        }
    )

    # Events
    events_budget = budget * Decimal(0.10)
    channels.append(
        {
            "channel_name": "Events",
            "budget": float(events_budget),
            "timeline": "Months 2-4",
            "tactics": [
                "Grand opening event",
                "Broker appreciation event",
                "Targeted prospect tours",
            ],
            "kpis": ["Attendance", "Leads generated", "Deals closed"],
        }
    )

    # Success metrics
    success_metrics = {
        "target_leads_monthly": objectives.get("target_leads", 20),
        "target_tours_monthly": objectives.get("target_tours", 8),
        "target_conversion_rate": objectives.get("target_conversion", 0.25),
        "target_time_to_lease_months": objectives.get("target_time", 6),
    }

    return {
        "property_name": property_data.get("name"),
        "campaign_type": campaign_type,
        "target_launch_date": target_launch,
        "market_analysis": {
            "target_market": objectives.get("target_market", "To be defined"),
            "competition_summary": "Competitive analysis to be completed",
            "pricing_strategy": objectives.get("pricing_strategy", "Market rate"),
        },
        "marketing_mix": channels,
        "total_budget": float(budget),
        "success_metrics": success_metrics,
        "creative_requirements": [
            {"deliverable": "Offering Memorandum", "due_date": "Week 2", "status": "pending"},
            {"deliverable": "Property Photos", "due_date": "Week 1", "status": "pending"},
            {"deliverable": "Website Listing", "due_date": "Week 2", "status": "pending"},
            {"deliverable": "Signage", "due_date": "Week 3", "status": "pending"},
            {"deliverable": "Virtual Tour", "due_date": "Week 4", "status": "pending"},
        ],
        "timeline": _generate_marketing_timeline(target_launch, campaign_type),
        "confidence": "medium",
    }


def _generate_marketing_timeline(launch_date: str, campaign_type: str) -> List[Dict]:
    """Generate marketing timeline"""
    _ = launch_date
    timeline = []

    if campaign_type == "lease_up":
        timeline = [
            {
                "phase": "Pre-Launch",
                "weeks": "1-2",
                "activities": ["Finalize collateral", "Install signage", "List on platforms"],
            },
            {
                "phase": "Launch",
                "weeks": "3-4",
                "activities": ["Grand opening", "Broker events", "Digital campaign start"],
            },
            {
                "phase": "Active Marketing",
                "weeks": "5-16",
                "activities": ["Ongoing tours", "Broker outreach", "Digital optimization"],
            },
            {
                "phase": "Lease-Up",
                "weeks": "17-24",
                "activities": ["Targeted campaigns", "Incentive offers", "Renewal outreach"],
            },
            {
                "phase": "Stabilization",
                "weeks": "25+",
                "activities": ["Reduce marketing spend", "Focus on renewals"],
            },
        ]
    elif campaign_type == "sale":
        timeline = [
            {
                "phase": "Preparation",
                "weeks": "1-2",
                "activities": ["Offering memo", "Financial package", "Market analysis"],
            },
            {
                "phase": "Go-to-Market",
                "weeks": "3-4",
                "activities": ["List on platforms", "Broker outreach", "Confidential marketing"],
            },
            {
                "phase": "Marketing",
                "weeks": "5-12",
                "activities": ["Tours", "Due diligence", "Offers"],
            },
            {
                "phase": "Closing",
                "weeks": "13-20",
                "activities": ["PSA negotiation", "Due diligence", "Closing"],
            },
        ]

    return timeline


@function_tool
async def generate_listing(input_data: GenerateListingInput) -> Dict[str, Any]:
    """
    Generate platform-specific property listing

    Args:
        input_data: Property data and target platform

    Returns:
        Platform-optimized listing
    """
    property_data = input_data.property_data
    platform = input_data.platform.lower()

    template = LISTING_TEMPLATES.get(platform, LISTING_TEMPLATES["company_website"])

    # Generate headline
    property_type = property_data.get("property_type", "Commercial")
    size = property_data.get("size_sf", 0)
    location = property_data.get("location", "Baton Rouge, LA")

    headline = f"{property_type} Opportunity - {size:,} SF in {location}"

    # Generate description based on property type
    description = _generate_property_description(property_data)

    # Generate highlights
    highlights = _generate_highlights(property_data)

    # Platform-specific formatting
    if platform == "costar":
        listing_text = f"""{headline}

{description}

HIGHLIGHTS:
{chr(10).join("• " + h for h in highlights)}

LOCATION:
{property_data.get('location_description', 'Prime location with excellent access.')}
"""
    elif platform == "crexi":
        listing_text = f"""{headline}

OVERVIEW:
{description}

INVESTMENT HIGHLIGHTS:
{chr(10).join("• " + h for h in highlights)}

PROPERTY DETAILS:
- Property Type: {property_type}
- Building Size: {size:,} SF
- Year Built: {property_data.get('year_built', 'N/A')}
- Occupancy: {property_data.get('occupancy', 'N/A')}%

MARKET OVERVIEW:
{property_data.get('market_description', 'Strong market fundamentals with positive absorption trends.')}
"""
    else:
        listing_text = f"""{headline}

{description}

Key Features:
{chr(10).join("• " + h for h in highlights)}
"""

    return {
        "platform": platform,
        "headline": headline,
        "listing_text": listing_text,
        "character_count": len(listing_text),
        "max_length": template["max_length"],
        "photos_required": property_data.get("photos", []),
        "confidence": "high",
    }


def _generate_property_description(property_data: Dict) -> str:
    """Generate property description"""
    property_type = property_data.get("property_type", "")

    descriptions = {
        "mobile_home park": (
            "Well-maintained mobile home park offering affordable housing in a growing market. "
            "Stable tenant base with strong occupancy history."
        ),
        "flex industrial": (
            "Modern flex industrial space ideal for light manufacturing, distribution, or R&D. "
            "Excellent highway access and functional layout."
        ),
        "multifamily": (
            "Institutional-quality multifamily property in a desirable submarket. "
            "Strong rental demand and professional management."
        ),
        "retail": "Prime retail location with excellent visibility and access. Strong tenant mix and stable cash flow.",
    }

    return descriptions.get(
        property_type.lower(),
        "Prime commercial real estate opportunity with strong investment fundamentals.",
    )


def _generate_highlights(property_data: Dict) -> List[str]:
    """Generate property highlights"""
    highlights = []

    if property_data.get("occupancy"):
        highlights.append(f"{property_data['occupancy']}% Occupancy")

    if property_data.get("cap_rate"):
        highlights.append(f"{property_data['cap_rate']}% Cap Rate")

    if property_data.get("year_built"):
        highlights.append(f"Built in {property_data['year_built']}")

    if property_data.get("highway_access"):
        highlights.append("Excellent Highway Access")

    if property_data.get("recent_renovation"):
        highlights.append("Recently Renovated")

    highlights.append("Professional Management")
    highlights.append("Strong Market Fundamentals")

    return highlights


@function_tool
async def analyze_prospects(input_data: AnalyzeProspectsInput) -> Dict[str, Any]:
    """
    Analyze prospect pipeline and recommend actions

    Args:
        input_data: Property ID and prospect data

    Returns:
        Prospect analysis with recommendations
    """
    prospects = input_data.prospect_data or []

    # Categorize prospects
    by_status: Dict[str, int] = {}
    by_source: Dict[str, int] = {}

    for p in prospects:
        status = p.get("status", "new")
        source = p.get("source", "unknown")

        by_status[status] = by_status.get(status, 0) + 1
        by_source[source] = by_source.get(source, 0) + 1

    # Calculate metrics
    total_prospects = len(prospects)
    hot_prospects = by_status.get("hot", 0) + by_status.get("tour_scheduled", 0)

    # Generate recommendations
    recommendations = []

    if hot_prospects == 0 and total_prospects > 0:
        recommendations.append("No hot prospects - increase follow-up frequency")

    if by_source.get("broker", 0) < 3:
        recommendations.append("Low broker activity - schedule broker events")

    if by_status.get("new", 0) > 5:
        recommendations.append("Backlog of new leads - prioritize follow-up")

    return {
        "property_id": input_data.property_id,
        "summary": {
            "total_prospects": total_prospects,
            "hot_prospects": hot_prospects,
            "by_status": by_status,
            "by_source": by_source,
        },
        "recommendations": recommendations,
        "next_actions": [
            "Follow up with hot prospects within 24 hours",
            "Schedule tours for qualified prospects",
            "Send additional information to warm prospects",
            "Add cold prospects to nurture campaign",
        ],
        "confidence": "medium",
    }


@function_tool
async def create_offering_memo(input_data: CreateOfferingMemoInput) -> Dict[str, Any]:
    """
    Generate investment offering memorandum

    Args:
        input_data: Property data and financials

    Returns:
        Offering memorandum content
    """
    property_data = input_data.property_data
    financials = input_data.financials

    # Generate OM sections
    om = {
        "property_name": property_data.get("name"),
        "property_type": property_data.get("property_type"),
        "address": property_data.get("address"),
        "investment_highlights": [
            f"{financials.get('cap_rate', 'X')}% Going-in Cap Rate",
            f"{financials.get('occupancy', 'X')}% Occupancy",
            "Stable Cash Flow",
            "Growing Market",
            "Value-Add Opportunity" if property_data.get("value_add") else "Core Investment",
        ],
        "property_description": _generate_property_description(property_data),
        "location_highlights": property_data.get(
            "location_description",
            "Strategically located with excellent access to major transportation corridors and amenities.",
        ),
        "financial_summary": {
            "asking_price": financials.get("asking_price"),
            "cap_rate": financials.get("cap_rate"),
            "noi": financials.get("noi"),
            "occupancy": financials.get("occupancy"),
            "avg_rent": financials.get("avg_rent"),
            "total_units": property_data.get("total_units"),
            "total_sf": property_data.get("total_sf"),
        },
        "investment_thesis": [
            "Strong market fundamentals with positive rent growth",
            "Stable tenant base with high renewal rates",
            "Professional management in place",
            "Value appreciation potential in growing submarket",
        ],
        "risk_factors": [
            "Market conditions may affect occupancy and rents",
            "Capital improvements may be required",
            "Interest rate changes may affect exit pricing",
            "Economic downturn could impact tenant demand",
        ],
        "photos": input_data.photos or [],
        "disclaimer": (
            "This offering memorandum is for informational purposes only and does not constitute "
            "an offer to sell or a solicitation of an offer to buy."
        ),
    }

    return {
        "offering_memo": om,
        "format": "structured",
        "sections": list(om.keys()),
        "confidence": "high",
    }


@function_tool
async def save_marketing_output(project_id: str, marketing_data: Dict[str, Any]) -> Dict[str, Any]:
    """Save marketing output to database"""
    output = await db.save_agent_output(
        {
            "project_id": project_id,
            "agent_name": "marketing_agent",
            "task_type": marketing_data.get("task_type", "marketing"),
            "input_data": marketing_data.get("input", {}),
            "output_data": marketing_data.get("output", {}),
            "confidence": marketing_data.get("confidence", "medium"),
        }
    )
    return output or {"status": "saved"}


# Marketing Agent definition
marketing_agent = Agent(
    name="Marketing Agent",
    model=settings.openai.standard_model,  # gpt-5.1 for marketing tasks
    instructions=MARKETING_PROMPT,
    tools=[
        create_marketing_plan,
        generate_listing,
        analyze_prospects,
        create_offering_memo,
        save_marketing_output,
        WebSearchTool(),  # For comp research
    ],
    handoffs=[],  # Will be configured after all agents defined
)
