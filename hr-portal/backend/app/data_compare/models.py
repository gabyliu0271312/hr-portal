from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, Integer, JSON, String, Text
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
