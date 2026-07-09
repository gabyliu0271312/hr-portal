"""add subscriptions table

Revision ID: 0074
Revises: 0073
Create Date: 2026-07-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0074_subscriptions"
down_revision: Union[str, None] = "0073_api_services"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(128), nullable=False, comment="订阅名称"),
        sa.Column("description", sa.Text(), nullable=True, comment="描述"),
        sa.Column("source_type", sa.String(16), nullable=False, server_default="table", comment="来源类型"),
        sa.Column("source_id", sa.String(64), nullable=False, comment="来源 ID"),
        sa.Column("source_label", sa.String(128), nullable=True, comment="来源展示名"),
        sa.Column("source_layer", sa.String(16), nullable=True, comment="来源分层"),
        sa.Column("field_scope", sa.JSON(), nullable=False, server_default="[]", comment="字段范围"),
        sa.Column("recipients", sa.JSON(), nullable=False, server_default="[]", comment="接收对象列表"),
        sa.Column("delivery_target", sa.String(32), nullable=False, server_default="feishu", comment="投递目标: feishu/email/webhook/file"),
        sa.Column("frequency", sa.String(32), nullable=False, server_default="manual", comment="频率: manual/daily/weekly/monthly/event"),
        sa.Column("cron_expr", sa.String(64), nullable=True, comment="cron 表达式"),
        sa.Column("push_format", sa.String(16), nullable=False, server_default="json", comment="推送格式: json/csv/excel/markdown"),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft", comment="状态: draft/enabled/paused/expired"),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True, comment="最近投递时间"),
        sa.Column("last_status", sa.String(16), nullable=False, server_default="pending", comment="最近投递状态"),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("subscriptions")
