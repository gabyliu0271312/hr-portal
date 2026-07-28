"""store reversible legacy webhook trigger migration state

Revision ID: 0124
Revises: 0123
Create Date: 2026-07-24
"""
from alembic import op
import sqlalchemy as sa


revision = "0124"
down_revision = "0123"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ucp_event_trigger", sa.Column("legacy_webhook_path", sa.String(length=128), nullable=True))
    op.add_column("ucp_event_trigger", sa.Column("migration_status", sa.String(length=32), nullable=False, server_default="ACTIVE"))
    op.execute("UPDATE ucp_event_trigger SET migration_status = 'PENDING_MIGRATION' WHERE webhook_path IS NOT NULL AND source_resource_object_id IS NULL")


def downgrade() -> None:
    op.drop_column("ucp_event_trigger", "migration_status")
    op.drop_column("ucp_event_trigger", "legacy_webhook_path")
