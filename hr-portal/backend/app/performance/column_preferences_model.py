"""Persistence model for per-actor performance column preferences."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Identity, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class PerformanceColumnPreference(Base):
    __tablename__ = "performance_column_preferences"
    __table_args__ = (
        UniqueConstraint(
            "owner_type", "owner_id", "employee_ref", "cycle_ref", "scene",
            "project_id", "node_id", "role_key", name="uq_pm_column_preference_scope",
        ),
        CheckConstraint("scene IN ('management', 'evaluation')", name="ck_pm_column_preference_scene"),
        CheckConstraint("project_id >= 0", name="ck_pm_column_preference_project"),
        CheckConstraint("jsonb_typeof(column_keys) = 'array' AND jsonb_array_length(column_keys) <= 128", name="ck_pm_column_preference_keys"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    owner_type: Mapped[str] = mapped_column(String(32), nullable=False)
    owner_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    employee_ref: Mapped[str] = mapped_column(String(64), nullable=False, default="", server_default="")
    cycle_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    scene: Mapped[str] = mapped_column(String(16), nullable=False)
    project_id: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    node_id: Mapped[str] = mapped_column(String(96), nullable=False, default="", server_default="")
    role_key: Mapped[str] = mapped_column(String(96), nullable=False, default="", server_default="")
    column_keys: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
