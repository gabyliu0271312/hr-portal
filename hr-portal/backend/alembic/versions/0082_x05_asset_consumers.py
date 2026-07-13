# -*- coding: utf-8 -*-
"""X05 impact analysis: warehouse_asset_consumers

Revision ID: 0082_x05_asset_consumers
Revises: 0081_x05_refresh_policies
Create Date: 2026-07-11
"""
import sqlalchemy as sa
from alembic import op

revision = "0082_x05_asset_consumers"
down_revision = "0081_x05_refresh_policies"
branch_labels = None
depends_on = None


def _table_exists(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _index_exists(inspector, table_name: str, name: str) -> bool:
    return any(i.get("name") == name for i in inspector.get_indexes(table_name))


def _unique_exists(inspector, table_name: str, name: str) -> bool:
    return any(c.get("name") == name for c in inspector.get_unique_constraints(table_name))


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if not _table_exists(inspector, "warehouse_asset_consumers"):
        op.create_table(
            "warehouse_asset_consumers",
            sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
            sa.Column("asset_type", sa.String(16), nullable=False, comment="upstream asset type: dws / ads / dataset"),
            sa.Column("asset_id", sa.BigInteger, nullable=False),
            sa.Column("asset_name", sa.String(256), nullable=False),
            sa.Column("consumer_type", sa.String(32), nullable=False, comment="report / dashboard / api / push / bi_contract"),
            sa.Column("consumer_id", sa.BigInteger, nullable=False),
            sa.Column("consumer_name", sa.String(256), nullable=False),
            sa.Column("owner_id", sa.BigInteger, nullable=True),
            sa.Column("owner_name", sa.String(64), nullable=True),
            sa.Column("sla_level", sa.String(16), nullable=True, comment="high / medium / low"),
            sa.Column("last_used_at", sa.DateTime, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    inspector = sa.inspect(conn)
    if not _index_exists(inspector, "warehouse_asset_consumers", "ix_asset_consumers_asset"):
        op.create_index("ix_asset_consumers_asset", "warehouse_asset_consumers", ["asset_type", "asset_id"])
    inspector = sa.inspect(conn)
    if not _unique_exists(inspector, "warehouse_asset_consumers", "uq_asset_consumer"):
        op.create_unique_constraint("uq_asset_consumer", "warehouse_asset_consumers", ["asset_type", "asset_id", "consumer_type", "consumer_id"])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if _table_exists(inspector, "warehouse_asset_consumers"):
        if _unique_exists(inspector, "warehouse_asset_consumers", "uq_asset_consumer"):
            op.drop_constraint("uq_asset_consumer", "warehouse_asset_consumers", type_="unique")
        inspector = sa.inspect(conn)
        if _index_exists(inspector, "warehouse_asset_consumers", "ix_asset_consumers_asset"):
            op.drop_index("ix_asset_consumers_asset", table_name="warehouse_asset_consumers")
        op.drop_table("warehouse_asset_consumers")
