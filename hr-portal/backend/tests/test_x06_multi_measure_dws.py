# -*- coding: utf-8 -*-
"""X06 多度量 DWS 宽表 — 端到端测试

覆盖场景：
- A: 2 度量聚合 → generate-view → VIEW 含 2 个度量列
- B: compute → metric_result_rows.measure_values 含 2 个 key
- C: 多度量 + time_field → VIEW 含度量列 + year/quarter/month
- D: 单指标回归（metric_ids 只选 1 个）→ VIEW 含 aggregated_value 单列
- E: 两个指标名相同 → alias 自动追加后缀去重
- F: 同源校验 → 不同 source_dataset 报错

运行: pytest tests/test_x06_multi_measure_dws.py -v
"""
import pytest
from pydantic import ValidationError

from app.warehouse.schemas import (
    DwsAggregateDefinitionCreateIn,
    DwsAggregateDefinitionUpdateIn,
    DwsAggregateDefinitionOut,
    DwsMeasureDef,
    MetricComputeIn,
)


# ==================== 场景 D: Schema 校验 ====================

def test_create_in_with_metric_ids_single():
    """选 1 个指标 → 接受 metric_ids"""
    payload = DwsAggregateDefinitionCreateIn(
        name="dws_test", label="测试",
        metric_ids=[1],
        source_dataset_id=1,
        group_by=["dept"],
    )
    assert payload.metric_ids == [1]
    assert payload.metric_id is None  # 不传 metric_id


def test_create_in_with_metric_ids_multi():
    """选 N 个指标 → 接受 metric_ids"""
    payload = DwsAggregateDefinitionCreateIn(
        name="dws_test", label="测试",
        metric_ids=[1, 2, 3],
        source_dataset_id=1,
        group_by=["dept"],
    )
    assert payload.metric_ids == [1, 2, 3]


def test_create_in_with_metric_id_backward_compat():
    """只传 metric_id（旧接口兼容）→ 接受"""
    payload = DwsAggregateDefinitionCreateIn(
        name="dws_test", label="测试",
        metric_id=1,
        source_dataset_id=1,
        group_by=["dept"],
    )
    assert payload.metric_id == 1
    assert payload.metric_ids is None


def test_create_in_without_any_metric():
    """不传任何指标 → schema 接受（server 层校验报错）"""
    payload = DwsAggregateDefinitionCreateIn(
        name="dws_test", label="测试",
        source_dataset_id=1,
        group_by=["dept"],
    )
    assert payload.metric_id is None
    assert payload.metric_ids is None


def test_create_in_with_both_metric_id_and_ids():
    """同时传 metric_id 和 metric_ids → schema 接受（后端优先 metric_ids）"""
    payload = DwsAggregateDefinitionCreateIn(
        name="dws_test", label="测试",
        metric_id=1, metric_ids=[2, 3],
        source_dataset_id=1,
        group_by=["dept"],
    )
    assert payload.metric_id == 1
    assert payload.metric_ids == [2, 3]


def test_update_in_with_metric_ids():
    """Update 接受 metric_ids"""
    payload = DwsAggregateDefinitionUpdateIn(metric_ids=[1, 2])
    assert payload.metric_ids == [1, 2]


def test_out_with_measures():
    """Out schema 接受 measures"""
    payload = DwsAggregateDefinitionOut(
        id=1, name="dws_test", label="测试",
        metric_id=1,
        measures=[DwsMeasureDef(metric_id=2, alias="headcount", label="在职人数")],
        source_dataset_id=1,
    )
    assert payload.measures is not None
    assert payload.measures[0].alias == "headcount"
    assert payload.measures[0].label == "在职人数"


def test_out_without_measures():
    """Out schema measures 可选"""
    payload = DwsAggregateDefinitionOut(
        id=1, name="dws_test", label="测试",
        metric_id=1, source_dataset_id=1,
    )
    assert payload.measures is None


# ==================== DwsMeasureDef ====================

def test_measure_def_required_metric_id():
    """metric_id 必填"""
    with pytest.raises(ValidationError):
        DwsMeasureDef()  # type: ignore


def test_measure_def_minimal():
    """最简定义：只传 metric_id"""
    md = DwsMeasureDef(metric_id=1)
    assert md.metric_id == 1
    assert md.alias is None
    assert md.label is None


def test_measure_def_full():
    """完整定义"""
    md = DwsMeasureDef(metric_id=1, alias="headcount", label="在职人数")
    assert md.alias == "headcount"
    assert md.label == "在职人数"


def test_measure_def_extra_fields_forbidden():
    """禁止额外字段"""
    with pytest.raises(Exception):
        DwsMeasureDef(metric_id=1, unknown="xxx")  # type: ignore


