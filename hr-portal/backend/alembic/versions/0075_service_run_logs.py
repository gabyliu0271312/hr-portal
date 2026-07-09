"""add service_run_logs table

Revision ID: 0075
Revises: 0074
Create Date: 2026-07-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0075_service_run_logs"
down_revision: Union[str, None] = "0074_subscriptions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "service_run_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("service_type", sa.String(32), nullable=False, index=True, comment="服务类型: api/push/subscription/ads_publish"),
        sa.Column("service_id", sa.BigInteger(), nullable=True, index=True, comment="服务配置 ID"),
        sa.Column("service_name", sa.String(128), nullable=True, comment="服务名称"),
        sa.Column("source_type", sa.String(16), nullable=True, comment="来源类型"),
        sa.Column("source_id", sa.String(64), nullable=True, comment="来源 ID"),
        sa.Column("status", sa.String(16), nullable=False, server_default="success", comment="状态: success/failed/partial"),
        sa.Column("rows", sa.Integer(), nullable=True, comment="返回行数"),
        sa.Column("message", sa.Text(), nullable=True, comment="错误信息"),
        sa.Column("duration_ms", sa.Integer(), nullable=True, comment="耗时(毫秒)"),
        sa.Column("upstream_failure", sa.Boolean(), nullable=False, server_default="false", comment="是否上游失败"),
        sa.Column("governance_run_id", sa.BigInteger(), nullable=True, comment="关联治理执行ID"),
        sa.Column("triggered_by", sa.String(64), nullable=True, comment="触发者"),
        sa.Column("caller_ip", sa.String(45), nullable=True, comment="调用方IP"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, index=True),
    )


def downgrade() -> None:
    op.drop_table("service_run_logs")
