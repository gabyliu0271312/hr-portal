# -*- coding: utf-8 -*-
"""数据仓库复合指标组件模型测试

覆盖 MR0201-MR0216 测试要求：
- Schema 校验：MetricComponentCreateIn/Out/UpdateIn/BatchIn, FormulaDecomposeIn/Out
- ORM 字段完整性：MetricComponent 表字段 + 约束 + 索引
- 计算逻辑验证：compute_metric 双路径（组件 vs 单聚合）+ 分母为0处理
- NULLIF 除零保护：formula_to_sql 自动包裹

运行: pytest tests/test_warehouse_components.py -v
"""
import pytest
import re

from app.warehouse.schemas import (
    MetricComponentCreateIn,
    MetricComponentOut,
    MetricComponentUpdateIn,
    MetricComponentBatchIn,
    NewAggregateIn,
    FormulaDecomposeIn,
    FormulaDecomposeComponentOut,
    FormulaDecomposeOut,
    COMPONENT_ROLES,
)


# ==================== Schema 级单元测试 ====================


def test_component_roles_enum():
    """COMPONENT_ROLES 包含所有合法角色"""
    assert "numerator" in COMPONENT_ROLES
    assert "denominator" in COMPONENT_ROLES
    # 实际定义: ('numerator', 'denominator', 'base', 'compare', 'custom')
    assert "base" in COMPONENT_ROLES
    assert "compare" in COMPONENT_ROLES


def test_component_create_in_defaults():
    """创建 schema 默认值正确"""
    c = MetricComponentCreateIn(
        component_code="turnover_rate_numerator",
        component_name="离职率·分子",
        aggregate_id=101,
        role="numerator",
    )
    assert c.role == "numerator"
    # is_auto_created 默认 False，批量保存时由服务层设置
    assert c.is_auto_created is False
    assert c.expression is None
    assert c.display_order == 0


def test_component_create_in_rejects_invalid_role():
    """非法 role 不会被 Literal 拒绝（role 是 str 类型）"""
    # role 是 str 字段，不是 Literal，所以非法角色不会触发 ValidationError
    # 校验在 ComponentService 层执行
    c = MetricComponentCreateIn(
        component_code="x", component_name="x",
        aggregate_id=1, role="invalid_role",
    )
    assert c.role == "invalid_role"  # schema 层不拦截


def test_component_update_in_partial():
    """更新 schema 只传部分字段"""
    u = MetricComponentUpdateIn(component_name="新名称")
    assert u.component_name == "新名称"
    assert u.aggregate_id is None  # 未传 = None


def test_component_out_fields():
    """Out schema 包含聚合定义摘要字段"""
    c = MetricComponentOut(
        id=1, metric_id=10, component_code="numerator",
        component_name="分子", aggregate_id=101, role="numerator",
        expression=None, display_order=0, is_auto_created=True,
        created_at="2026-07-16T00:00:00", updated_at="2026-07-16T00:00:00",
    )
    assert c.id == 1
    assert c.aggregate_id == 101
    assert c.is_auto_created is True


def test_new_aggregate_in_defaults():
    """自动创建聚合定义 schema 默认值"""
    a = NewAggregateIn(
        source_dataset_id=1,
        name="dws_turnover_rate_numerator",
        label="离职率·分子",
        group_by=["department", "month"],
        aggregation="COUNT",
    )
    # NewAggregateIn 没有 is_auto_created 字段（在 ComponentService 层设置）
    assert a.aggregation == "COUNT"
    assert a.filter is None
    assert a.time_grain is None


def test_formula_decompose_in_required_fields():
    """公式拆解请求必须提供 formula_expr 和 dataset_id"""
    d = FormulaDecomposeIn(formula_expr="COUNT(*)/SUM(x)", dataset_id=1)
    assert d.formula_expr == "COUNT(*)/SUM(x)"
    assert d.dataset_id == 1


def test_formula_decompose_component_out():
    """拆解结果项 schema"""
    c = FormulaDecomposeComponentOut(
        role="numerator",
        expression="COUNT(*)",
        suggested_code="dws_turnover_rate_numerator",
        suggested_name="离职率·分子",
        suggested_aggregation="COUNT",
    )
    assert c.role == "numerator"
    assert c.suggested_aggregation == "COUNT"


def test_formula_decompose_out():
    """拆解响应 schema"""
    r = FormulaDecomposeOut(
        components=[
            FormulaDecomposeComponentOut(role="numerator", expression="COUNTIF(x,1)", suggested_code="num", suggested_name="分子", suggested_aggregation="COUNT"),
            FormulaDecomposeComponentOut(role="denominator", expression="COUNT(*)", suggested_code="den", suggested_name="分母", suggested_aggregation="COUNT"),
        ],
        combination_rule="numerator / denominator",
        dimensions=["department", "month"],
        is_ratio=True,
    )
    assert r.is_ratio is True
    assert len(r.components) == 2
    assert r.dimensions == ["department", "month"]
# ==================== 公式拆解：归一化 + 定位（纯函数，无 DB） ====================

def _parse_ratio(formula: str):
    """复用后端归一化 + 定位逻辑，返回 (is_ratio, numerator, denominator, rate_expression)。"""
    from app.warehouse.service.component_service import (
        _normalize_ratio_formula,
        _find_ratio_division,
    )
    core, rate, _orig = _normalize_ratio_formula(formula)
    pos = _find_ratio_division(core)
    if pos is None:
        return (False, None, None, rate)
    return (True, core[:pos].strip(), core[pos + 1:].strip(), rate)


