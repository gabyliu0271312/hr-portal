from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import BigInteger, Column, DateTime, MetaData, Numeric, String, Table

from app.allocation import router as allocation_router
from app.allocation.models import AllocationScheme
from app.cost_allocation import router as cost_allocation_router
from app.data.dynamic_loader import _make_model_from_table
from app.data.models import DATA_TABLES, TableColumn
from app.datasources import sync_service
from app.datasources.sync_service import PERIOD_TABLES
from app.push import push_service
from app.reports.models import Report
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
    def __init__(self, *, results=(), get_map=None, get_obj=None):
        self.results = list(results)
        self.get_map = get_map or {}
        self.get_obj = get_obj
        self.executed = []
        self.added = []
        self.commits = 0
        self.flushed = 0
        self.refreshed = []
        self.expired = False

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))
        result = self.results.pop(0) if self.results else None
        if isinstance(result, FakeResult):
            return result
        return FakeResult(result)

    async def get(self, model, obj_id):
        if (model, obj_id) in self.get_map:
            return self.get_map[(model, obj_id)]
        return self.get_obj

    def add(self, obj):
        self.added.append(obj)

    def add_all(self, objs):
        self.added.extend(objs)

    async def flush(self):
        self.flushed += 1
        for idx, obj in enumerate(self.added, start=1):
            if getattr(obj, "id", None) is None:
                obj.id = idx

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj):
        self.refreshed.append(obj)
        if getattr(obj, "id", None) is None:
            obj.id = 1

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
        "table_name": "emp_monthly_cost_result",
        "column_code": "month",
        "column_label": "月份",
        "data_type": "string",
        "is_pk_part": True,
        "is_sensitive": False,
        "is_visible": True,
        "display_order": 0,
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


def make_result_model(table_name: str = "emp_monthly_cost_result"):
    table = Table(
        table_name,
        MetaData(),
        Column("id", BigInteger, primary_key=True),
        Column("pk_hash", String(64), nullable=False),
        Column("synced_at", DateTime(timezone=True)),
        Column("month", String),
        Column("employee_no", String),
        Column("amount", Numeric),
        Column("department", String),
    )
    return _make_model_from_table(table_name, table)


def register_result_table(model, *, table_name: str = "emp_monthly_cost_result"):
    old_model = DATA_TABLES.get(table_name)
    old_period = PERIOD_TABLES.get(table_name)
    DATA_TABLES[table_name] = model
    PERIOD_TABLES[table_name] = {
        "period_col": "month",
        "offset_key": "MONTH_OFFSET",
        "period_source": "inject",
    }
    return old_model, old_period


def restore_result_table(old_model, old_period, *, table_name: str = "emp_monthly_cost_result"):
    if old_model is None:
        DATA_TABLES.pop(table_name, None)
    else:
        DATA_TABLES[table_name] = old_model
    if old_period is None:
        PERIOD_TABLES.pop(table_name, None)
    else:
        PERIOD_TABLES[table_name] = old_period


def result_columns(table_name: str = "emp_monthly_cost_result"):
    return [
        make_column(table_name=table_name, column_code="month", column_label="月份", is_pk_part=True),
        make_column(
            table_name=table_name,
            column_code="employee_no",
            column_label="工号",
            is_pk_part=True,
            display_order=10,
        ),
        make_column(
            table_name=table_name,
            column_code="amount",
            column_label="分摊金额",
            data_type="number",
            display_order=20,
            is_pk_part=False,
        ),
    ]


def patch_insert(monkeypatch):
    holder = {}

    def fake_pg_insert(model_arg):
        holder["insert"] = FakeInsert(model_arg)
        return holder["insert"]

    monkeypatch.setattr(sync_service, "pg_insert", fake_pg_insert)
    return holder


def report_config(**overrides):
    data = {
        "columns": [],
        "filters": [],
        "filter_logic": None,
        "sorts": [],
        "value_rules": [],
        "aggregate": False,
        "aggregations": {},
        "transpose": {},
        "rounding_corrections": [],
    }
    data.update(overrides)
    return data


def sql_texts(db: FakeSession) -> list[str]:
    return [str(statement) for statement, _ in db.executed]


