# -*- coding: utf-8 -*-
"""MR0305 整改计划 3：AI-ready 上下文输出增强测试。

覆盖：
- 单元测试：_sanitize_measure_values 过滤 _errors 与复杂结构；_build_ai_context_warnings 转换分母为 0 警告
- 集成测试（真实 Postgres）：
  - 管理员(full) 返回真实聚合值（非类型名）
  - 普通用户(summary_only) 只返回 summary_value，不泄露行明细
  - 分母为 0 返回结构化 warnings
  - 响应不包含敏感字段关键词（employee_name / salary_detail / credential / password / token）
  - GET 内部写 ai_context_view 审计事件

运行：pytest tests/test_warehouse_ai_context.py -v
（需 docker compose 栈已启动，连接真实 Postgres）
"""
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import text as sa_text

from app.core.db import get_session_factory
from app.datasets.models import WarehouseMetric
from app.warehouse.models import (
    MetricResult,
    MetricResultRow,
    AutomationAuditEvent,
)
from app.warehouse.router import (
    get_metric_ai_context,
    _sanitize_measure_values,
    _build_ai_context_warnings,
)

SENSITIVE_KEYS = {"employee_name", "salary_detail", "credential", "password", "token"}


@pytest.fixture(autouse=True)
async def _reset_engine_pool():
    """每个异步测试后释放连接池，避免 asyncpg 连接跨事件循环失效。"""
    yield
    from app.core.db import engine
    await engine.dispose()


async def _fake_admin(u, db):
    return True


async def _fake_not_admin(u, db):
    return False


async def _build_metric(db, suf, with_warnings=False):
    m = WarehouseMetric(
        metric_code=f"ai_ctx_{suf}",
        metric_name="AI上下文测试",
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
            "summary_value": 0.0417,
            "dimensions": ["department"],
            "measures": ["numerator", "denominator", "rate"],
            "row_count": 2,
        },
    )
    db.add(result)
    await db.flush()
    rows = [
        MetricResultRow(
            result_id=result.id, metric_id=m.id, period="2026-07", row_index=0,
            dimension_values={"department": "销售部"},
            measure_values={"numerator": 5, "denominator": 120, "rate": 0.0417},
            value=0.0417,
        ),
        MetricResultRow(
            result_id=result.id, metric_id=m.id, period="2026-07", row_index=1,
            dimension_values={"department": "研发部"},
            measure_values={"numerator": 4, "denominator": 96, "rate": 0.0417},
            value=0.0417,
        ),
    ]
    if with_warnings:
        # 模拟分母为 0 的行（与 modeling.py 一致：_errors 内部键 + result.value.warnings）
        rows[1].measure_values = {
            "numerator": 0, "denominator": 0,
            "rate": None, "_errors": {"rate": "denominator_zero"},
        }
        result.value = {
            "summary_value": 0.0417,
            "dimensions": ["department"],
            "measures": ["numerator", "denominator", "rate"],
            "row_count": 2,
            "warnings": {
                "denominator_zero_count": 1,
                "denominator_zero_dimension_values": [{"department": "研发部"}],
            },
        }
    for r in rows:
        db.add(r)
    await db.commit()
    return m, result