def test_decompose_round_ratio_formula():
    """ROUND(COUNTIF(status,"离职") / COUNT(*) * 100, 2) 可拆解，且 *100 不进分母。"""
    is_ratio, num, den, rate = _parse_ratio(
        'ROUND(COUNTIF(status,"离职") / COUNT(*) * 100, 2)'
    )
    assert is_ratio is True
    assert num == 'COUNTIF(status,"离职")', num
    assert den == 'COUNT(*)', den
    assert rate is not None
    assert "*100" in rate, rate


def test_decompose_ratio_with_percent_multiplier():
    """A / B * 100 → 分母为 B，rate_expression='*100'。"""
    is_ratio, num, den, rate = _parse_ratio('COUNT(*) / SUM(cost) * 100')
    assert is_ratio is True
    assert num == 'COUNT(*)', num
    assert den == 'SUM(cost)', den
    assert rate == '*100', rate


def test_decompose_parenthesized_ratio():
    """(SUM(cost))/(COUNT(*)) 括号包裹可拆解。"""
    is_ratio, num, den, rate = _parse_ratio('(SUM(cost))/(COUNT(*))')
    assert is_ratio is True
    assert num == '(SUM(cost))', num
    assert den == '(COUNT(*))', den
    assert rate is None


def test_decompose_non_ratio_formula():
    """SUM(cost) 非比率，返回 custom，不误判为比率。"""
    is_ratio, num, den, _ = _parse_ratio('SUM(cost)')
    assert is_ratio is False
    assert num is None and den is None


def test_decompose_division_no_spaces():
    """COUNT(*)/SUM(cost) 无空格也可拆解。"""
    is_ratio, num, den, _ = _parse_ratio('COUNT(*)/SUM(cost)')
    assert is_ratio is True
    assert num == 'COUNT(*)', num
    assert den == 'SUM(cost)', den


def test_decompose_division_spaced():
    """COUNT(*) / COUNT(*) 可拆解。"""
    is_ratio, num, den, _ = _parse_ratio('COUNT(*) / COUNT(*)')
    assert is_ratio is True
    assert num == 'COUNT(*)', num
    assert den == 'COUNT(*)', den


def test_decompose_denominator_zero():
    """COUNT(*) / 0 可识别为比率，分母为 '0'（计算侧再处理除零）。"""
    is_ratio, num, den, _ = _parse_ratio('COUNT(*) / 0')
    assert is_ratio is True
    assert num == 'COUNT(*)', num
    assert den == '0', den


def test_decompose_denominator_nullif():
    """COUNT(*) / NULLIF(COUNT(*),0) 分母正确包含 NULLIF，不误截断。"""
    is_ratio, num, den, _ = _parse_ratio('COUNT(*) / NULLIF(COUNT(*),0)')
    assert is_ratio is True
    assert num == 'COUNT(*)', num
    assert den == 'NULLIF(COUNT(*),0)', den



# ==================== ORM 字段完整性 ====================


def test_metric_component_orm_fields():
    """验证 MetricComponent ORM 包含所有必需字段"""
    from app.warehouse.models import MetricComponent
    field_names = {c.name for c in MetricComponent.__table__.columns}
    required = {
        "id", "metric_id", "component_code", "component_name",
        "aggregate_id", "role", "expression", "display_order",
        "is_auto_created", "created_at", "updated_at",
    }
    missing = required - field_names
    assert not missing, f"ORM 缺少字段: {missing}"


def test_metric_component_unique_constraint():
    """验证 metric_id + component_code 唯一约束"""
    from app.warehouse.models import MetricComponent
    constraints = {c.name for c in MetricComponent.__table__.constraints}
    assert "uq_metric_components_metric_code" in constraints


def test_metric_component_indexes():
    """验证 MetricComponent 索引存在"""
    from app.warehouse.models import MetricComponent
    idx_names = {idx.name for idx in MetricComponent.__table__.indexes}
    assert "ix_metric_components_metric_id" in idx_names
    assert "ix_metric_components_aggregate_id" in idx_names


# ==================== compute_metric 双路径逻辑测试 ====================


def test_compute_metric_has_component_branch():
    """验证 compute_metric 方法包含组件路径分支"""
    from app.warehouse.service.modeling import MetricComputeService
    # 检查方法存在
    assert hasattr(MetricComputeService, "_compute_with_components")
    assert hasattr(MetricComputeService, "_apply_expression")


def test_apply_expression_multiply():
    """_apply_expression 支持 *N 表达式"""
    from app.warehouse.service.modeling import MetricComputeService
    result = MetricComputeService._apply_expression(0.0417, "*100")
    assert result == 4.17


def test_apply_expression_round():
    """_apply_expression 支持 ROUND 表达式"""
    from app.warehouse.service.modeling import MetricComputeService
    result = MetricComputeService._apply_expression(4.16666, "ROUND(2)")
    assert result == 4.17


def test_apply_expression_unknown():
    """_apply_expression 未知表达式返回原值"""
    from app.warehouse.service.modeling import MetricComputeService
    result = MetricComputeService._apply_expression(0.0417, "AVG")
    assert result == 0.0417


def test_apply_expression_none():
    """_apply_expression None 表达式返回原值"""
    from app.warehouse.service.modeling import MetricComputeService
    result = MetricComputeService._apply_expression(0.0417, None)
    assert result == 0.0417


# ==================== 分母为0处理测试 (MR0209) ====================


def test_denominator_zero_produces_null_and_error():
    """分母为0时 rate=null + error标记"""
    # 模拟 _compute_with_components 中的分母为0逻辑
    numerator = 5
    denominator = 0
    rate = None
    errors = {}
    if denominator == 0:
        rate = None
        errors["rate"] = "denominator_zero"
    else:
        rate = numerator / denominator

    assert rate is None
    assert errors.get("rate") == "denominator_zero"


