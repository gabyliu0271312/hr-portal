# -*- coding: utf-8 -*-
"""Track B 报表字段存在性、权限与成功路径验收测试。"""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, status

from app.reports import router as report_router
from app.reports.router import (
    ReportConfig,
    _collect_export_rows,
    _ensure_valid_report_field_references,
    _iter_report_source_references,
    collect_report_push_rows,
    get_report_push_columns,
)


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def scalars(self):
        return self

    def all(self):
        return self.rows


class _MetadataDb:
    def __init__(self, results):
        self._results = list(results)

    async def execute(self, *_args, **_kwargs):
        return _Result(self._results.pop(0))


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("columns", "hidden", "source_code", "message"),
    [
        ([SimpleNamespace(column_code="amount", is_visible=True)], set(), "r.missing", "不存在"),
        ([SimpleNamespace(column_code="amount", is_visible=False)], set(), "r.amount", "不可见"),
        ([SimpleNamespace(column_code="amount", is_visible=True)], {"amount"}, "r.amount", "无权限"),
    ],
)
async def test_field_reference_validator_rejects_missing_invisible_or_hidden_columns(
    monkeypatch, columns, hidden, source_code, message
):
    from app.datasets import calculated_fields
    from app.permissions import masker

    monkeypatch.setattr(calculated_fields, "active_calculated_fields", AsyncMock(return_value=[]))
    monkeypatch.setattr(masker, "get_hidden_columns", AsyncMock(return_value=hidden))
    db = _MetadataDb([
        [SimpleNamespace(alias="r", table_name="report_rows")],
        columns,
    ])
    config = ReportConfig(columns=[{"source_code": source_code, "instance_id": source_code}])

    with pytest.raises(HTTPException) as exc_info:
        await _ensure_valid_report_field_references(config, 1, SimpleNamespace(id=1), db)

    assert exc_info.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert message in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_field_reference_validator_rejects_hidden_calculated_field_dependency(monkeypatch):
    from app.datasets import calculated_fields
    from app.permissions import masker

    calculated = SimpleNamespace(code="derived_amount", depends_on=["r.amount"])
    monkeypatch.setattr(calculated_fields, "active_calculated_fields", AsyncMock(return_value=[calculated]))
    monkeypatch.setattr(masker, "get_hidden_columns", AsyncMock(return_value={"amount"}))
    db = _MetadataDb([
        [SimpleNamespace(alias="r", table_name="report_rows")],
        [SimpleNamespace(column_code="amount", is_visible=True)],
    ])
    config = ReportConfig(columns=[{"source_code": "calc.derived_amount", "instance_id": "calc.derived_amount"}])

    with pytest.raises(HTTPException) as exc_info:
        await _ensure_valid_report_field_references(config, 1, SimpleNamespace(id=1), db)

    assert exc_info.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "无权限" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_duplicate_instances_keep_export_and_push_identifiers(monkeypatch):
    report = SimpleNamespace(
        id=1,
        name="重复列报表",
        dataset_id=1,
        owner_id=7,
        scope_strategy="inherit",
        config={
            "columns": [
                {"source_code": "r.amount", "instance_id": "r.amount"},
                {"source_code": "r.amount", "instance_id": "r.amount#2"},
            ],
            "aggregate": True,
            "aggregations": {"r.amount": "sum", "r.amount#2": "count"},
        },
    )
    result_columns = [
        {"code": "r.amount", "label": "金额", "data_type": "number", "is_sensitive": False},
        {"code": "r.amount#2", "label": "金额 (2)", "data_type": "number", "is_sensitive": False},
    ]
    result_rows = [{"r.amount": 120, "r.amount#2": 3}]

    class _Db:
        async def get(self, _model, *_args, **_kwargs):
            return SimpleNamespace(id=7)

    from app.reports import sql_builder

    monkeypatch.setattr(report_router, "_ensure_valid_report_field_references", AsyncMock())
    monkeypatch.setattr(sql_builder, "run_dataset_query", AsyncMock(return_value=(result_columns, result_rows, 1)))
    db = _Db()

    labels, matrix, codes, _meta = await _collect_export_rows(report, SimpleNamespace(id=7), db)
    push_rows, push_labels = await collect_report_push_rows(report, db)
    push_columns = await get_report_push_columns(report, db)

    assert labels == ["金额", "金额 (2)"]
    assert codes == ["r.amount", "r.amount#2"]
    assert matrix == [[120, 3]]
    assert push_rows == [{"r.amount": 120, "r.amount#2": 3}]
    assert push_labels == {"r.amount": "金额", "r.amount#2": "金额 (2)"}
    assert [column["code"] for column in push_columns] == ["r.amount", "r.amount#2"]
@pytest.mark.asyncio
async def test_field_reference_validator_accepts_existing_visible_column(monkeypatch):
    from app.datasets import calculated_fields
    from app.permissions import masker

    monkeypatch.setattr(calculated_fields, "active_calculated_fields", AsyncMock(return_value=[]))
    monkeypatch.setattr(masker, "get_hidden_columns", AsyncMock(return_value=set()))
    db = _MetadataDb([
        [SimpleNamespace(alias="r", table_name="report_rows")],
        [SimpleNamespace(column_code="amount", is_visible=True)],
    ])
    config = ReportConfig(columns=[{"source_code": "r.amount", "instance_id": "r.amount"}])

    await _ensure_valid_report_field_references(config, 1, SimpleNamespace(id=1), db)


