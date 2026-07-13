# -*- coding: utf-8 -*-
"""Z03 L4: l4_pending_executions dws_version + dws_view_name

Revision ID: 0090_z03_l4_pending_dws_version
Revises: 0089_z03_l4_batch_snapshots
Create Date: 2026-07-11
"""
import sqlalchemy as sa
from alembic import op

revision = "0090_z03_l4_pending_dws_version"
down_revision = "0089_z03_l4_batch_snapshots"
branch_labels = None
depends_on = None


def _columns() -> set[str]:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "l4_pending_executions" not in inspector.get_table_names():
        return set()
    return {c["name"] for c in inspector.get_columns("l4_pending_executions")}


def upgrade() -> None:
    existing = _columns()
    if "dws_version" not in existing:
        op.add_column("l4_pending_executions", sa.Column("dws_version", sa.Integer, nullable=True))
        existing.add("dws_version")
    if "dws_view_name" not in existing:
        op.add_column("l4_pending_executions", sa.Column("dws_view_name", sa.String(256), nullable=True))


def downgrade() -> None:
    existing = _columns()
    if "dws_view_name" in existing:
        op.drop_column("l4_pending_executions", "dws_view_name")
    existing = _columns()
    if "dws_version" in existing:
        op.drop_column("l4_pending_executions", "dws_version")
