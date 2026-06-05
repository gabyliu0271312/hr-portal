"""调度任务 CRUD 服务

供业务模块调用，业务保存时调 upsert_job 即可，无需自己管 cron / 历史。
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.scheduler.models import ScheduledJob


async def upsert_job(
    db: AsyncSession,
    kind: str,
    business_id: int,
    cron: str,
    payload: dict | None = None,
    enabled: bool = True,
) -> ScheduledJob:
    """按 (kind, business_id) 幂等创建或更新任务定义。

    业务侧典型调用：在 DataSource / ReportSubscription 等 CRUD 保存后调一次。
    返回的 job 不会自动注册到 APScheduler，由调用方再调 engine.reload_job(job.id) 触发热加载。
    """
    job = (
        await db.execute(
            select(ScheduledJob).where(
                ScheduledJob.kind == kind,
                ScheduledJob.business_id == business_id,
            )
        )
    ).scalar_one_or_none()

    if job is None:
        job = ScheduledJob(
            kind=kind,
            business_id=business_id,
            cron=cron,
            payload=payload or {},
            enabled=enabled,
        )
        db.add(job)
    else:
        job.cron = cron
        if payload is not None:
            job.payload = payload
        job.enabled = enabled

    await db.flush()
    return job


async def disable_job(db: AsyncSession, job_id: int) -> ScheduledJob | None:
    job = await db.get(ScheduledJob, job_id)
    if job is None:
        return None
    job.enabled = False
    await db.flush()
    return job


async def enable_job(db: AsyncSession, job_id: int) -> ScheduledJob | None:
    job = await db.get(ScheduledJob, job_id)
    if job is None:
        return None
    job.enabled = True
    await db.flush()
    return job


async def get_job_by_business(
    db: AsyncSession, kind: str, business_id: int
) -> ScheduledJob | None:
    return (
        await db.execute(
            select(ScheduledJob).where(
                ScheduledJob.kind == kind,
                ScheduledJob.business_id == business_id,
            )
        )
    ).scalar_one_or_none()