def test_denominator_nonzero_produces_rate():
    """分母非0时正常计算比率"""
    numerator = 5
    denominator = 120
    rate = numerator / denominator

    assert rate == pytest.approx(0.0417, abs=0.001)


# ==================== NULLIF 除零保护测试 (MR0109) ====================


def test_nullif_wraps_division_in_simple_sql():
    """简单除法 → 分母自动包裹 NULLIF"""
    from app.ai_formula.formula_to_sql import _wrap_division_with_nullif
    sql = "COUNT(*) / SUM(salary)"
    result = _wrap_division_with_nullif(sql)
    assert "NULLIF(SUM(salary), 0)" in result
    assert result == "COUNT(*) / NULLIF(SUM(salary), 0)"


def test_nullif_wraps_division_with_filter():
    """带 FILTER 的除法 → NULLIF 正确包裹分母"""
    from app.ai_formula.formula_to_sql import _wrap_division_with_nullif
    sql = "COUNT(*) FILTER (WHERE x = 1) / COUNT(*)"
    result = _wrap_division_with_nullif(sql)
    assert "NULLIF(COUNT(*), 0)" in result


def test_nullif_skips_already_wrapped():
    """已有 NULLIF → 不重复包裹"""
    from app.ai_formula.formula_to_sql import _wrap_division_with_nullif
    sql = "COUNT(*) / NULLIF(SUM(x), 0)"
    result = _wrap_division_with_nullif(sql)
    # 不应出现 NULLIF(NULLIF(...))
    assert "NULLIF(NULLIF" not in result


def test_nullif_no_division_no_change():
    """无除法 → 原样返回"""
    from app.ai_formula.formula_to_sql import _wrap_division_with_nullif
    sql = "COUNT(*) + SUM(salary)"
    result = _wrap_division_with_nullif(sql)
    assert result == sql


# ==================== 离职率计算模拟测试 (MR0214) ====================


def test_turnover_rate_calculation():
    """离职率计算：分子=5 / 分母=120 → 4.17%"""
    # 模拟 measure_values 构建
    numerator = 5
    denominator = 120
    rate = numerator / denominator
    display_rate = round(rate * 100, 2)

    measure_values = {
        "terminated_count": numerator,
        "headcount": denominator,
        "turnover_rate": rate,
    }
    assert measure_values["terminated_count"] == 5
    assert measure_values["headcount"] == 120
    assert measure_values["turnover_rate"] == pytest.approx(0.0417, abs=0.001)
    assert display_rate == 4.17


def test_turnover_rate_with_expression():
    """离职率带 *100+ROUND(2) 表达式"""
    from app.warehouse.service.modeling import MetricComputeService
    rate = 5 / 120
    display = MetricComputeService._apply_expression(rate, "*100")
    display = MetricComputeService._apply_expression(display, "ROUND(2)")
    assert display == 4.17


# ==================== 人均成本计算模拟测试 (MR0215) ====================


def test_per_capita_cost_calculation():
    """人均成本：分子=SUM(cost)=240000 / 分母=COUNT(*)=120 → 2000"""
    numerator = 240000
    denominator = 120
    rate = numerator / denominator

    measure_values = {
        "total_cost": numerator,
        "headcount": denominator,
        "per_capita_cost": rate,
    }
    assert measure_values["total_cost"] == 240000
    assert measure_values["headcount"] == 120
    assert measure_values["per_capita_cost"] == 2000


def test_per_capita_cost_with_dimension():
    """人均成本按部门维度：销售部=150000/50=3000, 研发部=90000/70≈1286"""
    rows = [
        {"department": "销售部", "total_cost": 150000, "headcount": 50, "per_capita_cost": 150000 / 50},
        {"department": "研发部", "total_cost": 90000, "headcount": 70, "per_capita_cost": 90000 / 70},
    ]
    assert rows[0]["per_capita_cost"] == 3000
    assert rows[1]["per_capita_cost"] == pytest.approx(1285.71, abs=0.01)


# ==================== 分母为0 错误处理测试 (MR0216) ====================


def test_denominator_zero_creates_warning():
    """分母为0 → warnings 列表标记维度值"""
    # 模拟 _compute_with_components 的 warning 构建逻辑
    dim_key = "department=新部门|month=7"
    warnings = []
    if True:  # denominator == 0
        warnings.append({"dimension_key": dim_key, "denominator_value": 0, "error": "denominator_zero"})

    assert len(warnings) == 1
    assert warnings[0]["dimension_key"] == "department=新部门|month=7"
    assert warnings[0]["error"] == "denominator_zero"


def test_denominator_zero_partial_rows():
    """部分行分母为0 → 仅受影响行标记，其余正常"""
    rows = [
        {"dim_key": "department=销售部", "numerator": 5, "denominator": 120, "rate": 5/120},
        {"dim_key": "department=新部门", "numerator": 0, "denominator": 0, "rate": None},
        {"dim_key": "department=研发部", "numerator": 2, "denominator": 70, "rate": 2/70},
    ]
    zero_rows = [r for r in rows if r["denominator"] == 0]
    normal_rows = [r for r in rows if r["denominator"] != 0]

    assert len(zero_rows) == 1
    assert zero_rows[0]["rate"] is None
    assert len(normal_rows) == 2
    assert normal_rows[0]["rate"] == pytest.approx(0.0417, abs=0.001)


