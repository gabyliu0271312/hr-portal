"""Phase 6-E: 治理评分服务。

按失败率、SLA、告警、凭证风险形成评分（0-100）。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import (
    UcpGovernanceScore,
    UcpSystem, UcpResource, UcpPipelineConfig, UcpCredential,
    UcpPipelineExecution, UcpAlertLog, UcpSlaRecord,
)


async def calculate_scores(
    db: AsyncSession,
    asset_type: str = "system",
    window_hours: int = 168,  # 7 天
) -> list[dict]:
    """计算指定类型资产的治理评分。"""
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=window_hours)
    results = []

    if asset_type == "system":
        systems = (await db.execute(
            select(UcpSystem).where(UcpSystem.is_active == 1)
        )).scalars().all()
        for s in systems:
            score = await _calc_asset_score(db, "system", s.id, s.system_code, since)
            score["window_hours"] = window_hours
            results.append(score)

    elif asset_type == "resource":
        resources = (await db.execute(
            select(UcpResource).where(UcpResource.status == 1)
        )).scalars().all()
        for r in resources:
            score = await _calc_asset_score(db, "resource", r.id, r.resource_code, since)
            score["window_hours"] = window_hours
            results.append(score)

    elif asset_type == "pipeline":
        pipes = (await db.execute(
            select(UcpPipelineConfig).where(UcpPipelineConfig.status == 1)
        )).scalars().all()
        for p in pipes:
            score = await _calc_asset_score(db, "pipeline", p.id, p.pipeline_code, since)
            score["window_hours"] = window_hours
            results.append(score)

    # 持久化
    for r in results:
        db.add(UcpGovernanceScore(
            asset_type=asset_type,
            asset_id=r["asset_id"],
            asset_code=r["asset_code"],
            overall_score=r["overall_score"],
            reliability_score=r.get("reliability_score"),
            performance_score=r.get("performance_score"),
            security_score=r.get("security_score"),
            alert_score=r.get("alert_score"),
            score_detail=r.get("detail"),
            window_hours=window_hours,
        ))
    await db.flush()

    return sorted(results, key=lambda x: x.get("overall_score") or 0)


async def _calc_asset_score(
    db: AsyncSession, asset_type: str, asset_id: int, asset_code: str, since: datetime,
) -> dict:
    """计算单个资产的评分。"""
    # 可靠性评分（基于执行失败率）
    stmt = select(UcpPipelineExecution).where(
        UcpPipelineExecution.created_at >= since,
    )
    if asset_type == "system":
        stmt = stmt.where(UcpPipelineExecution.system_id == asset_id)
    elif asset_type == "resource":
        stmt = stmt.where(UcpPipelineExecution.resource_id == asset_id)
    runs = (await db.execute(stmt)).scalars().all()

    total = len(runs)
    failed = sum(1 for r in runs if r.status == "FAILED") if runs else 0
    fail_rate = failed / total if total > 0 else 0
    reliability_score = max(0, 100 - fail_rate * 200)  # 0% fail = 100, 50% fail = 0

    # 性能评分（基于平均耗时）
    durations = [r.duration_ms for r in runs if r.duration_ms]
    avg_duration = sum(durations) / len(durations) if durations else 0
    performance_score = max(0, 100 - min(avg_duration / 1000, 100))  # >100s avg = 0

    # 安全评分：凭证过期、即将过期扣分
    security_score = await _calc_security_score(db, asset_type, asset_id)
    # 告警评分：未恢复告警 + 近7天频次
    alert_score = await _calc_alert_score(db, asset_type, asset_id, asset_code, since)

    # 综合评分
    weights = {"reliability": 0.40, "performance": 0.30, "security": 0.15, "alert": 0.15}
    overall = (
        reliability_score * weights["reliability"]
        + performance_score * weights["performance"]
        + security_score * weights["security"]
        + alert_score * weights["alert"]
    )

    return {
        "asset_type": asset_type, "asset_id": asset_id, "asset_code": asset_code,
        "overall_score": round(overall, 1),
        "reliability_score": round(reliability_score, 1),
        "performance_score": round(performance_score, 1),
        "security_score": round(security_score, 1),
        "alert_score": round(alert_score, 1),
        "detail": {
            "total_runs": total, "failed_runs": failed,
            "fail_rate": round(fail_rate, 4),
            "avg_duration_ms": round(avg_duration, 1),
        },
    }


async def _calc_security_score(db: AsyncSession, asset_type: str, asset_id: int) -> float:
    """基于凭证过期状态计算安全评分。"""
    score = 100.0
    now = datetime.now(timezone.utc)
    soon = now + timedelta(days=7)

    # 查询该资产关联的凭证
    stmt = select(UcpCredential).where(UcpCredential.is_active == 1)
    if asset_type == "system":
        stmt = stmt.where(UcpCredential.system_id == asset_id)
    elif asset_type == "resource":
        resc = await db.get(UcpResource, asset_id)
        if resc and resc.credential_id:
            stmt = stmt.where(UcpCredential.id == resc.credential_id)
        else:
            return 100.0  # no credential to check
    else:
        return 100.0  # pipeline / other: no direct credential

    creds = (await db.execute(stmt)).scalars().all()
    if not creds:
        return 80.0  # no credential bound — moderate risk

    penalties = 0
    for c in creds:
        if c.expires_at:
            if c.expires_at < now:
                penalties += 40  # expired: critical
            elif c.expires_at < soon:
                penalties += 15  # expiring soon: warning

    return max(0, score - penalties)


async def _calc_alert_score(db: AsyncSession, asset_type: str, asset_id: int, asset_code: str, since: datetime) -> float:
    """基于告警日志计算告警评分。"""
    score = 100.0
    # 查询该资产相关的未恢复告警
    alerts = (await db.execute(
        select(UcpAlertLog).where(
            UcpAlertLog.created_at >= since,
            UcpAlertLog.resolved_at.is_(None),
        )
    )).scalars().all()

    if not alerts:
        return score

    # 按严重级别扣分
    for a in alerts:
        if a.alert_level == "CRITICAL":
            score -= 25
        elif a.alert_level == "WARN":
            score -= 10

    # 高频告警额外扣分
    if len(alerts) >= 10:
        score -= 20
    elif len(alerts) >= 5:
        score -= 10

    return max(0, score)


async def get_latest_scores(
    db: AsyncSession,
    asset_type: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """获取最新的治理评分。"""
    stmt = select(UcpGovernanceScore)
    if asset_type:
        stmt = stmt.where(UcpGovernanceScore.asset_type == asset_type)
    stmt = stmt.order_by(desc(UcpGovernanceScore.calculated_at)).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id, "asset_type": r.asset_type, "asset_id": r.asset_id,
            "asset_code": r.asset_code, "overall_score": r.overall_score,
            "reliability_score": r.reliability_score,
            "performance_score": r.performance_score,
            "security_score": r.security_score,
            "alert_score": r.alert_score,
            "score_detail": r.score_detail,
            "window_hours": r.window_hours,
            "calculated_at": r.calculated_at.isoformat() if r.calculated_at else None,
        }
        for r in rows
    ]
