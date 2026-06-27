"""automation tables

Revision ID: 0048_automation_rules
Revises: 0047_feishu_notification
Create Date: 2026-06-27

新增：
  automation_rules              — 自动化规则定义
  automation_executions         — 规则执行记录
  automation_action_executions  — 动作执行记录
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0048_automation_rules"
down_revision = "0047_feishu_notification"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "automation_rules",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("biz_type", sa.String(64), nullable=True),
        sa.Column("trigger_type", sa.String(64), nullable=False),
        sa.Column("trigger_config", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("condition_config", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("actions_config", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("source", sa.String(32), nullable=False, server_default="manual"),
        sa.Column("source_artifact_id", sa.BigInteger(), nullable=True),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("updated_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_automation_rules_trigger", "automation_rules", ["trigger_type"])
    op.create_index("ix_automation_rules_enabled", "automation_rules", ["enabled"])
    op.create_index("ix_automation_rules_biz_type", "automation_rules", ["biz_type"])

    op.create_table(
        "automation_executions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("rule_id", sa.BigInteger(), nullable=False),
        sa.Column("event_id", sa.String(64), nullable=True),
        sa.Column("trigger_type", sa.String(64), nullable=False),
        sa.Column("biz_type", sa.String(64), nullable=True),
        sa.Column("biz_id", sa.String(64), nullable=True),
        sa.Column("event_payload", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
    )
    op.create_index("ix_automation_executions_rule", "automation_executions", ["rule_id"])
    op.create_index("ix_automation_executions_status", "automation_executions", ["status"])
    op.create_index("ix_automation_executions_biz", "automation_executions", ["biz_type", "biz_id"])

    op.create_table(
        "automation_action_executions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("execution_id", sa.BigInteger(), nullable=False),
        sa.Column("action_index", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("action_type", sa.String(64), nullable=False),
        sa.Column("action_config_snapshot", sa.JSON(), nullable=True),
        sa.Column("input_snapshot", sa.JSON(), nullable=True),
        sa.Column("output_snapshot", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_automation_action_executions_exec", "automation_action_executions", ["execution_id"])
    op.create_index("ix_automation_action_executions_status", "automation_action_executions", ["status"])


def downgrade() -> None:
    op.drop_index("ix_automation_action_executions_status", "automation_action_executions")
    op.drop_index("ix_automation_action_executions_exec", "automation_action_executions")
    op.drop_table("automation_action_executions")
    op.drop_index("ix_automation_executions_biz", "automation_executions")
    op.drop_index("ix_automation_executions_status", "automation_executions")
    op.drop_index("ix_automation_executions_rule", "automation_executions")
    op.drop_table("automation_executions")
    op.drop_index("ix_automation_rules_biz_type", "automation_rules")
    op.drop_index("ix_automation_rules_enabled", "automation_rules")
    op.drop_index("ix_automation_rules_trigger", "automation_rules")
    op.drop_table("automation_rules")
