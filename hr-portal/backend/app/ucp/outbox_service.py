"""Reliable dispatch for post-commit UCP asset-change messages."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import UcpOutboxMessage


async def enqueue_event(db: AsyncSession, *, topic: str, dedup_key: str, payload: dict) -> None:
    stmt = pg_insert(UcpOutboxMessage).values(
        topic=topic,
        dedup_key=dedup_key,
        payload=payload,
    ).on_conflict_do_nothing(index_elements=["topic", "dedup_key"])
    await db.execute(stmt)


async def enqueue_asset_change(db: AsyncSession, *, dedup_key: str, payload: dict) -> None:
    await enqueue_event(
        db,
        topic="ods_table_data_changed",
        dedup_key=dedup_key,
        payload=payload,
    )


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
            payload = dict(message.payload or {})
            if message.topic == "mapping_published":
                from app.ucp.event_bus import process_event_pipeline, receive_event

                # Event、delivery 和 DWD rebuild 必须与本次 outbox attempt 同时成功或
                # 回滚。否则重试会遇到已落库的 event_id，导致不可恢复的重复事件错误。
                # process_event_pipeline 已通过 after_commit hook 启动已提交的 delivery，
                # 因此这里不能在提交前用独立 session 查询 pending delivery。
                async with db.begin_nested():
                    event = await receive_event(
                        db,
                        event_id=str(payload["event_id"]),
                        event_type=str(payload["event_type"]),
                        source="INTERNAL",
                        payload=payload,
                        is_dedup=False,
                    )
                    await process_event_pipeline(db, event)
                    if payload["event_type"] == "cost_center_mapping_published":
                        from app.mapping.cost_center_service import CostCenterMappingService
                        from app.warehouse.service.standardization import StandardizationRuleService

                        rebuild = await StandardizationRuleService(db).execute_full(
                            asset_code="cost_center_monthly",
                            target_table=str(payload["target_id"]),
                            cost_center_period=str(payload["period"]),
                        )
                        if rebuild.get("error"):
                            await CostCenterMappingService(db).mark_rebuild_result(
                                period=str(payload["period"]),
                                success=False,
                                error=str(rebuild.get("detail") or rebuild["error"]),
                                event_id=str(payload["event_id"]),
                                mapping_version=int(payload["mapping_version"]),
                                target_id=str(payload["target_id"]),
                            )
                            raise RuntimeError(str(rebuild.get("detail") or rebuild["error"]))
                        await CostCenterMappingService(db).mark_rebuild_result(
                            period=str(payload["period"]),
                            success=True,
                            event_id=str(payload["event_id"]),
                            mapping_version=int(payload["mapping_version"]),
                            target_id=str(payload["target_id"]),
                        )
                    await db.flush()
            elif message.topic == "ods_table_data_changed":
                from app.datasources.sync_service import _publish_ods_data_changed_event

                await _publish_ods_data_changed_event(
                    str(payload["table_name"]),
                    str(payload.get("change_type") or "ucp_outbox"),
                    int(payload.get("affected_row_count") or 0),
                    payload,
                )
            else:
                raise ValueError(f"unsupported outbox topic: {message.topic}")
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
