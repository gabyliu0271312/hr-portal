"""Mapping 发布可靠 outbox 与成本中心通知租约。"""
from alembic import op
import sqlalchemy as sa

revision = "0200_mapping_event_outbox_notification_lease"
down_revision = "0199_mapping_rebuild_event_contract"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cost_center_mapping_notifications",
        sa.Column("dispatch_started_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_cost_center_mapping_notification_dispatch",
        "cost_center_mapping_notifications",
        ["status", "dispatch_started_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_cost_center_mapping_notification_dispatch",
        table_name="cost_center_mapping_notifications",
    )
    op.drop_column("cost_center_mapping_notifications", "dispatch_started_at")
