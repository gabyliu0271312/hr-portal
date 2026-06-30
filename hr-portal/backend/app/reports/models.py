"""报表中台 — 列表型报表模型（Phase 5 单表起步）

一个 Report = 一张数据表 + 一份选列/筛选/排序配置 + 元数据。
列、筛选、排序结构灵活变化，统一存到 config JSONB。

config 形态约定：
{
  "columns": ["emp_id", "dept", "name", ...],      # 选中并显示的字段（顺序即列顺序）
  "filters": [
    {"column": "dept", "op": "eq", "value": "研发"},
    {"column": "join_date", "op": "between", "value": ["2024-01-01", "2024-12-31"]}
  ],
  "sorts": [{"column": "join_date", "order": "desc"}]
}
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        Index("ix_reports_table", "table_name"),
        Index("ix_reports_owner", "owner_id"),
        Index("ix_reports_dataset", "dataset_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    table_name: Mapped[str] = mapped_column(String(64), nullable=False)
    dataset_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("datasets.id"), nullable=False
    )
    config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    owner_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # 可见性三档：private(仅创建者+超管) / scoped(数据集有权者中由 ACL 圈定) / public(数据集有权者全体)
    visibility: Mapped[str] = mapped_column(
        String(16), nullable=False, default="private", server_default="private"
    )
    scope_strategy: Mapped[str | None] = mapped_column(String(32), nullable=True)

    last_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    run_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class ReportAcl(Base):
    """报表访问授权（角色或用户级白名单）"""
    __tablename__ = "report_acl"
    __table_args__ = (Index("ix_report_acl_report", "report_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    report_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False
    )
    role_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("roles.id", ondelete="CASCADE"), nullable=True
    )
    user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
