"""Remove historical plaintext quality-run samples."""

from alembic import op


revision = "0193_quality_run_redact_samples"
down_revision = "0192_sync_quality_dispatch_periods"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE warehouse_quality_runs SET sample_rows = NULL "
        "WHERE sample_rows IS NOT NULL"
    )


def downgrade() -> None:
    pass
