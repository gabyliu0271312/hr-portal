# -*- coding: utf-8 -*-
"""Z02: 自动血缘边表

Revision ID: 0070_lineage_edges
Revises: 0069_ads_definitions
Create Date: 2026-07-07
"""
import sqlalchemy as sa
from alembic import op

revision = "0070_lineage_edges"
down_revision = "0069_ads_definitions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "warehouse_lineage_edges",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("source_asset", sa.String(256), nullable=False, comment="源资产标识"),
        sa.Column("target_asset", sa.String(256), nullable=False, comment="目标资产标识"),
        sa.Column("operation", sa.String(64), nullable=False, comment="操作类型: standardize/scd/snapshot/ads_publish/metric_compute"),
        sa.Column("operator", sa.String(64), nullable=True, comment="操作人"),
        sa.Column("run_id", sa.BigInteger, nullable=True, comment="关联运行 ID"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_lineage_edges_source", "warehouse_lineage_edges", ["source_asset"])
    op.create_index("ix_lineage_edges_target", "warehouse_lineage_edges", ["target_asset"])


def downgrade() -> None:
    op.drop_index("ix_lineage_edges_target", table_name="warehouse_lineage_edges")
    op.drop_index("ix_lineage_edges_source", table_name="warehouse_lineage_edges")
    op.drop_table("warehouse_lineage_edges")
