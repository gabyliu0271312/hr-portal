"""Retention maintenance for public AI action infrastructure."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.models import AiCapabilityRateLimit, AiChannelEvent, AiChannelSession, AiControlledAction
from app.system.models import SystemLog


async def purge_controlled_action_data(
    db: AsyncSession,
    *,
    audit_retention_days: int,
    state_retention_days: int,
    now: datetime | None = None,
) -> dict[str, int]:
    """Delete expired public-action state and its sanitized audit records."""
    if audit_retention_days < 1 or state_retention_days < 1:
        raise ValueError("retention days must be positive")
    current_time = now or datetime.now(timezone.utc)
    state_cutoff = current_time - timedelta(days=state_retention_days)
    audit_cutoff = current_time - timedelta(days=audit_retention_days)
    deleted_actions = await db.execute(
        delete(AiControlledAction).where(AiControlledAction.expires_at < state_cutoff)
    )
    deleted_limits = await db.execute(
        delete(AiCapabilityRateLimit).where(AiCapabilityRateLimit.updated_at < state_cutoff)
    )
    deleted_events = await db.execute(
        delete(AiChannelEvent).where(AiChannelEvent.received_at < state_cutoff)
    )
    deleted_sessions = await db.execute(
        delete(AiChannelSession).where(AiChannelSession.updated_at < state_cutoff)
    )
    deleted_audits = await db.execute(
        delete(SystemLog).where(
            SystemLog.category == "ai_call",
            SystemLog.action == "controlled_action",
            SystemLog.created_at < audit_cutoff,
        )
    )
    return {
        "controlled_actions": deleted_actions.rowcount or 0,
        "rate_limits": deleted_limits.rowcount or 0,
        "channel_events": deleted_events.rowcount or 0,
        "channel_sessions": deleted_sessions.rowcount or 0,
        "audits": deleted_audits.rowcount or 0,
    }
