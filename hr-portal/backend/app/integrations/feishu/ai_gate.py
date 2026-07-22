"""Fail-closed feature gates for the Feishu AI channel."""
from __future__ import annotations

from fastapi import HTTPException, status

from app.ai.employee_profile_gate import EMPLOYEE_PROFILE_CAPABILITY_ID
from app.core.config import settings


def _allowed_user_ids(raw_value: str) -> set[int] | None:
    values = [value.strip() for value in raw_value.split(",") if value.strip()]
    if not values:
        return None
    try:
        return {int(value) for value in values}
    except ValueError:
        return None


def enforce_feishu_bot_enabled() -> None:
    if not settings.FEISHU_BOT_ENABLED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="飞书机器人暂未开放")


def enforce_feishu_capability_gate(capability_id: str, user_id: int) -> None:
    """Apply channel controls after intent routing but before a business handler."""
    enforce_feishu_bot_enabled()
    if capability_id != EMPLOYEE_PROFILE_CAPABILITY_ID:
        return
    allowed_user_ids = _allowed_user_ids(settings.FEISHU_EMPLOYEE_PROFILE_ALLOWED_USER_IDS)
    if not settings.FEISHU_EMPLOYEE_PROFILE_ENABLED or allowed_user_ids is None or user_id not in allowed_user_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="员工档案查询暂未开放")
