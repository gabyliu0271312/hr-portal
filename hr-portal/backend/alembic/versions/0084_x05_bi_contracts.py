# -*- coding: utf-8 -*-
"""X05 BI contracts: warehouse_bi_contracts

Revision ID: 0084_x05_bi_contracts
Revises: 0083_x05_audit_events
Create Date: 2026-07-11
"""
import sqlalchemy as sa
from alembic import op

revision = "0084_x05_bi_contracts"
down_revision = "0083_x05_audit_events"
branch_labels = None
depends_on = None


def _table_exists(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _unique_exists(inspector, table_name: str, name: str) -> bool:
    return any(c.get("name") == name for c in inspector.get_unique_constraints(table_name))


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if not _table_exists(inspector, "warehouse_bi_contracts"):
        op.create_table(
            "warehouse_bi_contracts",
            sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
            sa.Column("asset_type", sa.String(16), nullable=False, comment="dws / ads"),
            sa.Column("asset_id", sa.BigInteger, nullable=False),
            sa.Column("asset_name", sa.String(256), nullable=False),
            sa.Column("version", sa.Integer, nullable=False, default=1),
            sa.Column("contract_json", sa.JSON, nullable=False, comment="contract payload: fields / permissions / refresh_semantics"),
            sa.Column("status", sa.String(16), nullable=False, default="active", comment="active / archived"),
            sa.Column("created_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    inspector = sa.inspect(conn)
    if not _unique_exists(inspector, "warehouse_bi_contracts", "uq_bi_contract_asset"):
        op.create_unique_constraint("uq_bi_contract_asset", "warehouse_bi_contracts", ["asset_type", "asset_id"])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if _table_exists(inspector, "warehouse_bi_contracts"):
        if _unique_exists(inspector, "warehouse_bi_contracts", "uq_bi_contract_asset"):
            op.drop_constraint("uq_bi_contract_asset", "warehouse_bi_contracts", type_="unique")
        op.drop_table("warehouse_bi_contracts")
