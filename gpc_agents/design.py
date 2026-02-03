"""
Gallagher Property Company - Design Agent
"""

from decimal import Decimal
from functools import partial
from typing import Any, Dict, List, Optional, cast

from agents import Agent
from agents import function_tool as base_function_tool
from pydantic import BaseModel

from config.settings import settings
from prompts.agent_prompts import DESIGN_PROMPT
from tools.database import db

function_tool = partial(base_function_tool, strict_mode=False)


class CalculateCapacityInput(BaseModel):
    """Input for development capacity calculation"""

    parcel_id: str
    acres: float
    zoning_code: str
    proposed_use: str
    max_far: Optional[float] = None
    max_coverage: Optional[float] = None
    setbacks: Optional[Dict[str, float]] = None


class GenerateSitePlanInput(BaseModel):
    """Input for site plan generation"""

    parcel_data: Dict[str, Any]
    program: List[Dict[str, Any]]
    constraints: Dict[str, Any]


class EstimateConstructionCostInput(BaseModel):
    """Input for construction cost estimation"""

    building_program: List[Dict[str, Any]]
    location: str
    quality_level: str = "class_b"  # class_a, class_b, class_c


# Construction cost database (per SF) - Louisiana market
CONSTRUCTION_COSTS = {
    "mobile_home_park": {
        "site_work": {"low": 2.50, "mid": 3.50, "high": 5.00},  # per lot
        "infrastructure": {"low": 8000, "mid": 12000, "high": 18000},  # per lot
        "amenities": {"low": 500, "mid": 1000, "high": 2000},  # per lot
    },
    "flex_industrial": {
        "shell": {"class_c": 65, "class_b": 85, "class_a": 120},
        "ti": {"class_c": 15, "class_b": 25, "class_a": 45},
        "site_work": {"class_c": 8, "class_b": 12, "class_a": 18},
    },
    "small_commercial": {
        "shell": {"class_c": 75, "class_b": 100, "class_a": 140},
        "ti": {"class_c": 20, "class_b": 35, "class_a": 60},
        "site_work": {"class_c": 10, "class_b": 15, "class_a": 25},
    },
    "multifamily": {
        "garden": {"class_c": 110, "class_b": 140, "class_a": 180},  # per unit
        "midrise": {"class_c": 130, "class_b": 170, "class_a": 220},  # per unit
        "site_work": {"class_c": 8, "class_b": 12, "class_a": 18},  # per SF
    },
}

# Parking requirements by use
PARKING_REQUIREMENTS = {
    "mobile_home_park": {"ratio": 2.0, "unit": "per_lot"},  # 2 spaces per lot
    "flex_industrial": {"ratio": 2.0, "unit": "per_1000_sf"},
    "small_commercial": {"ratio": 4.0, "unit": "per_1000_sf"},
    "retail": {"ratio": 5.0, "unit": "per_1000_sf"},
    "office": {"ratio": 3.5, "unit": "per_1000_sf"},
    "multifamily": {"ratio": 1.5, "unit": "per_unit"},
    "warehouse": {"ratio": 1.0, "unit": "per_1000_sf"},
}


