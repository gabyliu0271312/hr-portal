"""APScheduler 引擎封装

职责：
1. 启动 / 停止 AsyncIOScheduler（在 FastAPI lifespan 调用）
2. 维护 jobs 表 → APScheduler 的同步（启动时加载所有 enabled jobs + 业务变更时 reload）
3. run_job_now：手动 + cron 共用入口，统一管理事务、历史落库、异常处理、回写 scheduled_jobs.last_*

cron 触发时也走 run_job_now，handler 不区分触发源。
"""
from __future__ import annotations

import logging
from copy import deepcopy
from datetime import datetime, UTC

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.scheduler.handlers import get_handler
from app.scheduler.models import JobRun, ScheduledJob
from app.scheduler.schedule_parser import ScheduleParseError, parse_schedule


logger = logging.getLogger("scheduler.engine")


class SchedulerEngine:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]):
        self._scheduler: AsyncIOScheduler | None = None
        self._session_factory = session_factory

    # ===== 生命周期 =====

    async def start(self) -> None:
        if self._scheduler is not None:
            return
        self._scheduler = AsyncIOScheduler(timezone="Asia/Shanghai")
        self._scheduler.start()
        await self.reload_all_jobs()
        logger.info("[scheduler] started")

    async def shutdown(self) -> None:
        if self._scheduler is None:
            return
        self._scheduler.shutdown(wait=False)
        self._scheduler = None
        logger.info("[scheduler] shutdown")

    # ===== Job 注册 =====

    def _job_key(self, job_id: int) -> str:
        return f"job-{job_id}"

    async def reload_all_jobs(self) -> int:
        """从 DB 重新加载所有 enabled jobs 到 APScheduler。

        - 已存在的 job 会被 remove 后重新 add，cron 变更生效
        - disabled / 解析失败的 job 不注册（但保留 DB 行）
        - 返回成功注册的 job 数量
        """
        if self._scheduler is None:
            return 0

        async with self._session_factory() as db:
            jobs = (await db.execute(select(ScheduledJob))).scalars().all()

        # 先清空所有任务
        for j in self._scheduler.get_jobs():
            j.remove()

        registered = 0
        for job in jobs:
            if await self._register_one(job):
                registered += 1
        logger.info("[scheduler] reloaded %d jobs", registered)
        return registered

    async def reload_job(self, job_id: int) -> bool:
        """单 job 热加载（业务 CRUD 后调用）。"""
        if self._scheduler is None:
            return False
        async with self._session_factory() as db:
            job = await db.get(ScheduledJob, job_id)
        if job is None:
            return False
        # 清掉旧的
        existing = self._scheduler.get_job(self._job_key(job_id))
        if existing:
            existing.remove()
        return await self._register_one(job)

    async def _register_one(self, job: ScheduledJob) -> bool:
        if not job.enabled:
            return False
        try:
            trigger = parse_schedule(job.cron)
        except ScheduleParseError as e:
            logger.warning("[scheduler] job %d cron 解析失败: %s", job.id, e)
            return False
        if trigger is None:
            # 手动触发，不注册到 cron
            return False

        self._scheduler.add_job(
            self._cron_trigger_callback,
            trigger=trigger,
            id=self._job_key(job.id),
            args=[job.id],
            replace_existing=True,
            misfire_grace_time=600,
            coalesce=True,
        )
        logger.info("[scheduler] job %d (%s) registered: %s", job.id, job.kind, job.cron)
        return True

    async def _cron_trigger_callback(self, job_id: int) -> None:
        """APScheduler 的回调入口；走通用 run_job_now"""
        try:
            await self.run_job_now(job_id, triggered_by="cron")
        except Exception:
            # run_job_now 内部已记录到 job_runs；这里防止异常冒泡到 APScheduler 杀线程
            logger.exception("[scheduler] cron run failed for job %d", job_id)

    # ===== 统一执行入口（手动 + cron 共用）=====

    async def run_job_now(self, job_id: int, triggered_by: str) -> JobRun:
        """同步执行一次 job：
        - 拿到 job 定义
        - 创建 job_runs 行（status=running）
        - 调 handler；成功记 success/rows/message，失败记 failed/message
        - 回写 scheduled_jobs.last_run_at / last_status / last_message
        - 返回最终的 JobRun（已持久化）
        """
        async with self._session_factory() as db:
            job = await db.get(ScheduledJob, job_id)
            if job is None:
                raise RuntimeError(f"ScheduledJob {job_id} 不存在")

            run = JobRun(
                job_id=job.id,
                kind=job.kind,
                business_id=job.business_id,
                status="running",
                triggered_by=triggered_by,
                payload_snapshot=deepcopy(job.payload) if job.payload else None,
            )
            db.add(run)
            await db.flush()

            try:
                handler = get_handler(job.kind)
                rows, message = await handler(job, db, triggered_by)
                run.finished_at = datetime.now(UTC)
                run.status = "success"
                run.rows = rows
                run.message = message
                job.last_run_at = run.finished_at
                job.last_status = "success"
                job.last_message = message
                await db.commit()
                logger.info(
                    "[scheduler] job %d (%s) success: %d rows",
                    job.id, job.kind, rows,
                )
            except Exception as e:
                await db.rollback()
                # 重新建一个 session 写失败历史（前一个事务已 rollback）
                async with self._session_factory() as db2:
                    job2 = await db2.get(ScheduledJob, job_id)
                    run2 = JobRun(
                        job_id=job_id,
                        kind=job2.kind if job2 else "unknown",
                        business_id=job2.business_id if job2 else None,
                        status="failed",
                        triggered_by=triggered_by,
                        finished_at=datetime.now(UTC),
                        message=str(e)[:1000],
                        payload_snapshot=deepcopy(job2.payload) if job2 and job2.payload else None,
                    )
                    db2.add(run2)
                    if job2:
                        job2.last_run_at = run2.finished_at
                        job2.last_status = "failed"
                        job2.last_message = str(e)[:1000]
                    await db2.commit()
                    logger.exception("[scheduler] job %d (%s) failed", job_id, run2.kind)
                    return run2

            await db.refresh(run)
            return run


# ===== 单例 =====

_engine: SchedulerEngine | None = None


def get_engine() -> SchedulerEngine:
    if _engine is None:
        raise RuntimeError("SchedulerEngine 未初始化（应在 FastAPI lifespan 中调用 init_engine）")
    return _engine


def init_engine(session_factory: async_sessionmaker[AsyncSession]) -> SchedulerEngine:
    global _engine
    if _engine is None:
        _engine = SchedulerEngine(session_factory)
    return _engine
