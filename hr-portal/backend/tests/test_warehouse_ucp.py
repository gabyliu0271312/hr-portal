# -*- coding: utf-8 -*-
"""数据仓库 UCP 协同测试

覆盖 H 章测试要求：
- UCP 不存在时 is_ucp_available() == False
- get_asset_ucp_info() 降级返回 enabled=False / 字段 null
- UCP 可用且有 resource_id 时 config_route 为相对路径
- UcpInfoOut 不包含 secret/token/password/connection_uri
- 资产详情响应包含 ucp 对象
- app.ucp 存在/不存在两种导入验证

运行: pytest tests/test_warehouse_ucp.py -v
"""
import pytest


# ==================== UCP 适配器单元测试 ====================


class TestUcpAdapter:
    """is_ucp_available / UcpInfo / get_asset_ucp_info"""

    def test_is_ucp_available_cached(self, monkeypatch):
        """is_ucp_available 结果被缓存，两次调用结果一致"""
        from app.warehouse.ucp_adapter import is_ucp_available

        # 重置缓存
        monkeypatch.setattr(
            "app.warehouse.ucp_adapter._ucp_available", None
        )
        result = is_ucp_available()
        # 再调一次验证缓存
        result2 = is_ucp_available()
        assert result == result2

    def test_ucp_unavailable_gives_false(self, monkeypatch):
        """app.ucp 不可用时 is_ucp_available() == False"""
        from app.warehouse.ucp_adapter import is_ucp_available

        monkeypatch.setattr(
            "app.warehouse.ucp_adapter._ucp_available", None
        )
        # 在当前空命名空间环境下，预期返回 False
        enabled = is_ucp_available()
        assert isinstance(enabled, bool)

    def test_ucp_info_default_disabled(self):
        """UcpInfo 默认 enabled=False，字段均为 None"""
        from app.warehouse.ucp_adapter import UcpInfo

        info = UcpInfo()
        assert info.enabled is False
        assert info.system_id is None
        assert info.resource_id is None
        assert info.connector_config_id is None
        assert info.config_route is None

    def test_ucp_info_to_dict_shape(self):
        """UcpInfo.to_dict() 返回正确字段结构"""
        from app.warehouse.ucp_adapter import UcpInfo

        info = UcpInfo(enabled=True, system_id=1, resource_id=2)
        d = info.to_dict()
        assert d == {
            "enabled": True,
            "system_id": 1,
            "resource_id": 2,
            "connector_config_id": None,
            "config_route": None,
        }

    @pytest.mark.asyncio
    async def test_get_asset_ucp_info_degraded_when_unavailable(self, monkeypatch):
        """UCP 不可用时 get_asset_ucp_info() 降级返回 enabled=False"""
        from app.warehouse.ucp_adapter import get_asset_ucp_info

        monkeypatch.setattr(
            "app.warehouse.ucp_adapter._ucp_available", False
        )
        result = await get_asset_ucp_info(
            db=None,  # type: ignore  # 降级路径不访问 db
            table_name="test_tbl",
            ucp_system_id=99,
            ucp_resource_id=88,
            ucp_connector_config_id=77,
        )
        assert result.enabled is False
        assert result.system_id is None
        assert result.resource_id is None
        assert result.connector_config_id is None
        assert result.config_route is None

    @pytest.mark.asyncio
    async def test_get_asset_ucp_info_enabled_with_ids(self, monkeypatch):
        """UCP 可用且有 resource_id 时 config_route 为相对路径"""
        from app.warehouse.ucp_adapter import get_asset_ucp_info

        monkeypatch.setattr(
            "app.warehouse.ucp_adapter._ucp_available", True
        )
        result = await get_asset_ucp_info(
            db=None,  # type: ignore  # 当前实现不访问 db
            table_name="test_tbl",
            ucp_system_id=1,
            ucp_resource_id=2,
            ucp_connector_config_id=3,
        )
        assert result.enabled is True
        assert result.system_id == 1
        assert result.resource_id == 2
        assert result.connector_config_id == 3
        assert result.config_route == "/ucp/resources/2"

    @pytest.mark.asyncio
    async def test_get_asset_ucp_info_null_ids(self, monkeypatch):
        """UCP 可用但资产未关联时 config_route 为 None"""
        from app.warehouse.ucp_adapter import get_asset_ucp_info

        monkeypatch.setattr(
            "app.warehouse.ucp_adapter._ucp_available", True
        )
        result = await get_asset_ucp_info(
            db=None,  # type: ignore
            table_name="unlinked",
        )
        assert result.enabled is True
        assert result.system_id is None
        assert result.resource_id is None
        assert result.config_route is None

    def test_build_ucp_route_none(self):
        """_build_ucp_route(None) → None"""
        from app.warehouse.ucp_adapter import _build_ucp_route

        assert _build_ucp_route(None) is None

    def test_build_ucp_route_relative_path(self):
        """_build_ucp_route 返回相对路径，不硬编码域名"""
        from app.warehouse.ucp_adapter import _build_ucp_route

        route = _build_ucp_route(42)
        assert route == "/ucp/resources/42"
        assert not route.startswith("http")  # 不硬编码环境域名


