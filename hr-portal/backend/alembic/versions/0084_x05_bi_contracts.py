# -*- coding: utf-8 -*-
"""X05 BI 消费契约: warehouse_bi_contracts 持久化表

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


def upgrade() -> None:
    op.create_table(
        "warehouse_bi_contracts",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("asset_type", sa.String(16), nullable=False, comment="dws / ads"),
        sa.Column("asset_id", sa.BigInteger, nullable=False),
        sa.Column("asset_name", sa.String(256), nullable=False),
        sa.Column("version", sa.Integer, nullable=False, default=1),
        sa.Column("contract_json", sa.JSON, nullable=False, comment="契约 payload: fields / permissions / refresh_semantics"),
        sa.Column("status", sa.String(16), nullable=False, default="active", comment="active / archived"),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_unique_constraint("uq_bi_contract_asset", "warehouse_bi_contracts", ["asset_type", "asset_id"])


def downgrade() -> None:
    op.drop_constraint("uq_bi_contract_asset", "warehouse_bi_contracts", type_="unique")
    op.drop_table("warehouse_bi_contracts")
