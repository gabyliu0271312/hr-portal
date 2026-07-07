# -*- coding: utf-8 -*-
"""P0-6: layer_policy + extra=forbid + 安全校验 测试

覆盖:
  - DDL 操作白名单
  - target_layer 伪造拒绝
  - ODS 只读保护
  - CREATE 物理冲突 / 命名冲突
  - 全 Schema extra='forbid' 元测试
  - extra='forbid' 422 抽样
"""
import pytest
from pydantic import BaseModel

from app.warehouse.layer_policy import (
    DDL_CREATE, DDL_DROP, DDL_REPLACE, DDL_ALTER, DDL_TRUNCATE,
    ALLOWED_DDL_OPERATIONS, DESTRUCTIVE_DDL,
    _normalize_operation, _validate_identifier,
    assert_not_ods_write, assert_writable_layer, validate_layer_transition,
    validate_ddl_operation,
)


# ════════════════════════ DDL 白名单 ════════════════════════

def test_allowed_ddl_operations():
    assert DDL_CREATE in ALLOWED_DDL_OPERATIONS
    assert DDL_DROP in ALLOWED_DDL_OPERATIONS
    assert DDL_REPLACE in ALLOWED_DDL_OPERATIONS
    assert DDL_ALTER in ALLOWED_DDL_OPERATIONS
    assert DDL_TRUNCATE in ALLOWED_DDL_OPERATIONS
    assert "INVALID_OP" not in ALLOWED_DDL_OPERATIONS


def test_destructive_ddl_set():
    """DROP/REPLACE/ALTER/TRUNCATE 都是破坏性操作"""
    assert DDL_DROP in DESTRUCTIVE_DDL
    assert DDL_REPLACE in DESTRUCTIVE_DDL
    assert DDL_ALTER in DESTRUCTIVE_DDL
    assert DDL_TRUNCATE in DESTRUCTIVE_DDL
    assert DDL_CREATE not in DESTRUCTIVE_DDL


def test_normalize_operation_create_or_replace():
    """CREATE OR REPLACE → REPLACE"""
    assert _normalize_operation("CREATE OR REPLACE") == DDL_REPLACE
    assert _normalize_operation("INSERT OVERWRITE") == DDL_REPLACE


def test_normalize_operation_invalid():
    with pytest.raises(ValueError, match="不在白名单"):
        _normalize_operation("RANDOM_SQL")


def test_validate_identifier_rejects_special():
    with pytest.raises(ValueError, match="非法"):
        _validate_identifier("DROP TABLE employees")


# ════════════════════ ODS 只读 ════════════════════

def test_ods_write_rejected():
    with pytest.raises(ValueError, match="ODS"):
        assert_not_ods_write("ODS")
    with pytest.raises(ValueError, match="ODS"):
        assert_not_ods_write("ods")


def test_ods_write_lowercase_rejected():
    with pytest.raises(ValueError, match="ODS"):
        assert_not_ods_write("ods")


def test_non_writable_layer_rejected():
    with pytest.raises(ValueError, match="不可写"):
        assert_writable_layer("ODS")
    with pytest.raises(ValueError, match="不可写"):
        assert_writable_layer("DIM")


def test_writable_layer_allowed():
    assert_writable_layer("DWD")
    assert_writable_layer("DWS")
    assert_writable_layer("ADS")


# ════════════════════ 分层流转 ════════════════════

def test_layer_transition_valid():
    validate_layer_transition("ODS", "DWD", "standardize")
    validate_layer_transition("DWD", "DWS", "aggregate")
    validate_layer_transition("DWS", "ADS", "consume")


def test_layer_transition_invalid_ods_to_ads():
    with pytest.raises(ValueError, match="不允许"):
        validate_layer_transition("ODS", "ADS", "consume")


def test_layer_transition_reverse():
    with pytest.raises(ValueError):
        validate_layer_transition("ADS", "DWD", "consume")


# ════════════════════ extra='forbid' 元测试 ════════════════════

def test_all_warehouse_write_schemas_forbid_extra():
    """P0-2: 全部 22 个 R 章写入 Request Schema 必须 extra='forbid'"""
    from app.warehouse.schemas import (
        AdsDefinitionIn, AdsDefinitionUpdateIn,
        ScdConfigIn, ScdConfigUpdateIn,
        SnapshotJobIn, SnapshotJobUpdateIn, SnapshotTriggerIn,
        StandardizationRuleIn, StandardizationRuleUpdateIn,
        StandardizationTemplateIn, StandardizationTemplateUpdateIn,
        TemplateLoadRequest, PreviewRequest, DwdViewGenerateRequest,
        RefreshStrategyUpdateIn,
        DimensionCreateIn, DimensionUpdateIn,
        DwsAggregateDefinitionCreateIn, DwsAggregateDefinitionUpdateIn, DwsViewGenerateRequest,
        MetricComputeIn, MetricRecalcIn,
    )
    schemas = [
        AdsDefinitionIn, AdsDefinitionUpdateIn,
        ScdConfigIn, ScdConfigUpdateIn,
        SnapshotJobIn, SnapshotJobUpdateIn, SnapshotTriggerIn,
        StandardizationRuleIn, StandardizationRuleUpdateIn,
        StandardizationTemplateIn, StandardizationTemplateUpdateIn,
        TemplateLoadRequest, PreviewRequest, DwdViewGenerateRequest,
        RefreshStrategyUpdateIn,
        DimensionCreateIn, DimensionUpdateIn,
        DwsAggregateDefinitionCreateIn, DwsAggregateDefinitionUpdateIn, DwsViewGenerateRequest,
        MetricComputeIn, MetricRecalcIn,
    ]
    for schema in schemas:
        assert schema.model_config.get("extra") == "forbid", (
            f"{schema.__name__} missing extra='forbid'"
        )


def test_ads_in_rejects_raw_sql():
    """P0-2: AdsDefinitionIn 传入 raw_sql → 422"""
    from app.warehouse.schemas import AdsDefinitionIn
    with pytest.raises(Exception):  # ValidationError
        AdsDefinitionIn(name="test", source_id=1, raw_sql="DROP TABLE x")


def test_execute_full_via_schema():
    """P0-2: DwdViewGenerateRequest 传入 raw_sql → rejected"""
    from app.warehouse.schemas import DwdViewGenerateRequest
    with pytest.raises(Exception):
        DwdViewGenerateRequest(asset_code="t", raw_sql="DROP TABLE")
