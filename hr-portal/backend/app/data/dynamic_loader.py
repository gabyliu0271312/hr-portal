"""动态表注册加载器

启动时从 registered_tables 读取用户新建的表，
动态创建 SQLAlchemy 模型并注入 DATA_TABLES / PERIOD_TABLES。
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func, select

from app.core.db import Base

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def _make_dynamic_model(table_name: str):
    """动态创建与内置表 schema 完全一致的 SQLAlchemy 模型。"""
    from datetime import datetime as _dt

    attrs = {
        "__tablename__": table_name,
        "__table_args__": (UniqueConstraint("pk_hash", name=f"uq_{table_name}_pk"),),
        "id": mapped_column(BigInteger, primary_key=True),
        "pk_hash": mapped_column(String(64), nullable=False, index=True),
        "raw": mapped_column(JSON, nullable=False, default=dict),
        "synced_at": mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    }

    # 动态创建类，继承 Base 实现完整 ORM 支持
    model = type(table_name, (Base,), attrs)
    return model


async def load_dynamic_tables(db: "AsyncSession") -> None:
    """从 registered_tables 加载用户新建的表，注入 DATA_TABLES / PERIOD_TABLES。"""
    from app.data.models import DATA_TABLES, RegisteredTable
    from app.datasources.sync_service import PERIOD_TABLES

    rows = (
        await db.execute(
            select(RegisteredTable).where(RegisteredTable.is_builtin.is_(False))
        )
    ).scalars().all()

    for rt in rows:
        if rt.table_name in DATA_TABLES:
            continue  # 已注册，跳过

        model = _make_dynamic_model(rt.table_name)
        DATA_TABLES[rt.table_name] = model
        logger.info("[dynamic-tables] registered: %s", rt.table_name)

        if rt.is_period:
            PERIOD_TABLES[rt.table_name] = {
                "period_col": rt.period_col,
                "offset_key": "MONTH_OFFSET",
                "period_source": rt.period_source,
            }
