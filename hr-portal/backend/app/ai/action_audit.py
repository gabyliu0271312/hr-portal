"""Sanitized audit projection for server-controlled AI actions."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.audit import record_ai_log
from app.users.models import User


async def record_controlled_action_audit(
    *,
    db: AsyncSession,
    user: User,
    action_type: str,
    capability_id: str | None,
    conversation_id: int,
    channel: str,
    status: str,
    failure_stage: str | None = None,
) -> None:
    """Persist only registered control metadata; never pass request handles or business data."""
    metadata = {
        "action_type": action_type,
        "capability_id": capability_id,
        "conversation_id": conversation_id,
        "channel": channel,
    }
    if failure_stage is not None:
        metadata["failure_stage"] = failure_stage
    await record_ai_log(
        db=db,
        user=user,
        action="controlled_action",
        request_summary="controlled action",
        response_summary=None,
        input_payload={"action_type": action_type, "capability_id": capability_id},
        output_payload={"status": status},
        status=status,
        metadata=metadata,
    )
