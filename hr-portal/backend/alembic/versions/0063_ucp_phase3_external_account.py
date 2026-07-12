"""0063 UCP Phase 3-4: 外部账号流水线

新增:
  - external_account: 外部系统账号（滴滴/曹操/钉钉等）
  - external_account_audit: 账号操作审计（创建/启用/停用/删除）

设计目标:
  - 外部账号表: 员工 ↔ 外部系统账号的映射, action 跟踪生命周期
  - action 状态机: ACTIVE → DISABLED → DELETED
  - 审计表: 每次操作一条记录, 支持回滚
  - 幂等键: (system, external_user_id) 唯一约束
  - 与 UCP pipeline_engine 配合, 事件触发创建/删除
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0063"
down_revision: Union[str, None] = "0062"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    # 1) external_account 表 —— 外部系统账号
    op.create_table(
        "external_account",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        # 外部系统标识: DIDI / CAOCAO / DINGTALK / FEISHU / GENERIC
        sa.Column("system_code", sa.String(32), nullable=False),
        # 员工标识: 北森 employee_id 或 飞书 user_id
        sa.Column("employee_id", sa.String(64), nullable=False),
        # 员工姓名 (脱敏后, 方便排查)
        sa.Column("employee_name", sa.String(64), nullable=True),
        # 员工手机号 (脱敏: 138****8000)
        sa.Column("employee_mobile_masked", sa.String(32), nullable=True),
        # 外部系统用户 ID
        sa.Column("external_user_id", sa.String(128), nullable=False),
        # 外部系统账号名 / 显示名
        sa.Column("external_account_name", sa.String(128), nullable=True),
        # 状态: ACTIVE / DISABLED / DELETED / PENDING / FAILED
        sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
        # 创建/更新/删除操作记录
        sa.Column("last_action", sa.String(16), nullable=True),  # CREATE / UPDATE / DISABLE / DELETE / REACTIVATE
        # 关联 pipeline_run_id (用于追溯)
        sa.Column("last_pipeline_run_id", sa.String(64), nullable=True),
        sa.Column("last_event_id", sa.String(128), nullable=True),  # 触发事件 ID
        # 错误信息
        sa.Column("last_error_code", sa.String(64), nullable=True),
        sa.Column("last_error_message", sa.Text(), nullable=True),
        # 重试次数
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        # 元数据: 部门/邮箱/职位等
        sa.Column("extra", sa.JSON(), nullable=True),
        # 时间
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("system_code", "external_user_id", name="uq_external_account_system_user"),
    )
    op.create_index("ix_external_account_employee", "external_account", ["system_code", "employee_id"])
    op.create_index("ix_external_account_status", "external_account", ["status"])

    # 2) external_account_audit 表 —— 账号操作审计
    op.create_table(
        "external_account_audit",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("account_id", sa.BigInteger(), nullable=False),
        sa.Column("system_code", sa.String(32), nullable=False),
        sa.Column("employee_id", sa.String(64), nullable=False),
        sa.Column("external_user_id", sa.String(128), nullable=True),
        # 操作类型: CREATE / UPDATE / DISABLE / REACTIVATE / DELETE
        sa.Column("action", sa.String(16), nullable=False),
        # 操作结果: SUCCESS / FAILED / SKIPPED
        sa.Column("result", sa.String(16), nullable=False),
        # 触发来源: PIPELINE / MANUAL / EVENT / APPROVAL
        sa.Column("trigger_source", sa.String(16), nullable=False, server_default="PIPELINE"),
        # 关联追溯
        sa.Column("pipeline_run_id", sa.String(64), nullable=True),
        sa.Column("event_id", sa.String(128), nullable=True),
        sa.Column("approval_id", sa.BigInteger(), nullable=True),  # Phase 3-5 审批关联
        sa.Column("operator", sa.String(64), nullable=True),  # 操作人（系统/用户）
        # 请求/响应 (脱敏后)
        sa.Column("request_payload", sa.JSON(), nullable=True),
        sa.Column("response_payload", sa.JSON(), nullable=True),
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        # 时间
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_external_account_audit_account", "external_account_audit", ["account_id"])
    op.create_index("ix_external_account_audit_employee", "external_account_audit", ["system_code", "employee_id"])
    op.create_index("ix_external_account_audit_action", "external_account_audit", ["action", "result"])
    op.create_index("ix_external_account_audit_created", "external_account_audit", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_external_account_audit_created", table_name="external_account_audit")
    op.drop_index("ix_external_account_audit_action", table_name="external_account_audit")
    op.drop_index("ix_external_account_audit_employee", table_name="external_account_audit")
    op.drop_index("ix_external_account_audit_account", table_name="external_account_audit")
    op.drop_table("external_account_audit")
    op.drop_index("ix_external_account_status", table_name="external_account")
    op.drop_index("ix_external_account_employee", table_name="external_account")
    op.drop_table("external_account")
