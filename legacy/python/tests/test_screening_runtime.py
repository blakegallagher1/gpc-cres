from tools.screening_runtime import (
    _parse_number,
    apply_score_overrides,
    build_screening_inputs,
    find_low_confidence_keys,
)


def test_parse_number_handles_percent_and_currency():
    assert _parse_number("7.5%") == 0.075
    assert _parse_number("$1,250,000") == 1250000.0
    assert _parse_number("  ") is None


def test_build_screening_inputs_prefers_overrides():
    field_values = [
        {"field_key": "noi_in_place", "value_number": 100000},
        {"field_key": "asking_price", "value_number": 1000000},
    ]
    overrides = [
        {"scope": "field", "field_key": "noi_in_place", "value_number": 150000}
    ]
    inputs = build_screening_inputs(field_values, overrides)
    assert inputs.noi_in_place == 150000
    assert inputs.price_basis == 1000000


def test_low_confidence_ignores_overridden_fields():
    field_values = [
        {"field_key": "noi_in_place", "confidence": 0.3},
        {"field_key": "asset_condition_score", "confidence": 0.2},
    ]
    overrides = [{"scope": "field", "field_key": "noi_in_place"}]
    low_confidence = find_low_confidence_keys(field_values, 0.5, overrides)
    assert low_confidence == ["asset_condition_score"]


def test_apply_score_overrides_updates_scores():
    base = {"overall_score": 3.2, "financial_score": 3.0, "qualitative_score": 3.4}
    overrides = [
        {"scope": "score", "field_key": "overall_score", "value_number": 4.1},
        {"scope": "score", "field_key": "qualitative_score", "value_number": 4.0},
    ]
    updated = apply_score_overrides(base, overrides)
    assert updated["overall_score"] == 4.1
    assert updated["qualitative_score"] == 4.0
    assert updated["financial_score"] == 3.0
