# -*- coding: utf-8 -*-
"""R0304: 维度目录表

支持层级（父子关系）和字段绑定，为指标聚合提供统一维度口径。

Revision ID: 0065_dimensions
Revises: 0064_metric_results_runs
Create Date: 2026-07-07
"""
import sqlalchemy as sa
from alembic import op

revision = "0065_dimensions"
down_revision = "0064_metric_results_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dimensions",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("dimension_code", sa.String(64), nullable=False, unique=True, comment="维度编码"),
        sa.Column("dimension_name", sa.String(128), nullable=False, comment="维度名称"),
        sa.Column("parent_id", sa.BigInteger, sa.ForeignKey("dimensions.id", ondelete="SET NULL"), nullable=True, comment="父维度 ID"),
        sa.Column("bound_table", sa.String(128), nullable=True, comment="绑定物理表名"),
        sa.Column("bound_field", sa.String(128), nullable=True, comment="绑定物理字段名"),
        sa.Column("description", sa.String(512), nullable=True, comment="维度说明"),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0", comment="同级排序"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_dimensions_code", "dimensions", ["dimension_code"])


def downgrade() -> None:
    op.drop_index("ix_dimensions_code", table_name="dimensions")
    op.drop_table("dimensions")
