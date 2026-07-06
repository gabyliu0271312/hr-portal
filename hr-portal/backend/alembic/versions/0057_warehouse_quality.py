# -*- coding: utf-8 -*-
"""数据仓库 - 数据质量：warehouse_quality_rules + warehouse_quality_runs (Q0301+Q0302)

新增两张表：
- warehouse_quality_rules：质量规则定义
- warehouse_quality_runs：质量规则执行记录

Revision ID: 0057_warehouse_quality
Revises: 0056_warehouse_ucp_integration
Create Date: 2026-07-06
"""
import sqlalchemy as sa
from alembic import op

revision = "0057_warehouse_quality"
down_revision = ("0055_report_visibility", "0056_warehouse_ucp_integration")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ==================== warehouse_quality_rules ====================

    op.create_table(
        "warehouse_quality_rules",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("asset_type", sa.String(16), nullable=False, comment="table/dataset/field"),
        sa.Column("asset_code", sa.String(256), nullable=False, comment="资产编码"),
        sa.Column("rule_type", sa.String(32), nullable=False,
                  comment="not_null/unique/enum/date_format/referential_integrity/custom_sql"),
        sa.Column("rule_config", sa.JSON(), nullable=False, comment="规则参数 JSON"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true"), comment="是否启用"),
        sa.Column("severity", sa.String(16), nullable=False, server_default="warn", comment="info/warn/error"),
        sa.Column("last_run_status", sa.String(16), nullable=True, comment="最近运行状态"),
        sa.Column("last_run_at", sa.DateTime(), nullable=True, comment="最近运行时间"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("idx_qr_asset", "warehouse_quality_rules", ["asset_type", "asset_code"])
    op.create_index("idx_qr_enabled", "warehouse_quality_rules", ["enabled"])

    # ==================== warehouse_quality_runs ====================

    op.create_table(
        "warehouse_quality_runs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("rule_id", sa.BigInteger(),
                  sa.ForeignKey("warehouse_quality_rules.id", ondelete="SET NULL"),
                  nullable=True, comment="关联质量规则"),
        sa.Column("status", sa.String(16), nullable=False, comment="pass/warn/fail/error"),
        sa.Column("checked_count", sa.Integer(), nullable=False, server_default="0", comment="检查总行数"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0", comment="失败行数"),
        sa.Column("sample_rows", sa.JSON(), nullable=True, comment="失败样例数据"),
        sa.Column("message", sa.Text(), nullable=True, comment="运行消息/错误摘要"),
        sa.Column("started_at", sa.DateTime(), nullable=True, comment="开始时间"),
        sa.Column("finished_at", sa.DateTime(), nullable=True, comment="结束时间"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("idx_qr_run_rule", "warehouse_quality_runs", ["rule_id"])
    op.create_index("idx_qr_run_status", "warehouse_quality_runs", ["status"])


def downgrade() -> None:
    op.drop_table("warehouse_quality_runs")
    op.drop_table("warehouse_quality_rules")
