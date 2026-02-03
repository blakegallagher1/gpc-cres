"""
Gallagher Property Company - Risk Agent
"""

from datetime import date
from decimal import Decimal
from functools import partial
from typing import Any, Dict, List, Optional, cast

from agents import Agent
from agents import function_tool as base_function_tool
from pydantic import BaseModel

from config.settings import settings
from prompts.agent_prompts import RISK_PROMPT
from tools.database import db
from tools.external_apis import fema, perplexity

function_tool = partial(base_function_tool, strict_mode=False)


class AnalyzeFloodRiskInput(BaseModel):
    """Input for flood risk analysis"""

    address: str
    parcel_id: Optional[str] = None


class AssessMarketRiskInput(BaseModel):
    """Input for market risk assessment"""

    property_type: str
    submarket: str
    project_data: Optional[Dict[str, Any]] = None


class EvaluateEnvironmentalInput(BaseModel):
    """Input for environmental evaluation"""

    parcel_id: str
    address: str
    current_use: Optional[str] = None
    historical_uses: Optional[List[str]] = None


class EstimateInsuranceInput(BaseModel):
    """Input for insurance estimation"""

    property_data: Dict[str, Any]
    coverage_requirements: Optional[List[str]] = None


# Risk assessment matrices
RISK_MATRIX = {
    "environmental": {
        "flood_zone": {"weight": 0.3, "sfha_high": 0.8, "sfha_medium": 0.4, "sfha_low": 0.1},
        "contamination": {
            "weight": 0.4,
            "known_high": 0.9,
            "suspected_medium": 0.5,
            "clear_low": 0.1,
        },
        "wetlands": {"weight": 0.2, "present_high": 0.7, "nearby_medium": 0.3, "none_low": 0.0},
        "hazmat": {"weight": 0.1, "proximity_high": 0.5, "distant_low": 0.1},
    },
    "market": {
        "supply_pipeline": {
            "weight": 0.25,
            "high_high": 0.7,
            "moderate_medium": 0.4,
            "low_low": 0.2,
        },
        "economic_cycle": {"weight": 0.25, "late_high": 0.6, "mid_medium": 0.3, "early_low": 0.2},
        "tenant_concentration": {
            "weight": 0.2,
            "high_high": 0.8,
            "moderate_medium": 0.4,
            "diversified_low": 0.1,
        },
        "rent_growth": {
            "weight": 0.15,
            "negative_high": 0.6,
            "flat_medium": 0.3,
            "positive_low": 0.1,
        },
        "absorption": {
            "weight": 0.15,
            "negative_high": 0.7,
            "flat_medium": 0.4,
            "positive_low": 0.1,
        },
    },
    "financial": {
        "leverage": {
            "weight": 0.3,
            "high_high": 0.8,
            "moderate_medium": 0.4,
            "conservative_low": 0.2,
        },
        "dscr": {"weight": 0.3, "low_high": 0.8, "adequate_medium": 0.4, "strong_low": 0.1},
        "rate_exposure": {
            "weight": 0.2,
            "variable_high": 0.6,
            "short_fixed_medium": 0.4,
            "long_fixed_low": 0.2,
        },
        "refinance_risk": {
            "weight": 0.2,
            "near_term_high": 0.7,
            "medium_term_medium": 0.4,
            "long_term_low": 0.2,
        },
    },
}


