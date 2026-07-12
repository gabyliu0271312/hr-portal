# -*- coding: utf-8 -*-
"""Z03 L4 全自动级联: l4_auto_approvals + l4_cascade_rules

Revision ID: 0085_z03_l4_auto_approvals
Revises: 0084_x05_bi_contracts
Create Date: 2026-07-11
"""
import sqlalchemy as sa
from alembic import op

revision = "0085_z03_l4_auto_approvals"
down_revision = "0084_x05_bi_contracts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "l4_auto_approvals",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("metric_id", sa.BigInteger, sa.ForeignKey("warehouse_metrics.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_area", sa.String(64), nullable=True, comment="主题域"),
        sa.Column("risk_level", sa.String(16), nullable=False, server_default="medium", comment="低风险/中风险/高风险"),
        sa.Column("max_auto_frequency", sa.Integer, nullable=False, server_default="1", comment="每日最大自动发布次数"),
        sa.Column("auto_rollback_enabled", sa.Boolean, nullable=False, server_default=sa.text("true"), comment="失败时自动回滚"),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending", comment="pending/approved/rejected/revoked"),
        sa.Column("requested_by", sa.String(64), nullable=True, comment="申请人"),
        sa.Column("approved_by", sa.String(64), nullable=True, comment="审批人"),
        sa.Column("reason", sa.Text, nullable=True, comment="申请理由/审批备注"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "l4_cascade_rules",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("metric_id", sa.BigInteger, sa.ForeignKey("warehouse_metrics.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("trigger_conditions", sa.JSON, nullable=False, server_default="[]", comment="触发条件列表"),
        sa.Column("risk_strategies", sa.JSON, nullable=False, server_default="{}", comment="风险状态策略"),
        sa.Column("max_frequency", sa.Integer, nullable=False, server_default="1", comment="每日最大自动执行次数"),
        sa.Column("auto_rollback", sa.Boolean, nullable=False, server_default=sa.text("true"), comment="失败时自动回滚"),
        sa.Column("notify_on_success", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("notify_on_block", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("notify_on_fail", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("l4_cascade_rules")
    op.drop_table("l4_auto_approvals")
