"""Add compensating records for post-sync quality dispatch."""

from alembic import op
import sqlalchemy as sa

revision = "0188_sync_quality_dispatch"
down_revision = "0187_quality_run_dedupe"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The production baseline migration 0192 may have created this table before
    # the branch was stamped at 0189. Keep this historical migration idempotent
    # so upgrading an existing database does not fail with DuplicateTableError.
    op.execute("""
        CREATE TABLE IF NOT EXISTS sync_quality_dispatches (
            id BIGSERIAL PRIMARY KEY,
            table_name VARCHAR(64) NOT NULL,
            settings JSONB NOT NULL DEFAULT '{}'::jsonb,
            source_sync_batch_id VARCHAR(128) NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            available_at TIMESTAMP WITH TIME ZONE NOT NULL,
            locked_at TIMESTAMP WITH TIME ZONE,
            finished_at TIMESTAMP WITH TIME ZONE,
            last_error TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT uq_sync_quality_dispatch_batch UNIQUE (source_sync_batch_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_sync_quality_dispatch_pick ON sync_quality_dispatches (status, available_at, created_at)")
    return


def downgrade() -> None:
    # sync_quality_dispatches 及其索引由 0192 生产基线拥有；
    # 0188 只是历史兼容分支，回滚本分支不得删除共享对象。
    return
