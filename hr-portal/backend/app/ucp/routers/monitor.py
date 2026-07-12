"""UCP 监控仪表盘 / 告警规则 / SLA 路由"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_user, require_op
from app.core.db import get_session
from app.users.models import User
from app.ucp.models import (
    UcpAlertRule,
    UcpAlertLog,
    UcpSlaConfig,
    UcpSlaRecord,
)
from app.ucp.monitor_service import (
    get_summary,
    get_trend,
    get_status_distribution,
    get_recent_runs,
    get_alerts,
    get_pipeline_stats,
)
from app.ucp.sla_service import (
    list_sla_configs,
    create_sla_config,
    update_sla_config,
    delete_sla_config,
    calculate_sla_record,
    list_sla_records,
    list_sla_dashboard,
    _serialize_sla,
)

logger = logging.getLogger("ucp.routers.monitor")
router = APIRouter()


# ── Monitor Dashboard ──

@router.get("/monitor/summary")
async def route_monitor_summary(
    hours: int = Query(24, ge=1, le=720),
    system_id: int | None = Query(None),
    resource_id: int | None = Query(None),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.monitor", "V")),
):
    return await get_summary(db, hours=hours, system_id=system_id, resource_id=resource_id)


@router.get("/monitor/trend")
async def route_monitor_trend(
    hours: int = Query(24, ge=1, le=720),
    bucket: str = Query("hour"),
    system_id: int | None = Query(None),
    resource_id: int | None = Query(None),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.monitor", "V")),
):
    items = await get_trend(db, hours=hours, bucket=bucket, system_id=system_id, resource_id=resource_id)
    return {"items": items, "bucket": bucket, "hours": hours}


@router.get("/monitor/status-distribution")
async def route_monitor_status_distribution(
    hours: int = Query(24, ge=1, le=720),
    system_id: int | None = Query(None),
    resource_id: int | None = Query(None),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.monitor", "V")),
):
    distribution = await get_status_distribution(db, hours=hours, system_id=system_id, resource_id=resource_id)
    return {"distribution": distribution}


@router.get("/monitor/recent-runs")
async def route_monitor_recent_runs(
    limit: int = Query(20, ge=1, le=100),
    system_id: int | None = Query(None),
    resource_id: int | None = Query(None),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.monitor", "V")),
):
    items = await get_recent_runs(db, limit=limit, system_id=system_id, resource_id=resource_id)
    return {"items": items}


@router.get("/monitor/alerts")
async def route_monitor_alerts(
    limit: int = Query(50, ge=1, le=200),
    system_id: int | None = Query(None),
    resource_id: int | None = Query(None),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.monitor", "V")),
):
    items = await get_alerts(db, limit=limit, system_id=system_id, resource_id=resource_id)
    return {"items": items}


@router.get("/monitor/pipeline-stats")
async def route_monitor_pipeline_stats(
    hours: int = Query(24, ge=1, le=720),
    limit: int = Query(10, ge=1, le=50),
    system_id: int | None = Query(None),
    resource_id: int | None = Query(None),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.monitor", "V")),
):
    items = await get_pipeline_stats(db, hours=hours, limit=limit, system_id=system_id, resource_id=resource_id)
    return {"items": items}


# ── Alert Rules ──

@router.get("/alert-rules")
async def route_list_alert_rules(
    rule_type: str | None = Query(None),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.monitor", "V")),
):
    stmt = select(UcpAlertRule).order_by(UcpAlertRule.id)
    if rule_type:
        stmt = stmt.where(UcpAlertRule.rule_type == rule_type)
    items = (await db.execute(stmt)).scalars().all()
    result = []
    for r in items:
        result.append({
            "id": r.id,
            "rule_code": r.rule_code,
            "rule_name": r.rule_name,
            "rule_type": r.rule_type,
            "threshold_value": r.threshold_value,
            "threshold_unit": r.threshold_unit,
            "target_filter": r.target_filter,
            "is_active": r.is_active,
            "notify_channels": r.notify_channels,
            "notify_receivers": r.notify_receivers,
            "cooldown_minutes": r.cooldown_minutes,
            "description": r.description,
            "created_by": r.created_by,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        })
    return {"items": result, "total": len(result)}


@router.post("/alert-rules")
async def route_create_alert_rule(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.monitor", "C")),
):
    rule = UcpAlertRule(
        rule_code=payload["rule_code"],
        rule_name=payload["rule_name"],
        rule_type=payload["rule_type"],
        threshold_value=payload["threshold_value"],
        threshold_unit=payload.get("threshold_unit"),
        target_filter=payload.get("target_filter"),
        notify_channels=payload.get("notify_channels"),
        notify_receivers=payload.get("notify_receivers"),
        cooldown_minutes=payload.get("cooldown_minutes", 60),
        description=payload.get("description"),
        created_by=user.username,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {
        "id": rule.id,
        "rule_code": rule.rule_code,
        "rule_name": rule.rule_name,
        "rule_type": rule.rule_type,
        "threshold_value": rule.threshold_value,
        "threshold_unit": rule.threshold_unit,
        "target_filter": rule.target_filter,
        "is_active": rule.is_active,
        "notify_channels": rule.notify_channels,
        "notify_receivers": rule.notify_receivers,
        "cooldown_minutes": rule.cooldown_minutes,
        "description": rule.description,
        "created_by": rule.created_by,
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
        "updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
    }


@router.patch("/alert-rules/{rule_id}")
async def route_update_alert_rule(
    rule_id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.monitor", "U")),
):
    rule = await db.get(UcpAlertRule, rule_id)
    if not rule:
        raise HTTPException(404, "告警规则不存在")
    for k, v in payload.items():
        if hasattr(rule, k):
            setattr(rule, k, v)
    await db.commit()
    await db.refresh(rule)
    return {
        "id": rule.id,
        "rule_code": rule.rule_code,
        "rule_name": rule.rule_name,
        "rule_type": rule.rule_type,
        "threshold_value": rule.threshold_value,
        "threshold_unit": rule.threshold_unit,
        "target_filter": rule.target_filter,
        "is_active": rule.is_active,
        "notify_channels": rule.notify_channels,
        "notify_receivers": rule.notify_receivers,
        "cooldown_minutes": rule.cooldown_minutes,
        "description": rule.description,
        "created_by": rule.created_by,
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
        "updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
    }


@router.delete("/alert-rules/{rule_id}")
async def route_delete_alert_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.monitor", "D")),
):
    rule = await db.get(UcpAlertRule, rule_id)
    if not rule:
        raise HTTPException(404, "告警规则不存在")
    await db.delete(rule)
    await db.commit()
    return {"deleted": True}


@router.get("/alert-logs")
async def route_list_alert_logs(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.monitor", "V")),
):
    stmt = select(UcpAlertLog).order_by(UcpAlertLog.created_at.desc()).limit(limit)
    items = (await db.execute(stmt)).scalars().all()
    result = []
    for log in items:
        result.append({
            "id": log.id,
            "rule_id": log.rule_id,
            "rule_code": log.rule_code,
            "alert_level": log.alert_level,
            "alert_type": log.alert_type,
            "message": log.message,
            "ref_id": log.ref_id,
            "current_value": log.current_value,
            "threshold_value": log.threshold_value,
            "notify_status": log.notify_status,
            "resolved_at": log.resolved_at.isoformat() if log.resolved_at else None,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        })
    return {"items": result, "total": len(result)}


# ── SLA ──

@router.get("/sla/configs")
async def route_list_sla_configs(
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.monitor", "V")),
):
    items = await list_sla_configs(db)
    return {"items": items}


@router.post("/sla/configs")
async def route_create_sla_config(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.monitor", "C")),
):
    sla = await create_sla_config(
        db,
        sla_code=payload["sla_code"],
        sla_name=payload.get("sla_name"),
        target_type=payload["target_type"],
        target_id=payload["target_id"],
        success_rate_target=payload.get("success_rate_target"),
        p95_duration_ms_max=payload.get("p95_duration_ms_max"),
        p99_duration_ms_max=payload.get("p99_duration_ms_max"),
        recovery_time_minutes=payload.get("recovery_time_minutes"),
        hours=payload.get("hours", 24),
        created_by=user.username,
    )
    await db.commit()
    return _serialize_sla(sla)


@router.patch("/sla/configs/{sla_id}")
async def route_update_sla_config(
    sla_id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.monitor", "U")),
):
    sla = await update_sla_config(db, sla_id, **payload)
    await db.commit()
    return sla


@router.delete("/sla/configs/{sla_id}")
async def route_delete_sla_config(
    sla_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.monitor", "D")),
):
    ok = await delete_sla_config(db, sla_id)
    if not ok:
        raise HTTPException(404, "SLA配置不存在")
    return {"deleted": True}


@router.post("/sla/configs/{sla_id}/calculate")
async def route_calculate_sla(
    sla_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.monitor", "U")),
):
    record = await calculate_sla_record(db, sla_id)
    if not record:
        raise HTTPException(404, "SLA配置不存在或无数据")
    await db.commit()
    return record


@router.get("/sla/configs/{sla_id}/records")
async def route_list_sla_records(
    sla_id: int,
    limit: int = Query(30, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.monitor", "V")),
):
    items = await list_sla_records(db, sla_id, limit=limit)
    return {"items": items}


@router.get("/sla/dashboard")
async def route_sla_dashboard(
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.monitor", "V")),
):
    return await list_sla_dashboard(db)
