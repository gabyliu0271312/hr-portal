from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import BigInteger, Column, Date, DateTime, MetaData, Numeric, String, Table

from app.core.secret_box import encrypt
from app.data.dynamic_loader import _make_model_from_table
from app.data.models import DATA_TABLES, TableColumn
from app.datasources.sync_service import PERIOD_TABLES
from app.push import push_service
from app.push.models import PushTarget
from app.push.router import _build_integration_documentation, _normalize_query_parameters, _runtime_filters_from_request, _to_out, expose_data
from tests.entity_helpers import make_legacy_raw_model


pytestmark = pytest.mark.asyncio


class FakeScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None


class FakeResult:
    def __init__(self, value=None, rows=None):
        self.value = value
        self.rows = rows

    def scalar_one(self):
        return self.value

    def scalar_one_or_none(self):
        return self.value

    def scalars(self):
        if self.rows is not None:
            return FakeScalarResult(self.rows)
        return FakeScalarResult([] if self.value is None else [self.value])

    def all(self):
        return list(self.rows or [])


class FakeSession:
    def __init__(self, *, results=(), get_obj=None, count_result=None, finebi_schemas=None):
        self.results = list(results)
        self.get_obj = get_obj
        self.count_result = count_result
        self.finebi_schemas = finebi_schemas
        self.executed = []
        self.commits = 0

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))
        if self.finebi_schemas is not None and "FROM pg_namespace" in str(statement):
            return FakeResult(rows=self.finebi_schemas)
        if self.count_result is not None and str(statement).startswith("SELECT COUNT(*) FROM"):
            return FakeResult(self.count_result)
        result = self.results.pop(0) if self.results else None
        if isinstance(result, FakeResult):
            return result
        return FakeResult(result)

    async def get(self, model, obj_id):
        return self.get_obj

    async def commit(self):
        self.commits += 1


class FakeResponse:
    def raise_for_status(self):
        return None


class FakeAsyncClient:
    requests = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def request(self, method, url, json=None, headers=None):
        self.__class__.requests.append(
            {"method": method, "url": url, "json": json, "headers": headers}
        )
        return FakeResponse()


def make_column(**overrides):
    data = {
        "table_name": "push_entity_table",
        "column_code": "employee_no",
        "column_label": "工号",
        "data_type": "string",
        "is_pk_part": False,
        "is_sensitive": False,
        "is_visible": True,
        "display_order": 10,
        "auto_discovered": True,
        "copy_from_last_month": False,
        "enum_options": None,
        "agg_role": "dimension",
        "is_computed": False,
        "formula_expr": None,
        "description": None,
        "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
    }
    data.update(overrides)
    return TableColumn(**data)


def make_entity_model(table_name: str):
    table = Table(
        table_name,
        MetaData(),
        Column("id", BigInteger, primary_key=True),
        Column("pk_hash", String(64), nullable=False),
        Column("synced_at", DateTime(timezone=True)),
        Column("month", String),
        Column("employee_no", String),
        Column("amount", Numeric),
        Column("hire_date", Date),
        Column("settled_at", DateTime(timezone=True)),
    )
    return _make_model_from_table(table_name, table)


def make_row(model, **overrides):
    data = {
        "id": 1,
        "pk_hash": "pk1",
        "synced_at": datetime(2026, 6, 15, 8, 30, tzinfo=timezone.utc),
        "month": "202606",
        "employee_no": "E001",
        "amount": Decimal("1234.50"),
        "hire_date": date(2021, 1, 1),
        "settled_at": datetime(2026, 6, 15, 9, 0, tzinfo=timezone.utc),
    }
    data.update(overrides)
    return model(**data)


def register_table(table_name: str, model, *, period=False):
    old_model = DATA_TABLES.get(table_name)
    old_period = PERIOD_TABLES.get(table_name)
    DATA_TABLES[table_name] = model
    if period:
        PERIOD_TABLES[table_name] = {
            "period_col": "month",
            "offset_key": "MONTH_OFFSET",
            "period_source": "field",
        }
    else:
        PERIOD_TABLES.pop(table_name, None)
    return old_model, old_period


