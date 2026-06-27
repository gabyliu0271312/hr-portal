"""feishu_notification tables

Revision ID: 0047_feishu_notification
Revises: 0046_field_category_assignment_column_len
Create Date: 2026-06-27

新增：
  feishu_chat_targets       — 飞书群目标维护
  feishu_notification_logs  — 飞书通知发送日志
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = "0047_feishu_notification"
down_revision = "0046_field_category_assignment_column_len"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # feishu_chat_targets
    op.create_table(
        "feishu_chat_targets",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("chat_id", sa.String(64), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_feishu_chat_targets_active", "feishu_chat_targets", ["is_active"])

    # feishu_notification_logs
    op.create_table(
        "feishu_notification_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("biz_type", sa.String(64), nullable=True),
        sa.Column("biz_id", sa.String(64), nullable=True),
        sa.Column("is_test", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("message_format", sa.String(16), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("rendered_content", sa.Text(), nullable=True),
        sa.Column("receiver_snapshot", sa.JSON(), nullable=True),
        sa.Column("result_snapshot", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("success_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("triggered_by", sa.BigInteger(), nullable=True),
        sa.Column("automation_execution_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_feishu_notification_logs_biz", "feishu_notification_logs", ["biz_type", "biz_id"])
    op.create_index("ix_feishu_notification_logs_created_at", "feishu_notification_logs", ["created_at"])
    op.create_index("ix_feishu_notification_logs_status", "feishu_notification_logs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_feishu_notification_logs_status", "feishu_notification_logs")
    op.drop_index("ix_feishu_notification_logs_created_at", "feishu_notification_logs")
    op.drop_index("ix_feishu_notification_logs_biz", "feishu_notification_logs")
    op.drop_table("feishu_notification_logs")
    op.drop_index("ix_feishu_chat_targets_active", "feishu_chat_targets")
    op.drop_table("feishu_chat_targets")
