from __future__ import annotations

import json

import pytest

from app.reports.config import ReportConfig
from app.reports.dimension_merge import (
    apply_dimension_merge,
    combination_key,
    normalize_typed_value,
    partition_dimension_filters,
    validate_dimension_merge_structure,
)


def _config(rules: list[dict], *, aggregate: bool = True, transpose: dict | None = None) -> ReportConfig:
    return ReportConfig(
        columns=["t.a", "t.b", "t.amount"],
        aggregate=aggregate,
        transpose=transpose or {},
        dimension_merge_rules=rules,
    )


def _rule(rule_id: str, sources: list[dict], target: dict, name: str | None = None) -> dict:
    return {
        "id": rule_id,
        "name": name or rule_id,
        "dimension_signature": ["t.a", "t.b"],
        "sources": [{"values": item} for item in sources],
        "target": {
            "values": target,
            "modes": {"t.a": "source", "t.b": "custom"},
        },
    }


def test_typed_values_keep_empty_zero_and_false_distinct() -> None:
    assert normalize_typed_value(None) != normalize_typed_value("")
    assert normalize_typed_value(0) != normalize_typed_value("0")
    assert normalize_typed_value(False) != normalize_typed_value(0)
    assert normalize_typed_value(1, "number") == normalize_typed_value("1.0", "number")


def test_apply_dimension_merge_maps_once_and_keeps_unmatched_rows() -> None:
    rules = [
        _rule("r1", [{"t.a": 2, "t.b": "y"}], {"t.a": 1, "t.b": "x"}),
        _rule("r2", [{"t.a": 1, "t.b": "x"}], {"t.a": 3, "t.b": "z"}),
    ]
    rows = [
        {"t.a": 2, "t.b": "y", "t.amount": 20},
        {"t.a": 9, "t.b": "n", "t.amount": 10},
    ]

    assert apply_dimension_merge(rows, rules) == [
        {"t.a": 1, "t.b": "x", "t.amount": 20},
        {"t.a": 9, "t.b": "n", "t.amount": 10},
    ]


def test_partition_dimension_filters_defers_only_merged_dimensions() -> None:
    before, after = partition_dimension_filters(
        [
            {"column": "t.a", "op": "eq", "value": 1},
            {"column": "t.period", "op": "eq", "value": "2026-01"},
        ],
        ["t.a", "t.b"],
    )
    assert before == [{"column": "t.period", "op": "eq", "value": "2026-01"}]
    assert after == [{"column": "t.a", "op": "eq", "value": 1}]


def test_validate_rejects_duplicate_source_and_chain() -> None:
    config = _config([
        _rule("r1", [{"t.a": 2, "t.b": "y"}], {"t.a": 1, "t.b": "x"}),
        _rule("r2", [{"t.a": 1, "t.b": "x"}], {"t.a": 3, "t.b": "z"}),
    ])
    with pytest.raises(ValueError) as exc:
        validate_dimension_merge_structure(config)
    payload = json.loads(str(exc.value))
    assert any(item["code"] == "DIMENSION_MERGE_CHAIN" for item in payload["errors"])


def test_validate_allows_multiple_sources_targeting_one_source() -> None:
    config = _config([
        _rule(
            "r1",
            [{"t.a": 1, "t.b": "x"}, {"t.a": 2, "t.b": "y"}],
            {"t.a": 1, "t.b": "x"},
        )
    ])
    validate_dimension_merge_structure(config)


def test_validate_rejects_noop_detail_and_structural_reshape() -> None:
    no_op = _config([_rule("r1", [{"t.a": 1, "t.b": "x"}], {"t.a": 1, "t.b": "x"})])
    with pytest.raises(ValueError, match="DIMENSION_MERGE_NOOP"):
        validate_dimension_merge_structure(no_op)

    detail = _config([_rule("r1", [{"t.a": 1, "t.b": "x"}], {"t.a": 2, "t.b": "x"})], aggregate=False)
    with pytest.raises(ValueError, match="DIMENSION_MERGE_REQUIRES_AGGREGATE"):
        validate_dimension_merge_structure(detail)

    reshape = _config(
        [_rule("r1", [{"t.a": 1, "t.b": "x"}], {"t.a": 2, "t.b": "x"})],
        transpose={"column_to_row": {"enabled": True}},
    )
    with pytest.raises(ValueError, match="DIMENSION_MERGE_STRUCTURAL_RESHAPE_CONFLICT"):
        validate_dimension_merge_structure(reshape)


