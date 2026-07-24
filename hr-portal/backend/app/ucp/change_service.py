"""Phase 6-D: 变更管理服务。

资源、凭证、流水线发布可生成变更单，高风险变更需审批后发布。
"""
from __future__ import annotations

import copy
from datetime import datetime, timezone

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import (
    UcpChangeRequest,
    UcpResource, UcpCredential, UcpPipelineConfig, UcpSystem,
)


async def list_changes(
    db: AsyncSession,
    status: str | None = None,
    change_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    stmt = select(UcpChangeRequest)
    if status:
        stmt = stmt.where(UcpChangeRequest.status == status)
    if change_type:
        stmt = stmt.where(UcpChangeRequest.change_type == change_type)
    stmt = stmt.order_by(desc(UcpChangeRequest.created_at)).offset(offset).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize_change(r) for r in rows]


async def create_change(
    db: AsyncSession,
    change_type: str,
    change_target_id: int,
    change_target_code: str,
    change_summary: str | None = None,
    risk_level: str = "LOW",
    reason: str | None = None,
    publish_window_start: datetime | None = None,
    publish_window_end: datetime | None = None,
    created_by: str | None = None,
    after_snapshot: dict | None = None,
) -> dict:
    # 生成 change_code
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    change_code = f"CHG-{ts}-{change_type[:4].upper()}"

    # 快照当前配置
    before_snapshot = await _get_current_snapshot(db, change_type, change_target_id)

    # 影响分析
    affected = await _analyze_impact(db, change_type, change_target_id)

    ch = UcpChangeRequest(
        change_code=change_code,
        change_type=change_type,
        change_target_id=change_target_id,
        change_target_code=change_target_code,
        change_summary=change_summary,
        before_snapshot=before_snapshot,
        after_snapshot=after_snapshot,
        risk_level=risk_level,
        status="DRAFT" if risk_level == "LOW" else "PENDING_APPROVAL",
        publish_window_start=publish_window_start,
        publish_window_end=publish_window_end,
        affected_assets=affected,
        reason=reason,
        created_by=created_by,
    )
    db.add(ch)
    await db.flush()
    return _serialize_change(ch)


async def update_change_status(
    db: AsyncSession,
    change_id: int,
    status: str,
    operator: str | None = None,
) -> dict:
    ch = await db.get(UcpChangeRequest, change_id)
    if not ch:
        raise ValueError(f"变更单 #{change_id} 不存在")

    ch.status = status
    if status == "PUBLISHED":
        ch.published_at = datetime.now(timezone.utc)
        # after_snapshot
        ch.after_snapshot = await _get_current_snapshot(db, ch.change_type, ch.change_target_id)
    elif status == "ROLLED_BACK":
        ch.rolled_back_at = datetime.now(timezone.utc)

    await db.flush()
    return _serialize_change(ch)


async def rollback_change(
    db: AsyncSession,
    change_id: int,
    operator: str | None = None,
) -> dict:
    """回滚变更到 before_snapshot。"""
    ch = await db.get(UcpChangeRequest, change_id)
    if not ch:
        raise ValueError(f"变更单 #{change_id} 不存在")
    if not ch.before_snapshot:
        raise ValueError("无快照数据，无法回滚")

    await _restore_snapshot(db, ch.change_type, ch.change_target_id, ch.before_snapshot)
    ch.status = "ROLLED_BACK"
    ch.rolled_back_at = datetime.now(timezone.utc)
    await db.flush()
    return _serialize_change(ch)


async def _get_current_snapshot(db: AsyncSession, change_type: str, target_id: int) -> dict | None:
    if change_type == "RESOURCE":
        r = await db.get(UcpResource, target_id)
        if r:
            return {
                "resource_code": r.resource_code, "resource_name": r.resource_name,
                "adapter_code": r.adapter_code, "protocol": r.protocol,
                "mapping_config": r.mapping_config, "status": r.status,
            }
    elif change_type == "CREDENTIAL":
        c = await db.get(UcpCredential, target_id)
        if c:
            return {"credential_code": c.credential_code, "auth_type": c.auth_type, "is_active": c.is_active}
    elif change_type == "PIPELINE":
        p = await db.get(UcpPipelineConfig, target_id)
        if p:
            return {"pipeline_code": p.pipeline_code, "steps": p.steps, "status": p.status}
    return None


async def _analyze_impact(db: AsyncSession, change_type: str, target_id: int) -> list:
    """分析影响范围。"""
    from app.ucp.topology_service import get_impact_analysis
    result = await get_impact_analysis(db, change_type.lower(), target_id)
    return result.get("affected_pipelines", [])


async def _restore_snapshot(db: AsyncSession, change_type: str, target_id: int, snapshot: dict):
    if change_type == "RESOURCE":
        r = await db.get(UcpResource, target_id)
        if r:
            for k, v in snapshot.items():
                if hasattr(r, k):
                    setattr(r, k, v)
    elif change_type == "PIPELINE":
        p = await db.get(UcpPipelineConfig, target_id)
        if p:
            for k, v in snapshot.items():
                if hasattr(p, k):
                    setattr(p, k, v)


def _serialize_change(c: UcpChangeRequest) -> dict:
    return {
        "id": c.id, "change_code": c.change_code,
        "change_type": c.change_type, "change_target_id": c.change_target_id,
        "change_target_code": c.change_target_code,
        "change_summary": c.change_summary,
        "risk_level": c.risk_level, "status": c.status,
        "before_snapshot": c.before_snapshot,
        "after_snapshot": c.after_snapshot,
        "affected_assets": c.affected_assets,
        "published_at": c.published_at.isoformat() if c.published_at else None,
        "rolled_back_at": c.rolled_back_at.isoformat() if c.rolled_back_at else None,
        "reason": c.reason,
        "created_by": c.created_by,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }
