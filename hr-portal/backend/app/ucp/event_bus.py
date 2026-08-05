"""UCP Event Bus —— 事件总线核心服务

Phase 3-1 职责:
  1. 事件接收入口: receive_event() / receive_raw_event() —— 落库 + 状态机推进
  2. 触发器匹配: match_triggers() —— 按 event_source + event_types 匹配 + filter_rule 过滤
  3. 异步派发: dispatch_event() —— 调用 pipeline_engine.execute_pipeline,记录 pipeline_run_id
  4. in-process pub/sub: 内部事件可同步通知订阅者（解耦其他模块）
  5. 状态查询: list_events / get_event —— 审计 + 监控

Phase 3-2 会接入飞书 webhook: 飞书 webhook 入口 → receive_feishu_event() → 转标准事件
Phase 3-3 会接入验签 / 去重 / 重试 / 死信 —— 该文件保留扩展点
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Iterable

from sqlalchemy import and_, desc, event as sqlalchemy_event, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session as SyncSession

from app.ucp.models import UcpEvent, UcpEventDelivery, UcpEventTrigger, UcpPipelineConfig


logger = logging.getLogger("ucp.event_bus")

_PENDING_BACKGROUND_RUNS = "ucp_pending_background_runs"
COST_ALLOCATION_LOCKED_EVENT_TYPE = "allocation_period.locked"
COST_ALLOCATION_CANONICAL_TRIGGER_CODE = "COST_ALLOCATION_LOCKED_TRIGGER"


def _enqueue_background_pipeline(db: AsyncSession, **kwargs: Any) -> None:
    db.sync_session.info.setdefault(_PENDING_BACKGROUND_RUNS, []).append(kwargs)


@sqlalchemy_event.listens_for(SyncSession, "after_commit")
def _start_committed_background_pipelines(session: SyncSession) -> None:
    pending = session.info.pop(_PENDING_BACKGROUND_RUNS, [])
    if not pending:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        logger.error("cannot start committed UCP pipelines without a running event loop")
        return
    for kwargs in pending:
        loop.create_task(_run_pipeline_in_background(**kwargs))


@sqlalchemy_event.listens_for(SyncSession, "after_rollback")
def _discard_rolled_back_background_pipelines(session: SyncSession) -> None:
    session.info.pop(_PENDING_BACKGROUND_RUNS, None)


# ============================================================
# 事件状态机常量
# ============================================================
EVENT_STATUS_RECEIVED = "RECEIVED"        # 刚入库
EVENT_STATUS_MATCHED = "MATCHED"          # 已匹配到触发器
EVENT_STATUS_DISPATCHED = "DISPATCHED"   # 已派发到 pipeline
EVENT_STATUS_COMPLETED = "COMPLETED"     # pipeline 执行完成
EVENT_STATUS_FAILED = "FAILED"            # 执行失败
EVENT_STATUS_DEAD_LETTER = "DEAD_LETTER"  # 重试耗尽（Phase 3-3 启用）
EVENT_STATUS_NO_MATCH = "NO_MATCH"        # 未匹配到任何触发器

EVENT_STATUSES_ALL = [
    EVENT_STATUS_RECEIVED,
    EVENT_STATUS_MATCHED,
    EVENT_STATUS_DISPATCHED,
    EVENT_STATUS_COMPLETED,
    EVENT_STATUS_FAILED,
    EVENT_STATUS_DEAD_LETTER,
    EVENT_STATUS_NO_MATCH,
]

# ============================================================
# 事件来源常量
# ============================================================
EVENT_SOURCE_FEISHU = "FEISHU"
EVENT_SOURCE_BEISEN = "BEISEN"
EVENT_SOURCE_INTERNAL = "INTERNAL"
EVENT_SOURCE_GENERIC = "GENERIC"

EVENT_SOURCES_ALL = [
    EVENT_SOURCE_FEISHU,
    EVENT_SOURCE_BEISEN,
    EVENT_SOURCE_INTERNAL,
    EVENT_SOURCE_GENERIC,
]


# ============================================================
# 异常类
# ============================================================
class EventBusError(Exception):
    """事件总线错误基类。"""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(f"[{code}] {message}")


class DuplicateEventError(EventBusError):
    """重复事件（event_id 已存在）。Phase 3-3 用作去重信号。"""


class TriggerNotFoundError(EventBusError):
    """触发器未找到 / 已禁用。"""


# ============================================================
# in-process 订阅者
# ============================================================
SubscriberFn = Callable[["UcpEventEnvelope"], Awaitable[None]]


@dataclass(slots=True)
class UcpEventEnvelope:
    """事件信封：派发给订阅者 / 写入日志的统一格式。

    字段比 ORM 更紧凑，避免订阅者拿到 ORM session 引发问题。
    """

    id: int
    event_id: str
    event_type: str
    source: str
    trigger: str
    payload: dict
    status: str
    trace_id: str | None
    matched_trigger_code: str | None
    pipeline_run_id: str | None
    retry_count: int
    error_code: str | None
    error_message: str | None
    received_at: datetime
    metadata: dict | None = None


# 全局订阅表: source.event_type → list[SubscriberFn]
_SUBSCRIBERS: dict[str, list[SubscriberFn]] = {}


def subscribe(event_source: str, event_type: str, fn: SubscriberFn) -> None:
    """订阅事件。Phase 3 内部 / 集成层使用。

    同一个 (source, event_type) 可注册多个订阅者，按注册顺序串行调用。
    """
    key = f"{event_source}.{event_type}"
    _SUBSCRIBERS.setdefault(key, []).append(fn)
    logger.info("subscribed: %s -> %s", key, getattr(fn, "__name__", str(fn)))


def unsubscribe(event_source: str, event_type: str, fn: SubscriberFn) -> None:
    key = f"{event_source}.{event_type}"
    if key in _SUBSCRIBERS:
        try:
            _SUBSCRIBERS[key].remove(fn)
        except ValueError:
            pass


# ============================================================
# 入库 + 派发
# ============================================================
def _gen_trace_id() -> str:
    """生成 trace_id（与 pipeline_engine 风格保持一致）。"""
    now = datetime.now(timezone.utc)
    return f"trace_{now.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"


async def receive_event(
    db: AsyncSession,
    *,
    event_id: str,
    event_type: str,
    source: str,
    payload: dict,
    trigger: str = "REALTIME",
    metadata: dict | None = None,
    event_timestamp: datetime | None = None,
    is_dedup: bool = True,
    external_event_id: str | None = None,
    resource_id: int | None = None,
    system_code: str | None = None,
    resource_object_id: int | None = None,
    event_definition_id: int | None = None,
) -> UcpEvent:
    """事件接收入口：入库 + 立即派发触发器。

    Args:
        event_id: 外部事件 ID（用于去重；内部事件可传 uuid）
        event_type: 事件类型
        source: 事件来源
        payload: 事件 payload（建议先脱敏再传入）
        trigger: REALTIME / BATCH
        metadata: header / ip / 签名等元数据
        event_timestamp: 事件产生时间（外部传入）
        is_dedup: True 时若 event_id 已存在直接抛 DuplicateEventError

    Returns:
        UcpEvent: 落库后的事件 ORM 对象

    Raises:
        DuplicateEventError: is_dedup=True 且 event_id 已存在
    """
    # 去重检查
    if is_dedup:
        existing = (
            await db.execute(select(UcpEvent).where(UcpEvent.event_id == event_id))
        ).scalar_one_or_none()
        if existing is not None:
            raise DuplicateEventError(
                "EVENT_DUPLICATE",
                f"事件 {event_id} 已存在（db id={existing.id}）",
            )

    event = UcpEvent(
        event_id=event_id,
        external_event_id=external_event_id,
        event_type=event_type,
        source=source,
        trigger=trigger,
        payload=payload or {},
        metadata_=metadata,
        status=EVENT_STATUS_RECEIVED,
        trace_id=_gen_trace_id(),
        event_timestamp=event_timestamp,
        resource_id=resource_id,
        system_code=system_code,
        resource_object_id=resource_object_id,
        event_definition_id=event_definition_id,
    )
    db.add(event)
    await db.flush()
    logger.info(
        "event received: id=%s event_id=%s type=%s source=%s",
        event.id, event.event_id, event.event_type, event.source,
    )

    # 同步通知订阅者
    await _notify_subscribers(event)

    return event


async def _notify_subscribers(event: UcpEvent) -> None:
    """通知该事件类型的所有订阅者。失败不阻断主流程。"""
    key = f"{event.source}.{event.event_type}"
    fns = list(_SUBSCRIBERS.get(key, [])) + list(_SUBSCRIBERS.get(f"{event.source}.*", []))
    if not fns:
        return
    env = _to_envelope(event)
    for fn in fns:
        try:
            await fn(env)
        except Exception:  # noqa: BLE001
            logger.exception("subscriber failed: %s", getattr(fn, "__name__", str(fn)))


def _to_envelope(event: UcpEvent) -> UcpEventEnvelope:
    return UcpEventEnvelope(
        id=event.id,
        event_id=event.event_id,
        event_type=event.event_type,
        source=event.source,
        trigger=event.trigger,
        payload=event.payload or {},
        status=event.status,
        trace_id=event.trace_id,
        matched_trigger_code=event.matched_trigger_code,
        pipeline_run_id=event.pipeline_run_id,
        retry_count=event.retry_count,
        error_code=event.error_code,
        error_message=event.error_message,
        received_at=event.received_at,
        metadata=event.metadata_,
    )


async def match_triggers(
    db: AsyncSession,
    event: UcpEvent,
) -> list[UcpEventTrigger]:
    """匹配所有命中此事件的触发器。

    匹配规则 (Phase 5-2 升级):
      1. event_source 完全匹配
      2. event_types 包含此 event.event_type（逗号分隔, * 通配）
      3. is_active = 1
      4. 资源粒度过滤 (新):
         - source_resource_id 命中: event.resource_id == trig.source_resource_id
         - 否则 source_system_code 命中: event.system_code == trig.source_system_code
         - 两者都为空: 全局匹配 (旧行为)
      5. filter_rule（可选）按 JSON 路径精确匹配 payload
    """
    stmt = select(UcpEventTrigger).where(
        and_(
            UcpEventTrigger.is_active == 1,
            UcpEventTrigger.event_source == event.source,
        )
    )
    triggers = (await db.execute(stmt)).scalars().all()

    matched: list[UcpEventTrigger] = []
    for trig in triggers:
        if getattr(trig, "source_resource_object_id", None) is not None and getattr(event, "resource_object_id", None) != trig.source_resource_object_id:
            continue
        # 资源 / 系统粒度过滤
        if trig.source_resource_id is not None:
            if getattr(event, "resource_id", None) != trig.source_resource_id:
                continue
        elif trig.source_system_code:
            if getattr(event, "system_code", None) != trig.source_system_code:
                continue
        # 事件类型匹配
        types = {t.strip() for t in (trig.event_types or "").split(",") if t.strip()}
        if "*" not in types and event.event_type not in types:
            continue
        if trig.filter_rule and not _match_filter(event.payload or {}, trig.filter_rule or {}):
            continue
        matched.append(trig)
    return matched


def _restrict_cost_allocation_triggers(
    event: UcpEvent,
    triggers: list[UcpEventTrigger],
) -> list[UcpEventTrigger]:
    """Keep the cost-allocation webhook on its single canonical trigger."""
    if getattr(event, "event_type", None) != COST_ALLOCATION_LOCKED_EVENT_TYPE:
        return triggers

    canonical = [
        trigger
        for trigger in triggers
        if trigger.trigger_code == COST_ALLOCATION_CANONICAL_TRIGGER_CODE
    ]
    if canonical:
        if len(triggers) > 1:
            logger.warning(
                "suppressed duplicate cost-allocation triggers: event_id=%s triggers=%s",
                getattr(event, "event_id", None),
                [trigger.trigger_code for trigger in triggers],
            )
        return canonical

    if triggers:
        logger.error(
            "cost-allocation event has no active canonical trigger: event_id=%s triggers=%s",
            getattr(event, "event_id", None),
            [trigger.trigger_code for trigger in triggers],
        )
    return []


def _match_filter(payload: dict, rule: dict) -> bool:
    """filter_rule 匹配。

    rule 格式: {"path": "$.event_type", "op": "eq|ne|in|contains", "value": ...}
    支持简单 JSONPath（点号/嵌套 dict）。失败/不匹配一律 False。
    """
    try:
        path = rule.get("path", "")
        op = (rule.get("op") or "eq").lower()
        value = rule.get("value")
        actual = _resolve_path(payload, path)
        if op == "eq":
            return actual == value
        if op == "ne":
            return actual != value
        if op == "in":
            return actual in (value or [])
        if op == "contains":
            if isinstance(actual, (list, tuple, str)):
                return value in actual
            return False
        if op == "exists":
            return actual is not None
        return False
    except Exception:  # noqa: BLE001
        return False


def _resolve_path(obj: Any, path: str) -> Any:
    """极简 JSONPath：$.a.b.c 或 a.b.c。"""
    if not path:
        return obj
    s = path[2:] if path.startswith("$.") else path
    cur: Any = obj
    for part in s.split(".") if s else []:
        if not part:
            continue
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


async def dispatch_event(
    db: AsyncSession,
    event: UcpEvent,
    trigger: UcpEventTrigger,
) -> str:
    """派发事件到对应 pipeline。

    Returns:
        str: pipeline_run_id

    Raises:
        EventBusError: pipeline 不存在 / pipeline 不可用
    """
    # 查 pipeline 配置
    pl = (
        await db.execute(
            select(UcpPipelineConfig).where(
                UcpPipelineConfig.pipeline_code == trigger.pipeline_code,
            )
        )
    ).scalar_one_or_none()
    if pl is None:
        raise EventBusError("PIPELINE_NOT_FOUND", f"pipeline '{trigger.pipeline_code}' 不存在")
    if pl.status != 1:
        raise EventBusError("PIPELINE_INACTIVE", f"pipeline '{trigger.pipeline_code}' 未发布或已停用")

    existing_delivery = (await db.execute(
        select(UcpEventDelivery)
        .where(
            UcpEventDelivery.event_id == event.id,
            UcpEventDelivery.trigger_id == trigger.id,
            UcpEventDelivery.event_uuid == event.event_id,
            UcpEventDelivery.trigger_source == "AUTO",
            UcpEventDelivery.status.notin_(["SKIPPED"]),
        )
        .order_by(UcpEventDelivery.id.desc())
        .limit(1)
    )).scalar_one_or_none()
    if existing_delivery is not None and existing_delivery.pipeline_run_id:
        event.matched_trigger_id = trigger.id
        event.matched_trigger_code = trigger.trigger_code
        event.pipeline_run_id = existing_delivery.pipeline_run_id
        event.status = EVENT_STATUS_DISPATCHED
        event.dispatched_at = datetime.now(timezone.utc)
        await db.flush()
        return existing_delivery.pipeline_run_id

    # 派发（只持久化，调用者在事务提交成功后再启动后台任务）
    run_id = f"run_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    event.matched_trigger_id = trigger.id
    event.matched_trigger_code = trigger.trigger_code
    event.pipeline_run_id = run_id
    event.status = EVENT_STATUS_DISPATCHED
    event.dispatched_at = datetime.now(timezone.utc)
    await db.flush()

    # Phase 3-3: 写一条派发尝试记录（用于重试/死信）
    delivery_id: int | None = None
    try:
        from app.ucp.event_reliability import create_delivery_record
        delivery = await create_delivery_record(
            db,
            event=event,
            trigger=trigger,
            pipeline_run_id=run_id,
            trigger_source="AUTO",
        )
        delivery_id = delivery.id
    except Exception:  # noqa: BLE001
        logger.exception("create_delivery_record failed (non-fatal)")

    _enqueue_background_pipeline(
        db,
        pipeline_code=trigger.pipeline_code,
        run_id=run_id,
        trace_id=event.trace_id or "",
        event_payload=event.payload or {},
        run_as_type=trigger.run_as_type,
        service_account_code=trigger.service_account_code,
        event_db_id=event.id,
        event_id=event.event_id,
        trigger_code=trigger.trigger_code,
        delivery_id=delivery_id,
    )

    logger.info(
        "event dispatched: event_id=%s trigger=%s pipeline=%s run_id=%s",
        event.event_id, trigger.trigger_code, trigger.pipeline_code, run_id,
    )
    return run_id


async def start_pending_event_deliveries(event_db_id: int) -> int:
    """Start persisted pending deliveries in an independent session after commit."""
    from app.core.db import get_session_factory

    async with get_session_factory()() as db:
        event = await db.get(UcpEvent, event_db_id)
        if event is None:
            logger.error("cannot start event deliveries: event_id=%s not found", event_db_id)
            return 0
        deliveries = list((await db.execute(
            select(UcpEventDelivery)
            .where(
                UcpEventDelivery.event_id == event_db_id,
                UcpEventDelivery.status == "PENDING",
            )
            .with_for_update(skip_locked=True)
        )).scalars())
        jobs = []
        for delivery in deliveries:
            trigger = await db.get(UcpEventTrigger, delivery.trigger_id)
            if trigger is None or not delivery.pipeline_run_id:
                continue
            delivery.status = "RUNNING"
            delivery.started_at = datetime.now(timezone.utc)
            delivery.heartbeat_at = delivery.started_at
            jobs.append((delivery.id, delivery.pipeline_run_id, trigger))
        await db.commit()
        for delivery_id, run_id, trigger in jobs:
            asyncio.create_task(
                _run_pipeline_in_background(
                    pipeline_code=trigger.pipeline_code,
                    run_id=run_id,
                    trace_id=event.trace_id or "",
                    event_payload=event.payload or {},
                    run_as_type=trigger.run_as_type,
                    service_account_code=trigger.service_account_code,
                    event_db_id=event.id,
                    event_id=event.event_id,
                    trigger_code=trigger.trigger_code,
                    delivery_id=delivery_id,
                )
            )
        return len(jobs)

def aggregate_event_delivery_status(statuses: list[str]) -> str:
    if not statuses:
        return EVENT_STATUS_FAILED
    has_success = "SUCCESS" in statuses
    has_failure = "FAILED" in statuses or "DEAD_LETTER" in statuses
    if has_success and has_failure:
        return "PARTIAL_SUCCESS"
    if "PENDING" in statuses or "RUNNING" in statuses:
        return EVENT_STATUS_DISPATCHED
    if all(status == "SUCCESS" for status in statuses):
        return EVENT_STATUS_COMPLETED
    if all(status == "DEAD_LETTER" for status in statuses):
        return EVENT_STATUS_DEAD_LETTER
    return EVENT_STATUS_FAILED


def _extract_batch_writer_result(execution, target_asset: str) -> dict | None:
    matches = []
    for value in (execution.context_summary or {}).values():
        extra = value.get("extra") if isinstance(value, dict) else None
        if isinstance(extra, dict) and extra.get("target_asset") == target_asset and extra.get("write_mode") == "period_full_snapshot":
            matches.append(extra)
    if len(matches) != 1 or not matches[0].get("period_value"):
        return None
    return matches[0]


_NON_RETRYABLE_INGEST_FAILURE_MARKERS = (
    "WarehouseIngestValidationError",
    "入仓明细不能为空",
    "字段映射不能为空",
    "字段映射必须",
    "字段白名单",
    "聚合校验失败",
    "按期间全量快照",
    "目标数据资产不存在或尚未发布",
    "目标数据资产物理表不可用",
    "写入模式仅支持",
    "业务主键",
    "重复业务主键",
)


def _is_retryable_pipeline_failure(error_message: str | None) -> bool:
    """Keep malformed ingest data out of the retry queue; retry operational failures."""
    message = error_message or ""
    return not any(marker in message for marker in _NON_RETRYABLE_INGEST_FAILURE_MARKERS)


async def _run_pipeline_in_background(
    *,
    pipeline_code: str,
    run_id: str,
    trace_id: str,
    event_payload: dict,
    run_as_type: str,
    service_account_code: str | None,
    event_db_id: int,
    event_id: str,
    trigger_code: str,
    delivery_id: int | None,
) -> None:
    """后台执行并把实际运行结果回写到事件派发记录。"""
    from app.core.db import get_session_factory
    from app.ucp.pipeline_engine import execute_pipeline
    from app.ucp.warehouse_ingest_service import (
        get_ingest_batch_for_event,
        mark_ingest_batch_failed,
        mark_ingest_batch_processing,
        mark_ingest_batch_succeeded,
    )

    try:
        async with get_session_factory()() as bg_db:
            event_record = await bg_db.get(UcpEvent, event_db_id)
            if event_record is None:
                return
            if delivery_id is not None:
                delivery = await bg_db.get(UcpEventDelivery, delivery_id)
                if delivery is not None:
                    delivery.status = "RUNNING"
                    delivery.started_at = getattr(delivery, "started_at", None) or datetime.now(timezone.utc)
                    delivery.heartbeat_at = datetime.now(timezone.utc)
                    await bg_db.commit()
            batch = await get_ingest_batch_for_event(
                bg_db, resource_id=event_record.resource_id, event_id=event_id
            )
            pipeline = await bg_db.scalar(
                select(UcpPipelineConfig).where(UcpPipelineConfig.pipeline_code == pipeline_code)
            )
            is_batch_writer = batch is not None and any(
                step.get("type") == "WAREHOUSE_ASSET_SINK"
                and step.get("target_asset") == batch.target_asset
                for step in (pipeline.steps if pipeline else [])
            )
            if is_batch_writer:
                mark_ingest_batch_processing(batch, run_id)
                await bg_db.commit()

            trigger_payload = {
                "trigger_type": "event",
                "run_id": run_id,
                "trace_id": trace_id,
                "event_id": event_id,
                "trigger_code": trigger_code,
                "event": event_payload,
                "ucp_event": {
                    "resource_id": event_record.resource_id,
                    "event_id": event_id,
                    "trace_id": trace_id,
                },
                "run_as_type": run_as_type,
                "service_account_code": service_account_code,
            }
            execution = await execute_pipeline(
                pipeline_code=pipeline_code,
                db=bg_db,
                trigger_type="event",
                trigger_payload=trigger_payload,
                pipeline_run_id=run_id,
                trace_id=trace_id,
                defer_commit=True,
            )
            success = execution.status == "SUCCESS"
            writer_result = _extract_batch_writer_result(execution, batch.target_asset) if is_batch_writer else None
            if is_batch_writer and (not success or writer_result is None):
                await bg_db.rollback()
                event_record = await bg_db.get(UcpEvent, event_db_id)
                if event_record is None:
                    return
                batch = await get_ingest_batch_for_event(
                    bg_db, resource_id=event_record.resource_id, event_id=event_id
                )
                if batch is None:
                    return
                success = False
            delivery = await bg_db.get(UcpEventDelivery, delivery_id) if delivery_id is not None else None
            if delivery is not None:
                from app.ucp.event_reliability import mark_delivery_failed, mark_delivery_success
                if success:
                    await mark_delivery_success(bg_db, delivery)
                else:
                    retryable = _is_retryable_pipeline_failure(execution.error_message)
                    await mark_delivery_failed(
                        bg_db,
                        delivery,
                        error_code="PIPELINE_EXECUTION_FAILED",
                        error_message=execution.error_message or f"Pipeline run {run_id} ended with {execution.status}",
                        retryable=retryable,
                    )

            event = await bg_db.get(UcpEvent, event_db_id)
            if event is not None:
                delivery_statuses = list((await bg_db.execute(
                    select(UcpEventDelivery.status).where(UcpEventDelivery.event_id == event_db_id)
                )).scalars())
                event.status = aggregate_event_delivery_status(delivery_statuses)
                if event.status == EVENT_STATUS_COMPLETED:
                    event.completed_at = datetime.now(timezone.utc)
                elif event.status in {EVENT_STATUS_FAILED, EVENT_STATUS_DEAD_LETTER}:
                    event.error_code = "PIPELINE_EXECUTION_FAILED"
                    event.error_message = execution.error_message or f"Pipeline run {run_id} ended with {execution.status}"

            asset_change_payload: dict | None = None
            asset_change_batch: tuple[str, str, int] | None = None
            if is_batch_writer and not success:
                dead_letter = delivery is not None and delivery.status == "DEAD_LETTER"
                mark_ingest_batch_failed(
                    batch,
                    execution.error_message or f"Pipeline run {run_id} ended with {execution.status}",
                    dead_letter=dead_letter,
                )
            elif is_batch_writer and writer_result is not None:
                written_rows = int(writer_result["written_count"])
                period_value = writer_result.get("period_value")
                if period_value is not None:
                    batch.period_value = str(period_value)
                mark_ingest_batch_succeeded(batch, written_rows)
                asset_change_batch = (batch.target_asset, batch.batch_id, written_rows)
                asset_change_payload = {
                    "trigger_type": "ods_table_data_changed",
                    "table_name": batch.target_asset,
                    "source": "ucp_webhook_ingest",
                    "change_type": "period_full_snapshot",
                    "affected_row_count": written_rows,
                    "upload_batch_id": batch.batch_id,
                    "source_run_id": run_id,
                    "trace_id": trace_id,
                    "period_value": batch.period_value,
                }
                from app.ucp.outbox_service import enqueue_asset_change
                await enqueue_asset_change(
                    bg_db,
                    dedup_key=f"warehouse:{event_record.resource_id}:{batch.target_asset}:{batch.batch_id}",
                    payload=asset_change_payload,
                )
            await bg_db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "background pipeline failed: pipeline=%s run_id=%s",
            pipeline_code, run_id,
        )
        try:
            async with get_session_factory()() as recovery_db:
                from app.ucp.event_reliability import mark_delivery_failed
                from app.ucp.warehouse_ingest_service import get_ingest_batch_for_event, mark_ingest_batch_failed

                delivery = await recovery_db.get(UcpEventDelivery, delivery_id) if delivery_id is not None else None
                if delivery is not None:
                    await mark_delivery_failed(
                        recovery_db,
                        delivery,
                        error_code="PIPELINE_EXECUTION_EXCEPTION",
                        error_message=str(exc),
                        retryable=_is_retryable_pipeline_failure(str(exc)),
                    )
                event = await recovery_db.get(UcpEvent, event_db_id)
                if event is not None:
                    batch = await get_ingest_batch_for_event(
                        recovery_db, resource_id=event.resource_id, event_id=event_id
                    )
                    dead_letter = delivery is not None and delivery.status == "DEAD_LETTER"
                    event.status = EVENT_STATUS_DEAD_LETTER if dead_letter else EVENT_STATUS_FAILED
                    event.error_code = "PIPELINE_EXECUTION_EXCEPTION"
                    event.error_message = str(exc)[:1000]
                    if batch is not None:
                        mark_ingest_batch_failed(batch, str(exc), dead_letter=dead_letter)
                await recovery_db.commit()
        except Exception:  # noqa: BLE001
            logger.exception("failed to persist background pipeline failure: run_id=%s", run_id)


async def process_event_pipeline(
    db: AsyncSession,
    event: UcpEvent,
) -> UcpEvent:
    """事件处理流水线：匹配 → 派发 → 标记完成。

    顶层入口：receive_event 后调用此函数即可走完事件 → pipeline 的全链路。
    无匹配触发器时，状态置为 NO_MATCH（不视为失败）。
    """
    triggers = _restrict_cost_allocation_triggers(event, await match_triggers(db, event))
    if not triggers:
        event.status = EVENT_STATUS_NO_MATCH
        event.dispatched_at = datetime.now(timezone.utc)
        await db.flush()
        return event

    event.status = EVENT_STATUS_MATCHED
    await db.flush()

    # 多个触发器串行派发（不并行，避免 pipeline 锁冲突）。
    # 单个触发器失败不得阻断其它匹配触发器。
    dispatch_errors: list[EventBusError] = []
    for trig in triggers:
        if getattr(trig, "source_resource_object_id", None) is not None and getattr(event, "resource_object_id", None) != trig.source_resource_object_id:
            continue
        try:
            await dispatch_event(db, event, trig)
        except EventBusError as e:
            logger.warning("dispatch failed: %s (%s)", e.message, e.code)
            dispatch_errors.append(e)
    if dispatch_errors and len(dispatch_errors) == len(triggers):
        event.status = EVENT_STATUS_FAILED
        event.error_code = dispatch_errors[0].code
        event.error_message = dispatch_errors[0].message
        await db.flush()
    else:
        event.status = EVENT_STATUS_DISPATCHED
        await db.flush()
    return event


# ============================================================
# 状态查询
# ============================================================
@dataclass(slots=True)
class EventListFilter:
    source: str | None = None
    event_type: str | None = None
    status: str | None = None
    trigger_code: str | None = None
    limit: int = 50
    offset: int = 0
    start_time: datetime | None = None
    end_time: datetime | None = None


async def list_events(db: AsyncSession, flt: EventListFilter) -> tuple[list[UcpEvent], int]:
    """查询事件列表 + 总数。"""
    stmt = select(UcpEvent)
    if flt.source:
        stmt = stmt.where(UcpEvent.source == flt.source)
    if flt.event_type:
        stmt = stmt.where(UcpEvent.event_type == flt.event_type)
    if flt.status:
        stmt = stmt.where(UcpEvent.status == flt.status)
    if flt.trigger_code:
        stmt = stmt.where(UcpEvent.matched_trigger_code == flt.trigger_code)
    if flt.start_time:
        stmt = stmt.where(UcpEvent.received_at >= flt.start_time)
    if flt.end_time:
        stmt = stmt.where(UcpEvent.received_at <= flt.end_time)

    # 总数（独立查询，无 limit/offset）
    from sqlalchemy import func
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one() or 0

    # 列表
    list_stmt = stmt.order_by(desc(UcpEvent.received_at)).limit(flt.limit).offset(flt.offset)
    items = (await db.execute(list_stmt)).scalars().all()
    return list(items), int(total)


async def get_event(db: AsyncSession, event_id: int | str) -> UcpEvent | None:
    """按 id 或 event_id 查询。"""
    if isinstance(event_id, int) or (isinstance(event_id, str) and event_id.isdigit()):
        return (
            await db.execute(select(UcpEvent).where(UcpEvent.id == int(event_id)))
        ).scalar_one_or_none()
    return (
        await db.execute(select(UcpEvent).where(UcpEvent.event_id == event_id))
    ).scalar_one_or_none()


# ============================================================
# 触发器 CRUD
# ============================================================
async def list_triggers(
    db: AsyncSession,
    *,
    is_active: int | None = None,
    event_source: str | None = None,
    limit: int = 100,
) -> list[UcpEventTrigger]:
    stmt = select(UcpEventTrigger)
    if is_active is not None:
        stmt = stmt.where(UcpEventTrigger.is_active == is_active)
    if event_source:
        stmt = stmt.where(UcpEventTrigger.event_source == event_source)
    stmt = stmt.order_by(desc(UcpEventTrigger.id)).limit(limit)
    return list((await db.execute(stmt)).scalars().all())


async def get_trigger(db: AsyncSession, trigger_id: int | str) -> UcpEventTrigger | None:
    if isinstance(trigger_id, int) or (isinstance(trigger_id, str) and trigger_id.isdigit()):
        return (
            await db.execute(
                select(UcpEventTrigger).where(UcpEventTrigger.id == int(trigger_id))
            )
        ).scalar_one_or_none()
    return (
        await db.execute(
            select(UcpEventTrigger).where(
                UcpEventTrigger.trigger_code == trigger_id,
            )
        )
    ).scalar_one_or_none()


# ============================================================
# Webhook path 反查
# ============================================================
async def get_trigger_by_webhook_path(
    db: AsyncSession, webhook_path: str
) -> UcpEventTrigger | None:
    return (
        await db.execute(
            select(UcpEventTrigger).where(
                UcpEventTrigger.webhook_path == webhook_path,
                UcpEventTrigger.is_active == 1,
            )
        )
    ).scalar_one_or_none()
