"""业务主键变更的一对一 pk_hash 迁移。"""
from __future__ import annotations

from collections import defaultdict
import hashlib
import json
import re
from typing import Any
from uuid import uuid4

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import TableColumn
from app.datasources.models import DataSource
from app.warehouse.models import OdsDwdAutomationConfig
from app.warehouse.asset_sink import _business_key_hash


class BusinessKeyMigrationConflict(ValueError):
    """业务主键变更不能安全一对一迁移。"""


def _quote_table(table_name: str) -> str:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", table_name):
        raise BusinessKeyMigrationConflict("业务主键迁移目标表名非法")
    return f'"{table_name}"'


def _quote_field(field_name: str) -> str:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", field_name):
        raise BusinessKeyMigrationConflict("业务主键字段名非法")
    return f'"{field_name}"'


def _new_hash(row: dict[str, Any], key_fields: list[str]) -> str:
    return _business_key_hash(row, key_fields)


def _collision_count(rows: list[dict[str, Any]], key_fields: list[str]) -> int:
    grouped: dict[str, int] = defaultdict(int)
    for row in rows:
        grouped[_new_hash(row, key_fields)] += 1
    return sum(count - 1 for count in grouped.values() if count > 1)


async def _table_exists(db: AsyncSession, table_name: str) -> bool:
    return bool(await db.scalar(text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = current_schema() AND table_name = :table_name)"
    ), {"table_name": table_name}))


async def _load_rows(db: AsyncSession, table_name: str, key_fields: list[str]) -> list[dict[str, Any]]:
    table_q = _quote_table(table_name)
    field_q = ", ".join([_quote_field("id"), _quote_field("pk_hash"), *[_quote_field(field) for field in key_fields]])
    result = await db.execute(text(f"SELECT {field_q} FROM {table_q} FOR UPDATE"))
    return [dict(row) for row in result.mappings().all()]


async def _rewrite_hashes(
    db: AsyncSession,
    table_name: str,
    rows: list[dict[str, Any]],
    new_hashes: dict[int, str],
) -> int:
    if not rows:
        return 0
    table_q = _quote_table(table_name)
    namespace = uuid4().hex
    for row in rows:
        temporary = hashlib.sha256(
            f"key-migration:{namespace}:{table_name}:{row['id']}".encode("utf-8")
        ).hexdigest()[:32]
        await db.execute(
            text(f"UPDATE {table_q} SET \"pk_hash\" = :temporary WHERE \"id\" = :id"),
            {"temporary": temporary, "id": row["id"]},
        )
    for row in rows:
        await db.execute(
            text(f"UPDATE {table_q} SET \"pk_hash\" = :pk_hash WHERE \"id\" = :id"),
            {"pk_hash": new_hashes[row["id"]], "id": row["id"]},
        )
    return len(rows)


async def migrate_business_key(
    db: AsyncSession,
    *,
    table_name: str,
    old_key_fields: list[str],
    new_key_fields: list[str],
) -> dict[str, Any]:
    """在元数据事务中执行安全的一对一 ODS/DWD hash 迁移。"""
    old_keys = [str(field).strip() for field in old_key_fields if str(field).strip()]
    new_keys = [str(field).strip() for field in new_key_fields if str(field).strip()]
    if old_keys == new_keys:
        return {"status": "unchanged", "ods_rows": 0, "dwd_rows": 0}
    if not old_keys or not new_keys:
        raise BusinessKeyMigrationConflict(
            "业务主键不能为空；主键清空或从无主键建立主键必须走人工迁移"
        )

    metadata_fields = {
        row[0]
        for row in (
            await db.execute(
                select(TableColumn.column_code).where(TableColumn.table_name == table_name)
            )
        ).all()
    }
    missing = sorted(set(new_keys) - metadata_fields)
    if missing:
        raise BusinessKeyMigrationConflict(
            f"新业务主键字段不存在: {', '.join(missing)}"
        )

    ods_rows = await _load_rows(db, table_name, new_keys)
    ods_collisions = _collision_count(ods_rows, new_keys)
    if ods_collisions:
        raise BusinessKeyMigrationConflict(
            f"ODS新业务主键存在{ods_collisions}条冲突，无法自动一对一迁移"
        )

    config = await db.scalar(
        select(OdsDwdAutomationConfig)
        .where(OdsDwdAutomationConfig.ods_table_name == table_name)
        .order_by(OdsDwdAutomationConfig.id)
    )
    dwd_table = config.target_dwd_table_name if config else None
    if not dwd_table:
        base = table_name.removeprefix("ods_").removeprefix("raw_").removeprefix("src_")
        dwd_table = f"dwd_{base}"

    dwd_rows: list[dict[str, Any]] = []
    dwd_exists = await _table_exists(db, dwd_table)
    if not dwd_exists:
        raise BusinessKeyMigrationConflict(
            f"DWD目标表不存在: {dwd_table}，主键变更必须走人工迁移"
        )
    dwd_rows = await _load_rows(db, dwd_table, new_keys)
    dwd_collisions = _collision_count(dwd_rows, new_keys)
    if dwd_collisions:
        raise BusinessKeyMigrationConflict(
            f"DWD新业务主键存在{dwd_collisions}条冲突，无法自动一对一迁移"
        )

    ods_hashes = {row["id"]: _new_hash(row, new_keys) for row in ods_rows}
    dwd_hashes = {row["id"]: _new_hash(row, new_keys) for row in dwd_rows}
    ods_count = await _rewrite_hashes(db, table_name, ods_rows, ods_hashes)
    dwd_count = await _rewrite_hashes(db, dwd_table, dwd_rows, dwd_hashes)

    await db.execute(
        text(
            "UPDATE datasources SET business_key_fields = CAST(:fields AS json), updated_at = NOW() "
            "WHERE table_name = :table_name"
        ),
        {"fields": json.dumps(new_keys, ensure_ascii=False), "table_name": table_name},
    )
    if config is not None:
        config.business_key_fields = new_keys

    if dwd_exists:
        dwd_columns = (
            await db.execute(
                select(TableColumn).where(TableColumn.table_name == dwd_table)
            )
        ).scalars().all()
        for column in dwd_columns:
            if column.column_code in old_keys or column.column_code in new_keys:
                column.is_pk_part = column.column_code in new_keys

    return {
        "status": "migrated",
        "table_name": table_name,
        "dwd_table": dwd_table,
        "old_key_fields": old_keys,
        "new_key_fields": new_keys,
        "ods_rows": ods_count,
        "dwd_rows": dwd_count,
    }
