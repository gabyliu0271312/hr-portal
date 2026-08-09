"""Add PushTarget component_v1 mapping storage."""
from alembic import op
import sqlalchemy as sa

revision = "0201_push_target_mapping_component"
down_revision = "0200_mapping_event_outbox_notification_lease"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "push_targets",
        sa.Column("mapping_storage_mode", sa.String(16), nullable=False, server_default="legacy_v1"),
    )
    op.add_column("push_targets", sa.Column("mapping_component", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("push_targets", "mapping_component")
    op.drop_column("push_targets", "mapping_storage_mode")
