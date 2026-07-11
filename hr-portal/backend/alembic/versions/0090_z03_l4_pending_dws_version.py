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


def upgrade() -> None:
    op.add_column("l4_pending_executions", sa.Column("dws_version", sa.Integer, nullable=True))
    op.add_column("l4_pending_executions", sa.Column("dws_view_name", sa.String(256), nullable=True))


def downgrade() -> None:
    op.drop_column("l4_pending_executions", "dws_view_name")
    op.drop_column("l4_pending_executions", "dws_version")
