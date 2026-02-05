from __future__ import annotations

import pytest

from tools.screening import ScreeningPlaybook, ScreeningScoringInputs, compute_screening, loan_constant


def test_loan_constant_matches_expected_value() -> None:
    # 7% / 25y amort is a common "sanity check" case.
    assert loan_constant(0.07, 25) == pytest.approx(0.0848135, abs=1e-4)


def test_loan_constant_zero_rate_falls_back_to_simple_amort() -> None:
    assert loan_constant(0.0, 25) == pytest.approx(1.0 / 25.0, abs=1e-12)


def test_compute_screening_complete_inputs_is_not_provisional() -> None:
    playbook = ScreeningPlaybook()
    inputs = ScreeningScoringInputs(
        price_basis=10_000_000.0,
        total_project_cost=10_300_000.0,
        square_feet=100_000.0,
        noi_in_place=900_000.0,
        noi_stabilized=1_100_000.0,
        tenant_credit_score=4.0,
        asset_condition_score=3.0,
        market_dynamics_score=4.0,
    )

    result = compute_screening(playbook, inputs)

    assert result.scores.is_provisional is False
    assert result.scores.overall_score is not None
    assert 1.0 <= result.scores.overall_score <= 5.0
    assert result.scores.hard_filter_failed is False
    assert result.scores.missing_keys == []

    # Stabilized NOI should be used for cap-rate scoring when present.
    assert result.metrics.cap_rate_used == pytest.approx(1_100_000.0 / 10_000_000.0, abs=1e-4)
    assert result.metrics.noi_used == pytest.approx(1_100_000.0, abs=1e-4)


def test_compute_screening_missing_financial_values_does_not_penalize_qualitative_score() -> None:
    playbook = ScreeningPlaybook()
    inputs = ScreeningScoringInputs(
        tenant_credit_score=4.0,
        asset_condition_score=2.0,
        market_dynamics_score=3.0,
    )

    result = compute_screening(playbook, inputs)

    assert result.scores.is_provisional is True
    assert result.scores.financial_score is None
    assert result.scores.qualitative_score == pytest.approx(3.0, abs=1e-9)
    assert result.scores.overall_score == pytest.approx(result.scores.qualitative_score, abs=1e-9)
    assert result.scores.hard_filter_failed is False
    assert "price_basis" in result.scores.missing_keys
    assert "noi_in_place" in result.scores.missing_keys
    assert "noi_stabilized" in result.scores.missing_keys


def test_compute_screening_hard_filter_fails_dscr_only_when_value_present() -> None:
    playbook = ScreeningPlaybook()
    inputs = ScreeningScoringInputs(
        price_basis=10_000_000.0,
        total_project_cost=12_000_000.0,
        square_feet=100_000.0,
        # Use in-place NOI for cashflow/DSCR (lower), stabilized for cap/yield (higher).
        noi_in_place=500_000.0,
        noi_stabilized=1_500_000.0,
        tenant_credit_score=3.0,
        asset_condition_score=3.0,
        market_dynamics_score=3.0,
    )

    result = compute_screening(playbook, inputs)

    assert result.metrics.dscr is not None
    assert result.metrics.dscr < playbook.hard_filters.min_dscr
    assert result.scores.hard_filter_failed is True
    assert "dscr" in result.scores.hard_filter_reasons
    # Cap rate + yield spread should pass for these inputs.
    assert "cap_rate" not in result.scores.hard_filter_reasons
    assert "yield_spread" not in result.scores.hard_filter_reasons


def test_compute_screening_hard_filter_flags_cap_rate_when_below_threshold() -> None:
    playbook = ScreeningPlaybook()
    inputs = ScreeningScoringInputs(
        price_basis=10_000_000.0,
        total_project_cost=12_000_000.0,
        square_feet=100_000.0,
        noi_in_place=1_500_000.0,
        noi_stabilized=600_000.0,  # 6% cap rate
        tenant_credit_score=3.0,
        asset_condition_score=3.0,
        market_dynamics_score=3.0,
    )

    result = compute_screening(playbook, inputs)

    assert result.metrics.cap_rate_used is not None
    assert result.metrics.cap_rate_used < playbook.hard_filters.min_cap_rate
    assert result.scores.hard_filter_failed is True
    assert "cap_rate" in result.scores.hard_filter_reasons


def test_compute_screening_hard_filter_flags_yield_spread_when_below_threshold() -> None:
    playbook = ScreeningPlaybook()
    inputs = ScreeningScoringInputs(
        price_basis=10_000_000.0,
        total_project_cost=12_000_000.0,  # higher cost basis reduces yield on cost
        square_feet=100_000.0,
        noi_in_place=1_200_000.0,
        noi_stabilized=800_000.0,  # cap rate passes (8%), but yield spread fails
        tenant_credit_score=3.0,
        asset_condition_score=3.0,
        market_dynamics_score=3.0,
    )

    result = compute_screening(playbook, inputs)

    assert result.metrics.yield_spread is not None
    assert result.metrics.yield_spread < playbook.hard_filters.min_yield_spread
    assert result.scores.hard_filter_failed is True
    assert "yield_spread" in result.scores.hard_filter_reasons

