# -*- coding: utf-8 -*-
"""R0403: SCD 拉链配置

- scd_configs: SCD 配置定义（业务键 + 时间字段 + 对比字段）
- scd_runs: SCD 执行记录（新增/变更/过期关闭计数）

Revision ID: 0068_scd_configs
Revises: 0067_snapshot_jobs
Create Date: 2026-07-07
"""
import sqlalchemy as sa
from alembic import op

revision = "0068_scd_configs"
down_revision = "0067_snapshot_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scd_configs",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(128), nullable=False, comment="SCD 配置名称"),
        sa.Column("source_table", sa.String(128), nullable=False, comment="来源表"),
        sa.Column("target_table", sa.String(128), nullable=False, comment="拉链表目标表"),
        sa.Column("business_key", sa.String(256), nullable=False, comment="业务主键字段（逗号分隔）"),
        sa.Column("effective_from_field", sa.String(64), nullable=False, server_default="effective_from", comment="生效起始时间字段名"),
        sa.Column("effective_to_field", sa.String(64), nullable=False, server_default="effective_to", comment="生效结束时间字段名"),
        sa.Column("current_flag_field", sa.String(64), nullable=False, server_default="current_flag", comment="当前标记字段名"),
        sa.Column("compare_fields", sa.JSON, nullable=False, server_default="[]", comment="需要对比变更的字段列表"),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("last_run_at", sa.DateTime, nullable=True),
        sa.Column("last_status", sa.String(16), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "scd_runs",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("config_id", sa.BigInteger, sa.ForeignKey("scd_configs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("new_count", sa.Integer, nullable=True, comment="新增记录数"),
        sa.Column("updated_count", sa.Integer, nullable=True, comment="变更记录数（旧记录关闭 + 新版本写入）"),
        sa.Column("closed_count", sa.Integer, nullable=True, comment="旧记录关闭数"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("started_at", sa.DateTime, nullable=True),
        sa.Column("finished_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_scd_runs_config_id", "scd_runs", ["config_id"])


def downgrade() -> None:
    op.drop_index("ix_scd_runs_config_id", table_name="scd_runs")
    op.drop_table("scd_runs")
    op.drop_table("scd_configs")