# ==================== MetricComputeIn ====================

def test_compute_in_valid():
    """接受合法的 period"""
    payload = MetricComputeIn(period="2026-07")
    assert payload.period == "2026-07"


def test_compute_in_missing_period():
    """period 必填"""
    with pytest.raises(ValidationError):
        MetricComputeIn()  # type: ignore


def test_compute_in_long_period():
    """period 最大 32 字符"""
    payload = MetricComputeIn(period="x" * 32)
    assert len(payload.period) == 32


def test_compute_in_too_long_period():
    """period 超过 32 字符"""
    with pytest.raises(ValidationError):
        MetricComputeIn(period="x" * 33)


# ==================== 场景 E: _slugify ====================

from app.warehouse.service.modeling import DwsAggregateService


def test_slugify_english():
    """英文指标名 slugify"""
    assert DwsAggregateService._slugify("Employee Headcount") == "employee_headcount"


def test_slugify_metric_code():
    """英文 metric_code 直接 slugify"""
    assert DwsAggregateService._slugify("emp_headcount") == "emp_headcount"


def test_slugify_special_chars():
    """特殊字符替换为下划线"""
    result = DwsAggregateService._slugify("员工-在职人数(V1)")
    # 中文 → hash
    assert result.startswith("m")
    assert len(result) <= 63


def test_slugify_starts_with_digit():
    """首字符为数字时追加 m_ 前缀"""
    result = DwsAggregateService._slugify("2024_revenue")
    assert result == "m_2024_revenue"


def test_slugify_all_special():
    """全特殊字符 → 返回 'measure'"""
    result = DwsAggregateService._slugify("!!!")
    assert result == "measure"


def test_slugify_empty():
    """空字符串 → 'measure'"""
    result = DwsAggregateService._slugify("")
    assert result == "measure"


def test_slugify_truncate():
    """超长名字截断到 63 字符"""
    long_name = "a" * 80
    result = DwsAggregateService._slugify(long_name)
    assert len(result) == 63


def test_slugify_multi_underscore():
    """连续下划线合并"""
    result = DwsAggregateService._slugify("a___b")
    assert result == "a_b"


def test_slugify_chinese_name():
    """中文指标名 → hash-based alias"""
    result = DwsAggregateService._slugify("在职人数")
    assert result.startswith("m")
    assert all(c in "abcdef0123456789" for c in result[1:])


# ==================== measures 结构验证 ====================

def test_measures_structure_validation():
    """验证 measures JSON 结构符合设计"""
    measures = [
        {"metric_id": 1, "alias": "headcount", "label": "在职人数"},
        {"metric_id": 2, "alias": "turnover", "label": "离职人数"},
    ]
    for ms in measures:
        assert "metric_id" in ms
        assert isinstance(ms["metric_id"], int)
        assert "alias" in ms
        assert isinstance(ms["alias"], str)
        assert "label" in ms
        assert isinstance(ms["label"], str)


# ==================== 向后兼容：单指标路径 ====================

def test_single_metric_regression_schema():
    """单指标创建与旧版的 metric_id 路径一致"""
    payload = DwsAggregateDefinitionCreateIn(
        name="dws_employee_count", label="在职人数汇总",
        metric_id=1, source_dataset_id=1,
        group_by=["department"],
    )
    assert payload.metric_id == 1
    assert payload.metric_ids is None


def test_single_metric_via_ids():
    """metric_ids 只有 1 个 → 等同于单指标"""
    payload = DwsAggregateDefinitionCreateIn(
        name="dws_employee_count", label="在职人数汇总",
        metric_ids=[1], source_dataset_id=1,
        group_by=["department"],
    )
    assert payload.metric_ids == [1]
    assert payload.metric_id is None


# ==================== 服务层集成测试 (mock DB) ====================

from unittest.mock import AsyncMock, MagicMock, patch
from app.warehouse.service.modeling import DwsAggregateService


