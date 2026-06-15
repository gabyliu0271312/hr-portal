"""一次性脚本：基于已存的实体表数据重建 cost_center_tree 与 org_tree。

用法（容器内）：
    docker compose exec backend python scripts/rebuild_trees.py
"""
import asyncio

from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.data.dynamic_loader import load_dynamic_tables
from app.data.models import DATA_TABLES
from app.datasources.sync_service import _sync_cc_tree, _sync_org_tree


async def _load_entity_rows(table_name: str, db) -> list[dict]:
    model = DATA_TABLES.get(table_name)
    if model is None:
        raise RuntimeError(f"{table_name} 未注册")
    if "raw" in model.__table__.columns:
        raise RuntimeError(f"{table_name} 仍是 raw JSON 结构，请先重建为实体表")
    rows = (await db.execute(select(model))).scalars().all()
    columns = [col.name for col in model.__table__.columns]
    return [
        {name: getattr(row, name) for name in columns if hasattr(row, name)}
        for row in rows
    ]


async def main() -> None:
    async with AsyncSessionLocal() as db:
        await load_dynamic_tables(db)
        cc_rows = await _load_entity_rows("cost_center_monthly", db)
        roster_rows = await _load_entity_rows("emp_realtime_roster", db)
        print(f"[rebuild] cc rows = {len(cc_rows)}, roster rows = {len(roster_rows)}")
        await _sync_cc_tree(cc_rows, db)
        await _sync_org_tree(roster_rows, db)
        await db.commit()
        print("[rebuild] done")


if __name__ == "__main__":
    asyncio.run(main())
