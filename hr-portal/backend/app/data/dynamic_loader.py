"""动态表注册加载器

启动时从 registered_tables 读取业务表注册信息，按数据库真实 schema
反射 SQLAlchemy 模型并注入 DATA_TABLES / PERIOD_TABLES。

业务表不再有静态旧结构 ORM fallback；运行时注册表只能来自真实数据库表反射。
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy import MetaData, Table
from sqlalchemy.sql import func, select

logger = logging.getLogger(__name__)

from app.core.db import Base
from app.data.ddl import validate_table_name

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.data.models import RegisteredTable

logger = logging.getLogger(__name__)

_MODEL_VERSIONS: dict[str, int] = {}


def _model_class_name(table_name: str) -> str:
    version = _MODEL_VERSIONS.get(table_name, 0) + 1
    _MODEL_VERSIONS[table_name] = version
    parts = [p for p in table_name.split("_") if p]
    stem = "".join(p[:1].upper() + p[1:] for p in parts) or "Source"
    return f"SourceTable{stem}V{version}"


def _make_model_from_table(table_name: str, table: Table):
    """Create a mapped class for an already reflected physical table."""
    validate_table_name(table_name)
    attrs = {
        "__module__": __name__,
        "__table__": table,
    }
    return type(_model_class_name(table_name), (Base,), attrs)


async def reflect_source_table_model(db: "AsyncSession", table_name: str):
    """Reflect a physical source table into a SQLAlchemy ORM model."""
    table = validate_table_name(table_name)

    def _reflect(sync_session) -> Table:
        metadata = MetaData()
        return Table(
            table,
            metadata,
            schema="public",
            autoload_with=sync_session.connection(),
        )

    reflected = await db.run_sync(_reflect)
    return _make_model_from_table(table, reflected)


async def register_source_table_model(
    db: "AsyncSession",
    table_name: str,
    *,
    force: bool = False,
):
    """Reflect and register a table in DATA_TABLES.

    `force=True` replaces the current runtime entry. This is useful after DDL
    changes, because the table's mapped columns may have changed.
    """
    from app.data.models import DATA_TABLES

    table = validate_table_name(table_name)
    if not force and table in DATA_TABLES:
        return DATA_TABLES[table]
    model = await reflect_source_table_model(db, table)
    DATA_TABLES[table] = model
    logger.info("[dynamic-tables] reflected: %s", table)
    return model


async def _register_view_model(db, table_name: str, *, force: bool = False):
    """注册 PostgreSQL 视图：反射后补 id 为主键。"""
    from app.data.models import DATA_TABLES
    from sqlalchemy import PrimaryKeyConstraint

    table = validate_table_name(table_name)
    if not force and table in DATA_TABLES:
        return DATA_TABLES[table]

    model = await reflect_source_table_model(db, table)
    # 视图无 PK 元数据，手动加 id 为主键
    reflected_table = model.__table__
    if not reflected_table.primary_key and 'id' in reflected_table.columns:
        reflected_table.append_constraint(
            PrimaryKeyConstraint(reflected_table.columns['id'])
        )
    DATA_TABLES[table] = model
    return model


def unregister_source_table_model(table_name: str) -> None:
    """Remove a table from the runtime DATA_TABLES registry."""
    from app.data.models import DATA_TABLES

    DATA_TABLES.pop(validate_table_name(table_name), None)


def register_period_table(rt: "RegisteredTable", *, overwrite: bool = False) -> None:
    """Register period-table metadata for sync orphan deletion rules."""
    if not rt.is_period:
        return

    from app.datasources.sync_service import PERIOD_TABLES

    if not overwrite and rt.table_name in PERIOD_TABLES:
        return
    PERIOD_TABLES[rt.table_name] = {
        "period_col": rt.period_col,
        "offset_key": "MONTH_OFFSET",
        "period_source": rt.period_source,
    }


async def load_dynamic_tables(db: "AsyncSession") -> None:
    """从 registered_tables 加载业务表，注入 DATA_TABLES / PERIOD_TABLES。"""
    from app.data.models import DATA_TABLES, RegisteredTable

    rows = (
        await db.execute(
            select(RegisteredTable).order_by(
                RegisteredTable.is_builtin.desc(),
                RegisteredTable.display_order,
                RegisteredTable.id,
            )
        )
    ).scalars().all()

    # 查询所有视图名
    from sqlalchemy import text as sa_text
    view_rows = await db.execute(sa_text(
        "SELECT table_name FROM information_schema.views WHERE table_schema = 'public'"
    ))
    view_names = {r[0] for r in view_rows.all()}

    for rt in rows:
        if rt.table_name in view_names:
            await _register_view_model(db, rt.table_name, force=True)
            logger.info("[dynamic-tables] registered view: %s", rt.table_name)
        else:
            await register_source_table_model(db, rt.table_name, force=True)
            register_period_table(rt, overwrite=True)
