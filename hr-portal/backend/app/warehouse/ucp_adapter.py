# -*- coding: utf-8 -*-
"""数据仓库 ↔ UCP 协同适配层

职责：
- 安全检测 UCP 模块是否可用
- 提供 UCP 摘要信息（仅展示/跳转所需字段）
- UCP 不可用时返回降级数据，不影响 DataSource 主路径

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
                # 有 __init__.py 的普通包
                _ucp_available = True
            else:
                # 命名空间包 — 检查是否有至少一个可用的子模块
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
