"""UCP 现有视图配置适配器 (Phase 1C)

将现有 datasources 表中的视图配置（北森拉取/通用 HTTP/数据库/上传）封装为
UCP 标准适配器接口，让 UCP Pipeline 可作为步骤调用/复用原有视图配置。

设计目标：
  - 复用现有 sync_service.sync_to_table 的拉取/落库链路，不重写
  - UCP 步骤可指定 adapter_code = DATASOURCE_BRIDGE_ADAPTER，并通过 params.target_table 选 datasource
  - 保持 datasources 表的独立运行（手动触发/定时调度不受影响）
  - 不破坏 push_targets / 飞书推送 / 原定时 handler

适配器协议：
  - async execute(params, secrets, db) -> AdapterResult
  - params.target_table: 目标表名（datasources.table_name）
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.types import AdapterResult

logger = logging.getLogger("ucp.adapters.datasource_bridge")


# ===== 桥接适配器 =====

async def datasource_bridge_adapter(
    params: dict,
    secrets: dict,
    db: AsyncSession,
) -> AdapterResult:
    """将现有 datasources 配置作为 UCP 适配器调用。

    params 应包含：
      - target_table: 目标表名（即 datasources.table_name）
      - period_ym: 可选，月度表指定月份（YYYYMM），空则按配置计算
    secrets（可选，由调用方决定是否透传）：
      - 完整凭证明文，UCP 调用时通常为空（datasource 自带 secrets）
    """
    target_table = (params or {}).get("target_table", "").strip()
    if not target_table:
        return AdapterResult(
            status="failed",
            error_code="MISSING_PARAM",
            error_message="datasource_bridge_adapter 需要参数 'target_table'（datasources.table_name）",
        )

    # 读取 datasources 行
    from app.datasources.models import DataSource
    from app.core.secret_box import decrypt

    ds = (
        await db.execute(
            select(DataSource).where(DataSource.table_name == target_table)
        )
    ).scalars().first()

    if ds is None:
        return AdapterResult(
            status="failed",
            error_code="DATASOURCE_NOT_FOUND",
            error_message=f"视图配置 '{target_table}' 不存在或已被删除",
        )

    if not ds.is_active:
        return AdapterResult(
            status="failed",
            error_code="DATASOURCE_DISABLED",
            error_message=f"视图配置 '{target_table}' 已停用，请先在「数据接入」中启用",
        )

    # 复用现有 sync_to_table：拉数据 + 落库
    from app.datasources.sync_service import sync_to_table

    ds_secrets = {k: decrypt(v) for k, v in (ds.secrets_encrypted or {}).items()}

    try:
        rows, message = await sync_to_table(
            ds.table_name,
            ds.source_type,
            ds.settings or {},
            ds_secrets,
            db,
        )
    except Exception as e:
        logger.exception(
            "[ucp] datasource_bridge failed: table=%s type=%s", ds.table_name, ds.source_type
        )
        return AdapterResult(
            status="failed",
            error_code="SYNC_FAILED",
            error_message=str(e)[:500],
            extra={"table_name": ds.table_name, "source_type": ds.source_type},
        )

    return AdapterResult(
        status="success",
        row_count=rows,
        success_count=rows,
        extra={
            "table_name": ds.table_name,
            "source_type": ds.source_type,
            "sync_message": message,
            "datasource_id": ds.id,
        },
    )


# ===== 列表查询辅助（用于前端选择 target_table）=====

async def list_bridge_targets(db: AsyncSession) -> list[dict[str, Any]]:
    """列出可作为 UCP 步骤 target_table 的视图配置（仅 is_active=True）。"""
    from app.datasources.models import DataSource

    rows = (
        await db.execute(
            select(DataSource)
            .where(DataSource.is_active == True)  # noqa: E712
            .order_by(DataSource.id)
        )
    ).scalars().all()

    return [
        {
            "id": ds.id,
            "table_name": ds.table_name,
            "table_label": ds.table_label,
            "source_type": ds.source_type,
            "schedule": ds.schedule,
            "is_active": ds.is_active,
            "last_sync_at": ds.last_sync_at.isoformat() if ds.last_sync_at else None,
            "last_status": ds.last_status,
            "last_rows": ds.last_rows,
        }
        for ds in rows
    ]


# ===== 适配器注册 =====

ADAPTER_REGISTRY_BRIDGE: dict[str, callable] = {
    "DATASOURCE_BRIDGE_ADAPTER": datasource_bridge_adapter,
}
