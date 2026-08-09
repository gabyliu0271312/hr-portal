"""Register the periodic performance cycle lifecycle worker."""
from alembic import op

revision = "0188_performance_cycle_lifecycle_job"
down_revision = "0187_quality_run_dedupe"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO scheduled_jobs (kind, business_id, cron, payload, enabled)
        SELECT 'performance_cycle_lifecycle', 0, '*/5 * * * *', '{}'::json, TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM scheduled_jobs
            WHERE kind = 'performance_cycle_lifecycle' AND business_id = 0
        )
        """
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM scheduled_jobs WHERE kind = 'performance_cycle_lifecycle' AND business_id = 0"
    )