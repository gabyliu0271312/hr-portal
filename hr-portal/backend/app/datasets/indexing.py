"""数据集关联键索引：给 JOIN 用到的实体列建普通索引。

业务表已经切换为实体列，数据集 JOIN 关联键也必须指向真实物理列。给每个关联键
建普通 btree 索引后，优化器可改用 hash/索引扫描。

幂等：CREATE INDEX IF NOT EXISTS；索引名按 (表, 列) 稳定 hash，避免重复。
"""
from __future__ import annotations

import hashlib

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.ddl import quote_ident, validate_column_name, validate_table_name
from app.data.models import DATA_TABLES
from app.datasets.models import DataSetRelation, DataSetTable
from sqlalchemy import select


def _index_name(table: str, column: str) -> str:
    h = hashlib.md5(f"{table}|{column}".encode("utf-8")).hexdigest()[:12]
    return f"ix_jk_{h}"


async def _ensure_one(db: AsyncSession, table: str, column: str) -> None:
    if table not in DATA_TABLES or not column:
        return
    validate_table_name(table)
    validate_column_name(column)
    model = DATA_TABLES[table]
    if "raw" in model.__table__.columns:
        raise RuntimeError(f"业务表 {table} 不是实体列结构，请先重建为实体列业务表")
    if column not in model.__table__.columns:
        raise RuntimeError(f"业务表 {table} 缺少 JOIN 实体列: {column}")
    name = _index_name(table, column)
    sql = (
        f"CREATE INDEX IF NOT EXISTS {quote_ident(name, kind='constraint')} "
        f"ON {quote_ident(table, kind='table')} "
        f"({quote_ident(column, kind='column')})"
    )
    await db.execute(text(sql))


async def ensure_indexes_for_relations(
    db: AsyncSession, alias_to_table: dict[str, str], relations: list
) -> None:
    """为一组关系（含 keys: [{left,right}]）的两侧关联列建索引。

    relations 元素需有 left_alias/right_alias 和 keys（dict 列表，含 left/right）。
    """
    for r in relations:
        la = getattr(r, "left_alias", None) or (r.get("left_alias") if isinstance(r, dict) else None)
        ra = getattr(r, "right_alias", None) or (r.get("right_alias") if isinstance(r, dict) else None)
        keys = getattr(r, "keys", None)
        if keys is None and isinstance(r, dict):
            keys = r.get("keys")
        lt = alias_to_table.get(la)
        rt = alias_to_table.get(ra)
        for k in (keys or []):
            lc = k.get("left") if isinstance(k, dict) else getattr(k, "left", None)
            rc = k.get("right") if isinstance(k, dict) else getattr(k, "right", None)
            if lt and lc:
                await _ensure_one(db, lt, lc)
            if rt and rc:
                await _ensure_one(db, rt, rc)
    await db.commit()


async def ensure_indexes_for_all_datasets(db: AsyncSession) -> int:
    """启动时给所有已存在数据集的关联键补建索引；返回处理的关系数。"""
    rels = (await db.execute(select(DataSetRelation))).scalars().all()
    if not rels:
        return 0
    tables = (await db.execute(select(DataSetTable))).scalars().all()
    by_ds: dict[int, dict[str, str]] = {}
    for t in tables:
        by_ds.setdefault(t.dataset_id, {})[t.alias] = t.table_name
    for r in rels:
        await ensure_indexes_for_relations(db, by_ds.get(r.dataset_id, {}), [r])
    return len(rels)
