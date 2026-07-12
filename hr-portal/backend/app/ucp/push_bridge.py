"""UCP Push 复用适配器 (Phase 1C)

将现有 push_service.execute_push 封装为 UCP 标准适配器接口，
让 UCP Pipeline 可作为步骤调用 push_target（飞书报表推送/外部数据库/HTTP推送）。

设计目标：
  - 复用现有 execute_push 链路，不重写推送/落库/通知逻辑
  - UCP 步骤可指定 adapter_code = PUSH_TARGET_BRIDGE_ADAPTER，并通过 params.push_target_id 选 push_target
  - 保持 push_targets 表的独立运行（手动触发/定时调度不受影响）
  - 不破坏原飞书推送按表头推送兼容

适配器协议：
  - async execute(params, secrets, db) -> AdapterResult
  - params 应包含：
      - push_target_id: 推送目标 ID（push_targets.id）
      - period_ym: 可选，月度表指定月份（YYYYMM）
"""
from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.types import AdapterResult

logger = logging.getLogger("ucp.adapters.push_bridge")


async def push_target_bridge_adapter(
    params: dict,
    secrets: dict,
    db: AsyncSession,
) -> AdapterResult:
    """将现有 push_target 作为 UCP 适配器调用。

    params 应包含：
      - push_target_id: 推送目标 ID（必填）
      - period_ym: 月度表指定月份（YYYYMM，可选）
    """
    push_target_id_raw = (params or {}).get("push_target_id")
    if push_target_id_raw is None:
        return AdapterResult(
            status="failed",
            error_code="MISSING_PARAM",
            error_message="push_target_bridge_adapter 需要参数 'push_target_id'（push_targets.id）",
        )

    try:
        push_target_id = int(push_target_id_raw)
    except (TypeError, ValueError):
        return AdapterResult(
            status="failed",
            error_code="INVALID_PARAM",
            error_message=f"push_target_id 必须是整数，得到 {push_target_id_raw!r}",
        )

    # 检查 push_target 存在性和状态
    from app.push.models import PushTarget
    from sqlalchemy import select

    pt = await db.get(PushTarget, push_target_id)
    if pt is None:
        return AdapterResult(
            status="failed",
            error_code="PUSH_TARGET_NOT_FOUND",
            error_message=f"推送目标 #{push_target_id} 不存在或已被删除",
        )

    if not pt.is_active:
        return AdapterResult(
            status="failed",
            error_code="PUSH_TARGET_DISABLED",
            error_message=f"推送目标 '{pt.name}' 已停用，请先在「推送目标」中启用",
        )

    # 复用现有 execute_push：拉数据 + 推送 + 落库到 push_runs
    from app.push.push_service import execute_push

    period_ym = (params or {}).get("period_ym", "") or ""

    try:
        rows, message = await execute_push(push_target_id, db, period_ym=period_ym)
    except Exception as e:
        logger.exception(
            "[ucp] push_target_bridge failed: target_id=%d type=%s", push_target_id, pt.push_type
        )
        return AdapterResult(
            status="failed",
            error_code="PUSH_FAILED",
            error_message=str(e)[:500],
            extra={
                "push_target_id": push_target_id,
                "push_type": pt.push_type,
                "source_table": pt.source_table,
            },
        )

    return AdapterResult(
        status="success",
        row_count=rows,
        success_count=rows,
        extra={
            "push_target_id": push_target_id,
            "push_type": pt.push_type,
            "source_table": pt.source_table,
            "name": pt.name,
            "push_message": message,
        },
    )


async def list_bridge_push_targets(db: AsyncSession) -> list[dict]:
    """列出可作为 UCP 步骤的 push_target（仅 is_active=True）。"""
    from app.push.models import PushTarget
    from sqlalchemy import select

    rows = (
        await db.execute(
            select(PushTarget)
            .where(PushTarget.is_active == True)  # noqa: E712
            .order_by(PushTarget.id)
        )
    ).scalars().all()

    return [
        {
            "id": pt.id,
            "name": pt.name,
            "source_table": pt.source_table,
            "push_type": pt.push_type,
            "last_push_at": pt.last_push_at.isoformat() if pt.last_push_at else None,
            "last_status": pt.last_status,
            "last_rows": pt.last_rows,
        }
        for pt in rows
    ]


# ===== 适配器注册 =====

ADAPTER_REGISTRY_PUSH_BRIDGE: dict[str, callable] = {
    "PUSH_TARGET_BRIDGE_ADAPTER": push_target_bridge_adapter,
}
