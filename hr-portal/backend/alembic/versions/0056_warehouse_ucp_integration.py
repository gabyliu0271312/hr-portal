# -*- coding: utf-8 -*-
"""数据仓库与 UCP 集成：registered_tables 扩展字段 + datasets 扩展 + 新表

为 registered_tables 新增 11 个数据仓库相关字段：
- warehouse_layer (ODS/DWD/DWS/ADS，默认 ODS)
- subject_area (主题域)
- owner_user_id / owner_name (负责人)
- source_system (来源系统)
- asset_status (draft/published/disabled/archived，默认 published)
- ucp_system_id / ucp_resource_id / ucp_connector_config_id (UCP 关联，不强 FK)
- last_quality_status / last_quality_checked_at (质量状态)

Revision ID: 0056_warehouse_ucp_integration
Revises: 0055_report_visibility
Create Date: 2026-07-04
"""
import sqlalchemy as sa
from alembic import op

revision = "0056_warehouse_ucp_integration"
down_revision = ("0054_data_compare_tasks", "0055_report_visibility")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ==================== registered_tables 扩展 ====================

    # warehouse_layer（数据分层，默认 ODS）
    op.add_column(
        "registered_tables",
        sa.Column(
            "warehouse_layer",
            sa.String(16),
            nullable=False,
            server_default="ODS",
        ),
    )

    # subject_area（主题域）
    op.add_column(
        "registered_tables",
        sa.Column(
            "subject_area",
            sa.String(64),
            nullable=True,
        ),
    )

    # owner_user_id（负责人 ID，不强 FK）
    op.add_column(
        "registered_tables",
        sa.Column(
            "owner_user_id",
            sa.BigInteger,
            nullable=True,
        ),
    )

    # owner_name（负责人名称）
    op.add_column(
        "registered_tables",
        sa.Column(
            "owner_name",
            sa.String(64),
            nullable=True,
        ),
    )

    # source_system（来源系统）
    op.add_column(
        "registered_tables",
        sa.Column(
            "source_system",
            sa.String(64),
            nullable=True,
        ),
    )

    # asset_status（资产状态，默认 published）
    op.add_column(
        "registered_tables",
        sa.Column(
            "asset_status",
            sa.String(16),
            nullable=False,
            server_default="published",
        ),
    )

    # ucp_system_id（UCP 系统 ID，不强 FK）
    op.add_column(
        "registered_tables",
        sa.Column(
            "ucp_system_id",
            sa.BigInteger,
            nullable=True,
        ),
    )

    # ucp_resource_id（UCP 资源 ID，不强 FK）
    op.add_column(
        "registered_tables",
        sa.Column(
            "ucp_resource_id",
            sa.BigInteger,
            nullable=True,
        ),
    )

    # ucp_connector_config_id（兼容旧 ConnectorSystemConfig，不强 FK）
    op.add_column(
        "registered_tables",
        sa.Column(
            "ucp_connector_config_id",
            sa.BigInteger,
            nullable=True,
        ),
    )

    # last_quality_status（质量状态，默认 unknown）
    op.add_column(
        "registered_tables",
        sa.Column(
            "last_quality_status",
            sa.String(16),
            nullable=False,
            server_default="unknown",
        ),
    )

    # last_quality_checked_at（最近质量检查时间）
    op.add_column(
        "registered_tables",
        sa.Column(
            "last_quality_checked_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    # ==================== datasets 扩展 ====================

    # warehouse_layer（数据分层，默认 DWD）
    op.add_column(
        "datasets",
        sa.Column(
            "warehouse_layer",
            sa.String(16),
            nullable=False,
            server_default="DWD",
        ),
    )

    # subject_area（主题域）
    op.add_column(
        "datasets",
        sa.Column(
            "subject_area",
            sa.String(64),
            nullable=True,
        ),
    )

    # owner_user_id（负责人 ID，不强 FK）
    op.add_column(
        "datasets",
        sa.Column(
            "owner_user_id",
            sa.BigInteger,
            nullable=True,
        ),
    )

    # owner_name（负责人名称）
    op.add_column(
        "datasets",
        sa.Column(
            "owner_name",
            sa.String(64),
            nullable=True,
        ),
    )

    # status（状态，默认 published；兼容旧 is_active 映射）
    op.add_column(
        "datasets",
        sa.Column(
            "status",
            sa.String(16),
            nullable=False,
            server_default="published",
        ),
    )

    # business_definition（业务定义/口径）
    op.add_column(
        "datasets",
        sa.Column(
            "business_definition",
            sa.Text,
            nullable=True,
        ),
    )

    # version（版本号，默认 1）
    op.add_column(
        "datasets",
        sa.Column(
            "version",
            sa.Integer,
            nullable=False,
            server_default="1",
        ),
    )

    # published_at（发布时间）
    op.add_column(
        "datasets",
        sa.Column(
            "published_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    # published_by（发布人，不强 FK）
    op.add_column(
        "datasets",
        sa.Column(
            "published_by",
            sa.BigInteger,
            nullable=True,
        ),
    )

    # ==================== dataset_output_fields 新表 ====================
    op.create_table(
        "dataset_output_fields",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "dataset_id",
            sa.BigInteger,
            sa.ForeignKey("datasets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_alias", sa.String(64), nullable=False),
        sa.Column("source_column", sa.String(128), nullable=False),
        sa.Column("output_code", sa.String(128), nullable=False),
        sa.Column("output_label", sa.String(128), nullable=False),
        sa.Column("data_type", sa.String(16), nullable=False, server_default="string"),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("agg_role", sa.String(16), nullable=False, server_default="dimension"),
        sa.Column("is_sensitive", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_visible", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dataset_id", "output_code", name="uq_dataset_output_code"),
    )
    op.create_index("ix_dataset_output_fields_dataset_id", "dataset_output_fields", ["dataset_id"])

    # ==================== warehouse_metrics 新表 ====================
    op.create_table(
        "warehouse_metrics",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        # 指标编码（唯一）
        sa.Column("metric_code", sa.String(64), nullable=False),
        # 基础字段
        sa.Column("metric_name", sa.String(128), nullable=False),
        sa.Column("metric_type", sa.String(16), nullable=False, server_default="derived"),
        sa.Column("subject_area", sa.String(64), nullable=True),
        sa.Column("business_definition", sa.Text, nullable=True),
        # 计算口径
        sa.Column("calculation_desc", sa.Text, nullable=True),
        sa.Column("formula_expr", sa.Text, nullable=True),
        sa.Column("stat_period", sa.String(16), nullable=True),
        # 依赖
        sa.Column(
            "related_dataset_id",
            sa.BigInteger,
            sa.ForeignKey("datasets.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("related_fields", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        # 负责人和状态
        sa.Column("owner_user_id", sa.BigInteger, nullable=True),
        sa.Column("owner_name", sa.String(64), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by", sa.BigInteger, nullable=True),
        # 审计
        sa.Column("created_by", sa.BigInteger, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("metric_code", name="uq_warehouse_metric_code"),
    )
    op.create_index("ix_warehouse_metrics_subject_area", "warehouse_metrics", ["subject_area"])
    op.create_index("ix_warehouse_metrics_status", "warehouse_metrics", ["status"])


def downgrade() -> None:
    # warehouse_metrics 回滚
    op.drop_index("ix_warehouse_metrics_status", table_name="warehouse_metrics")
    op.drop_index("ix_warehouse_metrics_subject_area", table_name="warehouse_metrics")
    op.drop_table("warehouse_metrics")

    # dataset_output_fields 回滚
    op.drop_index("ix_dataset_output_fields_dataset_id", table_name="dataset_output_fields")
    op.drop_table("dataset_output_fields")

    # datasets 扩展回滚
    op.drop_column("datasets", "published_by")
    op.drop_column("datasets", "published_at")
    op.drop_column("datasets", "version")
    op.drop_column("datasets", "business_definition")
    op.drop_column("datasets", "status")
    op.drop_column("datasets", "owner_name")
    op.drop_column("datasets", "owner_user_id")
    op.drop_column("datasets", "subject_area")
    op.drop_column("datasets", "warehouse_layer")

    # registered_tables 扩展回滚
    op.drop_column("registered_tables", "last_quality_checked_at")
    op.drop_column("registered_tables", "last_quality_status")
    op.drop_column("registered_tables", "ucp_connector_config_id")
    op.drop_column("registered_tables", "ucp_resource_id")
    op.drop_column("registered_tables", "ucp_system_id")
    op.drop_column("registered_tables", "asset_status")
    op.drop_column("registered_tables", "source_system")
    op.drop_column("registered_tables", "owner_name")
    op.drop_column("registered_tables", "owner_user_id")
    op.drop_column("registered_tables", "subject_area")
    op.drop_column("registered_tables", "warehouse_layer")
