"""Action 注册表

每个 Action 是一个 async callable，接受 action_config 和 event_payload，
执行具体动作并返回结果。

第一期注册：
  feishu_send_message — 发送飞书消息
"""
from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession


logger = logging.getLogger("automation.action_registry")


ActionFn = Callable[
    [dict[str, Any], dict[str, Any], AsyncSession, int | None],
    Awaitable[dict[str, Any]],
]
"""
Action 函数签名：
  action_config  — 动作配置（来自 automation_rules.actions_config[i].config）
  event_payload  — 触发事件的 payload（来自 AutomationEvent.payload）
  db             — AsyncSession
  execution_id   — 关联的 AutomationExecution.id（用于写 feishu_notification_logs）

返回：output_snapshot dict
"""


# ===== feishu_send_message Action =====

async def _action_feishu_send_message(
    action_config: dict[str, Any],
    event_payload: dict[str, Any],
    db: AsyncSession,
    execution_id: int | None = None,
) -> dict[str, Any]:
    """发送飞书消息动作。

    action_config 结构（对应 NotificationConfig）：
      {
        "enabled": true,
        "receivers": [...],
        "message": {...}
      }

    event_payload 中的字段可作为消息模板的 context。
    """
    from app.integrations.feishu.notification_service import send_notification
    from app.integrations.feishu.schemas import NotificationConfig

    try:
        config = NotificationConfig.model_validate(action_config)
    except Exception as e:
        raise RuntimeError(f"feishu_send_message action_config 格式错误: {e}") from e

    # event_payload 直接作为通知上下文
    context = dict(event_payload)

    result = await send_notification(
        config=config,
        context=context,
        db=db,
        biz_type=event_payload.get("biz_type"),
        biz_id=event_payload.get("biz_id"),
        is_test=False,
        automation_execution_id=execution_id,
    )

    return {
        "status": result.status,
        "success_count": result.success_count,
        "failed_count": result.failed_count,
        "log_id": result.log_id,
        "errors": result.errors,
    }


# ===== 注册表 =====

ACTION_REGISTRY: dict[str, ActionFn] = {
    "feishu_send_message": _action_feishu_send_message,
}


def get_action(action_type: str) -> ActionFn:
    fn = ACTION_REGISTRY.get(action_type)
    if fn is None:
        raise RuntimeError(
            f"未注册的 action type: {action_type}（可选: {list(ACTION_REGISTRY.keys())}）"
        )
    return fn


def list_action_types() -> list[str]:
    return list(ACTION_REGISTRY.keys())
