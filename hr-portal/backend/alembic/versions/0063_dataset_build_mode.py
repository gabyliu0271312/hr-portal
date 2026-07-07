# -*- coding: utf-8 -*-
"""R0202: 数据集添加 build_mode + refresh_strategy 字段

- datasets 表新增 build_mode (virtual/materialized)
- datasets 表新增 refresh_strategy (manual/scheduled/upstream_triggered)

Revision ID: 0063_dataset_build_mode
Revises: 0062_dataset_builds
Create Date: 2026-07-06
"""
import sqlalchemy as sa
from alembic import op

revision = "0063_dataset_build_mode"
down_revision = "0062_dataset_builds"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("datasets",
                  sa.Column("build_mode", sa.String(16), nullable=False,
                            server_default="virtual", comment="virtual/materialized"))
    op.add_column("datasets",
                  sa.Column("refresh_strategy", sa.String(32), nullable=False,
                            server_default="manual", comment="manual/scheduled/upstream_triggered"))


def downgrade() -> None:
    op.drop_column("datasets", "refresh_strategy")
    op.drop_column("datasets", "build_mode")
