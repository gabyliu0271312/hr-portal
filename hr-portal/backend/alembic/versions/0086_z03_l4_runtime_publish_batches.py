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


def _table_exists(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not _table_exists(inspector, "l4_runtime_controls"):
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
    # Existing production tables may not have server defaults recorded, so seed all NOT NULL columns explicitly.
    op.execute(
        """
        INSERT INTO l4_runtime_controls (id, emergency_stop, max_pilot_metrics, updated_at)
        VALUES (1, false, 5, now())
        ON CONFLICT (id) DO UPDATE
        SET emergency_stop = COALESCE(l4_runtime_controls.emergency_stop, false),
            max_pilot_metrics = COALESCE(l4_runtime_controls.max_pilot_metrics, EXCLUDED.max_pilot_metrics),
            updated_at = COALESCE(l4_runtime_controls.updated_at, EXCLUDED.updated_at)
        """
    )

    inspector = sa.inspect(conn)
    if not _table_exists(inspector, "l4_publish_batches"):
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
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if _table_exists(inspector, "l4_publish_batches"):
        op.drop_table("l4_publish_batches")
    inspector = sa.inspect(conn)
    if _table_exists(inspector, "l4_runtime_controls"):
        op.drop_table("l4_runtime_controls")
