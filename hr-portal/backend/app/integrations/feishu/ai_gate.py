"""Fail-closed feature gates for the Feishu AI channel."""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.capabilities import get_capability, user_can_use_capability
from app.ai.employee_profile_gate import EMPLOYEE_PROFILE_CAPABILITY_ID
from app.core.config import settings


def enforce_feishu_bot_enabled() -> None:
    if not settings.FEISHU_BOT_ENABLED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="飞书机器人暂未开放")


def enforce_feishu_capability_gate(capability_id: str) -> None:
    """Apply channel-wide feature switches before resolving a Portal user."""
    enforce_feishu_bot_enabled()
    if capability_id != EMPLOYEE_PROFILE_CAPABILITY_ID:
        return
    if not settings.FEISHU_EMPLOYEE_PROFILE_ENABLED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="员工档案查询暂未开放")


async def enforce_feishu_capability_authorization(
    capability_id: str, user, db: AsyncSession
) -> None:
    """Apply the same per-user capability decision used by the Web channel."""
    enforce_feishu_capability_gate(capability_id)
    if capability_id != EMPLOYEE_PROFILE_CAPABILITY_ID:
        return
    capability = get_capability(capability_id)
    if capability is None or not await user_can_use_capability(user, db, capability):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权使用员工档案查询")
