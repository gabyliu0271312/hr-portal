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

from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import ConnectorEventTrigger, ConnectorPipelineConfig, UcpEvent


logger = logging.getLogger("ucp.event_bus")


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
        event_type=event_type,
        source=source,
        trigger=trigger,
        payload=payload or {},
        metadata_=metadata,
        status=EVENT_STATUS_RECEIVED,
        trace_id=_gen_trace_id(),
        event_timestamp=event_timestamp,
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
) -> list[ConnectorEventTrigger]:
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
    stmt = select(ConnectorEventTrigger).where(
        and_(
            ConnectorEventTrigger.is_active == 1,
            ConnectorEventTrigger.event_source == event.source,
        )
    )
    triggers = (await db.execute(stmt)).scalars().all()

    matched: list[ConnectorEventTrigger] = []
    for trig in triggers:
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
    trigger: ConnectorEventTrigger,
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
            select(ConnectorPipelineConfig).where(
                ConnectorPipelineConfig.pipeline_code == trigger.pipeline_code,
            )
        )
    ).scalar_one_or_none()
    if pl is None:
        raise EventBusError("PIPELINE_NOT_FOUND", f"pipeline '{trigger.pipeline_code}' 不存在")

    # 延迟导入，避免循环
    from app.ucp.pipeline_engine import execute_pipeline

    # 派发（异步，不 await pipeline 内部完整执行 —— 实际策略：fire-and-forget task）
    run_id = f"run_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    event.matched_trigger_id = trigger.id
    event.matched_trigger_code = trigger.trigger_code
    event.pipeline_run_id = run_id
    event.status = EVENT_STATUS_DISPATCHED
    event.dispatched_at = datetime.now(timezone.utc)
    await db.flush()

    # Phase 3-3: 写一条派发尝试记录（用于重试/死信）
    try:
        from app.ucp.event_reliability import create_delivery_record
        await create_delivery_record(
            db,
            event=event,
            trigger=trigger,
            pipeline_run_id=run_id,
            trigger_source="AUTO",
        )
    except Exception:  # noqa: BLE001
        logger.exception("create_delivery_record failed (non-fatal)")

    # 后台执行（不阻塞事件接收）
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

    logger.info(
        "event dispatched: event_id=%s trigger=%s pipeline=%s run_id=%s",
        event.event_id, trigger.trigger_code, trigger.pipeline_code, run_id,
    )
    return run_id


async def _run_pipeline_in_background(
    *,
    pipeline_code: str,
    run_id: str,
    trace_id: str,
    event_payload: dict,
    run_as_type: str,
    service_account_code: str | None,
) -> None:
    """后台 fire-and-forget 执行 pipeline。错误仅记日志（不抛回事件总线）。"""
    from app.core.database import async_session_factory  # type: ignore
    from app.ucp.pipeline_engine import execute_pipeline

    try:
        async with async_session_factory()() as bg_db:
            # 构造 trigger_payload —— 透传事件数据
            trigger_payload = {
                "trigger_type": "event",
                "run_id": run_id,
                "trace_id": trace_id,
                "event": event_payload,
                "run_as_type": run_as_type,
                "service_account_code": service_account_code,
            }
            await execute_pipeline(
                pipeline_code=pipeline_code,
                db=bg_db,
                trigger_type="event",
                trigger_payload=trigger_payload,
            )
    except Exception:  # noqa: BLE001
        logger.exception(
            "background pipeline failed: pipeline=%s run_id=%s",
            pipeline_code, run_id,
        )


async def process_event_pipeline(
    db: AsyncSession,
    event: UcpEvent,
) -> UcpEvent:
    """事件处理流水线：匹配 → 派发 → 标记完成。

    顶层入口：receive_event 后调用此函数即可走完事件 → pipeline 的全链路。
    无匹配触发器时，状态置为 NO_MATCH（不视为失败）。
    """
    triggers = await match_triggers(db, event)
    if not triggers:
        event.status = EVENT_STATUS_NO_MATCH
        event.dispatched_at = datetime.now(timezone.utc)
        await db.flush()
        return event

    event.status = EVENT_STATUS_MATCHED
    await db.flush()

    # 多个触发器串行派发（不并行，避免 pipeline 锁冲突）
    for trig in triggers:
        try:
            await dispatch_event(db, event, trig)
        except EventBusError as e:
            logger.warning("dispatch failed: %s (%s)", e.message, e.code)
            event.status = EVENT_STATUS_FAILED
            event.error_code = e.code
            event.error_message = e.message
            await db.flush()
            break  # 同一事件触发多个 trigger 时，第一个失败就停止后续
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
) -> list[ConnectorEventTrigger]:
    stmt = select(ConnectorEventTrigger)
    if is_active is not None:
        stmt = stmt.where(ConnectorEventTrigger.is_active == is_active)
    if event_source:
        stmt = stmt.where(ConnectorEventTrigger.event_source == event_source)
    stmt = stmt.order_by(desc(ConnectorEventTrigger.id)).limit(limit)
    return list((await db.execute(stmt)).scalars().all())


async def get_trigger(db: AsyncSession, trigger_id: int | str) -> ConnectorEventTrigger | None:
    if isinstance(trigger_id, int) or (isinstance(trigger_id, str) and trigger_id.isdigit()):
        return (
            await db.execute(
                select(ConnectorEventTrigger).where(ConnectorEventTrigger.id == int(trigger_id))
            )
        ).scalar_one_or_none()
    return (
        await db.execute(
            select(ConnectorEventTrigger).where(
                ConnectorEventTrigger.trigger_code == trigger_id,
            )
        )
    ).scalar_one_or_none()


# ============================================================
# Webhook path 反查
# ============================================================
async def get_trigger_by_webhook_path(
    db: AsyncSession, webhook_path: str
) -> ConnectorEventTrigger | None:
    return (
        await db.execute(
            select(ConnectorEventTrigger).where(
                ConnectorEventTrigger.webhook_path == webhook_path,
                ConnectorEventTrigger.is_active == 1,
            )
        )
    ).scalar_one_or_none()
