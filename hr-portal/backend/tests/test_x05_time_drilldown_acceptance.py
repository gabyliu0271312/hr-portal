# -*- coding: utf-8 -*-
"""X05 多粒度时间下钻 · 一期 集成验收测试

覆盖 generate_dws_view 的时间列派生逻辑（modeling.py:744 起）：
- A. 未配置 time_field 的普通 DWS：**不**注册时间列、output_fields 不含时间列（防"元数据有列但视图无列"回归）
- B. 配置 DATE 类型 time_field：自动派生 snapshot_month(保留) + year/quarter/month 四列，值正确
- C. group_by 含与时间字段同源的维度：自动跳过，不出现重复时间列
- D. 字符串类型 time_field 含脏值（首行合法、后续 '2026年7月'/'202607'）：**全量扫描**后抛明确错误（验证 R7 抽样漏放已修复）
- E. 格式合规但日期无效（2026-99-01 / 2026-02-31）：正则通过后 ::date cast 全列扫描捕获

关键命名约定：
- DWS 视图名 = agg.name（generate_dws_view 用 agg.name 创建视图，modeling.py:1046）
- 返回值 view_name = ds_{agg.name}（数据集编码，不是 DB 视图名）
- 测试 agg.name = f"x05_{tag}" → DB 视图名 = "x05_a" / "x05_b" 等

运行: docker exec hr-portal-backend python tests/test_x05_time_drilldown_acceptance.py
pytest: docker exec hr-portal-backend python -m pytest /app/tests/test_x05_time_drilldown_acceptance.py -q
（依赖已执行迁移 alembic upgrade head，含 0100_add_dws_timefields）
"""
import asyncio
from datetime import date

from sqlalchemy import text as sa_text, select

from app.core.db import get_session_factory
from app.warehouse.service.modeling import DwsAggregateService
from app.warehouse.models import DwsAggregateDefinition, Dimension
from app.datasets.models import DataSet, DataSetTable, DatasetOutputField, WarehouseMetric


# ==================== 工具 ====================

TIME_COLS = ["snapshot_month", "year", "quarter", "month"]

# DWS 视图命名规则：view_name = agg.name（modeling.py:1046）
# 返回值 view_name 字段 = ds_{agg.name}（数据集编码）
# 以下统一用 agg.name (= f"x05_{tag}") 作为真实 DB 视图名


async def _cleanup_before(db, tag):
    """场景前置清理：清除可能残留的视图/表/元数据，确保幂等可重复执行。
    每步独立 try/rollback，避免单步失败阻塞后续清理。"""
    db_view = f"x05_{tag}"
    src = f"x05_src_{tag}"
    # ① 先删视图（可能依赖源表），再删源表 — 失败后 rollback 不影响后续元数据清理
    try:
        await db.execute(sa_text(f'DROP VIEW IF EXISTS "{db_view}"'))
        await db.execute(sa_text(f'DROP TABLE IF EXISTS "{src}"'))
        await db.commit()
    except Exception:  # noqa: BLE001
        await db.rollback()
    # ② 清理元数据行 — 同样独立 rollback
    try:
        await db.execute(sa_text("DELETE FROM table_columns WHERE table_name = :v"), {"v": db_view})
        await db.execute(sa_text("DELETE FROM registered_tables WHERE table_name = :v"), {"v": db_view})
        await db.execute(sa_text("DELETE FROM dws_aggregate_definitions WHERE name = :n"), {"n": f"x05_{tag}"})
        await db.execute(sa_text("DELETE FROM warehouse_metrics WHERE metric_code = :n"), {"n": f"x05_metric_{tag}"})
        await db.execute(sa_text("DELETE FROM dimensions WHERE dimension_code LIKE :p"), {"p": f"x05_%_{tag}"})
        await db.execute(sa_text(
            "DELETE FROM dataset_output_fields WHERE dataset_id IN "
            "(SELECT id FROM datasets WHERE name = :n)"
        ), {"n": f"ds_x05_{tag}"})
        await db.execute(sa_text(
            "DELETE FROM dataset_tables WHERE dataset_id IN "
            "(SELECT id FROM datasets WHERE name = :n)"
        ), {"n": f"ds_x05_{tag}"})
        await db.execute(sa_text(
            "DELETE FROM datasets WHERE name IN (:dwd, :dws)"
        ), {"dwd": f"ds_x05_{tag}", "dws": f"ds_x05_{tag}"})
        await db.commit()
    except Exception:  # noqa: BLE001
        await db.rollback()


