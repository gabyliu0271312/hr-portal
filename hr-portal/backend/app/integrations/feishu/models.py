"""飞书消息通知日志 ORM 模型

feishu_notification_logs: 统一记录所有飞书通知发送日志，无论来自哪个业务模块。
feishu_chat_targets: 管理员维护的飞书群列表，供接收人配置时选用。
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class FeishuChatTarget(Base):
    """管理员维护的飞书群列表"""
    __tablename__ = "feishu_chat_targets"
    __table_args__ = (
        Index("ix_feishu_chat_targets_active", "is_active"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    chat_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class FeishuNotificationCompletion(Base):
    """飞书通知标记完成记录

    记录用户在飞书消息中点击"标记完成"按钮的行为。
    下次发送同业务通知时，已完成的用户会被自动过滤。
    群聊场景下，已完成的用户不再被 @。
    """
    __tablename__ = "feishu_notification_completions"
    __table_args__ = (
        Index("ix_fnc_notification_user", "notification_log_id", "open_id", unique=True),
        Index("ix_fnc_notification_log", "notification_log_id"),
        Index("ix_fnc_biz", "biz_type", "biz_id"),
        Index("ix_fnc_open_id", "open_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    notification_log_id: Mapped[int] = mapped_column(
        BigInteger, nullable=False, comment="关联的 feishu_notification_logs.id"
    )
    open_id: Mapped[str] = mapped_column(
        String(64), nullable=False, comment="飞书用户 open_id（完成人）"
    )
    display_name: Mapped[str | None] = mapped_column(
        String(128), nullable=True, comment="完成人显示名称"
    )
    biz_type: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="业务类型（冗余）"
    )
    biz_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="业务 ID（冗余）"
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="completed",
        comment="状态: completed / dismissed"
    )
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
        comment="完成时间"
    )
    callback_data: Mapped[dict | None] = mapped_column(
        JSON, nullable=True, comment="飞书回调原始数据（用于审计）"
    )


class FeishuNotificationLog(Base):
    """飞书通知发送日志

    biz_type + biz_id 用于关联业务（如 report / cost_allocation 等）。
    receiver_snapshot: 本次解析出的接收人快照。
    result_snapshot:   飞书接口返回摘要（不含 token/secret）。
    automation_execution_id: 如果由自动化规则触发，关联执行记录。
    """
    __tablename__ = "feishu_notification_logs"
    __table_args__ = (
        Index("ix_feishu_notification_logs_biz", "biz_type", "biz_id"),
        Index("ix_feishu_notification_logs_created_at", "created_at"),
        Index("ix_feishu_notification_logs_status", "status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    biz_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    biz_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_test: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    message_format: Mapped[str | None] = mapped_column(String(16), nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    rendered_content: Mapped[str | None] = mapped_column(Text, nullable=True)

    receiver_snapshot: Mapped[list | None] = mapped_column(JSON, nullable=True)
    result_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    status: Mapped[str] = mapped_column(String(32), nullable=False)  # success/partial_success/failed/skipped
    success_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    triggered_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    automation_execution_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
