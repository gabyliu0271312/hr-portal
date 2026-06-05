"""调度运行历史路由

- GET /api/v1/job-runs            通用历史，支持按 kind / business_id / status / 时间范围过滤
- GET /api/v1/scheduled-jobs      任务定义列表（管理员排查用）
- POST /api/v1/scheduled-jobs/{id}/run-now  手动立即跑一次

注：业务侧"立即拉取"按钮也走 run_job_now，不需要走这个路由。本路由是给管理员"调度管理"用的。
"""
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user
from app.scheduler.engine import get_engine
from app.scheduler.models import JobRun, ScheduledJob
from app.users.models import User


router = APIRouter(tags=["scheduler"])


class JobRunOut(BaseModel):
    id: int
    job_id: int | None
    kind: str
    business_id: int | None
    started_at: datetime
    finished_at: datetime | None
    status: str
    rows: int | None
    message: str | None
    triggered_by: str


class ScheduledJobOut(BaseModel):
    id: int
    kind: str
    business_id: int
    cron: str
    payload: dict[str, Any]
    enabled: bool
    last_run_at: datetime | None
    last_status: str | None
    last_message: str | None


@router.get("/job-runs", response_model=list[JobRunOut])
async def list_job_runs(
    kind: str | None = None,
    business_id: int | None = None,
    status_: str | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=500),
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[JobRunOut]:
    stmt = select(JobRun).order_by(desc(JobRun.started_at)).limit(limit)
    if kind:
        stmt = stmt.where(JobRun.kind == kind)
    if business_id is not None:
        stmt = stmt.where(JobRun.business_id == business_id)
    if status_:
        stmt = stmt.where(JobRun.status == status_)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        JobRunOut(
            id=r.id,
            job_id=r.job_id,
            kind=r.kind,
            business_id=r.business_id,
            started_at=r.started_at,
            finished_at=r.finished_at,
            status=r.status,
            rows=r.rows,
            message=r.message,
            triggered_by=r.triggered_by,
        )
        for r in rows
    ]


@router.get("/scheduled-jobs", response_model=list[ScheduledJobOut])
async def list_scheduled_jobs(
    kind: str | None = None,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[ScheduledJobOut]:
    stmt = select(ScheduledJob).order_by(ScheduledJob.kind, ScheduledJob.business_id)
    if kind:
        stmt = stmt.where(ScheduledJob.kind == kind)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        ScheduledJobOut(
            id=r.id,
            kind=r.kind,
            business_id=r.business_id,
            cron=r.cron,
            payload=r.payload or {},
            enabled=r.enabled,
            last_run_at=r.last_run_at,
            last_status=r.last_status,
            last_message=r.last_message,
        )
        for r in rows
    ]


@router.post("/scheduled-jobs/{job_id}/run-now")
async def run_now(
    job_id: int,
    user: User = Depends(current_user),
) -> dict[str, Any]:
    engine = get_engine()
    run = await engine.run_job_now(job_id, triggered_by=user.login_name)
    return {
        "ok": run.status == "success",
        "run_id": run.id,
        "status": run.status,
        "rows": run.rows,
        "message": run.message,
    }
