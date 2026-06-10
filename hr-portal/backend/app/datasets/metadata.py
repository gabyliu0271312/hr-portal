from __future__ import annotations

from collections.abc import Iterable, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import DATA_TABLES, RegisteredTable, TableColumn
from app.global_fields.models import GlobalField


BUILTIN_TABLE_LABELS = {
    "emp_realtime_roster": "员工实时花名册",
    "emp_monthly_roster": "员工月度花名册",
    "emp_monthly_salary": "员工月度工资表",
    "emp_monthly_allocation": "员工月度成本分摊表",
    "cost_center_monthly": "成本中心月度维护表",
    "emp_monthly_cost_class": "员工月度成本归集分类表",
    "emp_monthly_cost_result": "员工月度成本分摊结果",
}


def _unique(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        out.append(item)
    return out


async def table_label_map(
    db: AsyncSession, table_names: Iterable[str] | None = None
) -> dict[str, str]:
    names = _unique(table_names or DATA_TABLES.keys())
    if not names:
        return {}

    rows = (
        await db.execute(
            select(RegisteredTable.table_name, RegisteredTable.table_label).where(
                RegisteredTable.table_name.in_(names)
            )
        )
    ).all()
    labels = {name: label for name, label in rows if label}
    for name in names:
        labels.setdefault(name, BUILTIN_TABLE_LABELS.get(name, name))
    return labels


async def table_label(db: AsyncSession, table_name: str) -> str:
    return (await table_label_map(db, [table_name])).get(table_name, table_name)


async def table_options(db: AsyncSession) -> list[dict[str, str]]:
    rows = (
        await db.execute(
            select(RegisteredTable.table_name, RegisteredTable.table_label).order_by(
                RegisteredTable.display_order,
                RegisteredTable.id,
            )
        )
    ).all()

    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for name, label in rows:
        if name not in DATA_TABLES:
            continue
        seen.add(name)
        out.append({"table_name": name, "label": label or BUILTIN_TABLE_LABELS.get(name, name)})

    for name in DATA_TABLES.keys():
        if name in seen:
            continue
        out.append({"table_name": name, "label": BUILTIN_TABLE_LABELS.get(name, name)})
    return out


async def effective_column_label_map(
    columns: Sequence[TableColumn], db: AsyncSession
) -> dict[str, str]:
    global_ids = {
        c.global_field_id for c in columns if getattr(c, "global_field_id", None) is not None
    }
    global_labels: dict[int, str] = {}
    if global_ids:
        rows = (
            await db.execute(
                select(GlobalField.id, GlobalField.label).where(GlobalField.id.in_(global_ids))
            )
        ).all()
        global_labels = {gid: label for gid, label in rows if label}

    labels: dict[str, str] = {}
    for col in columns:
        inherited = global_labels.get(col.global_field_id) if col.global_field_id else None
        labels[col.column_code] = inherited or col.column_label or col.column_code
    return labels
