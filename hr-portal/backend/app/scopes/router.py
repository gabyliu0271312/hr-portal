"""数据范围标签路由（FR-SCOPE-* 新版语义）

每个标签 = 「管理组织范围」+「管理人员范围」两段
- 管理组织范围：dimension(cost_center|org) + selections（节点选择）+ org_scope_unlimited
- 管理人员范围：filters（用工类型/用工主体/人员 三选一字段，eq/neq，多值）

CRUD：
- GET    /scopes
- POST   /scopes
- GET    /scopes/{id}
- PUT    /scopes/{id}
- DELETE /scopes/{id}（被引用 → 409）

约定：name 全局唯一；selections / filters 都是替换式更新
"""
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.scopes.models import (
    ScopeTag,
    ScopeTagFilter,
    ScopeTagSelection,
    UserScopeTag,
)
from app.users.models import User


router = APIRouter(prefix="/scopes", tags=["scopes"])


# ===== Schemas =====


class SelectionIn(BaseModel):
    node_id: int
    include_descendants: bool = False


class SelectionOut(SelectionIn):
    id: int


class FilterIn(BaseModel):
    field_code: Literal["employment_type", "employment_entity", "person"]
    operator: Literal["eq", "neq"]
    values: list[str] = Field(min_length=1)
    order_index: int = 0

    @field_validator("values")
    @classmethod
    def _strip_empty(cls, v: list[str]) -> list[str]:
        out = [s for s in (x.strip() for x in v) if s]
        if not out:
            raise ValueError("values 至少需要 1 个非空值")
        return out


class FilterOut(FilterIn):
    id: int


class ScopeIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    description: str | None = None
    dimension: Literal["cost_center", "org"]
    org_scope_enabled: bool = True
    org_scope_unlimited: bool = False
    selections: list[SelectionIn] = Field(default_factory=list)
    person_scope_enabled: bool = False
    filters: list[FilterIn] = Field(default_factory=list)


class ScopeOut(BaseModel):
    id: int
    name: str
    description: str | None
    dimension: str
    org_scope_enabled: bool
    org_scope_unlimited: bool
    selections: list[SelectionOut]
    person_scope_enabled: bool
    filters: list[FilterOut]
    used_by_users: int
    created_at: datetime
    updated_at: datetime


# ===== 工具 =====


async def _to_out(t: ScopeTag, db: AsyncSession) -> ScopeOut:
    sels = (
        (
            await db.execute(
                select(ScopeTagSelection)
                .where(ScopeTagSelection.tag_id == t.id, ScopeTagSelection.node_id.is_not(None))
                .order_by(ScopeTagSelection.id)
            )
        )
        .scalars()
        .all()
    )
    fs = (
        (
            await db.execute(
                select(ScopeTagFilter)
                .where(ScopeTagFilter.tag_id == t.id)
                .order_by(ScopeTagFilter.order_index, ScopeTagFilter.id)
            )
        )
        .scalars()
        .all()
    )
    used = (
        await db.execute(
            select(UserScopeTag).where(UserScopeTag.tag_id == t.id)
        )
    ).all()
    return ScopeOut(
        id=t.id,
        name=t.name,
        description=t.description,
        dimension=t.dimension,
        org_scope_enabled=t.org_scope_enabled,
        org_scope_unlimited=t.org_scope_unlimited,
        selections=[
            SelectionOut(id=s.id, node_id=s.node_id, include_descendants=s.include_descendants)
            for s in sels
        ],
        person_scope_enabled=t.person_scope_enabled,
        filters=[
            FilterOut(
                id=f.id,
                field_code=f.field_code,
                operator=f.operator,
                values=list(f.values or []),
                order_index=f.order_index,
            )
            for f in fs
        ],
        used_by_users=len(used),
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


def _validate_payload(payload: ScopeIn) -> None:
    if not payload.org_scope_enabled and not payload.person_scope_enabled:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="标签至少需启用「管理组织范围」或「管理人员范围」之一",
        )
    if (
        payload.org_scope_enabled
        and not payload.org_scope_unlimited
        and not payload.selections
    ):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="启用「管理组织范围」时，请勾选节点或选择「不限范围」",
        )
    if payload.person_scope_enabled and not payload.filters:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="启用「管理人员范围」时，请至少添加 1 条筛选条件",
        )


# ===== Endpoints =====


