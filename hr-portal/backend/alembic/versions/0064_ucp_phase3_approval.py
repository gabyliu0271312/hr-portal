"""0064 UCP Phase 3-5: 高风险动作审批

新增:
  - approval_request: 审批请求主表
  - approval_step: 审批步骤（多人会签/或签）
  - approval_action: 审批操作日志（同意/拒绝/转交/撤回）

设计目标:
  - 审批模式: SINGLE (单人) / ANY (或签, 任一通过) / ALL (会签, 全部通过)
  - 高风险动作: 删除外部账号 / 停用外部账号
  - 集成 Phase 3-4: 外部账号 adapter 调用前检查审批
  - 集成 Phase 3-3: 审批通过的事件可触发实际动作
  - 二次确认: SIMPLE (单次确认) / TOKEN (二次令牌)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0064"
down_revision: Union[str, None] = "0063"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    # 1) approval_request —— 审批请求主表
    op.create_table(
        "approval_request",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        # 请求标识
        sa.Column("request_code", sa.String(64), nullable=False, unique=True),
        # 业务类型: EXTERNAL_ACCOUNT_DELETE / EXTERNAL_ACCOUNT_DISABLE / OA_ORG_DELETE / GENERIC
        sa.Column("business_type", sa.String(64), nullable=False),
        # 关联业务对象
        sa.Column("business_key", sa.String(128), nullable=False),  # 例如 external_user_id
        sa.Column("business_summary", sa.String(255), nullable=True),  # 摘要
        # 动作描述
        sa.Column("action", sa.String(32), nullable=False),  # DELETE / DISABLE / MOVE
        sa.Column("action_payload", sa.JSON(), nullable=True),  # 动作参数
        # 审批模式: SINGLE / ANY / ALL
        sa.Column("approval_mode", sa.String(16), nullable=False, server_default="SINGLE"),
        # 二次确认: NONE / SIMPLE / TOKEN
        sa.Column("confirmation_type", sa.String(16), nullable=False, server_default="NONE"),
        sa.Column("confirmation_token", sa.String(64), nullable=True),  # 二次确认令牌
        # 审批人列表 (JSON): [{"user_id": "u1", "required": true}, ...]
        sa.Column("approvers", sa.JSON(), nullable=False),
        # 状态: PENDING / APPROVED / REJECTED / CANCELLED / EXPIRED
        sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
        # 当前进度
        sa.Column("current_step", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_steps", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("approved_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rejected_count", sa.Integer(), nullable=False, server_default="0"),
        # 触发信息
        sa.Column("trigger_source", sa.String(16), nullable=False, server_default="MANUAL"),
        sa.Column("triggered_by", sa.String(64), nullable=True),
        sa.Column("pipeline_run_id", sa.String(64), nullable=True),
        sa.Column("event_id", sa.String(128), nullable=True),
        # 关联追溯
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("execution_result", sa.String(16), nullable=True),  # SUCCESS / FAILED
        sa.Column("execution_error", sa.Text(), nullable=True),
        # 过期
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        # 备注
        sa.Column("reason", sa.Text(), nullable=True),  # 申请人理由
        # 审计
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_approval_request_business", "approval_request", ["business_type", "business_key"])
    op.create_index("ix_approval_request_status", "approval_request", ["status"])
    op.create_index("ix_approval_request_triggered", "approval_request", ["triggered_by"])
    op.create_index("ix_approval_request_pipeline", "approval_request", ["pipeline_run_id"])

    # 2) approval_step —— 审批步骤
    op.create_table(
        "approval_step",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("request_id", sa.BigInteger(), nullable=False),
        sa.Column("step_index", sa.Integer(), nullable=False),
        # 审批人
        sa.Column("approver_id", sa.String(64), nullable=False),
        sa.Column("approver_name", sa.String(64), nullable=True),
        # 状态: PENDING / APPROVED / REJECTED / SKIPPED
        sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
        sa.Column("action_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        # 转交
        sa.Column("transferred_to", sa.String(64), nullable=True),
        # 时间
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_approval_step_request", "approval_step", ["request_id"])
    op.create_index("ix_approval_step_approver", "approval_step", ["approver_id", "status"])

    # 3) approval_action —— 审批操作日志
    op.create_table(
        "approval_action",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("request_id", sa.BigInteger(), nullable=False),
        sa.Column("step_id", sa.BigInteger(), nullable=True),
        # 操作类型: SUBMIT / APPROVE / REJECT / TRANSFER / WITHDRAW / EXPIRE / EXECUTE
        sa.Column("action", sa.String(16), nullable=False),
        # 操作人
        sa.Column("operator_id", sa.String(64), nullable=True),
        sa.Column("operator_name", sa.String(64), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        # 操作上下文
        sa.Column("metadata", sa.JSON(), nullable=True),
        # 时间
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_approval_action_request", "approval_action", ["request_id"])
    op.create_index("ix_approval_action_created", "approval_action", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_approval_action_created", table_name="approval_action")
    op.drop_index("ix_approval_action_request", table_name="approval_action")
    op.drop_table("approval_action")
    op.drop_index("ix_approval_step_approver", table_name="approval_step")
    op.drop_index("ix_approval_step_request", table_name="approval_step")
    op.drop_table("approval_step")
    op.drop_index("ix_approval_request_pipeline", table_name="approval_request")
    op.drop_index("ix_approval_request_triggered", table_name="approval_request")
    op.drop_index("ix_approval_request_status", table_name="approval_request")
    op.drop_index("ix_approval_request_business", table_name="approval_request")
    op.drop_table("approval_request")
