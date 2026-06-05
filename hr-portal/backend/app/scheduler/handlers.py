"""所有 handler 的实现 + JOB_HANDLERS 注册表

加新场景时只需：
1. 写一个 async def _handler_<kind>(job, db, triggered_by) -> tuple[int, str]
2. 注册到 JOB_HANDLERS["<kind>"] = ...
3. 在业务 CRUD 调 scheduler.service.upsert_job(kind="<kind>", ...)
4. 不需要碰 engine / models / migration

Handler 协议（必守）：
- 返回 (rows, message) — rows 是处理行数，message 是成功摘要
- 异常会被 engine 捕获并自动写入 job_runs.status='failed'，handler 不必 try
- 不要在 handler 里写 db.commit() — engine 统一管理事务
"""
from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.scheduler.models import ScheduledJob


logger = logging.getLogger("scheduler.handlers")


HandlerFn = Callable[[ScheduledJob, AsyncSession, str], Awaitable[tuple[int, str]]]


# ===== datasource_sync handler =====

async def _handler_datasource_sync(
    job: ScheduledJob,
    db: AsyncSession,
    triggered_by: str,
) -> tuple[int, str]:
    """跑一次数据源同步。business_id = datasources.id"""
    from datetime import datetime, UTC

    from app.core.secret_box import decrypt
    from app.datasources.models import DataSource
    from app.datasources.sync_service import sync_to_table

    ds = await db.get(DataSource, job.business_id)
    if ds is None:
        raise RuntimeError(f"DataSource {job.business_id} 不存在")

    secrets = {k: decrypt(v) for k, v in (ds.secrets_encrypted or {}).items()}
    rows, message = await sync_to_table(
        ds.table_name, ds.source_type, ds.settings or {}, secrets, db
    )

    # 回写 datasources.last_* 字段（兼容 Endpoints 页展示）
    now = datetime.now(UTC)
    ds.last_sync_at = now
    ds.last_status = "success"
    ds.last_rows = rows
    ds.last_message = message
    return rows, message


# ===== 注册表 =====

JOB_HANDLERS: dict[str, HandlerFn] = {
    "datasource_sync": _handler_datasource_sync,
}


def get_handler(kind: str) -> HandlerFn:
    h = JOB_HANDLERS.get(kind)
    if h is None:
        raise RuntimeError(f"未注册的 job kind: {kind}（可选 {list(JOB_HANDLERS.keys())}）")
    return h
