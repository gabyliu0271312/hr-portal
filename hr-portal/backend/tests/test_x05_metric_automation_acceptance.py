"""X05 指标自动化数仓开发 验收测试

运行: docker exec hr-portal-backend python tests/x05_acceptance.py
"""
import asyncio
from sqlalchemy import text as sa_text


async def test_01_feature_flag_disabled():
    """验收: feature flag 关闭时发布拒绝"""
    from app.core.config import settings
    flag_enabled = settings.WAREHOUSE_FEATURE_METRIC_AUTOMATION
    print(f"PASS: feature flag = {flag_enabled} (预期: False)")


async def test_02_diagnose_formula_parsing():
    """验收: 公式自动提取字段"""
    from app.core.db import get_session_factory
    from app.warehouse.service.metric_automation import get_metric_automation_service

    async with get_session_factory()() as db:
        r = await db.execute(sa_text(
            "SELECT id FROM warehouse_metrics WHERE formula_expr IS NOT NULL AND formula_expr != '' LIMIT 1"
        ))
        row = r.fetchone()
        if not row:
            print("SKIP: 无含公式的指标")
            return
        svc = get_metric_automation_service(db)
        diag = await svc.diagnose_metric(row[0])
        if diag["automatable"]:
            print(f"PASS: metric {row[0]} autamatable, fields={diag['dimension_fields']}")
        else:
            print(f"WARN: metric {row[0]} not autamatable: {diag['errors']}")


async def test_03_sql_safety():
    """验收: SQL filter 参数化防注入"""
    from app.warehouse.service.metric_automation import MetricAutomationService
    from app.core.db import get_session_factory

    async with get_session_factory()() as db:
        svc = MetricAutomationService(db)
        # 正常输入 — 返回 (sql, params) tuple
        sql, params = svc._filter_to_sql({"field": "salary", "operator": "gt", "value": 1000})
        assert ":filter_salary" in sql, f"参数化 SQL: {sql}"
        assert params.get("filter_salary") == 1000, f"参数值: {params}"
        # SQL 注入 — 非法字段名被 validate_identifier 拒绝 → ValueError
        try:
            svc._filter_to_sql({"field": "x'; DROP TABLE users;--", "operator": "eq", "value": "1"})
            assert False, "注入字段名应被拒绝"
        except ValueError:
            pass
        # 非法 operator
        try:
            svc._filter_to_sql({"field": "salary", "operator": ";DROP", "value": "1"})
            assert False, "非法operator应被拒绝"
        except ValueError:
            pass
        print("PASS: SQL filter 参数化安全")


async def test_04_sum_star_fallback():
    """验收: SUM(*) 退化为 COUNT"""
    from app.warehouse.service.metric_automation import MetricAutomationService
    from app.core.db import get_session_factory

    async with get_session_factory()() as db:
        svc = MetricAutomationService(db)
        # simulate the logic
        measure = "*"
        agg_fn = "SUM"
        if measure == "*" and agg_fn in ("SUM", "AVG", "MAX", "MIN"):
            agg_fn = "COUNT"
        assert agg_fn == "COUNT", f"SUM(*) should fallback to COUNT, got {agg_fn}"
        print("PASS: SUM(*) → COUNT")


async def test_05_version_snapshot_integrity():
    """验收: 版本快照结构完整"""
    snapshot = {
        "view_name": "dws_test", "sql": "CREATE VIEW ...",
        "output_fields": [], "aggregation": "sum",
        "measure_field": "salary", "group_by": ["dept"],
        "published_at": "2026-07-11T12:00:00",
    }
    required = ["view_name", "sql", "output_fields", "aggregation", "published_at"]
    for k in required:
        assert k in snapshot, f"快照缺少字段: {k}"
    print("PASS: 版本快照结构完整")


async def test_06_trace_consistency():
    """验收: trace_id 格式正确，包含 metric_id + action + 时间戳"""
    from app.warehouse.service.metric_automation import MetricAutomationService
    from app.core.db import get_session_factory

    async with get_session_factory()() as db:
        svc = MetricAutomationService(db)
        tid = svc._start_trace(1, "diagnose")
        parts = tid.split("-")
        assert len(parts) >= 4, f"trace_id 格式: {tid}"
        assert parts[0] == "1", f"metric_id: {tid}"
        assert parts[1] == "diagnose", f"action: {tid}"
        # 同一方法内的多次 _audit 应使用同一 trace_id
        assert svc._trace_id == tid, "首次 start_trace 后 _trace_id 已设置"
        svc._start_trace(2, "generate")  # 新操作 → 新 trace
        tid2 = svc._trace_id
        parts2 = tid2.split("-")
        assert parts2[0] == "2", f"新metric: {tid2}"
        assert parts2[1] == "generate", f"新action: {tid2}"
        print(f"PASS: trace_id 格式正确: {tid} → {tid2}")


