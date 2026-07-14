# -*- coding: utf-8 -*-
"""数据仓库指标 API 测试

覆盖 F0101-F0113 测试要求：
- 单元测试：Schema 校验、ORM 字段完整性、Literal 枚举
- 集成测试：需配置测试 Token 后激活（当前 skip）

运行: pytest tests/test_warehouse_metrics.py -v
"""
import pytest

from app.warehouse.schemas import (
    WarehouseMetricCreateIn,
    WarehouseMetricOut,
    WarehouseMetricDetailOut,
    WarehouseMetricUpdateIn,
)


# ==================== Schema 级单元测试 ====================


def test_metric_create_in_defaults():
    """创建 schema 默认值正确"""
    m = WarehouseMetricCreateIn(metric_code="t1", metric_name="test")
    assert m.metric_type == "derived"
    assert m.metric_code == "t1"
    assert m.metric_name == "test"


def test_metric_create_in_rejects_invalid_type():
    """非法 metric_type 被 Literal 拒绝 → ValidationError"""
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        WarehouseMetricCreateIn(
            metric_code="t1", metric_name="test", metric_type="invalid"
        )


def test_metric_create_in_allows_valid_types():
    """所有合法 metric_type 值可创建"""
    for t in ("count", "sum", "ratio", "derived", "text"):
        m = WarehouseMetricCreateIn(metric_code=t, metric_name=t, metric_type=t)
        assert m.metric_type == t


def test_metric_update_in_nulls_cleared():
    """UpdateIn 允许传 None 清空字段（exclude_unset 后生效）"""
    m = WarehouseMetricUpdateIn(metric_name="new", subject_area=None)
    assert m.metric_name == "new"
    assert m.subject_area is None


def test_metric_out_fields():
    """Out schema 包含所需字段"""
    m = WarehouseMetricOut(
        id=1, metric_code="x", metric_name="x",
        status="draft", version=1,
    )
    assert m.id == 1
    assert m.status == "draft"


def test_metric_detail_out_inherits_base():
    """DetailOut 继承 Out 的字段"""
    m = WarehouseMetricDetailOut(
        id=1, metric_code="x", metric_name="x",
        published_at=None, published_by=None,
    )
    assert m.id == 1
    assert m.published_at is None


# ==================== ORM 字段完整性 ====================


def test_warehouse_metric_orm_fields():
    """验证 WarehouseMetric ORM 包含所有必需字段"""
    from app.datasets.models import WarehouseMetric
    field_names = {c.name for c in WarehouseMetric.__table__.columns}
    required = {
        "id", "metric_code", "metric_name", "metric_type", "status",
        "version", "published_at", "published_by", "related_fields",
        "related_dataset_id", "created_at", "updated_at",
    }
    missing = required - field_names
    assert not missing, f"ORM 缺少字段: {missing}"


def test_warehouse_metric_unique_constraints():
    """验证 metric_code 唯一约束存在"""
    from app.datasets.models import WarehouseMetric
    constraints = {c.name for c in WarehouseMetric.__table__.constraints}
    assert "uq_warehouse_metric_code" in constraints


def test_metric_result_row_orm_fields():
    """验证 MetricResultRow ORM 承载多维结果集明细"""
    from app.warehouse.models import MetricResultRow
    field_names = {c.name for c in MetricResultRow.__table__.columns}
    required = {
        "id", "result_id", "metric_id", "period", "row_index",
        "dimension_values", "measure_values", "value", "computed_at", "created_at",
    }
    missing = required - field_names
    assert not missing, f"ORM 缺少字段: {missing}"


def test_metric_result_schema_contains_rows():
    """验证指标结果响应包含明细行"""
    from app.warehouse.schemas import MetricResultOut
    fields = set(MetricResultOut.model_fields)
    assert "rows" in fields


# ==================== Schema 导入完整性 ====================


def test_all_metric_schemas_importable():
    """所有指标 schema 可正常导入"""
    schemas = [
        WarehouseMetricCreateIn,
        WarehouseMetricOut,
        WarehouseMetricDetailOut,
        WarehouseMetricUpdateIn,
    ]
    for s in schemas:
        assert s is not None


# ==================== 集成测试（需配置测试 Token） ====================

@pytest.mark.skip(reason="需要测试数据库和认证 Token")
async def test_create_metric_success():
    """创建成功 → 200"""
    pass


@pytest.mark.skip(reason="需要测试数据库和认证 Token")
async def test_create_metric_duplicate_code_returns_400():
    """重复 code → 400"""
    pass


@pytest.mark.skip(reason="需要测试数据库和认证 Token")
async def test_create_metric_nonexistent_dataset_returns_400():
    """不存在 dataset → 400"""
    pass


@pytest.mark.skip(reason="需要测试数据库和认证 Token")
async def test_get_metric_not_found_returns_404():
    """不存在 → 404"""
    pass


@pytest.mark.skip(reason="需要测试数据库和认证 Token")
async def test_publish_non_draft_returns_400():
    """非 draft 发布 → 400"""
    pass


@pytest.mark.skip(reason="需要测试数据库和认证 Token")
async def test_archive_non_published_returns_400():
    """非 published 归档 → 400"""
    pass


@pytest.mark.skip(reason="需要测试数据库和认证 Token")
async def test_update_archived_returns_400():
    """归档不可编辑 → 400"""
    pass


@pytest.mark.skip(reason="需要测试数据库和认证 Token")
async def test_patch_null_clears_field():
    """PATCH null → 清空 nullable"""
    pass


@pytest.mark.skip(reason="需要测试数据库和认证 Token")
async def test_metrics_no_auth_returns_403():
    """无权限 → 403"""
    pass
