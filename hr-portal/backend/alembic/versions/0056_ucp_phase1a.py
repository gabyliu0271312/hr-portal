"""0056 UCP Phase 1A 数据库表

新增通用连接器平台（UCP）所需的所有表：
  - connector_credentials          凭证加密存储
  - connector_system_config        连接器配置
  - connector_config_version       配置版本历史
  - connector_pipeline_config      流水线配置
  - connector_pipeline_execution   流水线执行实例
  - connector_pipeline_step_execution 步骤执行实例
  - connector_loop_item_execution  循环步骤失败项
  - connector_execution_log        连接器执行日志
  - connector_notification_log     通知日志
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0056_ucp_phase1a"
down_revision: Union[str, None] = "0055_report_visibility"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    conn = op.get_bind()
    return bool(conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT FROM pg_catalog.pg_tables "
            "WHERE schemaname = 'public' AND tablename = :name)"
        ),
        {"name": name},
    ).scalar())


def _phase1a_already_materialized() -> bool:
    # Production may already have these tables from a manual/legacy bootstrap while alembic_version
    # still points before 0056. 0072 later aligns connector_* -> ucp_* and fills missing columns,
    # so do not recreate Phase 1A tables when either old or renamed tables are present.
    core_tables = [
        "connector_credentials", "connector_system_config", "connector_pipeline_config",
        "connector_pipeline_execution", "connector_pipeline_step_execution",
        "ucp_credentials", "ucp_system_config", "ucp_pipeline_config",
        "ucp_pipeline_execution", "ucp_pipeline_step_execution",
    ]
    return any(_table_exists(t) for t in core_tables)


def upgrade() -> None:
    if _phase1a_already_materialized():
        return

    # 1. 凭证表
    op.create_table(
        "connector_credentials",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("credential_code", sa.String(64), nullable=False),
        sa.Column("credential_name", sa.String(128), nullable=False),
        sa.Column("secrets_encrypted", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("auth_type", sa.String(32), nullable=False, server_default="custom"),
        sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_verified_status", sa.String(16), nullable=True),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("updated_by", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("credential_code", name="uq_connector_credential_code"),
    )

    # 2. 连接器配置表
    op.create_table(
        "connector_system_config",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("system_code", sa.String(64), nullable=False),
        sa.Column("system_name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("connector_type", sa.String(32), nullable=False),
        sa.Column("direction", sa.String(32), nullable=False, server_default="INBOUND"),
        sa.Column("adapter_code", sa.String(64), nullable=True),
        sa.Column("protocol", sa.JSON(), nullable=True),
        sa.Column("credential_id", sa.BigInteger(), sa.ForeignKey("connector_credentials.id", ondelete="SET NULL"), nullable=True),
        sa.Column("report_config", sa.JSON(), nullable=True),
        sa.Column("scheduling", sa.JSON(), nullable=True),
        sa.Column("mapping_config", sa.JSON(), nullable=True),
        sa.Column("file_config", sa.JSON(), nullable=True),
        sa.Column("retry_config", sa.JSON(), nullable=True),
        sa.Column("circuit_breaker_config", sa.JSON(), nullable=True),
        sa.Column("notification_config", sa.JSON(), nullable=True),
        sa.Column("test_status", sa.String(32), nullable=False, server_default="NOT_TESTED"),
        sa.Column("test_result", sa.JSON(), nullable=True),
        sa.Column("test_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("connector_owner", sa.String(64), nullable=True),
        sa.Column("run_as_type", sa.String(32), nullable=False, server_default="SERVICE_ACCOUNT"),
        sa.Column("run_as_user_id", sa.BigInteger(), nullable=True),
        sa.Column("service_account_code", sa.String(64), nullable=True),
        sa.Column("status", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("updated_by", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("system_code", name="uq_connector_system_code"),
    )

    # 3. 配置版本表
    op.create_table(
        "connector_config_version",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("connector_code", sa.String(64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("config_snapshot", sa.JSON(), nullable=False),
        sa.Column("change_reason", sa.String(255), nullable=True),
        sa.Column("changed_by", sa.String(64), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("connector_code", "version", name="uq_connector_config_version"),
    )

    # 4. 流水线配置表
    op.create_table(
        "connector_pipeline_config",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("pipeline_code", sa.String(64), nullable=False),
        sa.Column("pipeline_name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("steps", sa.JSON(), nullable=False),
        sa.Column("trigger_type", sa.String(32), nullable=False, server_default="SCHEDULED"),
        sa.Column("trigger_config", sa.JSON(), nullable=True),
        sa.Column("error_handling", sa.String(32), nullable=False, server_default="STOP_ON_ERROR"),
        sa.Column("notification_config", sa.JSON(), nullable=True),
        sa.Column("run_as_type", sa.String(32), nullable=False, server_default="SERVICE_ACCOUNT"),
        sa.Column("run_as_user_id", sa.BigInteger(), nullable=True),
        sa.Column("service_account_code", sa.String(64), nullable=True),
        sa.Column("status", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("updated_by", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("pipeline_code", name="uq_connector_pipeline_code"),
    )

    # 5. 流水线执行实例表
    op.create_table(
        "connector_pipeline_execution",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("pipeline_run_id", sa.String(64), nullable=False),
        sa.Column("pipeline_code", sa.String(64), nullable=False),
        sa.Column("trace_id", sa.String(64), nullable=False),
        sa.Column("trigger_type", sa.String(32), nullable=False),
        sa.Column("triggered_by", sa.String(64), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="PENDING"),
        sa.Column("total_steps", sa.Integer(), nullable=True),
        sa.Column("success_steps", sa.Integer(), nullable=True),
        sa.Column("failed_steps", sa.Integer(), nullable=True),
        sa.Column("run_as_type", sa.String(32), nullable=False, server_default="SERVICE_ACCOUNT"),
        sa.Column("run_as_user_id", sa.BigInteger(), nullable=True),
        sa.Column("service_account_code", sa.String(64), nullable=True),
        sa.Column("data_scope_snapshot", sa.JSON(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("context_summary", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("pipeline_run_id", name="uq_pipeline_run_id"),
    )
    op.create_index("ix_pipeline_exec_code", "connector_pipeline_execution", ["pipeline_code"])
    op.create_index("ix_pipeline_exec_status", "connector_pipeline_execution", ["status"])

    # 6. 步骤执行实例表
    op.create_table(
        "connector_pipeline_step_execution",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("step_run_id", sa.String(64), nullable=False),
        sa.Column("pipeline_run_id", sa.String(64), nullable=False),
        sa.Column("step_id", sa.String(64), nullable=False),
        sa.Column("step_type", sa.String(32), nullable=False),
        sa.Column("connector_code", sa.String(64), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="PENDING"),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("input_snapshot", sa.JSON(), nullable=True),
        sa.Column("output_snapshot", sa.JSON(), nullable=True),
        sa.Column("total_items", sa.Integer(), nullable=True),
        sa.Column("success_items", sa.Integer(), nullable=True),
        sa.Column("failed_items", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("step_run_id", name="uq_step_run_id"),
    )
    op.create_index("ix_step_exec_pipeline", "connector_pipeline_step_execution", ["pipeline_run_id"])

    # 7. 循环步骤失败项表
    op.create_table(
        "connector_loop_item_execution",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("trace_id", sa.String(64), nullable=False),
        sa.Column("pipeline_run_id", sa.String(64), nullable=False),
        sa.Column("step_run_id", sa.String(64), nullable=False),
        sa.Column("connector_code", sa.String(64), nullable=False),
        sa.Column("item_key", sa.String(128), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("request_params_masked", sa.JSON(), nullable=True),
        sa.Column("response_summary_masked", sa.JSON(), nullable=True),
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_retryable", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("last_failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_loop_item_trace", "connector_loop_item_execution", ["trace_id"])
    op.create_index("ix_loop_item_step", "connector_loop_item_execution", ["step_run_id"])
    op.create_index("ix_loop_item_key", "connector_loop_item_execution", ["item_key"])

    # 8. 连接器执行日志表
    op.create_table(
        "connector_execution_log",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("trace_id", sa.String(64), nullable=False),
        sa.Column("connector_code", sa.String(64), nullable=True),
        sa.Column("pipeline_code", sa.String(64), nullable=True),
        sa.Column("pipeline_run_id", sa.String(64), nullable=True),
        sa.Column("trigger_type", sa.String(32), nullable=False),
        sa.Column("request_url", sa.String(512), nullable=True),
        sa.Column("request_body_masked", sa.JSON(), nullable=True),
        sa.Column("response_body_masked", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("record_count", sa.Integer(), nullable=True),
        sa.Column("success_count", sa.Integer(), nullable=True),
        sa.Column("failed_count", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("executor", sa.String(64), nullable=False),
        sa.Column("data_source", sa.String(128), nullable=True),
        sa.Column("data_scope", sa.JSON(), nullable=True),
        sa.Column("permission_checked", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("notification_sent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notification_result", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_exec_log_trace", "connector_execution_log", ["trace_id"])
    op.create_index("ix_exec_log_connector", "connector_execution_log", ["connector_code"])
    op.create_index("ix_exec_log_created", "connector_execution_log", ["created_at"])

    # 9. 通知日志表
    op.create_table(
        "connector_notification_log",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("trace_id", sa.String(64), nullable=False),
        sa.Column("connector_code", sa.String(64), nullable=True),
        sa.Column("pipeline_code", sa.String(64), nullable=True),
        sa.Column("pipeline_run_id", sa.String(64), nullable=True),
        sa.Column("message_type", sa.String(32), nullable=False),
        sa.Column("receivers", sa.JSON(), nullable=False),
        sa.Column("template_name", sa.String(64), nullable=False),
        sa.Column("message_content_masked", sa.JSON(), nullable=False),
        sa.Column("send_status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("send_result", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("sent_by", sa.String(64), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dedup_key", sa.String(128), nullable=True),
        sa.UniqueConstraint("dedup_key", name="uq_connector_notification_dedup"),
    )
    op.create_index("ix_notif_log_trace", "connector_notification_log", ["trace_id"])
    op.create_index("ix_notif_log_connector", "connector_notification_log", ["connector_code"])
    op.create_index("ix_notif_log_sent", "connector_notification_log", ["sent_at"])


def downgrade() -> None:
    # 按依赖关系逆序删除
    op.drop_index("ix_notif_log_sent", table_name="connector_notification_log")
    op.drop_index("ix_notif_log_connector", table_name="connector_notification_log")
    op.drop_index("ix_notif_log_trace", table_name="connector_notification_log")
    op.drop_table("connector_notification_log")

    op.drop_index("ix_exec_log_created", table_name="connector_execution_log")
    op.drop_index("ix_exec_log_connector", table_name="connector_execution_log")
    op.drop_index("ix_exec_log_trace", table_name="connector_execution_log")
    op.drop_table("connector_execution_log")

    op.drop_index("ix_loop_item_key", table_name="connector_loop_item_execution")
    op.drop_index("ix_loop_item_step", table_name="connector_loop_item_execution")
    op.drop_index("ix_loop_item_trace", table_name="connector_loop_item_execution")
    op.drop_table("connector_loop_item_execution")

    op.drop_index("ix_step_exec_pipeline", table_name="connector_pipeline_step_execution")
    op.drop_table("connector_pipeline_step_execution")

    op.drop_index("ix_pipeline_exec_status", table_name="connector_pipeline_execution")
    op.drop_index("ix_pipeline_exec_code", table_name="connector_pipeline_execution")
    op.drop_table("connector_pipeline_execution")

    op.drop_table("connector_pipeline_config")
    op.drop_table("connector_config_version")

    op.drop_table("connector_system_config")
    op.drop_table("connector_credentials")
