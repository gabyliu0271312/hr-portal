"""成本中心 Mapping 周期业务模型。

只保存周期、观测编码快照、稀疏例外和差异/通知状态；不展开保存默认自映射，
ODS→DWD 规则正文仍由 standardization_rules 唯一承载。
"""
from __future__ import annotations

from datetime import datetime
from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.core.db import Base


class CostCenterMappingPeriod(Base):
    __tablename__ = "cost_center_mapping_periods"
    __table_args__ = (
        UniqueConstraint("period", name="uq_cost_center_mapping_period"),
        Index("ix_cost_center_mapping_period_status", "status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    period: Mapped[str] = mapped_column(String(6), nullable=False)
    binding_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("mapping_bindings.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expected_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_codes: Mapped[list | None] = mapped_column(JSON, nullable=True)
    source_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    copied_from_period: Mapped[str | None] = mapped_column(String(6), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    published_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    publish_audit_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("mapping_publish_audits.id"), nullable=True)
    rebuild_run_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("mapping_rebuild_runs.id"), nullable=True)
    rebuild_status: Mapped[str] = mapped_column(String(32), nullable=False, default="not_started")
    notification_status: Mapped[str] = mapped_column(String(32), nullable=False, default="not_started")
    review_required: Mapped[bool] = mapped_column(nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class CostCenterMappingException(Base):
    __tablename__ = "cost_center_mapping_exceptions"
    __table_args__ = (
        UniqueConstraint("period_id", "source_code", name="uq_cost_center_mapping_exception"),
        Index("ix_cost_center_mapping_exception_period", "period_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    period_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("cost_center_mapping_periods.id", ondelete="CASCADE"), nullable=False)
    source_code: Mapped[str] = mapped_column(String(128), nullable=False)
    target_code: Mapped[str] = mapped_column(String(128), nullable=False)
    attributes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    actor: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class CostCenterMappingDiff(Base):
    __tablename__ = "cost_center_mapping_diffs"
    __table_args__ = (
        Index("ix_cost_center_mapping_diff_period", "period_id", "status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    period_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("cost_center_mapping_periods.id", ondelete="CASCADE"), nullable=False)
    source_code: Mapped[str] = mapped_column(String(128), nullable=False)
    diff_type: Mapped[str] = mapped_column(String(32), nullable=False)
    previous_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    current_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    confirmed_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class CostCenterMappingNotification(Base):
    __tablename__ = "cost_center_mapping_notifications"
    __table_args__ = (
        UniqueConstraint("period_id", "notification_key", name="uq_cost_center_mapping_notification"),
        Index("ix_cost_center_mapping_notification_status", "status"),
        Index("ix_cost_center_mapping_notification_dispatch", "status", "dispatch_started_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    period_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("cost_center_mapping_periods.id", ondelete="CASCADE"), nullable=False)
    notification_key: Mapped[str] = mapped_column(String(256), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    exhausted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    dispatch_started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
