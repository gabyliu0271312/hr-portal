from fastapi import HTTPException
from sqlalchemy import select

from app.core.deps import user_has_op
from app.master_data.models import EntityDefinition

ENTITY_MENU = "system.master_entities"


async def require_entity(db, entity_id, user, op="V", *, active=False, lock=False):
    if user is None or not await user_has_op(user, db, ENTITY_MENU, "V"):
        raise HTTPException(403, detail={"code": "entity_permission_denied", "message": "无主数据定义查看权限"})
    if op != "V" and not await user_has_op(user, db, ENTITY_MENU, op):
        raise HTTPException(403, detail={"code": "entity_permission_denied", "message": "无主数据定义操作权限"})
    stmt = select(EntityDefinition).where(EntityDefinition.id == entity_id, EntityDefinition.owner_user_id == user.id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    entity = (await db.execute(stmt)).scalar_one_or_none()
    if entity is None:
        raise HTTPException(404, detail={"code": "entity_not_found", "message": "主数据定义不存在或无权访问"})
    if active and not entity.is_active:
        raise HTTPException(409, detail={"code": "entity_inactive", "message": "失效实体不能维护字段"})
    return entity
