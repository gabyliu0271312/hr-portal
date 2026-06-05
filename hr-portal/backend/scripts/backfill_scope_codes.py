"""一次性脚本：给已存的 raw 数据回写 _org_node_code / _cc_code

用法（容器内）：
    docker compose exec backend python /app/backfill_scope_codes.py
"""
import asyncio

from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.data.models import CostCenterMonthly, EmpRealtimeRoster
from app.datasources.sync_service import _inject_cc_code, _inject_org_node_code


async def main() -> None:
    async with AsyncSessionLocal() as db:
        # roster
        roster = (await db.execute(select(EmpRealtimeRoster))).scalars().all()
        for r in roster:
            raw = dict(r.raw) if isinstance(r.raw, dict) else {}
            before = raw.get("_org_node_code")
            _inject_org_node_code(raw)
            if raw.get("_org_node_code") != before:
                r.raw = raw
        print(f"[roster] processed {len(roster)} rows")

        # cost_center_monthly
        cc = (await db.execute(select(CostCenterMonthly))).scalars().all()
        for r in cc:
            raw = dict(r.raw) if isinstance(r.raw, dict) else {}
            before = raw.get("_cc_code")
            _inject_cc_code(raw)
            if raw.get("_cc_code") != before:
                r.raw = raw
        print(f"[cc] processed {len(cc)} rows")

        await db.commit()
        print("[backfill] done")


if __name__ == "__main__":
    asyncio.run(main())
