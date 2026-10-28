from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class IdentitySwitchSetting(Base):
    __tablename__ = "app_identity_switch_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    admin_operator_user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    others_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    generation: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    test_delivery_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    test_receiver_user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class IdentitySwitchSession(Base):
    __tablename__ = "app_identity_switch_sessions"
    __table_args__ = (UniqueConstraint("operator_user_id", "request_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    operator_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)
    target_employee_no: Mapped[str] = mapped_column(String(64))
    target_display_name: Mapped[str] = mapped_column(String(128))
    secret_hash: Mapped[str] = mapped_column(String(64), unique=True)
    generation: Mapped[int] = mapped_column(Integer)
    request_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class IdentitySwitchNotificationRun(Base):
    __tablename__ = "app_identity_switch_notification_runs"
    __table_args__ = (UniqueConstraint("session_id", "request_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("app_identity_switch_sessions.id"))
    operator_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)
    target_employee_no: Mapped[str] = mapped_column(String(64))
    request_id: Mapped[str] = mapped_column(String(64))
    source: Mapped[str] = mapped_column(String(256))
    environment: Mapped[str] = mapped_column(String(32))
    delivery_revision: Mapped[int] = mapped_column(Integer, default=-1)
    items: Mapped[list] = mapped_column(JSONB, default=list)
    original_receivers: Mapped[list] = mapped_column(JSONB, default=list)
    sample_status: Mapped[str] = mapped_column(String(32), default="recorded")
    summary_status: Mapped[str] = mapped_column(String(32), default="recorded")
    delivery_error: Mapped[str | None] = mapped_column(String(512))
    delivery_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