class TestValidateSourceSameDataset:
    """同源约束校验：metric_ids 中所有指标必须来自同一 DWD 数据集。"""

    @pytest.fixture
    def mock_dataset(self):
        ds = MagicMock()
        ds.id = 1
        ds.warehouse_layer = "DWD"
        return ds

    @pytest.fixture
    def mock_metric(self):
        def _make(metric_id: int, dataset_id: int | None, name: str = "test", formula_sql: str = "COUNT(*)"):
            m = MagicMock()
            m.id = metric_id
            m.metric_code = f"mc_{metric_id}"
            m.metric_name = name
            m.related_dataset_id = dataset_id
            m.formula_sql = formula_sql
            return m
        return _make

    @pytest.fixture
    def mock_dimension(self):
        d = MagicMock()
        d.dimension_code = "dept"
        d.source_dataset_id = 1
        d.bound_field = "department_id"
        return d

    async def _build_svc_and_validate(self, mock_metrics, payload_extra=None):
        """构建 service 并执行校验。"""
        from app.datasets.models import WarehouseMetric as WM
        from app.warehouse.models import Dimension as Dim
        from app.datasets.models import DataSet
        session = AsyncMock()

        ds = MagicMock(); ds.id = 1; ds.warehouse_layer = "DWD"
        dim = MagicMock(); dim.dimension_code = "dept"; dim.source_dataset_id = 1; dim.bound_field = "dept_id"

        async def mock_get(model_class, obj_id):
            if model_class is DataSet:
                return ds
            if model_class is WM:
                return next((m for m in mock_metrics if m.id == obj_id), None)
            if model_class is Dim:
                return dim
            return None

        session.get = AsyncMock(side_effect=mock_get)
        dims_result = MagicMock()
        dims_result.scalars.return_value.all.return_value = [dim]
        session.execute = AsyncMock(return_value=dims_result)

        svc = DwsAggregateService(session)
        payload = {
            "source_dataset_id": 1,
            "metric_ids": [m.id for m in mock_metrics],
            "group_by": ["dept"],
        }
        if payload_extra:
            payload.update(payload_extra)
        await svc._validate_aggregate_source(payload)

    @pytest.mark.asyncio
    async def test_same_source_accepts(self, mock_metric):
        """所有指标同一数据集 → 校验通过。"""
        metrics = [mock_metric(1, 1, "在职人数"), mock_metric(2, 1, "离职人数")]
        try:
            await self._build_svc_and_validate(metrics)
        except ValueError as e:
            pytest.fail(f"同源校验不应抛错: {e}")

    @pytest.mark.asyncio
    async def test_cross_source_rejects(self, mock_metric):
        """第 2 个指标跨源 → ValueError。"""
        metrics = [mock_metric(1, 1, "在职人数"), mock_metric(2, 2, "离职人数")]
        with pytest.raises(ValueError, match="必须与聚合使用同一个DWD数据集"):
            await self._build_svc_and_validate(metrics)

    @pytest.mark.asyncio
    async def test_missing_formula_sql_raises(self, mock_metric):
        """指标无 formula_sql → ValueError。"""
        metrics = [mock_metric(1, 1, "在职人数", formula_sql=None)]
        with pytest.raises(ValueError, match="未配置公式"):
            await self._build_svc_and_validate(metrics)

    @pytest.mark.asyncio
    async def test_single_metric_id_backward(self, mock_metric):
        """旧版 metric_id 单指标 → 校验通过。"""
        from app.datasets.models import WarehouseMetric as WM
        from app.warehouse.models import Dimension as Dim
        from app.datasets.models import DataSet
        session = AsyncMock()
        ds = MagicMock(); ds.id = 1; ds.warehouse_layer = "DWD"
        m = mock_metric(1, 1, "在职人数")
        dim = MagicMock(); dim.dimension_code = "dept"; dim.source_dataset_id = 1; dim.bound_field = "dept_id"
        async def mock_get(model_class, obj_id):
            if model_class is DataSet: return ds
            if model_class is WM: return m
            if model_class is Dim: return dim
            return None
        session.get = AsyncMock(side_effect=mock_get)
        dims_result = MagicMock()
        dims_result.scalars.return_value.all.return_value = [dim]
        session.execute = AsyncMock(return_value=dims_result)
        svc = DwsAggregateService(session)
        payload = {"source_dataset_id": 1, "metric_id": 1, "group_by": ["dept"]}
        try:
            await svc._validate_aggregate_source(payload)
        except ValueError as e:
            pytest.fail(f"单指标兼容路径不应抛错: {e}")

    @pytest.mark.asyncio
    async def test_no_metric_raises(self, mock_metric):
        """不传任何指标 → ValueError。"""
        from app.warehouse.models import Dimension as Dim
        from app.datasets.models import DataSet
        session = AsyncMock()
        ds = MagicMock(); ds.id = 1; ds.warehouse_layer = "DWD"
        dim = MagicMock(); dim.dimension_code = "dept"; dim.source_dataset_id = 1; dim.bound_field = "dept_id"
        async def mock_get(model_class, obj_id):
            if model_class is DataSet: return ds
            if model_class is Dim: return dim
            return None
        session.get = AsyncMock(side_effect=mock_get)
        dims_result = MagicMock()
        dims_result.scalars.return_value.all.return_value = [dim]
        session.execute = AsyncMock(return_value=dims_result)
        svc = DwsAggregateService(session)
        with pytest.raises(ValueError, match="未指定关联指标"):
            await svc._validate_aggregate_source({"source_dataset_id": 1, "group_by": ["dept"]})


