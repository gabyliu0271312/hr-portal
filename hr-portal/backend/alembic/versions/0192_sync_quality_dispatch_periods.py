"""Create the quality governance schema baseline from the production migration head."""

from alembic import op


revision = "0192_sync_quality_dispatch_periods"
down_revision = "0181_merge_enum_default_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE warehouse_quality_runs ADD COLUMN IF NOT EXISTS period VARCHAR(16)")
    op.execute("ALTER TABLE warehouse_quality_runs ADD COLUMN IF NOT EXISTS source_sync_batch_id VARCHAR(128)")
    op.execute("ALTER TABLE warehouse_quality_runs ADD COLUMN IF NOT EXISTS asset_type VARCHAR(16)")
    op.execute("ALTER TABLE warehouse_quality_runs ADD COLUMN IF NOT EXISTS asset_id BIGINT")
    op.execute("ALTER TABLE warehouse_quality_runs ADD COLUMN IF NOT EXISTS severity VARCHAR(16)")
    op.execute("ALTER TABLE warehouse_quality_runs ADD COLUMN IF NOT EXISTS duplicate_key_count INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE warehouse_quality_runs ADD COLUMN IF NOT EXISTS missing_key_count INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE warehouse_quality_runs ADD COLUMN IF NOT EXISTS sample_key_hashes JSONB")
    op.execute("ALTER TABLE warehouse_quality_runs ADD COLUMN IF NOT EXISTS triggered_by VARCHAR(64)")
    op.execute("ALTER TABLE warehouse_quality_runs ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(256)")
    op.execute("""
        CREATE TABLE IF NOT EXISTS warehouse_quality_status (
            id BIGSERIAL PRIMARY KEY,
            asset_type VARCHAR(16) NOT NULL,
            asset_key VARCHAR(256) NOT NULL,
            asset_id BIGINT,
            asset_code VARCHAR(256),
            period VARCHAR(16) NOT NULL DEFAULT '',
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
            severity VARCHAR(16) NOT NULL DEFAULT 'info',
            source_sync_batch_id VARCHAR(128),
            checked_at TIMESTAMP,
            checked_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            duplicate_key_count INTEGER NOT NULL DEFAULT 0,
            missing_key_count INTEGER NOT NULL DEFAULT 0,
            sample_key_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
            message TEXT,
            created_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP NOT NULL,
            CONSTRAINT uq_warehouse_quality_status_asset_period UNIQUE (asset_type, asset_key, period)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_warehouse_quality_status_report_period ON warehouse_quality_status (asset_type, asset_id, period)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_warehouse_quality_status_batch ON warehouse_quality_status (source_sync_batch_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_quality_run_dedupe ON warehouse_quality_runs (dedupe_key) WHERE dedupe_key IS NOT NULL")
    op.execute("""
        CREATE TABLE IF NOT EXISTS sync_quality_dispatches (
            id BIGSERIAL PRIMARY KEY,
            table_name VARCHAR(64) NOT NULL,
            settings JSONB NOT NULL DEFAULT '{}'::jsonb,
            source_sync_batch_id VARCHAR(128) NOT NULL,
            periods JSONB NOT NULL DEFAULT '[]'::jsonb,
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


def downgrade() -> None:
    op.drop_index("ix_sync_quality_dispatch_pick", table_name="sync_quality_dispatches")
    op.drop_table("sync_quality_dispatches")
    # warehouse_quality_* 对象由 0182/0187 分支拥有；0192 只为从历史
    # production head 直升的兼容分支提供 IF NOT EXISTS 基线，不能在该分支
    # rollback 时删除仍由有效祖先链拥有的对象。