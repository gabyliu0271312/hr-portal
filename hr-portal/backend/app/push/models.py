from datetime import datetime
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.core.db import Base


class PushTarget(Base):
    """对外推送目标配置。

    一张视图表可绑定多个推送目标，每个目标独立配置推送方式、字段映射、调度计划。

    push_type:
      http_push   — POST JSON 到对方接口
      external_db — 写入对方数据库（当前支持 MySQL / PostgreSQL）
      api_expose  — 暴露只读 API，对方主动拉取（生成 token）
    """
    __tablename__ = "push_targets"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # 来源表（registered_tables.table_name），旧字段保留兼容
    source_table: Mapped[str] = mapped_column(String(64), nullable=False)
    # P2: 统一来源协议（从 settings.source_ref 迁移到独立列）
    source_type: Mapped[str] = mapped_column(String(16), nullable=False, default="table")
    source_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    source_label: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    push_type: Mapped[str] = mapped_column(String(32), nullable=False)  # http_push / external_db / api_expose

    # 非敏感配置（URL、host、port、db名、表名等）
    settings: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # 敏感配置（password、token），加密存储
    secrets_encrypted: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # 字段映射：[{"source": "成本归属年月", "target": "cost_period"}, ...]
    # 空列表 = 按源字段名原样推送
    field_mappings: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # 上次推送状态
    last_push_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    last_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
