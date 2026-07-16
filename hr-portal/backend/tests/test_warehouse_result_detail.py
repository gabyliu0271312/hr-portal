# -*- coding: utf-8 -*-
"""指标结果明细页 API 测试（MR0101/0102/0105/0106/0107）

覆盖：
- MR0101 结果明细分页：total / page / page_size / 当前页行数
- MR0102 结果明细导出：返回 CSV（维度列+度量列+值），utf-8-sig，全量行
- MR0106 失败/权限态：非管理员导出 403、明细仅 summary_only（rows=None）
- MR0105 空态由前端 el-table empty-text 承载（后端 rows=[] 即空明细）

运行: pytest tests/test_warehouse_result_detail.py -v
"""
import asyncio
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import text as sa_text

from app.core.db import get_session_factory
from app.datasets.models import WarehouseMetric
from app.warehouse.models import MetricResult, MetricResultRow
from app.warehouse.router import get_metric_result_detail, export_metric_result


@pytest.fixture(autouse=True)
async def _reset_engine_pool():
    """每个异步测试后释放连接池，避免 asyncpg 连接跨事件循环失效（仅测试副作用）。"""
    yield
    from app.core.db import engine
    await engine.dispose()


async def _fake_admin(u, db):
    return True


async def _fake_not_admin(u, db):
    return False


async def _build_metric(db, suf):
    m = WarehouseMetric(
        metric_code=f"rd_test_{suf}",
        metric_name="结果明细测试",
        metric_type="ratio",
        formula_sql="1.0",
        status="published",
    )
    db.add(m)
    await db.flush()
    result = MetricResult(
        metric_id=m.id,
        period="2026-07",
        value={
            "summary_value": 0.3,
            "dimensions": ["dept"],
            "measures": ["numerator", "denominator", "rate"],
            "row_count": 3,
        },
    )
    db.add(result)
    await db.flush()
    rows = [
        MetricResultRow(
            result_id=result.id, metric_id=m.id, period="2026-07", row_index=0,
            dimension_values={"dept": "销售部"},
            measure_values={"numerator": 1, "denominator": 5, "rate": 0.2},
            value=0.2,
        ),
        MetricResultRow(
            result_id=result.id, metric_id=m.id, period="2026-07", row_index=1,
            dimension_values={"dept": "研发部"},
            measure_values={"numerator": 2, "denominator": 5, "rate": 0.4},
            value=0.4,
        ),
        MetricResultRow(
            result_id=result.id, metric_id=m.id, period="2026-07", row_index=2,
            dimension_values={"dept": "财务部"},
            measure_values={"numerator": 0, "denominator": 2, "rate": 0.0},
            value=0.0,
        ),
    ]
    for r in rows:
        db.add(r)
    await db.commit()
    return m, result


async def test_result_detail_pagination():
    """MR0101：分页元数据正确，当前页只返回 page_size 行。"""
    suf = uuid.uuid4().hex[:8]
    user = SimpleNamespace(id=1)
    async with get_session_factory()() as db:
        m, result = await _build_metric(db, suf)
        try:
            # 管理员视角（monkeypatch 超管判断）
            import app.permissions.masker as masker
            orig = masker._is_super_admin
            masker._is_super_admin = _fake_admin

            det = await get_metric_result_detail(m.id, result.id, "2026-07", 1, 2, user, db)
            assert det["total"] == 3, det
            assert det["page"] == 1 and det["page_size"] == 2
            assert len(det["rows"]) == 2, "第一页应只有 2 行"
            assert det["permission_level"] == "full"

            det2 = await get_metric_result_detail(m.id, result.id, "2026-07", 2, 2, user, db)
            assert len(det2["rows"]) == 1, "第二页应只剩 1 行"
            assert det2["page"] == 2

            masker._is_super_admin = orig
        finally:
            await db.execute(sa_text("DELETE FROM metric_result_rows WHERE metric_id=:mid").bindparams(mid=m.id))
            await db.execute(sa_text("DELETE FROM metric_results WHERE metric_id=:mid").bindparams(mid=m.id))
            await db.execute(sa_text("DELETE FROM warehouse_metrics WHERE id=:mid").bindparams(mid=m.id))
            await db.commit()


async def test_result_detail_export_csv():
    """MR0102：导出返回 CSV，含维度列+度量列+值，全量 3 行。"""
    suf = uuid.uuid4().hex[:8]
    user = SimpleNamespace(id=1)
    async with get_session_factory()() as db:
        m, result = await _build_metric(db, suf)
        try:
            import app.permissions.masker as masker
            orig = masker._is_super_admin
            masker._is_super_admin = _fake_admin

            resp = await export_metric_result(m.id, result.id, "2026-07", user, db)
            assert resp.media_type.startswith("text/csv"), resp.media_type
            text = resp.body.decode("utf-8-sig")
            # csv.writer 在容器内产出 \r\n，统一去尾 \r
            lines = [ln.rstrip("\r") for ln in text.strip().split("\n") if ln]
            # 表头：维度列 dept + 度量列 numerator/denominator/rate + value
            assert lines[0] == "dept,numerator,denominator,rate,value", lines[0]
            assert len(lines) == 4, f"应包含表头+3 行，实际 {len(lines)}"
            joined = "\n".join(lines)
            for d in ("销售部", "研发部", "财务部"):
                assert d in joined, f"缺失部门 {d}"

            masker._is_super_admin = orig
        finally:
            await db.execute(sa_text("DELETE FROM metric_result_rows WHERE metric_id=:mid").bindparams(mid=m.id))
            await db.execute(sa_text("DELETE FROM metric_results WHERE metric_id=:mid").bindparams(mid=m.id))
            await db.execute(sa_text("DELETE FROM warehouse_metrics WHERE id=:mid").bindparams(mid=m.id))
            await db.commit()


async def test_result_detail_permission_states():
    """MR0106：非管理员导出 403；明细仅 summary_only（隐藏 rows）。"""
    suf = uuid.uuid4().hex[:8]
    user = SimpleNamespace(id=1)
    async with get_session_factory()() as db:
        m, result = await _build_metric(db, suf)
        try:
            import app.permissions.masker as masker
            orig = masker._is_super_admin
            masker._is_super_admin = _fake_not_admin

            # 导出应被拒绝
            with pytest.raises(HTTPException) as exc:
                await export_metric_result(m.id, result.id, "2026-07", user, db)
            assert exc.value.status_code == 403, exc.value.status_code

            # 明细仅 summary_only，rows 隐藏
            det = await get_metric_result_detail(m.id, result.id, "2026-07", 1, 50, user, db)
            assert det["permission_level"] == "summary_only"
            assert det["rows"] is None
            assert det["summary_value"] == 0.3

            masker._is_super_admin = orig
        finally:
            await db.execute(sa_text("DELETE FROM metric_result_rows WHERE metric_id=:mid").bindparams(mid=m.id))
            await db.execute(sa_text("DELETE FROM metric_results WHERE metric_id=:mid").bindparams(mid=m.id))
            await db.execute(sa_text("DELETE FROM warehouse_metrics WHERE id=:mid").bindparams(mid=m.id))
            await db.commit()
