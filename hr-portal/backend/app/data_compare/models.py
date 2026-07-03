from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class AiSkill(Base):
    """AI 技能（数据对比配置）存储。

    本期仅存储 skill_type='data_compare'。
    params 存 CompareSpec JSON — 这是执行核心。
    instruction 存用户原始需求描述 — 仅用于展示和对话种子。
    直接执行路径（从管理页点"运行"）不经过 LLM。
    """

    __tablename__ = "ai_skills"
    __table_args__ = (
        Index("ix_ai_skills_type", "skill_type"),
        Index("ix_ai_skills_status", "status"),
        Index("ix_ai_skills_created_by", "created_by"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    skill_type: Mapped[str] = mapped_column(
        String(32), nullable=False, default="data_compare", server_default="data_compare"
    )
    instruction: Mapped[str] = mapped_column(Text, nullable=False)
    params: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default="{}")
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="draft", server_default="draft"
    )
    source: Mapped[str] = mapped_column(
        String(16), nullable=False, default="chat_save", server_default="chat_save"
    )
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_run_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    run_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class DataCompareTask(Base):
    """Phase 2 — 对比任务（持久化的定期执行配置）。

    是 ai_skills 的"调度层"补充：ai_skills.params 存 CompareSpec JSON，
    data_compare_tasks 存调度元数据（enabled、cron、last_run 状态）。
    通过 skill_id 关联到 ai_skills 获取完整对比配置。
    """

    __tablename__ = "data_compare_tasks"
    __table_args__ = (
        Index("ix_dc_tasks_enabled", "enabled"),
        Index("ix_dc_tasks_created_by", "created_by"),
        Index("ix_dc_tasks_skill", "skill_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    skill_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("ai_skills.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 调度元数据（冗余，方便索引查询）
    compare_type: Mapped[str] = mapped_column(String(32), nullable=False)
    table_a: Mapped[str] = mapped_column(String(64), nullable=False)
    table_b: Mapped[str] = mapped_column(String(64), nullable=False)
    join_keys: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cron_expression: Mapped[str | None] = mapped_column(String(64), nullable=True)
    scheduled_job_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    automation_rule_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    last_diff_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class DataCompareRun(Base):
    """Phase 2 — 对比执行记录。

    每次执行（手动/定时/AI对话）都产生一条记录。
    detail 存差异明细（可能较大），summary 存摘要。
    """

    __tablename__ = "data_compare_runs"
    __table_args__ = (
        Index("ix_dc_runs_task", "task_id"),
        Index("ix_dc_runs_status", "status"),
        Index("ix_dc_runs_started", "started_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("data_compare_tasks.id", ondelete="CASCADE"), nullable=False
    )
    trigger_type: Mapped[str] = mapped_column(
        String(32), nullable=False  # 'manual' | 'scheduled' | 'ai_chat'
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False  # 'success' | 'partial_diff' | 'failed'
    )
    diff_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    execution_sql: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    triggered_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
