from types import SimpleNamespace

from sqlalchemy import Boolean, Column, MetaData, String, Table

from app.data.dynamic_loader import _make_model_from_table
from app.datasources.sync_service import _payload_for_entity_row


def test_entity_payload_uses_system_values_for_residual_technical_metadata():
    table = Table(
        "payload_technical_fields",
        MetaData(),
        Column("pk_hash", String(64), primary_key=True),
        Column("synced_at", String),
        Column("is_active", Boolean, nullable=False),
        Column("sync_status", String, nullable=False),
        Column("full_name", String),
    )
    model = _make_model_from_table("payload_technical_fields", table)
    columns = {
        "is_active": SimpleNamespace(data_type="bool"),
        "sync_status": SimpleNamespace(data_type="string"),
        "full_name": SimpleNamespace(data_type="string"),
    }

    payload = _payload_for_entity_row(
        model=model,
        merged={"is_active": None, "sync_status": None, "full_name": "梅咏壮"},
        columns_by_code=columns,
        pk_hash="row-hash",
    )

    assert payload["is_active"] is True
    assert payload["sync_status"] == "ACTIVE"
    assert payload["full_name"] == "梅咏壮"


def test_entity_payload_skips_removed_technical_columns():
    table = Table(
        "payload_without_technical_columns",
        MetaData(),
        Column("pk_hash", String(64), primary_key=True),
        Column("full_name", String),
    )
    model = _make_model_from_table("payload_without_technical_columns", table)
    columns = {"full_name": SimpleNamespace(data_type="string")}

    payload = _payload_for_entity_row(
        model=model,
        merged={"full_name": "test name"},
        columns_by_code=columns,
        pk_hash="row-hash",
    )

    assert payload == {"pk_hash": "row-hash", "full_name": "test name"}
