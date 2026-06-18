from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class AiProviderConfig(Base):
    __tablename__ = "ai_provider_configs"
    __table_args__ = (
        UniqueConstraint("provider", name="uq_ai_provider_configs_provider"),
        Index("ix_ai_provider_configs_enabled", "is_enabled"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="openai_compatible")
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_fast_json: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model_reasoning: Mapped[str | None] = mapped_column(String(128), nullable=True)
    timeout_seconds: Mapped[int] = mapped_column(BigInteger, nullable=False, default=30, server_default="30")
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    extra_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default="{}")
    created_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class AiConversation(Base):
    """全局 AI 多轮会话状态。承载通用的"进行中能力 + 槽位",与具体能力解耦。"""

    __tablename__ = "ai_conversations"
    __table_args__ = (
        Index("ix_ai_conversations_user_updated", "user_id", "updated_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    channel: Mapped[str] = mapped_column(String(16), nullable=False, default="web", server_default="web")
    # 进行中任务的能力 id;None=无在途任务。调度器据此做能力无关的续接。
    active_capability_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 通用槽位,按 capability_id 分区,如 {"compensation.calculate_preview": {...}}
    state: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

