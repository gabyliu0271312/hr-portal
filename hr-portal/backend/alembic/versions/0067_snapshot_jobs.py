# -*- coding: utf-8 -*-
"""R0401: 快照任务与执行记录表

- snapshot_jobs: 快照任务定义
- snapshot_runs: 快照执行记录

Revision ID: 0067_snapshot_jobs
Revises: 0066_dws_aggregate_definitions
Create Date: 2026-07-07
"""
import sqlalchemy as sa
from alembic import op

revision = "0067_snapshot_jobs"
down_revision = "0066_dws_aggregate_definitions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "snapshot_jobs",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(128), nullable=False, comment="快照任务名称"),
        sa.Column("source_table", sa.String(128), nullable=False, comment="源表名"),
        sa.Column("target_table", sa.String(128), nullable=False, comment="快照目标表名"),
        sa.Column("snapshot_keys", sa.JSON, nullable=False, server_default="[]", comment="快照对象标识字段"),
        sa.Column("period", sa.String(16), nullable=False, server_default="monthly", comment="周期"),
        sa.Column("retention", sa.Integer, nullable=False, server_default="12", comment="保留期数"),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("last_run_at", sa.DateTime, nullable=True),
        sa.Column("last_status", sa.String(16), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "snapshot_runs",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("job_id", sa.BigInteger, sa.ForeignKey("snapshot_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("period_value", sa.String(32), nullable=False, comment="快照周期值"),
        sa.Column("row_count", sa.Integer, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("started_at", sa.DateTime, nullable=True),
        sa.Column("finished_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_snapshot_runs_job_id", "snapshot_runs", ["job_id"])


def downgrade() -> None:
    op.drop_index("ix_snapshot_runs_job_id", table_name="snapshot_runs")
    op.drop_table("snapshot_runs")
    op.drop_table("snapshot_jobs")
