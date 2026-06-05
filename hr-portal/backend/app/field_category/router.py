"""字段分类 CRUD + 字段分配 + 角色/用户可见分类授权"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_op
from app.field_category.models import (
    FieldCategory,
    FieldCategoryAssignment,
    RoleVisibleCategory,
    UserVisibleCategory,
)
from app.users.models import Role, User


router = APIRouter(prefix="/field-categories", tags=["field-categories"])


class CategoryIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    description: str | None = None
    is_sensitive: bool = False


class CategoryOut(BaseModel):
    id: int
    name: str
    description: str | None
    is_sensitive: bool
    field_count: int = 0


class AssignmentItem(BaseModel):
    table_name: str = Field(..., min_length=1, max_length=64)
    column_name: str = Field(..., min_length=1, max_length=64)


class SetAssignmentsIn(BaseModel):
    items: list[AssignmentItem] = []


@router.get("", response_model=list[CategoryOut])
async def list_categories(
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.field_categories", "V")),
) -> list[CategoryOut]:
    cats = (
        await db.execute(select(FieldCategory).order_by(FieldCategory.id))
    ).scalars().all()
    out: list[CategoryOut] = []
    for c in cats:
        cnt = (
            await db.execute(
                select(func.count())
                .select_from(FieldCategoryAssignment)
                .where(FieldCategoryAssignment.category_id == c.id)
            )
        ).scalar_one()
        out.append(
            CategoryOut(
                id=c.id,
                name=c.name,
                description=c.description,
                is_sensitive=c.is_sensitive,
                field_count=cnt,
            )
        )
    return out


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(
    payload: CategoryIn,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.field_categories", "C")),
) -> CategoryOut:
    exists = (
        await db.execute(select(FieldCategory).where(FieldCategory.name == payload.name))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="分类名已存在")
    cat = FieldCategory(
        name=payload.name,
        description=payload.description,
        is_sensitive=payload.is_sensitive,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return CategoryOut(
        id=cat.id,
        name=cat.name,
        description=cat.description,
        is_sensitive=cat.is_sensitive,
        field_count=0,
    )


@router.put("/{cat_id}", response_model=CategoryOut)
async def update_category(
    cat_id: int,
    payload: CategoryIn,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.field_categories", "U")),
) -> CategoryOut:
    cat = await db.get(FieldCategory, cat_id)
    if cat is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="分类不存在")
    if payload.name != cat.name:
        dup = (
            await db.execute(
                select(FieldCategory).where(
                    FieldCategory.name == payload.name, FieldCategory.id != cat_id
                )
            )
        ).scalar_one_or_none()
        if dup:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="分类名已存在")
    cat.name = payload.name
    cat.description = payload.description
    cat.is_sensitive = payload.is_sensitive
    await db.commit()
    cnt = (
        await db.execute(
            select(func.count())
            .select_from(FieldCategoryAssignment)
            .where(FieldCategoryAssignment.category_id == cat.id)
        )
    ).scalar_one()
    return CategoryOut(
        id=cat.id,
        name=cat.name,
        description=cat.description,
        is_sensitive=cat.is_sensitive,
        field_count=cnt,
    )


@router.delete("/{cat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    cat_id: int,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.field_categories", "D")),
) -> None:
    cat = await db.get(FieldCategory, cat_id)
    if cat is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="分类不存在")
    await db.delete(cat)
    await db.commit()


@router.get("/{cat_id}/assignments", response_model=list[AssignmentItem])
async def list_assignments(
    cat_id: int,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.field_categories", "V")),
) -> list[AssignmentItem]:
    rows = (
        await db.execute(
            select(FieldCategoryAssignment)
            .where(FieldCategoryAssignment.category_id == cat_id)
            .order_by(
                FieldCategoryAssignment.table_name,
                FieldCategoryAssignment.column_name,
            )
        )
    ).scalars().all()
    return [
        AssignmentItem(table_name=r.table_name, column_name=r.column_name)
        for r in rows
    ]


@router.put("/{cat_id}/assignments", response_model=list[AssignmentItem])
async def set_assignments(
    cat_id: int,
    payload: SetAssignmentsIn,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.field_categories", "U")),
) -> list[AssignmentItem]:
    cat = await db.get(FieldCategory, cat_id)
    if cat is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="分类不存在")

    # 删后重建
    existing = (
        await db.execute(
            select(FieldCategoryAssignment).where(
                FieldCategoryAssignment.category_id == cat_id
            )
        )
    ).scalars().all()
    for r in existing:
        await db.delete(r)
    await db.flush()

    # 去重
    seen: set[tuple[str, str]] = set()
    for it in payload.items:
        key = (it.table_name, it.column_name)
        if key in seen:
            continue
        seen.add(key)
        db.add(
            FieldCategoryAssignment(
                category_id=cat_id,
                table_name=it.table_name,
                column_name=it.column_name,
            )
        )
    await db.commit()
    return [AssignmentItem(table_name=t, column_name=c) for t, c in sorted(seen)]

# ===== 角色 ↔ 可见分类 =====


class CategoryIdsIn(BaseModel):
    category_ids: list[int] = Field(default_factory=list)


@router.get("/_role/{role_id}", response_model=list[int])
async def list_role_visible_categories(
    role_id: int,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.field_categories", "V")),
) -> list[int]:
    role = await db.get(Role, role_id)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="角色不存在")
    rows = (
        await db.execute(
            select(RoleVisibleCategory.category_id).where(
                RoleVisibleCategory.role_id == role_id
            )
        )
    ).all()
    return [r[0] for r in rows]


@router.put("/_role/{role_id}")
async def set_role_visible_categories(
    role_id: int,
    payload: CategoryIdsIn,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.roles", "U")),
) -> dict:
    role = await db.get(Role, role_id)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="角色不存在")

    if payload.category_ids:
        rows = (
            await db.execute(
                select(FieldCategory.id).where(FieldCategory.id.in_(payload.category_ids))
            )
        ).all()
        found = {r[0] for r in rows}
        missing = set(payload.category_ids) - found
        if missing:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"以下分类不存在: {sorted(missing)}",
            )

    await db.execute(
        delete(RoleVisibleCategory).where(RoleVisibleCategory.role_id == role_id)
    )
    for cid in payload.category_ids:
        db.add(RoleVisibleCategory(role_id=role_id, category_id=cid))
    await db.commit()
    return {"ok": True, "count": len(payload.category_ids)}


# ===== 用户 ↔ 可见分类（额外授权，叠加在角色之上）=====


@router.get("/_user/{user_id}", response_model=list[int])
async def list_user_visible_categories(
    user_id: int,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.field_categories", "V")),
) -> list[int]:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="用户不存在")
    rows = (
        await db.execute(
            select(UserVisibleCategory.category_id).where(
                UserVisibleCategory.user_id == user_id
            )
        )
    ).all()
    return [r[0] for r in rows]


@router.put("/_user/{user_id}")
async def set_user_visible_categories(
    user_id: int,
    payload: CategoryIdsIn,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.users", "U")),
) -> dict:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="用户不存在")

    if payload.category_ids:
        rows = (
            await db.execute(
                select(FieldCategory.id).where(FieldCategory.id.in_(payload.category_ids))
            )
        ).all()
        found = {r[0] for r in rows}
        missing = set(payload.category_ids) - found
        if missing:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"以下分类不存在: {sorted(missing)}",
            )

    await db.execute(
        delete(UserVisibleCategory).where(UserVisibleCategory.user_id == user_id)
    )
    for cid in payload.category_ids:
        db.add(UserVisibleCategory(user_id=user_id, category_id=cid))
    await db.commit()
    return {"ok": True, "count": len(payload.category_ids)}
