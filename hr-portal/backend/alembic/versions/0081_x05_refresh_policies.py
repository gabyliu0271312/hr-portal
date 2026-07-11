# -*- coding: utf-8 -*-
"""X05 刷新策略: warehouse_asset_refresh_policies + warehouse_asset_refresh_runs

Revision ID: 0081_x05_refresh_policies
Revises: 0080_x05_version_isolation
Create Date: 2026-07-11
"""
import sqlalchemy as sa
from alembic import op

revision = "0081_x05_refresh_policies"
down_revision = "0080_x05_version_isolation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "warehouse_asset_refresh_policies",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("asset_type", sa.String(16), nullable=False, comment="dws / ads"),
        sa.Column("asset_id", sa.BigInteger, nullable=False),
        sa.Column("asset_name", sa.String(256), nullable=False),
        sa.Column("strategy", sa.String(32), nullable=False, default="view_realtime",
                  comment="view_realtime / manual / scheduled / upstream_trigger"),
        sa.Column("cron_expr", sa.String(64), nullable=True),
        sa.Column("upstream_asset_type", sa.String(16), nullable=True),
        sa.Column("upstream_asset_id", sa.BigInteger, nullable=True),
        sa.Column("enabled", sa.Boolean, nullable=False, default=True),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("updated_by", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_unique_constraint("uq_refresh_policy_asset", "warehouse_asset_refresh_policies",
                                ["asset_type", "asset_id"])

    op.create_table(
        "warehouse_asset_refresh_runs",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("policy_id", sa.BigInteger, sa.ForeignKey("warehouse_asset_refresh_policies.id", ondelete="SET NULL"), nullable=True),
        sa.Column("asset_type", sa.String(16), nullable=False),
        sa.Column("asset_id", sa.BigInteger, nullable=False),
        sa.Column("asset_name", sa.String(256), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, default="pending", comment="pending/running/success/failed"),
        sa.Column("started_at", sa.DateTime, nullable=True),
        sa.Column("finished_at", sa.DateTime, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("old_version", sa.Integer, nullable=True),
        sa.Column("new_version", sa.Integer, nullable=True),
        sa.Column("row_count", sa.Integer, nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("trigger_type", sa.String(32), nullable=True, comment="manual / schedule / upstream"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("warehouse_asset_refresh_runs")
    op.drop_table("warehouse_asset_refresh_policies")
