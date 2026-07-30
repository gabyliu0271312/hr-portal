"""Reliable dispatch for post-commit UCP asset-change messages."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import UcpOutboxMessage


async def enqueue_asset_change(db: AsyncSession, *, dedup_key: str, payload: dict) -> None:
    stmt = pg_insert(UcpOutboxMessage).values(
        topic="ods_table_data_changed",
        dedup_key=dedup_key,
        payload=payload,
    ).on_conflict_do_nothing(index_elements=["topic", "dedup_key"])
    await db.execute(stmt)


async def dispatch_pending_outbox(db: AsyncSession, *, batch_size: int = 50) -> int:
    now = datetime.now(timezone.utc)
    stmt = (
        select(UcpOutboxMessage)
        .where(
            UcpOutboxMessage.status.in_(["PENDING", "FAILED"]),
            (UcpOutboxMessage.next_attempt_at.is_(None)) | (UcpOutboxMessage.next_attempt_at <= now),
        )
        .order_by(UcpOutboxMessage.id)
        .limit(batch_size)
        .with_for_update(skip_locked=True)
    )
    messages = list((await db.execute(stmt)).scalars())
    for message in messages:
        message.status = "PROCESSING"
        message.attempt += 1
    await db.flush()
    for message in messages:
        try:
            from app.datasources.sync_service import _publish_ods_data_changed_event

            payload = dict(message.payload or {})
            await _publish_ods_data_changed_event(
                str(payload["table_name"]),
                str(payload.get("change_type") or "ucp_outbox"),
                int(payload.get("affected_row_count") or 0),
                payload,
            )
            message.status = "PUBLISHED"
            message.published_at = now
            message.last_error = None
            message.next_attempt_at = None
        except Exception as exc:  # noqa: BLE001
            message.status = "DEAD_LETTER" if message.attempt >= 5 else "FAILED"
            message.last_error = str(exc)[:1000]
            message.next_attempt_at = None if message.status == "DEAD_LETTER" else now + timedelta(seconds=min(3600, 60 * (2 ** (message.attempt - 1))))
    await db.flush()
    return len(messages)
