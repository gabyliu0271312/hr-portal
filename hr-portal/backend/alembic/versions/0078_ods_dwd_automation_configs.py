"""Z0104: ODS→DWD automation configs table

Revision ID: 0078_ods_dwd_automation_configs
Revises: 0077_normalize_single_table_dataset_names
Create Date: 2026-07-10
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0078_ods_dwd_automation_configs"
down_revision = "0077_normalize_single_table_dataset_names"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "ods_dwd_automation_configs" in inspector.get_table_names():
        return

    op.create_table(
        "ods_dwd_automation_configs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("ods_table_name", sa.String(256), unique=True, nullable=False),
        sa.Column("target_dwd_asset_id", sa.BigInteger(), nullable=True),
        sa.Column("target_dwd_table_name", sa.String(256), nullable=True),
        sa.Column("update_mode", sa.String(32), nullable=False, server_default="manual_only"),
        sa.Column("ods_sync_semantics", sa.String(32), nullable=False, server_default="full_snapshot"),
        sa.Column("dwd_write_strategy", sa.String(32), nullable=False, server_default="incremental_upsert"),
        sa.Column("business_key_fields", sa.JSON(), nullable=True),
        sa.Column("missing_row_strategy", sa.String(32), nullable=False, server_default="mark_inactive"),
        sa.Column("standardization_rule_set_id", sa.BigInteger(), nullable=True),
        sa.Column("standardization_rule_ids", sa.JSON(), nullable=True),
        sa.Column("trigger_strategy", sa.String(32), nullable=False, server_default="manual_only"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("last_execution_status", sa.String(16), nullable=True),
        sa.Column("last_execution_at", sa.DateTime(), nullable=True),
        sa.Column("last_execution_rows", sa.BigInteger(), nullable=True),
        sa.Column("last_execution_error", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "ods_dwd_automation_configs" in inspector.get_table_names():
        op.drop_table("ods_dwd_automation_configs")
