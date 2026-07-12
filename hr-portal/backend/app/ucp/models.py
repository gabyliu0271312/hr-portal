"""UCP 数据模型定义

表：
  - ucp_credentials         凭证加密存储
  - ucp_system              业务系统
  - ucp_system_config       系统配置
  - ucp_resource            数据资源
  - ucp_config_version      配置版本历史
  - ucp_pipeline_config     流水线配置
  - ucp_pipeline_execution  流水线执行实例
  - ucp_pipeline_step_execution  步骤执行实例
  - ucp_loop_item_execution 循环步骤项
  - ucp_execution_log       执行日志
  - ucp_notification_log    通知日志
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


# ===== 凭证表 =====

class UcpCredential(Base):
    """凭证加密存储。

    凭证与系统配置解耦：配置只保存 credential_id 引用，
    凭证本身加密存储，支持轮换和审计。
    """
    __tablename__ = "ucp_credentials"
    __table_args__ = (
        UniqueConstraint("credential_code", name="uq_ucp_credential_code"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    credential_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    credential_name: Mapped[str] = mapped_column(String(128), nullable=False)
    # Phase 4: 凭证强绑业务系统。1 system 可挂 N credential(多环境/轮换)
    system_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("ucp_system.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    # 用途标签: prod / staging / dev / backup 等, 仅辅助展示
    env_tag: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # 是否为该系统下的"激活凭证"(同一 system 同一时间只有一个激活)
    is_primary: Mapped[bool] = mapped_column(Integer, nullable=False, default=1)
    # 加密后的凭证内容，格式：{"app_key": "encrypted...", "app_secret": "encrypted...", ...}
    secrets_encrypted: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # 凭证类型标识，如 beisen / feishu / http_bearer 等
    auth_type: Mapped[str] = mapped_column(String(32), nullable=False, default="custom")
    # 凭证是否可用
    is_active: Mapped[bool] = mapped_column(Integer, nullable=False, default=1)  # 1=active, 0=inactive
    # Phase 4: 凭证过期管理
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    remind_before_days: Mapped[int | None] = mapped_column(Integer, nullable=True, default=7)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_verified_status: Mapped[str | None] = mapped_column(String(16), nullable=True)

    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# ===== 系统配置表 =====

class UcpSystemConfig(Base):
    """系统配置。

    一个系统 = 连接到特定外部系统或数据动作的配置单元。
    Phase 1A 先以固定配置 + DB 配置落地，后续迁移到配置中心 UI。
    """
    __tablename__ = "ucp_system_config"
    __table_args__ = (
        UniqueConstraint("system_code", name="uq_ucp_system_code"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    system_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    system_name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 系统类型：PULL / PUSH / FILE / BRIDGE / REPORT
    adapter_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # 数据方向：INBOUND / OUTBOUND / BI_DIRECTIONAL
    direction: Mapped[str] = mapped_column(String(32), nullable=False, default="INBOUND")

    # 适配器编码，如 BEISEN_REPORT_ADAPTER / FEISHU_OFFER_ADAPTER
    adapter_code: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # 协议配置（URL、参数模板等）
    protocol: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 凭证引用（关联 ucp_credentials.id）
    credential_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("ucp_credentials.id", ondelete="SET NULL"), nullable=True
    )
    # 报表相关配置（北森 Report ID 等）
    report_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 调度配置（cron、timezone）
    scheduling: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 字段映射配置
    mapping_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 文件导入配置（Phase 2）
    file_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 重试配置
    retry_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 熔断配置（Phase 2）
    circuit_breaker_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 通知策略配置
    notification_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 测试配置（限流/超时/最大行数，Phase 2-1）
    test_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # 测试状态
    test_status: Mapped[str] = mapped_column(String(32), nullable=False, default="NOT_TESTED")
    test_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    test_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # 负责人
    owner: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # 执行主体配置
    run_as_type: Mapped[str] = mapped_column(String(32), nullable=False, default="SERVICE_ACCOUNT")
    run_as_user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    service_account_code: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # 启停状态：0=未启用, 1=启用, 2=停用
    status: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 配置版本号
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# ===== 配置版本表 =====

class UcpConfigVersion(Base):
    """配置版本历史。

    每次配置变更时记录完整快照，支持回滚和审计。
    """
    __tablename__ = "ucp_config_version"
    __table_args__ = (
        UniqueConstraint("resource_code", "version", name="uq_ucp_config_version"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    resource_code: Mapped[str] = mapped_column(String(64), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    config_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    change_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    changed_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ===== 流水线配置表 =====

class UcpPipelineConfig(Base):
    """流水线配置。

    流水线由多个步骤组成，用于编排跨系统多步骤任务。
    Phase 1A 聚焦 Offer 两步同步流水线。
    """
    __tablename__ = "ucp_pipeline_config"
    __table_args__ = (
        UniqueConstraint("pipeline_code", name="uq_ucp_pipeline_code"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    pipeline_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    pipeline_name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 步骤定义 JSON 数组
    steps: Mapped[list] = mapped_column(JSON, nullable=False)

    # 触发类型：SCHEDULED / MANUAL / EVENT
    trigger_type: Mapped[str] = mapped_column(String(32), nullable=False, default="SCHEDULED")
    trigger_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # 错误处理策略：STOP_ON_ERROR / CONTINUE_ON_ERROR / RETRY_ON_ERROR
    error_handling: Mapped[str] = mapped_column(String(32), nullable=False, default="STOP_ON_ERROR")

    # 流水线级通知配置
    notification_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # 执行主体配置
    run_as_type: Mapped[str] = mapped_column(String(32), nullable=False, default="SERVICE_ACCOUNT")
    run_as_user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    service_account_code: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # 启停状态：0=未启用, 1=启用, 2=停用
    status: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# ===== 流水线执行实例表 =====

class UcpPipelineExecution(Base):
    """流水线执行实例。

    每次流水线运行创建一行，记录整体状态、统计和上下文摘要。
    """
    __tablename__ = "ucp_pipeline_execution"
    __table_args__ = (
        UniqueConstraint("pipeline_run_id", name="uq_pipeline_run_id"),
        Index("ix_pipeline_exec_code", "pipeline_code"),
        Index("ix_pipeline_exec_status", "status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    pipeline_run_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    pipeline_code: Mapped[str] = mapped_column(String(64), nullable=False)
    trace_id: Mapped[str] = mapped_column(String(64), nullable=False)

    # 触发信息
    trigger_type: Mapped[str] = mapped_column(String(32), nullable=False)
    triggered_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Phase 5-3: 监控按 system/resource 过滤
    system_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    resource_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("ucp_resource.id", ondelete="SET NULL"), nullable=True
    )

    # 执行状态：PENDING / RUNNING / SUCCESS / PARTIAL_SUCCESS / FAILED / CANCELLED / TIMEOUT
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="PENDING")

    # 步骤统计
    total_steps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    success_steps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    failed_steps: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # 执行主体信息
    run_as_type: Mapped[str] = mapped_column(String(32), nullable=False, default="SERVICE_ACCOUNT")
    run_as_user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    service_account_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    data_scope_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # 时间信息
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Context 摘要（不含敏感明细，不含大体积数据）
    context_summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ===== 步骤执行实例表 =====

class UcpPipelineStepExecution(Base):
    """流水线步骤执行实例。

    每个步骤运行创建一行，记录步骤级状态、输入输出摘要、错误信息。
    """
    __tablename__ = "ucp_pipeline_step_execution"
    __table_args__ = (
        UniqueConstraint("step_run_id", name="uq_step_run_id"),
        Index("ix_step_exec_pipeline", "pipeline_run_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    step_run_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    pipeline_run_id: Mapped[str] = mapped_column(String(64), nullable=False)
    step_id: Mapped[str] = mapped_column(String(64), nullable=False)

    # 步骤类型：RESOURCE / LOOP_RESOURCE / TRANSFORM / NOTIFY
    step_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # 关联的资源（RESOURCE / LOOP_RESOURCE 步骤才有）
    resource_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("ucp_resource.id", ondelete="SET NULL"), nullable=True, index=True
    )
    resource_code: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # 执行状态
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="PENDING")
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # 输入输出摘要（脱敏后）
    input_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    output_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # 步骤统计（CONNECTOR_LOOP 步骤使用）
    total_items: Mapped[int | None] = mapped_column(Integer, nullable=True)
    success_items: Mapped[int | None] = mapped_column(Integer, nullable=True)
    failed_items: Mapped[int | None] = mapped_column(Integer, nullable=True)

    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ===== 循环步骤失败项表 =====

class UcpLoopItemExecution(Base):
    """CONNECTOR_LOOP 中 item 级失败记录。

    支持部分成功、失败项定位和后续重跑。
    """
    __tablename__ = "ucp_loop_item_execution"
    __table_args__ = (
        Index("ix_loop_item_trace", "trace_id"),
        Index("ix_loop_item_step", "step_run_id"),
        Index("ix_loop_item_key", "item_key"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    trace_id: Mapped[str] = mapped_column(String(64), nullable=False)
    pipeline_run_id: Mapped[str] = mapped_column(String(64), nullable=False)
    step_run_id: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_code: Mapped[str] = mapped_column(String(64), nullable=False)

    # 失败项业务主键，如 application_id
    item_key: Mapped[str] = mapped_column(String(128), nullable=False)

    # 执行状态：SUCCESS / FAILED / OFFER_NOT_FOUND / NOT_IN_SOURCE
    status: Mapped[str] = mapped_column(String(32), nullable=False)

    # 脱敏后的请求/响应摘要
    request_params_masked: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    response_summary_masked: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 是否允许失败项重跑
    is_retryable: Mapped[int] = mapped_column(Integer, nullable=False, default=1)  # 1=yes, 0=no
    last_failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ===== 资源数据快照表 =====

class UcpResourceSnapshot(Base):
    """资源执行数据快照（Phase 7 正式能力）。

    流水线 RESOURCE 步骤执行成功后，将脱敏后的治理用数据写入此表。
    Diff / Quality 从此表读取最近一次成功快照进行比对/校验。
    """
    __tablename__ = "ucp_resource_snapshot"
    __table_args__ = (
        Index("ix_snap_resource", "resource_id"),
        Index("ix_snap_pipeline", "pipeline_run_id"),
        Index("ix_snap_created", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    resource_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ucp_resource.id", ondelete="SET NULL"), nullable=True, index=True
    )
    pipeline_run_id: Mapped[str] = mapped_column(String(64), nullable=False)
    step_run_id: Mapped[str] = mapped_column(String(64), nullable=False)
    snapshot_code: Mapped[str] = mapped_column(String(128), nullable=False)

    # 统计数据
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    success_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # 字段结构
    schema_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # 脱敏后的治理用数据（白名单字段，敏感字段已脱敏）
    data_json: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # 存储类型和外部引用
    storage_type: Mapped[str] = mapped_column(String(32), nullable=False, default="DB")
    storage_uri: Mapped[str | None] = mapped_column(String(512), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ===== 系统执行日志表 =====

class UcpExecutionLog(Base):
    """系统执行日志。

    记录每次系统执行（独立执行或流水线步骤）的详细信息。
    """
    __tablename__ = "ucp_execution_log"
    __table_args__ = (
        Index("ix_exec_log_trace", "trace_id"),
        Index("ix_exec_log_resource", "resource_code"),
        Index("ix_exec_log_created", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    trace_id: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pipeline_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pipeline_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    trigger_type: Mapped[str] = mapped_column(String(32), nullable=False)

    # 脱敏后的请求/响应
    request_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    request_body_masked: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    response_body_masked: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # 执行状态
    status: Mapped[str] = mapped_column(String(32), nullable=False)

    # 统计
    record_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    success_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    failed_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # 执行主体
    executor: Mapped[str] = mapped_column(String(64), nullable=False)

    # 数据源和数据范围
    data_source: Mapped[str | None] = mapped_column(String(128), nullable=True)
    data_scope: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # 权限校验标记
    permission_checked: Mapped[int] = mapped_column(Integer, nullable=False, default=1)  # 1=yes

    # 通知发送标记
    notification_sent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # 0=no
    notification_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ===== 通知日志表 =====

class UcpNotificationLog(Base):
    """UCP 通知日志。

    记录流水线级和系统级通知发送的完整信息，支持去重查询。
    """
    __tablename__ = "ucp_notification_log"
    __table_args__ = (
        UniqueConstraint("dedup_key", name="uq_ucp_notification_dedup"),
        Index("ix_notif_log_trace", "trace_id"),
        Index("ix_notif_log_resource", "resource_code"),
        Index("ix_notif_log_sent", "sent_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    trace_id: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pipeline_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pipeline_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # 通知类型：feishu / email / both
    message_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # 接收人列表 JSON
    receivers: Mapped[list] = mapped_column(JSON, nullable=False)
    # 通知模板名称
    template_name: Mapped[str] = mapped_column(String(64), nullable=False)
    # 脱敏后的消息内容
    message_content_masked: Mapped[dict] = mapped_column(JSON, nullable=False)

    # 发送状态：pending / success / failed / partial_success / skipped / dedup_skipped
    send_status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    send_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    sent_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # 去重键：trace_id + template + receivers 的组合哈希
    dedup_key: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True)


# ===== Phase 2-1：系统测试日志表 =====

class UcpTestLog(Base):
    """UCP 系统测试日志（Phase 2-1 测试引擎）。

    记录每次测试的完整结果：测试类型、输入/输出/状态/错误信息，用于审计和趋势分析。

    测试类型 (test_type)：
      - AUTH：认证测试（验证凭证有效性）
      - CONNECTIVITY：连通性测试（验证目标接口可访问）
      - PREVIEW：预览测试（拉取少量样本数据但不写入）
      - PUSH_SIMULATION：推送模拟（模拟推送不真落地）

    测试状态 (status)：
      - PASSED：通过
      - FAILED：失败
      - WARNING：通过但有警告
    """
    __tablename__ = "ucp_test_log"
    __table_args__ = (
        Index("ix_test_log_resource_code", "resource_code"),
        Index("ix_test_log_created_at", "created_at"),
        Index("ix_test_log_resource_type", "resource_code", "test_type"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    # 关联系统配置
    system_config_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    resource_code: Mapped[str] = mapped_column(String(64), nullable=False)

    # 测试类型 / 状态
    test_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)

    # 测试耗时（毫秒）
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # 输入参数（脱敏后）
    request_params_masked: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # 测试结果数据（脱敏后，最多 50 行样本）
    response_sample: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # 错误码 / 错误信息
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 测试人
    tested_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ===== Phase 2-10：通知模板表 =====

class UcpNotificationTemplate(Base):
    """UCP 通知模板 (Phase 2-10)。

    用于在流水线/系统执行结果通知中复用模板，支持：
      - 标题/正文模板（变量占位符 {{var}}）
      - 接收人规则
      - 触发场景（on_success / on_failure / on_partial_success / on_circuit_open）
      - 变量说明（前端预览渲染时用）
    """
    __tablename__ = "ucp_notification_template"
    __table_args__ = (
        UniqueConstraint("template_code", name="uq_ucp_template_code"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    template_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    template_name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 触发场景：on_success / on_failure / on_partial_success / on_circuit_open
    trigger_scene: Mapped[str] = mapped_column(String(32), nullable=False, default="on_success")
    # 通知渠道：feishu / email
    channel: Mapped[str] = mapped_column(String(32), nullable=False, default="feishu")
    # 消息格式：markdown / text
    message_format: Mapped[str] = mapped_column(String(16), nullable=False, default="markdown")

    # 标题模板（{{var}} 变量占位）
    title_template: Mapped[str] = mapped_column(String(255), nullable=False)
    # 正文模板
    content_template: Mapped[str] = mapped_column(Text, nullable=False)
    # 接收人规则（与 notification_config.receivers 同构）
    receivers: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # 变量说明（key → 描述，用于前端预览面板展示）
    variable_schema: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # 是否启用
    is_active: Mapped[bool] = mapped_column(Integer, nullable=False, default=1)

    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )



# ============================================================
# Phase 3-1: 事件总线（Event Bus）
# ============================================================


class UcpEvent(Base):
    """事件总线主表：所有外部系统推送 / 内部触发的事件统一落库后派发。

    状态机：RECEIVED → MATCHED → DISPATCHED → COMPLETED / FAILED
    重试阶段会从 FAILED 回退到 RECEIVED（Phase 3-3 实现）。
    """

    __tablename__ = "ucp_event"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # 外部事件 ID（用于去重）
    event_id: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    trigger: Mapped[str] = mapped_column(String(16), nullable=False, default="REALTIME")
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    # 状态
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="RECEIVED")
    trace_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    matched_trigger_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    matched_trigger_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pipeline_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 重试 / 错误
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 时间
    event_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Phase 5-3: 事件按 system/resource 维度, 便于监控按资源过滤
    system_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resource_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("ucp_resource.id", ondelete="SET NULL"), nullable=True
    )


class UcpEventTrigger(Base):
    """事件触发器：监听特定 event_type，命中后异步执行指定 pipeline。

    主要用于：
    1) 飞书事件订阅 (webhook 入口由 webhook_path 区分)
    2) 内部事件总线派发 (event_type + source 匹配)
    """

    __tablename__ = "ucp_event_trigger"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    trigger_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    trigger_name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 匹配规则
    event_source: Mapped[str] = mapped_column(String(32), nullable=False)
    # Phase 5-2: 触发器按数据资源粒度订阅
    # - source_resource_id: 监听某个 UcpResource 的事件 (强绑 system)
    # - source_system_code: 监听某个 UcpSystem 的所有资源 (系统级粗粒度, 与 event_source 配合)
    # - 两者都为空 = 跨系统全局匹配 (与旧 event_source 等价)
    source_resource_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("ucp_resource.id", ondelete="SET NULL"), nullable=True
    )
    source_system_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    event_types: Mapped[str] = mapped_column(String(512), nullable=False)  # 逗号分隔
    pipeline_code: Mapped[str] = mapped_column(String(64), nullable=False)
    filter_rule: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 签名校验
    signing_secret: Mapped[str | None] = mapped_column(String(256), nullable=True)
    signature_header: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default="X-Signature"
    )
    # 飞书专属
    feishu_verification_token: Mapped[str | None] = mapped_column(String(256), nullable=True)
    feishu_encrypt_key: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # 执行主体
    run_as_type: Mapped[str] = mapped_column(String(32), nullable=False, default="SERVICE_ACCOUNT")
    service_account_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # Webhook 路径（外部系统推送入口）
    webhook_path: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True)
    # 审计
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# ============================================================
# Phase 3-3: 事件可靠性（重试 / 死信 / 重放）
# ============================================================


class UcpEventDelivery(Base):
    """事件派发尝试记录：每次执行 pipeline 留痕，支持重试与死信。

    状态机: PENDING → SUCCESS / FAILED → (next_retry_at 触发) → PENDING → ...
            最终: FAILED 超过最大次数 → DEAD_LETTER
            手动: REPLAY → PENDING
    """

    __tablename__ = "ucp_event_delivery"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    event_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    event_uuid: Mapped[str] = mapped_column(String(128), nullable=False)
    trigger_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    trigger_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pipeline_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # 状态
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 重试
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 触发来源
    trigger_source: Mapped[str] = mapped_column(String(16), nullable=False, default="AUTO")
    triggered_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 时间
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# ============================================================
# Phase 3-4: 外部账号流水线（滴滴/曹操/钉钉等）
# ============================================================


class ExternalAccount(Base):
    """外部系统账号表：员工 ↔ 外部系统账号的映射与生命周期。

    状态机: PENDING → ACTIVE → DISABLED → ACTIVE / DELETED
            失败: ACTIVE / PENDING → FAILED → PENDING (重试)

    幂等键: (system_code, external_user_id) — 同一员工在同系统的账号唯一
    """

    __tablename__ = "external_account"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # 系统标识
    system_code: Mapped[str] = mapped_column(String(32), nullable=False)
    # 员工信息
    employee_id: Mapped[str] = mapped_column(String(64), nullable=False)
    employee_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    employee_mobile_masked: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # 外部账号
    external_user_id: Mapped[str] = mapped_column(String(128), nullable=False)
    external_account_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 状态
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    last_action: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # 追溯
    last_pipeline_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_event_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 扩展
    extra: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 时间
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("system_code", "external_user_id", name="uq_external_account_system_user"),
        Index("ix_external_account_employee", "system_code", "employee_id"),
        Index("ix_external_account_status", "status"),
    )


class ExternalAccountAudit(Base):
    """外部账号操作审计表：每次操作留痕，支持回滚与合规追溯。"""

    __tablename__ = "external_account_audit"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    account_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    system_code: Mapped[str] = mapped_column(String(32), nullable=False)
    employee_id: Mapped[str] = mapped_column(String(64), nullable=False)
    external_user_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 操作
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    result: Mapped[str] = mapped_column(String(16), nullable=False)
    trigger_source: Mapped[str] = mapped_column(String(16), nullable=False, default="PIPELINE")
    # 关联追溯
    pipeline_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    event_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    approval_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    operator: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 请求/响应（脱敏后）
    request_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    response_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 时间
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_external_account_audit_account", "account_id"),
        Index("ix_external_account_audit_employee", "system_code", "employee_id"),
        Index("ix_external_account_audit_action", "action", "result"),
        Index("ix_external_account_audit_created", "created_at"),
    )


# ============================================================
# Phase 3-5: 高风险动作审批
# ============================================================


# 审批模式
APPROVAL_MODE_SINGLE = "SINGLE"  # 单人审批
APPROVAL_MODE_ANY = "ANY"        # 或签（任一通过）
APPROVAL_MODE_ALL = "ALL"        # 会签（全部通过）

# 二次确认类型
CONFIRMATION_NONE = "NONE"        # 无需二次确认
CONFIRMATION_SIMPLE = "SIMPLE"    # 简单确认（备注即可）
CONFIRMATION_TOKEN = "TOKEN"      # 二次令牌（需输入 token）

# 请求状态
REQUEST_STATUS_PENDING = "PENDING"
REQUEST_STATUS_APPROVED = "APPROVED"
REQUEST_STATUS_REJECTED = "REJECTED"
REQUEST_STATUS_CANCELLED = "CANCELLED"
REQUEST_STATUS_EXPIRED = "EXPIRED"

# 步骤状态
STEP_STATUS_PENDING = "PENDING"
STEP_STATUS_APPROVED = "APPROVED"
STEP_STATUS_REJECTED = "REJECTED"
STEP_STATUS_SKIPPED = "SKIPPED"

# 操作类型
ACTION_SUBMIT = "SUBMIT"
ACTION_APPROVE = "APPROVE"
ACTION_REJECT = "REJECT"
ACTION_TRANSFER = "TRANSFER"
ACTION_WITHDRAW = "WITHDRAW"
ACTION_EXPIRE = "EXPIRE"
ACTION_EXECUTE = "EXECUTE"

# 业务类型
BUSINESS_EXTERNAL_ACCOUNT_DELETE = "EXTERNAL_ACCOUNT_DELETE"
BUSINESS_EXTERNAL_ACCOUNT_DISABLE = "EXTERNAL_ACCOUNT_DISABLE"
BUSINESS_OA_ORG_DELETE = "OA_ORG_DELETE"
BUSINESS_OA_ORG_MOVE = "OA_ORG_MOVE"


class ApprovalRequest(Base):
    """审批请求主表。

    状态机: PENDING → APPROVED / REJECTED / CANCELLED / EXPIRED
    集成: 审批通过后可触发实际的 adapter 动作
    """

    __tablename__ = "approval_request"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    request_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    # 业务
    business_type: Mapped[str] = mapped_column(String(64), nullable=False)
    business_key: Mapped[str] = mapped_column(String(128), nullable=False)
    business_summary: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 动作
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    action_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 审批配置
    approval_mode: Mapped[str] = mapped_column(String(16), nullable=False, default=APPROVAL_MODE_SINGLE)
    confirmation_type: Mapped[str] = mapped_column(String(16), nullable=False, default=CONFIRMATION_NONE)
    confirmation_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 审批人 (JSON list)
    approvers: Mapped[dict] = mapped_column(JSON, nullable=False)
    # 状态
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=REQUEST_STATUS_PENDING)
    current_step: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_steps: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    approved_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rejected_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 触发
    trigger_source: Mapped[str] = mapped_column(String(16), nullable=False, default="MANUAL")
    triggered_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pipeline_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    event_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 执行
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    execution_result: Mapped[str | None] = mapped_column(String(16), nullable=True)
    execution_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 过期
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    remind_before_days: Mapped[int | None] = mapped_column(Integer, nullable=True, default=7)  # Phase 4: 到期前 N 天提醒
    # 备注
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 时间
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_approval_request_business", "business_type", "business_key"),
        Index("ix_approval_request_status", "status"),
        Index("ix_approval_request_triggered", "triggered_by"),
        Index("ix_approval_request_pipeline", "pipeline_run_id"),
    )


class ApprovalStep(Base):
    """审批步骤：每个审批人一条记录。"""

    __tablename__ = "approval_step"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    request_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    step_index: Mapped[int] = mapped_column(Integer, nullable=False)
    # 审批人
    approver_id: Mapped[str] = mapped_column(String(64), nullable=False)
    approver_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 状态
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=STEP_STATUS_PENDING)
    action_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 转交
    transferred_to: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 时间
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_approval_step_request", "request_id"),
        Index("ix_approval_step_approver", "approver_id", "status"),
    )


class ApprovalAction(Base):
    """审批操作日志：每个动作留痕（提交/同意/拒绝/转交/撤回/过期/执行）。"""

    __tablename__ = "approval_action"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    request_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    step_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    operator_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    operator_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_approval_action_request", "request_id"),
        Index("ix_approval_action_created", "created_at"),
    )


# ============================================================
# Phase 3-6: OA 组织架构同步
# ============================================================


# diff 类型
DIFF_CREATED = "CREATED"          # 新增（源系统有, 目标系统无）
DIFF_UPDATED = "UPDATED"          # 更新（字段变化）
DIFF_DELETED = "DELETED"          # 删除（源系统无, 目标系统有）
DIFF_MOVED = "MOVED"              # 移动（parent_org_code 变化）
DIFF_UNCHANGED = "UNCHANGED"      # 无变化

# 处理状态
PROCESS_PENDING = "PENDING"
PROCESS_SYNCING = "SYNCING"
PROCESS_SYNCED = "SYNCED"
PROCESS_FAILED = "FAILED"
PROCESS_SKIPPED = "SKIPPED"
PROCESS_APPROVAL_PENDING = "APPROVAL_PENDING"

# 同步触发类型
TRIGGER_SCHEDULED = "SCHEDULED"
TRIGGER_EVENT = "EVENT"
TRIGGER_MANUAL = "MANUAL"


class OaSyncRun(Base):
    """OA 同步批次运行历史。"""

    __tablename__ = "oa_sync_run"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    run_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    trigger_type: Mapped[str] = mapped_column(String(16), nullable=False, default=TRIGGER_SCHEDULED)
    source_system: Mapped[str] = mapped_column(String(32), nullable=False, default="BEISEN")
    target_system: Mapped[str] = mapped_column(String(32), nullable=False, default="OA")
    # 状态
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=PROCESS_PENDING)
    # 统计
    total_orgs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    moved_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    deleted_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unchanged_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    approval_pending_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 错误
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 触发
    triggered_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    event_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    pipeline_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 时间
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_oa_sync_run_status", "status"),
        Index("ix_oa_sync_run_created", "created_at"),
    )


class OaSyncRecord(Base):
    """OA 同步组织节点记录：每条记录一个组织节点在某次同步中的差异。"""

    __tablename__ = "oa_sync_record"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    run_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # 组织
    org_code: Mapped[str] = mapped_column(String(64), nullable=False)
    org_name: Mapped[str] = mapped_column(String(128), nullable=False)
    parent_org_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 源
    source_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    source_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # 目标
    target_org_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    target_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # 差异
    diff_type: Mapped[str] = mapped_column(String(16), nullable=False)
    diff_detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 处理
    process_status: Mapped[str] = mapped_column(String(16), nullable=False, default=PROCESS_PENDING)
    process_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    approval_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 时间
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_oa_sync_record_run", "run_id"),
        Index("ix_oa_sync_record_org", "org_code"),
        Index("ix_oa_sync_record_diff", "diff_type", "process_status"),
    )


# ===== Phase 3-7: 适配器注册 =====


class AdapterDefinition(Base):
    """业务方自助注册的 adapter 元数据。

    注: 本机制只管理 metadata (类型/schema/样例), 实际 adapter 代码仍由后端维护。
    """

    __tablename__ = "adapter_definition"
    __table_args__ = (
        Index("ix_adapter_definition_type", "adapter_type"),
        Index("ix_adapter_definition_active", "is_active"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # 业务 code (大写+下划线), 全局唯一
    adapter_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    # 类型: HTTP / DB / FILE / EVENT / TRANSFORM / CUSTOM
    adapter_type: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 字段定义 (简化 JSON Schema)
    schema_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    sample_payload: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    version: Mapped[str] = mapped_column(String(32), nullable=False, default="1.0.0")
    # 是否启用 (默认 False, 需审核)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False, default="system")
    # 时间
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# ===== Phase 4: 接入系统模型重构 =====


class UcpSystem(Base):
    """业务系统（逻辑分组）。

    与 UcpResource 1:N 关系。
    一个 UcpSystem 代表一个外部业务系统（北森/飞书/滴滴等），
    不再承担数据资源（表/API）的职责——这一职责下放到 UcpResource。
    """

    __tablename__ = "ucp_system"
    __table_args__ = (
        UniqueConstraint("system_code", name="uq_ucp_system_code_v2"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    system_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    system_name: Mapped[str] = mapped_column(String(128), nullable=False)
    # 系统类型: HR_SAAS / OA / IM / CAR / CUSTOM
    system_type: Mapped[str] = mapped_column(String(32), nullable=False, default="CUSTOM")
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    owner: Mapped[str | None] = mapped_column(String(64), nullable=True)
    domain: Mapped[str | None] = mapped_column(String(64), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list | None] = mapped_column(JSON, nullable=True)
    sensitivity: Mapped[str | None] = mapped_column(String(16), nullable=True, default="internal")
    is_active: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)

    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True, default="system")
    updated_by: Mapped[str | None] = mapped_column(String(64), nullable=True, default="system")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class UcpResource(Base):
    """数据资源（一张表/一个 API）。

    - system_id  → 所属 UcpSystem
    - credential_id → 引用 UcpCredential（N 个 resource 可共享 1 个凭证）
    - adapter_code → 1 个 resource 绑 1 个 adapter
    - 粒度 = 一张数据表/一个外部 API
    """

    __tablename__ = "ucp_resource"
    __table_args__ = (
        UniqueConstraint("system_id", "resource_code", name="uq_ucp_resource_system_code"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    system_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ucp_system.id", ondelete="CASCADE"), nullable=False
    )
    resource_code: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_name: Mapped[str] = mapped_column(String(128), nullable=False)
    # 1 resource 绑 1 adapter
    adapter_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 凭证引用（与系统解耦，N resource : 1 credential）
    credential_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("ucp_credentials.id", ondelete="SET NULL"), nullable=True
    )
    # 协议 / 报表 / 字段映射 / 文件 / 调度 / 通知 / 重试 / 熔断
    protocol: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    report_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    mapping_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    file_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    scheduling: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    notification_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    retry_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    circuit_breaker_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    test_status: Mapped[str] = mapped_column(String(32), nullable=False, default="NOT_TESTED")
    test_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    test_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    status: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)

    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True, default="system")
    updated_by: Mapped[str | None] = mapped_column(String(64), nullable=True, default="system")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# ===== Phase 3-8: 流水线模板与版本快照 =====


class UcpPipelineTemplate(Base):
    """可视化编排的 pipeline 模板."""

    __tablename__ = "ucp_pipeline_template"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    template_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    nodes_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    edges_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    version: Mapped[str] = mapped_column(String(32), nullable=False, default="1.0.0")
    created_by: Mapped[str] = mapped_column(String(64), nullable=False, default="system")
    # 时间
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class UcpPipelineTemplateVersion(Base):
    """模板版本快照 (append-only)."""

    __tablename__ = "ucp_pipeline_template_version"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    template_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("ucp_pipeline_template.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    nodes_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    edges_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    change_note: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False, default="system")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("template_id", "version", name="uq_tpl_version"),
        Index("ix_pipeline_template_version_tpl", "template_id"),
    )


# ===== Phase 4: 告警规则与告警记录 =====

class UcpAlertRule(Base):
    """告警规则配置。

    用户可配置失败率、连续失败、耗时、死信数量等阈值。
    """
    __tablename__ = "ucp_alert_rule"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    rule_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    rule_name: Mapped[str] = mapped_column(String(128), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(32), nullable=False)  # FAIL_RATE / CONSECUTIVE_FAIL / DURATION / DEAD_LETTER_COUNT
    threshold_value: Mapped[float] = mapped_column(nullable=False, default=0)
    threshold_unit: Mapped[str | None] = mapped_column(String(16), nullable=True)  # percent / count / ms
    target_filter: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {system_id, resource_id, pipeline_code}
    is_active: Mapped[bool] = mapped_column(Integer, nullable=False, default=1)
    notify_channels: Mapped[str | None] = mapped_column(String(64), nullable=True)  # feishu,email
    notify_receivers: Mapped[list | None] = mapped_column(JSON, nullable=True)
    cooldown_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class UcpAlertLog(Base):
    """告警触发记录。

    记录每次告警触发的时间、内容、通知状态。
    """
    __tablename__ = "ucp_alert_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    rule_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("ucp_alert_rule.id", ondelete="SET NULL"), nullable=True
    )
    rule_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    alert_level: Mapped[str] = mapped_column(String(16), nullable=False, default="WARN")  # CRITICAL / WARN / INFO
    alert_type: Mapped[str] = mapped_column(String(32), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    ref_id: Mapped[str | None] = mapped_column(String(128), nullable=True)  # pipeline_run_id / system_code
    current_value: Mapped[float | None] = mapped_column(nullable=True)
    threshold_value: Mapped[float | None] = mapped_column(nullable=True)
    notify_status: Mapped[str | None] = mapped_column(String(16), nullable=True)  # PENDING / SENT / FAILED
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_ucp_alert_log_rule", "rule_id"),
        Index("ix_ucp_alert_log_created", "created_at"),
    )


# ============================================================
# Phase 5: 通用 API 配置化能力
# ============================================================


class UcpApiTemplate(Base):
    """API 资源模板库（Phase 5-E）。

    可保存、复制、导入、导出的 API 资源配置模板。
    每个模板包含完整的 REST API 配置（method, url, headers, body, 分页, 映射等）。
    """

    __tablename__ = "ucp_api_template"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    template_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    template_name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 分类标签: HR / FINANCE / OA / CUSTOM
    category: Mapped[str | None] = mapped_column(String(32), nullable=True, default="CUSTOM")
    # 目标系统类型
    system_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # API 基础配置
    method: Mapped[str] = mapped_column(String(16), nullable=False, default="GET")
    base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(64), nullable=True, default="application/json")
    timeout_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True, default=30)
    # Headers 配置 JSON [{key, value, type: static|credential|variable}]
    headers_config: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Query 参数配置 JSON [{key, value, required, default, type}]
    query_config: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Body 模板 (支持变量占位符 {{var}})
    body_template: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 认证方式引用: API_KEY / BEARER / BASIC / OAUTH2
    auth_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # 响应提取配置
    data_path: Mapped[str | None] = mapped_column(String(256), nullable=True)  # $.data.items
    total_path: Mapped[str | None] = mapped_column(String(256), nullable=True)  # $.data.total
    next_cursor_path: Mapped[str | None] = mapped_column(String(256), nullable=True)  # $.data.next_cursor
    # 分页策略: PAGE / OFFSET / CURSOR / NONE
    pagination_type: Mapped[str | None] = mapped_column(String(16), nullable=True, default="NONE")
    page_param: Mapped[str | None] = mapped_column(String(32), nullable=True, default="page")
    page_size_param: Mapped[str | None] = mapped_column(String(32), nullable=True, default="pageSize")
    # 限流配置
    rate_limit_qps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rate_limit_concurrency: Mapped[int | None] = mapped_column(Integer, nullable=True)
    retry_max: Mapped[int | None] = mapped_column(Integer, nullable=True, default=3)
    retry_backoff: Mapped[str | None] = mapped_column(String(16), nullable=True, default="exponential")
    # 字段映射 [{source, target, transform}]
    field_mappings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # 错误码映射 {external_code: ucp_code}
    error_code_map: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 样例响应 (脱敏)
    sample_response: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 版本与状态
    version: Mapped[str] = mapped_column(String(32), nullable=False, default="1.0.0")
    is_published: Mapped[bool] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Integer, nullable=False, default=1)
    # 安全: 允许的域名白名单
    allowed_domains: Mapped[list | None] = mapped_column(JSON, nullable=True)
    tags: Mapped[list | None] = mapped_column(JSON, nullable=True)

    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_ucp_api_template_category", "category"),
        Index("ix_ucp_api_template_system", "system_type"),
    )


class UcpApiTemplateVersion(Base):
    """API 模板版本快照（Phase 5-E）。"""

    __tablename__ = "ucp_api_template_version"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    template_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ucp_api_template.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    change_note: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False, default="system")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("template_id", "version", name="uq_api_tpl_version"),
        Index("ix_api_tpl_version_tpl", "template_id"),
    )


# ============================================================
# Phase 6: 集成治理 / iPaaS 能力雏形
# ============================================================


class UcpAssetTag(Base):
    """集成资产标签（Phase 6-A）。

    为系统、资源、流水线、凭证等核心对象打标签。
    """

    __tablename__ = "ucp_asset_tag"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    asset_type: Mapped[str] = mapped_column(String(32), nullable=False)  # system / resource / pipeline / credential
    asset_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tag_key: Mapped[str] = mapped_column(String(64), nullable=False)
    tag_value: Mapped[str] = mapped_column(String(128), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_ucp_asset_tag_asset", "asset_type", "asset_id"),
        Index("ix_ucp_asset_tag_key", "tag_key"),
    )


class UcpSlaConfig(Base):
    """SLA 指标配置（Phase 6-C）。

    为系统/资源/流水线设定成功率、耗时、恢复时间目标。
    """

    __tablename__ = "ucp_sla_config"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    sla_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    sla_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    target_type: Mapped[str] = mapped_column(String(32), nullable=False)  # system / resource / pipeline
    target_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # SLA 目标
    success_rate_target: Mapped[float | None] = mapped_column(nullable=True)  # 0.99 = 99%
    p95_duration_ms_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    p99_duration_ms_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recovery_time_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 窗口
    window_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    is_active: Mapped[bool] = mapped_column(Integer, nullable=False, default=1)

    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_ucp_sla_config_target", "target_type", "target_id"),
    )


class UcpSlaRecord(Base):
    """SLA 达标记录（Phase 6-C）。

    定期计算并记录 SLA 达标情况。
    """

    __tablename__ = "ucp_sla_record"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    sla_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ucp_sla_config.id", ondelete="CASCADE"), nullable=False
    )
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    window_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # 实际指标
    total_executions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    success_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    success_rate: Mapped[float | None] = mapped_column(nullable=True)
    p95_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    p99_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 达标状态
    is_met: Mapped[bool] = mapped_column(Integer, nullable=False, default=0)
    unmet_reasons: Mapped[list | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_ucp_sla_record_sla", "sla_id"),
        Index("ix_ucp_sla_record_window", "window_start"),
    )


class UcpChangeRequest(Base):
    """集成变更单（Phase 6-D）。

    资源、凭证、流水线发布可生成变更单，高风险变更需审批后发布。
    """

    __tablename__ = "ucp_change_request"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    change_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    change_type: Mapped[str] = mapped_column(String(32), nullable=False)  # RESOURCE / CREDENTIAL / PIPELINE / SYSTEM
    change_target_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    change_target_code: Mapped[str] = mapped_column(String(64), nullable=False)
    # 变更内容
    change_summary: Mapped[str | None] = mapped_column(String(255), nullable=True)
    before_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 风险等级: LOW / MEDIUM / HIGH / CRITICAL
    risk_level: Mapped[str] = mapped_column(String(16), nullable=False, default="LOW")
    # 状态: DRAFT / PENDING_APPROVAL / APPROVED / REJECTED / PUBLISHED / ROLLED_BACK
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT")
    # 审批
    approval_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # 发布窗口
    publish_window_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    publish_window_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rolled_back_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 影响分析
    affected_assets: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # 回滚版本
    rollback_version: Mapped[int | None] = mapped_column(Integer, nullable=True)

    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_ucp_change_status", "status"),
        Index("ix_ucp_change_target", "change_type", "change_target_id"),
    )


class UcpGovernanceScore(Base):
    """治理评分（Phase 6-E）。

    按失败率、SLA、告警、凭证风险形成评分。
    """

    __tablename__ = "ucp_governance_score"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    asset_type: Mapped[str] = mapped_column(String(32), nullable=False)  # system / resource / pipeline
    asset_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    asset_code: Mapped[str] = mapped_column(String(64), nullable=False)
    # 评分 (0-100)
    overall_score: Mapped[float | None] = mapped_column(nullable=True)
    reliability_score: Mapped[float | None] = mapped_column(nullable=True)  # 失败率
    performance_score: Mapped[float | None] = mapped_column(nullable=True)  # SLA 达标
    security_score: Mapped[float | None] = mapped_column(nullable=True)  # 凭证风险
    alert_score: Mapped[float | None] = mapped_column(nullable=True)  # 告警状态
    # 详细信息
    score_detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 窗口
    window_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=168)  # 7 天
    calculated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_ucp_gov_score_asset", "asset_type", "asset_id"),
        Index("ix_ucp_gov_score_calc", "calculated_at"),
    )


# ============================================================
# Phase 7: 外部系统主数据治理协同
# ============================================================


# 主数据对象类型
MD_OBJECT_PERSON = "PERSON"
MD_OBJECT_ORG = "ORG"
MD_OBJECT_POSITION = "POSITION"
MD_OBJECT_ACCOUNT = "ACCOUNT"

# 权威来源
SOURCE_AUTHORITATIVE = "AUTHORITATIVE"
SOURCE_REFERENCE = "REFERENCE"
SOURCE_CONSUMER = "CONSUMER"


class UcpMasterDataObject(Base):
    """外部主数据对象目录（Phase 7-A）。

    登记外部系统的主数据对象、字段、权威来源。
    """

    __tablename__ = "ucp_master_data_object"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    object_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    object_name: Mapped[str] = mapped_column(String(128), nullable=False)
    object_type: Mapped[str] = mapped_column(String(32), nullable=False)  # PERSON / ORG / POSITION / ACCOUNT
    system_code: Mapped[str] = mapped_column(String(64), nullable=False)
    system_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 来源类型
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, default=SOURCE_REFERENCE)
    # 负责人
    owner: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 字段定义 JSON [{field_code, field_name, type, sensitivity, is_key}]
    field_definitions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # 同步状态
    sync_status: Mapped[str | None] = mapped_column(String(32), nullable=True, default="NOT_SYNCED")
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    record_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Integer, nullable=False, default=1)

    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_ucp_md_object_system", "system_code"),
        Index("ix_ucp_md_object_type", "object_type"),
    )


class UcpIdMapping(Base):
    """外部 ID 映射（Phase 7-B）。

    维护 HR Portal ID 与外部系统 ID 的多对一/一对多映射。
    """

    __tablename__ = "ucp_id_mapping"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    object_type: Mapped[str] = mapped_column(String(32), nullable=False)  # PERSON / ORG / POSITION / ACCOUNT
    hr_id: Mapped[str] = mapped_column(String(128), nullable=False)
    external_system: Mapped[str] = mapped_column(String(64), nullable=False)
    external_id: Mapped[str] = mapped_column(String(128), nullable=False)
    external_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # 映射关系: ONE_TO_ONE / ONE_TO_MANY / MANY_TO_ONE
    mapping_type: Mapped[str] = mapped_column(String(16), nullable=False, default="ONE_TO_ONE")
    # 冲突状态
    is_conflict: Mapped[bool] = mapped_column(Integer, nullable=False, default=0)
    conflict_reason: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # 状态
    is_active: Mapped[bool] = mapped_column(Integer, nullable=False, default=1)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("object_type", "external_system", "external_id", name="uq_id_mapping_ext"),
        Index("ix_ucp_id_mapping_hr", "object_type", "hr_id"),
        Index("ix_ucp_id_mapping_system", "external_system"),
    )


class UcpIdMappingAudit(Base):
    """ID 映射变更审计（Phase 7-B）。"""

    __tablename__ = "ucp_id_mapping_audit"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    mapping_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    action: Mapped[str] = mapped_column(String(16), nullable=False)  # CREATE / UPDATE / DELETE
    before_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    operator: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_ucp_id_mapping_audit_mapping", "mapping_id"),
        Index("ix_ucp_id_mapping_audit_created", "created_at"),
    )


class UcpDiffJob(Base):
    """差异检测任务（Phase 7-C）。

    绑定源/目标资源，从流水线执行快照中读取真实数据进行比对。
    """

    __tablename__ = "ucp_diff_job"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    job_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    job_name: Mapped[str] = mapped_column(String(128), nullable=False)
    # 数据来源绑定
    source_resource_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    target_resource_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    # 比较配置
    source_system: Mapped[str] = mapped_column(String(64), nullable=False)
    target_system: Mapped[str] = mapped_column(String(64), nullable=False)
    object_type: Mapped[str] = mapped_column(String(32), nullable=False)
    compare_fields: Mapped[list | None] = mapped_column(JSON, nullable=True)
    key_field: Mapped[str] = mapped_column(String(64), nullable=False, default="id")
    # 调度
    cron_expression: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_scheduled: Mapped[bool] = mapped_column(Integer, nullable=False, default=0)
    # 状态
    is_active: Mapped[bool] = mapped_column(Integer, nullable=False, default=1)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_run_status: Mapped[str | None] = mapped_column(String(32), nullable=True)

    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_ucp_diff_job_source", "source_system", "target_system"),
    )


class UcpDiffRecord(Base):
    """差异记录（Phase 7-C）。

    每次差异检测的详细结果。
    """

    __tablename__ = "ucp_diff_record"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ucp_diff_job.id", ondelete="CASCADE"), nullable=False
    )
    run_code: Mapped[str] = mapped_column(String(64), nullable=False)
    # 对象标识
    object_key: Mapped[str] = mapped_column(String(128), nullable=False)
    object_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # 差异类型: MISSING / EXTRA / FIELD_MISMATCH / MAPPING_ERROR
    diff_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # 字段级差异 {field: {source_value, target_value}}
    diff_detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 处理状态
    process_status: Mapped[str] = mapped_column(String(32), nullable=False, default="PENDING")
    suggested_action: Mapped[str | None] = mapped_column(String(32), nullable=True)

    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_ucp_diff_record_job", "job_id"),
        Index("ix_ucp_diff_record_run", "run_code"),
        Index("ix_ucp_diff_record_diff", "diff_type", "process_status"),
    )


class UcpQualityRule(Base):
    """数据质量规则（Phase 7-D）。

    绑定数据资源，从流水线执行快照中读取真实数据进行校验。
    """

    __tablename__ = "ucp_quality_rule"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    rule_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    rule_name: Mapped[str] = mapped_column(String(128), nullable=False)
    # 数据来源
    resource_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    # 作用对象
    object_type: Mapped[str] = mapped_column(String(32), nullable=False)
    system_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    field_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 规则类型: REQUIRED / UNIQUE / FORMAT / ENUM / REFERENCE_INTEGRITY
    rule_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # 规则参数 JSON
    rule_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 严重级别: ERROR / WARN / INFO
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="WARN")
    # 调度
    cron_expression: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Integer, nullable=False, default=1)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_ucp_quality_rule_type", "rule_type"),
        Index("ix_ucp_quality_rule_object", "object_type", "system_code"),
    )


class UcpQualityIssue(Base):
    """质量问题记录（Phase 7-D）。

    质量扫描发现的具体问题。
    """

    __tablename__ = "ucp_quality_issue"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    rule_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ucp_quality_rule.id", ondelete="CASCADE"), nullable=False
    )
    scan_run_code: Mapped[str] = mapped_column(String(64), nullable=False)
    # 问题对象
    object_type: Mapped[str] = mapped_column(String(32), nullable=False)
    object_key: Mapped[str] = mapped_column(String(128), nullable=False)
    system_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    field_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 问题详情
    issue_type: Mapped[str] = mapped_column(String(32), nullable=False)
    current_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_value: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # 状态
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="OPEN")  # OPEN / FIXED / IGNORED
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="WARN")

    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_ucp_quality_issue_rule", "rule_id"),
        Index("ix_ucp_quality_issue_status", "status"),
        Index("ix_ucp_quality_issue_scan", "scan_run_code"),
    )


class UcpConflictRecord(Base):
    """冲突记录（Phase 7-E）。

    记录差异冲突、质量冲突、映射冲突的综合工作台。
    """

    __tablename__ = "ucp_conflict_record"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    conflict_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    # 冲突来源
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)  # DIFF / QUALITY / MAPPING
    source_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # 对象信息
    object_type: Mapped[str] = mapped_column(String(32), nullable=False)
    object_key: Mapped[str] = mapped_column(String(128), nullable=False)
    object_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # 冲突详情
    conflict_type: Mapped[str] = mapped_column(String(32), nullable=False)
    conflict_summary: Mapped[str | None] = mapped_column(String(512), nullable=True)
    conflict_detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 处理策略: HR_PORTAL_WINS / EXTERNAL_WINS / MANUAL_FIX / IGNORE
    resolution_strategy: Mapped[str | None] = mapped_column(String(32), nullable=True)
    resolution_detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 状态: OPEN / IN_PROGRESS / RESOLVED / IGNORED
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="OPEN")
    # 影响范围
    affected_assets: Mapped[list | None] = mapped_column(JSON, nullable=True)  # 受影响流水线/系统

    assigned_to: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_ucp_conflict_source", "source_type", "source_id"),
        Index("ix_ucp_conflict_status", "status"),
        Index("ix_ucp_conflict_object", "object_type", "object_key"),
    )


class UcpGovernanceTask(Base):
    """治理任务（Phase 7-F）。

    把问题分派给负责人并跟踪闭环。
    """

    __tablename__ = "ucp_governance_task"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    task_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    task_name: Mapped[str] = mapped_column(String(256), nullable=False)
    # 任务来源
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)  # DIFF / QUALITY / CONFLICT / MAPPING
    source_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # 任务信息
    object_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    object_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    system_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 状态: TODO / IN_PROGRESS / DONE / OVERDUE / CANCELLED
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="TODO")
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="MEDIUM")  # HIGH / MEDIUM / LOW
    # 分派
    assigned_to: Mapped[str | None] = mapped_column(String(64), nullable=True)
    assigned_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 截止时间
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 验证
    verified_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_ucp_gov_task_status", "status"),
        Index("ix_ucp_gov_task_assignee", "assigned_to"),
        Index("ix_ucp_gov_task_source", "source_type", "source_id"),
    )


class UcpGovernanceReport(Base):
    """治理报表（Phase 7-F）。

    按系统、对象、负责人统计问题和闭环率。
    """

    __tablename__ = "ucp_governance_report"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    report_period: Mapped[str] = mapped_column(String(32), nullable=False)  # 2026-W28 / 2026-07
    # 统计维度
    system_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    object_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    owner: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 指标
    total_issues: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    resolved_issues: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    open_issues: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    overdue_issues: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    closure_rate: Mapped[float | None] = mapped_column(nullable=True)
    avg_resolution_hours: Mapped[float | None] = mapped_column(nullable=True)

    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_ucp_gov_report_period", "report_period"),
        Index("ix_ucp_gov_report_system", "system_code"),
    )
