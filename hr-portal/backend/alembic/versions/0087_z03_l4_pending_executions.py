# -*- coding: utf-8 -*-
"""Z03 L4: l4_pending_executions (support confirm/approve resume)

Revision ID: 0087_z03_l4_pending_executions
Revises: 0086_z03_l4_runtime_publish_batches
Create Date: 2026-07-11
"""
import sqlalchemy as sa
from alembic import op

revision = "0087_z03_l4_pending_executions"
down_revision = "0086_z03_l4_runtime_publish_batches"
branch_labels = None
depends_on = None


def _table_exists(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if _table_exists(inspector, "l4_pending_executions"):
        return
    op.create_table(
        "l4_pending_executions",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("execution_id", sa.BigInteger, nullable=False),
        sa.Column("metric_id", sa.BigInteger, sa.ForeignKey("warehouse_metrics.id", ondelete="SET NULL"), nullable=True),
        sa.Column("trace_id", sa.String(64), nullable=False),
        sa.Column("trigger_type", sa.String(64), nullable=False),
        sa.Column("current_step", sa.String(32), nullable=False),
        sa.Column("risk_state", sa.String(32), nullable=False),
        sa.Column("dws_draft_id", sa.BigInteger, nullable=True),
        sa.Column("dws_published", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("ads_draft_id", sa.BigInteger, nullable=True),
        sa.Column("steps_snapshot", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("preview_snapshot", sa.JSON, nullable=True),
        sa.Column("risk_assessment", sa.JSON, nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("confirmed_by", sa.String(64), nullable=True),
        sa.Column("approved_by", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if _table_exists(inspector, "l4_pending_executions"):
        op.drop_table("l4_pending_executions")
