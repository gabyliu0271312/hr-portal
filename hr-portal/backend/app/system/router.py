from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import desc, func, or_, select
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
    "report_access": "system.logs.operation",
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


class SystemLogPage(BaseModel):
    items: list[SystemLogOut]
    total: int
    page: int
    page_size: int


@router.get("", response_model=list[SystemLogOut] | SystemLogPage)
async def list_system_logs(
    category: str = Query(..., description="日志分类，权限按分类校验"),
    status_filter: str | None = Query(None, alias="status"),
    action: str | None = Query(None, max_length=64),
    operator: str | None = Query(None, max_length=128),
    keyword: str | None = Query(None, max_length=128),
    start_at: datetime | None = Query(None),
    end_at: datetime | None = Query(None),
    paged: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    limit: int = Query(100, ge=1, le=500),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[SystemLogOut] | SystemLogPage:
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
    )
    if status_filter:
        stmt = stmt.where(SystemLog.status == status_filter)
    if action:
        stmt = stmt.where(SystemLog.action == action)
    if operator:
        pattern = f"%{operator.strip()}%"
        stmt = stmt.where(or_(User.display_name.ilike(pattern), User.login_name.ilike(pattern)))
    if keyword:
        pattern = f"%{keyword.strip()}%"
        stmt = stmt.where(
            or_(
                SystemLog.request_summary.ilike(pattern),
                SystemLog.response_summary.ilike(pattern),
            )
        )
    if start_at:
        stmt = stmt.where(SystemLog.created_at >= start_at)
    if end_at:
        stmt = stmt.where(SystemLog.created_at <= end_at)

    total = int(
        (await db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))) or 0
    )
    stmt = stmt.order_by(desc(SystemLog.created_at), desc(SystemLog.id))
    if paged:
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    else:
        stmt = stmt.limit(limit)
    rows = (await db.execute(stmt)).all()
    items = [
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
    if paged:
        return SystemLogPage(items=items, total=total, page=page, page_size=page_size)
    return items
