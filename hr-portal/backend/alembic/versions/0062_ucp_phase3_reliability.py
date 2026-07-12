"""0062 UCP Phase 3-3: 事件可靠性（重试 / 死信 / 重放）

新增:
  - ucp_event_delivery 表: 记录每次派发尝试，支持重试与死信
  - 索引便于按事件/状态/重试时间查询
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0062"
down_revision: Union[str, None] = "0061"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.create_table(
        "ucp_event_delivery",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        # 关联事件
        sa.Column("event_id", sa.BigInteger(), nullable=False),
        sa.Column("event_uuid", sa.String(128), nullable=False),
        # 关联触发器
        sa.Column("trigger_id", sa.BigInteger(), nullable=True),
        sa.Column("trigger_code", sa.String(64), nullable=True),
        # 关联 pipeline run
        sa.Column("pipeline_run_id", sa.String(64), nullable=True),
        # 派发尝试序号
        sa.Column("attempt", sa.Integer(), nullable=False, server_default="1"),
        # 状态: PENDING / SUCCESS / FAILED / DEAD_LETTER / SKIPPED
        sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
        # 错误
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        # 重试时间
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_retry_at", sa.DateTime(timezone=True), nullable=True),
        # 触发方式: AUTO / MANUAL / REPLAY
        sa.Column("trigger_source", sa.String(16), nullable=False, server_default="AUTO"),
        sa.Column("triggered_by", sa.String(64), nullable=True),
        # 时间
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        # 索引
        sa.Index("idx_ucp_delivery_event", "event_id"),
        sa.Index("idx_ucp_delivery_status", "status"),
        sa.Index("idx_ucp_delivery_next_retry", "next_retry_at"),
        sa.Index("idx_ucp_delivery_event_uuid", "event_uuid"),
    )


def downgrade() -> None:
    op.drop_table("ucp_event_delivery")
