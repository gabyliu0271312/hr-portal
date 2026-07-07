# -*- coding: utf-8 -*-
"""R0106: 标准化规则模板表

- 新建 standardization_templates，支持按业务对象沉淀可复用规则集

Revision ID: 0061_standardization_templates
Revises: 0060_standardization_rules
Create Date: 2026-07-06
"""
import sqlalchemy as sa
from alembic import op

revision = "0061_standardization_templates"
down_revision = "0060_standardization_rules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "standardization_templates",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(128), nullable=False, comment="模板名称"),
        sa.Column("description", sa.String(512), nullable=True, comment="模板描述"),
        sa.Column("business_object", sa.String(64), nullable=False, comment="业务对象: 员工表/组织表/岗位表等"),
        sa.Column("template_rules", sa.JSON(), nullable=False, server_default="[]", comment="规则快照 JSON 数组"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1", comment="版本号"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_tpl_object", "standardization_templates", ["business_object"])


def downgrade() -> None:
    op.drop_table("standardization_templates")
