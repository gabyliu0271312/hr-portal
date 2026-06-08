from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.system.models import SystemLog
from app.users.models import User


router = APIRouter(prefix="/system-logs", tags=["system-logs"])


class SystemLogOut(BaseModel):
    id: int
    category: str
    action: str
    status: str
    user_id: int | None
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


@router.get(
    "",
    response_model=list[SystemLogOut],
    dependencies=[Depends(require_op("system.logs.ai", "V"))],
)
async def list_system_logs(
    category: str | None = None,
    status: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[SystemLogOut]:
    stmt = select(SystemLog).order_by(desc(SystemLog.created_at), desc(SystemLog.id)).limit(limit)
    if category:
        stmt = stmt.where(SystemLog.category == category)
    if status:
        stmt = stmt.where(SystemLog.status == status)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        SystemLogOut(
            id=row.id,
            category=row.category,
            action=row.action,
            status=row.status,
            user_id=row.user_id,
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
        for row in rows
    ]
