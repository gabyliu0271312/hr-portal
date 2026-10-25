from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_op
from app.users.models import User
from app.warehouse.schemas import (
    StandardFieldActionIn,
    StandardFieldBindingActionIn,
    StandardFieldBindingCandidateOut,
    StandardFieldBindingCreateIn,
    StandardFieldBindingOut,
    StandardFieldCreateIn,
    StandardFieldDisplayUpdateIn,
    StandardFieldDetailOut,
    StandardFieldListOut,
    StandardFieldStatus,
    StandardFieldVersionCreateIn,
    StandardFieldVersionOut,
    StandardFieldVersionUpdateIn,
    StandardFieldValueDomainUpdateIn,
)
from app.warehouse.service import standard_fields as service

router = APIRouter(prefix="/standard-fields")

CATALOG_MENU = "warehouse.standard_fields.catalog"


@router.get("", response_model=StandardFieldListOut)
async def list_fields(
    keyword: str | None = Query(None, min_length=1, max_length=128),
    status: StandardFieldStatus | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    user: User = Depends(require_op(CATALOG_MENU, "V")),
    db: AsyncSession = Depends(get_session),
):
    return await service.list_standard_fields(db, keyword, status, offset, limit)


@router.get("/{field_id}", response_model=StandardFieldDetailOut)
async def get_field(
    field_id: int = Path(..., gt=0),
    user: User = Depends(require_op(CATALOG_MENU, "V")),
    db: AsyncSession = Depends(get_session),
):
    return await service.read_standard_field(db, field_id)


@router.post("", response_model=StandardFieldDetailOut, status_code=201)
async def create_field(
    payload: StandardFieldCreateIn,
    user: User = Depends(require_op(CATALOG_MENU, "C")),
    db: AsyncSession = Depends(get_session),
):
    return await service.create_standard_field(db, payload, user)


@router.patch("/{field_id}/display-name", response_model=StandardFieldDetailOut)
async def update_display_name(
    payload: StandardFieldDisplayUpdateIn,
    field_id: int = Path(..., gt=0),
    user: User = Depends(require_op(CATALOG_MENU, "U")),
    db: AsyncSession = Depends(get_session),
):
    """修改展示名称，不创建语义版本，不改变授权绑定。"""
    return await service.update_standard_field_display_name(db, field_id, payload, user)


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


@router.put("/{field_id}/versions/{version_id}/value-domain", response_model=StandardFieldVersionOut)
async def update_value_domain(
    payload: StandardFieldValueDomainUpdateIn,
    field_id: int = Path(..., gt=0),
    version_id: int = Path(..., gt=0),
    user: User = Depends(require_op(CATALOG_MENU, "U")),
    db: AsyncSession = Depends(get_session),
):
    return await service.update_standard_field_value_domain(db, field_id, version_id, payload, user)


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


@router.post("/{field_id}/versions", response_model=StandardFieldVersionOut, status_code=201)
async def create_version(
    payload: StandardFieldVersionCreateIn,
    field_id: int = Path(..., gt=0),
    user: User = Depends(require_op(CATALOG_MENU, "C")),
    db: AsyncSession = Depends(get_session),
):
    return await service.create_standard_field_version(db, field_id, payload, user)


@router.put("/{field_id}/versions/{version_id}", response_model=StandardFieldVersionOut)
async def update_version(
    payload: StandardFieldVersionUpdateIn,
    field_id: int = Path(..., gt=0),
    version_id: int = Path(..., gt=0),
    user: User = Depends(require_op(CATALOG_MENU, "U")),
    db: AsyncSession = Depends(get_session),
):
    return await service.update_standard_field_version(db, field_id, version_id, payload, user)


@router.post("/{field_id}/versions/{version_id}/approve", response_model=StandardFieldVersionOut)
async def approve_version(
    payload: StandardFieldActionIn,
    field_id: int = Path(..., gt=0),
    version_id: int = Path(..., gt=0),
    user: User = Depends(require_op(CATALOG_MENU, "U")),
    db: AsyncSession = Depends(get_session),
):
    return await service.transition_standard_field_version(db, field_id, version_id, payload, user, "active")


@router.post("/{field_id}/versions/{version_id}/deprecate", response_model=StandardFieldVersionOut)
async def deprecate_version(
    payload: StandardFieldActionIn,
    field_id: int = Path(..., gt=0),
    version_id: int = Path(..., gt=0),
    user: User = Depends(require_op(CATALOG_MENU, "U")),
    db: AsyncSession = Depends(get_session),
):
    return await service.transition_standard_field_version(db, field_id, version_id, payload, user, "deprecated")


@router.post("/{field_id}/versions/{version_id}/archive", response_model=StandardFieldVersionOut)
async def archive_version(
    payload: StandardFieldActionIn,
    field_id: int = Path(..., gt=0),
    version_id: int = Path(..., gt=0),
    user: User = Depends(require_op(CATALOG_MENU, "D")),
    db: AsyncSession = Depends(get_session),
):
    return await service.transition_standard_field_version(db, field_id, version_id, payload, user, "archived")


@router.delete("/{field_id}", status_code=204)
async def delete_field(
    field_id: int = Path(..., gt=0),
    expected_version: int = Query(..., ge=1),
    expected_revision: int = Query(..., ge=0),
    user: User = Depends(require_op(CATALOG_MENU, "D")),
    db: AsyncSession = Depends(get_session),
):
    await service.delete_standard_field(db, field_id, expected_version, expected_revision, user)
    return Response(status_code=204)
