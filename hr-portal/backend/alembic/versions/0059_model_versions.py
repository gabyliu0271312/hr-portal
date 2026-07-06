# -*- coding: utf-8 -*-
"""Q0507: 模型版本历史表

- 新建 warehouse_model_versions，支持发布/历史/回滚

Revision ID: 0059_model_versions
Revises: 0058_modeling_v2_monitoring
Create Date: 2026-07-06
"""
import sqlalchemy as sa
from alembic import op

revision = "0059_model_versions"
down_revision = ("0057_warehouse_quality", "0058_modeling_v2_monitoring")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "warehouse_model_versions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("model_id", sa.BigInteger(), nullable=False, comment="关联 datasets.id"),
        sa.Column("version", sa.Integer(), nullable=False, comment="版本号"),
        sa.Column("status", sa.String(16), nullable=False, server_default="published"),
        sa.Column("snapshot", sa.JSON(), nullable=False, comment="模型完整快照（tables/relations/output_fields/module_meta）"),
        sa.Column("diff_snapshot", sa.JSON(), nullable=True, comment="发布差异快照"),
        sa.Column("published_by", sa.BigInteger(), nullable=True, comment="发布人 user.id"),
        sa.Column("published_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_mv_model", "warehouse_model_versions", ["model_id", "version"])


def downgrade() -> None:
    op.drop_table("warehouse_model_versions")
