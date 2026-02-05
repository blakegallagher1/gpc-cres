"""
Runtime helpers for screening workflows.

These helpers translate extracted field values + overrides into the normalized
inputs expected by the screening scoring engine and expose small utilities
used by the API layer.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from tools.screening import ScreeningScoringInputs

FIELD_KEY_ALIASES: Dict[str, str] = {
    "price_basis": "price_basis",
    "underwritten_price": "price_basis",
    "asking_price": "price_basis",
    "total_project_cost": "total_project_cost",
    "total_cost": "total_project_cost",
    "square_feet": "square_feet",
    "sf": "square_feet",
    "noi_in_place": "noi_in_place",
    "noi_stabilized": "noi_stabilized",
    "tenant_credit": "tenant_credit_score",
    "tenant_credit_score": "tenant_credit_score",
    "asset_condition": "asset_condition_score",
    "asset_condition_score": "asset_condition_score",
    "market_dynamics": "market_dynamics_score",
    "market_dynamics_score": "market_dynamics_score",
}

SCORE_OVERRIDE_KEYS = {"overall_score", "financial_score", "qualitative_score"}


def _parse_number(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        is_percent = "%" in cleaned
        cleaned = (
            cleaned.replace("$", "")
            .replace(",", "")
            .replace("%", "")
            .replace(" ", "")
            .strip()
        )
        if not cleaned:
            return None
        try:
            number = float(cleaned)
        except ValueError:
            return None
        return number / 100.0 if is_percent else number
    return None


def _coerce_value(record: Dict[str, Any]) -> Optional[float]:
    if record.get("value_number") is not None:
        return _parse_number(record.get("value_number"))
    if record.get("value_text") is not None:
        return _parse_number(record.get("value_text"))
    return None


def _build_override_map(
    overrides: Iterable[Dict[str, Any]], scope: str
) -> Dict[str, Dict[str, Any]]:
    override_map: Dict[str, Dict[str, Any]] = {}
    for override in overrides:
        if override.get("scope") != scope:
            continue
        field_key = override.get("field_key")
        if not field_key or field_key in override_map:
            continue
        override_map[field_key] = override
    return override_map


def build_screening_inputs(
    field_values: List[Dict[str, Any]], overrides: List[Dict[str, Any]]
) -> ScreeningScoringInputs:
    """
    Build normalized scoring inputs from field values + manual overrides.

    Overrides take precedence over extracted values for the same field key.
    """
    values_map: Dict[str, Dict[str, Any]] = {}
    for value in field_values:
        field_key = value.get("field_key")
        if isinstance(field_key, str) and field_key:
            values_map[field_key] = value
    override_map = _build_override_map(overrides, scope="field")

    resolved: Dict[str, Optional[float]] = {}
    for raw_key, normalized_key in FIELD_KEY_ALIASES.items():
        override = override_map.get(raw_key)
        if override is not None:
            resolved_value = _coerce_value(override)
        else:
            record = values_map.get(raw_key, {})
            resolved_value = _coerce_value(record) if record else None
        if normalized_key not in resolved or resolved[normalized_key] is None:
            resolved[normalized_key] = resolved_value

    return ScreeningScoringInputs(
        price_basis=resolved.get("price_basis"),
        total_project_cost=resolved.get("total_project_cost"),
        square_feet=resolved.get("square_feet"),
        noi_in_place=resolved.get("noi_in_place"),
        noi_stabilized=resolved.get("noi_stabilized"),
        tenant_credit_score=resolved.get("tenant_credit_score"),
        asset_condition_score=resolved.get("asset_condition_score"),
        market_dynamics_score=resolved.get("market_dynamics_score"),
    )


def find_low_confidence_keys(
    field_values: List[Dict[str, Any]],
    threshold: float,
    overrides: Optional[List[Dict[str, Any]]] = None,
) -> List[str]:
    """Return field keys with confidence below threshold (ignoring overridden fields)."""
    override_map = _build_override_map(overrides or [], scope="field")
    low_confidence: List[str] = []
    for value in field_values:
        field_key = value.get("field_key")
        if not field_key or field_key in override_map:
            continue
        confidence = _parse_number(value.get("confidence"))
        if confidence is not None and confidence < threshold:
            low_confidence.append(field_key)
    return sorted(set(low_confidence))


def apply_score_overrides(
    base_scores: Dict[str, Any], overrides: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Apply score overrides (overall/financial/qualitative) on top of base scores."""
    override_map = _build_override_map(overrides, scope="score")
    updated = dict(base_scores)
    for key in SCORE_OVERRIDE_KEYS:
        override = override_map.get(key)
        if override is None:
            continue
        override_value = _coerce_value(override)
        if override_value is not None:
            updated[key] = override_value
    return updated
