"""
Deal Screening (MVP v1)

This module contains the core, testable business logic for computing the v1 screening score
(1–5 scale) for industrial deals in Louisiana.

Design goals (from product plan):
- Equal-weight financial and qualitative groups (50/50) when both are present.
- Missing values do not penalize (they are excluded from the denominator).
- A provisional score is computed even with gaps, and gaps are surfaced via `missing_keys`.
- Hard filters are evaluated when the needed inputs are present; missing inputs do not fail a filter.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class DebtTemplate(BaseModel):
    """Debt assumptions used for provisional DSCR/cash-on-cash calculations."""

    ltv: float = Field(default=0.65, ge=0.0, le=1.0)
    interest_rate: float = Field(default=0.07, ge=0.0, le=1.0)
    amort_years: int = Field(default=25, ge=1, le=40)
    io_years: int = Field(default=0, ge=0, le=10)
    debt_fee_rate: float = Field(default=0.01, ge=0.0, le=0.1)


class ClosingCostsTemplate(BaseModel):
    """Acquisition closing costs used to estimate total cost when missing."""

    legal_pct: float = Field(default=0.005, ge=0.0, le=0.1)
    title_pct: float = Field(default=0.003, ge=0.0, le=0.1)
    due_diligence_flat: float = Field(default=25_000.0, ge=0.0)


class ReservesTemplate(BaseModel):
    """Reserve assumptions (annual)."""

    capex_reserve_per_sf_year: float = Field(default=0.25, ge=0.0)


class HardFilters(BaseModel):
    """Hard filter thresholds for screening."""

    min_dscr: float = Field(default=1.25, ge=0.0)
    min_cap_rate: float = Field(default=0.07, ge=0.0, le=1.0)
    min_yield_spread: float = Field(default=0.015, ge=0.0, le=1.0)


class ScoringBands(BaseModel):
    """
    Default 1–5 scoring bands.

    Each list contains 5 ascending thresholds representing floor values for scores 1..5.
    Values below the first threshold are still scored as 1 (hard filters handle "fail" logic).
    """

    cap_rate: List[float] = Field(default_factory=lambda: [0.07, 0.08, 0.09, 0.10, 0.11])
    dscr: List[float] = Field(default_factory=lambda: [1.25, 1.40, 1.55, 1.70, 1.85])
    cash_on_cash: List[float] = Field(default_factory=lambda: [0.06, 0.08, 0.10, 0.12, 0.14])
    yield_on_cost: List[float] = Field(default_factory=lambda: [0.06, 0.08, 0.10, 0.12, 0.14])
    yield_spread: List[float] = Field(
        default_factory=lambda: [0.015, 0.020, 0.025, 0.030, 0.035]
    )


class ScreeningPlaybook(BaseModel):
    """
    Playbook settings (global defaults stored in DB).

    The DB stores this as JSONB in `screening_playbooks.settings`.
    """

    low_confidence_threshold: float = Field(default=0.70, ge=0.0, le=1.0)
    hard_filters: HardFilters = Field(default_factory=HardFilters)
    debt_template: DebtTemplate = Field(default_factory=DebtTemplate)
    closing_costs: ClosingCostsTemplate = Field(default_factory=ClosingCostsTemplate)
    reserves: ReservesTemplate = Field(default_factory=ReservesTemplate)
    scoring_bands: ScoringBands = Field(default_factory=ScoringBands)


class ScreeningScoringInputs(BaseModel):
    """
    Inputs required to compute a screening score.

    Monetary inputs should be annualized where applicable (NOI, debt service).
    Percentages are decimals (7% => 0.07).
    """

    price_basis: Optional[float] = None
    total_project_cost: Optional[float] = None
    square_feet: Optional[float] = None
    noi_in_place: Optional[float] = None
    noi_stabilized: Optional[float] = None
    tenant_credit_score: Optional[float] = None
    asset_condition_score: Optional[float] = None
    market_dynamics_score: Optional[float] = None


class ScreeningComputedMetrics(BaseModel):
    """Derived numeric metrics used in scoring + display."""

    price_basis: Optional[float] = None
    total_cost: Optional[float] = None
    loan_amount: Optional[float] = None
    equity_invested: Optional[float] = None
    loan_constant: Optional[float] = None
    annual_debt_service: Optional[float] = None
    annual_reserves: Optional[float] = None

    cap_rate_in_place: Optional[float] = None
    cap_rate_stabilized: Optional[float] = None
    cap_rate_used: Optional[float] = None
    noi_used: Optional[float] = None

    yield_on_cost: Optional[float] = None
    yield_spread: Optional[float] = None
    dscr: Optional[float] = None
    cash_on_cash: Optional[float] = None


class ScreeningScoreBreakdown(BaseModel):
    """Score outputs suitable for persistence and UI."""

    overall_score: Optional[float] = None
    financial_score: Optional[float] = None
    qualitative_score: Optional[float] = None
    is_provisional: bool = True
    hard_filter_failed: bool = False
    hard_filter_reasons: List[str] = Field(default_factory=list)
    missing_keys: List[str] = Field(default_factory=list)
    metric_scores: Dict[str, Optional[float]] = Field(default_factory=dict)
    metric_values: Dict[str, Optional[float]] = Field(default_factory=dict)


class ScreeningComputation(BaseModel):
    """Full computation result (metrics + scoring breakdown)."""

    metrics: ScreeningComputedMetrics
    scores: ScreeningScoreBreakdown


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def loan_constant(annual_rate: float, amort_years: int) -> float:
    """
    Compute the amortizing loan constant (annual debt service / principal).

    Args:
        annual_rate: Nominal interest rate as a decimal (7% => 0.07)
        amort_years: Amortization term in years

    Returns:
        Loan constant as decimal (e.g., 0.085 => 8.5% annual debt service)
    """
    if amort_years <= 0:
        raise ValueError("amort_years must be positive")

    if annual_rate <= 0:
        return 1.0 / float(amort_years)

    monthly_rate = annual_rate / 12.0
    periods = amort_years * 12
    factor = (monthly_rate * (1.0 + monthly_rate) ** periods) / ((1.0 + monthly_rate) ** periods - 1.0)
    return factor * 12.0


def _score_from_bands(value: Optional[float], bands: List[float]) -> Optional[float]:
    if value is None:
        return None
    if not bands:
        return None
    score = 1
    for idx, threshold in enumerate(bands, start=1):
        if value >= threshold:
            score = idx
    return float(score)


def _avg(values: List[float]) -> Optional[float]:
    if not values:
        return None
    return sum(values) / float(len(values))


@dataclass(frozen=True)
class HardFilterCheck:
    name: str
    threshold: float
    value: Optional[float]

    def failed(self) -> bool:
        return self.value is not None and self.value < self.threshold


def compute_screening(playbook: ScreeningPlaybook, inputs: ScreeningScoringInputs) -> ScreeningComputation:
    """
    Compute v1 screening metrics and 1–5 score.

    Notes:
    - Cap rate is computed as NOI / price (standard definition).
    - When both in-place and stabilized NOI are present, stabilized is used for scoring and hard filters;
      both are still returned for display.
    - Missing values are excluded from group averages (no penalty).
    """
    missing_keys: List[str] = []

    price_basis = inputs.price_basis if _is_number(inputs.price_basis) else None
    if price_basis is None:
        missing_keys.append("price_basis")

    square_feet = inputs.square_feet if _is_number(inputs.square_feet) else None
    if square_feet is None:
        missing_keys.append("square_feet")

    noi_in_place = inputs.noi_in_place if _is_number(inputs.noi_in_place) else None
    noi_stabilized = inputs.noi_stabilized if _is_number(inputs.noi_stabilized) else None
    if noi_in_place is None:
        missing_keys.append("noi_in_place")
    if noi_stabilized is None:
        missing_keys.append("noi_stabilized")

    # Choose NOI for different uses
    noi_for_cap = noi_stabilized if noi_stabilized is not None else noi_in_place
    noi_for_cashflow = noi_in_place if noi_in_place is not None else noi_stabilized

    def _safe_div(numerator: Optional[float], denominator: Optional[float]) -> Optional[float]:
        if numerator is None or denominator is None:
            return None
        if denominator == 0:
            return None
        return float(numerator) / float(denominator)

    cap_rate_in_place = _safe_div(noi_in_place, price_basis)
    cap_rate_stabilized = _safe_div(noi_stabilized, price_basis)
    cap_rate_used = _safe_div(noi_for_cap, price_basis)

    debt = playbook.debt_template
    closing = playbook.closing_costs

    loan_amt = (price_basis * debt.ltv) if (price_basis is not None) else None
    lc = loan_constant(debt.interest_rate, debt.amort_years) if loan_amt is not None else None
    annual_debt_service = (loan_amt * lc) if (loan_amt is not None and lc is not None) else None

    total_cost = inputs.total_project_cost if _is_number(inputs.total_project_cost) else None
    if total_cost is None and price_basis is not None and loan_amt is not None:
        # Provisional total cost derived from plan defaults (price + closing + DD + debt fees)
        debt_fees = loan_amt * debt.debt_fee_rate
        total_cost = (
            price_basis
            + (price_basis * closing.legal_pct)
            + (price_basis * closing.title_pct)
            + closing.due_diligence_flat
            + debt_fees
        )

    equity = (total_cost - loan_amt) if (total_cost is not None and loan_amt is not None) else None

    reserves = (
        square_feet * playbook.reserves.capex_reserve_per_sf_year if square_feet is not None else None
    )

    noi_after_reserves = (
        (noi_for_cashflow - reserves)
        if (noi_for_cashflow is not None and reserves is not None)
        else None
    )

    dscr = _safe_div(noi_after_reserves, annual_debt_service)

    yield_on_cost = _safe_div(noi_for_cap, total_cost)

    yield_spread = (yield_on_cost - lc) if (yield_on_cost is not None and lc is not None) else None

    cash_flow_after_debt = (
        (noi_after_reserves - annual_debt_service)
        if (noi_after_reserves is not None and annual_debt_service is not None)
        else None
    )
    cash_on_cash = (
        (cash_flow_after_debt / equity)
        if (cash_flow_after_debt is not None and equity is not None and equity > 0)
        else None
    )

    # Qualitative inputs are already 1–5; clamp into the range.
    qual_scores: Dict[str, Optional[float]] = {}
    for key, raw in (
        ("tenant_credit", inputs.tenant_credit_score),
        ("asset_condition", inputs.asset_condition_score),
        ("market_dynamics", inputs.market_dynamics_score),
    ):
        if raw is None:
            missing_keys.append(key)
            qual_scores[key] = None
            continue
        if not _is_number(raw):
            missing_keys.append(key)
            qual_scores[key] = None
            continue
        qual_scores[key] = float(_clamp(float(raw), 1.0, 5.0))

    # Score each metric (1–5). Missing => None (excluded from averages).
    bands = playbook.scoring_bands
    metric_values: Dict[str, Optional[float]] = {
        "cap_rate_in_place": cap_rate_in_place,
        "cap_rate_stabilized": cap_rate_stabilized,
        "cap_rate_used": cap_rate_used,
        "yield_on_cost": yield_on_cost,
        "yield_spread": yield_spread,
        "cash_on_cash": cash_on_cash,
        "dscr": dscr,
        "loan_constant": lc,
    }

    metric_scores: Dict[str, Optional[float]] = {
        "cap_rate": _score_from_bands(cap_rate_used, bands.cap_rate),
        "yield_on_cost": _score_from_bands(yield_on_cost, bands.yield_on_cost),
        "cash_on_cash": _score_from_bands(cash_on_cash, bands.cash_on_cash),
        "dscr": _score_from_bands(dscr, bands.dscr),
        **qual_scores,
    }

    financial_components = [
        score
        for key, score in metric_scores.items()
        if key in ("cap_rate", "yield_on_cost", "cash_on_cash", "dscr") and score is not None
    ]
    qualitative_components = [
        score
        for key, score in metric_scores.items()
        if key in ("tenant_credit", "asset_condition", "market_dynamics") and score is not None
    ]

    financial_score = _avg(financial_components)
    qualitative_score = _avg(qualitative_components)

    overall_score: Optional[float] = None
    if financial_score is not None and qualitative_score is not None:
        overall_score = 0.5 * financial_score + 0.5 * qualitative_score
    else:
        # Missing group does not penalize: use the available group score (if any).
        overall_score = financial_score if financial_score is not None else qualitative_score

    # Provisional if any required scoring components are missing.
    required_metric_keys = [
        "cap_rate",
        "yield_on_cost",
        "cash_on_cash",
        "dscr",
        "tenant_credit",
        "asset_condition",
        "market_dynamics",
    ]
    is_provisional = any(metric_scores.get(key) is None for key in required_metric_keys)

    # Hard filters (only fail when value is present)
    hard = playbook.hard_filters
    hard_checks = [
        HardFilterCheck(name="dscr", threshold=hard.min_dscr, value=dscr),
        HardFilterCheck(name="cap_rate", threshold=hard.min_cap_rate, value=cap_rate_used),
        HardFilterCheck(name="yield_spread", threshold=hard.min_yield_spread, value=yield_spread),
    ]
    hard_filter_reasons = [check.name for check in hard_checks if check.failed()]
    hard_filter_failed = bool(hard_filter_reasons)

    # Round for storage/display consistency
    def _round_or_none(value: Optional[float]) -> Optional[float]:
        if value is None:
            return None
        return round(float(value), 4)

    metrics = ScreeningComputedMetrics(
        price_basis=_round_or_none(price_basis),
        total_cost=_round_or_none(total_cost),
        loan_amount=_round_or_none(loan_amt),
        equity_invested=_round_or_none(equity),
        loan_constant=_round_or_none(lc),
        annual_debt_service=_round_or_none(annual_debt_service),
        annual_reserves=_round_or_none(reserves),
        cap_rate_in_place=_round_or_none(cap_rate_in_place),
        cap_rate_stabilized=_round_or_none(cap_rate_stabilized),
        cap_rate_used=_round_or_none(cap_rate_used),
        noi_used=_round_or_none(noi_for_cap),
        yield_on_cost=_round_or_none(yield_on_cost),
        yield_spread=_round_or_none(yield_spread),
        dscr=_round_or_none(dscr),
        cash_on_cash=_round_or_none(cash_on_cash),
    )

    scores = ScreeningScoreBreakdown(
        overall_score=round(overall_score, 2) if overall_score is not None else None,
        financial_score=round(financial_score, 2) if financial_score is not None else None,
        qualitative_score=round(qualitative_score, 2) if qualitative_score is not None else None,
        is_provisional=is_provisional,
        hard_filter_failed=hard_filter_failed,
        hard_filter_reasons=hard_filter_reasons,
        missing_keys=sorted(set(missing_keys)),
        metric_scores={k: (round(v, 2) if v is not None else None) for k, v in metric_scores.items()},
        metric_values={k: _round_or_none(v) for k, v in metric_values.items()},
    )

    return ScreeningComputation(metrics=metrics, scores=scores)


def playbook_from_db_settings(settings: Dict[str, Any] | None) -> ScreeningPlaybook:
    """Parse a DB JSONB playbook payload, falling back to defaults."""
    if not settings:
        return ScreeningPlaybook()
    return ScreeningPlaybook.model_validate(settings)
