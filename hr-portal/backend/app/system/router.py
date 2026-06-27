from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, get_user_menus
from app.system.models import SystemLog
from app.users.models import User


router = APIRouter(prefix="/system-logs", tags=["system-logs"])

# 日志分类 → 查看该分类所需的菜单权限码
_CATEGORY_MENU = {
    "ai_call": "system.logs.ai",
    "automation_notification": "system.logs.operation",
    "compensation_calc": "system.logs.operation",
}


class SystemLogOut(BaseModel):
    id: int
    category: str
    action: str
    status: str
    user_id: int | None
    user_display_name: str | None
    request_summary: str | None
    response_summary: str | None
    input_hash: str | None
    output_hash: str | None
    metadata_json: dict[str, Any]
    error: str | None
    token_usage: dict[str, Any] | None
    trace_id: str | None
    latency_ms: int | None
    created_at: datetime


@router.get("", response_model=list[SystemLogOut])
async def list_system_logs(
    category: str = Query(..., description="日志分类，权限按分类校验"),
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[SystemLogOut]:
    menu_code = _CATEGORY_MENU.get(category)
    if menu_code is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="未知日志分类")
    menus = await get_user_menus(user, db)
    if not any(m["code"] == menu_code for m in menus):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权限查看该日志")

    stmt = (
        select(SystemLog, User.display_name)
        .outerjoin(User, User.id == SystemLog.user_id)
        .where(SystemLog.category == category)
        .order_by(desc(SystemLog.created_at), desc(SystemLog.id))
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(SystemLog.status == status_filter)
    rows = (await db.execute(stmt)).all()
    return [
        SystemLogOut(
            id=row.id,
            category=row.category,
            action=row.action,
            status=row.status,
            user_id=row.user_id,
            user_display_name=display_name,
            request_summary=row.request_summary,
            response_summary=row.response_summary,
            input_hash=row.input_hash,
            output_hash=row.output_hash,
            metadata_json=row.metadata_json or {},
            error=row.error,
            token_usage=row.token_usage,
            trace_id=row.trace_id,
            latency_ms=row.latency_ms,
            created_at=row.created_at,
        )
        for row, display_name in rows
    ]
