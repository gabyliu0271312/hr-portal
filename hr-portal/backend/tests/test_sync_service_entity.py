from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import BigInteger, Column, MetaData, Numeric, String, Table

from app.data.dynamic_loader import _make_model_from_table
from app.data.models import DATA_TABLES, TableColumn
from app.datasources import sync_service
from tests.entity_helpers import make_legacy_raw_model


pytestmark = pytest.mark.asyncio


class FakeScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)


class FakeResult:
    def __init__(self, value=None, rows=None):
        self.value = value
        self.rows = rows

    def scalar_one_or_none(self):
        return self.value

    def scalars(self):
        if self.rows is not None:
            return FakeScalarResult(self.rows)
        return FakeScalarResult([] if self.value is None else [self.value])

    def all(self):
        return list(self.rows or [])


class FakeSession:
    def __init__(self, results=()):
        self.results = list(results)
        self.executed = []
        self.added_all = []
        self.flushed = 0
        self.expired = False

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))
        result = self.results.pop(0) if self.results else None
        if isinstance(result, FakeResult):
            return result
        return FakeResult(result)

    def add_all(self, objs):
        self.added_all.extend(objs)

    async def flush(self):
        self.flushed += 1
        for idx, obj in enumerate(self.added_all, start=1):
            if getattr(obj, "id", None) is None:
                obj.id = idx

    def expire_all(self):
        self.expired = True


class FakeInsert:
    def __init__(self, model):
        self.model = model
        self.payload = None
        self.excluded = SimpleNamespace()
        self.conflict = None

    def values(self, payload):
        self.payload = payload
        self.excluded = SimpleNamespace(
            **{key: SimpleNamespace(key=key) for key in payload[0].keys()}
        )
        return self

    def on_conflict_do_update(self, *, index_elements, set_):
        self.conflict = {
            "index_elements": index_elements,
            "set": set_,
        }
        return self


def make_column(**overrides):
    data = {
        "table_name": "sync_entity_table",
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
        Column("synced_at", String),
        Column("month", String),
        Column("employee_no", String),
        Column("amount", Numeric),
        Column("status", String),
    )
    return _make_model_from_table(table_name, table)


async def test_ensure_columns_adds_physical_column_and_metadata(monkeypatch):
    add_calls = []
    register_calls = []

    async def fake_add_source_column(db, table_name, column_code, data_type):
        add_calls.append((db, table_name, column_code, data_type))

    async def fake_register_source_table_model(db, table_name, *, force=False):
        register_calls.append((db, table_name, force))

    async def fake_ai_translate_code(db, *, label, scope, context):
        return "new_metric", "ok", {}

    monkeypatch.setattr(sync_service, "add_source_column", fake_add_source_column)
    monkeypatch.setattr(
        sync_service,
        "register_source_table_model",
        fake_register_source_table_model,
    )
    monkeypatch.setattr("app.codegen.service.ai_translate_code", fake_ai_translate_code)
    db = FakeSession(results=[FakeResult(rows=[]), FakeResult(value=0)])

    rename_map = await sync_service._ensure_columns(
        "sync_entity_table",
        {"新增指标": "123.45"},
        db,
    )

    assert rename_map == {"新增指标": "new_metric"}
    assert add_calls == [(db, "sync_entity_table", "new_metric", "number")]
    assert register_calls == [(db, "sync_entity_table", True)]
    assert db.added_all[0].column_code == "new_metric"
    assert db.added_all[0].auto_discovered is True


async def test_dynamic_upsert_writes_entity_payload_without_raw(monkeypatch):
    table_name = "sync_entity_upsert"
    model = make_entity_model(table_name)
    old_model = DATA_TABLES.get(table_name)
    old_period = sync_service.PERIOD_TABLES.get(table_name)
    DATA_TABLES[table_name] = model
    sync_service.PERIOD_TABLES[table_name] = {
        "period_col": "month",
        "offset_key": "MONTH_OFFSET",
        "period_source": "field",
    }
    insert_holder = {}

    def fake_pg_insert(model_arg):
        insert_holder["insert"] = FakeInsert(model_arg)
        return insert_holder["insert"]

    monkeypatch.setattr(sync_service, "pg_insert", fake_pg_insert)
    columns = [
        make_column(table_name=table_name, column_code="month", column_label="月份", is_pk_part=True),
        make_column(table_name=table_name, column_code="employee_no", column_label="工号", is_pk_part=True),
        make_column(table_name=table_name, column_code="amount", column_label="金额", data_type="number"),
    ]
    db = FakeSession(
        results=[
            FakeResult(rows=columns),  # _ensure_columns existing cols
            FakeResult(value=30),      # _ensure_columns max order
            FakeResult(rows=[columns[0]]),  # _ensure_period_meta
            FakeResult(rows=columns),  # _source_columns
            FakeResult(rows=[("month",), ("employee_no",)]),  # _get_pk_columns
            FakeResult(rows=[]),       # _get_manual_columns
            FakeResult(rows=[]),       # _get_computed_columns
        ]
    )

    try:
        written = await sync_service._dynamic_upsert(
            table_name,
            [{"month": "202606", "employee_no": "E001", "amount": "1,234.50"}],
            db,
        )
    finally:
        if old_model is None:
            DATA_TABLES.pop(table_name, None)
        else:
            DATA_TABLES[table_name] = old_model
        if old_period is None:
            sync_service.PERIOD_TABLES.pop(table_name, None)
        else:
            sync_service.PERIOD_TABLES[table_name] = old_period

    assert written == 1
    payload = insert_holder["insert"].payload[0]
    assert "raw" not in payload
    assert payload["month"] == "202606"
    assert payload["employee_no"] == "E001"
    assert payload["amount"] == Decimal("1234.50")
    assert db.expired is True
    assert set(insert_holder["insert"].conflict["set"]) == {
        "month",
        "employee_no",
        "amount",
        "synced_at",
    }


