# -*- coding: utf-8 -*-
"""订阅管理数据模型"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class Subscription(Base):
    """数据订阅配置。

    人/群/系统对仓内资产或报表的订阅关系，支持定时/事件触发投递。
    """
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 来源资产
    source_type: Mapped[str] = mapped_column(String(16), nullable=False, default="table")
    source_id: Mapped[str] = mapped_column(String(64), nullable=False)
    source_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source_layer: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # 字段范围
    field_scope: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # [{ "field": "name", "alias": "姓名" }]

    # 接收配置
    recipients: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # [{ "type": "user", "id": 1, "target": "feishu" }, { "type": "group", "id": "chat_xxx" }]
    delivery_target: Mapped[str] = mapped_column(String(32), nullable=False, default="feishu")
    # feishu / email / webhook / file

    # 调度
    frequency: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    # manual / daily / weekly / monthly / event
    cron_expr: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # cron 表达式（仅定时订阅）

    # 推送格式
    push_format: Mapped[str] = mapped_column(String(16), nullable=False, default="json")
    # json / csv / excel / markdown

    # 状态
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    # draft / enabled / paused / expired

    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")

    created_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
