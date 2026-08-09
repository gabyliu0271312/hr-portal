"""Preserve manually maintained performance snapshot people."""
from alembic import op
import sqlalchemy as sa

revision = "0185_performance_snapshot_manual_people"
down_revision = "0183_merge_quality_and_performance_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "performance_authorization_snapshot_people",
        sa.Column("is_manually_maintained", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("performance_authorization_snapshot_people", "is_manually_maintained", server_default=None)


def downgrade() -> None:
    op.drop_column("performance_authorization_snapshot_people", "is_manually_maintained")