async def test_dynamic_upsert_rejects_legacy_raw_model():
    table_name = "sync_legacy_raw_guard"
    model = make_legacy_raw_model(table_name)
    old_model = DATA_TABLES.get(table_name)
    DATA_TABLES[table_name] = model

    try:
        with pytest.raises(RuntimeError, match="仍是 raw JSON 结构"):
            await sync_service._dynamic_upsert(
                table_name,
                [{"employee_no": "E001"}],
                FakeSession(),
            )
    finally:
        if old_model is None:
            DATA_TABLES.pop(table_name, None)
        else:
            DATA_TABLES[table_name] = old_model


async def test_dynamic_upsert_injects_period_ym_into_month_column(monkeypatch):
    table_name = "sync_entity_period_inject"
    model = make_entity_model(table_name)
    old_model = DATA_TABLES.get(table_name)
    old_period = sync_service.PERIOD_TABLES.get(table_name)
    DATA_TABLES[table_name] = model
    sync_service.PERIOD_TABLES[table_name] = {
        "period_col": "month",
        "offset_key": "MONTH_OFFSET",
        "period_source": "inject",
    }
    insert_holder = {}

    def fake_pg_insert(model_arg):
        insert_holder["insert"] = FakeInsert(model_arg)
        return insert_holder["insert"]

    monkeypatch.setattr(sync_service, "pg_insert", fake_pg_insert)
    columns = [
        make_column(table_name=table_name, column_code="month", column_label="月份", is_pk_part=True),
        make_column(table_name=table_name, column_code="employee_no", column_label="工号", is_pk_part=True),
    ]
    db = FakeSession(
        results=[
            FakeResult(rows=columns),
            FakeResult(value=20),
            FakeResult(rows=[columns[0]]),
            FakeResult(rows=columns),
            FakeResult(rows=[("month",), ("employee_no",)]),
            FakeResult(rows=[]),
            FakeResult(rows=[]),
        ]
    )

    try:
        await sync_service._dynamic_upsert(
            table_name,
            [{"employee_no": "E001"}],
            db,
            period_ym="2026-06",
        )
    finally:
        if old_model is None:
            DATA_TABLES.pop(table_name, None)
        else:
            DATA_TABLES[table_name] = old_model
        if old_period is None:
            sync_service.PERIOD_TABLES.pop(table_name, None)
        else:
            sync_service.PERIOD_TABLES[table_name] = old_period

    assert insert_holder["insert"].payload[0]["month"] == "202606"


async def test_build_lookup_maps_reads_entity_columns():
    table_name = "sync_lookup_table"
    model = Table(
        table_name,
        MetaData(),
        Column("id", BigInteger, primary_key=True),
        Column("pk_hash", String(64), nullable=False),
        Column("field_type", String),
        Column("value", String),
        Column("cost_classification", String),
    )
    lookup_model = _make_model_from_table(table_name, model)
    old_model = DATA_TABLES.get("emp_monthly_cost_class")
    DATA_TABLES["emp_monthly_cost_class"] = lookup_model
    lookup_columns = [
        make_column(table_name=table_name, column_code="field_type"),
        make_column(table_name=table_name, column_code="value"),
        make_column(table_name=table_name, column_code="cost_classification"),
    ]
    db = FakeSession(
        results=[
            FakeResult(rows=lookup_columns),
            FakeResult(rows=[
                SimpleNamespace(
                    field_type="工号",
                    value="E001",
                    cost_classification="研发成本",
                )
            ]),
        ]
    )

    try:
        maps = await sync_service.build_lookup_maps("emp_monthly_salary", db)
    finally:
        if old_model is None:
            DATA_TABLES.pop("emp_monthly_cost_class", None)
        else:
            DATA_TABLES["emp_monthly_cost_class"] = old_model

    assert maps[0][1][("工号", "E001")] == "研发成本"
