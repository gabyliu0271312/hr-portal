from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import DATA_TABLES, RegisteredTable
from app.datasets.models import DataSet, DataSetTable

SINGLE_TABLE_ALIAS = "current"
SINGLE_TABLE_DATASET_PREFIX = "ds_"


def single_table_dataset_name(table_name: str, label: str | None = None) -> str:
    """Return the stable system code for a physical single-table dataset.

    Display text belongs to DataSet.label. DataSet.name is an internal code and
    must stay ASCII-friendly so modeling pages can reliably identify it.
    """
    base = f"{SINGLE_TABLE_DATASET_PREFIX}{table_name}".replace(" ", "_")
    return base[:64]


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
        raise ValueError(f"Unknown data table: {table_name}")

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
        tail = f"_{suffix}"
        name = f"{base_name[:64 - len(tail)]}{tail}"
        suffix += 1

    ds = DataSet(
        name=name,
        label=label,
        description=f"System-created single-table dataset for {label}.",
        is_active=True,
        scope_strategy=await registered_table_scope_strategy(table_name, db),
        created_by=created_by,
    )
    db.add(ds)
    await db.flush()
    db.add(DataSetTable(dataset_id=ds.id, table_name=table_name, alias=SINGLE_TABLE_ALIAS))
    await db.flush()
    return ds


DWD_DATASET_PREFIX = "ds_dwd_"


async def ensure_dwd_dataset(
    dwd_table_name: str,
    db: AsyncSession,
    *,
    created_by: int | None = None,
    table_label: str | None = None,
) -> DataSet:
    """Create a DWD single-table dataset for a physical DWD table."""
    if dwd_table_name not in DATA_TABLES:
        raise ValueError(f"Unknown data table: {dwd_table_name}")

    existing = await find_single_table_dataset(dwd_table_name, db)
    if existing is not None:
        return existing

    # 去掉表名中已有的层前缀，避免 ds_dwd_dwd__xxx 双前缀
    import re as _re
    stripped_name = _re.sub(r'^(dwd|ods|dim|ads|tmp)_{1,2}', '', dwd_table_name)
    base_name = f"{DWD_DATASET_PREFIX}{stripped_name}".replace(" ", "_")[:60]
    name = base_name
    suffix = 2
    while (
        await db.execute(select(DataSet.id).where(DataSet.name == name))
    ).scalar_one_or_none() is not None:
        tail = f"_{suffix}"
        name = f"{base_name[:64 - len(tail)]}{tail}"
        suffix += 1

    raw_label = table_label or await registered_table_label(dwd_table_name, db)
    display_label = raw_label.strip().rstrip("(DWD)").strip() if raw_label else dwd_table_name

    ds = DataSet(
        name=name,
        label=display_label,
        description=f"System-created DWD dataset for {dwd_table_name}.",
        is_active=True,
        warehouse_layer="DWD",
        scope_strategy=await registered_table_scope_strategy(dwd_table_name, db),
        created_by=created_by,
    )
    db.add(ds)
    await db.flush()
    db.add(DataSetTable(dataset_id=ds.id, table_name=dwd_table_name, alias=SINGLE_TABLE_ALIAS))
    await db.flush()
    return ds
