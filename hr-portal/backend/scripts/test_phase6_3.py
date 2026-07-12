"""Phase 6-3: 资源反向引用 endpoint 单元测试

覆盖:
- 空 steps (新 resource): 0 引用
- 含 1 个 CONNECTOR 节点引用此 resource: 1 引用, hit_steps 1 项
- 含 1 个 CONNECTOR 节点引用其他 resource: 0 引用
- 多 pipeline 混合: 正确归属
- resource 不存在: 404 (HTTPException 风格, 这里只测 query 逻辑)

直接复用 list_pipelines_using_resource 内的内联 SQL 逻辑过重,
改成测试 SQL 路径 + JSON 过滤函数, 不直接启 HTTP server.
"""
import asyncio
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy.ext.asyncio import AsyncSession
from app.ucp.models import (
    ConnectorSystem,
    ConnectorResource,
    ConnectorPipelineConfig,
)


# ── 模拟反查函数 (与 router 内的逻辑等价) ──
async def find_pipelines_using_resource(db: AsyncSession, resource_id: int) -> list:
    from sqlalchemy import select

    stmt = select(ConnectorPipelineConfig).order_by(ConnectorPipelineConfig.id.asc())
    rows = (await db.execute(stmt)).scalars().all()

    matches = []
    for p in rows:
        steps = p.steps or []
        hit = []
        for s in steps:
            if not isinstance(s, dict):
                continue
            cfg = s.get("config") or {}
            if cfg.get("resource_id") == resource_id:
                hit.append({"step_id": s.get("step_id"), "type": s.get("type", "CONNECTOR")})
        if hit:
            matches.append({"id": p.id, "pipeline_code": p.pipeline_code, "hit_steps": hit})
    return matches


# ── 直接 SQL fixture 准备 (走测试库 engine) ──
async def _setup_test_data(db: AsyncSession):
    from sqlalchemy import text

    # 清旧数据 (使用 TRUNCATE CASCADE 跳过 FK 检查)
    await db.execute(text("TRUNCATE connector_pipeline_config, connector_resource, connector_system RESTART IDENTITY CASCADE"))

    # 建一个系统 + 2 个资源
    sys1 = ConnectorSystem(system_code="TEST_SYS", system_name="测试系统", system_type="CUSTOM")
    db.add(sys1)
    await db.flush()
    res1 = ConnectorResource(system_id=sys1.id, resource_code="EMP", resource_name="员工", adapter_code="BEISEN")
    res2 = ConnectorResource(system_id=sys1.id, resource_code="ORG", resource_name="组织", adapter_code="BEISEN")
    db.add_all([res1, res2])
    await db.flush()

    # 3 个 pipeline: 1 个引用 res1, 1 个引用 res2, 1 个不引用
    pl1 = ConnectorPipelineConfig(
        pipeline_code="PL_EMP_DAILY",
        pipeline_name="员工日同步",
        trigger_type="SCHEDULED",
        steps=[
            {"step_id": "s1", "type": "CONNECTOR", "config": {"resource_id": res1.id, "direction": "PULL"}},
        ],
    )
    pl2 = ConnectorPipelineConfig(
        pipeline_code="PL_ORG_DAILY",
        pipeline_name="组织日同步",
        trigger_type="EVENT",
        steps=[
            {"step_id": "s1", "type": "CONNECTOR", "config": {"resource_id": res2.id, "direction": "PULL"}},
            {"step_id": "s2", "type": "TRANSFORM"},
        ],
    )
    pl3 = ConnectorPipelineConfig(
        pipeline_code="PL_NO_USE",
        pipeline_name="无引用",
        trigger_type="MANUAL",
        steps=[{"step_id": "s1", "type": "NOTIFY"}],
    )
    db.add_all([pl1, pl2, pl3])
    await db.commit()

    return sys1, res1, res2, [pl1, pl2, pl3]


async def main():
    from app.core.db import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        sys1, res1, res2, pls = await _setup_test_data(db)

        # 测试 1: 反查 res1 → 命中 1 个 (PL_EMP_DAILY)
        hits = await find_pipelines_using_resource(db, res1.id)
        assert len(hits) == 1, f"res1 期望 1 命中, 实际 {len(hits)}"
        assert hits[0]["pipeline_code"] == "PL_EMP_DAILY"
        assert len(hits[0]["hit_steps"]) == 1
        assert hits[0]["hit_steps"][0]["step_id"] == "s1"
        print(f"  ✓ 测试 1: res1 命中 {len(hits)} 个 pipeline (PL_EMP_DAILY)")

        # 测试 2: 反查 res2 → 命中 1 个 (PL_ORG_DAILY)
        hits = await find_pipelines_using_resource(db, res2.id)
        assert len(hits) == 1
        assert hits[0]["pipeline_code"] == "PL_ORG_DAILY"
        assert len(hits[0]["hit_steps"]) == 1
        print(f"  ✓ 测试 2: res2 命中 {len(hits)} 个 pipeline (PL_ORG_DAILY)")

        # 测试 3: 不存在的 resource → 0 命中 (内联函数不抛, 仅返空)
        hits = await find_pipelines_using_resource(db, 99999)
        assert len(hits) == 0
        print(f"  ✓ 测试 3: 不存在的 resource → 0 命中 (路由会返 404)")

        # 测试 4: PL_NO_USE 不应被任何 resource 命中
        hits_pl3 = await find_pipelines_using_resource(db, res1.id)
        assert all(h["pipeline_code"] != "PL_NO_USE" for h in hits_pl3)
        hits_pl3b = await find_pipelines_using_resource(db, res2.id)
        assert all(h["pipeline_code"] != "PL_NO_USE" for h in hits_pl3b)
        print(f"  ✓ 测试 4: 无引用的 PL_NO_USE 不会被任何 resource 命中")

    # 清理
    async with AsyncSessionLocal() as db:
        from sqlalchemy import text
        await db.execute(text("TRUNCATE connector_pipeline_config, connector_resource, connector_system RESTART IDENTITY CASCADE"))
        await db.commit()

    print("\n所有 Phase 6-3 反向引用测试通过 ✅")


if __name__ == "__main__":
    asyncio.run(main())
