# -*- coding: utf-8 -*-
"""R0301: 指标计算结果与运行记录表

- metric_results: 按周期保存指标计算值
- metric_runs: 记录每次指标计算的执行状态

Revision ID: 0064_metric_results_runs
Revises: 0063_dataset_build_mode
Create Date: 2026-07-07
"""
import sqlalchemy as sa
from alembic import op

revision = "0064_metric_results_runs"
down_revision = "0063_dataset_build_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "metric_results",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("metric_id", sa.BigInteger, sa.ForeignKey("warehouse_metrics.id", ondelete="CASCADE"), nullable=False, comment="关联 warehouse_metrics.id"),
        sa.Column("period", sa.String(32), nullable=False, comment="计算周期"),
        sa.Column("value", sa.JSON, nullable=False, comment="指标值"),
        sa.Column("computed_at", sa.DateTime, nullable=False, server_default=sa.func.now(), comment="计算时间"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_metric_results_metric_id", "metric_results", ["metric_id"])
    op.create_index("ix_metric_results_period", "metric_results", ["metric_id", "period"])

    op.create_table(
        "metric_runs",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("metric_id", sa.BigInteger, sa.ForeignKey("warehouse_metrics.id", ondelete="CASCADE"), nullable=False, comment="关联 warehouse_metrics.id"),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending", comment="pending/running/success/failed"),
        sa.Column("error_message", sa.Text, nullable=True, comment="错误信息"),
        sa.Column("period", sa.String(32), nullable=True, comment="本次计算的周期"),
        sa.Column("result_id", sa.BigInteger, sa.ForeignKey("metric_results.id", ondelete="SET NULL"), nullable=True, comment="关联计算结果"),
        sa.Column("started_at", sa.DateTime, nullable=True, comment="开始时间"),
        sa.Column("finished_at", sa.DateTime, nullable=True, comment="结束时间"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_metric_runs_metric_id", "metric_runs", ["metric_id"])


def downgrade() -> None:
    op.drop_index("ix_metric_runs_metric_id", table_name="metric_runs")
    op.drop_table("metric_runs")
    op.drop_index("ix_metric_results_period", table_name="metric_results")
    op.drop_index("ix_metric_results_metric_id", table_name="metric_results")
    op.drop_table("metric_results")
