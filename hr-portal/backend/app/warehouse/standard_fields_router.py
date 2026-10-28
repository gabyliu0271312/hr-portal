from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_op
from app.users.models import User
from app.warehouse.schemas import (
    StandardFieldBindingActionIn,
    StandardFieldBindingCandidateOut,
    StandardFieldBindingCreateIn,
    StandardFieldBindingOut,
    StandardFieldCreateIn,
    StandardFieldUpdateIn,
    StandardFieldDetailOut,
    StandardFieldListOut,
)
from app.warehouse.service import standard_fields as service

router = APIRouter(prefix="/standard-fields")

CATALOG_MENU = "warehouse.standard_fields.catalog"


@router.get("", response_model=StandardFieldListOut)
async def list_fields(
    entity_id: int | None = Query(None, gt=0),
    keyword: str | None = Query(None, min_length=1, max_length=128),
    is_active: bool | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    user: User = Depends(require_op(CATALOG_MENU, "V")),
    db: AsyncSession = Depends(get_session),
):
    return await service.list_standard_fields(db, keyword, is_active, offset, limit, user=user, entity_id=entity_id)


@router.get("/{field_id}", response_model=StandardFieldDetailOut)
async def get_field(
    field_id: int = Path(..., gt=0),
    user: User = Depends(require_op(CATALOG_MENU, "V")),
    db: AsyncSession = Depends(get_session),
):
    return await service.read_standard_field(db, field_id, user=user)


@router.post("", response_model=StandardFieldDetailOut, status_code=201)
async def create_field(
    payload: StandardFieldCreateIn,
    user: User = Depends(require_op(CATALOG_MENU, "C")),
    db: AsyncSession = Depends(get_session),
):
    return await service.create_standard_field(db, payload, user)


@router.put("/{field_id}", response_model=StandardFieldDetailOut)
async def update_field(
    payload: StandardFieldUpdateIn,
    field_id: int = Path(..., gt=0),
    user: User = Depends(require_op(CATALOG_MENU, "U")),
    db: AsyncSession = Depends(get_session),
):
    return await service.update_standard_field(db, field_id, payload, user)


@router.get("/{field_id}/binding-candidates", response_model=list[StandardFieldBindingCandidateOut])
async def binding_candidates(
    field_id: int = Path(..., gt=0),
    keyword: str | None = Query(None, min_length=1, max_length=128),
    table_name: str | None = Query(None, min_length=1, max_length=64),
    dataset_id: int | None = Query(None, gt=0),
    user: User = Depends(require_op(CATALOG_MENU, "V")),
    db: AsyncSession = Depends(get_session),
):
    return await service.list_binding_candidates(db, field_id, keyword, table_name, dataset_id, user)


@router.post("/{field_id}/bindings", response_model=StandardFieldBindingOut, status_code=201)
async def create_binding(
    payload: StandardFieldBindingCreateIn,
    field_id: int = Path(..., gt=0),
    user: User = Depends(require_op(CATALOG_MENU, "U")),
    db: AsyncSession = Depends(get_session),
):
    return await service.create_suggested_binding(db, field_id, payload, user)


@router.post("/{field_id}/bindings/{binding_id}/confirm", response_model=StandardFieldBindingOut)
async def confirm_binding(
    payload: StandardFieldBindingActionIn,
    field_id: int = Path(..., gt=0),
    binding_id: int = Path(..., gt=0),
    user: User = Depends(require_op(CATALOG_MENU, "U")),
    db: AsyncSession = Depends(get_session),
):
    return await service.transition_binding(db, field_id, binding_id, payload, user, "confirmed")


@router.post("/{field_id}/bindings/{binding_id}/invalidate", response_model=StandardFieldBindingOut)
async def invalidate_binding(
    payload: StandardFieldBindingActionIn,
    field_id: int = Path(..., gt=0),
    binding_id: int = Path(..., gt=0),
    user: User = Depends(require_op(CATALOG_MENU, "U")),
    db: AsyncSession = Depends(get_session),
):
    return await service.transition_binding(db, field_id, binding_id, payload, user, "invalid")


@router.delete("/{field_id}", status_code=204)
async def delete_field(
    field_id: int = Path(..., gt=0),
    expected_revision: int = Query(..., ge=0),
    user: User = Depends(require_op(CATALOG_MENU, "D")),
    db: AsyncSession = Depends(get_session),
):
    await service.delete_standard_field(db, field_id, expected_revision, user)
    return Response(status_code=204)