def test_apply_dimension_merge_scales_to_ten_thousand_sources() -> None:
    rules = [
        _rule(f"r{i}", [{"t.a": i, "t.b": "x"}], {"t.a": i + 10_000, "t.b": "x"})
        for i in range(10_000)
    ]
    rows = [{"t.a": i, "t.b": "x", "t.amount": 1} for i in range(10_000)]

    result = apply_dimension_merge(rows, rules, {"t.a": "number", "t.b": "string"})

    assert len(result) == 10_000
    assert result[0]["t.a"] == 10_000
    assert result[-1]["t.a"] == 19_999


def test_expand_rule_reuses_party_cost_mapping_per_month() -> None:
    rules = [{
        "id": "monthly-party-cost",
        "name": "按月归并甲方成本中心",
        "mode": "expand",
        "expand_by": ["t.month"],
        "dimension_signature": ["t.month", "t.party", "t.cost_center"],
        "sources": [
            {"values": {"t.party": "甲方1", "t.cost_center": "成本中心1"}},
            {"values": {"t.party": "甲方2", "t.cost_center": "成本中心2"}},
        ],
        "target": {
            "values": {"t.party": "甲方1", "t.cost_center": "成本中心1"},
            "modes": {"t.month": "preserve", "t.party": "source", "t.cost_center": "source"},
        },
    }]
    rows = [
        {"t.month": "2026-01", "t.party": "甲方1", "t.cost_center": "成本中心1", "t.amount": 10},
        {"t.month": "2026-01", "t.party": "甲方2", "t.cost_center": "成本中心2", "t.amount": 20},
        {"t.month": "2026-02", "t.party": "甲方1", "t.cost_center": "成本中心1", "t.amount": 30},
        {"t.month": "2026-02", "t.party": "甲方2", "t.cost_center": "成本中心2", "t.amount": 40},
        {"t.month": "2026-01", "t.party": "甲方3", "t.cost_center": "成本中心3", "t.amount": 50},
    ]

    result = apply_dimension_merge(rows, rules)

    assert [row["t.month"] for row in result[:4]] == ["2026-01", "2026-01", "2026-02", "2026-02"]
    assert all(row["t.party"] == "甲方1" and row["t.cost_center"] == "成本中心1" for row in result[:4])
    assert result[4]["t.party"] == "甲方3"


def test_expand_rule_requires_preserved_expand_dimension() -> None:
    config = ReportConfig(
        columns=["t.month", "t.party", "t.cost_center", "t.amount"],
        aggregate=True,
        aggregations={"t.amount": "sum"},
        dimension_merge_rules=[{
            "id": "monthly-party-cost",
            "name": "按月归并甲方成本中心",
            "mode": "expand",
            "expand_by": ["t.month"],
            "dimension_signature": ["t.month", "t.party", "t.cost_center"],
            "sources": [
                {"values": {"t.party": "甲方1", "t.cost_center": "成本中心1"}},
                {"values": {"t.party": "甲方2", "t.cost_center": "成本中心2"}},
            ],
            "target": {
                "values": {"t.party": "甲方1", "t.cost_center": "成本中心1"},
                "modes": {"t.month": "preserve", "t.party": "source", "t.cost_center": "source"},
            },
        }],
    )

    validate_dimension_merge_structure(config)
    left = combination_key({"a": 1, "b": "x"}, ["a", "b"], {"a": "number"})
    right = combination_key({"b": "x", "a": "1.0"}, ["a", "b"], {"a": "number"})
    assert left == right
