# -*- coding: utf-8 -*-
"""Z03 L4: l4_runtime_controls + l4_publish_batches

Revision ID: 0086_z03_l4_runtime_publish_batches
Revises: 0085_z03_l4_auto_approvals
Create Date: 2026-07-11
"""
import sqlalchemy as sa
from alembic import op

revision = "0086_z03_l4_runtime_publish_batches"
down_revision = "0085_z03_l4_auto_approvals"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "l4_runtime_controls",
        sa.Column("id", sa.BigInteger, primary_key=True, default=1),
        sa.Column("emergency_stop", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("emergency_stop_reason", sa.Text, nullable=True),
        sa.Column("emergency_stop_by", sa.String(64), nullable=True),
        sa.Column("emergency_stop_at", sa.DateTime, nullable=True),
        sa.Column("max_pilot_metrics", sa.Integer, nullable=False, server_default="5"),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    # seed initial row
    op.execute("INSERT INTO l4_runtime_controls (id, max_pilot_metrics) VALUES (1, 5) ON CONFLICT DO NOTHING")

    op.create_table(
        "l4_publish_batches",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("metric_id", sa.BigInteger, sa.ForeignKey("warehouse_metrics.id", ondelete="SET NULL"), nullable=True),
        sa.Column("metric_code", sa.String(64), nullable=True),
        sa.Column("trace_id", sa.String(64), nullable=False),
        sa.Column("trigger_type", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="running"),
        sa.Column("published_assets", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("previous_versions", sa.JSON, nullable=True, server_default="[]"),
        sa.Column("rollback_status", sa.String(32), nullable=True),
        sa.Column("rollback_by", sa.String(64), nullable=True),
        sa.Column("rollback_at", sa.DateTime, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("l4_publish_batches")
    op.drop_table("l4_runtime_controls")
