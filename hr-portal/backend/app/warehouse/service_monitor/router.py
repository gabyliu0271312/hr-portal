# -*- coding: utf-8 -*-
"""服务监控 — 运行日志聚合查询

GET /service-monitor/stats  — 今日指标卡（API调用量/推送次数/订阅分发/失败数/异常服务数）
GET /service-monitor/runs  — 运行日志列表（支持筛选: 时间/服务类型/状态/来源/服务名）
GET /service-monitor/runs/{id} — 日志详情
"""
from __future__ import annotations

from datetime import datetime, UTC, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user
from app.users.models import User
from app.warehouse.service_monitor.models import ServiceRunLog

router = APIRouter(prefix="/service-monitor", tags=["service-monitor"])


# ════════════════════════════════════════════
# 指标卡
# ════════════════════════════════════════════

@router.get("/stats")
async def get_service_stats(
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """今日指标卡数据。"""
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)

    # 今日各类调用量
    counts = {}
    for svc_type in ("api", "push", "subscription", "ads_publish"):
        row = await db.execute(
            select(func.count(ServiceRunLog.id)).where(
                ServiceRunLog.service_type == svc_type,
                ServiceRunLog.created_at >= today_start,
            )
        )
        counts[f"today_{svc_type}"] = row.scalar_one()

    # 今日失败数
    fail_row = await db.execute(
        select(func.count(ServiceRunLog.id)).where(
            ServiceRunLog.status == "failed",
            ServiceRunLog.created_at >= today_start,
        )
    )
    today_failed = fail_row.scalar_one()

    # 异常服务数（近期有失败记录且状态非 disabled 的服务）
    # 聚合 service_type + service_id 去重
    abnormal_row = await db.execute(
        select(func.count(func.distinct(
            func.concat(ServiceRunLog.service_type, ":", func.cast(ServiceRunLog.service_id, type_=func.text("VARCHAR")))
        ))).where(
            ServiceRunLog.status == "failed",
            ServiceRunLog.created_at >= today_start - timedelta(days=1),
        )
    )
    abnormal_services = abnormal_row.scalar_one()

    return {
        "today_api": counts["today_api"],
        "today_push": counts["today_push"],
        "today_subscription": counts["today_subscription"],
        "today_ads_publish": counts["today_ads_publish"],
        "today_failed": today_failed,
        "abnormal_services": abnormal_services,
    }


# ════════════════════════════════════════════
# 运行日志列表
# ════════════════════════════════════════════

@router.get("/runs")
async def list_service_runs(
    service_type: str | None = Query(None),
    status: str | None = Query(None),
    source_type: str | None = Query(None),
    service_name: str | None = Query(None),
    triggered_by: str | None = Query(None),
    hours: int = Query(24, ge=1, le=168),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """运行日志列表，支持多维度筛选。"""
    since = datetime.now(UTC) - timedelta(hours=hours)

    stmt = select(ServiceRunLog).where(ServiceRunLog.created_at >= since)

    if service_type:
        stmt = stmt.where(ServiceRunLog.service_type == service_type)
    if status:
        stmt = stmt.where(ServiceRunLog.status == status)
    if source_type:
        stmt = stmt.where(ServiceRunLog.source_type == source_type)
    if service_name:
        stmt = stmt.where(ServiceRunLog.service_name.ilike(f"%{service_name}%"))
    if triggered_by:
        stmt = stmt.where(ServiceRunLog.triggered_by == triggered_by)

    # 总数
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    # 分页
    stmt = stmt.order_by(desc(ServiceRunLog.created_at))
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": r.id,
                "service_type": r.service_type,
                "service_id": r.service_id,
                "service_name": r.service_name,
                "source_type": r.source_type,
                "source_id": r.source_id,
                "status": r.status,
                "rows": r.rows,
                "message": r.message,
                "duration_ms": r.duration_ms,
                "upstream_failure": r.upstream_failure,
                "governance_run_id": r.governance_run_id,
                "triggered_by": r.triggered_by,
                "caller_ip": r.caller_ip,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ],
    }


@router.get("/runs/{run_id}")
async def get_service_run_detail(
    run_id: int,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    r = await db.get(ServiceRunLog, run_id)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="日志不存在")
    return {
        "id": r.id,
        "service_type": r.service_type,
        "service_id": r.service_id,
        "service_name": r.service_name,
        "source_type": r.source_type,
        "source_id": r.source_id,
        "status": r.status,
        "rows": r.rows,
        "message": r.message,
        "duration_ms": r.duration_ms,
        "upstream_failure": r.upstream_failure,
        "governance_run_id": r.governance_run_id,
        "triggered_by": r.triggered_by,
        "caller_ip": r.caller_ip,
        "created_at": r.created_at.isoformat(),
    }


# ════════════════════════════════════════════
# 日志写入（供其他模块调用）
# ════════════════════════════════════════════

async def write_service_log(
    db: AsyncSession,
    *,
    service_type: str,
    service_id: int | None = None,
    service_name: str | None = None,
    source_type: str | None = None,
    source_id: str | None = None,
    status: str = "success",
    rows: int | None = None,
    message: str | None = None,
    duration_ms: int | None = None,
    triggered_by: str | None = None,
    caller_ip: str | None = None,
    upstream_failure: bool = False,
    governance_run_id: int | None = None,
) -> ServiceRunLog:
    log = ServiceRunLog(
        service_type=service_type,
        service_id=service_id,
        service_name=service_name,
        source_type=source_type,
        source_id=source_id,
        status=status,
        rows=rows,
        message=message,
        duration_ms=duration_ms,
        triggered_by=triggered_by,
        caller_ip=caller_ip,
        upstream_failure=upstream_failure,
        governance_run_id=governance_run_id,
    )
    db.add(log)
    return log
