# -*- coding: utf-8 -*-
"""R0201: 数据集构建运行记录表

- 新建 dataset_builds，记录每次物化执行

Revision ID: 0062_dataset_builds
Revises: 0061_standardization_templates
Create Date: 2026-07-06
"""
import sqlalchemy as sa
from alembic import op

revision = "0062_dataset_builds"
down_revision = "0061_standardization_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dataset_builds",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("dataset_id", sa.BigInteger(), nullable=False, comment="关联 datasets.id"),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending",
                  comment="pending/running/success/failed"),
        sa.Column("layer_check_result", sa.JSON(), nullable=True, comment="分层校验结果"),
        sa.Column("row_count", sa.Integer(), nullable=True, comment="输出行数"),
        sa.Column("error_message", sa.Text(), nullable=True, comment="错误摘要"),
        sa.Column("started_at", sa.DateTime(), nullable=True, comment="开始时间"),
        sa.Column("finished_at", sa.DateTime(), nullable=True, comment="结束时间"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_build_dataset", "dataset_builds", ["dataset_id", "status"])


def downgrade() -> None:
    op.drop_table("dataset_builds")
