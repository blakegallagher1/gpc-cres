"""
Gallagher Property Company - Deal Screener Agent
"""

from functools import partial
from typing import Any, Dict, Optional, cast

from agents import Agent, WebSearchTool
from agents import function_tool as base_function_tool
from pydantic import BaseModel, Field

from config.settings import settings
from prompts.agent_prompts import DEAL_SCREENER_PROMPT
from tools.database import db

function_tool = partial(base_function_tool, strict_mode=False)


class IngestListingInput(BaseModel):
    """Input for listing ingestion"""

    project_id: Optional[str] = None
    source: Optional[str] = None
    address: Optional[str] = None
    parcel_id: Optional[str] = None
    listing_data: Dict[str, Any] = Field(default_factory=dict)


class ScoreListingInput(BaseModel):
    """Input for scoring a listing"""

    listing_id: str
    criteria_id: Optional[str] = None
    score_inputs: Optional[Dict[str, float]] = None


class SaveScreeningOutputInput(BaseModel):
    """Input for saving screening output"""

    project_id: Optional[str] = None
    listing_id: Optional[str] = None
    summary: str
    recommendation: str
    confidence: str = "medium"
    supporting_data: Dict[str, Any] = Field(default_factory=dict)


SCORE_WEIGHTS = {
    "financial": 0.30,
    "location": 0.20,
    "utilities": 0.10,
    "zoning": 0.15,
    "market": 0.15,
    "risk": 0.10,
}


def _normalize_score(value: Optional[float]) -> float:
    if value is None:
        return 0.0
    if value <= 1:
        value = value * 100
    if value < 0:
        return 0.0
    if value > 100:
        return 100.0
    return float(value)


def compute_weighted_score(
    scores: Dict[str, float], weights: Optional[Dict[str, float]] = None
) -> Dict[str, Any]:
    resolved_weights = SCORE_WEIGHTS.copy()
    if weights:
        resolved_weights.update({k: float(v) for k, v in weights.items()})

    normalized = {key: _normalize_score(scores.get(key)) for key in resolved_weights}
    weighted = {key: normalized[key] * resolved_weights[key] for key in resolved_weights}
    total = round(sum(weighted.values()), 2)

    if total >= 85:
        tier = "A"
    elif total >= 70:
        tier = "B"
    elif total >= 55:
        tier = "C"
    else:
        tier = "D"

    return {
        "raw_scores": scores,
        "normalized_scores": normalized,
        "weighted_scores": weighted,
        "total_score": total,
        "tier": tier,
        "weights": resolved_weights,
    }


def _extract_scores(listing_data: Dict[str, Any]) -> Dict[str, float]:
    scores = listing_data.get("scores")
    if isinstance(scores, dict):
        return {k: float(v) for k, v in scores.items() if v is not None}
    return {}


@function_tool
async def ingest_listing(input_data: IngestListingInput) -> Dict[str, Any]:
    """
    Ingest a listing into the screener pipeline

    Args:
        input_data: Listing metadata and payload

    Returns:
        Created listing record
    """
    record = {
        "project_id": input_data.project_id,
        "source": input_data.source,
        "address": input_data.address,
        "parcel_id": input_data.parcel_id,
        "listing_data": input_data.listing_data,
        "status": "new",
    }
    listing = await db.create_screener_listing(record)
    return {
        "listing": listing,
        "message": "Listing ingested",
    }


@function_tool
async def score_listing(input_data: ScoreListingInput) -> Dict[str, Any]:
    """
    Score a listing against criteria

    Args:
        input_data: Listing and criteria identifiers

    Returns:
        Scoring breakdown and tier
    """
    listing = await db.get_screener_listing(input_data.listing_id)
    if not listing:
        return {"error": "Listing not found"}

    score_inputs = input_data.score_inputs or _extract_scores(
        cast(Dict[str, Any], listing.get("listing_data") or {})
    )

    if input_data.criteria_id:
        criteria = await db.get_screener_criteria(input_data.criteria_id)
        if not criteria:
            return {"error": "Criteria not found"}
        weights = cast(Dict[str, float], criteria.get("weights") or {})
        breakdown = compute_weighted_score(score_inputs, weights=weights or None)
    else:
        breakdown = compute_weighted_score(score_inputs)

    updates = {
        "score_total": breakdown["total_score"],
        "score_tier": breakdown["tier"],
        "score_detail": breakdown,
        "status": "scored",
    }
    updated = await db.update_screener_listing(input_data.listing_id, updates)

    if breakdown["tier"] == "D":
        await db.create_screener_alert(
            {
                "listing_id": input_data.listing_id,
                "alert_type": "low_score",
                "severity": "high",
                "message": "Listing scored below acceptable threshold",
            }
        )

    return {
        "listing": updated,
        "score": breakdown,
    }


@function_tool
async def save_screening_output(input_data: SaveScreeningOutputInput) -> Dict[str, Any]:
    """Save screening output to agent_outputs"""
    output = await db.save_agent_output(
        {
            "project_id": input_data.project_id,
            "agent_name": "deal_screener",
            "task_type": "screening_summary",
            "input_data": {"listing_id": input_data.listing_id},
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

deal_screener_agent = Agent(
    name="Deal Screener",
    instructions=DEAL_SCREENER_PROMPT,
    tools=[
        ingest_listing,
        score_listing,
        save_screening_output,
        WebSearchTool(),
    ],
    model=settings.openai.flagship_model,
)
