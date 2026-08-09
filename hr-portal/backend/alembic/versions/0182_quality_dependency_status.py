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
    op.create_table(
        "warehouse_quality_status",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("asset_type", sa.String(length=16), nullable=False),
        sa.Column("asset_key", sa.String(length=256), nullable=False),
        sa.Column("asset_id", sa.BigInteger(), nullable=True),
        sa.Column("asset_code", sa.String(length=256), nullable=True),
        sa.Column("period", sa.String(length=16), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="info"),
        sa.Column("source_sync_batch_id", sa.String(length=128), nullable=True),
        sa.Column("checked_at", sa.DateTime(), nullable=True),
        sa.Column("checked_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duplicate_key_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("missing_key_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sample_key_hashes", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("asset_type", "asset_key", "period", name="uq_warehouse_quality_status_asset_period"),
    )
    op.create_index("ix_warehouse_quality_status_report_period", "warehouse_quality_status", ["asset_type", "asset_id", "period"])
    op.create_index("ix_warehouse_quality_status_batch", "warehouse_quality_status", ["source_sync_batch_id"])


def downgrade() -> None:
    op.drop_index("ix_warehouse_quality_status_batch", table_name="warehouse_quality_status")
    op.drop_index("ix_warehouse_quality_status_report_period", table_name="warehouse_quality_status")
    op.drop_table("warehouse_quality_status")
    for name in ("dedupe_key", "triggered_by", "sample_key_hashes", "missing_key_count", "duplicate_key_count", "severity", "asset_id", "asset_type", "source_sync_batch_id", "period"):
        op.drop_column("warehouse_quality_runs", name)