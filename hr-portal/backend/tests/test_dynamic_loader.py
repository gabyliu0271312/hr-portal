from types import SimpleNamespace

from sqlalchemy import BigInteger, Column, MetaData, Numeric, String, Table

from app.data.dynamic_loader import (
    _make_dynamic_model,
    _make_model_from_table,
    register_period_table,
    register_source_table_model,
    unregister_source_table_model,
)
from app.data.models import DATA_TABLES
from app.datasources.sync_service import PERIOD_TABLES


def test_make_dynamic_model_keeps_legacy_raw_schema_for_transition():
    model = _make_dynamic_model("tmp_legacy_raw_table")

    assert "raw" in model.__table__.columns
    assert "id" in model.__table__.columns
    assert "pk_hash" in model.__table__.columns
    assert "synced_at" in model.__table__.columns


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


def test_register_period_table_ignores_non_period_table():
    table_name = "tmp_non_period_table"
    PERIOD_TABLES.pop(table_name, None)
    rt = SimpleNamespace(
        table_name=table_name,
        is_period=False,
        period_col="month",
        period_source="field",
    )

    register_period_table(rt, overwrite=True)

    assert table_name not in PERIOD_TABLES