@pytest.mark.asyncio
async def test_create_report_blocks_missing_output_field_before_persisting(monkeypatch):
    from app.reports.router import ReportIn, create_report

    class _SaveDb(_MetadataDb):
        async def get(self, *_args, **_kwargs):
            return SimpleNamespace(name="报表数据集", warehouse_layer="DWD")

        def add(self, *_args, **_kwargs):
            raise AssertionError("字段校验失败时不得持久化报表")

    from app.datasets import calculated_fields
    from app.permissions import masker

    monkeypatch.setattr(calculated_fields, "active_calculated_fields", AsyncMock(return_value=[]))
    monkeypatch.setattr(masker, "get_hidden_columns", AsyncMock(return_value=set()))
    db = _SaveDb([
        [SimpleNamespace(alias="r", table_name="report_rows")],
        [SimpleNamespace(column_code="amount", is_visible=True)],
        [],
    ])
    payload = ReportIn(
        name="字段校验报表",
        dataset_id=1,
        config={"columns": [{"source_code": "r.missing", "instance_id": "r.missing"}]},
    )

    with pytest.raises(HTTPException) as exc_info:
        await create_report(payload, SimpleNamespace(id=1), db)

    assert exc_info.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "不存在" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_legacy_string_columns_keep_export_path_compatible(monkeypatch):
    report = SimpleNamespace(
        id=2,
        name="旧报表",
        dataset_id=1,
        owner_id=7,
        scope_strategy="inherit",
        config={"columns": ["r.amount"]},
    )
    from app.reports import sql_builder

    monkeypatch.setattr(report_router, "_ensure_valid_report_field_references", AsyncMock())
    monkeypatch.setattr(
        sql_builder,
        "run_dataset_query",
        AsyncMock(return_value=([
            {"code": "r.amount", "label": "金额", "data_type": "number", "is_sensitive": False},
        ], [{"r.amount": 88}], 1)),
    )

    labels, matrix, codes, _meta = await _collect_export_rows(report, SimpleNamespace(id=7), SimpleNamespace())

    assert labels == ["金额"]
    assert codes == ["r.amount"]
    assert matrix == [[88]]

