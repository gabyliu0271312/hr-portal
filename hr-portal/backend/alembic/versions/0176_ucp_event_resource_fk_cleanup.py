"""Remove obsolete UCP event resource foreign key.

Revision ID: 0176_ucp_event_resource_fk_cleanup
Revises: 0175_performance_object_state_snapshot_person_fk
Create Date: 2026-08-05
"""
from alembic import op


revision = "0176_ucp_event_resource_fk_cleanup"
down_revision = "0175_performance_object_state_snapshot_person_fk"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE ucp_event DROP CONSTRAINT IF EXISTS fk_ucp_event_resource")


def downgrade() -> None:
    op.execute(
        "ALTER TABLE ucp_event ADD CONSTRAINT fk_ucp_event_resource "
        "FOREIGN KEY (resource_id) REFERENCES ucp_resource(id) ON DELETE SET NULL"
    )