@function_tool
async def calculate_development_capacity(input_data: CalculateCapacityInput) -> Dict[str, Any]:
    """
    Calculate maximum development capacity for a parcel

    Args:
        input_data: Parcel data and zoning information

    Returns:
        Development capacity analysis
    """
    acres = input_data.acres
    sf = acres * 43560

    # Get zoning constraints
    zoning_config = _get_zoning_config(input_data.zoning_code)

    max_far = float(input_data.max_far or zoning_config.get("max_far", 0.3))
    max_coverage = float(input_data.max_coverage or zoning_config.get("max_coverage", 0.4))
    setbacks = cast(
        Dict[str, float],
        input_data.setbacks
        or zoning_config.get("setbacks", {"front": 25, "rear": 15, "side": 10}),
    )

    # Calculate buildable area after setbacks
    # Simplified calculation - assumes rectangular parcel
    setback_loss = (setbacks["front"] + setbacks["rear"]) * 200 + (setbacks["side"] * 2) * 200
    buildable_sf = max(0, sf - setback_loss)

    # Calculate max building SF by FAR
    max_building_sf_far = sf * max_far

    # Calculate max building SF by coverage
    max_building_sf_coverage = buildable_sf * max_coverage

    # Most restrictive constraint
    max_building_sf = min(max_building_sf_far, max_building_sf_coverage)

    # Calculate units/pads based on use type
    if input_data.proposed_use.lower() == "mobile_home_park":
        # Mobile home parks: 4,000-6,000 SF per lot typical
        lot_size = 5000
        max_units = int(buildable_sf / lot_size)

        # Parking calculation
        parking_ratio = float(cast(float, PARKING_REQUIREMENTS["mobile_home_park"]["ratio"]))
        parking_spaces = int(max_units * parking_ratio)
        parking_sf = parking_spaces * 300  # 300 SF per space

    elif input_data.proposed_use.lower() in ["multifamily", "apartments"]:
        # Multifamily: ~800-1200 SF per unit
        avg_unit_size = 900
        max_units = int(max_building_sf / avg_unit_size)

        parking_ratio = float(cast(float, PARKING_REQUIREMENTS["multifamily"]["ratio"]))
        parking_spaces = int(max_units * parking_ratio)
        parking_sf = parking_spaces * 300

    elif input_data.proposed_use.lower() in ["flex_industrial", "warehouse"]:
        max_units = None
        parking_ratio = float(cast(float, PARKING_REQUIREMENTS["flex_industrial"]["ratio"]))
        parking_spaces = int((max_building_sf / 1000) * parking_ratio)
        parking_sf = parking_spaces * 350  # Larger spaces for industrial

    else:
        max_units = None
        parking_ratio = float(
            cast(
                float,
                PARKING_REQUIREMENTS.get(input_data.proposed_use.lower(), {}).get("ratio", 3.0),
            )
        )
        parking_spaces = int((max_building_sf / 1000) * parking_ratio)
        parking_sf = parking_spaces * 300

    return {
        "parcel_id": input_data.parcel_id,
        "acres": acres,
        "total_sf": sf,
        "zoning_code": input_data.zoning_code,
        "proposed_use": input_data.proposed_use,
        "constraints": {"max_far": max_far, "max_coverage": max_coverage, "setbacks": setbacks},
        "capacity": {
            "max_building_sf": int(max_building_sf),
            "max_units": max_units,
            "parking_spaces": parking_spaces,
            "parking_sf": parking_sf,
            "open_space_sf": int(buildable_sf - max_building_sf - parking_sf),
            "building_coverage_percent": round((max_building_sf / sf) * 100, 1),
            "floor_area_ratio": round(max_building_sf / sf, 2),
        },
        "confidence": "high",
    }


def _get_zoning_config(zoning_code: str) -> Dict[str, Any]:
    """Get zoning configuration for a code"""
    configs = {
        "R-1": {
            "max_far": 0.3,
            "max_coverage": 0.35,
            "setbacks": {"front": 25, "rear": 20, "side": 8},
        },
        "R-2": {
            "max_far": 0.4,
            "max_coverage": 0.40,
            "setbacks": {"front": 20, "rear": 15, "side": 5},
        },
        "R-3": {
            "max_far": 0.6,
            "max_coverage": 0.50,
            "setbacks": {"front": 20, "rear": 15, "side": 5},
        },
        "R-4": {
            "max_far": 1.0,
            "max_coverage": 0.60,
            "setbacks": {"front": 15, "rear": 10, "side": 5},
        },
        "C-1": {
            "max_far": 0.5,
            "max_coverage": 0.50,
            "setbacks": {"front": 15, "rear": 10, "side": 5},
        },
        "C-2": {
            "max_far": 1.5,
            "max_coverage": 0.70,
            "setbacks": {"front": 10, "rear": 10, "side": 0},
        },
        "C-3": {
            "max_far": 0.4,
            "max_coverage": 0.40,
            "setbacks": {"front": 50, "rear": 20, "side": 15},
        },
        "M-1": {
            "max_far": 0.6,
            "max_coverage": 0.50,
            "setbacks": {"front": 25, "rear": 15, "side": 10},
        },
        "M-2": {
            "max_far": 0.8,
            "max_coverage": 0.60,
            "setbacks": {"front": 25, "rear": 15, "side": 10},
        },
        "MX": {
            "max_far": 2.0,
            "max_coverage": 0.80,
            "setbacks": {"front": 0, "rear": 0, "side": 0},
        },
        "PUD": {
            "max_far": 1.5,
            "max_coverage": 0.65,
            "setbacks": {"front": 15, "rear": 10, "side": 5},
        },
    }
    return configs.get(
        zoning_code,
        {"max_far": 0.3, "max_coverage": 0.40, "setbacks": {"front": 25, "rear": 15, "side": 10}},
    )


