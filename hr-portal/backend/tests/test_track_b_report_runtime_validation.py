# -*- coding: utf-8 -*-
"""Track B 运行期列实例引用校验测试。"""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, status

from app.reports import router as report_router
from app.reports.router import (
    ReportConfig,
    _apply_runtime_overrides,
    _collect_export_rows,
    _ensure_valid_report_config,
    _ensure_valid_runtime_filters,
    get_report_push_columns,
    push_report,
    run_report,
)


def _stale_sort_config() -> dict:
    return {
        "columns": [{"source_code": "emp.amount", "instance_id": "emp.amount"}],
        "sorts": [{"column": "emp.amount#2", "order": "asc"}],
    }


def _report(config: dict) -> SimpleNamespace:
    return SimpleNamespace(
        id=1,
        name="列实例验收报表",
        dataset_id=1,
        owner_id=1,
        scope_strategy="inherit",
        config=config,
    )


@pytest.mark.parametrize(
    ("config", "expected_path"),
    [
        ({"aggregations": {"emp.amount#2": "sum"}}, "aggregations"),
        ({"transpose": {"column_to_row": {"source_cols": ["emp.amount#2"]}}}, "transpose.column_to_row.source_cols[0]"),
        ({"rounding_corrections": [{"group_by": "emp.amount#2", "target_cols": []}]}, "rounding_corrections[0].group_by[0]"),
    ],
)
def test_runtime_validator_rejects_stale_output_references(config: dict, expected_path: str):
    merged = {
        "columns": [{"source_code": "emp.amount", "instance_id": "emp.amount"}],
        **config,
    }

    with pytest.raises(HTTPException) as exc_info:
        _ensure_valid_report_config(ReportConfig(**merged))

    assert exc_info.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert expected_path in str(exc_info.value.detail)


def test_runtime_validator_rejects_instance_suffix_in_runtime_filter():
    config = ReportConfig(columns=[{"source_code": "emp.amount", "instance_id": "emp.amount"}])

    with pytest.raises(HTTPException) as exc_info:
        _ensure_valid_runtime_filters(config, [{"column": "emp.amount#2", "op": "eq", "value": 1}])

    assert exc_info.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "filters.column" in str(exc_info.value.detail)


def test_runtime_validator_accepts_source_code_runtime_filter():
    config = ReportConfig(
        columns=[{"source_code": "emp.amount", "instance_id": "emp.amount"}],
        filters=[{"column": "emp.amount", "op": "eq", "value": 1}],
    )

    _ensure_valid_runtime_filters(config, [{"column": "emp.amount", "op": "eq", "value": 2}])
    overridden = _apply_runtime_overrides(config, [{"column": "emp.amount", "op": "eq", "value": 2}])

    assert overridden.filters[0].column == "emp.amount"
    assert overridden.filters[0].value == 2


@pytest.mark.asyncio
async def test_run_export_push_paths_return_422_for_stale_config(monkeypatch):
    report = _report(_stale_sort_config())

    class DummyDb:
        async def get(self, model, *_args, **_kwargs):
            return report if model.__name__ == "Report" else SimpleNamespace(id=1)

    db = DummyDb()
    monkeypatch.setattr(report_router, "_can_access", AsyncMock(return_value=True))
    monkeypatch.setattr(report_router, "_can_edit", AsyncMock(return_value=True))

    with pytest.raises(HTTPException) as run_error:
        await run_report(1, user=SimpleNamespace(id=1), db=db)
    assert run_error.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    with pytest.raises(HTTPException) as export_error:
        await _collect_export_rows(report, SimpleNamespace(id=1), db)
    assert export_error.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    with pytest.raises(HTTPException) as push_columns_error:
        await get_report_push_columns(report, db)
    assert push_columns_error.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    with pytest.raises(HTTPException) as push_error:
        await push_report(1, user=SimpleNamespace(id=1), db=db)
    assert push_error.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
