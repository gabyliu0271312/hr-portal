# -*- coding: utf-8 -*-
"""R0701: ADS 消费资产定义

- ads_definitions: DWS→ADS 组装定义

Revision ID: 0069_ads_definitions
Revises: 0068_scd_configs
Create Date: 2026-07-07
"""
import sqlalchemy as sa
from alembic import op

revision = "0069_ads_definitions"
down_revision = "0068_scd_configs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ads_definitions",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(256), nullable=False, comment="ADS 消费资产名称"),
        sa.Column("description", sa.Text, nullable=True, comment="描述"),
        sa.Column("source_type", sa.String(32), nullable=False, comment="来源类型: dws_aggregate/dataset/model"),
        sa.Column("source_id", sa.BigInteger, nullable=False, comment="来源 DWS 聚合/数据集/模型 ID"),
        sa.Column("source_label", sa.String(128), nullable=True, comment="来源可读标签"),
        sa.Column("dimension_refs", sa.JSON, nullable=False, server_default="[]", comment="关联维度 [{code,name,field,ref_table}]"),
        sa.Column("output_fields", sa.JSON, nullable=False, server_default="[]", comment="输出字段 [{source_field,output_name,output_label,data_type,agg_role}]"),
        sa.Column("preset_filters", sa.JSON, nullable=True, comment="预置过滤 [{field,operator,value}]"),
        sa.Column("subject_area", sa.String(64), nullable=True, comment="主题域"),
        sa.Column("consume_domain", sa.String(64), nullable=True, comment="消费域: BI/API/push/report"),
        sa.Column("owner_name", sa.String(64), nullable=True, comment="负责人"),
        sa.Column("publish_status", sa.String(16), nullable=False, server_default="draft", comment="draft/published/archived"),
        sa.Column("publish_targets", sa.JSON, nullable=True, comment="发布目标: [asset, view, api, push]"),
        sa.Column("permissions_inherited_from", sa.JSON, nullable=True, comment="权限继承来源"),
        sa.Column("lineage_snapshot", sa.JSON, nullable=True, comment="血缘快照"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_ads_definitions_status", "ads_definitions", ["publish_status"])


def downgrade() -> None:
    op.drop_index("ix_ads_definitions_status", table_name="ads_definitions")
    op.drop_table("ads_definitions")
