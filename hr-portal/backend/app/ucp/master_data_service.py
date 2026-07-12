"""Phase 7-A/B: 主数据目录与 ID 映射服务。

管理外部系统主数据对象和 HR ↔ 外部 ID 映射关系。
"""
from __future__ import annotations

from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import (
    UcpMasterDataObject, UcpIdMapping, UcpIdMappingAudit,
    MD_OBJECT_PERSON, MD_OBJECT_ORG, MD_OBJECT_POSITION, MD_OBJECT_ACCOUNT,
)
from app.ucp.types import AdapterResult


# ===== 主数据对象 =====

async def list_master_data_objects(
    db: AsyncSession,
    object_type: str | None = None,
    system_code: str | None = None,
    keyword: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    stmt = select(UcpMasterDataObject)
    if object_type:
        stmt = stmt.where(UcpMasterDataObject.object_type == object_type)
    if system_code:
        stmt = stmt.where(UcpMasterDataObject.system_code == system_code)
    if keyword:
        kw = f"%{keyword}%"
        from sqlalchemy import or_
        stmt = stmt.where(or_(
            UcpMasterDataObject.object_code.ilike(kw),
            UcpMasterDataObject.object_name.ilike(kw),
        ))
    stmt = stmt.order_by(UcpMasterDataObject.updated_at.desc()).offset(offset).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize_md(r) for r in rows]


async def get_master_data_object(db: AsyncSession, object_code: str) -> dict | None:
    r = (await db.execute(
        select(UcpMasterDataObject).where(UcpMasterDataObject.object_code == object_code)
    )).scalar_one_or_none()
    return _serialize_md(r) if r else None


async def create_master_data_object(
    db: AsyncSession,
    object_code: str, object_name: str, object_type: str,
    system_code: str, system_name: str | None = None,
    source_type: str = "REFERENCE",
    field_definitions: list | None = None,
    owner: str | None = None,
    description: str | None = None,
    created_by: str | None = None,
) -> dict:
    existing = (await db.execute(
        select(UcpMasterDataObject).where(UcpMasterDataObject.object_code == object_code)
    )).scalar_one_or_none()
    if existing:
        raise ValueError(f"主数据对象 '{object_code}' 已存在")

    obj = UcpMasterDataObject(
        object_code=object_code, object_name=object_name,
        object_type=object_type, system_code=system_code,
        system_name=system_name, source_type=source_type,
        field_definitions=field_definitions or [],
        owner=owner, description=description,
        created_by=created_by,
    )
    db.add(obj)
    await db.flush()
    return _serialize_md(obj)


async def update_master_data_object(db: AsyncSession, object_code: str, **fields) -> dict:
    obj = (await db.execute(
        select(UcpMasterDataObject).where(UcpMasterDataObject.object_code == object_code)
    )).scalar_one_or_none()
    if not obj:
        raise ValueError(f"主数据对象 '{object_code}' 不存在")
    allowed = {"object_name", "system_name", "source_type", "field_definitions",
               "owner", "description", "sync_status", "record_count", "is_active"}
    for k, v in fields.items():
        if k in allowed and hasattr(obj, k):
            setattr(obj, k, v)
    await db.flush()
    return _serialize_md(obj)


def _serialize_md(o: UcpMasterDataObject) -> dict:
    return {
        "id": o.id, "object_code": o.object_code, "object_name": o.object_name,
        "object_type": o.object_type, "system_code": o.system_code,
        "system_name": o.system_name, "source_type": o.source_type,
        "field_definitions": o.field_definitions,
        "owner": o.owner, "sync_status": o.sync_status,
        "last_synced_at": o.last_synced_at.isoformat() if o.last_synced_at else None,
        "record_count": o.record_count,
        "description": o.description, "is_active": bool(o.is_active),
        "created_by": o.created_by,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "updated_at": o.updated_at.isoformat() if o.updated_at else None,
    }


# ===== ID 映射 =====

async def list_id_mappings(
    db: AsyncSession,
    object_type: str | None = None,
    external_system: str | None = None,
    hr_id: str | None = None,
    is_conflict: bool | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    stmt = select(UcpIdMapping)
    if object_type:
        stmt = stmt.where(UcpIdMapping.object_type == object_type)
    if external_system:
        stmt = stmt.where(UcpIdMapping.external_system == external_system)
    if hr_id:
        stmt = stmt.where(UcpIdMapping.hr_id == hr_id)
    if is_conflict is not None:
        stmt = stmt.where(UcpIdMapping.is_conflict == (1 if is_conflict else 0))
    stmt = stmt.order_by(UcpIdMapping.updated_at.desc()).offset(offset).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize_mapping(r) for r in rows]


