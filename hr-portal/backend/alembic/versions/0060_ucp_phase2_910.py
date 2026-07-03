"""0060 UCP Phase 2-9 + 2-10：熔断/限流配置 + 通知模板

新增：
  - circuit_breaker_config 已在 connector_system_config 存在（Phase 1A 预留）
  - rate_limit_config 字段：连接器级 QPS 限流配置
  - connector_notification_template 表：通知模板 CRUD（标题/正文/变量/接收人/触发场景）

设计目标：
  - 熔断/限流配置独立可调
  - 通知模板与 pipeline / connector 解耦，可复用
  - 模板预览：mock 变量渲染
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0060"
down_revision: Union[str, None] = "0059_ucp_phase2_test_engine"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) connector_system_config 新增 rate_limit_config 字段
    op.add_column(
        "connector_system_config",
        sa.Column("rate_limit_config", sa.JSON(), nullable=True),
    )

    # 2) connector_notification_template 表
    op.create_table(
        "connector_notification_template",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("template_code", sa.String(64), nullable=False, unique=True),
        sa.Column("template_name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        # 触发场景
        sa.Column("trigger_scene", sa.String(32), nullable=False, server_default="on_success"),
        # 渠道 / 格式
        sa.Column("channel", sa.String(32), nullable=False, server_default="feishu"),
        sa.Column("message_format", sa.String(16), nullable=False, server_default="markdown"),
        # 标题 / 正文模板
        sa.Column("title_template", sa.String(255), nullable=False),
        sa.Column("content_template", sa.Text(), nullable=False),
        # 接收人规则
        sa.Column("receivers", sa.JSON(), nullable=False, server_default="[]"),
        # 变量说明
        sa.Column("variable_schema", sa.JSON(), nullable=True),
        # 是否启用
        sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
        # 审计
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("updated_by", sa.String(64), nullable=True),
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
        sa.UniqueConstraint("template_code", name="uq_connector_template_code"),
    )
    op.create_index(
        "ix_template_trigger_scene",
        "connector_notification_template",
        ["trigger_scene"],
    )
    op.create_index(
        "ix_template_active",
        "connector_notification_template",
        ["is_active"],
    )


def downgrade() -> None:
    op.drop_index("ix_template_active", table_name="connector_notification_template")
    op.drop_index("ix_template_trigger_scene", table_name="connector_notification_template")
    op.drop_table("connector_notification_template")
    op.drop_column("connector_system_config", "rate_limit_config")
