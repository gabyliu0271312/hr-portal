from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import BigInteger, Column, Date, DateTime, MetaData, Numeric, String, Table

from app.core.secret_box import encrypt
from app.data.dynamic_loader import _make_model_from_table
from app.data.models import DATA_TABLES, TableColumn
from app.datasources.sync_service import PERIOD_TABLES
from app.push import push_service
from app.push.models import PushTarget
from app.push.router import expose_data
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

    def scalars(self):
        if self.rows is not None:
            return FakeScalarResult(self.rows)
        return FakeScalarResult([] if self.value is None else [self.value])

    def all(self):
        return list(self.rows or [])


class FakeSession:
    def __init__(self, *, results=(), get_obj=None):
        self.results = list(results)
        self.get_obj = get_obj
        self.executed = []
        self.commits = 0

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))
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
        settings={"app_id": "app-1"},
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
            FakeResult(),  # CREATE SCHEMA
            FakeResult(),  # DROP TABLE
            FakeResult(),  # CREATE TABLE
            FakeResult(),  # INSERT SELECT
            FakeResult(value=False),  # role exists
            FakeResult(),  # CREATE USER
            FakeResult(),  # GRANT CONNECT
            FakeResult(),  # REVOKE public
            FakeResult(value=True),  # old finebi schema exists
            FakeResult(),  # REVOKE finebi
            FakeResult(),  # GRANT schema
            FakeResult(),  # GRANT table
            FakeResult(value=3),
        ]
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
    insert_calls = [
        params
        for sql, params in db.executed
        if str(sql).startswith("INSERT INTO")
    ]
    assert insert_calls == [{"period_ym": "202606"}]
