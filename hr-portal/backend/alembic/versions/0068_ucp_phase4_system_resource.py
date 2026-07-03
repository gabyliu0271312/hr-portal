"""Phase 4: 接入系统模型重构

旧模型问题:
- connector_system_config 粒度太粗 (一个 system_code = 一行, 只能挂 1 个 adapter)
- 拉 N 张表 = 假装 N 个系统, 严重不合理

新模型:
- connector_system: 业务系统 (北森/飞书/滴滴), 逻辑分组
- connector_resource: 实际数据资源 (员工表/组织表), 粒度 = 一张表/一个 API
- 一个 system 1:N resource
- 一个 credential 1:N resource (凭证可被多个 resource 共享)
- 弃用 connector_system_config (保留只读, 不再写入)

Revision ID: 0068
Revises: 0067
"""
from alembic import op
import sqlalchemy as sa


revision = "0068"
down_revision = "0067"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. 系统表 (逻辑分组)
    op.create_table(
        "connector_system",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("system_code", sa.String(64), nullable=False, unique=True),
        sa.Column("system_name", sa.String(128), nullable=False),
        # 系统类型: HR_SAAS / OA / IM / CAR / CUSTOM
        sa.Column("system_type", sa.String(32), nullable=False, server_default="CUSTOM"),
        sa.Column("icon", sa.String(64), nullable=True),
        sa.Column("owner", sa.String(64), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("created_by", sa.String(64), nullable=True, server_default="system"),
        sa.Column("updated_by", sa.String(64), nullable=True, server_default="system"),
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
            nullable=False,
        ),
    )
    op.create_index("ix_connector_system_type", "connector_system", ["system_type"])

    # 2. 资源表 (数据表/API 接口, 粒度 = 一张表)
    op.create_table(
        "connector_resource",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        # 所属系统
        sa.Column("system_id", sa.BigInteger(), nullable=False),
        # 资源编码 (在 system_id 范围内唯一, 如 EMPLOYEE / ORG / POSITION)
        sa.Column("resource_code", sa.String(64), nullable=False),
        sa.Column("resource_name", sa.String(128), nullable=False),
        # 适配器编码 (1 个 resource 绑 1 个 adapter)
        sa.Column("adapter_code", sa.String(64), nullable=True),
        # 凭证引用 (N 个 resource 可共享同一凭证)
        sa.Column("credential_id", sa.BigInteger(), nullable=True),
        # 协议配置 (URL/参数模板)
        sa.Column("protocol", sa.JSON(), nullable=True),
        # 报表配置 (北森 Report ID)
        sa.Column("report_config", sa.JSON(), nullable=True),
        # 字段映射配置
        sa.Column("mapping_config", sa.JSON(), nullable=True),
        # 文件导入配置
        sa.Column("file_config", sa.JSON(), nullable=True),
        # 调度配置
        sa.Column("scheduling", sa.JSON(), nullable=True),
        # 通知策略
        sa.Column("notification_config", sa.JSON(), nullable=True),
        # 重试/熔断/限流
        sa.Column("retry_config", sa.JSON(), nullable=True),
        sa.Column("circuit_breaker_config", sa.JSON(), nullable=True),
        # 测试状态
        sa.Column("test_status", sa.String(32), nullable=False, server_default="NOT_TESTED"),
        sa.Column("test_result", sa.JSON(), nullable=True),
        sa.Column("test_time", sa.DateTime(timezone=True), nullable=True),
        # 启停状态: 0=未启用, 1=启用, 2=停用
        sa.Column("status", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("created_by", sa.String(64), nullable=True, server_default="system"),
        sa.Column("updated_by", sa.String(64), nullable=True, server_default="system"),
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
            nullable=False,
        ),
        sa.UniqueConstraint("system_id", "resource_code", name="uq_resource_system_code"),
        sa.ForeignKeyConstraint(
            ["system_id"], ["connector_system.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["credential_id"], ["connector_credentials.id"], ondelete="SET NULL"
        ),
    )
    op.create_index("ix_connector_resource_system", "connector_resource", ["system_id"])
    op.create_index("ix_connector_resource_credential", "connector_resource", ["credential_id"])
    op.create_index("ix_connector_resource_status", "connector_resource", ["status"])


def downgrade() -> None:
    op.drop_index("ix_connector_resource_status", table_name="connector_resource")
    op.drop_index("ix_connector_resource_credential", table_name="connector_resource")
    op.drop_index("ix_connector_resource_system", table_name="connector_resource")
    op.drop_table("connector_resource")
    op.drop_index("ix_connector_system_type", table_name="connector_system")
    op.drop_table("connector_system")
