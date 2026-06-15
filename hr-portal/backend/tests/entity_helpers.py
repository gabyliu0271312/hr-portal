from sqlalchemy import BigInteger, Column, DateTime, JSON, MetaData, String, Table

from app.data.dynamic_loader import _make_model_from_table


def make_legacy_raw_model(table_name: str):
    table = Table(
        table_name,
        MetaData(),
        Column("id", BigInteger, primary_key=True),
        Column("pk_hash", String(64), nullable=False),
        Column("raw", JSON, nullable=False),
        Column("synced_at", DateTime(timezone=True)),
    )
    return _make_model_from_table(table_name, table)
