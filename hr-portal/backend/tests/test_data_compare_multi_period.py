from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.data_compare.chat_handler import _run_multi_period_compare
from app.data_compare.schemas import (
    AmountSpec,
    CompareSpec,
    CompareType,
    DataSource,
    MetricDef,
    PeriodRange,
    RosterSpec,
)


def _roster_spec():
    return CompareSpec(
        compare_type=CompareType.ROSTER,
        source_a=DataSource(table="a", period_range=PeriodRange(start="202601", end="202602")),
        source_b=DataSource(table="b", period_range=PeriodRange(start="202601", end="202602")),
        period_execution={"mode": "per_period", "alignment": "same_period"},
        join_keys=["employee_no"],
        roster=RosterSpec(),
    )


def _amount_spec():
    return CompareSpec(
        compare_type=CompareType.AMOUNT,
        source_a=DataSource(table="a", period_range=PeriodRange(start="202601", end="202602")),
        source_b=DataSource(table="b", period_range=PeriodRange(start="202601", end="202602")),
        period_execution={"mode": "per_period", "alignment": "same_period"},
        join_keys=["employee_no"],
        amount=AmountSpec(
            metric_a=MetricDef(field="amount"),
            metric_b=MetricDef(field="amount"),
            group_by=["employee_no"],
        ),
    )


def _loader():
    meta_a = SimpleNamespace(table_label="A", is_period=True, scope_strategy=None)
    meta_b = SimpleNamespace(table_label="B", is_period=True, scope_strategy=None)
    return SimpleNamespace(
        get_table=AsyncMock(side_effect=lambda table: meta_a if table == "a" else meta_b),
    )


@pytest.mark.asyncio
async def test_all_months_data_incomplete_is_not_failed():
    spec = _roster_spec()
    db = object()
    with patch("app.data_compare.chat_handler.MetadataLoader", return_value=_loader()), \
         patch("app.data_compare.chat_handler.build_scope_for_compare", new=AsyncMock(return_value=("true", "true"))), \
         patch("app.data_compare.chat_handler.run_data_compare", new=AsyncMock()) as run_compare, \
         patch("app.data_compare.periods.resolve_period_range") as resolve:
        resolve.return_value = SimpleNamespace(
            resolved_periods=["202601", "202602"],
            model_dump=lambda mode=None: {"resolved_periods": ["202601", "202602"]},
        )
        with patch("app.data_compare.executor.source_has_data", new=AsyncMock(side_effect=[True, False, True, False])):
            result = await _run_multi_period_compare(spec, SimpleNamespace(id=1), db)

    assert result["status"] == "data_incomplete"
    assert run_compare.await_count == 0


@pytest.mark.asyncio
async def test_multi_period_detail_limit_and_partial_success():
    spec = _roster_spec()
    spec.output.max_detail = 1
    db = object()
    month_result = {
        "status": "consistent", "summary": {"total_compared": 1, "matched_count": 1, "diff_count": 0,
        "only_in_a_count": 0, "only_in_b_count": 0, "total_amount_a": None, "total_amount_b": None, "amount_diff": None},
        "details": [{"employee_no": "E1"}], "duration_ms": 1,
    }
    with patch("app.data_compare.chat_handler.MetadataLoader", return_value=_loader()), \
         patch("app.data_compare.chat_handler.build_scope_for_compare", new=AsyncMock(return_value=("true", "true"))), \
         patch("app.data_compare.chat_handler.run_data_compare", new=AsyncMock(return_value=month_result)), \
         patch("app.data_compare.periods.resolve_period_range") as resolve, \
         patch("app.data_compare.executor.source_has_data", new=AsyncMock(side_effect=[True, True, True, False])):
        resolve.return_value = SimpleNamespace(
            resolved_periods=["202601", "202602"],
            model_dump=lambda mode=None: {"resolved_periods": ["202601", "202602"]},
        )
        result = await _run_multi_period_compare(spec, SimpleNamespace(id=1), db)

    assert result["status"] == "partial_success"
    assert result["detail_truncated"] is False
    assert len(result["details"]) == 1


@pytest.mark.asyncio
async def test_incomplete_month_hides_multi_period_amount_totals():
    spec = _amount_spec()
    db = object()
    month_result = {
        "status": "consistent", "summary": {"total_compared": 1, "matched_count": 1, "diff_count": 0,
        "only_in_a_count": 0, "only_in_b_count": 0, "total_amount_a": 100.0, "total_amount_b": 100.0, "amount_diff": 0.0},
        "details": [], "duration_ms": 1,
    }
    with patch("app.data_compare.chat_handler.MetadataLoader", return_value=_loader()), \
         patch("app.data_compare.chat_handler.build_scope_for_compare", new=AsyncMock(return_value=("true", "true"))), \
         patch("app.data_compare.chat_handler.run_data_compare", new=AsyncMock(return_value=month_result)), \
         patch("app.data_compare.periods.resolve_period_range") as resolve, \
         patch("app.data_compare.executor.source_has_data", new=AsyncMock(side_effect=[True, True, True, False])):
        resolve.return_value = SimpleNamespace(
            resolved_periods=["202601", "202602"],
            model_dump=lambda mode=None: {"resolved_periods": ["202601", "202602"]},
        )
        result = await _run_multi_period_compare(spec, SimpleNamespace(id=1), db)

    assert result["status"] == "partial_success"
    assert result["summary"]["total_amount_a"] is None
    assert result["summary"]["total_amount_b"] is None
    assert result["summary"]["amount_diff"] is None
