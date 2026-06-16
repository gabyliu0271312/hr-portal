"""一次性脚本：给已存的实体表数据回写 org_node_code。

用法（容器内）：
    docker compose exec backend python scripts/backfill_scope_codes.py
"""
import asyncio

from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.data.dynamic_loader import load_dynamic_tables
from app.data.models import DATA_TABLES
from app.datasources.sync_service import _inject_org_node_code


async def main() -> None:
    async with AsyncSessionLocal() as db:
        await load_dynamic_tables(db)
        model = DATA_TABLES.get("emp_realtime_roster")
        if model is None:
            raise RuntimeError("emp_realtime_roster 未注册")
        if "raw" in model.__table__.columns:
            raise RuntimeError("emp_realtime_roster 不是实体列结构，请先重建为实体列业务表")
        if "org_node_code" not in model.__table__.columns:
            raise RuntimeError("emp_realtime_roster 缺少实体列 org_node_code")

        roster = (await db.execute(select(model))).scalars().all()
        for r in roster:
            row = {
                col.name: getattr(r, col.name)
                for col in model.__table__.columns
                if hasattr(r, col.name)
            }
            before = row.get("org_node_code")
            _inject_org_node_code(row)
            after = row.get("org_node_code")
            if after != before:
                setattr(r, "org_node_code", after)
        print(f"[roster] processed {len(roster)} rows")

        await db.commit()
        print("[backfill] done")


if __name__ == "__main__":
    asyncio.run(main())