async def _make_source_table(db, table, col_defs, rows):
    """建物理源表并插入数据。前置 _cleanup_before 已清理残留视图，此处 DROP TABLE 可安全执行。"""
    await db.execute(sa_text(f'DROP TABLE IF EXISTS "{table}"'))
    await db.execute(sa_text(f'CREATE TABLE "{table}" ({", ".join(col_defs)})'))
    for r in rows:
        cols = r.pop("__cols__")
        col_list = ", ".join(f'"{c}"' for c in cols)
        placeholders = ", ".join(f":{c}" for c in cols)
        params = {c: r[c] for c in cols}
        await db.execute(
            sa_text(f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders})'), params
        )
    await db.commit()


async def _register_dataset(db, tag, table, fields):
    """建 DWD 数据集 + 表关联 + 输出字段，返回 dataset id。"""
    ds = DataSet(name=f"ds_x05_{tag}", label=f"X05测试{tag}", warehouse_layer="DWD", status="published")
    db.add(ds)
    await db.flush()
    db.add(DataSetTable(dataset_id=ds.id, table_name=table, alias="a"))
    for f in fields:
        db.add(DatasetOutputField(
            dataset_id=ds.id, source_alias=f["source_alias"], source_column=f["source_column"],
            output_code=f["output_code"], output_label=f.get("output_label", f["output_code"]),
            data_type=f["data_type"],
        ))
    await db.flush()
    return ds


async def _add_dim(db, ds_id, code, name, bound_field):
    d = Dimension(dimension_code=code, dimension_name=name, source_dataset_id=ds_id, bound_field=bound_field)
    db.add(d)
    await db.flush()
    return d


async def _view_columns(db, db_view_name):
    """查 information_schema 获取视图真实列名。db_view_name = 实际 DB 视图名（agg.name）。"""
    rows = (await db.execute(sa_text(
        "SELECT column_name FROM information_schema.columns WHERE table_name = :t ORDER BY ordinal_position"
    ), {"t": db_view_name})).fetchall()
    return [r[0] for r in rows]


async def _teardown(db, tag, db_view_name, src_table):
    """清理测试产物。db_view_name = 实际 DB 视图名（agg.name = x05_{tag}）。"""
    try:
        # 先删视图（可能依赖源表），再删源表
        await db.execute(sa_text(f'DROP VIEW IF EXISTS "{db_view_name}"'))
        await db.execute(sa_text(f'DROP TABLE IF EXISTS "{src_table}"'))
        await db.execute(sa_text(
            "DELETE FROM table_columns WHERE table_name = :v"
        ), {"v": db_view_name})
        await db.execute(sa_text(
            "DELETE FROM registered_tables WHERE table_name = :v"
        ), {"v": db_view_name})
        await db.execute(sa_text(
            "DELETE FROM dws_aggregate_definitions WHERE name = :n"
        ), {"n": f"x05_{tag}"})
        await db.execute(sa_text(
            "DELETE FROM warehouse_metrics WHERE metric_code = :n"
        ), {"n": f"x05_metric_{tag}"})
        await db.execute(sa_text(
            "DELETE FROM dimensions WHERE dimension_code LIKE :p"
        ), {"p": f"x05_%_{tag}"})
        # 清理 DWS 数据集（generate_dws_view 会自动创建 ds_{agg.name}）
        await db.execute(sa_text(
            "DELETE FROM dataset_output_fields WHERE dataset_id IN "
            "(SELECT id FROM datasets WHERE name = :n)"
        ), {"n": f"ds_x05_{tag}"})
        await db.execute(sa_text(
            "DELETE FROM dataset_tables WHERE dataset_id IN "
            "(SELECT id FROM datasets WHERE name = :n)"
        ), {"n": f"ds_x05_{tag}"})
        await db.execute(sa_text(
            "DELETE FROM datasets WHERE name IN (:dwd, :dws)"
        ), {"dwd": f"ds_x05_{tag}", "dws": f"ds_x05_{tag}"})
        await db.commit()
    except Exception as e:  # noqa: BLE001
        await db.rollback()
        print(f"WARN teardown {tag}: {e}")


# ==================== A. 未配置 time_field 不注册时间列（回归核心） ====================

