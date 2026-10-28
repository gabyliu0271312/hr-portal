from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_op
from app.master_data.access import ENTITY_MENU, require_entity
from app.master_data.schemas import EntityCreateIn, EntityListOut, EntityOut, EntityUpdateIn
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
