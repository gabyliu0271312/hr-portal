"""Phase 3-9: 运行监控 Dashboard 数据聚合

Phase 5-3 增强: 全部查询支持 system_id / resource_id 过滤.

复用现有表:
- connector_pipeline_execution: pipeline 执行
- ucp_event: 事件
- ucp_event_delivery: 事件 delivery (含死信)
- oa_sync_run: OA 同步批次
- external_account_audit: 外部账号操作

API:
- get_summary: 今日统计卡片 (总执行/成功/失败/失败率/死信/待审批)
- get_trend: 趋势 (按小时/天)
- get_status_distribution: 状态分布 (饼图)
- get_recent_runs: 最近执行列表
- get_alerts: 告警列表 (死信/失败率/超长耗时)
- get_pipeline_stats: Top pipeline
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, func, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import (
    ConnectorPipelineExecution,
    UcpEvent,
    UcpEventDelivery,
    OaSyncRun,
    ExternalAccountAudit,
    ApprovalRequest,
)


def _execution_filters(
    hours: int,
    system_id: int | None,
    resource_id: int | None,
):
    """构造 connector_pipeline_execution 的时间+资源过滤条件."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    conds = [ConnectorPipelineExecution.created_at >= since]
    if resource_id is not None:
        conds.append(ConnectorPipelineExecution.resource_id == resource_id)
    elif system_id is not None:
        conds.append(ConnectorPipelineExecution.system_id == system_id)
    return conds


