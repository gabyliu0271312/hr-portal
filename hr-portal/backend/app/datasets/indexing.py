"""数据集关联键索引：给 JOIN 用到的 raw JSON 提取表达式建表达式索引。

数据集 JOIN 的关联条件是 jsonb_extract_path_text(raw,'列') 等值比较，无索引时
PostgreSQL 退化为嵌套循环 + 反复解析 JSON，数据量一大就慢到分钟级。给每个关联键
建表达式索引后，优化器可改用 hash/索引扫描，提速 2 个数量级。

幂等：CREATE INDEX IF NOT EXISTS；索引名按 (表, 列) 稳定 hash，避免重复。
"""
from __future__ import annotations

import hashlib

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import DATA_TABLES
from app.datasets.models import DataSet, DataSetRelation, DataSetTable
from sqlalchemy import select


def _index_name(table: str, column: str) -> str:
    h = hashlib.md5(f"{table}|{column}".encode("utf-8")).hexdigest()[:12]
    return f"ix_jk_{h}"


async def _ensure_one(db: AsyncSession, table: str, column: str) -> None:
    if table not in DATA_TABLES or not column:
        return
    name = _index_name(table, column)
    # column 经 md5 进索引名，这里把列名作为字符串字面量传给 jsonb_extract_path_text，
    # 用参数化避免注入：拼接索引 DDL 不支持绑定参数，故对列名做单引号转义。
    safe_col = column.replace("'", "''")
    sql = (
        f"CREATE INDEX IF NOT EXISTS {name} ON {table} "
        f"(jsonb_extract_path_text(raw::jsonb, '{safe_col}'))"
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
