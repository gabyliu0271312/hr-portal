"""0065 UCP Phase 3-6: OA 组织架构同步

新增:
  - oa_sync_record: OA 同步记录（每条记录一个组织节点的状态）
  - oa_sync_run: OA 同步运行历史（每次扫描一个批次）

设计目标:
  - 记录每个组织节点在 OA 系统中的最新同步状态
  - 区分: SOURCE (北森) 与 TARGET (OA) 的当前状态
  - diff 算法结果: CREATED / UPDATED / DELETED / MOVED / UNCHANGED
  - 支持定时扫描 + 事件触发双模式
  - 高风险动作 (DELETE / MOVE) 走 Phase 3-5 审批
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0065"
down_revision: Union[str, None] = "0064"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    # 1) oa_sync_run —— 同步批次运行历史
    op.create_table(
        "oa_sync_run",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("run_code", sa.String(64), nullable=False, unique=True),
        # 触发: SCHEDULED / EVENT / MANUAL
        sa.Column("trigger_type", sa.String(16), nullable=False, server_default="SCHEDULED"),
        # 源 (北森) / 目标 (OA) 系统标识
        sa.Column("source_system", sa.String(32), nullable=False, server_default="BEISEN"),
        sa.Column("target_system", sa.String(32), nullable=False, server_default="OA"),
        # 状态: PENDING / RUNNING / SUCCESS / PARTIAL_SUCCESS / FAILED
        sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
        # 差异统计
        sa.Column("total_orgs", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("moved_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deleted_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unchanged_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("approval_pending_count", sa.Integer(), nullable=False, server_default="0"),
        # 错误
        sa.Column("error_message", sa.Text(), nullable=True),
        # 触发信息
        sa.Column("triggered_by", sa.String(64), nullable=True),
        sa.Column("event_id", sa.String(128), nullable=True),
        sa.Column("pipeline_run_id", sa.String(64), nullable=True),
        # 时间
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_oa_sync_run_status", "oa_sync_run", ["status"])
    op.create_index("ix_oa_sync_run_created", "oa_sync_run", ["created_at"])

    # 2) oa_sync_record —— 组织节点同步记录
    op.create_table(
        "oa_sync_record",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("run_id", sa.BigInteger(), nullable=False),
        # 组织标识
        sa.Column("org_code", sa.String(64), nullable=False),  # 源系统的部门 code
        sa.Column("org_name", sa.String(128), nullable=False),
        sa.Column("parent_org_code", sa.String(64), nullable=True),
        # 源 (SOURCE) 状态
        sa.Column("source_status", sa.String(16), nullable=True),  # ACTIVE / DELETED
        sa.Column("source_path", sa.String(512), nullable=True),  # 完整路径
        # 目标 (TARGET) 状态
        sa.Column("target_org_id", sa.String(64), nullable=True),  # OA 系统中的 ID
        sa.Column("target_status", sa.String(16), nullable=True),  # ACTIVE / DELETED / NOT_FOUND
        # 差异
        sa.Column("diff_type", sa.String(16), nullable=False),  # CREATED / UPDATED / DELETED / MOVED / UNCHANGED
        sa.Column("diff_detail", sa.JSON(), nullable=True),  # 字段级 diff
        # 处理结果
        sa.Column("process_status", sa.String(16), nullable=False, server_default="PENDING"),
        # PENDING / SYNCING / SYNCED / FAILED / SKIPPED / APPROVAL_PENDING
        sa.Column("process_error", sa.Text(), nullable=True),
        sa.Column("approval_id", sa.BigInteger(), nullable=True),  # Phase 3-5 审批关联
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=True),
        # 审计
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_oa_sync_record_run", "oa_sync_record", ["run_id"])
    op.create_index("ix_oa_sync_record_org", "oa_sync_record", ["org_code"])
    op.create_index("ix_oa_sync_record_diff", "oa_sync_record", ["diff_type", "process_status"])


def downgrade() -> None:
    op.drop_index("ix_oa_sync_record_diff", table_name="oa_sync_record")
    op.drop_index("ix_oa_sync_record_org", table_name="oa_sync_record")
    op.drop_index("ix_oa_sync_record_run", table_name="oa_sync_record")
    op.drop_table("oa_sync_record")
    op.drop_index("ix_oa_sync_run_created", table_name="oa_sync_run")
    op.drop_index("ix_oa_sync_run_status", table_name="oa_sync_run")
    op.drop_table("oa_sync_run")
