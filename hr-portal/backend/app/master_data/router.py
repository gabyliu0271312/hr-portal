from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_op
from app.master_data.access import ENTITY_MENU, require_entity
from app.master_data.schemas import EntityCreateIn, EntityListOut, EntityOut, EntityUpdateIn, EntityPublishIn, EntityRecordAccessIn, EntityRecordUserAccessIn
from app.master_data import service
from app.users.models import User

router = APIRouter(prefix="/master-data/entities", tags=["master-data"])


@router.get("", response_model=EntityListOut)
async def list_entities(keyword: str | None = Query(None, min_length=1, max_length=128),
    offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
    user: User = Depends(require_op(ENTITY_MENU, "V")), db: AsyncSession = Depends(get_session)):
    return await service.list_entities(db, user, keyword, offset, limit)


@router.post("", response_model=EntityOut, status_code=201)
async def create_entity(payload: EntityCreateIn, user: User = Depends(require_op(ENTITY_MENU, "C")),
    viewer: User = Depends(require_op(ENTITY_MENU, "V")), db: AsyncSession = Depends(get_session)):
    return await service.create_entity(db, payload, user)


@router.get("/{entity_id}", response_model=EntityOut)
async def get_entity(entity_id: int = Path(..., gt=0), user: User = Depends(require_op(ENTITY_MENU, "V")),
    db: AsyncSession = Depends(get_session)):
    return await require_entity(db, entity_id, user)


@router.put("/{entity_id}", response_model=EntityOut)
async def update_entity(payload: EntityUpdateIn, entity_id: int = Path(..., gt=0),
    user: User = Depends(require_op(ENTITY_MENU, "U")), db: AsyncSession = Depends(get_session)):
    return await service.update_entity(db, entity_id, payload, user)


@router.post("/{entity_id}/publish", response_model=EntityOut)
async def publish_entity(payload: EntityPublishIn, entity_id: int = Path(..., gt=0),
    user: User = Depends(require_op(ENTITY_MENU, "U")), db: AsyncSession = Depends(get_session)):
    from app.master_data.records import publish
    from app.warehouse.service.standard_fields import _error, _transaction
    async with _transaction(db):
        entity = await require_entity(db, entity_id, user, "U", active=True, lock=True)
        if entity.revision != payload.expected_revision:
            _error(409, "entity_revision_conflict", "实体定义已更新，请重新加载")
        await publish(db, entity, user)
        return EntityOut.model_validate(entity)


@router.get("/{entity_id}/records")
async def query_records(entity_id: int = Path(..., gt=0), offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100), user: User = Depends(require_op(ENTITY_MENU, "V")),
    db: AsyncSession = Depends(get_session)):
    from app.master_data.records import list_records
    return await list_records(db, user, entity_id, offset, limit)


@router.get("/{entity_id}/records/{record_id}")
async def query_record(entity_id: int = Path(..., gt=0), record_id: int = Path(..., gt=0),
    user: User = Depends(require_op(ENTITY_MENU, "V")), db: AsyncSession = Depends(get_session)):
    from app.master_data.records import list_records
    return await list_records(db, user, entity_id, record_id=record_id)


@router.put("/{entity_id}/record-access")
async def set_record_access(payload: EntityRecordAccessIn, entity_id: int = Path(..., gt=0),
    user: User = Depends(require_op("system.users", "U")), db: AsyncSession = Depends(get_session)):
    from sqlalchemy import delete, select
    from app.master_data.models import EntityRecordAcl
    from app.users.models import Role
    from app.warehouse.service.standard_fields import _error, _transaction
    async with _transaction(db):
        entity = await require_entity(db, entity_id, user, "V", lock=True)
        for model, ids in ((User, payload.user_ids), (Role, payload.role_ids)):
            found = set((await db.scalars(select(model.id).where(model.id.in_(ids)))).all())
            if found != set(ids):
                _error(422, "record_acl_subject_invalid", "授权主体不存在")
        await db.execute(delete(EntityRecordAcl).where(EntityRecordAcl.entity_id == entity_id))
        db.add_all([EntityRecordAcl(entity_id=entity_id, user_id=i) for i in payload.user_ids])
        db.add_all([EntityRecordAcl(entity_id=entity_id, role_id=i) for i in payload.role_ids])
        service.audit(db, entity, user, "record_access_updated")
    return {"ok": True}


@router.get("/{entity_id}/record-access")
async def get_record_access(entity_id: int = Path(..., gt=0),
    user: User = Depends(require_op("system.users", "U")), db: AsyncSession = Depends(get_session)):
    from sqlalchemy import select
    from app.master_data.models import EntityRecordAcl
    await require_entity(db, entity_id, user)
    rows = (await db.scalars(select(EntityRecordAcl).where(EntityRecordAcl.entity_id == entity_id))).all()
    return {"user_ids": [r.user_id for r in rows if r.user_id is not None],
        "role_ids": [r.role_id for r in rows if r.role_id is not None]}


@router.put("/{entity_id}/record-access/users/{user_id}")
async def set_user_record_access(payload: "EntityRecordUserAccessIn", entity_id: int = Path(..., gt=0),
    user_id: int = Path(..., gt=0), user: User = Depends(require_op("system.users", "U")),
    db: AsyncSession = Depends(get_session)):
    from sqlalchemy import delete
    from app.master_data.models import EntityRecordAcl
    from app.warehouse.service.standard_fields import _error, _transaction
    async with _transaction(db):
        entity = await require_entity(db, entity_id, user, lock=True)
        target = await db.get(User, user_id)
        if target is None or not target.is_active:
            _error(422, "record_acl_subject_invalid", "授权主体不存在或已失效")
        await db.execute(delete(EntityRecordAcl).where(EntityRecordAcl.entity_id == entity_id,
            EntityRecordAcl.user_id == user_id))
        if payload.allowed:
            db.add(EntityRecordAcl(entity_id=entity_id, user_id=user_id))
        service.audit(db, entity, user, "record_access_updated")
    return {"ok": True}


record_router = APIRouter(prefix="/master-data", tags=["master-data"])


@record_router.get("/overview")
async def master_data_overview(user: User = Depends(require_op("master_data.overview", "V")),
    db: AsyncSession = Depends(get_session)):
    from app.master_data.overview import overview
    return await overview(db)



@record_router.get("/record-entities")
async def record_entities(user: User = Depends(require_op(ENTITY_MENU, "V")),
    db: AsyncSession = Depends(get_session)):
    from sqlalchemy import select
    from app.master_data.models import EntityDefinition
    from app.master_data.records import has_record_acl
    rows = (await db.scalars(select(EntityDefinition).where(
        EntityDefinition.is_active.is_(True), EntityDefinition.published_at.is_not(None),
    ).order_by(EntityDefinition.id))).all()
    items = [{"id": e.id, "name": e.name, "entity_code": e.entity_code} for e in rows
        if await has_record_acl(db, user, e.id)]
    return {"total": len(items), "items": items}