async def check_no_time_field_no_columns(db):
    tag = "a"
    # DB 视图名 = agg.name = "x05_a"（generate_dws_view 用 agg.name，非 dws_ 前缀）
    db_view = f"x05_{tag}"
    src = f"x05_src_{tag}"
    await _cleanup_before(db, tag)  # 清除上次残留，确保幂等
    try:
        await _make_source_table(db, src, [
            '"dept" varchar', '"emp_type" varchar', '"headcount" numeric',
        ], [
            {"__cols__": ["dept", "emp_type", "headcount"], "dept": "BU1", "emp_type": "正式", "headcount": 10},
            {"__cols__": ["dept", "emp_type", "headcount"], "dept": "BU1", "emp_type": "实习", "headcount": 3},
        ])
        ds = await _register_dataset(db, tag, src, [
            {"source_alias": "a", "source_column": "dept", "output_code": "dept", "data_type": "string"},
            {"source_alias": "a", "source_column": "emp_type", "output_code": "emp_type", "data_type": "string"},
            {"source_alias": "a", "source_column": "headcount", "output_code": "headcount", "data_type": "numeric"},
        ])
        d1 = await _add_dim(db, ds.id, f"x05_dept_{tag}", "部门", "dept")
        d2 = await _add_dim(db, ds.id, f"x05_emp_{tag}", "员工类型", "emp_type")
        m = WarehouseMetric(metric_code=f"x05_metric_{tag}", metric_name=f"X05指标{tag}",
                            formula_sql="COUNT(*)", related_dataset_id=ds.id)
        db.add(m)
        await db.flush()
        agg = DwsAggregateDefinition(
            name=f"x05_{tag}", label=f"X05{tag}", metric_id=m.id, source_dataset_id=ds.id,
            group_by=[d1.dimension_code, d2.dimension_code], time_field=None,
            measure_semantics="flow", status="published",
        )
        db.add(agg)
        await db.flush()
        await db.commit()

        svc = DwsAggregateService(db)
        res = await svc.generate_dws_view(agg.id)

        # 返回值 view_name 是数据集编码 ds_{agg.name}，非 DB 视图名
        assert res["view_name"] == f"ds_x05_{tag}", f"返回 view_name 应为数据集编码，实际：{res['view_name']}"

        # 1) 返回的 output_fields 不应含任何时间列
        for tc in TIME_COLS:
            assert tc not in res["output_fields"], f"output_fields 不应含 {tc}，实际：{res['output_fields']}"

        # 2) 实际 DB 视图列不应含时间列（用真实视图名查询）
        cols = await _view_columns(db, db_view)
        assert len(cols) > 0, f"视图 {db_view} 应已建成（至少有 id/aggregated_value/synced_at），实际列：{cols}"
        for tc in TIME_COLS:
            assert tc not in cols, f"视图 {db_view} 不应含列 {tc}，实际：{cols}"

        # 3) TableColumn 元数据不应含时间列（用真实视图名查）
        tc_rows = (await db.execute(sa_text(
            "SELECT column_code FROM table_columns WHERE table_name = :v"
        ), {"v": db_view})).fetchall()
        tc_codes = [r[0] for r in tc_rows]
        for tc in TIME_COLS:
            assert tc not in tc_codes, f"table_columns 不应含 {tc}，实际：{tc_codes}"

        print(f"PASS: 未配置 time_field 的普通 DWS 不注册时间列（DB视图={db_view}，视图列={cols}）")
    finally:
        await _teardown(db, tag, db_view, src)


# ==================== B. DATE 类型 time_field 生成 4 个时间列 ====================