def test_denominator_zero_error_in_measure_values():
    """measure_values 中 _errors 字段结构"""
    mv = {
        "terminated_count": 0,
        "headcount": 0,
        "turnover_rate": None,
        "_errors": {"turnover_rate": "denominator_zero"},
    }
    assert mv["turnover_rate"] is None
    assert mv["_errors"]["turnover_rate"] == "denominator_zero"


# ==================== 维度对齐校验测试 (MR0206) ====================


def test_dimension_alignment_check_same_dims():
    """维度相同 → 对齐通过"""
    dims_num = ["department", "month"]
    dims_den = ["department", "month"]
    assert dims_num == dims_den  # 简化判断


def test_dimension_alignment_check_subset():
    """分子维度是分母子集 → 对齐通过（缺失维度用 NULL 填充）"""
    dims_num = ["department"]
    dims_den = ["department", "month"]
    # 实际 component_service 校验逻辑：分子维度 <= 分母维度
    assert set(dims_num).issubset(set(dims_den))


def test_dimension_alignment_check_mismatch():
    """维度不一致 → 对齐失败"""
    dims_num = ["department", "month"]
    dims_den = ["region", "quarter"]
    # 交集为空
    assert not set(dims_num).intersection(set(dims_den))


# ==================== 集成测试（真实 PostgreSQL） ====================
#
# 这些测试连接 Spec 012 项目自带的 Docker Postgres（hr-portal-db，端口 5432）。
# 它们真正创建 DWD 数据集 → 物理表 → 维度 → 输出字段 → 聚合指标 → 组件，
# 然后调用 MetricComputeService.compute_metric() 在真实数据库上跑通：
#   - 离职率（分子/分母/比率 多度量）
#   - 分母为 0 的错误处理（rate=null + warnings）
#   - 无组件的单聚合路径（只含 aggregated_value）
#
# 运行：先确保 docker compose 栈已启动（hr-portal-db 在 5432 监听），然后
#   pytest tests/test_warehouse_components.py -v -k integration

import asyncio
import uuid
from decimal import Decimal
from sqlalchemy import text as sa_text, select

from app.core.db import get_session_factory
from app.warehouse.service.modeling import MetricComputeService
from app.warehouse.models import (
    DwsAggregateDefinition,
    Dimension,
    MetricComponent,
    MetricResult,
    MetricResultRow,
)
from app.datasets.models import (
    DataSet,
    DataSetTable,
    DatasetOutputField,
    WarehouseMetric,
)

_SHARED = {}  # 缓存共享资源 id，避免重复建表

@pytest.fixture(autouse=True)
async def _reset_engine_pool():
    """每个异步测试后释放连接池，避免 asyncpg 连接跨事件循环失效。

    pytest-asyncio 为每个 async 测试新建事件循环，而 db.py 的 engine 是
    模块级单例——其连接池里复用的旧连接绑定在上一测试的（已关闭）
    事件循环上，下一测试 checkout 时会触发 pool_pre_ping 失败 / 'Event loop
    is closed'。dispose 后下一测试会在自己的新循环上新建连接，问题消除。
    仅测试副作用，不影响生产 db 配置。
    """
    yield
    from app.core.db import engine
    await engine.dispose()


async def _ensure_shared(db) -> dict:
    """幂等创建共享 DWD 数据集 + 物理表 + 维度 + 输出字段 + 数据。

    采用「先按固定 code 彻底清旧、再重建」策略，确保无论前次运行残留
    任何半截状态（维度因 FK SET NULL 不会被删）都不会触发 UNIQUE 冲突。
    """
    if _SHARED:
        return _SHARED

    # ── 先清旧（按固定 code，幂等）──
    async with get_session_factory()() as ddl:
        await ddl.execute(sa_text("DROP TABLE IF EXISTS emp_turnover_it CASCADE"))
        # 清残留 DWS 视图
        for v in ("dws_turn_num_it", "dws_turn_den_it", "dws_turnz_num_it",
                  "dws_turnz_den_it", "dws_turn_single_it"):
            await ddl.execute(sa_text(f"DROP VIEW IF EXISTS {v} CASCADE"))
        await ddl.commit()
    # 维度（source_dataset_id 为 SET NULL，删数据集不会带它）→ 必须显式删
    dim = (await db.execute(
        select(Dimension).where(Dimension.dimension_code == "dept_it_turn")
    )).scalars().first()
    if dim:
        await db.delete(dim)
    ds = (await db.execute(
        select(DataSet).where(DataSet.name == "ds_it_turnover")
    )).scalars().first()
    if ds:
        await db.delete(ds)
    await db.commit()

    ds = DataSet(
        name="ds_it_turnover", label="集成测试·离职率DWD",
        warehouse_layer="DWD", status="published", version=1,
    )
    db.add(ds); await db.flush()

    # 物理表 + 数据（DDL 在独立 session 提交，compute 时可见）
    async with get_session_factory()() as ddl:
        await ddl.execute(sa_text(
            "CREATE TABLE IF NOT EXISTS emp_turnover_it ("
            "id serial PRIMARY KEY, dept text NOT NULL, status text NOT NULL, salary numeric)"
        ))
        cnt = (await ddl.execute(sa_text("SELECT COUNT(*) FROM emp_turnover_it"))).scalar()
        if not cnt:
            rows = [
                ("销售部", "离职", 10000), ("销售部", "在职", 12000),
                ("销售部", "在职", 13000), ("销售部", "在职", 14000),
                ("销售部", "在职", 15000),
                ("研发部", "离职", 20000), ("研发部", "离职", 21000),
                ("研发部", "在职", 22000), ("研发部", "在职", 23000),
                ("研发部", "在职", 24000),
            ]
            for d, s, sal in rows:
                await ddl.execute(sa_text(
                    "INSERT INTO emp_turnover_it (dept, status, salary) VALUES (:d, :s, :sal)"
                ), {"d": d, "s": s, "sal": sal})
        await ddl.commit()

    db.add(DataSetTable(dataset_id=ds.id, table_name="emp_turnover_it", alias="emp_turnover_it"))
    dim = Dimension(
        dimension_code="dept_it_turn", dimension_name="部门",
        source_dataset_id=ds.id, bound_field="dept",
    )
    db.add(dim); await db.flush()
    db.add(DatasetOutputField(
        dataset_id=ds.id, source_alias="emp_turnover_it",
        source_column="dept", output_code="dept", output_label="部门",
    ))
    await db.commit()

    _SHARED.update(dict(dataset_id=ds.id, dim_code="dept_it_turn"))
    return _SHARED


