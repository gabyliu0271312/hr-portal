from sqlalchemy import BigInteger, Column, MetaData, String, Table

import pytest

from app.data.dynamic_loader import _make_model_from_table
from app.data.models import DATA_TABLES
from app.datasets import indexing
from tests.entity_helpers import make_legacy_raw_model


pytestmark = pytest.mark.asyncio


class FakeSession:
    def __init__(self):
        self.executed = []
        self.committed = False

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))

    async def commit(self):
        self.committed = True


def make_entity_model(table_name: str):
    table = Table(
        table_name,
        MetaData(),
        Column("id", BigInteger, primary_key=True),
        Column("pk_hash", String(64), nullable=False),
        Column("employee_no", String),
    )
    return _make_model_from_table(table_name, table)


def set_table(table_name: str, model):
    old = DATA_TABLES.get(table_name)
    DATA_TABLES[table_name] = model
    return old


def restore_table(table_name: str, old):
    if old is None:
        DATA_TABLES.pop(table_name, None)
    else:
        DATA_TABLES[table_name] = old


async def test_join_index_uses_entity_column_index_sql():
    table_name = "dataset_index_entity"
    old = set_table(table_name, make_entity_model(table_name))
    db = FakeSession()

    try:
        await indexing._ensure_one(db, table_name, "employee_no")
    finally:
        restore_table(table_name, old)

    sql = str(db.executed[0][0]).lower()
    assert "create index if not exists" in sql
    assert '"dataset_index_entity"' in sql
    assert '"employee_no"' in sql
    assert "raw" not in sql
    assert "jsonb" not in sql


async def test_join_index_rejects_legacy_raw_model():
    table_name = "dataset_index_raw"
    old = set_table(table_name, make_legacy_raw_model(table_name))

    try:
        with pytest.raises(RuntimeError, match="不是实体列结构"):
            await indexing._ensure_one(FakeSession(), table_name, "employee_no")
    finally:
        restore_table(table_name, old)


async def test_join_index_rejects_missing_entity_column():
    table_name = "dataset_index_missing"
    old = set_table(table_name, make_entity_model(table_name))

    try:
        with pytest.raises(RuntimeError, match="缺少 JOIN 实体列"):
            await indexing._ensure_one(FakeSession(), table_name, "missing_col")
    finally:
        restore_table(table_name, old)