def test_iter_report_source_references_covers_all_query_time_source_codes():
    config = ReportConfig(
        columns=[{"source_code": "r.amount", "instance_id": "r.amount"}],
        filters=[{"column": "r.department", "op": "eq", "value": "HR"}],
        column_settings={
            "r.amount": {"metric_filters": [{"column": "r.status", "op": "eq", "value": "active"}]},
        },
        list_lookup={
            "lookup": {"target_field": "r.employee_no"},
            "sources": [{
                "source_field": "r.employee_no",
                "return_field": "r.department",
                "resolver": {"match_field": "r.name", "return_field": "r.employee_no"},
                "filters": [{"column": "r.status", "op": "eq", "value": "active"}],
            }],
        },
    )

    references = dict(_iter_report_source_references(config))

    assert references == {
        "columns[0].source_code": "r.amount",
        "filters[0].column": "r.department",
        "column_settings.r.amount.metric_filters[0].column": "r.status",
        "list_lookup.lookup.target_field": "r.employee_no",
        "list_lookup.sources[0].source_field": "r.employee_no",
        "list_lookup.sources[0].return_field": "r.department",
        "list_lookup.sources[0].resolver.match_field": "r.name",
        "list_lookup.sources[0].resolver.return_field": "r.employee_no",
        "list_lookup.sources[0].filters[0].column": "r.status",
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("patch", "expected_path", "hidden"),
    [
        ({"filters": [{"column": "r.missing", "op": "eq", "value": 1}]}, "filters[0].column", set()),
        ({"column_settings": {"r.amount": {"metric_filters": [{"column": "r.missing", "op": "eq", "value": 1}]}}}, "column_settings.r.amount.metric_filters[0].column", set()),
        ({"list_lookup": {"lookup": {"target_field": "r.missing"}}}, "list_lookup.lookup.target_field", set()),
        ({"list_lookup": {"sources": [{"source_field": "r.amount", "resolver": {"match_field": "r.secret"}}]}}, "list_lookup.sources[0].resolver.match_field", {"secret"}),
    ],
)
async def test_source_reference_validator_rejects_invalid_query_time_references(
    monkeypatch, patch, expected_path, hidden
):
    from app.datasets import calculated_fields
    from app.permissions import masker

    monkeypatch.setattr(calculated_fields, "active_calculated_fields", AsyncMock(return_value=[]))
    monkeypatch.setattr(masker, "get_hidden_columns", AsyncMock(return_value=hidden))
    db = _MetadataDb([
        [SimpleNamespace(alias="r", table_name="report_rows")],
        [
            SimpleNamespace(column_code="amount", is_visible=True),
            SimpleNamespace(column_code="department", is_visible=True),
            SimpleNamespace(column_code="employee_no", is_visible=True),
            SimpleNamespace(column_code="name", is_visible=True),
            SimpleNamespace(column_code="secret", is_visible=True),
            SimpleNamespace(column_code="status", is_visible=True),
        ],
    ])
    config = ReportConfig(columns=[{"source_code": "r.amount", "instance_id": "r.amount"}], **patch)

    with pytest.raises(HTTPException) as exc_info:
        await _ensure_valid_report_field_references(config, 1, SimpleNamespace(id=1), db)

    assert exc_info.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert expected_path in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_source_reference_validator_rejects_invalid_runtime_filter(monkeypatch):
    from app.datasets import calculated_fields
    from app.permissions import masker

    monkeypatch.setattr(calculated_fields, "active_calculated_fields", AsyncMock(return_value=[]))
    monkeypatch.setattr(masker, "get_hidden_columns", AsyncMock(return_value=set()))
    db = _MetadataDb([
        [SimpleNamespace(alias="r", table_name="report_rows")],
        [SimpleNamespace(column_code="amount", is_visible=True)],
    ])
    config = ReportConfig(columns=[{"source_code": "r.amount", "instance_id": "r.amount"}])

    with pytest.raises(HTTPException) as exc_info:
        await _ensure_valid_report_field_references(
            config, 1, SimpleNamespace(id=1), db,
            runtime_filters=[{"column": "r.missing", "op": "eq", "value": 1}],
        )

    assert exc_info.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "runtime_filters[0].column" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_create_report_blocks_missing_filter_field_before_persisting(monkeypatch):
    from app.reports.router import ReportIn, create_report
    from app.datasets import calculated_fields
    from app.permissions import masker

    class _SaveDb(_MetadataDb):
        async def get(self, *_args, **_kwargs):
            return SimpleNamespace(name="报表数据集", warehouse_layer="DWD")

        def add(self, *_args, **_kwargs):
            raise AssertionError("字段校验失败时不得持久化报表")

    monkeypatch.setattr(calculated_fields, "active_calculated_fields", AsyncMock(return_value=[]))
    monkeypatch.setattr(masker, "get_hidden_columns", AsyncMock(return_value=set()))
    db = _SaveDb([
        [SimpleNamespace(alias="r", table_name="report_rows")],
        [SimpleNamespace(column_code="amount", is_visible=True)],
    ])
    payload = ReportIn(
        name="筛选字段校验报表",
        dataset_id=1,
        config={
            "columns": [{"source_code": "r.amount", "instance_id": "r.amount"}],
            "filters": [{"column": "r.missing", "op": "eq", "value": 1}],
        },
    )

    with pytest.raises(HTTPException) as exc_info:
        await create_report(payload, SimpleNamespace(id=1), db)

    assert exc_info.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "filters[0].column" in str(exc_info.value.detail)
@pytest.mark.asyncio
async def test_invalid_filter_returns_422_in_run_export_and_push_paths(monkeypatch):
    from app.datasets import calculated_fields
    from app.permissions import masker
    from app.reports.router import push_report, run_report

    report = SimpleNamespace(
        id=11,
        name="历史脏筛选报表",
        dataset_id=1,
        owner_id=7,
        scope_strategy="inherit",
        config={
            "columns": [{"source_code": "r.amount", "instance_id": "r.amount"}],
            "filters": [{"column": "r.missing", "op": "eq", "value": 1}],
        },
    )

    class _RouteDb(_MetadataDb):
        async def get(self, model, *_args, **_kwargs):
            return report if model.__name__ == "Report" else SimpleNamespace(id=7)

    def db_for_path():
        return _RouteDb([
            [SimpleNamespace(alias="r", table_name="report_rows")],
            [SimpleNamespace(column_code="amount", is_visible=True)],
        ])

    monkeypatch.setattr(calculated_fields, "active_calculated_fields", AsyncMock(return_value=[]))
    monkeypatch.setattr(masker, "get_hidden_columns", AsyncMock(return_value=set()))
    monkeypatch.setattr(report_router, "_can_access", AsyncMock(return_value=True))
    monkeypatch.setattr(report_router, "_can_edit", AsyncMock(return_value=True))

    with pytest.raises(HTTPException) as run_error:
        await run_report(11, user=SimpleNamespace(id=7), db=db_for_path())
    assert run_error.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "filters[0].column" in str(run_error.value.detail)

    with pytest.raises(HTTPException) as export_error:
        await _collect_export_rows(report, SimpleNamespace(id=7), db_for_path())
    assert export_error.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "filters[0].column" in str(export_error.value.detail)

    with pytest.raises(HTTPException) as push_columns_error:
        await get_report_push_columns(report, db_for_path())
    assert push_columns_error.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "filters[0].column" in str(push_columns_error.value.detail)

    with pytest.raises(HTTPException) as push_error:
        await push_report(11, user=SimpleNamespace(id=7), db=db_for_path())
    assert push_error.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "filters[0].column" in str(push_error.value.detail)