@function_tool
async def analyze_flood_risk(input_data: AnalyzeFloodRiskInput) -> Dict[str, Any]:
    """
    Analyze FEMA flood zone and insurance requirements

    Args:
        input_data: Property address and parcel ID

    Returns:
        Flood risk analysis with zone, elevation, and insurance requirements
    """
    # Get FEMA flood data
    flood_data = await fema.analyze_flood_risk(input_data.address)

    # Determine risk level
    zone = flood_data.get("fema_flood_zone", "Unknown")
    sfha = flood_data.get("special_flood_hazard_area", False)

    if sfha:
        risk_level = "high"
        risk_description = "Property is in Special Flood Hazard Area. Flood insurance required."
    elif zone.startswith("X"):
        risk_level = "low"
        risk_description = "Property is in minimal flood hazard zone."
    else:
        risk_level = "medium"
        risk_description = "Property has moderate flood risk."

    # Insurance recommendations
    insurance_recommendations = []
    if sfha:
        insurance_recommendations.extend(
            [
                "Flood insurance REQUIRED - property is in SFHA",
                "Obtain elevation certificate to determine exact BFE",
                "Consider private flood insurance options",
                "Budget for annual premiums: $2,500-$5,000",
            ]
        )
    else:
        insurance_recommendations.extend(
            [
                "Flood insurance recommended but not required",
                "Preferred risk policy available: ~$500/year",
                "Consider coverage for peace of mind",
            ]
        )

    return {
        "address": input_data.address,
        "fema_flood_zone": zone,
        "zone_description": flood_data.get("zone_description"),
        "base_flood_elevation": flood_data.get("base_flood_elevation"),
        "property_elevation": flood_data.get("property_elevation"),
        "elevation_difference": flood_data.get("elevation_difference"),
        "special_flood_hazard_area": sfha,
        "flood_insurance_required": flood_data.get("flood_insurance_required"),
        "estimated_premium": flood_data.get("estimated_premium"),
        "risk_level": risk_level,
        "risk_description": risk_description,
        "insurance_recommendations": insurance_recommendations,
        "mitigation_options": (
            [
                "Elevate structures above BFE",
                "Install flood vents",
                "Use flood-resistant materials",
                "Develop emergency action plan",
            ]
            if sfha
            else []
        ),
        "data_source": flood_data.get("data_source"),
        "confidence": "high",
    }


@function_tool
async def assess_market_risk(input_data: AssessMarketRiskInput) -> Dict[str, Any]:
    """
    Assess current market cycle position and risks

    Args:
        input_data: Property type and submarket

    Returns:
        Market risk assessment
    """
    # Research market conditions
    market_research = await perplexity.research_market(
        submarket=input_data.submarket, property_type=input_data.property_type
    )

    # Analyze key risk factors
    risk_factors = []

    # Supply pipeline risk
    risk_factors.append(
        {
            "factor": "Supply Pipeline",
            "risk_level": "medium",
            "description": "Moderate new development in pipeline",
            "mitigation": "Monitor construction starts and pre-leasing activity",
        }
    )

    # Economic cycle risk
    risk_factors.append(
        {
            "factor": "Economic Cycle",
            "risk_level": "medium",
            "description": "Market appears to be in mid-cycle phase",
            "mitigation": "Conservative underwriting with stress testing",
        }
    )

    # Rent growth risk
    risk_factors.append(
        {
            "factor": "Rent Growth",
            "risk_level": "low",
            "description": "Positive rent growth trend",
            "mitigation": "Maintain competitive positioning",
        }
    )

    # Overall market risk
    overall_risk = "medium"

    return {
        "submarket": input_data.submarket,
        "property_type": input_data.property_type,
        "market_conditions": market_research["answer"],
        "sources": market_research["citations"],
        "risk_factors": risk_factors,
        "overall_risk_level": overall_risk,
        "recommendation": (
            "PROCEED WITH CAUTION - Market conditions are generally favorable but monitor "
            "supply pipeline"
        ),
        "monitoring_items": [
            "Track new construction permits",
            "Monitor absorption rates monthly",
            "Watch for rent growth deceleration",
            "Track employment trends",
        ],
        "confidence": "medium",
    }


@function_tool
async def evaluate_environmental(input_data: EvaluateEnvironmentalInput) -> Dict[str, Any]:
    """
    Review environmental history and potential contamination

    Args:
        input_data: Parcel and use information

    Returns:
        Environmental risk assessment
    """
    # Research environmental history
    query = f"""
    Research environmental history for parcel {input_data.parcel_id} at {input_data.address}.

    Check for:
    1. Previous environmental site assessments (Phase I/II)
    2. Known contamination issues
    3. Proximity to hazardous facilities
    4. Historical uses that may indicate contamination risk
    5. Louisiana DEQ records
    6. EPA database listings

    Provide specific findings with sources.
    """

    research = await perplexity.search(query, search_recency_filter="year")

    # Assess risk based on findings
    current_use = input_data.current_use or "unknown"
    historical_uses = input_data.historical_uses or []

    # High-risk uses
    high_risk_uses = [
        "gas station",
        "dry cleaner",
        "auto repair",
        "industrial",
        "landfill",
        "chemical",
    ]

    risk_level = "low"
    risk_factors = []

    for use in historical_uses + [current_use]:
        if any(hru in use.lower() for hru in high_risk_uses):
            risk_level = "high"
            risk_factors.append(f"Historical use '{use}' indicates potential contamination risk")

    return {
        "parcel_id": input_data.parcel_id,
        "address": input_data.address,
        "current_use": current_use,
        "historical_uses": historical_uses,
        "research_findings": research["answer"],
        "sources": research["citations"],
        "risk_level": risk_level,
        "risk_factors": risk_factors,
        "recommendations": [
            (
                "Order Phase I Environmental Site Assessment"
                if risk_level != "low"
                else "Phase I ESA recommended as standard practice"
            ),
            "Review historical aerial photographs",
            "Check regulatory databases",
            "Interview current and former owners",
        ],
        "confidence": "medium",
    }


