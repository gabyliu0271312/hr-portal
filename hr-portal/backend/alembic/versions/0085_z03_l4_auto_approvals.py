# -*- coding: utf-8 -*-
"""Z03 L4 auto approvals: l4_auto_approvals + l4_cascade_rules

Revision ID: 0085_z03_l4_auto_approvals
Revises: 0084_x05_bi_contracts
Create Date: 2026-07-11
"""
import sqlalchemy as sa
from alembic import op

revision = "0085_z03_l4_auto_approvals"
down_revision = "0084_x05_bi_contracts"
branch_labels = None
depends_on = None


def _table_exists(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not _table_exists(inspector, "l4_auto_approvals"):
        op.create_table(
            "l4_auto_approvals",
            sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
            sa.Column("metric_id", sa.BigInteger, sa.ForeignKey("warehouse_metrics.id", ondelete="CASCADE"), nullable=False),
            sa.Column("subject_area", sa.String(64), nullable=True, comment="subject area"),
            sa.Column("risk_level", sa.String(16), nullable=False, server_default="medium", comment="risk level"),
            sa.Column("max_auto_frequency", sa.Integer, nullable=False, server_default="1", comment="max auto publish frequency per day"),
            sa.Column("auto_rollback_enabled", sa.Boolean, nullable=False, server_default=sa.text("true"), comment="auto rollback on failure"),
            sa.Column("status", sa.String(16), nullable=False, server_default="pending", comment="pending/approved/rejected/revoked"),
            sa.Column("requested_by", sa.String(64), nullable=True, comment="requester"),
            sa.Column("approved_by", sa.String(64), nullable=True, comment="approver"),
            sa.Column("reason", sa.Text, nullable=True, comment="request/approval note"),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    inspector = sa.inspect(conn)
    if not _table_exists(inspector, "l4_cascade_rules"):
        op.create_table(
            "l4_cascade_rules",
            sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
            sa.Column("metric_id", sa.BigInteger, sa.ForeignKey("warehouse_metrics.id", ondelete="CASCADE"), unique=True, nullable=False),
            sa.Column("trigger_conditions", sa.JSON, nullable=False, server_default="[]", comment="trigger conditions"),
            sa.Column("risk_strategies", sa.JSON, nullable=False, server_default="{}", comment="risk strategies"),
            sa.Column("max_frequency", sa.Integer, nullable=False, server_default="1", comment="max executions per day"),
            sa.Column("auto_rollback", sa.Boolean, nullable=False, server_default=sa.text("true"), comment="auto rollback on failure"),
            sa.Column("notify_on_success", sa.Boolean, nullable=False, server_default=sa.text("false")),
            sa.Column("notify_on_block", sa.Boolean, nullable=False, server_default=sa.text("true")),
            sa.Column("notify_on_fail", sa.Boolean, nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if _table_exists(inspector, "l4_cascade_rules"):
        op.drop_table("l4_cascade_rules")
    inspector = sa.inspect(conn)
    if _table_exists(inspector, "l4_auto_approvals"):
        op.drop_table("l4_auto_approvals")
