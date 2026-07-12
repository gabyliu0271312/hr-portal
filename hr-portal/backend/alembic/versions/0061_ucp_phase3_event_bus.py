"""0061 UCP Phase 3-1: 事件总线基础架构

新增:
  - ucp_event 表: 事件落库 + 派发跟踪
  - connector_event_trigger 表: 事件触发器配置（事件类型 → pipeline 映射）

设计目标:
  - 事件按 source+event_id 唯一约束实现天然去重（Phase 3-3 复用）
  - 事件状态机: RECEIVED → MATCHED → DISPATCHED → COMPLETED / FAILED
  - 触发器按 event_type 匹配,支持 filter_rule (JSON 路径过滤)
  - 与现有 pipeline_engine.execute_pipeline 对接,异步派发
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0061"
down_revision: Union[str, None] = "0060"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    # 1) ucp_event 表 —— 事件总线主表
    op.create_table(
        "ucp_event",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        # 事件唯一 ID（去重键）
        sa.Column("event_id", sa.String(128), nullable=False, unique=True),
        # 事件类型: EMPLOYEE_ONBOARDING / OFFER_STATUS_CHANGE / CONTACT_UPDATE / GENERIC ...
        sa.Column("event_type", sa.String(64), nullable=False),
        # 事件来源: FEISHU / BEISEN / INTERNAL / GENERIC
        sa.Column("source", sa.String(32), nullable=False),
        # 触发器类型: REALTIME / BATCH
        sa.Column("trigger", sa.String(16), nullable=False, server_default="REALTIME"),
        # 事件 payload（脱敏后存储）
        sa.Column("payload", sa.JSON(), nullable=False, server_default="{}"),
        # 事件元数据: header / signature / ip
        sa.Column("metadata", sa.JSON(), nullable=True),
        # 状态: RECEIVED / MATCHED / DISPATCHED / COMPLETED / FAILED / DEAD_LETTER
        sa.Column("status", sa.String(16), nullable=False, server_default="RECEIVED"),
        # 关联 trace_id
        sa.Column("trace_id", sa.String(64), nullable=True),
        # 命中触发器 ID（可空：未匹配到任何触发器时为空）
        sa.Column("matched_trigger_id", sa.BigInteger(), nullable=True),
        # 命中触发器代码（冗余便于查询）
        sa.Column("matched_trigger_code", sa.String(64), nullable=True),
        # 派发的 pipeline_run_id
        sa.Column("pipeline_run_id", sa.String(64), nullable=True),
        # 失败次数（重试用，Phase 3-3 启用）
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        # 错误信息
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        # 时间
        sa.Column("event_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        # 索引
        sa.Index("idx_ucp_event_status", "status"),
        sa.Index("idx_ucp_event_type", "event_type"),
        sa.Index("idx_ucp_event_source", "source"),
        sa.Index("idx_ucp_event_received_at", "received_at"),
    )

    # 2) connector_event_trigger 表 —— 事件触发器配置
    op.create_table(
        "connector_event_trigger",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        # 触发器代码
        sa.Column("trigger_code", sa.String(64), nullable=False, unique=True),
        # 触发器名称
        sa.Column("trigger_name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        # 事件源
        sa.Column("event_source", sa.String(32), nullable=False),
        # 事件类型（可多个，逗号分隔）
        sa.Column("event_types", sa.String(512), nullable=False),
        # 关联的 pipeline_code
        sa.Column("pipeline_code", sa.String(64), nullable=False),
        # 过滤规则（JSON 路径表达式列表）
        sa.Column("filter_rule", sa.JSON(), nullable=True),
        # 签名校验密钥（HMAC-SHA256，可选）
        sa.Column("signing_secret", sa.String(256), nullable=True),
        # 签名头名
        sa.Column("signature_header", sa.String(64), nullable=True, server_default="X-Signature"),
        # 飞书专属字段
        sa.Column("feishu_verification_token", sa.String(256), nullable=True),
        sa.Column("feishu_encrypt_key", sa.String(256), nullable=True),
        # 执行主体: SERVICE_ACCOUNT / TRIGGER_USER（默认服务账号）
        sa.Column("run_as_type", sa.String(32), nullable=False, server_default="SERVICE_ACCOUNT"),
        sa.Column("service_account_code", sa.String(64), nullable=True),
        # 是否启用
        sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
        # webhook URL 路径（外部系统推送入口）
        sa.Column("webhook_path", sa.String(128), nullable=True, unique=True),
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
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("connector_event_trigger")
    op.drop_table("ucp_event")
