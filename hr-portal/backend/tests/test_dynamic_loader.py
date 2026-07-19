from types import SimpleNamespace

import pytest
from sqlalchemy import BigInteger, Column, MetaData, Numeric, String, Table

import app.data.dynamic_loader as dynamic_loader
from app.data.dynamic_loader import (
    _make_model_from_table,
    register_period_table,
    register_source_table_model,
    unregister_source_table_model,
)
from app.data.models import DATA_TABLES
from app.datasources.sync_service import PERIOD_TABLES


def test_dynamic_loader_no_longer_exposes_legacy_raw_fallback():
    assert not hasattr(dynamic_loader, "_make_dynamic_model")


def test_make_model_from_reflected_table_exposes_entity_columns():
    table = Table(
        "tmp_entity_table",
        MetaData(),
        Column("id", BigInteger, primary_key=True),
        Column("pk_hash", String(64), nullable=False),
        Column("employee_no", String),
        Column("base_salary", Numeric),
    )

    model = _make_model_from_table("tmp_entity_table", table)

    assert "raw" not in model.__table__.columns
    assert "employee_no" in model.__table__.columns
    assert "base_salary" in model.__table__.columns
    assert model.__table__.columns["base_salary"].type.__class__ is Numeric


def test_unregister_source_table_model_removes_runtime_entry():
    DATA_TABLES["tmp_unregister_table"] = object()

    unregister_source_table_model("tmp_unregister_table")

    assert "tmp_unregister_table" not in DATA_TABLES


async def test_register_source_table_model_reflects_and_updates_runtime_entry(monkeypatch):
    table = Table(
        "tmp_registered_entity_table",
        MetaData(),
        Column("id", BigInteger, primary_key=True),
        Column("pk_hash", String(64), nullable=False),
        Column("employee_no", String),
    )
    model = _make_model_from_table("tmp_registered_entity_table", table)

    async def fake_reflect(db, table_name):
        assert db == "fake-session"
        assert table_name == "tmp_registered_entity_table"
        return model

    monkeypatch.setattr("app.data.dynamic_loader.reflect_source_table_model", fake_reflect)
    DATA_TABLES.pop("tmp_registered_entity_table", None)

    try:
        registered = await register_source_table_model(
            "fake-session",
            "tmp_registered_entity_table",
            force=True,
        )

        assert registered is model
        assert DATA_TABLES["tmp_registered_entity_table"] is model
    finally:
        DATA_TABLES.pop("tmp_registered_entity_table", None)


def test_register_period_table_populates_period_tables():
    table_name = "tmp_period_table"
    PERIOD_TABLES.pop(table_name, None)
    rt = SimpleNamespace(
        table_name=table_name,
        is_period=True,
        period_col="month",
        period_source="inject",
    )

    try:
        register_period_table(rt, overwrite=True)

        assert PERIOD_TABLES[table_name] == {
            "period_col": "month",
            "offset_key": "MONTH_OFFSET",
            "period_source": "inject",
        }
    finally:
        PERIOD_TABLES.pop(table_name, None)




class _LoaderResult:
    def __init__(self, rows):
        self.rows = rows

    def scalars(self):
        return self

    def all(self):
        return self.rows


class _LoaderSession:
    def __init__(self, registered_rows, relation_rows):
        self._results = [
            _LoaderResult(registered_rows),
            _LoaderResult(relation_rows),
        ]
        self.committed = False

    async def execute(self, _statement):
        return self._results.pop(0)

    async def commit(self):
        self.committed = True


async def test_load_dynamic_tables_removes_unreferenced_missing_non_builtin_table(monkeypatch):
    orphan = SimpleNamespace(table_name="tmp_orphaned_table", is_builtin=False)
    session = _LoaderSession([orphan], [])
    removed = []

    async def no_reference(_db, _table_name):
        return None

    async def remove(_db, table_name):
        removed.append(table_name)

    monkeypatch.setattr(dynamic_loader, "_table_reference_reason", no_reference)
    monkeypatch.setattr(dynamic_loader, "_remove_orphaned_registration", remove)

    await dynamic_loader.load_dynamic_tables(session)

    assert removed == ["tmp_orphaned_table"]
    assert session.committed is True


async def test_load_dynamic_tables_keeps_missing_referenced_table_blocking_startup(monkeypatch):
    referenced = SimpleNamespace(table_name="tmp_referenced_table", is_builtin=False)
    session = _LoaderSession([referenced], [])

    async def data_set_reference(_db, _table_name):
        return "数据集"

    monkeypatch.setattr(dynamic_loader, "_table_reference_reason", data_set_reference)

    with pytest.raises(RuntimeError, match="tmp_referenced_table.*数据集"):
        await dynamic_loader.load_dynamic_tables(session)

    assert session.committed is False


async def test_load_dynamic_tables_keeps_missing_builtin_table_blocking_startup(monkeypatch):
    builtin = SimpleNamespace(table_name="tmp_builtin_table", is_builtin=True)
    session = _LoaderSession([builtin], [])

    with pytest.raises(RuntimeError, match="tmp_builtin_table.*内置表"):
        await dynamic_loader.load_dynamic_tables(session)

    assert session.committed is False