async def check_date_field_generates_four_columns(db):
    tag = "b"
    db_view = f"x05_{tag}"
    src = f"x05_src_{tag}"
    await _cleanup_before(db, tag)
    try:
        await _make_source_table(db, src, [
            '"dept" varchar', '"emp_type" varchar', '"snapshot_month" date', '"headcount" numeric',
        ], [
            {"__cols__": ["dept", "emp_type", "snapshot_month", "headcount"],
             "dept": "BU1", "emp_type": "正式", "snapshot_month": date(2026, 7, 1), "headcount": 10},
            {"__cols__": ["dept", "emp_type", "snapshot_month", "headcount"],
             "dept": "BU1", "emp_type": "实习", "snapshot_month": date(2026, 8, 1), "headcount": 3},
            {"__cols__": ["dept", "emp_type", "snapshot_month", "headcount"],
             "dept": "BU2", "emp_type": "正式", "snapshot_month": date(2026, 7, 15), "headcount": 5},
        ])
        ds = await _register_dataset(db, tag, src, [
            {"source_alias": "a", "source_column": "dept", "output_code": "dept", "data_type": "string"},
            {"source_alias": "a", "source_column": "emp_type", "output_code": "emp_type", "data_type": "string"},
            {"source_alias": "a", "source_column": "snapshot_month", "output_code": "snapshot_month", "data_type": "date"},
            {"source_alias": "a", "source_column": "headcount", "output_code": "headcount", "data_type": "numeric"},
        ])
        d1 = await _add_dim(db, ds.id, f"x05_dept_{tag}", "部门", "dept")
        d2 = await _add_dim(db, ds.id, f"x05_emp_{tag}", "员工类型", "emp_type")
        m = WarehouseMetric(metric_code=f"x05_metric_{tag}", metric_name=f"X05指标{tag}",
                            formula_sql="COUNT(*)", related_dataset_id=ds.id)
        db.add(m)
        await db.flush()
        agg = DwsAggregateDefinition(
            name=f"x05_{tag}", label=f"X05{tag}", metric_id=m.id, source_dataset_id=ds.id,
            group_by=[d1.dimension_code, d2.dimension_code], time_field="snapshot_month",
            measure_semantics="stock", status="published",
        )
        db.add(agg)
        await db.flush()
        await db.commit()

        svc = DwsAggregateService(db)
        res = await svc.generate_dws_view(agg.id)

        for tc in TIME_COLS:
            assert tc in res["output_fields"], f"output_fields 应含 {tc}，实际：{res['output_fields']}"

        cols = await _view_columns(db, db_view)
        assert len(cols) > 0, f"视图 {db_view} 应已建成，实际列：{cols}"
        for tc in TIME_COLS:
            assert tc in cols, f"视图 {db_view} 应含列 {tc}，实际：{cols}"

        # 校验派生值正确（用真实视图名查询）
        row = (await db.execute(sa_text(
            f'SELECT year, quarter, month FROM "{db_view}" WHERE dept=:d AND emp_type=:e'
        ), {"d": "BU1", "e": "正式"})).fetchone()
        assert row is not None, "应存在 BU1/正式 行"
        assert row[0] == 2026 and row[1] == "2026-Q3" and row[2] == "2026-07", f"派生值错误：{row}"

        # 校验保留原始期次列
        snap = (await db.execute(sa_text(
            f'SELECT DISTINCT snapshot_month FROM "{db_view}" WHERE dept=:d'
        ), {"d": "BU1"})).fetchall()
        assert len(snap) == 2, f"snapshot_month 应保留原始期次（2 个不同月），实际：{snap}"

        print(f"PASS: DATE time_field 生成 4 时间列且值正确（year={row[0]}, quarter={row[1]}, month={row[2]}）")
    finally:
        await _teardown(db, tag, db_view, src)


# ==================== C. group_by 含同源时间维度 → 自动跳过不重复 ====================

