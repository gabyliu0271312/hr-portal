"""add metric_components table

Revision ID: 0098
Revises: 0097
Create Date: 2026-07-16

MR0201: 新增 metric_components 表，支持复合指标的分子/分母组件配置。
"""
from alembic import op
import sqlalchemy as sa


revision = "0098"
down_revision = "0097"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "metric_components",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("metric_id", sa.BigInteger(), nullable=False, comment="关联复合指标 warehouse_metrics.id"),
        sa.Column("component_code", sa.String(64), nullable=False, comment="组件编码，同一指标下唯一"),
        sa.Column("component_name", sa.String(128), nullable=False, comment="组件名称"),
        sa.Column("aggregate_id", sa.BigInteger(), nullable=True, comment="关联 DWS 聚合定义 ID"),
        sa.Column("role", sa.String(32), nullable=False, comment="组件角色: numerator/denominator/base/compare/custom"),
        sa.Column("expression", sa.String(512), nullable=True, comment="可选，组件后表达式"),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0", comment="排序"),
        sa.Column("is_auto_created", sa.Boolean(), nullable=False, server_default=sa.text("false"), comment="是否由系统自动创建"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("metric_id", "component_code", name="uq_metric_components_metric_code"),
        sa.ForeignKeyConstraint(["metric_id"], ["warehouse_metrics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["aggregate_id"], ["dws_aggregate_definitions.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_metric_components_metric_id", "metric_components", ["metric_id"])
    op.create_index("ix_metric_components_aggregate_id", "metric_components", ["aggregate_id"])


def downgrade():
    op.drop_index("ix_metric_components_aggregate_id", table_name="metric_components")
    op.drop_index("ix_metric_components_metric_id", table_name="metric_components")
    op.drop_table("metric_components")