@router.get("", response_model=list[ScopeOut])
async def list_scopes(
    dimension: str | None = None,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[ScopeOut]:
    stmt = select(ScopeTag).order_by(ScopeTag.dimension, ScopeTag.name)
    if dimension:
        stmt = stmt.where(ScopeTag.dimension == dimension)
    rows = (await db.execute(stmt)).scalars().all()
    return [await _to_out(r, db) for r in rows]


@router.post(
    "",
    response_model=ScopeOut,
    dependencies=[Depends(require_op("system.scopes", "C"))],
)
async def create_scope(
    payload: ScopeIn,
    db: AsyncSession = Depends(get_session),
) -> ScopeOut:
    _validate_payload(payload)

    exists = (
        await db.execute(select(ScopeTag).where(ScopeTag.name == payload.name))
    ).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="标签名已存在")

    t = ScopeTag(
        name=payload.name,
        description=payload.description,
        dimension=payload.dimension,
        org_scope_enabled=payload.org_scope_enabled,
        org_scope_unlimited=payload.org_scope_unlimited,
        person_scope_enabled=payload.person_scope_enabled,
    )
    db.add(t)
    await db.flush()

    if payload.org_scope_enabled and not payload.org_scope_unlimited:
        for s in payload.selections:
            db.add(
                ScopeTagSelection(
                    tag_id=t.id,
                    node_id=s.node_id,
                    include_descendants=s.include_descendants,
                )
            )

    if payload.person_scope_enabled:
        for f in payload.filters:
            db.add(
                ScopeTagFilter(
                    tag_id=t.id,
                    field_code=f.field_code,
                    operator=f.operator,
                    values=f.values,
                    order_index=f.order_index,
                )
            )

    await db.commit()
    await db.refresh(t)
    return await _to_out(t, db)


@router.get("/{tag_id}", response_model=ScopeOut)
async def get_scope(
    tag_id: int,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> ScopeOut:
    t = await db.get(ScopeTag, tag_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="标签不存在")
    return await _to_out(t, db)


@router.put(
    "/{tag_id}",
    response_model=ScopeOut,
    dependencies=[Depends(require_op("system.scopes", "U"))],
)
async def update_scope(
    tag_id: int,
    payload: ScopeIn,
    db: AsyncSession = Depends(get_session),
) -> ScopeOut:
    _validate_payload(payload)

    t = await db.get(ScopeTag, tag_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="标签不存在")

    if t.name != payload.name:
        exists = (
            await db.execute(
                select(ScopeTag).where(
                    ScopeTag.name == payload.name, ScopeTag.id != tag_id
                )
            )
        ).scalar_one_or_none()
        if exists is not None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="标签名已存在")

    t.name = payload.name
    t.description = payload.description
    t.dimension = payload.dimension
    t.org_scope_enabled = payload.org_scope_enabled
    t.org_scope_unlimited = payload.org_scope_unlimited
    t.person_scope_enabled = payload.person_scope_enabled

    # 替换式更新 selections
    await db.execute(delete(ScopeTagSelection).where(ScopeTagSelection.tag_id == tag_id))
    if payload.org_scope_enabled and not payload.org_scope_unlimited:
        for s in payload.selections:
            db.add(
                ScopeTagSelection(
                    tag_id=tag_id,
                    node_id=s.node_id,
                    include_descendants=s.include_descendants,
                )
            )

    # 替换式更新 filters
    await db.execute(delete(ScopeTagFilter).where(ScopeTagFilter.tag_id == tag_id))
    if payload.person_scope_enabled:
        for f in payload.filters:
            db.add(
                ScopeTagFilter(
                    tag_id=tag_id,
                    field_code=f.field_code,
                    operator=f.operator,
                    values=f.values,
                    order_index=f.order_index,
                )
            )

    await db.commit()
    await db.refresh(t)
    return await _to_out(t, db)


@router.delete(
    "/{tag_id}",
    dependencies=[Depends(require_op("system.scopes", "D"))],
)
async def delete_scope(
    tag_id: int,
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    t = await db.get(ScopeTag, tag_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="标签不存在")

    refs = (
        await db.execute(select(UserScopeTag).where(UserScopeTag.tag_id == tag_id))
    ).all()
    if refs:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"该标签正在被 {len(refs)} 个用户使用，无法删除",
        )
    await db.delete(t)
    await db.commit()
    return {"ok": True}


# ===== 用户 ↔ 标签绑定 =====


class UserTagsIn(BaseModel):
    tag_ids: list[int] = Field(default_factory=list)


@router.put(
    "/_user/{user_id}",
    dependencies=[Depends(require_op("system.users", "U"))],
)
async def assign_user_tags(
    user_id: int,
    payload: UserTagsIn,
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="用户不存在")

    if payload.tag_ids:
        rows = (
            await db.execute(
                select(ScopeTag.id).where(ScopeTag.id.in_(payload.tag_ids))
            )
        ).all()
        found = {r[0] for r in rows}
        missing = set(payload.tag_ids) - found
        if missing:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"以下标签不存在: {sorted(missing)}",
            )

    await db.execute(delete(UserScopeTag).where(UserScopeTag.user_id == user_id))
    for tid in payload.tag_ids:
        db.add(UserScopeTag(user_id=user_id, tag_id=tid))
    await db.commit()
    return {"ok": True, "count": len(payload.tag_ids)}


@router.get("/_user/{user_id}", response_model=list[ScopeOut])
async def list_user_tags(
    user_id: int,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[ScopeOut]:
    rows = (
        await db.execute(
            select(ScopeTag)
            .join(UserScopeTag, UserScopeTag.tag_id == ScopeTag.id)
            .where(UserScopeTag.user_id == user_id)
            .order_by(ScopeTag.dimension, ScopeTag.name)
        )
    ).scalars().all()
    return [await _to_out(t, db) for t in rows]