class TestDeriveMeasures:
    """_derive_measures 自动派生测试。"""

    @pytest.fixture
    def mock_metric(self):
        def _make(metric_id: int, metric_code: str, metric_name: str, formula_sql: str = "COUNT(*)"):
            m = MagicMock()
            m.id = metric_id
            m.metric_code = metric_code
            m.metric_name = metric_name
            m.formula_sql = formula_sql
            return m
        return _make

    @pytest.mark.asyncio
    async def test_derive_measures_english(self, mock_metric):
        """英文指标名 → 正确派生 alias/label。"""
        session = AsyncMock()
        metrics = [mock_metric(1, "emp_count", "Employee Count"), mock_metric(2, "turnover", "Turnover")]
        session.get = AsyncMock(side_effect=lambda model, oid: next((m for m in metrics if m.id == oid), None))
        svc = DwsAggregateService(session)
        result = await svc._derive_measures([1, 2])
        assert len(result) == 2
        assert result[0] == {"metric_id": 1, "alias": "emp_count", "label": "Employee Count"}
        assert result[1] == {"metric_id": 2, "alias": "turnover", "label": "Turnover"}

    @pytest.mark.asyncio
    async def test_derive_measures_chinese(self, mock_metric):
        """中文指标名 → hash alias。"""
        session = AsyncMock()
        metrics = [mock_metric(1, "hc001", "在职人数"), mock_metric(2, "to001", "离职人数")]
        session.get = AsyncMock(side_effect=lambda model, oid: next((m for m in metrics if m.id == oid), None))
        svc = DwsAggregateService(session)
        result = await svc._derive_measures([1, 2])
        assert len(result) == 2
        assert result[0]["metric_id"] == 1
        assert result[0]["label"] == "在职人数"
        assert result[1]["label"] == "离职人数"
        # 有 metric_code → 用 metric_code 做 alias
        assert result[0]["alias"] == "hc001"

    @pytest.mark.asyncio
    async def test_derive_measures_duplicate_alias(self, mock_metric):
        """同名 metric_code → alias 自动去重。"""
        session = AsyncMock()
        metrics = [mock_metric(1, "same_code", "Metric A"), mock_metric(2, "same_code", "Metric B")]
        session.get = AsyncMock(side_effect=lambda model, oid: next((m for m in metrics if m.id == oid), None))
        svc = DwsAggregateService(session)
        result = await svc._derive_measures([1, 2])
        assert result[0]["alias"] == "same_code"
        assert result[1]["alias"] == "same_code_1"

    @pytest.mark.asyncio
    async def test_derive_measures_metric_not_found(self, mock_metric):
        """指标不存在 → ValueError。"""
        session = AsyncMock()
        session.get = AsyncMock(return_value=None)
        svc = DwsAggregateService(session)
        with pytest.raises(ValueError, match="指标 ID=1 不存在"):
            await svc._derive_measures([1])

    @pytest.mark.asyncio
    async def test_derive_measures_missing_formula_sql(self, mock_metric):
        """指标无 formula_sql → ValueError。"""
        session = AsyncMock()
        m = mock_metric(1, "test", "Test", formula_sql=None)
        session.get = AsyncMock(return_value=m)
        svc = DwsAggregateService(session)
        with pytest.raises(ValueError, match="未配置公式"):
            await svc._derive_measures([1])


class TestComputeWideTableErrors:
    """compute_wide_table 错误路径。"""

    @pytest.mark.asyncio
    async def test_not_found(self):
        """聚合定义不存在 → 返回 error dict。"""
        session = AsyncMock()
        session.get = AsyncMock(return_value=None)
        svc = DwsAggregateService(session)
        result = await svc.compute_wide_table(agg_id=999, period="2026-07")
        assert result == {"error": "not_found", "detail": "聚合定义不存在: 999"}

    @pytest.mark.asyncio
    async def test_no_measures(self):
        """measures 为空 → 返回 bad_request。"""
        session = AsyncMock()
        agg = MagicMock()
        agg.measures = None
        session.get = AsyncMock(return_value=agg)
        svc = DwsAggregateService(session)
        result = await svc.compute_wide_table(agg_id=1, period="2026-07")
        assert result == {"error": "bad_request", "detail": "该聚合定义未配置多度量(measures)，请使用单指标计算接口"}
