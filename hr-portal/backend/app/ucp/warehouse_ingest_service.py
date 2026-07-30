"""Persistence helpers for auditable UCP warehouse ingest batches."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import UcpWarehouseIngestBatch


class IngestBatchConflictError(ValueError):
    pass


async def reserve_ingest_batch(
    db: AsyncSession,
    *,
    resource_id: int,
    target_asset: str,
    event_id: str,
    batch_id: str,
    period_value: str | None,
    payload_checksum: str,
    received_rows: int,
    trace_id: str | None,
) -> tuple[UcpWarehouseIngestBatch, bool]:
    """Create a batch or return its idempotent prior record.

    ``False`` means the exact event/batch was already reserved. A reused batch ID
    with different content is a conflict and must never overwrite formal data.
    """
    existing_event = await db.scalar(
        select(UcpWarehouseIngestBatch).where(
            UcpWarehouseIngestBatch.resource_id == resource_id,
            UcpWarehouseIngestBatch.event_id == event_id,
        )
    )
    if existing_event is not None:
        if existing_event.payload_checksum != payload_checksum:
            raise IngestBatchConflictError("同一请求标识的数据摘要不一致")
        return existing_event, False

    existing_batch = await db.scalar(
        select(UcpWarehouseIngestBatch).where(
            UcpWarehouseIngestBatch.resource_id == resource_id,
            UcpWarehouseIngestBatch.target_asset == target_asset,
            UcpWarehouseIngestBatch.batch_id == batch_id,
        )
    )
    if existing_batch is not None:
        if existing_batch.payload_checksum != payload_checksum:
            raise IngestBatchConflictError("同一批次标识的数据摘要不一致")
        return existing_batch, False

    batch = UcpWarehouseIngestBatch(
        resource_id=resource_id,
        target_asset=target_asset,
        event_id=event_id,
        batch_id=batch_id,
        period_value=period_value,
        payload_checksum=payload_checksum,
        status="RECEIVED",
        received_rows=received_rows,
        trace_id=trace_id,
    )
    try:
        async with db.begin_nested():
            db.add(batch)
            await db.flush()
        return batch, True
    except IntegrityError:
        existing_event = await db.scalar(
            select(UcpWarehouseIngestBatch).where(
                UcpWarehouseIngestBatch.resource_id == resource_id,
                UcpWarehouseIngestBatch.event_id == event_id,
            )
        )
        existing_batch = existing_event or await db.scalar(
            select(UcpWarehouseIngestBatch).where(
                UcpWarehouseIngestBatch.resource_id == resource_id,
                UcpWarehouseIngestBatch.target_asset == target_asset,
                UcpWarehouseIngestBatch.batch_id == batch_id,
            )
        )
        if existing_batch is None:
            raise
        if existing_batch.payload_checksum != payload_checksum:
            raise IngestBatchConflictError("同一批次标识的数据摘要不一致")
        return existing_batch, False


async def get_ingest_batch_for_event(
    db: AsyncSession,
    *,
    resource_id: int | None,
    event_id: str,
) -> UcpWarehouseIngestBatch | None:
    if resource_id is None:
        return None
    return await db.scalar(
        select(UcpWarehouseIngestBatch).where(
            UcpWarehouseIngestBatch.resource_id == resource_id,
            UcpWarehouseIngestBatch.event_id == event_id,
        )
    )


async def get_ingest_batch(
    db: AsyncSession,
    *,
    resource_code: str,
    batch_id: str,
) -> UcpWarehouseIngestBatch | None:
    from app.ucp.models import UcpResource

    return await db.scalar(
        select(UcpWarehouseIngestBatch)
        .join(UcpResource, UcpResource.id == UcpWarehouseIngestBatch.resource_id)
        .where(UcpResource.resource_code == resource_code, UcpWarehouseIngestBatch.batch_id == batch_id)
    )


async def list_ingest_batches(
    db: AsyncSession,
    *,
    resource_code: str | None = None,
    target_asset: str | None = None,
    period_value: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[tuple[UcpWarehouseIngestBatch, str]], int]:
    from sqlalchemy import func
    from app.ucp.models import UcpResource

    stmt = select(UcpWarehouseIngestBatch, UcpResource.resource_code).join(UcpResource, UcpResource.id == UcpWarehouseIngestBatch.resource_id)
    if resource_code:
        stmt = stmt.where(UcpResource.resource_code == resource_code)
    if target_asset:
        stmt = stmt.where(UcpWarehouseIngestBatch.target_asset == target_asset)
    if period_value:
        stmt = stmt.where(UcpWarehouseIngestBatch.period_value == period_value)
    if status:
        stmt = stmt.where(UcpWarehouseIngestBatch.status == status)
    total = int((await db.scalar(select(func.count()).select_from(stmt.subquery()))) or 0)
    items = list((await db.execute(
        stmt.order_by(UcpWarehouseIngestBatch.received_at.desc()).limit(limit).offset(offset)
    )).all())
    return items, total


def serialize_ingest_batch(batch: UcpWarehouseIngestBatch) -> dict:
    return {
        "batch_id": batch.batch_id,
        "event_id": batch.event_id,
        "status": batch.status,
        "target_asset": batch.target_asset,
        "period_value": batch.period_value,
        "received_rows": batch.received_rows,
        "written_rows": batch.written_rows,
        "processed_at": batch.processed_at,
        "received_at": batch.received_at,
        "trace_id": batch.trace_id,
        "error_summary": batch.error_summary,
        "pipeline_run_id": batch.pipeline_run_id,
    }


def mark_ingest_batch_processing(batch: UcpWarehouseIngestBatch, pipeline_run_id: str | None) -> None:
    batch.status = "PROCESSING"
    batch.pipeline_run_id = pipeline_run_id
    batch.written_rows = 0
    batch.error_summary = None
    batch.processed_at = None


def mark_ingest_batch_succeeded(batch: UcpWarehouseIngestBatch, written_rows: int) -> None:
    batch.status = "SUCCEEDED"
    batch.written_rows = written_rows
    batch.error_summary = None
    batch.processed_at = datetime.now(timezone.utc)


def mark_ingest_batch_failed(
    batch: UcpWarehouseIngestBatch,
    error_summary: str,
    *,
    dead_letter: bool = False,
) -> None:
    batch.status = "DEAD_LETTER" if dead_letter else "FAILED"
    batch.error_summary = (error_summary or "入仓处理失败")[:1000]
    batch.processed_at = datetime.now(timezone.utc)
