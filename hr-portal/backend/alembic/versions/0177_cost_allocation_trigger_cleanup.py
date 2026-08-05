"""Remove the duplicate legacy cost-allocation trigger.

Revision ID: 0177_cost_allocation_trigger_cleanup
Revises: 0176_ucp_event_resource_fk_cleanup
"""
from alembic import op

revision = "0177_cost_allocation_trigger_cleanup"
down_revision = "0176_ucp_event_resource_fk_cleanup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM ucp_event_trigger WHERE trigger_code = 'COST_ALLOCATION_LOCKED_TRIGGER'")
    op.execute("UPDATE ucp_event_trigger SET is_active = 1, migration_status = 'ACTIVE' WHERE trigger_code = 'COST_ALLOCATION_LOCKED_INGEST'")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_ucp_delivery_event_trigger_auto ON ucp_event_delivery (event_id, trigger_id) WHERE trigger_source = 'AUTO' AND status <> 'SKIPPED'")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_ucp_delivery_event_trigger_auto")
    op.execute("UPDATE ucp_event_trigger SET is_active = 1, migration_status = 'ACTIVE' WHERE trigger_code = 'COST_ALLOCATION_LOCKED_INGEST'")
