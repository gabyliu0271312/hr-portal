# -*- coding: utf-8 -*-
"""Z03 L4: l4_audit_steps (full-chain per-step audit)

Revision ID: 0088_z03_l4_audit_steps
Revises: 0087_z03_l4_pending_executions
Create Date: 2026-07-11
"""
import sqlalchemy as sa
from alembic import op

revision = "0088_z03_l4_audit_steps"
down_revision = "0087_z03_l4_pending_executions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "l4_audit_steps",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("trace_id", sa.String(64), nullable=False, index=True),
        sa.Column("execution_id", sa.BigInteger, nullable=True),
        sa.Column("metric_id", sa.BigInteger, sa.ForeignKey("warehouse_metrics.id", ondelete="SET NULL"), nullable=True),
        sa.Column("step_code", sa.String(32), nullable=False),
        sa.Column("step_name", sa.String(64), nullable=False),
        sa.Column("step_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("risk_level", sa.String(16), nullable=True),
        sa.Column("input_snapshot", sa.JSON, nullable=True),
        sa.Column("output_snapshot", sa.JSON, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("operator", sa.String(64), nullable=True),
        sa.Column("started_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("l4_audit_steps")
