"""Add performance notification settings."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0237_performance_notification_settings"
down_revision: Union[str, None] = "0236_merge_performance_scope_and_member_snapshot"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "performance_notification_settings",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("feishu_push_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("email_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_by_type", sa.String(length=32), nullable=True),
        sa.Column("updated_by_ref", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("performance_notification_settings")
