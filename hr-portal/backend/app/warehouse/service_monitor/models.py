# -*- coding: utf-8 -*-
"""服务监控数据模型"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class ServiceRunLog(Base):
    """服务运行日志。统一记录 API / 推送 / 订阅 / 消费资产发布的执行情况。"""
    __tablename__ = "service_run_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    service_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    # api / push / subscription / ads_publish
    service_id: Mapped[int] = mapped_column(BigInteger, nullable=True, index=True, comment="服务配置 ID")
    service_name: Mapped[str] = mapped_column(String(128), nullable=True, comment="服务名称")

    source_type: Mapped[str] = mapped_column(String(16), nullable=True, comment="来源类型")
    source_id: Mapped[str] = mapped_column(String(64), nullable=True, comment="来源 ID")

    status: Mapped[str] = mapped_column(String(16), nullable=False, default="success")
    # success / failed / partial
    rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # 上游依赖（关联数据治理·执行监控）
    upstream_failure: Mapped[bool] = mapped_column(default=False, server_default="false")
    governance_run_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    triggered_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    caller_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
