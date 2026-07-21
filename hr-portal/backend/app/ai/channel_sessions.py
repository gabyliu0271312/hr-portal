"""Channel-neutral conversation bindings and event idempotency receipts."""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.models import AiChannelEvent, AiChannelSession, AiConversation
from app.users.models import User


def channel_key_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


async def load_or_create_channel_conversation(
    db: AsyncSession,
    *,
    user: User,
    channel: str,
    external_session_key: str,
) -> AiConversation:
    if not channel or not external_session_key:
        raise ValueError("channel and external_session_key are required")
    external_hash = channel_key_hash(external_session_key)
    binding = (
        await db.execute(
            select(AiChannelSession)
            .where(
                AiChannelSession.channel == channel,
                AiChannelSession.external_session_hash == external_hash,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if binding is not None:
        if binding.user_id != user.id:
            raise ValueError("channel session user binding does not match")
        conversation = await db.get(AiConversation, binding.conversation_id)
        if conversation is None:
            raise RuntimeError("channel session conversation is unavailable")
        return conversation

    conversation = AiConversation(user_id=user.id, channel=channel, state={})
    db.add(conversation)
    await db.flush()
    db.add(
        AiChannelSession(
            channel=channel,
            external_session_hash=external_hash,
            user_id=user.id,
            conversation_id=conversation.id,
        )
    )
    await db.flush()
    return conversation


async def claim_channel_event(
    db: AsyncSession,
    *,
    channel: str,
    event_key: str,
) -> bool:
    if not channel or not event_key:
        raise ValueError("channel and event_key are required")
    event_hash = channel_key_hash(event_key)
    existing = (
        await db.execute(
            select(AiChannelEvent)
            .where(AiChannelEvent.channel == channel, AiChannelEvent.event_key_hash == event_hash)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if existing is not None:
        return False
    db.add(
        AiChannelEvent(
            channel=channel,
            event_key_hash=event_hash,
            status="received",
            received_at=datetime.now(timezone.utc),
        )
    )
    await db.flush()
    return True


async def complete_channel_event(
    db: AsyncSession,
    *,
    channel: str,
    event_key: str,
    status: str = "completed",
) -> None:
    event_hash = channel_key_hash(event_key)
    event = (
        await db.execute(
            select(AiChannelEvent)
            .where(AiChannelEvent.channel == channel, AiChannelEvent.event_key_hash == event_hash)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if event is None:
        raise ValueError("channel event has not been claimed")
    event.status = status
    event.completed_at = datetime.now(timezone.utc)
    await db.flush()
