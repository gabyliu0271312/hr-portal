"""Add a comparable sync sequence for concurrency-safe quality status upserts."""

from alembic import op
import sqlalchemy as sa


revision = "0194_quality_status_batch_sequence"
down_revision = "0193_quality_run_redact_samples"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "warehouse_quality_status",
        sa.Column("source_sync_sequence", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("warehouse_quality_status", "source_sync_sequence")
