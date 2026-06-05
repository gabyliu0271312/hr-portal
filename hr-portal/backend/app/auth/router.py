"""认证 API：登录 / 我是谁 / 改密 / 登出 / SSO 占位

详细规格见 contracts/openapi-skeleton.md §1
"""
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.password import hash_password, is_strong_enough, verify_password
from app.core.config import settings
from app.core.db import get_session
from app.core.deps import current_user, get_user_menus
from app.core.jwt import create_access_token
from app.users.models import User


router = APIRouter(prefix="/auth", tags=["auth"])


# ===== Schemas =====


class LoginIn(BaseModel):
    login_name: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1)


class LoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime


class UserOut(BaseModel):
    id: int
    login_name: str
    display_name: str
    email: str | None = None
    is_active: bool


class MenuItem(BaseModel):
    id: int
    code: str
    label: str
    parent_id: int | None
    order: int
    icon: str | None
    can_create: bool
    can_update: bool
    can_delete: bool
    can_export: bool
    scope_dimension: str


class MeOut(BaseModel):
    user: UserOut
    roles: list[str]
    menus: list[MenuItem]


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str


# ===== Endpoints =====


@router.post("/login", response_model=LoginOut)
async def login(payload: LoginIn, db: AsyncSession = Depends(get_session)) -> LoginOut:
    """账密登录"""
    user = (
        await db.execute(select(User).where(User.login_name == payload.login_name))
    ).scalar_one_or_none()

    # 不暴露"账号不存在"细节，统一用同一个错误
    invalid_msg = "账号或密码错误"

    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=invalid_msg)

    if not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="账号已被禁用")

    # 锁定中
    now = datetime.now(UTC)
    if user.locked_until and user.locked_until > now:
        remain = int((user.locked_until - now).total_seconds() / 60) + 1
        raise HTTPException(
            status.HTTP_423_LOCKED,
            detail=f"登录失败次数过多，请 {remain} 分钟后再试",
        )

    if not verify_password(payload.password, user.password_hash):
        user.failed_login_count += 1
        if user.failed_login_count >= settings.LOGIN_FAIL_LIMIT:
            user.locked_until = now + timedelta(minutes=settings.LOGIN_LOCK_MINUTES)
            await db.commit()
            raise HTTPException(
                status.HTTP_423_LOCKED,
                detail=f"登录失败 {user.failed_login_count} 次，账号已锁定 "
                f"{settings.LOGIN_LOCK_MINUTES} 分钟",
            )
        await db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=invalid_msg)

    # 登录成功
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    await db.commit()

    token = create_access_token(user.id)
    expires_at = now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    return LoginOut(access_token=token, expires_at=expires_at)


@router.post("/logout")
async def logout(_: User = Depends(current_user)) -> dict:
    """目前不维护 token revocation list，前端清掉本地 token 即可。
    后期需要踢人时再补 Redis 黑名单。"""
    return {"ok": True}


@router.get("/me", response_model=MeOut)
async def me(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> MeOut:
    """返回当前用户 + 角色 + 可见菜单（含操作权限四件套）"""
    menus = await get_user_menus(user, db)
    return MeOut(
        user=UserOut(
            id=user.id,
            login_name=user.login_name,
            display_name=user.display_name,
            email=user.email,
            is_active=user.is_active,
        ),
        roles=[r.name for r in user.roles],
        menus=[MenuItem(**m) for m in menus],
    )


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    if not verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="原密码错误")
    ok, msg = is_strong_enough(payload.new_password)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=msg)
    user.password_hash = hash_password(payload.new_password)
    await db.commit()
    return {"ok": True}


@router.post("/feishu/sso", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def feishu_sso() -> dict:
    """飞书 SSO 接入位 —— 本期占位，下一期实现"""
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED, detail="飞书 SSO 即将上线，请使用账密登录"
    )