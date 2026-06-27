"""自动化规则 ORM 模型

automation_rules            — 规则定义
automation_executions       — 规则执行记录
automation_action_executions — 动作执行记录
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Index,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class AutomationRule(Base):
    """自动化规则定义

    source:
      manual       — 用户在前端手动创建
      ai_generated — AI 生成草稿后用户确认保存
      system       — 系统内置

    trigger_type: 触发器类型，如 report_run_success, scheduled_job_success 等
    """
    __tablename__ = "automation_rules"
    __table_args__ = (
        Index("ix_automation_rules_trigger", "trigger_type"),
        Index("ix_automation_rules_enabled", "enabled"),
        Index("ix_automation_rules_biz_type", "biz_type"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    biz_type: Mapped[str | None] = mapped_column(String(64), nullable=True)  # 关联业务类型
    trigger_type: Mapped[str] = mapped_column(String(64), nullable=False)
    trigger_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    condition_config: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # 条件列表
    actions_config: Mapped[list] = mapped_column(JSON, nullable=False, default=list)    # 动作列表

    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    source: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    source_artifact_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    created_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    updated_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class AutomationExecution(Base):
    """规则执行记录 — 每次事件触发规则时产生一条记录"""
    __tablename__ = "automation_executions"
    __table_args__ = (
        Index("ix_automation_executions_rule", "rule_id"),
        Index("ix_automation_executions_status", "status"),
        Index("ix_automation_executions_biz", "biz_type", "biz_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    rule_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    event_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    trigger_type: Mapped[str] = mapped_column(String(64), nullable=False)
    biz_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    biz_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    event_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    status: Mapped[str] = mapped_column(String(32), nullable=False)  # running/success/partial_success/failed
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


class AutomationActionExecution(Base):
    """动作执行记录 — 每条规则执行中每个动作的详细记录"""
    __tablename__ = "automation_action_executions"
    __table_args__ = (
        Index("ix_automation_action_executions_exec", "execution_id"),
        Index("ix_automation_action_executions_status", "status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    execution_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    action_index: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    action_type: Mapped[str] = mapped_column(String(64), nullable=False)

    action_config_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    input_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    output_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    status: Mapped[str] = mapped_column(String(32), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