def _event_filters(
    hours: int,
    system_id: int | None,
    resource_id: int | None,
):
    """构造 ucp_event 的时间+资源过滤条件.

    事件表只有 resource_id 和 system_code (字符串), 优先级 resource > system.
    system_id→code 转换由调用方在 service 上层完成.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    conds = [UcpEvent.received_at >= since]
    if resource_id is not None:
        conds.append(UcpEvent.resource_id == resource_id)
    elif system_id is not None:
        # 调用方应传 system_code 而非 system_id; 这里接受 system_id 也尝试匹配
        conds.append(UcpEvent.system_code == f"sys:{system_id}")
    return conds


# ===== Summary =====


async def get_summary(
    db: AsyncSession,
    *,
    hours: int = 24,
    system_id: int | None = None,
    resource_id: int | None = None,
) -> dict:
    """统计过去 hours 小时的关键指标 (支持 system/resource 过滤)."""
    exec_conds = _execution_filters(hours, system_id, resource_id)
    base_filter = and_(*exec_conds)

    # Pipeline 总数 / 成功 / 部分成功 / 失败
    total = (await db.execute(
        select(func.count(ConnectorPipelineExecution.id)).where(base_filter)
    )).scalar_one()
    success = (await db.execute(
        select(func.count(ConnectorPipelineExecution.id)).where(
            base_filter, ConnectorPipelineExecution.status == "SUCCESS"
        )
    )).scalar_one()
    partial = (await db.execute(
        select(func.count(ConnectorPipelineExecution.id)).where(
            base_filter, ConnectorPipelineExecution.status == "PARTIAL_SUCCESS"
        )
    )).scalar_one()
    failed = (await db.execute(
        select(func.count(ConnectorPipelineExecution.id)).where(
            base_filter, ConnectorPipelineExecution.status == "FAILED"
        )
    )).scalar_one()
    running = (await db.execute(
        select(func.count(ConnectorPipelineExecution.id)).where(
            base_filter, ConnectorPipelineExecution.status == "RUNNING"
        )
    )).scalar_one()

    # 平均耗时 (ms)
    avg_duration = (await db.execute(
        select(func.avg(ConnectorPipelineExecution.duration_ms)).where(
            base_filter, ConnectorPipelineExecution.duration_ms.isnot(None)
        )
    )).scalar_one()
    avg_duration_ms = int(avg_duration) if avg_duration is not None else 0

    # 失败率
    fail_rate = round(failed / total * 100, 2) if total > 0 else 0.0

    # 事件
    event_conds = _event_filters(hours, system_id, resource_id)
    event_filter = and_(*event_conds)
    events_total = (await db.execute(
        select(func.count(UcpEvent.id)).where(event_filter)
    )).scalar_one()
    events_failed = (await db.execute(
        select(func.count(UcpEvent.id)).where(
            event_filter,
            UcpEvent.status.in_(("FAILED", "DEAD_LETTER")),
        )
    )).scalar_one()

    # 死信 (无 system/resource 维度, 平台级)
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    dead_letters = (await db.execute(
        select(func.count(UcpEventDelivery.id)).where(
            UcpEventDelivery.status == "DEAD_LETTER",
            UcpEventDelivery.created_at >= since,
        )
    )).scalar_one()

    # 待审批 (平台级)
    pending_approvals = (await db.execute(
        select(func.count(ApprovalRequest.id)).where(
            ApprovalRequest.status.in_(("PENDING", "IN_PROGRESS"))
        )
    )).scalar_one()

    return {
        "window_hours": hours,
        "system_id": system_id,
        "resource_id": resource_id,
        "pipeline_total": int(total),
        "pipeline_success": int(success),
        "pipeline_partial": int(partial),
        "pipeline_failed": int(failed),
        "pipeline_running": int(running),
        "avg_duration_ms": avg_duration_ms,
        "fail_rate": fail_rate,
        "events_total": int(events_total),
        "events_failed": int(events_failed),
        "dead_letters": int(dead_letters),
        "pending_approvals": int(pending_approvals),
    }


# ===== Trend =====


async def get_trend(
    db: AsyncSession,
    *,
    hours: int = 24,
    bucket: str = "hour",
    system_id: int | None = None,
    resource_id: int | None = None,
) -> list[dict]:
    """按时间桶返回 (timestamp, total, success, failed, avg_duration_ms)."""
    if bucket not in ("hour", "day"):
        raise ValueError("bucket must be 'hour' or 'day'")

    conds = _execution_filters(hours, system_id, resource_id)
    rows = (await db.execute(
        select(
            ConnectorPipelineExecution.created_at,
            ConnectorPipelineExecution.status,
            ConnectorPipelineExecution.duration_ms,
        ).where(and_(*conds))
    )).all()

    buckets: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"total": 0, "success": 0, "failed": 0, "duration_sum": 0, "duration_count": 0}
    )

    for r in rows:
        if bucket == "hour":
            key = r.created_at.strftime("%Y-%m-%d %H:00")
        else:
            key = r.created_at.strftime("%Y-%m-%d")
        b = buckets[key]
        b["total"] += 1
        if r.status == "SUCCESS":
            b["success"] += 1
        elif r.status == "FAILED":
            b["failed"] += 1
        if r.duration_ms is not None:
            b["duration_sum"] += r.duration_ms
            b["duration_count"] += 1

    result = []
    for k in sorted(buckets.keys()):
        b = buckets[k]
        result.append({
            "bucket": k,
            "total": b["total"],
            "success": b["success"],
            "failed": b["failed"],
            "avg_duration_ms": int(b["duration_sum"] / b["duration_count"]) if b["duration_count"] > 0 else 0,
        })
    return result


# ===== Status Distribution =====


async def get_status_distribution(
    db: AsyncSession,
    *,
    hours: int = 24,
    system_id: int | None = None,
    resource_id: int | None = None,
) -> dict[str, int]:
    """状态分布 (饼图)."""
    conds = _execution_filters(hours, system_id, resource_id)
    rows = (await db.execute(
        select(ConnectorPipelineExecution.status, func.count(ConnectorPipelineExecution.id))
        .where(and_(*conds))
        .group_by(ConnectorPipelineExecution.status)
    )).all()
    return {s: int(c) for s, c in rows}


# ===== Recent Runs =====


async def get_recent_runs(
    db: AsyncSession,
    *,
    limit: int = 20,
    system_id: int | None = None,
    resource_id: int | None = None,
) -> list[dict]:
    """最近 N 次 pipeline 执行."""
    conds = _execution_filters(hours=24 * 30, system_id=system_id, resource_id=resource_id)
    rows = (await db.execute(
        select(ConnectorPipelineExecution)
        .where(and_(*conds))
        .order_by(desc(ConnectorPipelineExecution.created_at))
        .limit(limit)
    )).scalars().all()
    return [
        {
            "id": r.id,
            "pipeline_run_id": r.pipeline_run_id,
            "pipeline_code": r.pipeline_code,
            "resource_id": r.resource_id,
            "system_id": r.system_id,
            "status": r.status,
            "trigger_type": r.trigger_type,
            "triggered_by": r.triggered_by,
            "duration_ms": r.duration_ms,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        }
        for r in rows
    ]


# ===== Alerts =====


async def get_alerts(
    db: AsyncSession,
    *,
    limit: int = 50,
    system_id: int | None = None,
    resource_id: int | None = None,
) -> list[dict]:
    """告警列表 (支持 system/resource 过滤)."""
    alerts: list[dict] = []

    since = datetime.now(timezone.utc) - timedelta(hours=24)
    exec_conds = _execution_filters(hours=24, system_id=system_id, resource_id=resource_id)
    base_exec = and_(*exec_conds)

    # 1. 死信 (最近 24h) — 不加 system/resource 过滤, 死信是平台级信号
    dead_rows = (await db.execute(
        select(UcpEventDelivery, UcpEvent)
        .join(UcpEvent, UcpEventDelivery.event_id == UcpEvent.id)
        .where(
            UcpEventDelivery.status == "DEAD_LETTER",
            UcpEventDelivery.created_at >= since,
        )
        .order_by(desc(UcpEventDelivery.created_at))
        .limit(20)
    )).all()
    for delivery, event in dead_rows:
        alerts.append({
            "level": "CRITICAL",
            "type": "DEAD_LETTER",
            "message": f"事件 {event.event_id} 已达最大重试次数, 进入死信",
            "ref_id": event.event_id,
            "created_at": delivery.created_at.isoformat() if delivery.created_at else None,
        })

    # 2. 超时执行 (duration_ms > 300000 = 5 min)
    timeout_rows = (await db.execute(
        select(ConnectorPipelineExecution)
        .where(
            base_exec,
            ConnectorPipelineExecution.duration_ms > 300_000,
        )
        .order_by(desc(ConnectorPipelineExecution.created_at))
        .limit(20)
    )).scalars().all()
    for r in timeout_rows:
        alerts.append({
            "level": "WARN",
            "type": "TIMEOUT",
            "message": f"{r.pipeline_code} 执行耗时 {r.duration_ms // 1000}s",
            "ref_id": r.pipeline_run_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    # 3. 高失败率
    stats = (await db.execute(
        select(
            ConnectorPipelineExecution.pipeline_code,
            ConnectorPipelineExecution.status,
            func.count(ConnectorPipelineExecution.id),
        )
        .where(base_exec)
        .group_by(
            ConnectorPipelineExecution.pipeline_code,
            ConnectorPipelineExecution.status,
        )
    )).all()

    pipeline_stats: dict[str, dict[str, int]] = defaultdict(
        lambda: {"total": 0, "failed": 0}
    )
    for code, status, count in stats:
        pipeline_stats[code]["total"] += count
        if status == "FAILED":
            pipeline_stats[code]["failed"] += count

    for code, s in pipeline_stats.items():
        if s["total"] >= 3 and s["failed"] / s["total"] > 0.5:
            alerts.append({
                "level": "WARN",
                "type": "HIGH_FAIL_RATE",
                "message": f"{code} 失败率 {s['failed']}/{s['total']} = {round(s['failed']/s['total']*100, 1)}%",
                "ref_id": code,
                "created_at": None,
            })

    alerts.sort(
        key=lambda a: a.get("created_at") or "",
        reverse=True,
    )
    return alerts[:limit]


# ===== Pipeline Stats =====


async def get_pipeline_stats(
    db: AsyncSession,
    *,
    hours: int = 24,
    limit: int = 10,
    system_id: int | None = None,
    resource_id: int | None = None,
) -> list[dict]:
    """Top N pipeline (按执行次数, 支持 system/resource 过滤)."""
    conds = _execution_filters(hours, system_id, resource_id)
    rows = (await db.execute(
        select(
            ConnectorPipelineExecution.pipeline_code,
            ConnectorPipelineExecution.status,
            func.count(ConnectorPipelineExecution.id),
        )
        .where(and_(*conds))
        .group_by(
            ConnectorPipelineExecution.pipeline_code,
            ConnectorPipelineExecution.status,
        )
    )).all()

    stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"total": 0, "success": 0, "failed": 0}
    )
    for code, status, count in rows:
        stats[code]["total"] += count
        if status == "SUCCESS":
            stats[code]["success"] += count
        elif status == "FAILED":
            stats[code]["failed"] += count

    result = []
    for code, s in stats.items():
        s["pipeline_code"] = code
        s["fail_rate"] = round(s["failed"] / s["total"] * 100, 2) if s["total"] > 0 else 0
        result.append(s)
    result.sort(key=lambda x: x["total"], reverse=True)
    return result[:limit]
