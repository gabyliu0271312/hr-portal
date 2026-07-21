"""Persistent, cross-channel capability rate limiting."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.models import AiCapabilityRateLimit


class CapabilityRateLimitExceeded(RuntimeError):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("capability rate limit exceeded")
        self.retry_after_seconds = retry_after_seconds


async def enforce_capability_rate_limit(
    db: AsyncSession,
    *,
    user_id: int,
    capability_id: str,
    max_requests: int,
    window_seconds: int,
    now: datetime | None = None,
) -> None:
    if max_requests < 1 or window_seconds < 1:
        raise ValueError("rate limit settings must be positive")
    current_time = now or datetime.now(timezone.utc)
    result = await db.execute(
        select(AiCapabilityRateLimit)
        .where(
            AiCapabilityRateLimit.user_id == user_id,
            AiCapabilityRateLimit.capability_id == capability_id,
        )
        .with_for_update()
    )
    record = result.scalar_one_or_none()
    if record is None:
        db.add(
            AiCapabilityRateLimit(
                user_id=user_id,
                capability_id=capability_id,
                window_started_at=current_time,
                request_count=1,
            )
        )
        await db.flush()
        return

    window_end = record.window_started_at + timedelta(seconds=window_seconds)
    if current_time >= window_end:
        record.window_started_at = current_time
        record.request_count = 1
        await db.flush()
        return
    if record.request_count >= max_requests:
        retry_after_seconds = max(1, int((window_end - current_time).total_seconds()))
        raise CapabilityRateLimitExceeded(retry_after_seconds)
    record.request_count += 1
    await db.flush()
