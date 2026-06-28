"""ai_skills table — 数据对比配置存储

Revision ID: 0052_ai_skills
Revises: 0051_move_automation_to_tools
Create Date: 2026-06-28

新增：
  ai_skills — AI 技能（数据对比配置）存储
    本期仅存储 skill_type='data_compare' 类型，不加 ENUM 约束/索引适配未来类型
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0052_ai_skills"
down_revision = "0051_move_automation_to_tools"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_skills",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("skill_type", sa.String(32), nullable=False, server_default="data_compare"),
        sa.Column("instruction", sa.Text(), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
        sa.Column("source", sa.String(16), nullable=False, server_default="chat_save"),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_result", sa.JSON(), nullable=True),
        sa.Column("run_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ai_skills_type", "ai_skills", ["skill_type"])
    op.create_index("ix_ai_skills_status", "ai_skills", ["status"])
    op.create_index("ix_ai_skills_created_by", "ai_skills", ["created_by"])


def downgrade() -> None:
    op.drop_index("ix_ai_skills_created_by", table_name="ai_skills")
    op.drop_index("ix_ai_skills_status", table_name="ai_skills")
    op.drop_index("ix_ai_skills_type", table_name="ai_skills")
    op.drop_table("ai_skills")
