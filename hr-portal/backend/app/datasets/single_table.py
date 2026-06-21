from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import DATA_TABLES, RegisteredTable
from app.datasets.models import DataSet, DataSetTable

SINGLE_TABLE_ALIAS = "current"
SINGLE_TABLE_DATASET_PREFIX = "单表数据集 · "


def single_table_dataset_name(table_name: str, label: str | None = None) -> str:
    display = (label or table_name).strip() or table_name
    name = f"{SINGLE_TABLE_DATASET_PREFIX}{display}"
    if len(name) <= 64:
        return name
    return f"{SINGLE_TABLE_DATASET_PREFIX}{table_name}"[:64]


async def registered_table_label(table_name: str, db: AsyncSession) -> str:
    row = (
        await db.execute(
            select(RegisteredTable).where(RegisteredTable.table_name == table_name)
        )
    ).scalar_one_or_none()
    return row.table_label if row else table_name


async def registered_table_scope_strategy(table_name: str, db: AsyncSession) -> str | None:
    row = (
        await db.execute(
            select(RegisteredTable.scope_strategy).where(RegisteredTable.table_name == table_name)
        )
    ).first()
    return row[0] if row else None


async def find_single_table_dataset(table_name: str, db: AsyncSession) -> DataSet | None:
    return (
        await db.execute(
            select(DataSet)
            .join(DataSetTable, DataSetTable.dataset_id == DataSet.id)
            .where(
                DataSetTable.table_name == table_name,
                DataSetTable.alias == SINGLE_TABLE_ALIAS,
            )
            .order_by(DataSet.id)
        )
    ).scalars().first()


async def ensure_single_table_dataset(
    table_name: str,
    db: AsyncSession,
    *,
    created_by: int | None = None,
    table_label: str | None = None,
) -> DataSet:
    if table_name not in DATA_TABLES:
        raise ValueError(f"未知数据表: {table_name}")

    existing = await find_single_table_dataset(table_name, db)
    if existing is not None:
        return existing

    label = table_label or await registered_table_label(table_name, db)
    base_name = single_table_dataset_name(table_name, label)
    name = base_name
    suffix = 2
    while (
        await db.execute(select(DataSet.id).where(DataSet.name == name))
    ).scalar_one_or_none() is not None:
        tail = f" #{suffix}"
        name = f"{base_name[:64 - len(tail)]}{tail}"
        suffix += 1

    ds = DataSet(
        name=name,
        description=f"系统自动创建，用于 {label} 的报表、成本分摊与计算字段。",
        is_active=True,
        scope_strategy=await registered_table_scope_strategy(table_name, db),
        created_by=created_by,
    )
    db.add(ds)
    await db.flush()
    db.add(DataSetTable(dataset_id=ds.id, table_name=table_name, alias=SINGLE_TABLE_ALIAS))
    await db.flush()
    return ds