async def check_group_by_skip_time_field(db):
    tag = "c"
    db_view = f"x05_{tag}"
    src = f"x05_src_{tag}"
    await _cleanup_before(db, tag)
    try:
        await _make_source_table(db, src, [
            '"dept" varchar', '"emp_type" varchar', '"snapshot_month" date', '"headcount" numeric',
        ], [
            {"__cols__": ["dept", "emp_type", "snapshot_month", "headcount"],
             "dept": "BU1", "emp_type": "正式", "snapshot_month": date(2026, 7, 1), "headcount": 10},
            {"__cols__": ["dept", "emp_type", "snapshot_month", "headcount"],
             "dept": "BU2", "emp_type": "实习", "snapshot_month": date(2026, 8, 1), "headcount": 2},
        ])
        ds = await _register_dataset(db, tag, src, [
            {"source_alias": "a", "source_column": "dept", "output_code": "dept", "data_type": "string"},
            {"source_alias": "a", "source_column": "emp_type", "output_code": "emp_type", "data_type": "string"},
            {"source_alias": "a", "source_column": "snapshot_month", "output_code": "snapshot_month", "data_type": "date"},
            {"source_alias": "a", "source_column": "headcount", "output_code": "headcount", "data_type": "numeric"},
        ])
        d1 = await _add_dim(db, ds.id, f"x05_dept_{tag}", "部门", "dept")
        # 时间维度：bound_field=snapshot_month，其 output_code 也=snapshot_month（与 time_field 同源）
        d_period = await _add_dim(db, ds.id, f"x05_period_{tag}", "期次", "snapshot_month")
        m = WarehouseMetric(metric_code=f"x05_metric_{tag}", metric_name=f"X05指标{tag}",
                            formula_sql="COUNT(*)", related_dataset_id=ds.id)
        db.add(m)
        await db.flush()
        agg = DwsAggregateDefinition(
            name=f"x05_{tag}", label=f"X05{tag}", metric_id=m.id, source_dataset_id=ds.id,
            group_by=[d1.dimension_code, d_period.dimension_code], time_field="snapshot_month",
            measure_semantics="stock", status="published",
        )
        db.add(agg)
        await db.flush()
        await db.commit()

        svc = DwsAggregateService(db)
        res = await svc.generate_dws_view(agg.id)

        cols = await _view_columns(db, db_view)
        assert len(cols) > 0, f"视图 {db_view} 应已建成，实际列：{cols}"

        # 不应出现 period 维度列（被时间派生取代）
        assert f"x05_period_{tag}" not in cols, f"不应出现 period 维度列，实际：{cols}"
        # 时间列应齐全且 snapshot_month 仅出现一次
        for tc in TIME_COLS:
            assert tc in cols, f"视图应含 {tc}，实际：{cols}"
        assert cols.count("snapshot_month") == 1, f"snapshot_month 应只出现一次，实际：{cols}"
        # output_fields 不应含 period 维度编码
        assert f"x05_period_{tag}" not in res["output_fields"], f"output_fields 不应含 period，实际：{res['output_fields']}"

        print(f"PASS: group_by 同源时间维度被跳过，无重复快照列（视图列={cols}）")
    finally:
        await _teardown(db, tag, db_view, src)


# ==================== D. 字符串脏值（首行合法）→ 全量扫描抛明确错误 ====================

async def check_dirty_string_raises(db):
    tag = "d"
    db_view = f"x05_{tag}"
    src = f"x05_src_{tag}"
    await _cleanup_before(db, tag)
    try:
        await _make_source_table(db, src, [
            '"dept" varchar', '"snapshot_month" varchar', '"headcount" numeric',
        ], [
            # 首行合法，后续脏值 —— 若只抽样首行会漏放
            {"__cols__": ["dept", "snapshot_month", "headcount"], "dept": "BU1", "snapshot_month": "2026-07-01", "headcount": 10},
            {"__cols__": ["dept", "snapshot_month", "headcount"], "dept": "BU1", "snapshot_month": "2026年7月", "headcount": 3},
            {"__cols__": ["dept", "snapshot_month", "headcount"], "dept": "BU2", "snapshot_month": "202607", "headcount": 5},
        ])
        ds = await _register_dataset(db, tag, src, [
            {"source_alias": "a", "source_column": "dept", "output_code": "dept", "data_type": "string"},
            {"source_alias": "a", "source_column": "snapshot_month", "output_code": "snapshot_month", "data_type": "varchar"},
            {"source_alias": "a", "source_column": "headcount", "output_code": "headcount", "data_type": "numeric"},
        ])
        d1 = await _add_dim(db, ds.id, f"x05_dept_{tag}", "部门", "dept")
        m = WarehouseMetric(metric_code=f"x05_metric_{tag}", metric_name=f"X05指标{tag}",
                            formula_sql="COUNT(*)", related_dataset_id=ds.id)
        db.add(m)
        await db.flush()
        agg = DwsAggregateDefinition(
            name=f"x05_{tag}", label=f"X05{tag}", metric_id=m.id, source_dataset_id=ds.id,
            group_by=[d1.dimension_code], time_field="snapshot_month",
            measure_semantics="stock", status="published",
        )
        db.add(agg)
        await db.flush()
        await db.commit()

        svc = DwsAggregateService(db)
        raised = None
        try:
            await svc.generate_dws_view(agg.id)
        except ValueError as e:
            raised = e
            await db.rollback()  # 清除 failed transaction，否则后续 _view_columns 会 InFailedSQLTransactionError
        assert raised is not None, "含脏值的字符串 time_field 应抛 ValueError"
        msg = str(raised)
        assert ("脏值" in msg) or ("无法解析为日期" in msg), f"错误应明确指向脏值/无法解析，实际：{msg}"
        # 确认视图确实未建成（不会"DDL 通过、查询时才炸"）
        cols = await _view_columns(db, db_view)
        assert len(cols) == 0, f"脏值场景视图不应建成，实际列：{cols}"
        print(f"PASS: 字符串脏值全量扫描后抛明确错误（{msg[:60]}…）")
    finally:
        await _teardown(db, tag, db_view, src)