def restore_table(table_name: str, old_model, old_period):
    if old_model is None:
        DATA_TABLES.pop(table_name, None)
    else:
        DATA_TABLES[table_name] = old_model
    if old_period is None:
        PERIOD_TABLES.pop(table_name, None)
    else:
        PERIOD_TABLES[table_name] = old_period


def sql_texts(db: FakeSession) -> list[str]:
    return [str(statement) for statement, _ in db.executed]


async def test_load_source_rows_reads_entity_columns_and_keeps_native_values():
    table_name = "push_entity_source"
    model = make_entity_model(table_name)
    old_model, old_period = register_table(table_name, model, period=True)
    columns = [
        make_column(table_name=table_name, column_code="month", column_label="月份"),
        make_column(table_name=table_name, column_code="employee_no", column_label="工号"),
        make_column(table_name=table_name, column_code="amount", column_label="金额", data_type="number"),
        make_column(table_name=table_name, column_code="hire_date", column_label="入职日期", data_type="date"),
        make_column(table_name=table_name, column_code="settled_at", column_label="结算时间", data_type="datetime"),
    ]
    db = FakeSession(
        results=[
            FakeResult(rows=columns),
            FakeResult(rows=[make_row(model)]),
        ]
    )

    try:
        rows = await push_service._load_source_rows(table_name, db, "202606")
    finally:
        restore_table(table_name, old_model, old_period)

    assert rows == [
        {
            "month": "202606",
            "employee_no": "E001",
            "amount": Decimal("1234.50"),
            "hire_date": date(2021, 1, 1),
            "settled_at": datetime(2026, 6, 15, 9, 0, tzinfo=timezone.utc),
        }
    ]
    compiled = "\n".join(sql_texts(db)).lower()
    assert "raw" not in compiled
    assert "jsonb" not in compiled
    assert "month" in compiled


async def test_load_source_rows_rejects_legacy_raw_model():
    table_name = "push_legacy_raw"
    old_model, old_period = register_table(
        table_name,
        make_legacy_raw_model(table_name),
        period=False,
    )

    try:
        with pytest.raises(RuntimeError, match="不是实体列结构"):
            await push_service._load_source_rows(table_name, FakeSession())
    finally:
        restore_table(table_name, old_model, old_period)


async def test_push_http_converts_json_values_without_flattening_loader(monkeypatch):
    table_name = "push_http_entity"
    model = make_entity_model(table_name)
    old_model, old_period = register_table(table_name, model, period=False)
    columns = [
        make_column(table_name=table_name, column_code="employee_no", column_label="工号"),
        make_column(table_name=table_name, column_code="amount", column_label="金额", data_type="number"),
        make_column(table_name=table_name, column_code="hire_date", column_label="入职日期", data_type="date"),
        make_column(table_name=table_name, column_code="settled_at", column_label="结算时间", data_type="datetime"),
    ]
    db = FakeSession(
        results=[
            FakeResult(rows=columns),
            FakeResult(rows=[make_row(model)]),
        ]
    )
    FakeAsyncClient.requests = []
    monkeypatch.setattr("httpx.AsyncClient", FakeAsyncClient)

    try:
        count, _ = await push_service.push_http(
            table_name,
            {"url": "https://example.test/hook", "batch_size": 10},
            {},
            [{"source": "amount", "target": "pay_amount"}],
            db,
        )
    finally:
        restore_table(table_name, old_model, old_period)

    assert count == 1
    sent = FakeAsyncClient.requests[0]["json"][0]
    assert sent["employee_no"] == "E001"
    assert sent["pay_amount"] == "1234.50"
    assert sent["hire_date"] == "2021-01-01"
    assert sent["settled_at"] == "2026-06-15T09:00:00+00:00"