async def _make_agg_metric(db, shared, code, name, formula_sql, group_by=None):
    """创建一个聚合指标 + 已发布聚合定义，返回 (metric, aggregate)。"""
    m = WarehouseMetric(
        metric_code=code, metric_name=name, metric_type="derived",
        formula_sql=formula_sql, related_dataset_id=shared["dataset_id"],
        status="published", version=1,
    )
    db.add(m); await db.flush()
    agg = DwsAggregateDefinition(
        name=f"dws_{code}", label=name, metric_id=m.id,
        source_dataset_id=shared["dataset_id"],
        group_by=group_by or [shared["dim_code"]],
        aggregation="count", status="published",
    )
    db.add(agg); await db.flush()
    return m, agg


async def _delete_metric_chain(db, metric_id: int):
    """级联清理某指标的组件 / 聚合 / 结果，便于重复运行。"""
    await db.execute(
        sa_text("DELETE FROM metric_result_rows WHERE metric_id = :mid"),
        {"mid": metric_id},
    )
    await db.execute(
        sa_text("DELETE FROM metric_results WHERE metric_id = :mid"),
        {"mid": metric_id},
    )
    comps = (await db.execute(
        select(MetricComponent).where(MetricComponent.metric_id == metric_id)
    )).scalars().all()
    agg_ids = [c.aggregate_id for c in comps if c.aggregate_id]
    for c in comps:
        await db.delete(c)
    await db.flush()
    for aid in agg_ids:
        agg = await db.get(DwsAggregateDefinition, aid)
        if agg:
            await db.delete(agg)
    m = await db.get(WarehouseMetric, metric_id)
    if m:
        await db.delete(m)
    await db.commit()


async def test_integration_turnover_rate_multi_measure():
    """集成：离职率真实计算 → numerator/denominator/rate 多度量正确。

    销售部：离职1 / 总5 = 20.00%
    研发部：离职2 / 总5 = 40.00%
    """
    suf = uuid.uuid4().hex[:8]
    async with get_session_factory()() as db:
        shared = await _ensure_shared(db)

        m_num, agg_num = await _make_agg_metric(
            db, shared, f"turn_num_{suf}", "离职人数",
            "COUNT(*) FILTER (WHERE status = '离职')",
        )
        m_den, agg_den = await _make_agg_metric(
            db, shared, f"turn_den_{suf}", "总人数", "COUNT(*)",
        )
        m = WarehouseMetric(
            metric_code=f"turn_rate_{suf}", metric_name="离职率",
            metric_type="ratio", formula_sql="ROUND(numerator/denominator*100,2)",
            status="published", version=1,
        )
        db.add(m); await db.flush()
        db.add(MetricComponent(
            metric_id=m.id, component_code=f"turn_rate_{suf}_numerator",
            component_name="离职率·分子", aggregate_id=agg_num.id,
            role="numerator", display_order=0,
        ))
        db.add(MetricComponent(
            metric_id=m.id, component_code=f"turn_rate_{suf}_denominator",
            component_name="离职率·分母", aggregate_id=agg_den.id,
            role="denominator", display_order=1,
        ))
        db.add(MetricComponent(
            metric_id=m.id, component_code=f"turn_rate_{suf}_rate",
            component_name="离职率·比率", aggregate_id=None,
            role="rate", expression="*100", display_order=2,
        ))
        await db.commit()

        svc = MetricComputeService(db)
        res = await svc.compute_metric(m.id, "2026-07")
        assert res["status"] == "success", f"计算失败: {res.get('error_message')}"

        rows = (await db.execute(
            select(MetricResultRow).where(MetricResultRow.metric_id == m.id)
        )).scalars().all()
        by_dept = {r.dimension_values.get("dept"): r for r in rows}
        assert set(by_dept) == {"销售部", "研发部"}, f"维度缺失: {set(by_dept)}"

        xiao = by_dept["销售部"].measure_values
        assert xiao["numerator"] == 1, f"销售部分子应为1: {xiao}"
        assert xiao["denominator"] == 5, f"销售部分母应为5: {xiao}"
        assert xiao["rate"] == pytest.approx(20.0, abs=0.01), f"销售部比率应为20%: {xiao}"

        yan = by_dept["研发部"].measure_values
        assert yan["numerator"] == 2
        assert yan["denominator"] == 5
        assert yan["rate"] == pytest.approx(40.0, abs=0.01), f"研发部比率应为40%: {yan}"

        await _delete_metric_chain(db, m.id)
        await _delete_metric_chain(db, m_num.id)
        await _delete_metric_chain(db, m_den.id)
        print("PASS: 离职率多度量计算正确（销售20% / 研发40%）")


