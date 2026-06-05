"""Users 路由：用户 CRUD + 启停 + 重置密码 + 角色绑定"""
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.password import hash_password, is_strong_enough
from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.users.models import Role, User, UserRole
from app.users.schemas import (
    ResetPasswordIn,
    SetRolesIn,
    UserCreateIn,
    UserDetail,
    UserListItem,
    UserListResp,
    UserUpdateIn,
)


router = APIRouter(prefix="/users", tags=["users"])


# ==================== Helpers ====================


async def _get_user_or_404(db: AsyncSession, user_id: int) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="用户不存在")
    return user


async def _user_to_list_item(user: User) -> UserListItem:
    return UserListItem(
        id=user.id,
        login_name=user.login_name,
        display_name=user.display_name,
        email=user.email,
        is_active=user.is_active,
        last_login_at=user.last_login_at,
        locked_until=user.locked_until,
        role_names=[r.name for r in user.roles],
    )


# ==================== List ====================


@router.get("", response_model=UserListResp)
async def list_users(
    db: AsyncSession = Depends(get_session),
    _: User = Depends(require_op("system.users", "V")),
    q: str | None = Query(None, description="按登录名/姓名/邮箱模糊搜索"),
    is_active: bool | None = Query(None),
    role_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> UserListResp:
    stmt = select(User)

    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                User.login_name.ilike(like),
                User.display_name.ilike(like),
                User.email.ilike(like),
            )
        )
    if is_active is not None:
        stmt = stmt.where(User.is_active.is_(is_active))
    if role_id is not None:
        stmt = stmt.join(UserRole, UserRole.user_id == User.id).where(
            UserRole.role_id == role_id
        )

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()

    stmt = stmt.order_by(User.id).offset((page - 1) * page_size).limit(page_size)
    users = (await db.execute(stmt)).scalars().unique().all()

    items = [await _user_to_list_item(u) for u in users]
    return UserListResp(items=items, total=total, page=page, page_size=page_size)


# ==================== Create ====================


@router.post("", response_model=UserDetail, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreateIn,
    db: AsyncSession = Depends(get_session),
    _: User = Depends(require_op("system.users", "C")),
) -> UserDetail:
    ok, msg = is_strong_enough(payload.password)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=msg)

    exists = (
        await db.execute(select(User).where(User.login_name == payload.login_name))
    ).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="登录名已存在")

    user = User(
        login_name=payload.login_name,
        display_name=payload.display_name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    await db.flush()

    # 绑定角色
    if payload.role_ids:
        roles = (
            await db.execute(select(Role).where(Role.id.in_(payload.role_ids)))
        ).scalars().all()
        if len(roles) != len(set(payload.role_ids)):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="存在无效角色 ID")
        for r in roles:
            db.add(UserRole(user_id=user.id, role_id=r.id))

    await db.commit()
    await db.refresh(user)
    return await _detail(user)


# ==================== Detail / Update / Delete ====================


@router.get("/{user_id}", response_model=UserDetail)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_session),
    _: User = Depends(require_op("system.users", "V")),
) -> UserDetail:
    user = await _get_user_or_404(db, user_id)
    return await _detail(user)


async def _detail(user: User) -> UserDetail:
    return UserDetail(
        id=user.id,
        login_name=user.login_name,
        display_name=user.display_name,
        email=user.email,
        is_active=user.is_active,
        last_login_at=user.last_login_at,
        failed_login_count=user.failed_login_count,
        locked_until=user.locked_until,
        role_ids=[r.id for r in user.roles],
        role_names=[r.name for r in user.roles],
    )


@router.put("/{user_id}", response_model=UserDetail)
async def update_user(
    user_id: int,
    payload: UserUpdateIn,
    db: AsyncSession = Depends(get_session),
    _: User = Depends(require_op("system.users", "U")),
) -> UserDetail:
    user = await _get_user_or_404(db, user_id)

    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.email is not None:
        user.email = payload.email

    await db.commit()
    await db.refresh(user)
    return await _detail(user)


# ==================== Activate / Deactivate ====================


@router.post("/{user_id}/activate", status_code=status.HTTP_204_NO_CONTENT)
async def activate_user(
    user_id: int,
    db: AsyncSession = Depends(get_session),
    _: User = Depends(require_op("system.users", "U")),
) -> None:
    user = await _get_user_or_404(db, user_id)
    user.is_active = True
    user.failed_login_count = 0
    user.locked_until = None
    await db.commit()


@router.post("/{user_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_session),
    me: User = Depends(require_op("system.users", "U")),
) -> None:
    if user_id == me.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="不能禁用自己的账号")
    user = await _get_user_or_404(db, user_id)
    user.is_active = False
    await db.commit()


# ==================== Reset password ====================


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    user_id: int,
    payload: ResetPasswordIn,
    db: AsyncSession = Depends(get_session),
    _: User = Depends(require_op("system.users", "U")),
) -> None:
    ok, msg = is_strong_enough(payload.new_password)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=msg)
    user = await _get_user_or_404(db, user_id)
    user.password_hash = hash_password(payload.new_password)
    user.failed_login_count = 0
    user.locked_until = None
    await db.commit()


# ==================== Set roles ====================


@router.put("/{user_id}/roles", response_model=UserDetail)
async def set_user_roles(
    user_id: int,
    payload: SetRolesIn,
    db: AsyncSession = Depends(get_session),
    _: User = Depends(require_op("system.users", "U")),
) -> UserDetail:
    user = await _get_user_or_404(db, user_id)

    new_ids = set(payload.role_ids)
    if new_ids:
        valid_roles = (
            await db.execute(select(Role.id).where(Role.id.in_(new_ids)))
        ).scalars().all()
        if set(valid_roles) != new_ids:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="存在无效角色 ID")

    # 删后重建（数百级量级，简单可靠）
    existing = (
        await db.execute(select(UserRole).where(UserRole.user_id == user_id))
    ).scalars().all()
    for ur in existing:
        await db.delete(ur)
    for rid in new_ids:
        db.add(UserRole(user_id=user_id, role_id=rid))

    await db.commit()
    await db.refresh(user)
    return await _detail(user)


# ==================== Feishu SSO 占位 ====================


@router.post("/{user_id}/feishu/bind", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def bind_feishu(user_id: int) -> dict:
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED, detail="飞书 SSO 即将上线"
    )


@router.delete("/{user_id}/feishu/bind", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def unbind_feishu(user_id: int) -> dict:
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED, detail="飞书 SSO 即将上线"
    )