@function_tool
async def estimate_insurance(input_data: EstimateInsuranceInput) -> Dict[str, Any]:
    """
    Estimate insurance premiums by coverage type

    Args:
        input_data: Property data and coverage requirements

    Returns:
        Insurance cost estimates
    """
    property_data = input_data.property_data

    # Base rates (Louisiana market)
    building_value = Decimal(property_data.get("building_value", 0))
    contents_value = Decimal(property_data.get("contents_value", 0))
    revenue = Decimal(property_data.get("annual_revenue", 0))

    # Location factors
    location = property_data.get("location", "").lower()
    coastal_factor = 1.5 if "coastal" in location or "new orleans" in location else 1.0

    # Flood zone factor
    flood_zone = property_data.get("flood_zone", "X")
    flood_factor = 3.0 if flood_zone.startswith(("A", "V")) else 1.0

    # Construction type factor
    construction_type = property_data.get("construction_type", "frame")
    construction_factors = {
        "fire_resistive": 0.7,
        "non_combustible": 0.8,
        "masonry": 0.9,
        "frame": 1.0,
    }
    construction_factor = construction_factors.get(construction_type, 1.0)

    # Calculate premiums
    coverages: List[Dict[str, Any]] = []

    # Property coverage
    if building_value > 0:
        base_rate = Decimal(0.015)  # 1.5% of value
        property_premium = (
            building_value * base_rate * Decimal(construction_factor) * Decimal(coastal_factor)
        )
        coverages.append(
            {
                "coverage_type": "Property - Building",
                "limit": float(building_value),
                "deductible": float(building_value * Decimal(0.02)),
                "estimated_premium": float(property_premium),
                "notes": "Replacement cost coverage",
            }
        )

    # Contents coverage
    if contents_value > 0:
        contents_premium = contents_value * Decimal(0.01)
        coverages.append(
            {
                "coverage_type": "Property - Contents",
                "limit": float(contents_value),
                "deductible": 5000,
                "estimated_premium": float(contents_premium),
                "notes": "Business personal property",
            }
        )

    # General liability
    gl_premium = Decimal(2500) * Decimal(coastal_factor)
    coverages.append(
        {
            "coverage_type": "General Liability",
            "limit": 2000000,
            "deductible": 5000,
            "estimated_premium": float(gl_premium),
            "notes": "Per occurrence / aggregate",
        }
    )

    # Flood insurance
    if flood_zone.startswith(("A", "V")):
        flood_premium = building_value * Decimal(0.025) * Decimal(flood_factor)
        coverages.append(
            {
                "coverage_type": "Flood",
                "limit": float(min(building_value, Decimal(2500000))),  # NFIP max
                "deductible": 10000,
                "estimated_premium": float(flood_premium),
                "notes": "Required for SFHA properties",
            }
        )

    # Wind/Named Storm (Louisiana)
    wind_premium = building_value * Decimal(0.008) * Decimal(coastal_factor)
    coverages.append(
        {
            "coverage_type": "Wind/Named Storm",
            "limit": float(building_value),
            "deductible": float(building_value * Decimal(0.05)),  # 5% wind deductible
            "estimated_premium": float(wind_premium),
            "notes": "Hurricane coverage",
        }
    )

    # Business interruption
    if revenue > 0:
        bi_premium = revenue * Decimal(0.003)
        coverages.append(
            {
                "coverage_type": "Business Interruption",
                "limit": float(revenue * Decimal(0.25)),  # 3 months
                "deductible": 0,
                "estimated_premium": float(bi_premium),
                "notes": "Actual loss sustained",
            }
        )

    total_premium = sum(cast(float, c["estimated_premium"]) for c in coverages)

    return {
        "property_address": property_data.get("address"),
        "building_value": float(building_value),
        "flood_zone": flood_zone,
        "construction_type": construction_type,
        "coverages": coverages,
        "total_estimated_premium": float(total_premium),
        "premium_per_100_value": (
            float(total_premium / float(building_value) * 100) if building_value > 0 else 0
        ),
        "notes": [
            "Estimates are approximate - obtain actual quotes",
            "Louisiana market has higher rates due to hurricane exposure",
            "Flood insurance required in SFHA",
            "Wind deductibles typically 5% of building value",
        ],
        "confidence": "medium",
    }


