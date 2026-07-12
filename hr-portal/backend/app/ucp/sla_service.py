"""Phase 6-C: SLA 管理服务。

SLA 配置、达标计算、评分。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import (
    UcpSlaConfig, UcpSlaRecord,
    UcpPipelineExecution, UcpPipelineStepExecution,
)


async def list_sla_configs(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(select(UcpSlaConfig))).scalars().all()
    return [_serialize_sla(r) for r in rows]


async def create_sla_config(
    db: AsyncSession,
    sla_code: str, sla_name: str | None,
    target_type: str, target_id: int,
    success_rate_target: float | None = None,
    p95_duration_ms_max: int | None = None,
    p99_duration_ms_max: int | None = None,
    recovery_time_minutes: int | None = None,
    window_hours: int = 24,
    created_by: str | None = None,
) -> dict:
    existing = (await db.execute(
        select(UcpSlaConfig).where(UcpSlaConfig.sla_code == sla_code)
    )).scalar_one_or_none()
    if existing:
        raise ValueError(f"SLA '{sla_code}' 已存在")

    sla = UcpSlaConfig(
        sla_code=sla_code, sla_name=sla_name,
        target_type=target_type, target_id=target_id,
        success_rate_target=success_rate_target,
        p95_duration_ms_max=p95_duration_ms_max,
        p99_duration_ms_max=p99_duration_ms_max,
        recovery_time_minutes=recovery_time_minutes,
        window_hours=window_hours,
        created_by=created_by,
    )
    db.add(sla)
    await db.flush()
    return _serialize_sla(sla)


async def update_sla_config(db: AsyncSession, sla_id: int, **fields) -> dict:
    sla = await db.get(UcpSlaConfig, sla_id)
    if not sla:
        raise ValueError(f"SLA #{sla_id} 不存在")
    allowed = {"sla_name", "success_rate_target", "p95_duration_ms_max",
               "p99_duration_ms_max", "recovery_time_minutes", "window_hours", "is_active"}
    for k, v in fields.items():
        if k in allowed and hasattr(sla, k):
            setattr(sla, k, v)
    await db.flush()
    return _serialize_sla(sla)


async def delete_sla_config(db: AsyncSession, sla_id: int) -> bool:
    sla = await db.get(UcpSlaConfig, sla_id)
    if not sla:
        raise ValueError(f"SLA #{sla_id} 不存在")
    await db.delete(sla)
    return True


async def calculate_sla_record(db: AsyncSession, sla_id: int) -> dict | None:
    """计算指定 SLA 的最新窗口指标。"""
    sla = await db.get(UcpSlaConfig, sla_id)
    if not sla or not sla.is_active:
        return None

    now = datetime.now(timezone.utc)
    window_start = now - timedelta(hours=sla.window_hours)

    # 查询该目标在窗口内的执行记录
    stmt = select(UcpPipelineExecution).where(
        UcpPipelineExecution.created_at >= window_start,
    )
    if sla.target_type == "system":
        stmt = stmt.where(UcpPipelineExecution.system_id == sla.target_id)
    elif sla.target_type == "resource":
        stmt = stmt.where(UcpPipelineExecution.resource_id == sla.target_id)
    # pipeline target_type: 按 pipeline_code 匹配需要额外查询

    runs = (await db.execute(stmt)).scalars().all()
    total = len(runs)
    if total == 0:
        return None

    success = sum(1 for r in runs if r.status in ("SUCCESS", "PARTIAL_SUCCESS"))
    success_rate = success / total if total > 0 else 1.0
    durations = [r.duration_ms for r in runs if r.duration_ms is not None]
    durations.sort()

    p95 = _percentile(durations, 95) if durations else None
    p99 = _percentile(durations, 99) if durations else None

    # 达标评估
    unmet = []
    is_met = True
    if sla.success_rate_target is not None and success_rate < sla.success_rate_target:
        is_met = False
        unmet.append(f"成功率 {success_rate:.1%} < 目标 {sla.success_rate_target:.1%}")
    if sla.p95_duration_ms_max is not None and p95 and p95 > sla.p95_duration_ms_max:
        is_met = False
        unmet.append(f"P95 耗时 {p95}ms > 目标 {sla.p95_duration_ms_max}ms")
    if sla.p99_duration_ms_max is not None and p99 and p99 > sla.p99_duration_ms_max:
        is_met = False
        unmet.append(f"P99 耗时 {p99}ms > 目标 {sla.p99_duration_ms_max}ms")
    if sla.recovery_time_minutes is not None:
        # 检查最近的恢复时间（从上次失败到下次成功的时间差）
        recovery_time = await _calc_recovery_time(db, sla.target_id, sla.target_type, window_start)
        if recovery_time is not None and recovery_time > sla.recovery_time_minutes * 60:
            is_met = False
            unmet.append(f"恢复时间 {recovery_time:.0f}s > 目标 {sla.recovery_time_minutes}min")

    record = UcpSlaRecord(
        sla_id=sla_id,
        window_start=window_start, window_end=now,
        total_executions=total, success_count=success,
        success_rate=success_rate,
        p95_duration_ms=p95, p99_duration_ms=p99,
        is_met=1 if is_met else 0,
        unmet_reasons=unmet if unmet else None,
    )
    db.add(record)
    await db.flush()
    return {
        "sla_id": sla_id, "window_start": window_start.isoformat(),
        "window_end": now.isoformat(), "total_executions": total,
        "success_rate": success_rate, "p95_duration_ms": p95,
        "is_met": is_met, "unmet_reasons": unmet,
    }


async def list_sla_records(db: AsyncSession, sla_id: int, limit: int = 30) -> list[dict]:
    rows = (await db.execute(
        select(UcpSlaRecord).where(UcpSlaRecord.sla_id == sla_id)
        .order_by(UcpSlaRecord.window_start.desc()).limit(limit)
    )).scalars().all()
    return [
        {
            "id": r.id, "sla_id": r.sla_id,
            "window_start": r.window_start.isoformat() if r.window_start else None,
            "window_end": r.window_end.isoformat() if r.window_end else None,
            "total_executions": r.total_executions, "success_count": r.success_count,
            "success_rate": r.success_rate, "p95_duration_ms": r.p95_duration_ms,
            "p99_duration_ms": r.p99_duration_ms,
            "is_met": bool(r.is_met), "unmet_reasons": r.unmet_reasons,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


async def list_sla_dashboard(db: AsyncSession) -> dict:
    """SLA 看板：达标/未达标趋势和责任人。"""
    configs = (await db.execute(
        select(UcpSlaConfig).where(UcpSlaConfig.is_active == 1)
    )).scalars().all()

    items = []
    for c in configs:
        latest = (await db.execute(
            select(UcpSlaRecord).where(UcpSlaRecord.sla_id == c.id)
            .order_by(UcpSlaRecord.window_start.desc()).limit(1)
        )).scalar_one_or_none()
        items.append({
            "sla_code": c.sla_code, "sla_name": c.sla_name,
            "target_type": c.target_type, "target_id": c.target_id,
            "success_rate_target": c.success_rate_target,
            "latest_record": {
                "success_rate": latest.success_rate,
                "is_met": bool(latest.is_met),
                "unmet_reasons": latest.unmet_reasons,
                "window_end": latest.window_end.isoformat() if latest and latest.window_end else None,
            } if latest else None,
        })

    met = sum(1 for i in items if i["latest_record"] and i["latest_record"]["is_met"])
    return {"total": len(items), "met": met, "not_met": len(items) - met, "items": items}


async def _calc_recovery_time(db: AsyncSession, target_id: int, target_type: str, since: datetime) -> float | None:
    """估算恢复时间：最近一次 FAILED→SUCCESS 转换的时间差。"""
    runs = (await db.execute(
        select(UcpPipelineExecution).where(
            UcpPipelineExecution.created_at >= since,
            UcpPipelineExecution.system_id == target_id if target_type == "system" else True,
            UcpPipelineExecution.resource_id == target_id if target_type == "resource" else True,
        ).order_by(UcpPipelineExecution.created_at.asc())
    )).scalars().all()

    # 找第一个 FAILED 后第一个 SUCCESS 的时间差
    failed_at = None
    for r in runs:
        if r.status == "FAILED" and failed_at is None:
            failed_at = r.created_at
        elif r.status in ("SUCCESS", "PARTIAL_SUCCESS") and failed_at is not None:
            return (r.created_at - failed_at).total_seconds()
    return None


def _percentile(sorted_data: list, p: int) -> float | None:
    if not sorted_data:
        return None
    idx = (len(sorted_data) - 1) * p / 100.0
    lo = int(idx)
    hi = lo + 1
    if hi >= len(sorted_data):
        return float(sorted_data[-1])
    frac = idx - lo
    return sorted_data[lo] * (1 - frac) + sorted_data[hi] * frac


def _serialize_sla(s: UcpSlaConfig) -> dict:
    return {
        "id": s.id, "sla_code": s.sla_code, "sla_name": s.sla_name,
        "target_type": s.target_type, "target_id": s.target_id,
        "success_rate_target": s.success_rate_target,
        "p95_duration_ms_max": s.p95_duration_ms_max,
        "p99_duration_ms_max": s.p99_duration_ms_max,
        "recovery_time_minutes": s.recovery_time_minutes,
        "window_hours": s.window_hours,
        "is_active": bool(s.is_active),
        "created_by": s.created_by,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }
