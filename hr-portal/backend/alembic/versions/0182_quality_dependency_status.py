"""Add dependency-aware warehouse quality status."""

from alembic import op
import sqlalchemy as sa


revision = "0182_quality_dependency_status"
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
    op.execute("ALTER TABLE warehouse_quality_runs ADD COLUMN IF NOT EXISTS sample_key_hashes JSON")
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
            checked_at TIMESTAMP WITHOUT TIME ZONE,
            checked_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            duplicate_key_count INTEGER NOT NULL DEFAULT 0,
            missing_key_count INTEGER NOT NULL DEFAULT 0,
            sample_key_hashes JSON NOT NULL DEFAULT '[]',
            message TEXT,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            CONSTRAINT uq_warehouse_quality_status_asset_period UNIQUE (asset_type, asset_key, period)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_warehouse_quality_status_report_period ON warehouse_quality_status (asset_type, asset_id, period)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_warehouse_quality_status_batch ON warehouse_quality_status (source_sync_batch_id)")


def downgrade() -> None:
    op.drop_index("ix_warehouse_quality_status_batch", table_name="warehouse_quality_status")
    op.drop_index("ix_warehouse_quality_status_report_period", table_name="warehouse_quality_status")
    op.drop_table("warehouse_quality_status")
    for name in ("dedupe_key", "triggered_by", "sample_key_hashes", "missing_key_count", "duplicate_key_count", "severity", "asset_id", "asset_type", "source_sync_batch_id", "period"):
        op.drop_column("warehouse_quality_runs", name)