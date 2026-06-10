"""全局字段字典 CRUD + 授权工具白名单管理

权限菜单：system.global_fields
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_op
from app.data.models import TableColumn
from app.field_category.models import FieldCategory
from app.global_fields.models import FieldCategoryToolWhitelist, GlobalField


router = APIRouter(prefix="/global-fields", tags=["global-fields"])


SCOPE_ROLES = {"cc_code", "org_node_code", "employment_type", "employment_entity", "person"}

# 可纳入白名单的工具（key 与提效工具菜单 code 后缀对应）
TOOLS = [
    {"key": "compensation_calc", "label": "补偿金计算"},
    {"key": "income_certificate", "label": "证明开具"},
]


class GlobalFieldIn(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=128)
    data_type: str = "string"
    agg_role: str = "dimension"
    scope_role: str | None = None
    category_id: int | None = None
    description: str | None = None


class GlobalFieldOut(BaseModel):
    id: int
    code: str
    label: str
    data_type: str
    agg_role: str
    scope_role: str | None
    category_id: int | None
    category_name: str | None
    description: str | None
    claimed_count: int
    created_at: datetime
    updated_at: datetime


async def _to_out(g: GlobalField, db: AsyncSession) -> GlobalFieldOut:
    cat_name = None
    if g.category_id:
        cat = await db.get(FieldCategory, g.category_id)
        cat_name = cat.name if cat else None
    cnt = (
        await db.execute(
            select(func.count())
            .select_from(TableColumn)
            .where(TableColumn.global_field_id == g.id)
        )
    ).scalar_one()
    return GlobalFieldOut(
        id=g.id,
        code=g.code,
        label=g.label,
        data_type=g.data_type,
        agg_role=g.agg_role,
        scope_role=g.scope_role,
        category_id=g.category_id,
        category_name=cat_name,
        description=g.description,
        claimed_count=cnt,
        created_at=g.created_at,
        updated_at=g.updated_at,
    )


def _validate(payload: GlobalFieldIn) -> None:
    if payload.scope_role is not None and payload.scope_role not in SCOPE_ROLES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="非法的权限角色")


@router.get("/tools")
async def list_tools(_=Depends(require_op("system.global_fields", "V"))) -> list[dict]:
    return TOOLS


@router.get("", response_model=list[GlobalFieldOut])
async def list_global_fields(
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.global_fields", "V")),
) -> list[GlobalFieldOut]:
    rows = (await db.execute(select(GlobalField).order_by(GlobalField.id))).scalars().all()
    return [await _to_out(g, db) for g in rows]


@router.post("", response_model=GlobalFieldOut, status_code=status.HTTP_201_CREATED)
async def create_global_field(
    payload: GlobalFieldIn,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.global_fields", "C")),
) -> GlobalFieldOut:
    _validate(payload)
    exists = (
        await db.execute(select(GlobalField).where(GlobalField.code == payload.code))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="全局字段编码已存在")
    g = GlobalField(
        code=payload.code,
        label=payload.label,
        data_type=payload.data_type,
        agg_role=payload.agg_role,
        scope_role=payload.scope_role,
        category_id=payload.category_id,
        description=payload.description,
    )
    db.add(g)
    await db.commit()
    await db.refresh(g)
    return await _to_out(g, db)


@router.put("/{field_id}", response_model=GlobalFieldOut)
async def update_global_field(
    field_id: int,
    payload: GlobalFieldIn,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.global_fields", "U")),
) -> GlobalFieldOut:
    _validate(payload)
    g = await db.get(GlobalField, field_id)
    if g is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="全局字段不存在")
    if payload.code != g.code:
        dup = (
            await db.execute(select(GlobalField).where(GlobalField.code == payload.code))
        ).scalar_one_or_none()
        if dup:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="全局字段编码已存在")
    g.code = payload.code
    g.label = payload.label
    g.data_type = payload.data_type
    g.agg_role = payload.agg_role
    g.scope_role = payload.scope_role
    g.category_id = payload.category_id
    g.description = payload.description
    await db.commit()
    await db.refresh(g)
    return await _to_out(g, db)


@router.delete("/{field_id}")
async def delete_global_field(
    field_id: int,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.global_fields", "D")),
) -> dict[str, bool]:
    g = await db.get(GlobalField, field_id)
    if g is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="全局字段不存在")
    cnt = (
        await db.execute(
            select(func.count())
            .select_from(TableColumn)
            .where(TableColumn.global_field_id == field_id)
        )
    ).scalar_one()
    if cnt > 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"仍有 {cnt} 个物理列认领了该全局字段，请先解除认领",
        )
    await db.delete(g)
    await db.commit()
    return {"ok": True}


# ===== 授权工具白名单 =====

class WhitelistIn(BaseModel):
    tool_keys: list[str] = Field(default_factory=list)


@router.get("/categories/{category_id}/whitelist")
async def get_whitelist(
    category_id: int,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.global_fields", "V")),
) -> dict:
    rows = (
        await db.execute(
            select(FieldCategoryToolWhitelist.tool_key).where(
                FieldCategoryToolWhitelist.category_id == category_id
            )
        )
    ).all()
    return {"category_id": category_id, "tool_keys": [r[0] for r in rows]}


@router.put("/categories/{category_id}/whitelist")
async def set_whitelist(
    category_id: int,
    payload: WhitelistIn,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.global_fields", "U")),
) -> dict:
    from sqlalchemy import delete as sa_delete

    cat = await db.get(FieldCategory, category_id)
    if cat is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="字段分类不存在")
    valid_keys = {t["key"] for t in TOOLS}
    await db.execute(
        sa_delete(FieldCategoryToolWhitelist).where(
            FieldCategoryToolWhitelist.category_id == category_id
        )
    )
    for k in payload.tool_keys:
        if k not in valid_keys:
            continue
        db.add(FieldCategoryToolWhitelist(category_id=category_id, tool_key=k))
    await db.commit()
    return {"category_id": category_id, "tool_keys": payload.tool_keys}
