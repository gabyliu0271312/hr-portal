"""调度运行历史路由

- GET /api/v1/job-runs            通用历史，支持按 kind / business_id / status / 时间范围过滤
- GET /api/v1/scheduled-jobs      任务定义列表（管理员排查用）
- POST /api/v1/scheduled-jobs     创建任务定义
- PATCH /api/v1/scheduled-jobs/{id}  更新任务定义
- DELETE /api/v1/scheduled-jobs/{id}  删除任务定义
- POST /api/v1/scheduled-jobs/{id}/run-now  手动立即跑一次
- POST /api/v1/job-runs/{run_id}/retry  重跑失败任务
"""
from datetime import datetime, UTC
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
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


class ScheduledJobCreateIn(BaseModel):
    kind: str = Field(..., max_length=32)
    business_id: int
    cron: str = Field(default="手动触发", max_length=64)
    payload: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class ScheduledJobUpdateIn(BaseModel):
    cron: str | None = None
    payload: dict[str, Any] | None = None
    enabled: bool | None = None


class RetryIn(BaseModel):
    reason: str = Field(default="", max_length=500)


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


@router.post("/scheduled-jobs", response_model=ScheduledJobOut, status_code=201)
async def create_scheduled_job(
    body: ScheduledJobCreateIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> ScheduledJobOut:
    from app.scheduler.service import upsert_job
    job = await upsert_job(db, body.kind, body.business_id, body.cron, body.payload, body.enabled)
    await db.commit()
    engine = get_engine()
    await engine.reload_job(job.id)
    return ScheduledJobOut(
        id=job.id, kind=job.kind, business_id=job.business_id,
        cron=job.cron, payload=job.payload or {}, enabled=job.enabled,
        last_run_at=job.last_run_at, last_status=job.last_status, last_message=job.last_message,
    )


@router.patch("/scheduled-jobs/{job_id}", response_model=ScheduledJobOut)
async def update_scheduled_job(
    job_id: int,
    body: ScheduledJobUpdateIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> ScheduledJobOut:
    job = await db.get(ScheduledJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="定时任务不存在")
    if body.cron is not None:
        job.cron = body.cron
    if body.payload is not None:
        job.payload = body.payload
    if body.enabled is not None:
        job.enabled = body.enabled
    await db.commit()
    await db.refresh(job)
    engine = get_engine()
    await engine.reload_job(job.id)
    return ScheduledJobOut(
        id=job.id, kind=job.kind, business_id=job.business_id,
        cron=job.cron, payload=job.payload or {}, enabled=job.enabled,
        last_run_at=job.last_run_at, last_status=job.last_status, last_message=job.last_message,
    )


@router.delete("/scheduled-jobs/{job_id}")
async def delete_scheduled_job(
    job_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    job = await db.get(ScheduledJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="定时任务不存在")
    await db.delete(job)
    await db.commit()
    engine = get_engine()
    await engine.reload_job(job.id)
    return {"ok": "deleted"}


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


@router.post("/job-runs/{run_id}/retry")
async def retry_job_run(
    run_id: int,
    body: RetryIn = RetryIn(),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """重跑失败任务。基于原 run 的 job_id 重新执行。"""
    run = await db.get(JobRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="运行记录不存在")
    if run.job_id is None:
        raise HTTPException(status_code=400, detail="该运行记录未关联定时任务，无法重跑")

    # 写审计日志
    from app.system.models import SystemLog
    audit = SystemLog(
        category="scheduler.retry",
        action="retry_run",
        status="success",
        user_id=user.id,
        request_summary=f"retry run {run_id} (kind={run.kind}, job_id={run.job_id})",
        response_summary=f"reason: {body.reason}",
        metadata_json={
            "run_id": run_id,
            "job_id": run.job_id,
            "kind": run.kind,
            "business_id": run.business_id,
            "reason": body.reason,
            "operator": user.login_name,
        },
    )
    db.add(audit)
    await db.commit()

    engine = get_engine()
    new_run = await engine.run_job_now(run.job_id, triggered_by=f"retry:{user.login_name}")
    return {
        "ok": new_run.status == "success",
        "run_id": new_run.id,
        "status": new_run.status,
        "rows": new_run.rows,
        "message": new_run.message,
    }
