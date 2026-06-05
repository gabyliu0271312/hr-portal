"""数据源 / 同步历史 ORM 模型"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class DataSource(Base):
    """数据源 / 接口配置

    一行 = 一张接入表的接口配置（北森报表 API / 北森接口 API / 内部上传 / 通用 HTTP / 数据库）
    凭证字段（AppSecret / 数据库密码等）加密存 secrets_encrypted
    非敏感字段（URL / Endpoint / Headers）明文存 settings
    """

    __tablename__ = "datasources"
    __table_args__ = (UniqueConstraint("table_name", name="uq_datasources_table"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    # 业务表标识（与本地 5 张表一一对应）
    table_name: Mapped[str] = mapped_column(String(64), nullable=False)
    table_label: Mapped[str] = mapped_column(String(64), nullable=False)

    # 接入类型 code（beisen_report / beisen_api / upload / http_generic / database）
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)

    # 调度计划（前端 SCHEDULE_OPTIONS 的 value）
    schedule: Mapped[str] = mapped_column(String(64), nullable=False, default="手动触发")

    # 配置：非敏感字段（URL、ReportID、headers、query 等）
    settings: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # 配置：敏感字段（AppSecret、密码、Token），加密后存
    secrets_encrypted: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 上次同步状态摘要
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    last_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=__import__("sqlalchemy").sql.func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=__import__("sqlalchemy").sql.func.now(),
        onupdate=__import__("sqlalchemy").sql.func.now(),
        nullable=False,
    )


class SyncRun(Base):
    """每次同步的运行历史"""

    __tablename__ = "sync_runs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    datasource_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("datasources.id", ondelete="CASCADE"), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=__import__("sqlalchemy").sql.func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="running")
    rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    triggered_by: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
