"""0059 UCP Phase 2-1：连接器测试引擎

新增连接器测试历史日志表：
  - connector_test_log
    记录每次测试的完整结果：测试类型（认证/连通性/预览/推送模拟）、输入/输出/状态/错误信息
    用于审计和趋势分析

设计目标：
  - 测试历史可追溯：每次测试都留痕
  - 脱敏落地：测试数据自动脱敏（masking）
  - 高性能：按 connector_code + created_at 索引
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0059_ucp_phase2_test_engine"
down_revision: Union[str, None] = "0058_rename_synced_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "connector_test_log",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        # 关联连接器
        sa.Column("connector_id", sa.BigInteger(), nullable=True),
        sa.Column("connector_code", sa.String(64), nullable=False),
        # 测试类型：AUTH / CONNECTIVITY / PREVIEW / PUSH_SIMULATION
        sa.Column("test_type", sa.String(32), nullable=False),
        # 测试状态：PASSED / FAILED / WARNING
        sa.Column("status", sa.String(16), nullable=False),
        # 测试耗时（毫秒）
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
        # 输入参数（脱敏后）
        sa.Column("request_params_masked", sa.JSON(), nullable=True),
        # 测试结果数据（脱敏后，最多 50 行样本）
        sa.Column("response_sample", sa.JSON(), nullable=True),
        # 错误码
        sa.Column("error_code", sa.String(64), nullable=True),
        # 错误信息
        sa.Column("error_message", sa.Text(), nullable=True),
        # 测试人
        sa.Column("tested_by", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Index("ix_test_log_connector_code", "connector_code"),
        sa.Index("ix_test_log_created_at", "created_at"),
        sa.Index("ix_test_log_connector_type", "connector_code", "test_type"),
    )

    # 为 connector_system_config 增加几个 Phase 2 需要的字段
    op.add_column(
        "connector_system_config",
        sa.Column("test_config", sa.JSON(), nullable=True, comment="测试配置（限流/超时/最大行数）"),
    )


def downgrade() -> None:
    op.drop_column("connector_system_config", "test_config")
    op.drop_table("connector_test_log")
