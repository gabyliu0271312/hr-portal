# -*- coding: utf-8 -*-
"""Track B 报表字段存在性、权限与成功路径验收测试。"""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, status

from app.reports import router as report_router
from app.datasets.models import DataSet
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
        ([SimpleNamespace(column_code="amount")], set(), "r.missing", "不存在"),
        ([SimpleNamespace(column_code="amount")], {"amount"}, "r.amount", "无权限"),
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
async def test_field_reference_validator_accepts_legacy_alias_without_rewriting_config(monkeypatch):
    from app.datasets import calculated_fields
    from app.permissions import masker

    monkeypatch.setattr(calculated_fields, "active_calculated_fields", AsyncMock(return_value=[]))
    monkeypatch.setattr(masker, "get_hidden_columns", AsyncMock(return_value=set()))
    table = SimpleNamespace(alias="current", table_name="dwd_emp_realtime_roster")
    column = SimpleNamespace(column_code="employee_no")
    db = _MetadataDb([
        [table],
        [column],
        [],
    ])
    config = ReportConfig(
        columns=[{
            "source_code": "dwd_current.employee_no",
            "instance_id": "dwd_current.employee_no",
            "label": "dwd_current.employee_no",
        }],
        filters=[{"column": "dwd_current.employee_no", "value": "dwd_current.employee_no"}],
    )
    original = config.model_dump()

    await _ensure_valid_report_field_references(config, 16, SimpleNamespace(id=4), db)

    assert config.model_dump() == original


@pytest.mark.asyncio
async def test_field_reference_validator_rejects_hidden_calculated_field_dependency(monkeypatch):
    from app.datasets import calculated_fields
    from app.permissions import masker

    calculated = SimpleNamespace(code="derived_amount", depends_on=["r.amount"])
    monkeypatch.setattr(calculated_fields, "active_calculated_fields", AsyncMock(return_value=[calculated]))
    monkeypatch.setattr(masker, "get_hidden_columns", AsyncMock(return_value={"amount"}))
    db = _MetadataDb([
        [SimpleNamespace(alias="r", table_name="report_rows")],
        [SimpleNamespace(column_code="amount")],
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
        async def get(self, model, *_args, **_kwargs):
            if model is DataSet:
                return DataSet(id=1, created_by=7, is_active=True, status="published")
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
        [SimpleNamespace(column_code="amount")],
    ])
    config = ReportConfig(columns=[{"source_code": "r.amount", "instance_id": "r.amount"}])

    await _ensure_valid_report_field_references(config, 1, SimpleNamespace(id=1), db)


