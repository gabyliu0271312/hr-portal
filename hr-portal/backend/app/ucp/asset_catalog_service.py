"""Phase 6-A: 集成资产目录服务。

聚合系统、资源、凭证、流水线、事件、模板数量和状态。
支持 domain/owner 过滤。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import (
    UcpSystem, UcpResource, UcpCredential,
    UcpPipelineConfig, UcpPipelineExecution,
    UcpEvent, UcpPipelineTemplate,
    UcpAssetTag, UcpGovernanceScore,
)


def _count_query(stmt):
    """wrap a stmt into a count subquery."""
    return select(func.count()).select_from(stmt.subquery())


async def _tag_filter(db: AsyncSession, asset_type: str, key: str, value: str):
    """Return a subquery of asset_ids matching a tag (key, value)."""
    tag_stmt = select(UcpAssetTag.asset_id).where(
        UcpAssetTag.asset_type == asset_type,
        UcpAssetTag.tag_key == key,
        UcpAssetTag.tag_value == value,
    )
    rows = (await db.execute(tag_stmt)).scalars().all()
    return {r for r in rows}


async def get_asset_catalog(
    db: AsyncSession,
    domain: str | None = None,
    owner: str | None = None,
) -> dict:
    """聚合所有集成资产的数量和状态，支持 domain/owner 过滤。

    domain: 业务域过滤（system.domain, credential.env_tag, tag domain）
    owner:  负责人过滤（system.owner, tag owner）
    """
    sys_id_set: set | None = None
    res_id_set: set | None = None
    pipe_id_set: set | None = None
    cred_id_set: set | None = None

    # collect owner-filtered system IDs
    owner_sys_ids: set | None = None
    if owner:
        owner_rows = (await db.execute(
            select(UcpSystem.id).where(UcpSystem.owner == owner)
        )).scalars().all()
        owner_sys_ids = set(owner_rows)
        if not owner_sys_ids:
            return _empty_catalog()

    # collect domain-filtered system IDs
    domain_sys_ids: set | None = None
    if domain:
        domain_rows = (await db.execute(
            select(UcpSystem.id).where(UcpSystem.domain == domain)
        )).scalars().all()
        domain_sys_ids = set(domain_rows)
        if not domain_sys_ids:
            return _empty_catalog()

    # merge
    if owner_sys_ids is not None and domain_sys_ids is not None:
        sys_id_set = owner_sys_ids & domain_sys_ids
    elif owner_sys_ids is not None:
        sys_id_set = owner_sys_ids
    elif domain_sys_ids is not None:
        sys_id_set = domain_sys_ids

    if sys_id_set is not None and not sys_id_set:
        return _empty_catalog()

    # ---- 系统统计 ----
    sys_base = select(UcpSystem)
    if sys_id_set is not None:
        sys_base = sys_base.where(UcpSystem.id.in_(sys_id_set))
    sys_count = (await db.execute(select(func.count()).select_from(sys_base.subquery()))).scalar() or 0
    sys_active = (await db.execute(
        select(func.count()).select_from(sys_base.where(UcpSystem.is_active == 1).subquery())
    )).scalar() or 0

    # ---- 资源统计 ----
    res_base = select(UcpResource)
    if sys_id_set is not None:
        res_base = res_base.where(UcpResource.system_id.in_(sys_id_set))
    if owner:
        owner_tag_ids = await _tag_filter(db, "resource", "owner", owner)
        if domain:
            domain_tag_ids = await _tag_filter(db, "resource", "domain", domain)
            tag_ids = owner_tag_ids & domain_tag_ids
        else:
            tag_ids = owner_tag_ids
        if tag_ids:
            from sqlalchemy import or_ as _or
            res_base = res_base.where(_or(
                UcpResource.system_id.in_(sys_id_set) if sys_id_set else True,
                UcpResource.id.in_(tag_ids),
            ))
    res_count = (await db.execute(select(func.count()).select_from(res_base.subquery()))).scalar() or 0
    res_active = (await db.execute(
        select(func.count()).select_from(res_base.where(UcpResource.status == 1).subquery())
    )).scalar() or 0

    # ---- 凭证统计 ----
    cred_base = select(UcpCredential)
    if sys_id_set is not None:
        cred_base = cred_base.where(UcpCredential.system_id.in_(sys_id_set))
    if domain:
        cred_base = cred_base.where(UcpCredential.env_tag == domain)
    if owner:
        owner_tag_ids = await _tag_filter(db, "credential", "owner", owner)
        if owner_tag_ids:
            cred_base = cred_base.where(UcpCredential.id.in_(owner_tag_ids))
    cred_count = (await db.execute(select(func.count()).select_from(cred_base.subquery()))).scalar() or 0
    cred_active = (await db.execute(
        select(func.count()).select_from(cred_base.where(UcpCredential.is_active == 1).subquery())
    )).scalar() or 0

    # ---- 流水线统计 ----
    pipe_base = select(UcpPipelineConfig)
    if owner:
        owner_tag_ids = await _tag_filter(db, "pipeline", "owner", owner)
        if domain:
            domain_tag_ids = await _tag_filter(db, "pipeline", "domain", domain)
            tag_ids = owner_tag_ids & domain_tag_ids
        else:
            tag_ids = owner_tag_ids
        if tag_ids:
            pipe_base = pipe_base.where(UcpPipelineConfig.id.in_(tag_ids))
    elif domain:
        domain_tag_ids = await _tag_filter(db, "pipeline", "domain", domain)
        if domain_tag_ids:
            pipe_base = pipe_base.where(UcpPipelineConfig.id.in_(domain_tag_ids))
    pipe_count = (await db.execute(select(func.count()).select_from(pipe_base.subquery()))).scalar() or 0
    pipe_active = (await db.execute(
        select(func.count()).select_from(pipe_base.where(UcpPipelineConfig.status == 1).subquery())
    )).scalar() or 0

    # ---- 模板 ----
    tpl_base = select(UcpPipelineTemplate)
    if owner:
        tpl_owner_ids = await _tag_filter(db, "template", "owner", owner)
        if tpl_owner_ids:
            tpl_base = tpl_base.where(UcpPipelineTemplate.id.in_(tpl_owner_ids))
    tpl_count = (await db.execute(select(func.count()).select_from(tpl_base.subquery()))).scalar() or 0

    # ---- 事件 (24h) ----
    event_base = select(UcpEvent).where(UcpEvent.received_at >= datetime.now(timezone.utc) - timedelta(hours=24))
    if sys_id_set is not None:
        event_base = event_base.where(UcpEvent.system_code.in_(
            select(UcpSystem.system_code).where(UcpSystem.id.in_(sys_id_set))
        ))
    event_count_24h = (await db.execute(select(func.count()).select_from(event_base.subquery()))).scalar() or 0

    return {
        "systems": {"total": sys_count, "active": sys_active},
        "resources": {"total": res_count, "active": res_active},
        "credentials": {"total": cred_count, "active": cred_active},
        "pipelines": {"total": pipe_count, "active": pipe_active},
        "templates": {"total": tpl_count},
        "events_24h": event_count_24h,
    }


def _empty_catalog():
    return {
        "systems": {"total": 0, "active": 0},
        "resources": {"total": 0, "active": 0},
        "credentials": {"total": 0, "active": 0},
        "pipelines": {"total": 0, "active": 0},
        "templates": {"total": 0},
        "events_24h": 0,
    }


async def list_assets(
    db: AsyncSession,
    asset_type: str,
    domain: str | None = None,
    keyword: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """列出指定类型的资产列表。"""
    if asset_type == "system":
        stmt = select(UcpSystem)
        if domain:
            stmt = stmt.where(UcpSystem.domain == domain)
        if keyword:
            kw = f"%{keyword}%"
            stmt = stmt.where(or_(
                UcpSystem.system_code.ilike(kw),
                UcpSystem.system_name.ilike(kw),
            ))
        stmt = stmt.order_by(UcpSystem.updated_at.desc()).offset(offset).limit(limit)
        rows = (await db.execute(stmt)).scalars().all()
        return [
            {
                "type": "system", "id": r.id, "code": r.system_code,
                "name": r.system_name, "system_type": r.system_type,
                "owner": r.owner, "is_active": bool(r.is_active),
                "domain": r.domain,
                "tags": await _get_tags(db, "system", r.id),
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]

    if asset_type == "resource":
        stmt = select(UcpResource)
        if domain:
            sys_ids = {r[0] for r in (await db.execute(
                select(UcpSystem.id).where(UcpSystem.domain == domain)
            )).scalars().all()}
            tag_ids = await _tag_filter(db, "resource", "domain", domain)
            if sys_ids or tag_ids:
                conditions = []
                if sys_ids:
                    conditions.append(UcpResource.system_id.in_(sys_ids))
                if tag_ids:
                    conditions.append(UcpResource.id.in_(tag_ids))
                stmt = stmt.where(or_(*conditions))
        if keyword:
            kw = f"%{keyword}%"
            stmt = stmt.where(or_(
                UcpResource.resource_code.ilike(kw),
                UcpResource.resource_name.ilike(kw),
            ))
        stmt = stmt.order_by(UcpResource.updated_at.desc()).offset(offset).limit(limit)
        rows = (await db.execute(stmt)).scalars().all()
        return [
            {
                "type": "resource", "id": r.id, "code": r.resource_code,
                "name": r.resource_name, "system_id": r.system_id,
                "adapter_code": r.adapter_code, "status": r.status,
                "tags": await _get_tags(db, "resource", r.id),
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]

    if asset_type == "pipeline":
        stmt = select(UcpPipelineConfig)
        if domain:
            tag_ids = await _tag_filter(db, "pipeline", "domain", domain)
            if tag_ids:
                stmt = stmt.where(UcpPipelineConfig.id.in_(tag_ids))
        if keyword:
            kw = f"%{keyword}%"
            stmt = stmt.where(or_(
                UcpPipelineConfig.pipeline_code.ilike(kw),
                UcpPipelineConfig.pipeline_name.ilike(kw),
            ))
        stmt = stmt.order_by(UcpPipelineConfig.updated_at.desc()).offset(offset).limit(limit)
        rows = (await db.execute(stmt)).scalars().all()
        return [
            {
                "type": "pipeline", "id": r.id, "code": r.pipeline_code,
                "name": r.pipeline_name, "trigger_type": r.trigger_type,
                "status": r.status,
                "tags": await _get_tags(db, "pipeline", r.id),
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]

    if asset_type == "credential":
        stmt = select(UcpCredential)
        if domain:
            stmt = stmt.where(UcpCredential.env_tag == domain)
        if keyword:
            stmt = stmt.where(UcpCredential.credential_code.ilike(f"%{keyword}%"))
        stmt = stmt.order_by(UcpCredential.updated_at.desc()).offset(offset).limit(limit)
        rows = (await db.execute(stmt)).scalars().all()
        return [
            {
                "type": "credential", "id": r.id, "code": r.credential_code,
                "name": r.credential_name, "auth_type": r.auth_type,
                "env_tag": r.env_tag, "is_active": bool(r.is_active),
                "tags": await _get_tags(db, "credential", r.id),
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]

    if asset_type == "template":
        stmt = select(UcpPipelineTemplate)
        if domain:
            tag_ids = await _tag_filter(db, "template", "domain", domain)
            if tag_ids:
                stmt = stmt.where(UcpPipelineTemplate.id.in_(tag_ids))
        if keyword:
            stmt = stmt.where(UcpPipelineTemplate.name.ilike(f"%{keyword}%"))
        stmt = stmt.order_by(UcpPipelineTemplate.updated_at.desc()).offset(offset).limit(limit)
        rows = (await db.execute(stmt)).scalars().all()
        return [
            {
                "type": "template", "id": r.id, "code": r.template_code,
                "name": r.name, "version": r.version,
                "tags": await _get_tags(db, "template", r.id),
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]

    if asset_type == "event":
        stmt = select(UcpEvent).where(UcpEvent.received_at >= datetime.now(timezone.utc) - timedelta(days=7))
        if domain:
            stmt = stmt.where(UcpEvent.source.ilike(f"%{domain}%"))
        if keyword:
            stmt = stmt.where(UcpEvent.event_type.ilike(f"%{keyword}%"))
        stmt = stmt.order_by(UcpEvent.received_at.desc()).offset(offset).limit(limit)
        rows = (await db.execute(stmt)).scalars().all()
        return [
            {
                "type": "event", "id": r.id, "event_id": r.event_id,
                "event_type": r.event_type, "source": r.source,
                "status": r.status,
                "received_at": r.received_at.isoformat() if r.received_at else None,
            }
            for r in rows
        ]

    if asset_type == "execution":
        stmt = select(UcpPipelineExecution)
        if domain:
            pipes = (await db.execute(
                select(UcpPipelineConfig.id).where(
                    UcpPipelineConfig.id.in_(
                        select(UcpAssetTag.asset_id).where(
                            UcpAssetTag.asset_type == "pipeline",
                            UcpAssetTag.tag_key == "domain",
                            UcpAssetTag.tag_value == domain,
                        )
                    )
                )
            )).scalars().all()
            if pipes:
                stmt = stmt.where(UcpPipelineExecution.pipeline_code.in_(
                    select(UcpPipelineConfig.pipeline_code).where(UcpPipelineConfig.id.in_(set(pipes)))
                ))
        if keyword:
            stmt = stmt.where(UcpPipelineExecution.pipeline_code.ilike(f"%{keyword}%"))
        stmt = stmt.order_by(UcpPipelineExecution.created_at.desc()).offset(offset).limit(limit)
        rows = (await db.execute(stmt)).scalars().all()
        return [
            {
                "type": "execution", "id": r.id, "run_id": r.pipeline_run_id,
                "pipeline_code": r.pipeline_code, "status": r.status,
                "duration_ms": r.duration_ms, "trigger_type": r.trigger_type,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]

    if asset_type == "trigger":
        from app.ucp.models import UcpEventTrigger
        stmt = select(UcpEventTrigger)
        if keyword:
            stmt = stmt.where(UcpEventTrigger.trigger_name.ilike(f"%{keyword}%"))
        stmt = stmt.order_by(UcpEventTrigger.created_at.desc()).offset(offset).limit(limit)
        rows = (await db.execute(stmt)).scalars().all()
        return [
            {
                "type": "trigger", "id": r.id, "code": r.trigger_code,
                "name": r.trigger_name, "event_source": r.event_source,
                "pipeline_code": r.pipeline_code, "is_active": bool(r.is_active),
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]

    return []


async def _get_tags(db: AsyncSession, asset_type: str, asset_id: int) -> dict[str, str]:
    rows = (await db.execute(
        select(UcpAssetTag).where(
            UcpAssetTag.asset_type == asset_type,
            UcpAssetTag.asset_id == asset_id,
        )
    )).scalars().all()
    return {r.tag_key: r.tag_value for r in rows}


async def set_asset_tag(
    db: AsyncSession,
    asset_type: str, asset_id: int,
    tag_key: str, tag_value: str,
) -> dict:
    existing = (await db.execute(
        select(UcpAssetTag).where(
            UcpAssetTag.asset_type == asset_type,
            UcpAssetTag.asset_id == asset_id,
            UcpAssetTag.tag_key == tag_key,
        )
    )).scalar_one_or_none()
    if existing:
        existing.tag_value = tag_value
    else:
        db.add(UcpAssetTag(
            asset_type=asset_type, asset_id=asset_id,
            tag_key=tag_key, tag_value=tag_value,
        ))
    await db.flush()
    return {"asset_type": asset_type, "asset_id": asset_id, "tag_key": tag_key, "tag_value": tag_value}


async def remove_asset_tag(
    db: AsyncSession,
    asset_type: str, asset_id: int, tag_key: str,
) -> bool:
    existing = (await db.execute(
        select(UcpAssetTag).where(
            UcpAssetTag.asset_type == asset_type,
            UcpAssetTag.asset_id == asset_id,
            UcpAssetTag.tag_key == tag_key,
        )
    )).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        return True
    return False