@function_tool
async def generate_site_plan(input_data: GenerateSitePlanInput) -> Dict[str, Any]:
    """
    Generate conceptual site plan with metrics

    Args:
        input_data: Parcel data, program, and constraints

    Returns:
        Site plan with layout recommendations
    """
    parcel = input_data.parcel_data
    program = input_data.program
    # Calculate total requirements
    total_building_sf = sum(p.get("sf", 0) for p in program)

    # Calculate parking requirements
    total_parking = 0
    for p in program:
        use_type = p.get("use_type", "")
        if use_type in PARKING_REQUIREMENTS:
            req = PARKING_REQUIREMENTS[use_type]
            if req["unit"] == "per_unit":
                total_parking += p.get("units", 0) * req["ratio"]
            elif req["unit"] == "per_1000_sf":
                total_parking += (p.get("sf", 0) / 1000) * req["ratio"]
            elif req["unit"] == "per_lot":
                total_parking += p.get("lots", 0) * req["ratio"]

    parking_sf = total_parking * 300

    # Calculate open space
    total_sf = parcel.get("total_sf", 0)
    open_space_sf = total_sf - total_building_sf - parking_sf
    open_space_percent = (open_space_sf / total_sf) * 100 if total_sf > 0 else 0

    # Generate layout recommendations
    layout_recommendations = []

    if "mobile_home_park" in [p.get("use_type") for p in program]:
        layout_recommendations.extend(
            [
                "Configure lots in cul-de-sac pattern for community feel",
                "Place community center near entrance for visibility",
                "Cluster amenities (playground, laundry) near community center",
                "Design internal roads with 24-28 ft width for access",
                "Provide individual utility meters for each lot",
            ]
        )

    if "flex_industrial" in [p.get("use_type") for p in program]:
        layout_recommendations.extend(
            [
                "Orient buildings for efficient truck circulation",
                "Provide grade-level doors on rear for loading",
                "Include office/showroom space along front facade",
                "Design parking in front, loading in rear",
            ]
        )

    return {
        "parcel": parcel,
        "development_program": program,
        "site_metrics": {
            "total_sf": total_sf,
            "building_sf": total_building_sf,
            "building_coverage_percent": (
                round((total_building_sf / total_sf) * 100, 1) if total_sf > 0 else 0
            ),
            "parking_spaces": int(total_parking),
            "parking_sf": parking_sf,
            "open_space_sf": int(open_space_sf),
            "open_space_percent": round(open_space_percent, 1),
            "floor_area_ratio": round(total_building_sf / total_sf, 2) if total_sf > 0 else 0,
        },
        "layout_recommendations": layout_recommendations,
        "next_steps": [
            "Engage civil engineer for detailed site plan",
            "Conduct topographic survey",
            "Coordinate with utility providers",
            "Prepare landscape plan",
        ],
        "confidence": "medium",
    }