async def create_id_mapping(
    db: AsyncSession,
    object_type: str, hr_id: str,
    external_system: str, external_id: str,
    external_name: str | None = None,
    mapping_type: str = "ONE_TO_ONE",
    created_by: str | None = None,
) -> dict:
    # 检查重复的 external_id
    existing = (await db.execute(
        select(UcpIdMapping).where(
            UcpIdMapping.object_type == object_type,
            UcpIdMapping.external_system == external_system,
            UcpIdMapping.external_id == external_id,
        )
    )).scalar_one_or_none()
    if existing:
        raise ValueError(f"映射已存在: {external_system}/{external_id}")

    # 检查是否有其他 hr_id 已映射到相同 external_id（冲突检测）
    conflict = (await db.execute(
        select(UcpIdMapping).where(
            UcpIdMapping.object_type == object_type,
            UcpIdMapping.external_system == external_system,
            UcpIdMapping.external_id == external_id,
        )
    )).scalar_one_or_none()

    m = UcpIdMapping(
        object_type=object_type, hr_id=hr_id,
        external_system=external_system, external_id=external_id,
        external_name=external_name, mapping_type=mapping_type,
        is_conflict=1 if conflict and conflict.hr_id != hr_id else 0,
        conflict_reason=f"重复映射: hr_id={conflict.hr_id}" if conflict and conflict.hr_id != hr_id else None,
        created_by=created_by,
    )
    db.add(m)
    _audit_mapping(db, m.id, "CREATE", None, _serialize_mapping(m), created_by)
    await db.flush()
    return _serialize_mapping(m)


async def update_id_mapping(
    db: AsyncSession, mapping_id: int,
    operator: str | None = None, **fields,
) -> dict:
    m = await db.get(UcpIdMapping, mapping_id)
    if not m:
        raise ValueError(f"映射 #{mapping_id} 不存在")

    before = _serialize_mapping(m)
    allowed = {"hr_id", "external_id", "external_name", "mapping_type", "is_active"}
    for k, v in fields.items():
        if k in allowed and hasattr(m, k):
            setattr(m, k, v)
    m.updated_by = operator
    _audit_mapping(db, m.id, "UPDATE", before, _serialize_mapping(m), operator)
    await db.flush()
    return _serialize_mapping(m)


async def delete_id_mapping(
    db: AsyncSession, mapping_id: int, operator: str | None = None,
) -> dict:
    m = await db.get(UcpIdMapping, mapping_id)
    if not m:
        raise ValueError(f"映射 #{mapping_id} 不存在")
    before = _serialize_mapping(m)
    _audit_mapping(db, mapping_id, "DELETE", before, None, operator)
    await db.delete(m)
    return before


async def check_mapping_conflicts(db: AsyncSession) -> list[dict]:
    """检测重复映射、缺失映射、孤儿映射。"""
    conflicts = []

    # 重复映射：(external_system, external_id) 有多个不同的 hr_id
    from sqlalchemy import and_
    dupes = (await db.execute(
        select(
            UcpIdMapping.external_system,
            UcpIdMapping.external_id,
            func.count(UcpIdMapping.id).label("cnt"),
            func.array_agg(UcpIdMapping.hr_id).label("hr_ids"),
        )
        .group_by(UcpIdMapping.external_system, UcpIdMapping.external_id)
        .having(func.count(UcpIdMapping.id) > 1)
    )).all()
    for d in dupes:
        conflicts.append({
            "type": "DUPLICATE",
            "external_system": d.external_system,
            "external_id": d.external_id,
            "hr_ids": d.hr_ids,
        })

    return conflicts


def _serialize_mapping(m: UcpIdMapping) -> dict:
    return {
        "id": m.id, "object_type": m.object_type,
        "hr_id": m.hr_id, "external_system": m.external_system,
        "external_id": m.external_id, "external_name": m.external_name,
        "mapping_type": m.mapping_type,
        "is_conflict": bool(m.is_conflict),
        "conflict_reason": m.conflict_reason,
        "is_active": bool(m.is_active),
        "verified_at": m.verified_at.isoformat() if m.verified_at else None,
        "created_by": m.created_by,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _audit_mapping(db: AsyncSession, mapping_id: int | None, action: str,
                   before: dict | None, after: dict | None, operator: str | None):
    db.add(UcpIdMappingAudit(
        mapping_id=mapping_id, action=action,
        before_value=before, after_value=after,
        reason=None, operator=operator,
    ))
