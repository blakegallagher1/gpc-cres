"""
Gallagher Property Company - Operations Agent
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from functools import partial
from typing import Any, Dict, List, Optional

from agents import Agent
from agents import function_tool as base_function_tool
from pydantic import BaseModel

from config.settings import settings
from prompts.agent_prompts import OPERATIONS_PROMPT
from tools.database import db

function_tool = partial(base_function_tool, strict_mode=False)


class CreateScheduleInput(BaseModel):
    """Input for project schedule creation"""

    project_id: str
    project_name: str
    project_type: str
    start_date: str
    phases: List[Dict[str, Any]]


class TrackCostsInput(BaseModel):
    """Input for cost tracking"""

    project_id: str
    cost_data: Dict[str, Any]


class EvaluateContractorInput(BaseModel):
    """Input for contractor evaluation"""

    contractor_name: str
    trade: str
    license_number: Optional[str] = None


class GenerateStatusReportInput(BaseModel):
    """Input for status report generation"""

    project_id: str
    report_period_start: Optional[str] = None
    report_period_end: Optional[str] = None


# Standard construction phases by project type
CONSTRUCTION_PHASES = {
    "mobile_home_park": [
        {"name": "Permits & Approvals", "duration_days": 60, "predecessors": []},
        {"name": "Site Clearing & Grubbing", "duration_days": 14, "predecessors": [0]},
        {"name": "Rough Grading", "duration_days": 21, "predecessors": [1]},
        {"name": "Underground Utilities", "duration_days": 30, "predecessors": [2]},
        {"name": "Road Base & Paving", "duration_days": 30, "predecessors": [3]},
        {"name": "Pad Preparation", "duration_days": 21, "predecessors": [4]},
        {"name": "Final Grading & Landscaping", "duration_days": 14, "predecessors": [5]},
        {"name": "Amenity Construction", "duration_days": 30, "predecessors": [4]},
        {"name": "Final Inspections & CO", "duration_days": 14, "predecessors": [6, 7]},
    ],
    "flex_industrial": [
        {"name": "Permits & Approvals", "duration_days": 90, "predecessors": []},
        {"name": "Site Work", "duration_days": 45, "predecessors": [0]},
        {"name": "Foundation", "duration_days": 30, "predecessors": [1]},
        {"name": "Steel Erection", "duration_days": 30, "predecessors": [2]},
        {"name": "Roofing & Envelope", "duration_days": 30, "predecessors": [3]},
        {"name": "MEP Rough-in", "duration_days": 45, "predecessors": [4]},
        {"name": "Interior Build-out", "duration_days": 60, "predecessors": [5]},
        {"name": "Site Improvements", "duration_days": 30, "predecessors": [4]},
        {"name": "Final Finishes", "duration_days": 30, "predecessors": [6]},
        {"name": "Final Inspections & CO", "duration_days": 14, "predecessors": [7, 8]},
    ],
    "multifamily": [
        {"name": "Permits & Approvals", "duration_days": 120, "predecessors": []},
        {"name": "Site Work", "duration_days": 60, "predecessors": [0]},
        {"name": "Foundation", "duration_days": 45, "predecessors": [1]},
        {"name": "Framing", "duration_days": 60, "predecessors": [2]},
        {"name": "Roofing", "duration_days": 30, "predecessors": [3]},
        {"name": "MEP Rough-in", "duration_days": 60, "predecessors": [4]},
        {"name": "Exterior Finishes", "duration_days": 45, "predecessors": [4]},
        {"name": "Interior Finishes", "duration_days": 90, "predecessors": [5]},
        {"name": "Fixtures & Appliances", "duration_days": 30, "predecessors": [7]},
        {"name": "Site Improvements & Landscaping", "duration_days": 45, "predecessors": [6]},
        {"name": "Final Inspections & CO", "duration_days": 21, "predecessors": [8, 9]},
    ],
}

# Budget categories by project type
BUDGET_CATEGORIES = {
    "mobile_home_park": [
        "Land Acquisition",
        "Site Work",
        "Roads & Paving",
        "Utilities",
        "Pad Preparation",
        "Amenities",
        "Landscaping",
        "Soft Costs",
        "Contingency",
    ],
    "flex_industrial": [
        "Land Acquisition",
        "Site Work",
        "Foundation",
        "Structure",
        "Roofing",
        "MEP",
        "Interior Build-out",
        "Exterior",
        "Soft Costs",
        "Contingency",
    ],
    "multifamily": [
        "Land Acquisition",
        "Site Work",
        "Foundation",
        "Structure",
        "Roofing",
        "MEP",
        "Interior Finishes",
        "Exterior Finishes",
        "Fixtures & Appliances",
        "Soft Costs",
        "Contingency",
    ],
}


@function_tool
async def create_schedule(input_data: CreateScheduleInput) -> Dict[str, Any]:
    """
    Create project schedule with critical path analysis

    Args:
        input_data: Project data and phases

    Returns:
        Project schedule with milestones and critical path
    """
    start_date = datetime.strptime(input_data.start_date, "%Y-%m-%d").date()

    # Get standard phases if not provided
    phases = input_data.phases
    if not phases:
        phases = CONSTRUCTION_PHASES.get(
            input_data.project_type.lower(), CONSTRUCTION_PHASES["flex_industrial"]
        )

    # Calculate dates for each phase
    schedule: List[Dict[str, Any]] = []
    current_date = start_date

    for i, phase in enumerate(phases):
        # Calculate start date based on predecessors
        if phase.get("predecessors"):
            pred_indices = phase["predecessors"]
            pred_end_dates = [schedule[j]["end_date"] for j in pred_indices if j < len(schedule)]
            if pred_end_dates:
                current_date = max(pred_end_dates)

        duration = phase.get("duration_days", 30)
        start = current_date
        end = start + timedelta(days=duration)

        schedule.append(
            {
                "phase_number": i + 1,
                "phase_name": phase["name"],
                "duration_days": duration,
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "predecessors": phase.get("predecessors", []),
                "status": "not_started",
            }
        )

        current_date = end

    # Identify critical path (simplified - assumes all phases are critical)
    critical_path = [p["phase_number"] for p in schedule]

    # Calculate project completion
    original_completion = schedule[-1]["end_date"] if schedule else start_date.isoformat()

    return {
        "project_id": input_data.project_id,
        "project_name": input_data.project_name,
        "project_type": input_data.project_type,
        "start_date": start_date.isoformat(),
        "original_completion": original_completion,
        "total_duration_days": sum(p["duration_days"] for p in phases),
        "phases": schedule,
        "critical_path": critical_path,
        "milestones": _generate_milestones(schedule),
        "confidence": "medium",
    }


def _generate_milestones(schedule: List[Dict]) -> List[Dict]:
    """Generate key milestones from schedule"""
    milestones = []

    if len(schedule) >= 3:
        milestones.append(
            {
                "name": "Construction Start",
                "date": schedule[1]["start_date"],
                "description": "Site work begins",
            }
        )

    if len(schedule) >= 6:
        mid_idx = len(schedule) // 2
        milestones.append(
            {
                "name": "50% Complete",
                "date": schedule[mid_idx]["end_date"],
                "description": "Halfway point of construction",
            }
        )

    if schedule:
        milestones.append(
            {
                "name": "Substantial Completion",
                "date": schedule[-2]["end_date"] if len(schedule) > 1 else schedule[-1]["end_date"],
                "description": "Building ready for occupancy",
            }
        )

        milestones.append(
            {
                "name": "Final Completion",
                "date": schedule[-1]["end_date"],
                "description": "Punch list complete, CO issued",
            }
        )

    return milestones


@function_tool
async def track_costs(input_data: TrackCostsInput) -> Dict[str, Any]:
    """
    Update and analyze project costs

    Args:
        input_data: Project ID and cost data

    Returns:
        Cost analysis with variances
    """
    project_id = input_data.project_id
    cost_data = input_data.cost_data

    # Calculate totals
    budget_total = Decimal(cost_data.get("budget_total", 0))
    committed_total = Decimal(cost_data.get("committed_total", 0))
    spent_total = Decimal(cost_data.get("spent_total", 0))

    variance = budget_total - spent_total
    percent_committed = (committed_total / budget_total * 100) if budget_total > 0 else 0
    percent_spent = (spent_total / budget_total * 100) if budget_total > 0 else 0

    # Cost-to-complete
    cost_to_complete = budget_total - committed_total

    # Analyze categories
    categories = cost_data.get("categories", [])
    category_analysis = []

    for cat in categories:
        cat_budget = Decimal(cat.get("budget", 0))
        cat_spent = Decimal(cat.get("spent", 0))
        cat_variance = cat_budget - cat_spent
        cat_percent = (cat_spent / cat_budget * 100) if cat_budget > 0 else 0

        category_analysis.append(
            {
                "category": cat.get("name"),
                "budget": float(cat_budget),
                "committed": float(cat.get("committed", 0)),
                "spent": float(cat_spent),
                "variance": float(cat_variance),
                "percent_complete": round(cat_percent, 1),
                "status": (
                    "over_budget"
                    if cat_variance < 0
                    else "on_track" if cat_percent < 90 else "complete"
                ),
            }
        )

    return {
        "project_id": project_id,
        "summary": {
            "budget_total": float(budget_total),
            "committed_total": float(committed_total),
            "spent_total": float(spent_total),
            "variance": float(variance),
            "cost_to_complete": float(cost_to_complete),
            "percent_committed": round(percent_committed, 1),
            "percent_spent": round(percent_spent, 1),
        },
        "category_analysis": category_analysis,
        "alerts": _generate_cost_alerts(category_analysis, float(variance)),
        "confidence": "high",
    }


def _generate_cost_alerts(categories: List[Dict], total_variance: float) -> List[Dict]:
    """Generate cost alerts based on analysis"""
    alerts = []

    for cat in categories:
        if cat["status"] == "over_budget":
            alerts.append(
                {
                    "level": "critical",
                    "category": cat["category"],
                    "message": f"{cat['category']} is over budget by ${abs(cat['variance']):,.2f}",
                }
            )
        elif cat["percent_complete"] > 100 and cat["variance"] < 0:
            alerts.append(
                {
                    "level": "warning",
                    "category": cat["category"],
                    "message": f"{cat['category']} spending exceeds budget",
                }
            )

    if total_variance < 0:
        alerts.append(
            {
                "level": "critical",
                "category": "Project Total",
                "message": f"Project is over budget by ${abs(total_variance):,.2f}",
            }
        )
    elif total_variance < 50000:  # Less than $50k remaining
        alerts.append(
            {
                "level": "warning",
                "category": "Project Total",
                "message": "Project budget is tight - monitor closely",
            }
        )

    return alerts


@function_tool
async def evaluate_contractor(input_data: EvaluateContractorInput) -> Dict[str, Any]:
    """
    Evaluate contractor qualifications and history

    Args:
        input_data: Contractor information

    Returns:
        Contractor evaluation
    """
    # This would typically query contractor database
    # For now, returning evaluation structure

    return {
        "contractor_name": input_data.contractor_name,
        "trade": input_data.trade,
        "license_number": input_data.license_number,
        "evaluation": {
            "license_status": "verification_required",
            "insurance_status": "verification_required",
            "bonding_capacity": "verification_required",
            "safety_rating": "verification_required",
            "past_performance": "verification_required",
        },
        "recommendations": [
            "Verify license with Louisiana State Licensing Board",
            "Request certificate of insurance",
            "Check bonding capacity with surety",
            "Contact references from past projects",
            "Verify safety record with OSHA",
        ],
        "confidence": "low",
    }


@function_tool
async def generate_status_report(input_data: GenerateStatusReportInput) -> Dict[str, Any]:
    """
    Generate comprehensive project status report

    Args:
        input_data: Project ID and report period

    Returns:
        Status report with schedule, budget, and issues
    """
    project_id = input_data.project_id

    # Get project data
    project = await db.get_project(project_id)

    # Set report period
    if input_data.report_period_end:
        end_date = datetime.strptime(input_data.report_period_end, "%Y-%m-%d").date()
    else:
        end_date = date.today()

    if input_data.report_period_start:
        start_date = datetime.strptime(input_data.report_period_start, "%Y-%m-%d").date()
    else:
        start_date = end_date - timedelta(days=30)

    # This would typically aggregate data from multiple sources
    # For now, returning report structure

    return {
        "project_id": project_id,
        "project_name": project.get("name", "Unknown") if project else "Unknown",
        "report_date": date.today().isoformat(),
        "report_period": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "schedule_status": {
            "status": "on_track",  # Would be calculated from actual data
            "original_completion": "TBD",
            "current_projected": "TBD",
            "variance_days": 0,
            "milestones_this_period": [],
            "milestones_next_period": [],
        },
        "budget_status": {
            "status": "on_track",
            "budget_total": 0,
            "committed": 0,
            "spent": 0,
            "variance": 0,
        },
        "quality_safety": {
            "inspections_passed": 0,
            "inspections_failed": 0,
            "open_punch_list_items": 0,
            "safety_incidents": 0,
        },
        "key_issues": [],
        "next_steps": [],
        "confidence": "medium",
    }


@function_tool
async def save_operations_output(
    project_id: str, operations_data: Dict[str, Any]
) -> Dict[str, Any]:
    """Save operations output to database"""
    output = await db.save_agent_output(
        {
            "project_id": project_id,
            "agent_name": "operations_agent",
            "task_type": operations_data.get("task_type", "operations"),
            "input_data": operations_data.get("input", {}),
            "output_data": operations_data.get("output", {}),
            "confidence": operations_data.get("confidence", "medium"),
        }
    )
    return output or {"status": "saved"}


# Operations Agent definition
operations_agent = Agent(
    name="Operations Agent",
    model=settings.openai.standard_model,  # gpt-5.1 for operations tasks
    instructions=OPERATIONS_PROMPT,
    tools=[
        create_schedule,
        track_costs,
        evaluate_contractor,
        generate_status_report,
        save_operations_output,
    ],
    handoffs=[],  # Will be configured after all agents defined
)