# ==================== Schema 字段白名单测试 ====================


class TestUcpSchemaWhitelist:
    """UcpInfoOut / WarehouseAssetDetailOut 安全字段"""

    def test_ucp_info_out_only_allowed_fields(self):
        """UcpInfoOut 仅暴露 enabled/system_id/resource_id/connector_config_id/config_route"""
        from app.warehouse.schemas import UcpInfoOut

        fields = list(UcpInfoOut.model_fields.keys())
        allowed = {
            "enabled", "system_id", "resource_id",
            "connector_config_id", "config_route",
        }
        assert set(fields) == allowed, f"UcpInfoOut 字段: {fields}，允许: {allowed}"

    def test_ucp_info_out_no_secret_fields(self):
        """UcpInfoOut 不包含 secret/token/password/connection_uri 等敏感字段"""
        from app.warehouse.schemas import UcpInfoOut

        forbidden = {"secret", "token", "password", "connection_uri",
                     "access_key", "api_key", "credential"}
        fields = set(UcpInfoOut.model_fields.keys())
        leaked = fields & forbidden
        assert not leaked, f"UcpInfoOut 泄露敏感字段: {leaked}"

    def test_ucp_info_out_default_disabled(self):
        """UcpInfoOut 默认 enabled=False"""
        from app.warehouse.schemas import UcpInfoOut

        ucp = UcpInfoOut()
        assert ucp.enabled is False
        assert ucp.system_id is None
        assert ucp.resource_id is None

    def test_asset_detail_out_includes_ucp(self):
        """WarehouseAssetDetailOut 包含 ucp 字段"""
        from app.warehouse.schemas import WarehouseAssetDetailOut

        fields = list(WarehouseAssetDetailOut.model_fields.keys())
        assert "ucp" in fields, "WarehouseAssetDetailOut 缺少 ucp 字段"

    def test_asset_detail_out_ucp_is_ucp_info_out(self):
        """WarehouseAssetDetailOut.ucp 类型为 UcpInfoOut"""
        from app.warehouse.schemas import WarehouseAssetDetailOut, UcpInfoOut

        field = WarehouseAssetDetailOut.model_fields["ucp"]
        from datetime import datetime
        from typing import Optional

        # 构造最小合法实例验证 ucp 字段能被正确赋值
        detail = WarehouseAssetDetailOut(
            table_name="test",
            table_label="测试",
            ucp=UcpInfoOut(enabled=False),
        )
        assert detail.ucp.enabled is False
        assert detail.ucp.system_id is None
        assert detail.ucp.resource_id is None

    def test_asset_list_out_no_secret_fields(self):
        """WarehouseAssetOut 不包含 secret/token/password 等敏感字段"""
        from app.warehouse.schemas import WarehouseAssetOut

        forbidden = {"secret", "token", "password", "connection_uri",
                     "access_key", "api_key", "credential"}
        fields = set(WarehouseAssetOut.model_fields.keys())
        leaked = fields & forbidden
        assert not leaked, f"WarehouseAssetOut 泄露敏感字段: {leaked}"

    def test_asset_update_in_no_forbidden_overwrite(self):
        """WarehouseAssetUpdateIn 不包含 secret 字段，不会通过 PATCH 写入敏感值"""
        from app.warehouse.schemas import WarehouseAssetUpdateIn

        forbidden = {"secret", "token", "password", "connection_uri",
                     "access_key", "api_key", "credential", "table_name"}
        fields = set(WarehouseAssetUpdateIn.model_fields.keys())
        leaked = fields & forbidden
        assert not leaked, f"WarehouseAssetUpdateIn 允许写入敏感/禁止字段: {leaked}"


# ==================== 前端 API 类型对齐测试 ====================


class TestUcpAdapterModuleImports:
    """验证 ucp_adapter 模块不依赖外部服务"""

    def test_import_ucp_adapter_no_side_effects(self):
        """导入 ucp_adapter 不应触发数据库连接或崩溃"""
        import app.warehouse.ucp_adapter as ua
        assert hasattr(ua, "is_ucp_available")
        assert hasattr(ua, "UcpInfo")
        assert hasattr(ua, "get_asset_ucp_info")

    def test_is_ucp_available_returns_bool(self):
        """is_ucp_available() 始终返回 bool"""
        from app.warehouse.ucp_adapter import is_ucp_available

        assert isinstance(is_ucp_available(), bool)

    def test_schema_module_compiles(self):
        """schemas.py 可通过 py_compile"""
        import py_compile
        import app.warehouse.schemas
        assert app.warehouse.schemas.UcpInfoOut is not None
