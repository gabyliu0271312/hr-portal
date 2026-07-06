# -*- coding: utf-8 -*-
"""Q0506 + Q0605: 建模 V2 版本字段 + 监控告警规则表

- datasets 新增 diff_snapshot（JSON，存储发布差异快照）
- 新增 warehouse_alert_rules（告警规则占位）

Revision ID: 0058_modeling_v2_monitoring
Revises: 0057_warehouse_quality
Create Date: 2026-07-06
"""
import sqlalchemy as sa
from alembic import op

revision = "0058_modeling_v2_monitoring"
down_revision = ("0056_warehouse_ucp_integration", "0057_warehouse_quality")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ==================== Q0506: datasets.diff_snapshot ====================
    op.add_column(
        "datasets",
        sa.Column("diff_snapshot", sa.JSON(), nullable=True, comment="发布差异快照（V2 版本管理）"),
    )

    # ==================== Q0605: warehouse_alert_rules ====================
    op.create_table(
        "warehouse_alert_rules",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("alert_type", sa.String(32), nullable=False,
                  comment="quality_fail/sync_fail/build_fail/metric_fail"),
        sa.Column("target_code", sa.String(256), nullable=False, comment="目标资产编码"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("severity", sa.String(16), nullable=False, server_default="warn"),
        sa.Column("notify_channels", sa.JSON(), nullable=True, comment="通知渠道配置（占位）"),
        sa.Column("last_triggered_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_alert_type", "warehouse_alert_rules", ["alert_type", "enabled"])


def downgrade() -> None:
    op.drop_table("warehouse_alert_rules")
    op.drop_column("datasets", "diff_snapshot")