@function_tool
async def comprehensive_risk_assessment(
    project_id: str,
    address: str,
    property_type: str,
    submarket: str,
    parcel_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Run comprehensive risk assessment across all categories

    Args:
        project_id: Project ID
        address: Property address
        property_type: Type of property
        submarket: Market area
        parcel_id: Optional parcel ID

    Returns:
        Complete risk assessment report
    """
    # Run parallel risk assessments
    flood_risk = await cast(Any, analyze_flood_risk)(AnalyzeFloodRiskInput(address=address))
    market_risk = await cast(Any, assess_market_risk)(
        AssessMarketRiskInput(property_type=property_type, submarket=submarket)
    )

    environmental_risk = None
    if parcel_id:
        environmental_risk = await cast(Any, evaluate_environmental)(
            EvaluateEnvironmentalInput(parcel_id=parcel_id, address=address)
        )

    # Compile risk categories
    risk_categories = [
        {
            "category": "Environmental",
            "risk_level": flood_risk["risk_level"],
            "key_concerns": flood_risk["risk_description"],
            "mitigation": "; ".join(flood_risk.get("mitigation_options", [])[:2]),
        },
        {
            "category": "Market",
            "risk_level": market_risk["overall_risk_level"],
            "key_concerns": "Market cycle and supply pipeline",
            "mitigation": "Monitor absorption and new supply",
        },
    ]

    if environmental_risk:
        risk_categories.append(
            {
                "category": "Environmental (Contamination)",
                "risk_level": environmental_risk["risk_level"],
                "key_concerns": (
                    "; ".join(environmental_risk["risk_factors"])
                    if environmental_risk["risk_factors"]
                    else "No known issues"
                ),
                "mitigation": "Order Phase I ESA",
            }
        )

    # Determine overall risk
    risk_levels = [r["risk_level"] for r in risk_categories]
    if "high" in risk_levels:
        overall_risk = "high"
    elif "medium" in risk_levels:
        overall_risk = "medium"
    else:
        overall_risk = "low"

    # Generate recommendation
    if overall_risk == "high":
        recommendation = "CONDITIONAL - Address high-risk items before proceeding"
    elif overall_risk == "medium":
        recommendation = "PROCEED WITH CAUTION - Implement risk mitigations"
    else:
        recommendation = "PROCEED - Risk profile is acceptable"

    return {
        "project_id": project_id,
        "assessment_date": date.today().isoformat(),
        "overall_risk_level": overall_risk,
        "risk_categories": risk_categories,
        "flood_risk": flood_risk,
        "market_risk": market_risk,
        "environmental_risk": environmental_risk,
        "critical_risks": [r for r in risk_categories if r["risk_level"] == "high"],
        "recommendation": recommendation,
        "conditions": [
            "Complete all due diligence before closing",
            "Obtain appropriate insurance coverage",
            "Monitor market conditions quarterly",
        ],
        "confidence": "medium",
    }


@function_tool
async def save_risk_output(project_id: str, risk_data: Dict[str, Any]) -> Dict[str, Any]:
    """Save risk analysis output to database"""
    output = await db.save_agent_output(
        {
            "project_id": project_id,
            "agent_name": "risk_agent",
            "task_type": risk_data.get("task_type", "risk_assessment"),
            "input_data": risk_data.get("input", {}),
            "output_data": risk_data.get("output", {}),
            "confidence": risk_data.get("confidence", "medium"),
        }
    )
    return output or {"status": "saved"}


# Risk Agent definition
risk_agent = Agent(
    name="Risk Agent",
    model=settings.openai.standard_model,  # gpt-5.1 for risk assessment
    instructions=RISK_PROMPT,
    tools=[
        analyze_flood_risk,
        assess_market_risk,
        evaluate_environmental,
        estimate_insurance,
        comprehensive_risk_assessment,
        save_risk_output,
        cast(Any, {"type": "web_search"}),  # For regulatory updates
    ],
    handoffs=[],  # Will be configured after all agents defined
)
