from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import BigInteger, Column, DateTime, MetaData, Numeric, String, Table

from app.data.dynamic_loader import _make_model_from_table
from app.data.models import DATA_TABLES
from app.tools import router as tools_router
from app.tools.models import CompensationCap, DocumentTemplate
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
    def __init__(self, *, results=()):
        self.results = list(results)
        self.executed = []

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))
        result = self.results.pop(0) if self.results else None
        if isinstance(result, FakeResult):
            return result
        return FakeResult(result)


def make_roster_model(table_name: str = "emp_realtime_roster"):
    table = Table(
        table_name,
        MetaData(),
        Column("id", BigInteger, primary_key=True),
        Column("pk_hash", String(64), nullable=False),
        Column("synced_at", DateTime(timezone=True)),
        Column("employee_no", String),
        Column("full_name", String),
        Column("chinese_name", String),
        Column("english_name", String),
        Column("company_name", String),
        Column("department", String),
        Column("department_2", String),
        Column("department_3", String),
        Column("department_4", String),
        Column("department_5", String),
        Column("company_org", String),
        Column("work_location", String),
        Column("employee_status", String),
        Column("hire_date", String),
        Column("terminated_date", String),
        Column("base_salary", Numeric),
        Column("target_year_end_bonus", Numeric),
        Column("id_number", String),
        Column("position", String),
        Column("standard_position", String),
    )
    return _make_model_from_table(table_name, table)


def make_employee(model, **overrides):
    data = {
        "id": 7,
        "pk_hash": "pk7",
        "synced_at": datetime(2026, 6, 1, tzinfo=timezone.utc),
        "employee_no": "E001",
        "full_name": "san.zhang张三",
        "chinese_name": "张三",
        "english_name": "san.zhang",
        "company_name": "创梦天地",
        "department": "研发部",
        "department_2": None,
        "department_3": None,
        "department_4": None,
        "department_5": None,
        "company_org": "集团",
        "work_location": "深圳",
        "employee_status": "在职",
        "hire_date": "2021-01-01",
        "terminated_date": "2026-07-01",
        "base_salary": Decimal("20000"),
        "target_year_end_bonus": Decimal("60000"),
        "id_number": "440300199001010000",
        "position": "工程师",
        "standard_position": "软件工程师",
    }
    data.update(overrides)
    return model(**data)


def make_cap(**overrides):
    data = {
        "id": 3,
        "region": "深圳",
        "effective_start": date(2026, 1, 1),
        "effective_end": date(2026, 12, 31),
        "cap_amount": Decimal("30000"),
        "note": None,
        "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
    }
    data.update(overrides)
    return CompensationCap(**data)


def make_template(**overrides):
    data = {
        "id": 9,
        "code": "annual_income",
        "name": "年包收入证明",
        "business_type": "income_certificate",
        "description": None,
        "is_active": True,
        "version": "1.0",
        "effective_start": None,
        "effective_end": None,
        "layout_config": {},
        "template_file_name": None,
        "template_file_size": None,
        "template_file": None,
        "parsed_variables": [],
        "uploaded_at": None,
        "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
    }
    data.update(overrides)
    row = DocumentTemplate(**data)
    row.blocks = []
    row.variables = []
    return row


@pytest.fixture
def roster_model():
    table_name = "emp_realtime_roster"
    old_model = DATA_TABLES.get(table_name)
    model = make_roster_model(table_name)
    DATA_TABLES[table_name] = model
    try:
        yield model
    finally:
        if old_model is None:
            DATA_TABLES.pop(table_name, None)
        else:
            DATA_TABLES[table_name] = old_model


@pytest.fixture
def patch_access(monkeypatch):
    async def allow_scope(user, table, db):
        return None

    async def no_hidden(user, table, db, tool_key=None):
        return set()

    monkeypatch.setattr(tools_router, "build_scope_filter", allow_scope)
    monkeypatch.setattr(tools_router, "is_unrestricted", lambda clause: True)
    monkeypatch.setattr("app.permissions.masker.get_hidden_columns", no_hidden)


def assert_no_raw_sql(db: FakeSession):
    sql = "\n".join(str(statement) for statement, _ in db.executed)
    assert "raw" not in sql.lower()
    assert "jsonb" not in sql.lower()


async def test_employee_search_reads_entity_columns(roster_model, patch_access):
    row = make_employee(roster_model)
    db = FakeSession(results=[FakeResult(rows=[row])])

    result = await tools_router.search_compensation_employees(
        keyword="张",
        limit=20,
        user=SimpleNamespace(id=1),
        db=db,
    )

    assert result[0].employee_no == "E001"
    assert result[0].name == "san.zhang张三"
    assert result[0].chinese_name == "张三"
    assert result[0].company == "创梦天地"
    assert result[0].department == "研发部"
    assert result[0].work_region == "深圳"
    assert_no_raw_sql(db)


async def test_calc_core_reads_salary_and_dates_from_entity_columns(roster_model, patch_access):
    employee = make_employee(roster_model)
    db = FakeSession(
        results=[
            FakeResult(value=employee),
            FakeResult(value=make_cap()),
        ]
    )

    result, values = await tools_router._calc_core(
        tools_router.CompensationCalcIn(employee_id=7, plan="N+1"),
        SimpleNamespace(id=1),
        db,
    )

    assert result.employee.name == "san.zhang张三"
    assert result.employee.chinese_name == "张三"
    assert result.hire_date == date(2021, 1, 1)
    assert result.leave_date == date(2026, 7, 1)
    assert result.basic_salary == 20000.0
    assert result.compensation_base == 20000.0
    assert values["base_salary"] == Decimal("20000")
    assert_no_raw_sql(db)


async def test_income_certificate_prepare_reads_entity_columns(
    monkeypatch,
    roster_model,
    patch_access,
):
    employee = make_employee(roster_model)
    template = make_template()

    async def fake_template(db, code=None):
        return template

    monkeypatch.setattr(tools_router, "_income_certificate_template", fake_template)
    monkeypatch.setattr(tools_router, "_manual_defaults", lambda template, base_values=None: {})
    db = FakeSession(results=[FakeResult(value=employee)])

    result = await tools_router.prepare_income_certificate(
        tools_router.IncomeCertificatePrepareIn(employee_id=7),
        user=SimpleNamespace(id=1),
        db=db,
    )

    assert result.company == "创梦天地"
    assert result.name == "san.zhang张三"
    assert result.id_card == "440300199001010000"
    assert result.position == "工程师"
    assert result.basic_salary == 20000.0
    assert result.target_bonus == 60000.0
    assert result.annual_package == 300000.0
    assert_no_raw_sql(db)


async def test_tool_center_rejects_legacy_raw_roster():
    table_name = "emp_realtime_roster"
    old_model = DATA_TABLES.get(table_name)
    DATA_TABLES[table_name] = make_legacy_raw_model("tools_legacy_raw_roster")
    try:
        with pytest.raises(HTTPException) as exc_info:
            tools_router._employee_model()
    finally:
        if old_model is None:
            DATA_TABLES.pop(table_name, None)
        else:
            DATA_TABLES[table_name] = old_model

    assert exc_info.value.status_code == 409
