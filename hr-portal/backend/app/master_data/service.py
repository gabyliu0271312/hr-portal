from datetime import UTC, datetime

from sqlalchemy import func, select

from app.master_data.access import require_entity
from app.master_data.models import EntityDefinition
from app.master_data.schemas import EntityListOut, EntityOut
from app.system.models import SystemLog
from app.warehouse.service.standard_fields import _error, _transaction


def audit(db, entity, user, action):
    db.add(SystemLog(category="master_data", action="entity_definition_" + action, status="success", user_id=user.id,
        metadata_json={"entity_id": entity.id, "revision": entity.revision}))


async def list_entities(db, user, keyword=None, offset=0, limit=50):
    stmt = select(EntityDefinition).where(EntityDefinition.owner_user_id == user.id)
    if keyword:
        stmt = stmt.where(EntityDefinition.entity_code.icontains(keyword, autoescape=True) | EntityDefinition.name.icontains(keyword, autoescape=True))
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (await db.execute(stmt.order_by(EntityDefinition.entity_code).offset(offset).limit(limit))).scalars().all()
    return EntityListOut(total=total, items=[EntityOut.model_validate(row) for row in rows])


async def create_entity(db, payload, user):
    async with _transaction(db):
        if await db.scalar(select(EntityDefinition.id).where(EntityDefinition.entity_code == payload.entity_code)):
            _error(409, "entity_code_exists", "实体编码已存在，不能重复创建或接管")
        entity = EntityDefinition(**payload.model_dump(), owner_user_id=user.id)
        db.add(entity)
        await db.flush()
        audit(db, entity, user, "created")
        return EntityOut.model_validate(entity)


async def update_entity(db, entity_id, payload, user):
    async with _transaction(db):
        entity = await require_entity(db, entity_id, user, "U", active=True, lock=True)
        if entity.revision != payload.expected_revision:
            _error(409, "entity_revision_conflict", "实体定义已更新，请重新加载")
        entity.name = payload.name
        entity.description = payload.description
        entity.revision += 1
        entity.updated_at = datetime.now(UTC)
        await db.flush()
        audit(db, entity, user, "updated")
        return EntityOut.model_validate(entity)
