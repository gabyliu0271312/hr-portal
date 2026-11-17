from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_op
from app.users.models import User
from app.warehouse.schemas import (
    FieldGroupCreateIn,
    FieldGroupListOut,
    FieldGroupOut,
    FieldGroupUpdateIn,
    PeopleFieldsOut,
    StandardFieldBindingActionIn,
    StandardFieldBindingCandidateOut,
    StandardFieldBindingCreateIn,
    StandardFieldBindingOut,
    StandardFieldCreateIn,
    StandardFieldUpdateIn,
    StandardFieldDetailOut,
    StandardFieldListOut,
    StandardFieldReorderIn,
)
from app.warehouse.service import standard_fields as service

router = APIRouter(prefix="/standard-fields")

CATALOG_MENU = "warehouse.standard_fields.catalog"


@router.get("/groups", response_model=FieldGroupListOut)
async def list_groups(
    user: User = Depends(require_op(CATALOG_MENU, "V")),
    db: AsyncSession = Depends(get_session),
):
    return await service.list_field_groups(db, user=user)


@router.post("/groups", response_model=FieldGroupOut, status_code=201)
async def create_group(
    payload: FieldGroupCreateIn,
    user: User = Depends(require_op(CATALOG_MENU, "C")),
    db: AsyncSession = Depends(get_session),
):
    return await service.create_field_group(db, payload, user)


@router.put("/groups/{group_id}", response_model=FieldGroupOut)
async def update_group(
    payload: FieldGroupUpdateIn,
    group_id: int = Path(..., gt=0),
    user: User = Depends(require_op(CATALOG_MENU, "U")),
    db: AsyncSession = Depends(get_session),
):
    return await service.update_field_group(db, group_id, payload, user)


@router.get("", response_model=StandardFieldListOut)
async def list_fields(
    entity_id: int | None = Query(None, gt=0),
    group_id: int | None = Query(None, gt=0),
    keyword: str | None = Query(None, min_length=1, max_length=128),
    is_active: bool | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    user: User = Depends(require_op(CATALOG_MENU, "V")),
    db: AsyncSession = Depends(get_session),
):
    return await service.list_standard_fields(db, keyword, is_active, offset, limit, user=user, entity_id=entity_id, group_id=group_id)


@router.get("/people-fields", response_model=PeopleFieldsOut)
async def list_people_fields(
    user: User = Depends(require_op("people.app", "V")),
    db: AsyncSession = Depends(get_session),
):
    """人员信息页只读字段清单（分组联动）。

    面向创梦人力人员信息页的普通查看者（people.app 入口权限），无需后台字段目录权限；
    只返回展示所需元数据（编码/名称/类型/分组/归属实体），不含敏感分类与枚举明细。
    字段来自 form_field_bindings 中 form_key=people_roster 的绑定。
    """
    return await service.list_people_fields(db, user=user)


# ─── 表单列配置（字段与表单分离） ──────────────────────────────────────────────


@router.get("/forms/{form_key}/fields", response_model=PeopleFieldsOut)
async def list_form_fields(
    form_key: str,
    user: User = Depends(require_op(CATALOG_MENU, "V")),
    db: AsyncSession = Depends(get_session),
):
    """读表单（form_key）当前绑定的字段清单（含停用，供管理展示）。"""
    fields = await service.list_form_bindings(db, form_key, user=user)
    return PeopleFieldsOut(total=len(fields), items=[PeopleFieldOut(
        id=f.id, field_code=f.field_code, field_name=f.display_name, data_type=f.data_type,
        entity_id=getattr(f, "entity_id", None), entity_name=None,
        group_id=getattr(f, "group_id", None), group_name=None,
        display_order=f.display_order, is_active=f.is_active,
    ) for f in fields])


@router.post("/forms/{form_key}/fields/{field_id}", status_code=201)
async def add_form_field(
    form_key: str,
    field_id: int = Path(..., gt=0),
    user: User = Depends(require_op(CATALOG_MENU, "U")),
    db: AsyncSession = Depends(get_session),
):
    """向表单添加一个标准字段（表单列 ≠ 标准字段本身）。"""
    await service.add_form_field(db, form_key, field_id, user=user)
    return {"ok": True}


@router.delete("/forms/{form_key}/fields/{field_id}", status_code=204)
async def remove_form_field(
    form_key: str,
    field_id: int = Path(..., gt=0),
    user: User = Depends(require_op(CATALOG_MENU, "U")),
    db: AsyncSession = Depends(get_session),
):
    """从表单移除一个字段（不删除标准字段本身）。"""
    await service.remove_form_field(db, form_key, field_id, user=user)
    return Response(status_code=204)


@router.put("/forms/{form_key}/order", response_model=dict)
async def reorder_form_fields(
    form_key: str,
    payload: StandardFieldReorderIn,
    user: User = Depends(require_op(CATALOG_MENU, "U")),
    db: AsyncSession = Depends(get_session),
):
    """表单字段排序：按全量有序字段 ID 重排 display_order。"""
    return await service.reorder_form_fields(db, form_key, payload.ordered_ids, user)


@router.put("/order", response_model=dict)
async def reorder_fields(
    payload: StandardFieldReorderIn,
    user: User = Depends(require_op(CATALOG_MENU, "U")),
    db: AsyncSession = Depends(get_session),
):
    """字段拖拽排序：按全量有序字段 ID 重排 display_order。"""
    return await service.reorder_standard_fields(db, payload.ordered_ids, user)


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