def _has_sensitive_key(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k.lower() in SENSITIVE_KEYS:
                return True
            if _has_sensitive_key(v):
                return True
    elif isinstance(obj, list):
        for v in obj:
            if _has_sensitive_key(v):
                return True
    return False


async def _cleanup(db, mid):
    import app.permissions.masker as masker
    orig = getattr(masker, "_is_super_admin", None)
    # 删除审计 + 结果行 + 结果 + 指标
    await db.execute(sa_text(
        "DELETE FROM warehouse_automation_audit_events WHERE metric_id=:mid"
    ).bindparams(mid=mid))
    await db.execute(sa_text(
        "DELETE FROM metric_result_rows WHERE metric_id=:mid"
    ).bindparams(mid=mid))
    await db.execute(sa_text(
        "DELETE FROM metric_results WHERE metric_id=:mid"
    ).bindparams(mid=mid))
    await db.execute(sa_text(
        "DELETE FROM warehouse_metrics WHERE id=:mid"
    ).bindparams(mid=mid))
    await db.commit()
    return orig


# ==================== 单元测试：sanitize / warnings ====================

def test_sanitize_measure_values_real_values():
    """_sanitize_measure_values 过滤 _errors 与嵌套结构，只留标量真实值。"""
    mv = {
        "numerator": 5, "denominator": 120, "rate": 0.0417,
        "_errors": {"rate": "denominator_zero"}, "nested": {"x": 1},
    }
    out = _sanitize_measure_values(mv)
    assert out == {"numerator": 5, "denominator": 120, "rate": 0.0417}, out
    assert "_errors" not in out
    assert "nested" not in out


def test_sanitize_measure_values_empty():
    assert _sanitize_measure_values({}) == {}
    assert _sanitize_measure_values(None) == {}


def test_build_ai_context_warnings_denominator_zero():
    rv = {"warnings": {"denominator_zero_count": 2, "denominator_zero_dimension_values": [{"d": "x"}]}}
    ws = _build_ai_context_warnings(rv)
    assert len(ws) == 1
    assert ws[0]["code"] == "denominator_zero"
    assert "2" in ws[0]["message"]


def test_build_ai_context_warnings_none():
    assert _build_ai_context_warnings(None) == []
    assert _build_ai_context_warnings({"summary_value": 1}) == []


# ==================== 集成测试：真实 Postgres ====================

async def test_ai_context_returns_real_measure_values():
    """管理员(full)：measures 返回真实聚合值，非类型名。"""
    suf = uuid.uuid4().hex[:8]
    user = SimpleNamespace(id=1)
    import app.permissions.masker as masker
    orig = masker._is_super_admin
    masker._is_super_admin = _fake_admin
    async with get_session_factory()() as db:
        try:
            m, _ = await _build_metric(db, suf)
            ctx = await get_metric_ai_context(m.id, "2026-07", None, None, user, db)
            assert ctx.permission_level == "full"
            assert ctx.measures == {"numerator": 5, "denominator": 120, "rate": 0.0417}, ctx.measures
            assert ctx.dimensions == {"department": "销售部"}
            assert ctx.summary_value == 0.0417
        finally:
            masker._is_super_admin = orig
            await _cleanup(db, m.id)


async def test_ai_context_summary_only_for_regular_user():
    """普通用户(summary_only)：只返回 summary_value，不返回行明细（fail closed）。"""
    suf = uuid.uuid4().hex[:8]
    user = SimpleNamespace(id=2)
    import app.permissions.masker as masker
    orig = masker._is_super_admin
    masker._is_super_admin = _fake_not_admin
    async with get_session_factory()() as db:
        try:
            m, _ = await _build_metric(db, suf)
            ctx = await get_metric_ai_context(m.id, "2026-07", None, None, user, db)
            assert ctx.permission_level == "summary_only"
            assert ctx.measures == {"summary_value": 0.0417}, ctx.measures
            # 不泄露具体维度明细
            assert ctx.dimensions is None
        finally:
            masker._is_super_admin = orig
            await _cleanup(db, m.id)


async def test_ai_context_warnings_on_denominator_zero():
    """分母为 0：返回结构化 warnings（code=denominator_zero）。"""
    suf = uuid.uuid4().hex[:8]
    user = SimpleNamespace(id=1)
    import app.permissions.masker as masker
    orig = masker._is_super_admin
    masker._is_super_admin = _fake_admin
    async with get_session_factory()() as db:
        try:
            m, _ = await _build_metric(db, suf, with_warnings=True)
            ctx = await get_metric_ai_context(m.id, "2026-07", None, None, user, db)
            assert len(ctx.warnings) == 1
            assert ctx.warnings[0]["code"] == "denominator_zero"
        finally:
            masker._is_super_admin = orig
            await _cleanup(db, m.id)


async def test_ai_context_no_sensitive_fields():
    """响应不包含敏感字段关键词（employee_name / salary_detail / credential / password / token）。"""
    suf = uuid.uuid4().hex[:8]
    user = SimpleNamespace(id=1)
    import app.permissions.masker as masker
    orig = masker._is_super_admin
    masker._is_super_admin = _fake_admin
    async with get_session_factory()() as db:
        try:
            m, _ = await _build_metric(db, suf)
            ctx = await get_metric_ai_context(m.id, "2026-07", None, None, user, db)
            dumped = ctx.model_dump()
            assert not _has_sensitive_key(dumped), "响应含敏感字段关键词"
        finally:
            masker._is_super_admin = orig
            await _cleanup(db, m.id)


async def test_ai_context_audits_access():
    """GET /ai-context 内部写 ai_context_view 审计事件。"""
    suf = uuid.uuid4().hex[:8]
    user = SimpleNamespace(id=7)
    import app.permissions.masker as masker
    orig = masker._is_super_admin
    masker._is_super_admin = _fake_admin
    async with get_session_factory()() as db:
        try:
            m, _ = await _build_metric(db, suf)
            ctx = await get_metric_ai_context(m.id, "2026-07", None, None, user, db)
            # 审计已随函数内 commit 落库
            evs = (await db.execute(
                sa_text(
                    "SELECT action, input_json FROM warehouse_automation_audit_events "
                    "WHERE metric_id=:mid AND action=:act ORDER BY id DESC"
                ).bindparams(mid=m.id, act="ai_context_view")
            )).all()
            assert len(evs) >= 1, "未生成 ai_context_view 审计"
            ev = evs[0]
            assert ev[0] == "ai_context_view"
            ij = ev[1]
            assert ij["permission_level"] == ctx.permission_level
            assert ij["dimension_filter"] == {"dimension_key": None, "dimension_value": None}
        finally:
            masker._is_super_admin = orig
            await _cleanup(db, m.id)
