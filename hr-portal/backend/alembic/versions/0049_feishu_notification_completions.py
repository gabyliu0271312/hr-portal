"""feishu notification completions table

Revision ID: 0049_feishu_notification_completions
Revises: 0048_automation_rules
Create Date: 2026-06-27

新增：
  feishu_notification_completions  — 标记完成记录
    支持在飞书消息中添加"标记完成"按钮，
    记录哪些用户已完成，下次发送时自动过滤。
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0049_feishu_notification_completions"
down_revision = "0048_automation_rules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feishu_notification_completions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "notification_log_id",
            sa.BigInteger(),
            nullable=False,
            comment="关联的 feishu_notification_logs.id",
        ),
        sa.Column(
            "open_id",
            sa.String(64),
            nullable=False,
            comment="飞书用户 open_id（完成人）",
        ),
        sa.Column(
            "display_name",
            sa.String(128),
            nullable=True,
            comment="完成人显示名称",
        ),
        sa.Column(
            "biz_type",
            sa.String(64),
            nullable=True,
            comment="业务类型（冗余，方便按业务查询）",
        ),
        sa.Column(
            "biz_id",
            sa.String(64),
            nullable=True,
            comment="业务 ID（冗余，方便按业务查询）",
        ),
        sa.Column(
            "status",
            sa.String(16),
            nullable=False,
            server_default="completed",
            comment="状态: completed / dismissed",
        ),
        sa.Column(
            "completed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            comment="完成时间",
        ),
        sa.Column(
            "callback_data",
            sa.JSON(),
            nullable=True,
            comment="飞书回调原始数据（用于审计）",
        ),
    )
    # 同一通知同一用户唯一
    op.create_index(
        "ix_fnc_notification_user",
        "feishu_notification_completions",
        ["notification_log_id", "open_id"],
        unique=True,
    )
    op.create_index(
        "ix_fnc_notification_log",
        "feishu_notification_completions",
        ["notification_log_id"],
    )
    op.create_index(
        "ix_fnc_biz",
        "feishu_notification_completions",
        ["biz_type", "biz_id"],
    )
    op.create_index(
        "ix_fnc_open_id",
        "feishu_notification_completions",
        ["open_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_fnc_open_id", "feishu_notification_completions")
    op.drop_index("ix_fnc_biz", "feishu_notification_completions")
    op.drop_index("ix_fnc_notification_log", "feishu_notification_completions")
    op.drop_index("ix_fnc_notification_user", "feishu_notification_completions")
    op.drop_table("feishu_notification_completions")
