"""add UCP event delivery lease fields

Revision ID: 0148
Revises: 0147
Create Date: 2026-07-30
"""

from alembic import op
import sqlalchemy as sa


revision = "0148"
down_revision = "0147"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ucp_event_delivery", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ucp_event_delivery", sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ucp_event_delivery", sa.Column("recovery_count", sa.Integer(), nullable=False, server_default="0"))
    op.create_index("ix_ucp_event_delivery_running_lease", "ucp_event_delivery", ["status", "heartbeat_at"])


def downgrade() -> None:
    op.drop_index("ix_ucp_event_delivery_running_lease", table_name="ucp_event_delivery")
    op.drop_column("ucp_event_delivery", "recovery_count")
    op.drop_column("ucp_event_delivery", "heartbeat_at")
    op.drop_column("ucp_event_delivery", "started_at")