async def test_api_expose_endpoint_returns_json_ready_rows():
    table_name = "push_api_entity"
    model = make_entity_model(table_name)
    old_model, old_period = register_table(table_name, model, period=False)
    columns = [
        make_column(table_name=table_name, column_code="employee_no", column_label="工号"),
        make_column(table_name=table_name, column_code="amount", column_label="金额", data_type="number"),
        make_column(table_name=table_name, column_code="hire_date", column_label="入职日期", data_type="date"),
    ]
    pt = PushTarget(
        id=9,
        source_table=table_name,
        name="API 暴露",
        push_type="api_expose",
        settings={"app_id": "app-1", "ip_whitelist": ["127.0.0.1"]},
        secrets_encrypted={"app_secret": encrypt("secret-1")},
        field_mappings=[{"source": "amount", "target": "pay_amount"}],
        is_active=True,
    )
    db = FakeSession(
        get_obj=pt,
        results=[
            FakeResult(rows=columns),
            FakeResult(rows=[make_row(model)]),
        ],
    )
    request = SimpleNamespace(
        headers={"X-App-Id": "app-1", "X-App-Secret": "secret-1"},
        client=SimpleNamespace(host="127.0.0.1"),
    )

    try:
        rows = await expose_data(9, request, db)
    finally:
        restore_table(table_name, old_model, old_period)

    assert rows == [
        {
            "employee_no": "E001",
            "pay_amount": "1234.50",
            "hire_date": "2021-01-01",
        }
    ]


async def test_api_expose_endpoint_rejects_inactive_target():
    pt = PushTarget(
        id=9,
        source_table="push_api_entity",
        name="API 暴露",
        push_type="api_expose",
        settings={"app_id": "app-1", "ip_whitelist": ["127.0.0.1"]},
        secrets_encrypted={"app_secret": encrypt("secret-1")},
        is_active=False,
    )
    db = FakeSession(get_obj=pt)
    request = SimpleNamespace(
        headers={"X-App-Id": "app-1", "X-App-Secret": "secret-1"},
        client=SimpleNamespace(host="127.0.0.1"),
    )

    with pytest.raises(HTTPException) as exc_info:
        await expose_data(9, request, db)

    assert exc_info.value.status_code == 404
    assert db.executed == []


@pytest.mark.parametrize("settings", [
    {"app_id": "app-1"},
    {"app_id": "app-1", "ip_whitelist": []},
])
async def test_api_expose_endpoint_rejects_empty_ip_whitelist(settings):
    pt = PushTarget(
        id=9,
        source_table="push_api_entity",
        name="API 暴露",
        push_type="api_expose",
        settings=settings,
        secrets_encrypted={"app_secret": encrypt("secret-1")},
        is_active=True,
    )
    db = FakeSession(get_obj=pt)
    request = SimpleNamespace(
        headers={"X-App-Id": "app-1", "X-App-Secret": "secret-1"},
        client=SimpleNamespace(host="127.0.0.1"),
    )

    with pytest.raises(HTTPException) as exc_info:
        await expose_data(9, request, db)

    assert exc_info.value.status_code == 403
    assert db.executed == []


async def test_api_expose_endpoint_rejects_ip_outside_whitelist():
    pt = PushTarget(
        id=9,
        source_table="push_api_entity",
        name="API 暴露",
        push_type="api_expose",
        settings={"app_id": "app-1", "ip_whitelist": ["10.0.0.1"]},
        secrets_encrypted={"app_secret": encrypt("secret-1")},
        is_active=True,
    )
    db = FakeSession(get_obj=pt)
    request = SimpleNamespace(
        headers={"X-App-Id": "app-1", "X-App-Secret": "secret-1"},
        client=SimpleNamespace(host="127.0.0.1"),
    )

    with pytest.raises(HTTPException) as exc_info:
        await expose_data(9, request, db)

    assert exc_info.value.status_code == 403
    assert db.executed == []


