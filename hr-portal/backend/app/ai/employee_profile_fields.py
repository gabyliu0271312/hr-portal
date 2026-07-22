"""Persistent display configuration and safe metadata for employee-profile fields."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class EmployeeProfileFieldSetting(Base):
    __tablename__ = "employee_profile_field_settings"
    __table_args__ = (
        UniqueConstraint("table_name", "column_name", name="uq_employee_profile_field_table_column"),
        UniqueConstraint("table_name", "field_code", name="uq_employee_profile_field_table_code"),
        Index("ix_employee_profile_field_table_default", "table_name", "is_default_card"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    table_name: Mapped[str] = mapped_column(String(128), nullable=False)
    column_name: Mapped[str] = mapped_column(String(128), nullable=False)
    field_code: Mapped[str] = mapped_column(String(128), nullable=False)
    display_name: Mapped[str] = mapped_column(String(64), nullable=False)
    is_queryable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_default_card: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    default_display_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    append_display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=999)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