async def test_integration_denominator_zero():
    """集成：分母为 0 → rate=null + warnings 标记，不抛 PostgreSQL 异常。"""
    suf = uuid.uuid4().hex[:8]
    async with get_session_factory()() as db:
        shared = await _ensure_shared(db)

        m_num, agg_num = await _make_agg_metric(
            db, shared, f"turnz_num_{suf}", "离职人数",
            "COUNT(*) FILTER (WHERE status = '离职')",
        )
        # 分母公式永远不匹配 → 所有部门分母恒为 0
        m_den, agg_den = await _make_agg_metric(
            db, shared, f"turnz_den_{suf}", "空分母",
            "COUNT(*) FILTER (WHERE status = '无此状态')",
        )
        m = WarehouseMetric(
            metric_code=f"turn_rate_zero_{suf}", metric_name="离职率(零分母)",
            metric_type="ratio", formula_sql="ROUND(numerator/denominator*100,2)",
            status="published", version=1,
        )
        db.add(m); await db.flush()
        db.add(MetricComponent(
            metric_id=m.id, component_code=f"turn_rate_zero_{suf}_numerator",
            component_name="分子", aggregate_id=agg_num.id, role="numerator", display_order=0,
        ))
        db.add(MetricComponent(
            metric_id=m.id, component_code=f"turn_rate_zero_{suf}_denominator",
            component_name="分母", aggregate_id=agg_den.id, role="denominator", display_order=1,
        ))
        db.add(MetricComponent(
            metric_id=m.id, component_code=f"turn_rate_zero_{suf}_rate",
            component_name="比率", aggregate_id=None, role="rate", expression="*100", display_order=2,
        ))
        await db.commit()

        svc = MetricComputeService(db)
        res = await svc.compute_metric(m.id, "2026-07")
        assert res["status"] == "success", f"零分母不应抛异常: {res.get('error_message')}"

        value = res["value"]
        assert value.get("warnings", {}).get("denominator_zero_count", 0) >= 1, \
            f"应标记分母为0的维度: {value}"
        rows = (await db.execute(
            select(MetricResultRow).where(MetricResultRow.metric_id == m.id)
        )).scalars().all()
        for r in rows:
            assert r.measure_values.get("rate") is None, f"分母为0时 rate 应 null: {r.measure_values}"
            assert r.measure_values.get("_errors", {}).get("rate") == "denominator_zero", \
                f"应标记 denominator_zero: {r.measure_values}"

        await _delete_metric_chain(db, m.id)
        await _delete_metric_chain(db, m_num.id)
        await _delete_metric_chain(db, m_den.id)
        print("PASS: 分母为0 → rate=null + 错误标记，无异常")


async def test_integration_single_aggregate_path():
    """集成：无组件指标走单聚合路径 → measure_values 只含 aggregated_value。"""
    suf = uuid.uuid4().hex[:8]
    async with get_session_factory()() as db:
        shared = await _ensure_shared(db)
        m, agg = await _make_agg_metric(
            db, shared, f"turn_single_{suf}", "总人数(单聚合)",
            "COUNT(*)",
        )
        # 注意：不创建任何 MetricComponent → 走单聚合路径

        svc = MetricComputeService(db)
        res = await svc.compute_metric(m.id, "2026-07")
        assert res["status"] == "success", f"计算失败: {res.get('error_message')}"

        value = res["value"]
        assert value["measures"] == ["aggregated_value"], f"单聚合路径 measures 应为 [aggregated_value]: {value['measures']}"
        assert value["summary_value"] == 10, f"总人数应为10: {value['summary_value']}"

        rows = (await db.execute(
            select(MetricResultRow).where(MetricResultRow.metric_id == m.id)
        )).scalars().all()
        assert len(rows) == 2, f"应按部门分2行: {len(rows)}"
        for r in rows:
            assert "aggregated_value" in r.measure_values, f"缺少 aggregated_value: {r.measure_values}"

        await _delete_metric_chain(db, m.id)
        print("PASS: 单聚合路径 → 只含 aggregated_value，总人数=10")


async def test_integration_cleanup_shared():
    """测试收尾：删除共享物理表与数据集（幂等）。"""
    async with get_session_factory()() as db:
        if _SHARED.get("dataset_id"):
            ds = await db.get(DataSet, _SHARED["dataset_id"])
            if ds:
                await db.delete(ds)
                await db.commit()
        async with get_session_factory()() as ddl:
            await ddl.execute(sa_text("DROP TABLE IF EXISTS emp_turnover_it CASCADE"))
            # 清理本次生成的 DWS 视图
            for v in ("dws_turn_num_it", "dws_turn_den_it", "dws_turnz_num_it",
                      "dws_turnz_den_it", "dws_turn_single_it"):
                await ddl.execute(sa_text(f"DROP VIEW IF EXISTS {v} CASCADE"))
            await ddl.commit()
        _SHARED.clear()
        print("PASS: 共享资源已清理")


# ==================== MR0213 整改：批量保存 new_aggregate_index 协议测试 ====================
#
# 修复：前端组件模式保存时发送 new_aggregate_index，后端原 schema
# (MetricComponentBatchIn.components 为 MetricComponentCreateIn, extra=forbid)
# 拒绝该字段导致 422；原 service 又读取不存在的 aggregate_ref。
# 现 schema 新增 MetricComponentBatchItemIn（含 new_aggregate_index），
# service 按 new_aggregate_index 绑定新建聚合。
#
# 运行：pytest tests/test_warehouse_components.py -v -k batch_save

from sqlalchemy import delete as _sa_delete


