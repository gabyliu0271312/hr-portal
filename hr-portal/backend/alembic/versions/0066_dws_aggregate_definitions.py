# -*- coding: utf-8 -*-
"""R0307: DWD → DWS 聚合定义表

基于指标定义和维度字段，定义从 DWD 明细到 DWS 汇总的聚合口径。

Revision ID: 0066_dws_aggregate_definitions
Revises: 0065_dimensions
Create Date: 2026-07-07
"""
import sqlalchemy as sa
from alembic import op

revision = "0066_dws_aggregate_definitions"
down_revision = "0065_dimensions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dws_aggregate_definitions",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(128), nullable=False, comment="聚合定义名称"),
        sa.Column("metric_id", sa.BigInteger, sa.ForeignKey("warehouse_metrics.id", ondelete="SET NULL"), nullable=True, comment="关联指标 ID"),
        sa.Column("source_dataset_id", sa.BigInteger, sa.ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True, comment="来源 DWD DataSet ID"),
        sa.Column("group_by", sa.JSON, nullable=False, server_default="[]", comment="分组维度字段列表"),
        sa.Column("filter", sa.JSON, nullable=True, comment="过滤条件 JSON"),
        sa.Column("aggregation", sa.String(16), nullable=False, server_default="sum", comment="聚合方式: sum/count/avg/max/min"),
        sa.Column("measure_field", sa.String(128), nullable=True, comment="度量字段名"),
        sa.Column("time_grain", sa.String(16), nullable=True, comment="时间粒度: day/week/month/quarter/year"),
        sa.Column("business_definition", sa.Text, nullable=True, comment="业务口径说明"),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft", comment="draft/published/archived"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_dws_agg_metric_id", "dws_aggregate_definitions", ["metric_id"])
    op.create_index("ix_dws_agg_source_dataset_id", "dws_aggregate_definitions", ["source_dataset_id"])


def downgrade() -> None:
    op.drop_index("ix_dws_agg_source_dataset_id", table_name="dws_aggregate_definitions")
    op.drop_index("ix_dws_agg_metric_id", table_name="dws_aggregate_definitions")
    op.drop_table("dws_aggregate_definitions")