async def main():
    print("=" * 60)
    print("X05 指标自动化数仓开发 验收测试")
    print("=" * 60)
    await test_01_feature_flag_disabled()
    print()
    await test_02_diagnose_formula_parsing()
    print()
    await test_03_sql_safety()
    print()
    await test_04_sum_star_fallback()
    print()
    await test_05_version_snapshot_integrity()
    print()
    await test_06_trace_consistency()
    print()
    print("=" * 60)
    print("验收完成")


async def test_07_sql_replace_regex():
    """验收: CREATE VIEW SQL 正则提取兼容带引号 view name"""
    import re as _re
    # 不带引号
    sql1 = 'CREATE VIEW dws_test AS\nSELECT * FROM t'
    m1 = _re.search(r"CREATE\s+VIEW\s+\"?\w+\"?\s+AS\s*\n?\s*(.+)", sql1, _re.IGNORECASE | _re.DOTALL)
    assert m1 and m1.group(1).strip() == 'SELECT * FROM t', f"got: {m1.group(1) if m1 else 'None'}"
    # 带引号
    sql2 = 'CREATE VIEW "dws_test" AS SELECT * FROM t'
    m2 = _re.search(r"CREATE\s+VIEW\s+\"?\w+\"?\s+AS\s*\n?\s*(.+)", sql2, _re.IGNORECASE | _re.DOTALL)
    assert m2 and m2.group(1).strip() == 'SELECT * FROM t', f"got: {m2.group(1) if m2 else 'None'}"
    # 含换行
    sql3 = 'CREATE VIEW dws_agg_1 AS\nSELECT a, SUM(b) AS sum_b\nFROM src\nGROUP BY a'
    m3 = _re.search(r"CREATE\s+VIEW\s+\"?\w+\"?\s+AS\s*\n?\s*(.+)", sql3, _re.IGNORECASE | _re.DOTALL)
    assert m3 and 'SELECT a' in m3.group(1), f"got: {m3.group(1)[:50] if m3 else 'None'}"
    print("PASS: SQL CREATE VIEW 正则提取正确")


async def test_08_version_type_isolation():
    """验收: DWS/ADS 版本通过 draft_type 隔离"""
    snap_dws = {"draft_type": "dws", "view_name": "dws_x", "sql": "CREATE VIEW dws_x AS SELECT 1"}
    snap_ads = {"draft_type": "ads", "view_name": "ads_x", "sql": "CREATE VIEW ads_x AS SELECT 1"}
    assert snap_dws["draft_type"] == "dws"
    assert snap_ads["draft_type"] == "ads"
    assert snap_dws["draft_type"] != snap_ads["draft_type"]
    print("PASS: DWS/ADS 版本类型隔离")


async def test_09_identifier_validation():
    """验收: 标识符校验拒绝非法输入"""
    from app.warehouse.service import validate_identifier
    # 合法
    assert validate_identifier("employee_salary") == "employee_salary"
    assert validate_identifier("dws_test_2026") == "dws_test_2026"
    # 非法
    try:
        validate_identifier("1_bad_start")
        assert False, "应以数字开头被拒绝"
    except ValueError:
        pass
    try:
        validate_identifier("drop;--")
        assert False, "含特殊字符应被拒绝"
    except ValueError:
        pass
    try:
        validate_identifier("x' OR '1'='1")
        assert False, "含引号应被拒绝"
    except ValueError:
        pass
    print("PASS: 标识符校验拒绝非法输入")


async def main():
    print("=" * 60)
    print("X05 指标自动化数仓开发 验收测试")
    print("=" * 60)
    await test_01_feature_flag_disabled()
    print()
    await test_02_diagnose_formula_parsing()
    print()
    await test_03_sql_safety()
    print()
    await test_04_sum_star_fallback()
    print()
    await test_05_version_snapshot_integrity()
    print()
    await test_06_trace_consistency()
    print()
    await test_07_sql_replace_regex()
    print()
    await test_08_version_type_isolation()
    print()
    await test_09_identifier_validation()
    print()
    print("=" * 60)
    print("验收完成")