# ==================== E. 格式合规但日期无效（2026-99-01）→ cast 扫描捕获 ====================

async def check_invalid_date_string_raises(db):
    """验证正则通过但 ::date cast 失败的脏值（如 2026-99-01 / 2026-02-31）被捕获。"""
    tag = "e"
    db_view = f"x05_{tag}"
    src = f"x05_src_{tag}"
    await _cleanup_before(db, tag)
    try:
        await _make_source_table(db, src, [
            '"dept" varchar', '"snapshot_month" varchar', '"headcount" numeric',
        ], [
            # 正则全部合规（YYYY-MM-DD 格式），但 2026-99-01 不是真实日期
            {"__cols__": ["dept", "snapshot_month", "headcount"], "dept": "BU1", "snapshot_month": "2026-07-01", "headcount": 10},
            {"__cols__": ["dept", "snapshot_month", "headcount"], "dept": "BU1", "snapshot_month": "2026-99-01", "headcount": 3},
        ])
        ds = await _register_dataset(db, tag, src, [
            {"source_alias": "a", "source_column": "dept", "output_code": "dept", "data_type": "string"},
            {"source_alias": "a", "source_column": "snapshot_month", "output_code": "snapshot_month", "data_type": "varchar"},
            {"source_alias": "a", "source_column": "headcount", "output_code": "headcount", "data_type": "numeric"},
        ])
        d1 = await _add_dim(db, ds.id, f"x05_dept_{tag}", "部门", "dept")
        m = WarehouseMetric(metric_code=f"x05_metric_{tag}", metric_name=f"X05指标{tag}",
                            formula_sql="COUNT(*)", related_dataset_id=ds.id)
        db.add(m)
        await db.flush()
        agg = DwsAggregateDefinition(
            name=f"x05_{tag}", label=f"X05{tag}", metric_id=m.id, source_dataset_id=ds.id,
            group_by=[d1.dimension_code], time_field="snapshot_month",
            measure_semantics="stock", status="published",
        )
        db.add(agg)
        await db.flush()
        await db.commit()

        svc = DwsAggregateService(db)
        raised = None
        try:
            await svc.generate_dws_view(agg.id)
        except ValueError as e:
            raised = e
            await db.rollback()  # 清除 failed transaction，否则后续 _view_columns 会 InFailedSQLTransactionError
        assert raised is not None, "含格式合规但非有效日期的字符串 time_field 应抛 ValueError"
        msg = str(raised)
        assert ("非有效日期" in msg) or ("::date" in msg) or ("无法解析为日期" in msg), \
            f"错误应明确指向非有效日期/cast失败，实际：{msg}"
        # 确认视图确实未建成
        cols = await _view_columns(db, db_view)
        assert len(cols) == 0, f"无效日期场景视图不应建成，实际列：{cols}"
        print(f"PASS: 格式合规但日期无效的值被 ::date cast 扫描捕获（{msg[:80]}…）")
    finally:
        await _teardown(db, tag, db_view, src)


# ==================== pytest 入口 ====================

def test_x05_time_drilldown_acceptance():
    """pytest 自动发现入口，执行全部 5 个验收场景。"""
    asyncio.run(main())


# ==================== 脚本入口 ====================

async def main():
    print("=" * 60)
    print("X05 多粒度时间下钻 · 一期 集成验收")
    print("=" * 60)
    async with get_session_factory()() as db:
        await check_no_time_field_no_columns(db)
        print()
        await check_date_field_generates_four_columns(db)
        print()
        await check_group_by_skip_time_field(db)
        print()
        await check_dirty_string_raises(db)
        print()
        await check_invalid_date_string_raises(db)
    print()
    print("=" * 60)
    print("验收完成")


if __name__ == "__main__":
    asyncio.run(main())