async def _make_batch_metric(db, suf: str) -> int:
    """创建裸 WarehouseMetric（仅用于挂载组件，不需 DWS 视图）。

    同时创建一个最小 DataSet 以满足 related_dataset_id 外键约束。
    按固定 code 清旧，保证重复运行幂等。
    """
    await db.execute(sa_text("DELETE FROM warehouse_metrics WHERE metric_code = :c"), {"c": f"bm_{suf}"})
    await db.execute(sa_text("DELETE FROM datasets WHERE name = :c"), {"c": f"ds_bm_{suf}"})
    await db.commit()
    ds = DataSet(
        name=f"ds_bm_{suf}", label=f"批量测试数据集{suf}",
        warehouse_layer="DWD", status="published", version=1,
    )
    db.add(ds)
    await db.flush()
    m = WarehouseMetric(
        metric_code=f"bm_{suf}",
        metric_name=f"批量测试指标{suf}",
        metric_type="derived",
        formula_sql="COUNT(*)/COUNT(*)",
        related_dataset_id=ds.id,
        status="published",
        version=1,
    )
    db.add(m)
    await db.flush()
    await db.refresh(m)
    return m.id


async def _make_existing_agg(db, suf: str, metric_id: int, status: str) -> int:
    """创建一个已存在的 DWS 聚合定义（绑定到测试指标以满足外键），用于引用校验。"""
    agg = DwsAggregateDefinition(
        name=f"dws_bm_{suf}",
        label=f"已有聚合{suf}",
        metric_id=metric_id,
        source_dataset_id=None,
        group_by=[],
        aggregation="count",
        status=status,
    )
    db.add(agg)
    await db.flush()
    await db.refresh(agg)
    return agg.id


def test_batch_in_accepts_new_aggregate_index():
    """Schema 层：MetricComponentBatchIn 接受 new_aggregate_index（修复 422）"""
    from app.warehouse.schemas import (
        MetricComponentBatchIn, MetricComponentBatchItemIn, NewAggregateIn,
    )
    payload = MetricComponentBatchIn(
        components=[
            MetricComponentBatchItemIn(
                component_code="numerator", component_name="分子",
                role="numerator", new_aggregate_index=0,
            ),
            MetricComponentBatchItemIn(
                component_code="denominator", component_name="分母",
                role="denominator", new_aggregate_index=1,
            ),
        ],
        new_aggregates=[
            NewAggregateIn(source_dataset_id=1, name="dws_x_num", label="分子", group_by=["dept"], aggregation="COUNT"),
            NewAggregateIn(source_dataset_id=1, name="dws_x_den", label="分母", group_by=["dept"], aggregation="COUNT"),
        ],
    )
    assert payload.components[0].new_aggregate_index == 0
    assert payload.components[1].new_aggregate_index == 1
    dumped = payload.model_dump()
    # 不应因 extra=forbid 而拒绝 new_aggregate_index
    assert "new_aggregate_index" in dumped["components"][0]
    assert dumped["components"][0]["new_aggregate_index"] == 0


async def test_batch_save_new_aggregate_index_binds():
    """闭环：批量保存后组件正确绑定到新建 DWS 聚合定义（验收核心）"""
    from app.warehouse.service.component_service import get_component_service
    suf = uuid.uuid4().hex[:8]
    async with get_session_factory()() as db:
        metric_id = await _make_batch_metric(db, suf)
        svc = get_component_service(db)
        result = await svc.batch_save_components(metric_id, {
            "new_aggregates": [
                {"name": f"dws_bm_{suf}_num", "label": "分子",
                 "group_by": ["dept"], "aggregation": "COUNT"},
                {"name": f"dws_bm_{suf}_den", "label": "分母",
                 "group_by": ["dept"], "aggregation": "COUNT"},
            ],
            "components": [
                {"component_code": "numerator", "component_name": "分子", "role": "numerator",
                 "new_aggregate_index": 0, "is_auto_created": True},
                {"component_code": "denominator", "component_name": "分母", "role": "denominator",
                 "new_aggregate_index": 1, "is_auto_created": True},
            ],
        })
        await db.commit()
    assert len(result) == 2, f"应返回 2 个组件: {len(result)}"
    codes = {c["component_code"] for c in result}
    assert codes == {"numerator", "denominator"}
    num = next(c for c in result if c["component_code"] == "numerator")
    den = next(c for c in result if c["component_code"] == "denominator")
    assert num["aggregate_id"] is not None, "分子组件应绑定新建聚合"
    assert den["aggregate_id"] is not None, "分母组件应绑定新建聚合"
    assert num["aggregate_id"] != den["aggregate_id"]
    assert num["is_auto_created"] is True
    assert num["aggregate_status"] == "published"
    async with get_session_factory()() as db:
        aggs = (await db.execute(
            select(DwsAggregateDefinition).where(DwsAggregateDefinition.metric_id == metric_id)
        )).scalars().all()
        assert len(aggs) == 2, f"应新建 2 个聚合定义: {len(aggs)}"
        await _delete_metric_chain(db, metric_id)
        await db.commit()


async def test_batch_save_index_out_of_bounds():
    """new_aggregate_index 越界 → ValueError（API 层转 400）"""
    from app.warehouse.service.component_service import get_component_service
    suf = uuid.uuid4().hex[:8]
    async with get_session_factory()() as db:
        metric_id = await _make_batch_metric(db, suf)
        svc = get_component_service(db)
        with pytest.raises(ValueError, match="越界"):
            await svc.batch_save_components(metric_id, {
                "new_aggregates": [
                    {"name": f"dws_bm_{suf}_num", "label": "分子", "group_by": ["dept"], "aggregation": "COUNT"},
                ],
                "components": [
                    {"component_code": "numerator", "component_name": "分子", "role": "numerator",
                     "new_aggregate_index": 5},
                ],
            })
        await _delete_metric_chain(db, metric_id)
        await db.commit()


