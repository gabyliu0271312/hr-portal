from sqlalchemy import BigInteger, Column, DateTime, MetaData, String, Table

import pytest

from app.data.dynamic_loader import _make_model_from_table
from app.data.models import DATA_TABLES
from app.trees import router as trees_router
from tests.entity_helpers import make_legacy_raw_model


pytestmark = pytest.mark.asyncio


class FakeResult:
    def __init__(self, rows=None):
        self.rows = list(rows or [])

    def all(self):
        return list(self.rows)


class FakeSession:
    def __init__(self, *, rows=()):
        self.rows = list(rows)
        self.executed = []

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))
        return FakeResult(self.rows)


def make_roster_model(table_name: str = "emp_realtime_roster"):
    table = Table(
        table_name,
        MetaData(),
        Column("id", BigInteger, primary_key=True),
        Column("pk_hash", String(64), nullable=False),
        Column("synced_at", DateTime(timezone=True)),
        Column("employee_type", String),
        Column("company_name", String),
        Column("full_name", String),
        Column("company_org", String),
        Column("employee_status", String),
    )
    return _make_model_from_table(table_name, table)


def register_roster(model):
    old_model = DATA_TABLES.get("emp_realtime_roster")
    DATA_TABLES["emp_realtime_roster"] = model
    return old_model


def restore_roster(old_model):
    if old_model is None:
        DATA_TABLES.pop("emp_realtime_roster", None)
    else:
        DATA_TABLES["emp_realtime_roster"] = old_model


def assert_no_raw_sql(db: FakeSession):
    sql = "\n".join(str(statement) for statement, _ in db.executed).lower()
    assert "raw" not in sql
    assert "jsonb" not in sql


async def test_employment_type_distinct_reads_entity_columns():
    old_model = register_roster(make_roster_model())
    db = FakeSession(rows=[("正式", 2, 3)])

    try:
        out = await trees_router.get_employment_types(
            include_inactive=False,
            db=db,
        )
    finally:
        restore_roster(old_model)

    assert out[0].value == "正式"
    assert out[0].active_count == 2
    assert out[0].total_count == 3
    assert_no_raw_sql(db)
    sql = str(db.executed[0][0])
    assert "employee_type" in sql
    assert "employee_status" in sql


async def test_persons_reads_name_and_department_entity_columns():
    old_model = register_roster(make_roster_model())
    db = FakeSession(rows=[("张三", "研发中心", True)])

    try:
        out = await trees_router.get_persons(
            include_inactive=False,
            keyword="张",
            db=db,
        )
    finally:
        restore_roster(old_model)

    assert out[0].value == "张三"
    assert out[0].department == "研发中心"
    assert out[0].active is True
    assert_no_raw_sql(db)
    sql = str(db.executed[0][0])
    assert "full_name" in sql
    assert "company_org" in sql
    assert "employee_status" in sql


async def test_tree_distinct_rejects_legacy_raw_roster():
    old_model = register_roster(make_legacy_raw_model("trees_legacy_raw_roster"))

    try:
        with pytest.raises(RuntimeError, match="仍是 raw JSON 结构"):
            await trees_router.get_employment_entities(db=FakeSession())
    finally:
        restore_roster(old_model)
