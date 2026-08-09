"""Add concurrency-safe quality run deduplication."""

from alembic import op

revision = "0187_quality_run_dedupe"
down_revision = "0186_merge_quality_and_performance_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_warehouse_quality_run_dedupe",
        "warehouse_quality_runs",
        ["dedupe_key"],
        unique=True,
        postgresql_where="dedupe_key IS NOT NULL",
    )


def downgrade() -> None:
    op.drop_index("uq_warehouse_quality_run_dedupe", table_name="warehouse_quality_runs")