@function_tool
async def estimate_construction_cost(input_data: EstimateConstructionCostInput) -> Dict[str, Any]:
    """
    Estimate construction costs by category

    Args:
        input_data: Building program, location, and quality level

    Returns:
        Cost estimates by category with total
    """
    quality = input_data.quality_level
    location_factor = _get_location_factor(input_data.location)

    cost_breakdown = []
    total_cost = Decimal(0)

    for item in input_data.building_program:
        use_type = item.get("use_type", "")
        sf = float(item.get("sf", 0) or 0)
        units = int(item.get("units", 0) or 0)
        lots = int(item.get("lots", 0) or 0)

        sf_decimal = Decimal(str(sf))
        units_decimal = Decimal(units)
        lots_decimal = Decimal(lots)

        costs = cast(Dict[str, Dict[str, float]], CONSTRUCTION_COSTS.get(use_type.lower(), {}))

        if use_type.lower() == "mobile_home_park":
            # Mobile home parks priced per lot
            site_work_cost = Decimal(costs["site_work"]["mid"]) * lots_decimal
            infrastructure_cost = Decimal(costs["infrastructure"]["mid"]) * lots_decimal
            amenities_cost = Decimal(costs["amenities"]["mid"]) * lots_decimal

            item_cost = site_work_cost + infrastructure_cost + amenities_cost

            cost_breakdown.append(
                {
                    "category": f"{use_type} - Site Work",
                    "quantity": lots,
                    "unit": "lots",
                    "unit_cost": float(costs["site_work"]["mid"]),
                    "total_cost": float(site_work_cost),
                }
            )
            cost_breakdown.append(
                {
                    "category": f"{use_type} - Infrastructure",
                    "quantity": lots,
                    "unit": "lots",
                    "unit_cost": float(costs["infrastructure"]["mid"]),
                    "total_cost": float(infrastructure_cost),
                }
            )

        elif use_type.lower() in ["flex_industrial", "small_commercial"]:
            # Commercial priced per SF
            shell_cost = Decimal(costs["shell"][quality]) * sf_decimal / 1000
            ti_cost = Decimal(costs["ti"][quality]) * sf_decimal / 1000
            site_work_cost = Decimal(costs["site_work"][quality]) * sf_decimal / 1000

            item_cost = shell_cost + ti_cost + site_work_cost

            cost_breakdown.append(
                {
                    "category": f"{use_type} - Shell",
                    "quantity": sf,
                    "unit": "SF",
                    "unit_cost": costs["shell"][quality] / 1000,
                    "total_cost": float(shell_cost),
                }
            )
            cost_breakdown.append(
                {
                    "category": f"{use_type} - TI",
                    "quantity": sf,
                    "unit": "SF",
                    "unit_cost": costs["ti"][quality] / 1000,
                    "total_cost": float(ti_cost),
                }
            )

        elif use_type.lower() == "multifamily":
            # Multifamily priced per unit
            unit_cost = Decimal(costs["garden"][quality]) * units_decimal
            site_work_cost = Decimal(costs["site_work"][quality]) * sf_decimal / 1000

            item_cost = unit_cost + site_work_cost

            cost_breakdown.append(
                {
                    "category": f"{use_type} - Construction",
                    "quantity": units,
                    "unit": "units",
                    "unit_cost": costs["garden"][quality],
                    "total_cost": float(unit_cost),
                }
            )

        else:
            item_cost = Decimal(0)

        total_cost += item_cost * Decimal(location_factor)

    # Add soft costs (typically 15-20% of hard costs)
    soft_costs = total_cost * Decimal(0.18)

    # Add contingency (typically 5-10%)
    contingency = (total_cost + soft_costs) * Decimal(0.08)

    grand_total = total_cost + soft_costs + contingency

    cost_breakdown.extend(
        [
            {
                "category": "Soft Costs (18%)",
                "quantity": 1,
                "unit": "lump sum",
                "unit_cost": float(soft_costs),
                "total_cost": float(soft_costs),
            },
            {
                "category": "Contingency (8%)",
                "quantity": 1,
                "unit": "lump sum",
                "unit_cost": float(contingency),
                "total_cost": float(contingency),
            },
        ]
    )

    return {
        "location": input_data.location,
        "quality_level": quality,
        "location_factor": location_factor,
        "cost_breakdown": cost_breakdown,
        "hard_costs": float(total_cost),
        "soft_costs": float(soft_costs),
        "contingency": float(contingency),
        "total_estimated_cost": float(grand_total),
        "cost_per_sf": (
            float(grand_total / sum(item.get("sf", 0) for item in input_data.building_program))
            if sum(item.get("sf", 0) for item in input_data.building_program) > 0
            else None
        ),
        "notes": [
            "Costs are estimates based on Louisiana market conditions",
            "Final costs depend on detailed design and contractor bids",
            "Escalation not included - add 3-5% per year if delayed",
        ],
        "confidence": "medium",
    }


def _get_location_factor(location: str) -> float:
    """Get cost location factor for a market"""
    factors = {
        "baton rouge": 0.95,
        "new orleans": 1.05,
        "lafayette": 0.92,
        "shreveport": 0.88,
        "houma": 0.90,
    }
    location_lower = location.lower()
    for city, factor in factors.items():
        if city in location_lower:
            return factor
    return 1.0  # Default to 1.0 if not found


@function_tool
async def save_design_output(project_id: str, design_data: Dict[str, Any]) -> Dict[str, Any]:
    """Save design analysis output to database"""
    output = await db.save_agent_output(
        {
            "project_id": project_id,
            "agent_name": "design_agent",
            "task_type": design_data.get("task_type", "design_analysis"),
            "input_data": design_data.get("input", {}),
            "output_data": design_data.get("output", {}),
            "confidence": design_data.get("confidence", "medium"),
        }
    )
    return output or {"status": "saved"}


# Design Agent definition
design_agent = Agent(
    name="Design Agent",
    model=settings.openai.standard_model,  # gpt-5.1 for design tasks
    instructions=DESIGN_PROMPT,
    tools=[
        calculate_development_capacity,
        generate_site_plan,
        estimate_construction_cost,
        save_design_output,
        cast(Any, {"type": "code_interpreter"}),  # For calculations
    ],
    handoffs=[],  # Will be configured after all agents defined
)
