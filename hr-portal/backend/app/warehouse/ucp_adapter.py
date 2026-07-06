# -*- coding: utf-8 -*-
"""数据仓库 ↔ UCP 协同适配层

职责：
- 安全检测 UCP 模块是否可用
- 提供 UCP 摘要信息（仅展示/跳转所需字段）
- UCP 不可用时返回降级数据，不影响 DataSource 主路径
- Q04 薄代理：只读查询、资源摘要、状态、预览，不复制 UCP 能力

禁止：
- 返回 UCP/DataSource secret、token、password、connection_uri 明文
- 在 warehouse 内实现凭证编辑、Pipeline 编排、连接测试
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------
# UCP 可用性检测
# ---------------------------------------------------------------

_ucp_available: bool | None = None


def is_ucp_available() -> bool:
    """检测当前分支的 app.ucp 模块是否有实际功能代码。

    仅当 app.ucp 有 __init__.py 或有可用的子模块（如 router）时返回 True。
    空的命名空间包不算可用。
    结果缓存一次，避免重复 import 开销。
    """
    global _ucp_available
    if _ucp_available is None:
        try:
            from importlib import util as _importlib_util

            spec = _importlib_util.find_spec("app.ucp")
            if spec is None:
                _ucp_available = False
            elif spec.origin is not None:
                _ucp_available = True
            else:
                _ucp_available = _importlib_util.find_spec("app.ucp.router") is not None
        except Exception:
            _ucp_available = False

        if not _ucp_available:
            logger.info("UCP 模块不可用，warehouse UCP 信息将降级展示")
    return _ucp_available


# ---------------------------------------------------------------
# UCP 摘要模型（仅展示/跳转字段）
# ---------------------------------------------------------------

class UcpInfo:
    """UCP 协同摘要。

    只包含展示和跳转所需字段，禁止包含任何 secret。
    """

    def __init__(
        self,
        enabled: bool = False,
        system_id: int | None = None,
        resource_id: int | None = None,
        connector_config_id: int | None = None,
        config_route: str | None = None,
    ):
        self.enabled = enabled
        self.system_id = system_id
        self.resource_id = resource_id
        self.connector_config_id = connector_config_id
        self.config_route = config_route

    def to_dict(self) -> dict:
        return {
            "enabled": self.enabled,
            "system_id": self.system_id,
            "resource_id": self.resource_id,
            "connector_config_id": self.connector_config_id,
            "config_route": self.config_route,
        }


# ---------------------------------------------------------------
# Q0401: UCP Systems 查询
# ---------------------------------------------------------------

async def list_systems() -> list[dict]:
    """获取 UCP 系统列表（只读摘要）。

    is_ucp_available() 为 False 时返回空列表。
    为 True 时预留真实查询位置（TODO: 对接 UCP API）。
    只返回 id/name/status 快照，不返回 secret。
    """
    if not is_ucp_available():
        return []

    # TODO: 当 app.ucp 模块合并后，通过 UCP API 查询：
    #   from app.ucp.models import ConnectorSystem
    #   return [{"id": s.id, "name": s.name, "status": s.status} for s in systems]
    return []


# ---------------------------------------------------------------
# Q0403: UCP Resources 查询
# ---------------------------------------------------------------

async def list_resources(system_id: int | None = None) -> list[dict]:
    """获取 UCP 资源列表（只读摘要）。

    system_id 为 None 时返回全部，否则按系统过滤。
    is_ucp_available() 为 False 时返回空列表。
    只返回资源摘要、测试状态、执行状态、跳转 URL，不返回凭证配置。
    """
    if not is_ucp_available():
        return []

    # TODO: 当 app.ucp 模块合并后，通过 UCP API 查询：
    #   from app.ucp.models import ConnectorResource
    #   q = select(ConnectorResource)
    #   if system_id is not None:
    #       q = q.where(ConnectorResource.system_id == system_id)
    #   return [{
    #       "id": r.id, "system_id": r.system_id, "name": r.name,
    #       "resource_type": r.resource_type, "status": r.status,
    #       "last_test_at": ..., "last_run_at": ..., "config_route": ...,
    #   } for r in rows]
    return []


# ---------------------------------------------------------------
# Q0405: UCP Resource Status
# ---------------------------------------------------------------

async def get_resource_status(resource_id: int) -> dict | None:
    """获取 UCP 资源状态摘要。

    UCP 不可用时返回降级对象。
    不暴露凭证明文。
    """
    if not is_ucp_available():
        return {
            "resource_id": resource_id,
            "status": "unknown",
            "message": "UCP 不可用",
            "enabled": False,
        }

    # TODO: 对接 UCP API 查询资源状态
    return {
        "resource_id": resource_id,
        "status": "unknown",
        "message": "UCP 已启用，资源状态待对接",
        "enabled": True,
    }


# ---------------------------------------------------------------
# Q0406: UCP Resource Preview
# ---------------------------------------------------------------

async def preview_resource(
    resource_id: int,
    limit: int = 20,
    masker=None,
) -> dict | None:
    """获取 UCP 资源预览数据。

    预览结果必须脱敏敏感字段并限制返回行数。
    limit 默认 20，最大 100。
    masker: 可选脱敏函数/对象，用于敏感字段脱敏。
    """
    if not is_ucp_available():
        return {
            "resource_id": resource_id,
            "columns": [],
            "rows": [],
            "total": 0,
            "truncated": False,
            "message": "UCP 不可用，无法预览",
        }

    # TODO: 对接 UCP API 获取预览数据
    #   rows = await ucp_api.preview(resource_id, limit)
    #   rows = apply_masker(rows, masker)
    return {
        "resource_id": resource_id,
        "columns": [],
        "rows": [],
        "total": 0,
        "truncated": False,
        "message": "UCP 已启用，预览数据待对接",
    }


# ---------------------------------------------------------------
# 资产 UCP 信息查询
# ---------------------------------------------------------------

async def get_asset_ucp_info(
    db: AsyncSession,
    table_name: str,
    ucp_system_id: int | None = None,
    ucp_resource_id: int | None = None,
    ucp_connector_config_id: int | None = None,
) -> UcpInfo:
    """获取资产的 UCP 协同摘要。

    当前分支无 app.ucp 模块时返回 enabled=False 的降级对象。
    未来 UCP 合并后，在此处通过 UCP API/表查询系统和资源的展示摘要。
    """
    if not is_ucp_available():
        return UcpInfo(enabled=False)

    # TODO: 当 app.ucp 模块合并后，在这里通过 UCP API 查询：
    #   - 系统名称、资源名称
    #   - 最近测试/同步状态
    #   - 跳转路由
    # 当前仅返回桥接 ID，前端展示"已关联但信息不可用"
    return UcpInfo(
        enabled=True,
        system_id=ucp_system_id,
        resource_id=ucp_resource_id,
        connector_config_id=ucp_connector_config_id,
        config_route=_build_ucp_route(ucp_resource_id),
    )


def _build_ucp_route(resource_id: int | None) -> str | None:
    """构建 UCP 资源跳转路由。

    不硬编码环境域名，使用相对路径。
    """
    if resource_id is None:
        return None
    return f"/ucp/resources/{resource_id}"
