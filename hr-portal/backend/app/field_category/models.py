"""字段分类 ORM models"""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class FieldCategory(Base):
    __tablename__ = "field_categories"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class FieldCategoryAssignment(Base):
    __tablename__ = "field_category_assignments"
    __table_args__ = (
        UniqueConstraint(
            "category_id", "table_name", "column_name", name="uq_field_cat_assignment"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    category_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("field_categories.id", ondelete="CASCADE"),
        nullable=False,
    )
    table_name: Mapped[str] = mapped_column(String(64), nullable=False)
    column_name: Mapped[str] = mapped_column(String(64), nullable=False)


class FieldCategoryToolWhitelist(Base):
    """字段分类 → 授权工具白名单

    无该分类权限的用户,仅在白名单工具内可使用该分类字段(原值可见、可计算)。
    """
    __tablename__ = "field_category_tool_whitelist"
    __table_args__ = (
        UniqueConstraint("category_id", "tool_key", name="uq_field_cat_tool"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    category_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("field_categories.id", ondelete="CASCADE"), nullable=False
    )
    # 工具标识,如 'compensation_calc' / 'income_certificate'
    tool_key: Mapped[str] = mapped_column(String(64), nullable=False)


class UserVisibleCategory(Base):
    __tablename__ = "user_visible_categories"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    category_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("field_categories.id", ondelete="CASCADE"),
        primary_key=True,
    )


class RoleVisibleCategory(Base):
    __tablename__ = "role_visible_categories"

    role_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
    category_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("field_categories.id", ondelete="CASCADE"),
        primary_key=True,
    )