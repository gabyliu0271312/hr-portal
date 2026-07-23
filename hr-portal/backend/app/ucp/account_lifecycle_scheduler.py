"""Durable lifecycle job poller."""
from __future__ import annotations

import asyncio
import logging

from app.core.db import AsyncSessionLocal
from app.ucp.account_lifecycle_service import process_due_jobs

logger = logging.getLogger("ucp.account_lifecycle_scheduler")


async def run_lifecycle_job_poller(stop_event: asyncio.Event, interval_seconds: float = 30.0) -> None:
    """Consume persisted jobs until shutdown; pending jobs remain durable across restarts."""
    while not stop_event.is_set():
        try:
            async with AsyncSessionLocal() as db:
                processed = await process_due_jobs(db)
                if processed:
                    await db.commit()
        except Exception:  # noqa: BLE001
            logger.exception("lifecycle job poller failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except asyncio.TimeoutError:
            pass