async def test_allocation_scheme_archive_writes_entity_result_columns(monkeypatch):
    model = make_result_model()
    old_model, old_period = register_result_table(model)
    insert_holder = patch_insert(monkeypatch)
    scheme = AllocationScheme(
        id=7,
        name="月度分摊",
        dataset_id=3,
        result_table="emp_monthly_cost_result",
        config=report_config(),
        is_active=True,
    )

    async def fake_run_dataset_query(**kwargs):
        return (
            [
                {"code": "salary.employee_no", "label": "工号"},
                {"code": "salary.amount", "label": "分摊金额"},
            ],
            [
                {
                    "salary.employee_no": "E001",
                    "salary.amount": "1,234.50",
                    "_row_no": 1,
                }
            ],
            1,
        )

    monkeypatch.setattr(
        "app.reports.sql_builder.run_dataset_query",
        fake_run_dataset_query,
    )
    db = FakeSession(
        get_map={(AllocationScheme, 7): scheme},
        results=[
            FakeResult(rows=result_columns()),
            FakeResult(value=30),
            FakeResult(rows=[result_columns()[0]]),
            FakeResult(rows=result_columns()),
            FakeResult(rows=[("month",), ("employee_no",)]),
            FakeResult(rows=[]),
            FakeResult(rows=[]),
        ],
    )

    try:
        out = await allocation_router.run_scheme(
            7,
            allocation_router.RunIn(
                extra_filters=[{"column": "month", "op": "eq", "value": "2026-06"}]
            ),
            user=SimpleNamespace(id=99),
            db=db,
        )
    finally:
        restore_result_table(old_model, old_period)

    assert out.status == "success"
    assert out.rows_written == 1
    payload = insert_holder["insert"].payload[0]
    assert "raw" not in payload
    assert "salary.employee_no" not in payload
    assert payload["month"] == "202606"
    assert payload["employee_no"] == "E001"
    assert payload["amount"] == Decimal("1234.50")


async def test_cost_allocation_archive_strips_alias_and_uses_entity_upsert(monkeypatch):
    model = make_result_model()
    old_model, old_period = register_result_table(model)
    insert_holder = patch_insert(monkeypatch)
    report = Report(
        id=5,
        name="成本分摊报表",
        table_name="",
        dataset_id=8,
        config=report_config(),
    )

    async def fake_run_dataset_query(**kwargs):
        return (
            [
                {"code": "result.employee_no", "label": "工号"},
                {"code": "result.amount", "label": "分摊金额"},
            ],
            [{"result.employee_no": "E001", "result.amount": Decimal("88.50")}],
            1,
        )

    monkeypatch.setattr(
        "app.reports.sql_builder.run_dataset_query",
        fake_run_dataset_query,
    )
    db = FakeSession(
        get_map={(Report, 5): report},
        results=[
            FakeResult(rows=result_columns()),
            FakeResult(value=30),
            FakeResult(rows=[result_columns()[0]]),
            FakeResult(rows=result_columns()),
            FakeResult(rows=[("month",), ("employee_no",)]),
            FakeResult(rows=[]),
            FakeResult(rows=[]),
        ],
    )

    try:
        out = await cost_allocation_router.archive_cost_allocation(
            cost_allocation_router.ArchiveIn(report_id=5, period_ym="202606"),
            user=SimpleNamespace(id=99),
            db=db,
        )
    finally:
        restore_result_table(old_model, old_period)

    assert out.archived == 1
    payload = insert_holder["insert"].payload[0]
    assert "raw" not in payload
    assert "result.employee_no" not in payload
    assert payload["month"] == "202606"
    assert payload["employee_no"] == "E001"
    assert payload["amount"] == Decimal("88.50")


async def test_allocation_archive_rejects_legacy_raw_result_table(monkeypatch):
    old_model, old_period = register_result_table(
        make_legacy_raw_model("allocation_legacy_raw_result")
    )
    report = Report(
        id=5,
        name="成本分摊报表",
        table_name="",
        dataset_id=8,
        config=report_config(),
    )

    async def fake_run_dataset_query(**kwargs):
        return (
            [{"code": "result.employee_no", "label": "工号"}],
            [{"result.employee_no": "E001"}],
            1,
        )

    monkeypatch.setattr(
        "app.reports.sql_builder.run_dataset_query",
        fake_run_dataset_query,
    )
    db = FakeSession(get_map={(Report, 5): report})

    try:
        with pytest.raises(HTTPException) as exc_info:
            await cost_allocation_router.archive_cost_allocation(
                cost_allocation_router.ArchiveIn(report_id=5, period_ym="202606"),
                user=SimpleNamespace(id=99),
                db=db,
            )
    finally:
        restore_result_table(old_model, old_period)

    assert exc_info.value.status_code == 422
    assert "不是实体列结构" in str(exc_info.value.detail)


async def test_result_table_can_be_exposed_to_finebi_with_entity_types():
    table_name = "emp_monthly_cost_result"
    model = make_result_model(table_name)
    old_model, old_period = register_result_table(model, table_name=table_name)
    columns = result_columns(table_name)
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
            FakeResult(value=False),  # old finebi schema exists
            FakeResult(),  # GRANT schema
            FakeResult(),  # GRANT table
            FakeResult(),  # ALTER ROLE search_path
            FakeResult(value=1),
        ]
    )

    try:
        rows, _ = await push_service.push_db_expose(
            table_name,
            {
                "_pt_id": "42",
                "readonly_user": "ro_cost_result",
                "period_ym": "202606",
            },
            {"readonly_password": "secret"},
            [],
            db,
        )
    finally:
        restore_result_table(old_model, old_period, table_name=table_name)

    assert rows == 1
    sql = "\n".join(sql_texts(db))
    assert "raw" not in sql.lower()
    assert '"分摊金额" NUMERIC' in sql
    assert 'FROM public."emp_monthly_cost_result" WHERE "month" = :period_ym' in sql