async def test_push_target_out_resolves_physical_table_label():
    """Table source should return RegisteredTable.table_label instead of physical name."""
    pt = PushTarget(
        id=4,
        source_table="feishu_spreadsheet_fetch_test",
        source_type="table",
        source_id="feishu_spreadsheet_fetch_test",
        source_label="feishu_spreadsheet_fetch_test",
        name="table push",
        description=None,
        push_type="http_push",
        settings={},
        field_mappings=[],
        is_active=True,
        last_status="never",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db = FakeSession(results=[FakeResult(value="Feishu import test")])

    out = await _to_out(pt, db)

    assert out.source_type == "table"
    assert out.source_id == "feishu_spreadsheet_fetch_test"
    assert out.source_label == "Feishu import test"


async def test_push_target_out_falls_back_to_datasource_table_label():
    """If registered table label is physical, use datasource business label."""
    pt = PushTarget(
        id=5,
        source_table="feishu_spreadsheet_fetch_test",
        source_type="table",
        source_id="feishu_spreadsheet_fetch_test",
        source_label="feishu_spreadsheet_fetch_test",
        name="table push",
        description=None,
        push_type="http_push",
        settings={},
        field_mappings=[],
        is_active=True,
        last_status="never",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db = FakeSession(results=[
        FakeResult(value="feishu_spreadsheet_fetch_test"),
        FakeResult(value="Feishu import test"),
    ])

    out = await _to_out(pt, db)

    assert out.source_label == "Feishu import test"


async def test_push_target_out_normalizes_legacy_report_source_table():
    """生产历史数据：source_table=report:{id} 但 source_type 仍为 table 时，返回报表类型和中文名。"""
    pt = PushTarget(
        id=3,
        source_table="report:3",
        source_type="table",
        source_id="report:3",
        source_label="report:3",
        name="报表推送",
        push_type="http_push",
        settings={},
        secrets_encrypted={},
        field_mappings=[],
        is_active=True,
        last_status="pending",
        created_at=datetime(2026, 7, 9, tzinfo=timezone.utc),
        updated_at=datetime(2026, 7, 9, tzinfo=timezone.utc),
    )
    db = FakeSession(get_obj=SimpleNamespace(id=3, name="员工成本报表"))

    out = await _to_out(pt, db)

    assert out.source_type == "report"
    assert out.source_id == "3"
    assert out.source_label == "员工成本报表"


async def test_push_db_expose_uses_entity_columns_and_postgres_types():
    table_name = "push_db_entity"
    model = make_entity_model(table_name)
    old_model, old_period = register_table(table_name, model, period=True)
    columns = [
        make_column(table_name=table_name, column_code="month", column_label="月份"),
        make_column(table_name=table_name, column_code="employee_no", column_label="工号"),
        make_column(table_name=table_name, column_code="amount", column_label="金额", data_type="number"),
        make_column(table_name=table_name, column_code="hire_date", column_label="日期", data_type="date"),
        make_column(table_name=table_name, column_code="settled_at", column_label="日期", data_type="datetime"),
    ]
    db = FakeSession(
        results=[
            FakeResult(rows=columns),
        ] + [FakeResult()] * 30,
        count_result=3,
        finebi_schemas=["finebi_other_target"],
    )

    try:
        rows, message = await push_service.push_db_expose(
            table_name,
            {
                "_pt_id": "77",
                "readonly_user": "ro_push_db_entity",
                "period_ym": "202606",
            },
            {"readonly_password": "p'wd"},
            [],
            db,
        )
    finally:
        restore_table(table_name, old_model, old_period)

    assert rows == 3
    assert "finebi_push_db_entity_77.t_push_db_entity_77" in message
    full_sql = "\n".join(sql_texts(db))
    assert "raw" not in full_sql.lower()
    assert "jsonb" not in full_sql.lower()
    assert "DO $$" not in full_sql
    assert '"金额" NUMERIC' in full_sql
    assert '"日期" DATE' in full_sql
    assert '"日期_2" TIMESTAMPTZ' in full_sql
    assert 'SELECT id, synced_at, "month" AS "月份"' in full_sql
    assert '"amount" AS "金额"' in full_sql
    assert 'FROM public."push_db_entity" WHERE "month" = :period_ym' in full_sql
    assert 'ALTER ROLE "ro_push_db_entity" SET search_path TO "finebi_push_db_entity_77"' in full_sql
    assert 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA "finebi_other_target" FROM "ro_push_db_entity"' in full_sql
    assert 'postgresql://ro_push_db_entity:p%27wd@127.0.0.1' in message
    assert 'options=-csearch_path%3Dfinebi_push_db_entity_77' in message
    insert_calls = [
        params
        for sql, params in db.executed
        if str(sql).startswith("INSERT INTO")
    ]
    assert insert_calls == [{"period_ym": "202606"}]


async def test_minimal_query_parameter_configuration_is_normalized(monkeypatch):
    settings = {"query_parameters": [{"column": "salary.pay_month", "required": True}]}

    async def metadata(source_table, db):
        return [{
            "column": "salary.pay_month", "label": "发薪月", "data_type": "string",
            "visible": True, "locked": False,
        }]

    monkeypatch.setattr("app.push.router._report_filter_metadata", metadata)
    await _normalize_query_parameters("report:8", settings, FakeSession())
    assert settings["query_parameters"] == [{
        "name": "period_ym", "label": "发薪月", "column": "salary.pay_month", "op": "eq",
        "pattern": r"^\d{6}$", "format_hint": "YYYYMM", "example": "202606", "required": True,
    }]


async def test_normalize_query_parameters_preserves_existing_contract(monkeypatch):
    settings = {"query_parameters": [{"column": "salary.pay_month", "required": False}]}
    existing = [{
        "name": "payroll_period", "label": "历史发薪月", "column": "salary.pay_month", "op": "eq",
        "pattern": r"^\d{6}$", "format_hint": "YYYYMM", "example": "202601", "required": True,
    }]

    async def metadata(source_table, db):
        return [{
            "column": "salary.pay_month", "label": "发薪月", "data_type": "string",
            "visible": True, "locked": False,
        }]

    monkeypatch.setattr("app.push.router._report_filter_metadata", metadata)
    await _normalize_query_parameters("report:8", settings, FakeSession(), existing)
    assert settings["query_parameters"][0]["name"] == "payroll_period"
    assert settings["query_parameters"][0]["label"] == "历史发薪月"
    assert settings["query_parameters"][0]["required"] is False
    pt = PushTarget(
        id=17,
        source_table="report:8",
        name="月度成本入账表",
        push_type="api_expose",
        settings={
            "query_parameters": [{
                "name": "period_ym", "label": "月份", "column": "salary.pay_month",
                "op": "eq", "required": True, "pattern": r"^\d{6}$", "format_hint": "YYYYMM",
            }],
        },
    )

    async def metadata(source_table, db):
        return [{"column": "salary.pay_month", "visible": True, "locked": False}]

    monkeypatch.setattr("app.push.router._report_filter_metadata", metadata)
    valid = SimpleNamespace(query_params={"period_ym": "202606"})
    assert await _runtime_filters_from_request(pt, valid, FakeSession()) == [
        {"column": "salary.pay_month", "op": "eq", "value": "202606"}
    ]
    with pytest.raises(HTTPException) as missing:
        await _runtime_filters_from_request(pt, SimpleNamespace(query_params={}), FakeSession())
    assert missing.value.status_code == 400
    with pytest.raises(HTTPException) as malformed:
        await _runtime_filters_from_request(pt, SimpleNamespace(query_params={"period_ym": "2026-06"}), FakeSession())
    assert malformed.value.status_code == 400
    with pytest.raises(HTTPException) as unknown:
        await _runtime_filters_from_request(pt, SimpleNamespace(query_params={"period_ym": "202606", "all": "true"}), FakeSession())
    assert unknown.value.status_code == 400


async def test_integration_documentation_contains_ten_api_sections_without_credentials(monkeypatch):
    pt = PushTarget(
        id=17,
        source_table="push_api_entity",
        source_label="月度成本入账表",
        name="月度成本入账表",
        push_type="api_expose",
        settings={
            "app_id": "app-1",
            "query_parameters": [{
                "name": "period_ym", "label": "月份", "column": "pay_month",
                "required": True, "format_hint": "YYYYMM", "example": "202606",
            }],
        },
        secrets_encrypted={"app_secret": encrypt("real-secret")},
        field_mappings=[],
    )

    async def meta(source_table, db):
        return ["pay_month", "amount"], {"pay_month": "发薪月", "amount": "金额"}, {"pay_month": "string", "amount": "number"}

    monkeypatch.setattr("app.push.push_service._load_source_columns_meta", meta)
    monkeypatch.setattr("app.core.config.settings.PUBLIC_BASE_URL", "http://portal.example.test")
    content = await _build_integration_documentation(pt, FakeSession())
    for section in ("一、接口概览", "二、鉴权请求头", "三、查询参数", "四、cURL 调用示例", "五、Python 调用示例", "六、接口原始响应示例", "七、字段名称对照表", "八、业务阅读版响应示例", "九、返回状态说明", "十、接入与安全约定"):
        assert section in content
    assert "real-secret" not in content
    assert "app-1" not in content
    assert "http://portal.example.test/api/v1/push-targets/17/data?period_ym=202606" in content
    assert "由HRPortal管理员单独提供的AppID" in content
    assert "period_ym" in content
    assert "发薪月" in content


async def test_api_documentation_requires_public_base_url(monkeypatch):
    pt = PushTarget(
        id=17, source_table="push_api_entity", name="API", push_type="api_expose",
        settings={"app_id": "app-1"}, secrets_encrypted={"app_secret": encrypt("secret-1")},
    )

    async def meta(source_table, db):
        return [], {}, {}

    monkeypatch.setattr("app.push.push_service._load_source_columns_meta", meta)
    monkeypatch.setattr("app.core.config.settings.PUBLIC_BASE_URL", "")
    with pytest.raises(HTTPException) as exc_info:
        await _build_integration_documentation(pt, FakeSession())
    assert exc_info.value.status_code == 503
    assert "PUBLIC_BASE_URL" in exc_info.value.detail


@pytest.mark.asyncio
async def test_normalize_push_report_sources_repairs_database_row(monkeypatch):
    from scripts.normalize_push_report_sources import normalize_push_report_sources

    pt = PushTarget(
        id=20,
        source_table="report:3",
        source_type="table",
        source_id="report:3",
        source_label="report:3",
        name="report push",
        push_type="http_push",
        settings={},
        secrets_encrypted={},
        field_mappings=[],
        is_active=True,
    )

    class ScalarResult:
        def __init__(self, rows):
            self._rows = rows

        def all(self):
            return self._rows

    class ExecuteResult:
        def scalars(self):
            return ScalarResult([pt])

    class FakeAsyncSession:
        committed = False
        rolled_back = False

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def execute(self, stmt):
            return ExecuteResult()

        async def get(self, model, ident):
            return SimpleNamespace(id=ident, name="employee cost report")

        async def commit(self):
            self.committed = True

        async def rollback(self):
            self.rolled_back = True

    session = FakeAsyncSession()
    monkeypatch.setattr("scripts.normalize_push_report_sources.AsyncSessionLocal", lambda: session)

    changes = await normalize_push_report_sources()

    assert len(changes) == 1
    assert changes[0].before == ("report:3", "table", "report:3", "report:3")
    assert changes[0].after == ("report:3", "report", "3", "employee cost report")
    assert pt.source_type == "report"
    assert pt.source_id == "3"
    assert pt.source_label == "employee cost report"
    assert session.committed is True
