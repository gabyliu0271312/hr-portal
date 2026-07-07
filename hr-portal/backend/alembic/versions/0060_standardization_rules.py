# -*- coding: utf-8 -*-
"""R0102: ODS→DWD 标准化规则表

- 新建 standardization_rules，承载全部 8 类字段级转换规则
- (asset_code, source_field, target_field, rule_type) 联合唯一索引

Revision ID: 0060_standardization_rules
Revises: 0059_model_versions
Create Date: 2026-07-06
"""
import sqlalchemy as sa
from alembic import op

revision = "0060_standardization_rules"
down_revision = "0059_model_versions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "standardization_rules",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("asset_type", sa.String(16), nullable=False, comment="table/dataset"),
        sa.Column("asset_code", sa.String(256), nullable=False, comment="ODS 表名或 DataSet ID"),
        sa.Column(
            "rule_type", sa.String(32), nullable=False,
            comment="rename/type_convert/value_map/unit_convert/split_merge/deduplicate/null_handling/format_standardize",
        ),
        sa.Column("source_field", sa.String(128), nullable=False, comment="ODS 源字段名"),
        sa.Column("target_field", sa.String(128), nullable=False, comment="DWD 目标字段名"),
        sa.Column("rule_config", sa.JSON(), nullable=False, server_default="{}", comment="规则参数 JSON"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="1", comment="是否启用"),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0", comment="同字段多条规则的执行顺序"),
        sa.Column("description", sa.String(512), nullable=True, comment="规则说明/备注"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_std_rule", "standardization_rules",
        ["asset_code", "source_field", "target_field", "rule_type"],
        unique=True,
    )
    op.create_index("idx_std_asset", "standardization_rules", ["asset_code", "enabled"])


def downgrade() -> None:
    op.drop_table("standardization_rules")
