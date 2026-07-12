"""UCP 事件可靠性服务（Phase 3-3）

提供:
  - 验签: 通用 HMAC-SHA256 签名校验中间件逻辑（trigger.signing_secret 模式）
  - 去重: event_id 唯一约束 + DuplicateEventError 信号（event_bus 已实现）
  - 重试: 指数退避策略（1m / 5m / 30m / 2h / 12h，最多 5 次）
  - 死信: retry 耗尽后 status=DEAD_LETTER
  - 重放: 人工/手动重放死信或历史事件
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.event_bus import (
    EVENT_STATUS_DEAD_LETTER,
    EVENT_STATUS_DISPATCHED,
    EVENT_STATUS_FAILED,
    process_event_pipeline,
)
from app.ucp.models import UcpEventTrigger, UcpEvent, UcpEventDelivery


logger = logging.getLogger("ucp.event_reliability")


# ============================================================
# 指数退避策略
# ============================================================
RETRY_DELAYS_SECONDS: list[int] = [
    60,         # 第 1 次重试：1 分钟后
    300,        # 第 2 次：5 分钟
    1800,       # 第 3 次：30 分钟
    7200,       # 第 4 次：2 小时
    43200,      # 第 5 次：12 小时
]
MAX_RETRY_COUNT = len(RETRY_DELAYS_SECONDS)


# ============================================================
# 派发记录管理
# ============================================================
DELIVERY_STATUS_PENDING = "PENDING"
DELIVERY_STATUS_SUCCESS = "SUCCESS"
DELIVERY_STATUS_FAILED = "FAILED"
DELIVERY_STATUS_DEAD_LETTER = "DEAD_LETTER"
DELIVERY_STATUS_SKIPPED = "SKIPPED"


def compute_next_retry_at(attempt: int) -> datetime:
    """根据当前 attempt 计算下一次重试时间。"""
    idx = min(attempt, len(RETRY_DELAYS_SECONDS)) - 1
    delay = RETRY_DELAYS_SECONDS[max(idx, 0)]
    return datetime.now(timezone.utc) + timedelta(seconds=delay)


def compute_signature(secret: str, payload: bytes | str) -> str:
    """HMAC-SHA256 签名。"""
    if isinstance(payload, str):
        payload = payload.encode("utf-8")
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def verify_signature(secret: str, payload: bytes | str, expected: str) -> bool:
    """常量时间比较签名。"""
    if not expected or not secret:
        return False
    return hmac.compare_digest(compute_signature(secret, payload), expected)


# ============================================================
# 派发尝试记录
# ============================================================
async def create_delivery_record(
    db: AsyncSession,
    *,
    event: UcpEvent,
    trigger: UcpEventTrigger,
    pipeline_run_id: str | None,
    trigger_source: str = "AUTO",
    triggered_by: str | None = None,
    attempt: int = 1,
) -> UcpEventDelivery:
    """创建派发尝试记录。"""
    rec = UcpEventDelivery(
        event_id=event.id,
        event_uuid=event.event_id,
        trigger_id=trigger.id,
        trigger_code=trigger.trigger_code,
        pipeline_run_id=pipeline_run_id,
        attempt=attempt,
        status=DELIVERY_STATUS_PENDING,
        trigger_source=trigger_source,
        triggered_by=triggered_by,
    )
    db.add(rec)
    await db.flush()
    return rec


async def mark_delivery_success(
    db: AsyncSession,
    delivery: UcpEventDelivery,
) -> None:
    """标记派发成功。"""
    delivery.status = DELIVERY_STATUS_SUCCESS
    delivery.error_code = None
    delivery.error_message = None
    delivery.next_retry_at = None
    await db.flush()


async def mark_delivery_failed(
    db: AsyncSession,
    delivery: UcpEventDelivery,
    *,
    error_code: str,
    error_message: str,
) -> None:
    """标记派发失败。如已达最大重试次数则置为 DEAD_LETTER。"""
    delivery.status = DELIVERY_STATUS_FAILED
    delivery.error_code = error_code
    delivery.error_message = (error_message or "")[:500]
    delivery.last_retry_at = datetime.now(timezone.utc)

    if delivery.attempt >= MAX_RETRY_COUNT:
        # 已达最大重试次数，进入死信
        delivery.status = DELIVERY_STATUS_DEAD_LETTER
        delivery.next_retry_at = None
    else:
        # 计算下一次重试时间
        delivery.next_retry_at = compute_next_retry_at(delivery.attempt + 1)
    await db.flush()


# ============================================================
# 死信队列查询
# ============================================================
async def list_dead_letters(
    db: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    trigger_code: str | None = None,
) -> tuple[list[UcpEventDelivery], int]:
    """查询死信记录。"""
    stmt = select(UcpEventDelivery).where(
        UcpEventDelivery.status == DELIVERY_STATUS_DEAD_LETTER,
    )
    if trigger_code:
        stmt = stmt.where(UcpEventDelivery.trigger_code == trigger_code)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one() or 0
    list_stmt = stmt.order_by(desc(UcpEventDelivery.updated_at)).limit(limit).offset(offset)
    items = (await db.execute(list_stmt)).scalars().all()
    return list(items), int(total)


async def get_delivery(db: AsyncSession, delivery_id: int) -> UcpEventDelivery | None:
    return (
        await db.execute(
            select(UcpEventDelivery).where(UcpEventDelivery.id == delivery_id)
        )
    ).scalar_one_or_none()


async def list_event_deliveries(
    db: AsyncSession,
    *,
    event_uuid: str,
    limit: int = 50,
) -> list[UcpEventDelivery]:
    """查询某个事件的所有派发尝试记录。"""
    stmt = (
        select(UcpEventDelivery)
        .where(UcpEventDelivery.event_uuid == event_uuid)
        .order_by(desc(UcpEventDelivery.created_at))
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


# ============================================================
# 重放
# ============================================================
async def replay_event(
    db: AsyncSession,
    *,
    event_uuid: str,
    triggered_by: str | None = None,
) -> UcpEvent:
    """重放指定事件: 重新匹配触发器 + 创建新的派发记录 + 异步执行 pipeline。

    Returns:
        更新后的 UcpEvent

    Raises:
        EventBusError: 事件不存在
    """
    from app.ucp.event_bus import get_event, get_trigger

    event = await get_event(db, event_uuid)
    if event is None:
        from app.ucp.event_bus import EventBusError
        raise EventBusError("EVENT_NOT_FOUND", f"事件 '{event_uuid}' 不存在")

    # 重置状态
    event.status = "RECEIVED"
    event.error_code = None
    event.error_message = None
    event.retry_count = 0
    await db.flush()

    # 重新匹配 + 派发
    if event.matched_trigger_id:
        trigger = await get_trigger(db, event.matched_trigger_id)
        if trigger is not None:
            from app.ucp.event_bus import dispatch_event, match_triggers
            triggers = await match_triggers(db, event)
            for trig in triggers:
                run_id = f"run_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
                # 创建新派发记录（来源 REPLAY）
                rec = await create_delivery_record(
                    db,
                    event=event,
                    trigger=trig,
                    pipeline_run_id=run_id,
                    trigger_source="REPLAY",
                    triggered_by=triggered_by,
                )
                # 触发执行
                import asyncio
                from app.ucp.event_bus import _run_pipeline_in_background
                asyncio.create_task(
                    _run_pipeline_in_background(
                        pipeline_code=trig.pipeline_code,
                        run_id=run_id,
                        trace_id=event.trace_id or "",
                        event_payload=event.payload or {},
                        run_as_type=trig.run_as_type,
                        service_account_code=trig.service_account_code,
                    )
                )
                event.pipeline_run_id = run_id
                event.status = EVENT_STATUS_DISPATCHED
                event.dispatched_at = datetime.now(timezone.utc)
                await db.flush()
                logger.info(
                    "event replayed: event_id=%s trigger=%s run_id=%s",
                    event.event_id, trig.trigger_code, run_id,
                )
    else:
        # 未匹配过，重新走一次完整流程
        await process_event_pipeline(db, event)

    return event


async def replay_dead_letter(
    db: AsyncSession,
    *,
    delivery_id: int,
    triggered_by: str | None = None,
) -> UcpEventDelivery:
    """重放指定的死信记录（重新派发关联事件）。"""
    from app.ucp.event_bus import EventBusError

    delivery = await get_delivery(db, delivery_id)
    if delivery is None:
        raise EventBusError("DELIVERY_NOT_FOUND", f"派发记录 #{delivery_id} 不存在")
    if delivery.status != DELIVERY_STATUS_DEAD_LETTER:
        raise EventBusError(
            "NOT_DEAD_LETTER",
            f"派发记录状态为 {delivery.status}，无需重放",
        )

    # 重置派发记录 + 重新派发事件
    delivery.status = DELIVERY_STATUS_PENDING
    delivery.error_code = None
    delivery.error_message = None
    delivery.attempt += 1
    delivery.next_retry_at = None
    delivery.last_retry_at = datetime.now(timezone.utc)
    delivery.trigger_source = "REPLAY"
    delivery.triggered_by = triggered_by
    await db.flush()

    # 同步重放事件
    event = await replay_event(db, event_uuid=delivery.event_uuid, triggered_by=triggered_by)

    delivery.pipeline_run_id = event.pipeline_run_id
    await db.flush()
    return delivery


async def discard_dead_letter(
    db: AsyncSession,
    *,
    delivery_id: int,
    triggered_by: str | None = None,
) -> UcpEventDelivery:
    """丢弃指定的死信记录（状态置为 SKIPPED，不再重试）。"""
    from app.ucp.event_bus import EventBusError

    delivery = await get_delivery(db, delivery_id)
    if delivery is None:
        raise EventBusError("DELIVERY_NOT_FOUND", f"派发记录 #{delivery_id} 不存在")
    if delivery.status != DELIVERY_STATUS_DEAD_LETTER:
        raise EventBusError(
            "NOT_DEAD_LETTER",
            f"派发记录状态为 {delivery.status}，无法丢弃",
        )

    delivery.status = DELIVERY_STATUS_SKIPPED
    delivery.triggered_by = triggered_by
    delivery.error_message = (delivery.error_message or "") + "\n[discarded]"
    delivery.next_retry_at = None
    await db.flush()
    return delivery


# ============================================================
# 重试扫描器（由 scheduler 调用）
# ============================================================
async def scan_due_retries(
    db: AsyncSession,
    *,
    batch_size: int = 50,
) -> list[UcpEvent]:
    """扫描到期的重试记录，并触发重派发。

    Returns:
        被重新派发的 UcpEvent 列表
    """
    now = datetime.now(timezone.utc)
    stmt = (
        select(UcpEventDelivery)
        .where(
            and_(
                UcpEventDelivery.status == DELIVERY_STATUS_FAILED,
                UcpEventDelivery.next_retry_at.isnot(None),
                UcpEventDelivery.next_retry_at <= now,
            )
        )
        .limit(batch_size)
    )
    deliveries = (await db.execute(stmt)).scalars().all()

    replayed: list[UcpEvent] = []
    from app.ucp.event_bus import get_event, get_trigger

    for d in deliveries:
        event = await get_event(db, d.event_uuid)
        if event is None:
            continue
        # 推进 attempt
        d.attempt += 1
        d.status = DELIVERY_STATUS_PENDING
        d.last_retry_at = now
        d.next_retry_at = None
        await db.flush()

        # 重新派发
        if d.trigger_id:
            trigger = await get_trigger(db, d.trigger_id)
            if trigger is not None:
                import asyncio
                from app.ucp.event_bus import _run_pipeline_in_background
                run_id = f"run_{now.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
                d.pipeline_run_id = run_id
                event.pipeline_run_id = run_id
                event.status = EVENT_STATUS_DISPATCHED
                event.dispatched_at = now
                await db.flush()
                asyncio.create_task(
                    _run_pipeline_in_background(
                        pipeline_code=trigger.pipeline_code,
                        run_id=run_id,
                        trace_id=event.trace_id or "",
                        event_payload=event.payload or {},
                        run_as_type=trigger.run_as_type,
                        service_account_code=trigger.service_account_code,
                    )
                )
                replayed.append(event)
    return replayed
