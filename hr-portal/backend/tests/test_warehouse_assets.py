# -*- coding: utf-8 -*-
"""数据仓库资产 API 测试

覆盖 I0101-I0105 / K0201-K0209 对应的后端 Schema 和风险点。
- 单元测试：Schema 校验、枚举、nullable
- 运行: pytest tests/test_warehouse_assets.py -v
"""
import pytest
from pydantic import ValidationError

from app.warehouse.schemas import (
    WarehouseAssetOut,
    WarehouseAssetDetailOut,
    WarehouseAssetUpdateIn,
    UcpInfoOut,
    WAREHOUSE_LAYERS,
    ASSET_STATUSES,
)


# ==================== UcpInfoOut ====================

def test_ucp_info_defaults():
    u = UcpInfoOut()
    assert u.enabled is False
    assert u.system_id is None
    assert u.resource_id is None


def test_ucp_info_no_secret_fields():
    """UcpInfoOut 不应包含 secret/token/password 字段"""
    u = UcpInfoOut()
    assert not hasattr(u, 'secret')
    assert not hasattr(u, 'password')
    assert not hasattr(u, 'token')


# ==================== WarehouseAssetOut ====================

def test_asset_out_basic():
    a = WarehouseAssetOut(table_name="t1", table_label="T1")
    assert a.table_name == "t1"
    assert a.table_label == "T1"
    assert a.warehouse_layer == "ODS"
    assert a.asset_status == "published"
    assert a.last_quality_status == "unknown"
    assert a.description is None


def test_asset_out_from_attributes():
    """使用 from_attributes=True 模拟 ORM 对象"""
    class FakeRow:
        table_name = "emp"
        table_label = "员工表"
        description = None
        warehouse_layer = "DWD"
        subject_area = None
        owner_name = None
        source_system = None
        asset_status = "published"
        last_quality_status = "pass"
        columns_count = 12
        last_synced_at = None
    a = WarehouseAssetOut.model_validate(FakeRow())
    assert a.table_name == "emp"
    assert a.columns_count == 12


# ==================== WarehouseAssetDetailOut ====================

def test_asset_detail_has_ucp():
    a = WarehouseAssetDetailOut(
        table_name="t1", table_label="x",
        ucp=UcpInfoOut(enabled=True, resource_id=5),
    )
    assert a.ucp.enabled is True
    assert a.ucp.resource_id == 5
    assert a.is_builtin is False


def test_asset_detail_inherits_fields():
    a = WarehouseAssetDetailOut(
        table_name="t1", table_label="x",
        warehouse_layer="ADS", asset_status="archived",
    )
    assert a.warehouse_layer == "ADS"
    assert a.asset_status == "archived"


# ==================== WarehouseAssetUpdateIn ====================

def test_asset_update_allows_partial():
    p = WarehouseAssetUpdateIn(table_label="new")
    assert p.table_label == "new"
    assert p.warehouse_layer is None
    assert p.description is None


def test_asset_update_nulls_allowed():
    """exclude_unset 模式允许传 None 清空 nullable 字段"""
    p = WarehouseAssetUpdateIn(description=None, subject_area=None)
    assert p.description is None
    assert p.subject_area is None


def test_asset_update_ucp_fields():
    p = WarehouseAssetUpdateIn(
        ucp_system_id=1,
        ucp_resource_id=2,
        ucp_connector_config_id=None,
    )
    assert p.ucp_system_id == 1
    assert p.ucp_connector_config_id is None


# ==================== 枚举校验 ====================

def test_warehouse_layers_valid():
    assert len(WAREHOUSE_LAYERS) == 4
    assert "ODS" in WAREHOUSE_LAYERS
    assert "DWD" in WAREHOUSE_LAYERS
    assert "DWS" in WAREHOUSE_LAYERS
    assert "ADS" in WAREHOUSE_LAYERS


def test_asset_statuses_valid():
    assert "draft" in ASSET_STATUSES
    assert "published" in ASSET_STATUSES
    assert "disabled" in ASSET_STATUSES
    assert "archived" in ASSET_STATUSES
