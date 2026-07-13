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


def _table_exists(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _index_exists(inspector, table_name: str, name: str) -> bool:
    return any(i.get("name") == name for i in inspector.get_indexes(table_name))


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if not _table_exists(inspector, "l4_audit_steps"):
        op.create_table(
            "l4_audit_steps",
            sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
            sa.Column("trace_id", sa.String(64), nullable=False),
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

    inspector = sa.inspect(conn)
    if not _index_exists(inspector, "l4_audit_steps", "ix_l4_audit_steps_trace_id"):
        op.create_index("ix_l4_audit_steps_trace_id", "l4_audit_steps", ["trace_id"])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if _table_exists(inspector, "l4_audit_steps"):
        if _index_exists(inspector, "l4_audit_steps", "ix_l4_audit_steps_trace_id"):
            op.drop_index("ix_l4_audit_steps_trace_id", table_name="l4_audit_steps")
        op.drop_table("l4_audit_steps")
