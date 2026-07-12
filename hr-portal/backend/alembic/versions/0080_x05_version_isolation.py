# -*- coding: utf-8 -*-
"""X05 版本隔离: warehouse_model_versions 增加 asset_type/asset_id

Revision ID: 0080_x05_version_isolation
Revises: 0079_ods_dwd_config_audit_fields
Create Date: 2026-07-11
"""
import sqlalchemy as sa
from alembic import op

revision = "0080_x05_version_isolation"
down_revision = "0079_ods_dwd_config_audit_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("warehouse_model_versions",
                  sa.Column("asset_type", sa.String(16), nullable=True, comment="dws / ads / model / dataset"))
    op.add_column("warehouse_model_versions",
                  sa.Column("asset_id", sa.BigInteger, nullable=True, comment="具体资产 ID"))

    # 给存量数据填充默认值（model_id 已存在数据）
    op.execute("UPDATE warehouse_model_versions SET asset_type = 'model', asset_id = model_id WHERE asset_type IS NULL")

    op.create_unique_constraint("uq_warehouse_model_version_asset", "warehouse_model_versions",
                                ["asset_type", "asset_id", "version"])


def downgrade() -> None:
    op.drop_constraint("uq_warehouse_model_version_asset", "warehouse_model_versions", type_="unique")
    op.drop_column("warehouse_model_versions", "asset_id")
    op.drop_column("warehouse_model_versions", "asset_type")
