"""Phase 2: data_compare_tasks + data_compare_runs

Revision ID: 0054_data_compare_tasks
Revises: 0053_add_data_compare_remove_feishu_config_menu
Create Date: 2026-06-28
"""
import sqlalchemy as sa
from alembic import op

revision = "0054_data_compare_tasks"
down_revision = "0053_add_data_compare_remove_feishu_config_menu"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "data_compare_tasks",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("skill_id", sa.BigInteger(), sa.ForeignKey("ai_skills.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("compare_type", sa.String(32), nullable=False),
        sa.Column("table_a", sa.String(64), nullable=False),
        sa.Column("table_b", sa.String(64), nullable=False),
        sa.Column("join_keys", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("cron_expression", sa.String(64), nullable=True),
        sa.Column("scheduled_job_id", sa.BigInteger(), nullable=True),
        sa.Column("automation_rule_id", sa.BigInteger(), nullable=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.String(16), nullable=True),
        sa.Column("last_diff_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_summary", sa.JSON(), nullable=True),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_dc_tasks_enabled", "data_compare_tasks", ["enabled"])
    op.create_index("ix_dc_tasks_created_by", "data_compare_tasks", ["created_by"])
    op.create_index("ix_dc_tasks_skill", "data_compare_tasks", ["skill_id"])

    op.create_table(
        "data_compare_runs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "task_id",
            sa.BigInteger(),
            sa.ForeignKey("data_compare_tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("trigger_type", sa.String(32), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("diff_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("summary", sa.JSON(), nullable=True),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.Column("execution_sql", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("triggered_by", sa.BigInteger(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_dc_runs_task", "data_compare_runs", ["task_id"])
    op.create_index("ix_dc_runs_status", "data_compare_runs", ["status"])
    op.create_index("ix_dc_runs_started", "data_compare_runs", ["started_at"])


def downgrade() -> None:
    op.drop_index("ix_dc_runs_started", table_name="data_compare_runs")
    op.drop_index("ix_dc_runs_status", table_name="data_compare_runs")
    op.drop_index("ix_dc_runs_task", table_name="data_compare_runs")
    op.drop_table("data_compare_runs")
    op.drop_index("ix_dc_tasks_skill", table_name="data_compare_tasks")
    op.drop_index("ix_dc_tasks_created_by", table_name="data_compare_tasks")
    op.drop_index("ix_dc_tasks_enabled", table_name="data_compare_tasks")
    op.drop_table("data_compare_tasks")
