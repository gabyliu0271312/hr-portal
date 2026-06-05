"""一次性脚本：基于已存的 raw 数据重建 cost_center_tree 与 org_tree。

用法（容器内）：
    docker compose exec backend python scripts/rebuild_trees.py
"""
import asyncio

from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.data.models import CostCenterMonthly, EmpRealtimeRoster
from app.datasources.sync_service import _sync_cc_tree, _sync_org_tree


async def main() -> None:
    async with AsyncSessionLocal() as db:
        cc_rows = [r.raw for r in (await db.execute(select(CostCenterMonthly))).scalars().all()]
        roster_rows = [r.raw for r in (await db.execute(select(EmpRealtimeRoster))).scalars().all()]
        print(f"[rebuild] cc rows = {len(cc_rows)}, roster rows = {len(roster_rows)}")
        await _sync_cc_tree(cc_rows, db)
        await _sync_org_tree(roster_rows, db)
        await db.commit()
        print("[rebuild] done")


if __name__ == "__main__":
    asyncio.run(main())