@pytest.mark.asyncio
async def test_create_report_blocks_missing_output_field_before_persisting(monkeypatch):
    from app.reports.router import ReportIn, create_report

    from app.datasets import router as datasets_router
    monkeypatch.setattr(datasets_router, "_can_access", AsyncMock(return_value=True))

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
        [SimpleNamespace(column_code="amount")],
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

    db = SimpleNamespace(get=AsyncMock(return_value=DataSet(id=1, created_by=7, is_active=True, status="published")))
    labels, matrix, codes, _meta = await _collect_export_rows(report, SimpleNamespace(id=7), db)

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
            SimpleNamespace(column_code="amount"),
            SimpleNamespace(column_code="department"),
            SimpleNamespace(column_code="employee_no"),
            SimpleNamespace(column_code="name"),
            SimpleNamespace(column_code="secret"),
            SimpleNamespace(column_code="status"),
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
        [SimpleNamespace(column_code="amount")],
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
    from app.datasets import router as datasets_router
    from app.permissions import masker

    monkeypatch.setattr(datasets_router, "_can_access", AsyncMock(return_value=True))

    class _SaveDb(_MetadataDb):
        async def get(self, *_args, **_kwargs):
            return SimpleNamespace(name="报表数据集", warehouse_layer="DWD")

        def add(self, *_args, **_kwargs):
            raise AssertionError("字段校验失败时不得持久化报表")

    monkeypatch.setattr(calculated_fields, "active_calculated_fields", AsyncMock(return_value=[]))
    monkeypatch.setattr(masker, "get_hidden_columns", AsyncMock(return_value=set()))
    db = _SaveDb([
        [SimpleNamespace(alias="r", table_name="report_rows")],
        [SimpleNamespace(column_code="amount")],
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
@pytest.mark.parametrize("operation", ["create", "update"])
@pytest.mark.parametrize("access", ["denied", "owner", "user_acl", "role_acl", "super_admin"])
@pytest.mark.parametrize("visibility", ["private", "scoped", "public"])
async def test_report_save_requires_dataset_access(monkeypatch, operation, access, visibility):
    authorized = access != "denied"
    dataset = DataSet(id=15, name="报表数据集", warehouse_layer="DWD", created_by=7 if access == "owner" else 9)
    report = SimpleNamespace(id=23, name="原报表", dataset_id=11, owner_id=7, config={})
    user = SimpleNamespace(id=7)
    acl_rows = {
        "user_acl": [SimpleNamespace(user_id=7, role_id=None)],
        "role_acl": [SimpleNamespace(user_id=None, role_id=3)],
    }

    class _SaveDb(_MetadataDb):
        def __init__(self):
            super().__init__([
                [("超级管理员",)] if access == "super_admin" else [],
                acl_rows.get(access, []),
                [(3,)],
            ])
            self.added = []
            self.commit = AsyncMock()

        async def get(self, model, _id):
            return dataset if model is DataSet else report

        def add(self, row):
            self.added.append(row)
            row.id = 23

        async def flush(self):
            pass

        async def refresh(self, _row):
            pass

    db = _SaveDb()
    field_validator = AsyncMock()
    acl_writer = AsyncMock()
    monkeypatch.setattr(report_router, "_ensure_valid_report_field_references", field_validator)
    monkeypatch.setattr(report_router, "_replace_report_acl", acl_writer)
    monkeypatch.setattr(report_router, "_to_out", AsyncMock(return_value=report))
    monkeypatch.setattr(report_router, "record_report_audit", AsyncMock())
    payload = report_router.ReportIn(name="新报表", dataset_id=15, visibility=visibility)

    if not authorized:
        with pytest.raises(HTTPException) as error:
            if operation == "create":
                await report_router.create_report(payload, user, db)
            else:
                await report_router.update_report(23, payload, user, db)
        assert error.value.status_code == status.HTTP_403_FORBIDDEN
        assert report.name == "原报表" and report.dataset_id == 11
        assert db.added == []
        db.commit.assert_not_awaited()
        field_validator.assert_not_awaited()
        acl_writer.assert_not_awaited()
    else:
        result = (await report_router.create_report(payload, user, db) if operation == "create"
                  else await report_router.update_report(23, payload, user, db))
        assert result is report
        assert db.commit.await_count == 1
        field_validator.assert_awaited_once()
        acl_writer.assert_awaited_once()
        if operation == "update":
            assert report.dataset_id == 15 and report.name == "新报表"


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
            if model is DataSet:
                return DataSet(id=1, created_by=7, is_active=True, status="published")
            return report if model.__name__ == "Report" else SimpleNamespace(id=7)

    def db_for_path():
        return _RouteDb([
            [SimpleNamespace(alias="r", table_name="report_rows")],
            [SimpleNamespace(column_code="amount")],
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


@pytest.mark.asyncio
@pytest.mark.parametrize("tables", [
    [SimpleNamespace(alias="current", table_name="emp_realtime_roster")],
    [SimpleNamespace(alias="current", table_name="dwd_roster"),
     SimpleNamespace(alias="second", table_name="dwd_salary")],
])
async def test_legacy_alias_does_not_guess_non_dwd_or_multitable_sources(monkeypatch, tables):
    from app.datasets import calculated_fields
    from app.permissions import masker

    monkeypatch.setattr(calculated_fields, "active_calculated_fields", AsyncMock(return_value=[]))
    monkeypatch.setattr(masker, "get_hidden_columns", AsyncMock(return_value=set()))
    columns = [SimpleNamespace(column_code="employee_no")]
    db = _MetadataDb([tables, *[columns for _ in tables]])
    config = ReportConfig(columns=["dwd_current.employee_no"])
    with pytest.raises(HTTPException) as error:
        await _ensure_valid_report_field_references(config, 16, SimpleNamespace(id=4), db)
    assert error.value.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("hidden", [{"employee_no"}])
async def test_legacy_alias_keeps_current_field_permission_checks(monkeypatch, hidden):
    from app.datasets import calculated_fields
    from app.permissions import masker

    monkeypatch.setattr(calculated_fields, "active_calculated_fields", AsyncMock(return_value=[]))
    monkeypatch.setattr(masker, "get_hidden_columns", AsyncMock(return_value=hidden))
    db = _MetadataDb([
        [SimpleNamespace(alias="current", table_name="dwd_roster")],
        [SimpleNamespace(column_code="employee_no")],
    ])
    config = ReportConfig(columns=["dwd_current.employee_no"])
    with pytest.raises(HTTPException) as error:
        await _ensure_valid_report_field_references(config, 16, SimpleNamespace(id=4), db)
    assert error.value.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("channel", ["run", "csv", "xlsx", "export_rows", "push", "push_columns", "scheduled"])
async def test_scope_configuration_error_propagates_without_export_or_push(channel, monkeypatch):
    from app.core import db as core_db
    from app.reports import quality_gate, report_service, sql_builder

    owner = SimpleNamespace(id=7)
    report = SimpleNamespace(
        id=11, name="scope test", dataset_id=15, owner_id=7, scope_strategy="cc_first",
        config={"columns": ["r.amount"]}, last_run_at=None, run_count=0,
    )
    db = SimpleNamespace(get=AsyncMock(side_effect=lambda model, *_: DataSet(id=15, created_by=7, is_active=True, status="published") if model is DataSet else report if model.__name__ == "Report" else owner),
                         commit=AsyncMock())
    error = HTTPException(status_code=409, detail="[REPORT_SCOPE_CONFIGURATION_INVALID] 数据范围配置未完成，请联系管理员")
    async def denied_query(**kwargs):
        kwargs["scope_decisions_sink"].append({
            "alias": "r", "table_name": "allocation", "strategy": "cc_first",
            "decision": "configuration_invalid", "reason_code": "STRATEGY_UNRESOLVABLE", "restricted": False,
        })
        raise error

    query = AsyncMock(side_effect=denied_query)
    from app.reports import audit
    audit_scope = AsyncMock()
    monkeypatch.setattr(audit, "record_scope_audit", audit_scope)
    monkeypatch.setattr(sql_builder, "run_dataset_query", query)
    monkeypatch.setattr(report_router, "_can_access", AsyncMock(return_value=True))
    monkeypatch.setattr(report_router, "_ensure_valid_report_field_references", AsyncMock())
    monkeypatch.setattr(report_router, "record_report_audit", AsyncMock())
    monkeypatch.setattr(report_service, "ensure_valid_report_field_references", AsyncMock())
    monkeypatch.setattr(quality_gate, "enforce_report_quality", AsyncMock())

    class _Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

    from app.automation import events
    monkeypatch.setattr(core_db, "get_session_factory", lambda: _Session)
    monkeypatch.setattr(events, "publish_event", AsyncMock())
    with pytest.raises(HTTPException) as raised:
        if channel == "run":
            await report_router.run_report(11, page=1, page_size=1, user=owner, db=db)
        elif channel == "csv":
            await report_router.export_report_csv(11, runtime_filters=None, user=owner, db=db)
        elif channel == "xlsx":
            await report_router.export_report_xlsx(11, runtime_filters=None, user=owner, db=db)
        elif channel == "export_rows":
            await _collect_export_rows(report, owner, db)
        elif channel == "push":
            await collect_report_push_rows(report, db)
        elif channel == "push_columns":
            await get_report_push_columns(report, db)
        else:
            await report_service.run_report_query(report, db)
    assert raised.value is error
    assert query.await_args.kwargs["user"] is owner
    audit_scope.assert_awaited_once()
    recorded = audit_scope.await_args.kwargs
    assert recorded["user"] is owner and recorded["report_id"] == 11
    assert recorded["channel"] == channel
    assert recorded["query_status"] == "failed"
    assert recorded["decisions"][0]["reason_code"] == "STRATEGY_UNRESOLVABLE"
    db.commit.assert_not_awaited()
    assert report.run_count == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("channel", ["run", "csv", "xlsx", "export_rows", "push", "push_columns", "scheduled"])
async def test_successful_query_scope_audit_uses_actual_actor_and_channel(channel, monkeypatch):
    from app.core import db as core_db
    from app.reports import audit, quality_gate, report_service, sql_builder
    from app.automation import events

    owner = SimpleNamespace(id=7)
    report = SimpleNamespace(
        id=11, name="scope test", dataset_id=15, owner_id=7, scope_strategy="person_first",
        config={"columns": ["r.amount"]}, last_run_at=None, run_count=0,
    )
    db = SimpleNamespace(
        get=AsyncMock(side_effect=lambda model, *_: DataSet(id=15, created_by=7, is_active=True, status="published") if model is DataSet else report if model.__name__ == "Report" else owner),
        commit=AsyncMock(),
    )
    async def query(**kwargs):
        kwargs["scope_decisions_sink"].append({
            "alias": "r", "table_name": "salary", "strategy": "person_first", "decision": "restricted",
            "reason_code": "ROW_SCOPE_APPLIED", "restricted": True,
        })
        return [{"code": "r.amount", "label": "金额", "data_type": "number", "is_sensitive": False}], [{"r.amount": "12"}], 1

    audit_scope = AsyncMock()
    monkeypatch.setattr(audit, "record_scope_audit", audit_scope)
    monkeypatch.setattr(sql_builder, "run_dataset_query", query)
    monkeypatch.setattr(report_router, "_can_access", AsyncMock(return_value=True))
    monkeypatch.setattr(report_router, "_ensure_valid_report_field_references", AsyncMock())
    monkeypatch.setattr(report_router, "record_report_audit", AsyncMock())
    monkeypatch.setattr(report_service, "ensure_valid_report_field_references", AsyncMock())
    monkeypatch.setattr(quality_gate, "enforce_report_quality", AsyncMock())
    class _Session:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            return False
    monkeypatch.setattr(core_db, "get_session_factory", lambda: _Session)
    monkeypatch.setattr(events, "publish_event", AsyncMock())

    if channel == "run":
        result = await report_router.run_report(11, page=1, page_size=1, user=owner, db=db)
        assert result.total == 1 and result.items == [{"r.amount": "12"}]
    elif channel == "csv":
        response = await report_router.export_report_csv(11, runtime_filters=None, user=owner, db=db)
        assert response.media_type.startswith("text/csv")
    elif channel == "xlsx":
        response = await report_router.export_report_xlsx(11, runtime_filters=None, user=owner, db=db)
        assert "spreadsheetml" in response.media_type
    elif channel == "export_rows":
        _, rows, codes, _ = await _collect_export_rows(report, owner, db)
        assert rows == [["12"]] and codes == ["r.amount"]
    elif channel == "push":
        rows, _ = await collect_report_push_rows(report, db)
        assert rows == [{"r.amount": "12"}]
    elif channel == "push_columns":
        columns = await get_report_push_columns(report, db)
        assert columns[0]["code"] == "r.amount"
    else:
        total, _ = await report_service.run_report_query(report, db)
        assert total == 1
    audit_scope.assert_awaited_once()
    recorded = audit_scope.await_args.kwargs
    assert recorded["user"] is owner and recorded["report_id"] == 11
    assert recorded["channel"] == channel and recorded["query_status"] == "success"
    assert recorded["decisions"][0]["decision"] == "restricted"


@pytest.mark.asyncio
@pytest.mark.parametrize("channel", ["model_preview", "dimension_preview"])
@pytest.mark.parametrize("fails", [False, True])
async def test_preview_queries_use_scope_audit_without_exposing_decisions(channel, fails, monkeypatch):
    from app.datasets import router as datasets_router
    from app.reports import audit, sql_builder
    from app.warehouse.service.assets import WarehouseService

    user = SimpleNamespace(id=4)
    dataset = SimpleNamespace(id=15, scope_strategy=None)
    report = SimpleNamespace(id=17, dataset_id=15, scope_strategy=None)
    class PreviewDb:
        async def get(self, model, object_id):
            return report if model.__name__ == "Report" else dataset
        async def execute(self, stmt):
            return _Result([SimpleNamespace(source_alias="r", source_column="amount", output_code="amount")])
    db = PreviewDb()
    error = HTTPException(status_code=409, detail="scope configuration invalid")
    async def query(**kwargs):
        assert kwargs["user"] is user
        kwargs["scope_decisions_sink"].append({
            "alias": "r", "table_name": "salary", "strategy": "person_first", "decision": "restricted",
            "reason_code": "ROW_SCOPE_APPLIED", "restricted": True,
        })
        if fails:
            raise error
        return [
            {"code": "r.kind", "data_type": "string"}, {"code": "r.amount", "data_type": "number"},
        ], [{"r.kind": "group", "r.amount": "12"}], 1
    recorder = AsyncMock()
    monkeypatch.setattr(audit, "record_scope_audit", recorder)
    monkeypatch.setattr(sql_builder, "run_dataset_query", query)
    monkeypatch.setattr(datasets_router, "_can_access", AsyncMock(return_value=True))
    monkeypatch.setattr(report_router, "_can_access", AsyncMock(return_value=True))

    if channel == "model_preview":
        result = await WarehouseService(db).preview_model(15, user=user)
        assert "scope_decisions" not in result
        if fails:
            assert result["items"] == [] and "error" in result
        else:
            assert result["summary"]["main_count"] == 1
    else:
        payload = report_router.DimensionCombinationSearchIn(
            report_id=17, dataset_id=15, config={"columns": ["r.kind", "r.amount"], "aggregate": True},
            dimension_signature=["r.kind"],
        )
        if fails:
            with pytest.raises(HTTPException) as raised:
                await report_router._dimension_combination_items(payload, user, db)
            assert raised.value is error
        else:
            items, _ = await report_router._dimension_combination_items(payload, user, db)
            assert len(items) == 1 and "scope_decisions" not in items[0]
    recorder.assert_awaited_once()
    event = recorder.await_args.kwargs
    assert event["user"] is user
    assert event["channel"] == channel and event["dataset_id"] == 15
    assert event["report_id"] == (17 if channel == "dimension_preview" else None)
    assert event["query_status"] == ("failed" if fails else "success")
