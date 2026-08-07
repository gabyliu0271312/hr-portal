"""Persist actual sync periods for quality-dispatch compensation."""

from alembic import op
import sqlalchemy as sa


revision = "0192_sync_quality_dispatch_periods"
down_revision = "0190_merge_quality_dispatch_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sync_quality_dispatches",
        sa.Column(
            "periods",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("sync_quality_dispatches", "periods")
