"""add api_services table

Revision ID: 0073
Revises: 0073_approval_remind_before_days
Create Date: 2026-07-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0073_api_services"
down_revision: Union[str, None] = "0072_add_label_to_datasets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "api_services",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(128), nullable=False, comment="API 名称"),
        sa.Column("description", sa.Text(), nullable=True, comment="描述"),
        sa.Column("source_type", sa.String(16), nullable=False, server_default="table", comment="来源类型: table/dataset/metric/ads/report"),
        sa.Column("source_id", sa.String(64), nullable=False, comment="来源 ID"),
        sa.Column("source_label", sa.String(128), nullable=True, comment="来源展示名"),
        sa.Column("source_layer", sa.String(16), nullable=True, comment="来源分层: DWD/DWS/ADS/METRIC/REPORT"),
        sa.Column("field_whitelist", sa.JSON(), nullable=False, server_default="[]", comment="返回字段白名单"),
        sa.Column("filter_fields", sa.JSON(), nullable=False, server_default="[]", comment="允许过滤的字段"),
        sa.Column("default_sort", sa.String(64), nullable=True, comment="默认排序"),
        sa.Column("page_size_max", sa.Integer(), nullable=False, server_default="1000", comment="最大分页"),
        sa.Column("auth_policy", sa.JSON(), nullable=False, server_default="{}", comment="鉴权策略"),
        sa.Column("rate_limit", sa.Integer(), nullable=True, comment="限流(次/分钟)"),
        sa.Column("timeout_seconds", sa.Integer(), nullable=False, server_default="30", comment="超时(秒)"),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft", comment="状态: draft/enabled/disabled/error"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="True", comment="是否启用"),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("api_services")