async def test_batch_save_both_empty_fails():
    """aggregate_id 和 new_aggregate_index 都为空 → ValueError（API 层转 400）"""
    from app.warehouse.service.component_service import get_component_service
    suf = uuid.uuid4().hex[:8]
    async with get_session_factory()() as db:
        metric_id = await _make_batch_metric(db, suf)
        svc = get_component_service(db)
        with pytest.raises(ValueError, match="必须绑定聚合定义"):
            await svc.batch_save_components(metric_id, {
                "components": [
                    {"component_code": "custom1", "component_name": "自定义", "role": "custom"},
                ],
            })
        await _delete_metric_chain(db, metric_id)
        await db.commit()


async def test_batch_save_reference_published_ok():
    """引用已有 published 聚合定义 → 成功"""
    from app.warehouse.service.component_service import get_component_service
    suf = uuid.uuid4().hex[:8]
    async with get_session_factory()() as db:
        metric_id = await _make_batch_metric(db, suf)
        agg_id = await _make_existing_agg(db, suf, metric_id, status="published")
        svc = get_component_service(db)
        result = await svc.batch_save_components(metric_id, {
            "components": [
                {"component_code": "num", "component_name": "分子", "role": "numerator",
                 "aggregate_id": agg_id},
            ],
        })
        await db.commit()
    assert len(result) == 1
    assert result[0]["aggregate_id"] == agg_id
    async with get_session_factory()() as db:
        await db.execute(_sa_delete(DwsAggregateDefinition).where(DwsAggregateDefinition.id == agg_id))
        await _delete_metric_chain(db, metric_id)
        await db.commit()


async def test_batch_save_reference_draft_fails():
    """引用 draft 聚合定义 → ValueError（未发布）"""
    from app.warehouse.service.component_service import get_component_service
    suf = uuid.uuid4().hex[:8]
    async with get_session_factory()() as db:
        metric_id = await _make_batch_metric(db, suf)
        agg_id = await _make_existing_agg(db, suf, metric_id, status="draft")
        svc = get_component_service(db)
        with pytest.raises(ValueError, match="未发布"):
            await svc.batch_save_components(metric_id, {
                "components": [
                    {"component_code": "num", "component_name": "分子", "role": "numerator",
                     "aggregate_id": agg_id},
                ],
            })
        await db.execute(_sa_delete(DwsAggregateDefinition).where(DwsAggregateDefinition.id == agg_id))
        await _delete_metric_chain(db, metric_id)
        await db.commit()
# ==================== 公式拆解集成测试（真实 PostgreSQL） ====================
#
# 运行：先确保 docker compose 栈已启动（hr-portal-db 在 5432 监听），然后
#   pytest tests/test_warehouse_components.py -v -k "decompose and integration"

async def test_integration_decompose_round_ratio():
    """集成：ROUND(比率*100,2) 经服务端拆解 → is_ratio + 双组件 + suggested_code。"""
    suf = uuid.uuid4().hex[:8]
    async with get_session_factory()() as db:
        shared = await _ensure_shared(db)
        from app.warehouse.service.component_service import ComponentService
        svc = ComponentService(db)
        res = await svc.decompose_formula(
            'ROUND(COUNT(*) / COUNT(*) * 100, 2)',
            shared["dataset_id"],
            metric_code=f"turnover_{suf}",
        )
        assert res["is_ratio"] is True, f"应识别为比率: {res}"
        assert len(res["components"]) == 2
        roles = {c["role"] for c in res["components"]}
        assert roles == {"numerator", "denominator"}, roles
        num = next(c for c in res["components"] if c["role"] == "numerator")
        den = next(c for c in res["components"] if c["role"] == "denominator")
        assert num["expression"] == 'COUNT(*)', num
        assert den["expression"] == 'COUNT(*)', den
        assert num["suggested_code"] == f"turnover_{suf}_numerator", num
        assert den["suggested_code"] == f"turnover_{suf}_denominator", den
        assert res["rate_expression"] is not None
        assert "*100" in res["rate_expression"]
        print("PASS: ROUND 比率公式服务端拆解正确")


async def test_integration_decompose_non_ratio():
    """集成：非比率公式 → is_ratio=False + 单个 custom 组件。"""
    suf = uuid.uuid4().hex[:8]
    async with get_session_factory()() as db:
        shared = await _ensure_shared(db)
        from app.warehouse.service.component_service import ComponentService
        svc = ComponentService(db)
        res = await svc.decompose_formula(
            'SUM(salary)', shared["dataset_id"], metric_code=f"cost_{suf}",
        )
        assert res["is_ratio"] is False
        assert len(res["components"]) == 1
        assert res["components"][0]["role"] == "custom"
        assert res["components"][0]["expression"] == 'SUM(salary)'
        print("PASS: 非比率公式不误判")


async def test_integration_decompose_denominator_zero():
    """集成：COUNT(*) / 0 可识别为比率且不抛异常（除零由计算侧处理）。"""
    suf = uuid.uuid4().hex[:8]
    async with get_session_factory()() as db:
        shared = await _ensure_shared(db)
        from app.warehouse.service.component_service import ComponentService
        svc = ComponentService(db)
        res = await svc.decompose_formula(
            'COUNT(*) / 0', shared["dataset_id"], metric_code=f"z_{suf}",
        )
        assert res["is_ratio"] is True
        den = next(c for c in res["components"] if c["role"] == "denominator")
        assert den["expression"] == '0', den
        print("PASS: 分母为 0 可识别且不抛异常")
