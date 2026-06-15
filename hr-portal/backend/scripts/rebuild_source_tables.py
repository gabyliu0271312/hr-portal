"""Rebuild source data tables as typed entity-column tables.

Default mode is dry-run and only prints the DROP/CREATE plan.

Usage:
  python -m scripts.rebuild_source_tables
  python -m scripts.rebuild_source_tables --tables emp_realtime_roster emp_monthly_salary
  python -m scripts.rebuild_source_tables --apply --i-understand-this-drops-data

This script intentionally does not migrate data from raw JSON. Source data is
expected to be re-synced or re-uploaded after tables are rebuilt.
"""
from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from typing import Sequence

from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.data.ddl import (
    DDLValidationError,
    SourceColumn,
    build_create_source_table_sql,
    build_drop_source_table_sql,
    create_source_table,
    drop_source_table,
    validate_table_name,
)
from app.data.dynamic_loader import (
    register_source_table_model,
    unregister_source_table_model,
)
from app.data.models import RegisteredTable, TableColumn


DEFAULT_REBUILD_TABLES = [
    "emp_realtime_roster",
    "emp_monthly_roster",
    "emp_monthly_salary",
    "emp_monthly_allocation",
    "cost_center_monthly",
    "emp_monthly_cost_class",
    "emp_monthly_cost_result",
    "emp_severance_installment",
    "emp_year_end_bonus",
]


@dataclass(frozen=True)
class RebuildTablePlan:
    table_name: str
    table_label: str
    columns: list[SourceColumn]
    drop_sql: str
    create_sql: list[str]


def normalize_table_names(table_names: Sequence[str] | None = None) -> list[str]:
    names = list(table_names or DEFAULT_REBUILD_TABLES)
    seen: set[str] = set()
    out: list[str] = []
    for name in names:
        table = validate_table_name(name)
        if table in seen:
            continue
        seen.add(table)
        out.append(table)
    return out


async def load_columns_for_table(db, table_name: str) -> list[SourceColumn]:
    rows = (
        await db.execute(
            select(TableColumn.column_code, TableColumn.data_type)
            .where(TableColumn.table_name == table_name)
            .order_by(TableColumn.display_order, TableColumn.id)
        )
    ).all()
    return [SourceColumn(column_code=code, data_type=dtype or "string") for code, dtype in rows]


async def build_rebuild_plans(
    db,
    table_names: Sequence[str] | None = None,
    *,
    require_registered: bool = True,
) -> list[RebuildTablePlan]:
    names = normalize_table_names(table_names)
    registered_rows = (
        await db.execute(
            select(RegisteredTable).where(RegisteredTable.table_name.in_(names))
        )
    ).scalars().all()
    registered_by_name = {rt.table_name: rt for rt in registered_rows}

    missing = [name for name in names if name not in registered_by_name]
    if missing and require_registered:
        raise RuntimeError(f"registered_tables 缺少待重建表: {missing}")

    plans: list[RebuildTablePlan] = []
    for name in names:
        rt = registered_by_name.get(name)
        columns = await load_columns_for_table(db, name)
        create_sql = build_create_source_table_sql(name, columns)
        plans.append(
            RebuildTablePlan(
                table_name=name,
                table_label=rt.table_label if rt else name,
                columns=columns,
                drop_sql=build_drop_source_table_sql(name, cascade=True),
                create_sql=create_sql,
            )
        )
    return plans


def render_plan(plans: Sequence[RebuildTablePlan]) -> str:
    lines = [
        "# Rebuild source table plan",
        "",
        "WARNING: apply mode drops all existing rows in these source tables.",
        "",
    ]
    for plan in plans:
        count = len(plan.columns)
        lines.append(f"## {plan.table_name} ({plan.table_label}) - {count} business columns")
        lines.append(plan.drop_sql + ";")
        for sql in plan.create_sql:
            lines.append(sql + ";")
        lines.append("")
    return "\n".join(lines).rstrip()


async def apply_rebuild_plans(db, plans: Sequence[RebuildTablePlan]) -> None:
    for plan in plans:
        unregister_source_table_model(plan.table_name)
        await drop_source_table(db, plan.table_name, cascade=True)
        await create_source_table(db, plan.table_name, plan.columns)
        await register_source_table_model(db, plan.table_name, force=True)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--tables",
        nargs="+",
        help="Limit rebuild to specific registered source table names.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually execute DROP/CREATE statements. Default is dry-run.",
    )
    parser.add_argument(
        "--i-understand-this-drops-data",
        action="store_true",
        help="Required with --apply to acknowledge destructive rebuild.",
    )
    return parser.parse_args(argv)


async def main_async(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    if args.apply and not args.i_understand_this_drops_data:
        raise SystemExit("--apply requires --i-understand-this-drops-data")

    async with AsyncSessionLocal() as db:
        try:
            plans = await build_rebuild_plans(db, args.tables)
        except DDLValidationError as exc:
            raise SystemExit(str(exc)) from exc

        print(render_plan(plans))

        if not args.apply:
            print("\nDRY-RUN only. No database changes were made.")
            return 0

        await apply_rebuild_plans(db, plans)
        await db.commit()
        print("\nAPPLIED. Source tables were dropped and rebuilt.")
        return 0


def main(argv: Sequence[str] | None = None) -> int:
    return asyncio.run(main_async(argv))


if __name__ == "__main__":
    raise SystemExit(main())
