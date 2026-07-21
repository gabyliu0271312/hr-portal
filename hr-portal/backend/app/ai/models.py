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


class AiControlledAction(Base):
    """Server-issued, one-time action authorization bound to an AI conversation."""

    __tablename__ = "ai_controlled_actions"
    __table_args__ = (
        UniqueConstraint("selection_handle_hash", name="uq_ai_controlled_actions_handle_hash"),
        Index("ix_ai_controlled_actions_conversation_user", "conversation_id", "user_id"),
        Index("ix_ai_controlled_actions_expires_at", "expires_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    capability_id: Mapped[str] = mapped_column(String(64), nullable=False)
    action_type: Mapped[str] = mapped_column(String(128), nullable=False)
    selection_handle_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    action_context: Mapped[dict] = mapped_column(JSON, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AiCapabilityRateLimit(Base):
    """Cross-channel fixed-window counters keyed by user and capability."""

    __tablename__ = "ai_capability_rate_limits"
    __table_args__ = (
        UniqueConstraint("user_id", "capability_id", name="uq_ai_capability_rate_limits_user_capability"),
        Index("ix_ai_capability_rate_limits_window", "window_started_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    capability_id: Mapped[str] = mapped_column(String(64), nullable=False)
    window_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    request_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class AiChannelSession(Base):
    """Generic channel-to-conversation binding; external session keys are hashed."""

    __tablename__ = "ai_channel_sessions"
    __table_args__ = (
        UniqueConstraint("channel", "external_session_hash", name="uq_ai_channel_sessions_channel_external"),
        Index("ix_ai_channel_sessions_user_channel", "user_id", "channel"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    external_session_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    conversation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class AiChannelEvent(Base):
    """Channel-neutral idempotency receipt; event identifiers are hashed."""

    __tablename__ = "ai_channel_events"
    __table_args__ = (
        UniqueConstraint("channel", "event_key_hash", name="uq_ai_channel_events_channel_event"),
        Index("ix_ai_channel_events_received", "received_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    event_key_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="received", server_default="received")
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
