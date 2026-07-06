# -*- coding: utf-8 -*-
"""建模 V2 (Q05) 测试

覆盖: publish-v2 输入校验、版本历史 ModelVersionOut、回滚输入、预览 Schema
"""
import pytest
from pydantic import ValidationError

from app.warehouse.schemas import (
    ModelVersionOut,
    ModelVersionRollbackIn,
    ModelPreviewV2Out,
    WarehouseModelCreateIn,
    WarehouseModelUpdateIn,
)


# ==================== ModelVersionOut ====================

def test_version_out_basic():
    v = ModelVersionOut(version=1, status="published")
    assert v.version == 1
    assert v.status == "published"
    assert v.published_at is None
    assert v.published_by is None
    assert v.diff_snapshot is None


def test_version_out_with_diff():
    v = ModelVersionOut(
        version=2,
        status="published",
        diff_snapshot={"version": 2, "published_by": 1},
    )
    assert v.diff_snapshot["version"] == 2


# ==================== ModelVersionRollbackIn ====================

def test_rollback_in_valid():
    r = ModelVersionRollbackIn(target_version=2)
    assert r.target_version == 2


def test_rollback_in_missing():
    with pytest.raises(ValidationError):
        ModelVersionRollbackIn()


def test_rollback_in_negative():
    """target_version 应为正整数"""
    with pytest.raises(ValidationError):
        ModelVersionRollbackIn(target_version=-1)


# ==================== ModelPreviewV2Out ====================

def test_preview_v2_basic():
    p = ModelPreviewV2Out(
        sql="SELECT * FROM `emp`",
        sql_explanation="主表: emp",
        items=[],
        columns=[],
        total=0,
        errors=[],
    )
    assert p.sql == "SELECT * FROM `emp`"
    assert p.total == 0
    assert p.errors == []


def test_preview_v2_with_errors():
    p = ModelPreviewV2Out(
        sql="",
        sql_explanation="",
        items=[],
        columns=[],
        total=None,
        errors=[{"node_id": "relation:1", "message": "关联左表别名不存在: t_x"}],
    )
    assert len(p.errors) == 1
    assert p.errors[0]["node_id"] == "relation:1"


def test_preview_v2_empty_model():
    """空模型应返回 sql="" 且有 error"""
    p = ModelPreviewV2Out(
        sql="",
        sql_explanation="",
        items=[],
        columns=[],
        total=0,
        errors=[{"node_id": "dataset:1", "message": "模型未包含任何表"}],
    )
    assert p.sql == ""
    assert "未包含任何表" in p.errors[0]["message"]


# ==================== Schema: WarehouseModelCreateIn ====================

def test_model_create_in_valid():
    m = WarehouseModelCreateIn(
        name="测试模型",
        warehouse_layer="DWD",
        tables=[{"table_name": "emp", "alias": "t1"}],
    )
    assert m.name == "测试模型"
    assert m.warehouse_layer == "DWD"
    assert len(m.tables) == 1


def test_model_create_in_layer_default():
    """warehouse_layer 实际校验在 router 层，schema 接受任意 str"""
    m = WarehouseModelCreateIn(
        name="test",
        warehouse_layer="DWS",
        tables=[{"table_name": "emp", "alias": "t1"}],
    )
    assert m.warehouse_layer == "DWS"


def test_model_create_in_missing_name():
    with pytest.raises(ValidationError):
        WarehouseModelCreateIn(
            warehouse_layer="DWD",
            tables=[{"table_name": "emp", "alias": "t1"}],
        )


# ==================== Schema: WarehouseModelUpdateIn ====================

def test_model_update_partial():
    m = WarehouseModelUpdateIn(name="新名称")
    assert m.name == "新名称"
    assert m.warehouse_layer is None


def test_model_update_empty():
    m = WarehouseModelUpdateIn()
    assert m.name is None
    assert m.warehouse_layer is None
    assert m.subject_area is None
