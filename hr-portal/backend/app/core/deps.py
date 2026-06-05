"""共享依赖：current_user / require_role / require_op

设计要点（plan KD-1 + research R-9）：
- token 只放 user_id，每次请求查库取最新权限（不缓存）
- 禁用账号在下次请求立即失效（FR-USER-004 + FR-AUTH-006）
"""
from collections.abc import Awaitable, Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.jwt import decode_token
from app.users.models import RoleMenu, User


bearer_scheme = HTTPBearer(auto_error=False)


async def current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_session),
) -> User:
    """从 Authorization: Bearer <token> 解析当前用户。
    禁用 / 锁定 / 不存在 → 401"""
    if creds is None or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user_id = decode_token(creds.credentials)
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录态无效或已过期",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="账号不存在"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="账号已被禁用"
        )

    # 把 user 挂在 request.state 上，便于其他中间件使用
    request.state.user = user
    return user


def require_op(menu_code: str, op: str) -> Callable[..., Awaitable[User]]:
    """依赖工厂：要求当前用户对某菜单有某操作（C/U/D/E/V）

    用法：
        @router.post("/users", dependencies=[Depends(require_op("users", "C"))])
    """
    op = op.upper()
    if op not in {"V", "C", "U", "D", "E"}:
        raise ValueError(f"unknown op: {op}")

    flag_col = {
        "V": RoleMenu.can_view,
        "C": RoleMenu.can_create,
        "U": RoleMenu.can_update,
        "D": RoleMenu.can_delete,
        "E": RoleMenu.can_export,
    }[op]

    async def dep(
        user: User = Depends(current_user),
        db: AsyncSession = Depends(get_session),
    ) -> User:
        # 查该用户的任一活跃角色对该菜单是否有该操作
        from app.users.models import Menu, Role, UserRole  # 避开循环

        stmt = (
            select(RoleMenu)
            .join(Role, Role.id == RoleMenu.role_id)
            .join(UserRole, UserRole.role_id == Role.id)
            .join(Menu, Menu.id == RoleMenu.menu_id)
            .where(
                UserRole.user_id == user.id,
                Role.is_active.is_(True),
                Menu.code == menu_code,
                flag_col.is_(True),
            )
            .limit(1)
        )
        if (await db.execute(stmt)).first() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"无权限执行 {op} 操作 ({menu_code})",
            )
        return user

    return dep


async def get_user_menus(user: User, db: AsyncSession) -> list[dict]:
    """加载当前用户可访问的菜单清单（去重 + 操作权限并集）"""
    from app.users.models import Menu, Role, UserRole

    stmt = (
        select(
            Menu.id,
            Menu.code,
            Menu.label,
            Menu.parent_id,
            Menu.display_order,
            Menu.icon,
            RoleMenu.can_view,
            RoleMenu.can_create,
            RoleMenu.can_update,
            RoleMenu.can_delete,
            RoleMenu.can_export,
            RoleMenu.scope_dimension,
        )
        .select_from(Menu)
        .join(RoleMenu, RoleMenu.menu_id == Menu.id)
        .join(Role, Role.id == RoleMenu.role_id)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(
            UserRole.user_id == user.id,
            Role.is_active.is_(True),
            RoleMenu.can_view.is_(True),
        )
        .order_by(Menu.display_order, Menu.id)
    )
    rows = (await db.execute(stmt)).all()

    # 同一菜单可能被多个角色覆盖：操作权限取并集
    merged: dict[str, dict] = {}
    for r in rows:
        key = r.code
        if key not in merged:
            merged[key] = {
                "id": r.id,
                "code": r.code,
                "label": r.label,
                "parent_id": r.parent_id,
                "order": r.display_order,
                "icon": r.icon,
                "can_create": r.can_create,
                "can_update": r.can_update,
                "can_delete": r.can_delete,
                "can_export": r.can_export,
                "scope_dimension": r.scope_dimension,
            }
        else:
            m = merged[key]
            m["can_create"] = m["can_create"] or r.can_create
            m["can_update"] = m["can_update"] or r.can_update
            m["can_delete"] = m["can_delete"] or r.can_delete
            m["can_export"] = m["can_export"] or r.can_export
    return list(merged.values())