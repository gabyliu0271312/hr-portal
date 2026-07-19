"""动态表注册加载器

启动时从 registered_tables 读取业务表注册信息，按数据库真实 schema
反射 SQLAlchemy 模型并注入 DATA_TABLES / PERIOD_TABLES。

业务表不再有静态旧结构 ORM fallback；运行时注册表只能来自真实数据库表反射。
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy import MetaData, Table, delete, exists, text
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
    """注册 PostgreSQL 视图：先给视图反射 Table 加 id 主键，再建 ORM 模型。"""
    from app.data.models import DATA_TABLES
    from sqlalchemy import PrimaryKeyConstraint
    from sqlalchemy import Table as SATable, MetaData

    table = validate_table_name(table_name)
    if not force and table in DATA_TABLES:
        return DATA_TABLES[table]

    # 反射物理视图
    def _reflect(sync_session) -> SATable:
        metadata = MetaData()
        return SATable(table, metadata, schema="public", autoload_with=sync_session.connection())
    reflected = await db.run_sync(_reflect)

    # 先加 id 主键，再建模型
    if not reflected.primary_key and 'id' in reflected.columns:
        reflected.append_constraint(PrimaryKeyConstraint(reflected.columns['id']))

    model = _make_model_from_table(table, reflected)
    DATA_TABLES[table] = model
    logger.info("[dynamic-tables] registered view: %s", table)
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


async def _table_reference_reason(db: "AsyncSession", table_name: str) -> str | None:
    from app.allocation.models import AllocationScheme
    from app.datasets.models import DataSetTable
    from app.reports.models import Report

    checks = (
        ("数据集", exists().where(DataSetTable.table_name == table_name)),
        ("报表", exists().where(Report.table_name == table_name)),
        (
            "成本分摊方案",
            exists().where(
                (AllocationScheme.table_name == table_name)
                | (AllocationScheme.result_table == table_name)
            ),
        ),
    )
    for label, statement in checks:
        if (await db.execute(select(statement))).scalar():
            return label
    return None


async def _remove_orphaned_registration(db: "AsyncSession", table_name: str) -> None:
    from app.data.models import RegisteredTable, TableColumn
    from app.datasources.sync_service import PERIOD_TABLES

    await db.execute(delete(TableColumn).where(TableColumn.table_name == table_name))
    await db.execute(delete(RegisteredTable).where(RegisteredTable.table_name == table_name))
    unregister_source_table_model(table_name)
    PERIOD_TABLES.pop(table_name, None)
    logger.warning("[dynamic-tables] removed orphaned registration: %s", table_name)


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

    relation_rows = await db.execute(
        text(
            "SELECT table_name, table_type FROM information_schema.tables "
            "WHERE table_schema = 'public'"
        )
    )
    relation_types = {row[0]: row[1] for row in relation_rows.all()}

    orphaned = False
    for rt in rows:
        relation_type = relation_types.get(rt.table_name)
        if relation_type is None:
            reason = None if rt.is_builtin else await _table_reference_reason(db, rt.table_name)
            if rt.is_builtin or reason:
                detail = "内置表" if rt.is_builtin else f"仍被{reason}引用"
                raise RuntimeError(f"动态表 {rt.table_name} 缺失，{detail}，拒绝自动清理")
            await _remove_orphaned_registration(db, rt.table_name)
            orphaned = True
            continue
        if relation_type == "VIEW":
            await _register_view_model(db, rt.table_name, force=True)
            logger.info("[dynamic-tables] registered view: %s", rt.table_name)
        else:
            await register_source_table_model(db, rt.table_name, force=True)
            register_period_table(rt, overwrite=True)

    if orphaned:
        await db.commit()
