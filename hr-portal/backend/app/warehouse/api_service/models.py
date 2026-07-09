# -*- coding: utf-8 -*-
"""API 服务数据模型"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class ApiService(Base):
    """API 服务配置。

    把 DWD/DWS/ADS/指标/报表 封装为查询 API，支持字段白名单、鉴权、限流。
    """
    __tablename__ = "api_services"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 来源资产（使用统一来源协议）
    source_type: Mapped[str] = mapped_column(String(16), nullable=False, default="table")
    source_id: Mapped[str] = mapped_column(String(64), nullable=False)
    source_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source_layer: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # 字段配置
    field_whitelist: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # [{ "field": "name", "alias": "姓名", "sensitive": false }]
    filter_fields: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # ["name", "department"]
    default_sort: Mapped[str | None] = mapped_column(String(64), nullable=True)
    page_size_max: Mapped[int] = mapped_column(Integer, nullable=False, default=1000)

    # 鉴权与安全
    auth_policy: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # {"type": "token"|"login"|"internal", "roles": ["admin"]}
    rate_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timeout_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=30)

    # 状态
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    # draft / enabled / disabled / error
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
