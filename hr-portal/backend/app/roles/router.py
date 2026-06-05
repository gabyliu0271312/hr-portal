"""Roles 路由：角色 CRUD + 菜单 × 操作矩阵设置"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_op
from app.users.models import Menu, Role, RoleMenu, UserRole
from app.roles.schemas import (
    RoleCreateIn,
    RoleDetail,
    RoleListItem,
    RoleListResp,
    RoleMenuItem,
    RoleUpdateIn,
)


router = APIRouter(prefix="/roles", tags=["roles"])


VALID_SCOPE = {"cost_center", "org", "none"}


async def _get_or_404(db: AsyncSession, role_id: int) -> Role:
    role = await db.get(Role, role_id)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="角色不存在")
    return role


async def _detail(db: AsyncSession, role: Role) -> RoleDetail:
    # role.role_menus 已 eager load
    menus = [
        RoleMenuItem(
            menu_id=rm.menu_id,
            scope_dimension=rm.scope_dimension,
            can_view=rm.can_view,
            can_create=rm.can_create,
            can_update=rm.can_update,
            can_delete=rm.can_delete,
            can_export=rm.can_export,
        )
        for rm in role.role_menus
    ]
    user_count = (
        await db.execute(
            select(func.count()).select_from(UserRole).where(UserRole.role_id == role.id)
        )
    ).scalar_one()
    return RoleDetail(
        id=role.id,
        name=role.name,
        description=role.description,
        is_active=role.is_active,
        user_count=user_count,
        menus=menus,
    )


async def _replace_menus(
    db: AsyncSession, role: Role, items: list[RoleMenuItem]
) -> None:
    # 校验
    for it in items:
        if it.scope_dimension not in VALID_SCOPE:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"非法 scope_dimension: {it.scope_dimension}",
            )
    menu_ids = [it.menu_id for it in items]
    if menu_ids:
        valid = (
            await db.execute(select(Menu.id).where(Menu.id.in_(menu_ids)))
        ).scalars().all()
        invalid = set(menu_ids) - set(valid)
        if invalid:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail=f"菜单不存在: {invalid}"
            )

    # 删后重建
    existing = (
        await db.execute(select(RoleMenu).where(RoleMenu.role_id == role.id))
    ).scalars().all()
    for rm in existing:
        await db.delete(rm)
    await db.flush()

    for it in items:
        db.add(
            RoleMenu(
                role_id=role.id,
                menu_id=it.menu_id,
                scope_dimension=it.scope_dimension,
                can_view=it.can_view,
                can_create=it.can_create,
                can_update=it.can_update,
                can_delete=it.can_delete,
                can_export=it.can_export,
            )
        )


# ==================== List ====================


@router.get("", response_model=RoleListResp)
async def list_roles(
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.roles", "V")),
) -> RoleListResp:
    roles = (
        await db.execute(select(Role).order_by(Role.id))
    ).scalars().unique().all()
    items: list[RoleListItem] = []
    for r in roles:
        user_count = (
            await db.execute(
                select(func.count())
                .select_from(UserRole)
                .where(UserRole.role_id == r.id)
            )
        ).scalar_one()
        items.append(
            RoleListItem(
                id=r.id,
                name=r.name,
                description=r.description,
                is_active=r.is_active,
                user_count=user_count,
                menu_count=len(r.role_menus),
                created_at=r.created_at,
            )
        )
    return RoleListResp(items=items, total=len(items))


@router.post("", response_model=RoleDetail, status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: RoleCreateIn,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.roles", "C")),
) -> RoleDetail:
    exists = (
        await db.execute(select(Role).where(Role.name == payload.name))
    ).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="角色名已存在")

    role = Role(name=payload.name, description=payload.description, is_active=True)
    db.add(role)
    await db.flush()

    await _replace_menus(db, role, payload.menus)
    await db.commit()
    await db.refresh(role)
    return await _detail(db, role)


@router.get("/{role_id}", response_model=RoleDetail)
async def get_role(
    role_id: int,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.roles", "V")),
) -> RoleDetail:
    role = await _get_or_404(db, role_id)
    return await _detail(db, role)


@router.put("/{role_id}", response_model=RoleDetail)
async def update_role(
    role_id: int,
    payload: RoleUpdateIn,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.roles", "U")),
) -> RoleDetail:
    role = await _get_or_404(db, role_id)

    if payload.name is not None and payload.name != role.name:
        # 重名校验
        dup = (
            await db.execute(
                select(Role).where(Role.name == payload.name, Role.id != role_id)
            )
        ).scalar_one_or_none()
        if dup is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="角色名已存在")
        role.name = payload.name

    if payload.description is not None:
        role.description = payload.description
    if payload.is_active is not None:
        role.is_active = payload.is_active

    if payload.menus is not None:
        await _replace_menus(db, role, payload.menus)

    await db.commit()
    await db.refresh(role)
    return await _detail(db, role)


@router.post("/{role_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_role(
    role_id: int,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.roles", "U")),
) -> None:
    role = await _get_or_404(db, role_id)
    role.is_active = False
    await db.commit()


@router.post("/{role_id}/activate", status_code=status.HTTP_204_NO_CONTENT)
async def activate_role(
    role_id: int,
    db: AsyncSession = Depends(get_session),
    _=Depends(require_op("system.roles", "U")),
) -> None:
    role = await _get_or_404(db, role_id)
    role.is_active = True
    await db.commit()