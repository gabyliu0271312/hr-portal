"""Add durable quality task queue."""

from alembic import op
import sqlalchemy as sa

revision = "0184_quality_task_queue"
down_revision = "0183_merge_quality_and_performance_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS warehouse_quality_tasks (
            id BIGSERIAL PRIMARY KEY,
            rule_id BIGINT NOT NULL REFERENCES warehouse_quality_rules(id) ON DELETE CASCADE,
            period VARCHAR(16),
            source_sync_batch_id VARCHAR(128),
            dedupe_key VARCHAR(256) NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            available_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            locked_at TIMESTAMP WITHOUT TIME ZONE,
            finished_at TIMESTAMP WITHOUT TIME ZONE,
            last_error TEXT,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            CONSTRAINT uq_warehouse_quality_task_dedupe UNIQUE (dedupe_key)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_warehouse_quality_task_pick ON warehouse_quality_tasks (status, available_at, created_at)")


def downgrade() -> None:
    op.drop_index("ix_warehouse_quality_task_pick", table_name="warehouse_quality_tasks")
    op.drop_table("warehouse_quality_tasks")