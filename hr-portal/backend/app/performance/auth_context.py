"""Authentication and authorization context for the performance application."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import bearer_scheme, user_has_op
from app.core.jwt import (
    TOKEN_SUBJECT_TYPE_PERFORMANCE_SYSTEM_ACCOUNT,
    TOKEN_SUBJECT_TYPE_PORTAL_USER,
    decode_token_payload,
)
from app.performance.models import (
    PerformanceAuthorizationSnapshot,
    PerformanceAuthorizationSnapshotPerson,
    PerformanceIdentityLink,
    PerformancePermission,
    PerformanceRole,
    PerformanceRoleAssignment,
    PerformanceRolePermission,
    PerformanceSystemAccount,
    SUBJECT_TYPE_PORTAL_USER,
    SUBJECT_TYPE_SYSTEM_ACCOUNT,
)
from app.users.models import User


@dataclass(frozen=True)
class PerformanceRoleGrant:
    code: str
    scope_type: str
    scope_ref: str


@dataclass(frozen=True)
class PerformanceAccessContext:
    subject_type: Literal["PORTAL_USER", "SYSTEM_ACCOUNT"]
    subject_id: int
    display_name: str
    account_type: str | None
    portal_entry_permissions: tuple[str, ...]
    role_grants: tuple[PerformanceRoleGrant, ...]
    permission_codes: tuple[str, ...]


@dataclass(frozen=True)
class TrustedPerformanceActor:
    actor_type: Literal["EMPLOYEE", "PORTAL_USER", "SYSTEM_ACCOUNT"]
    actor_ref: str


class PerformanceIdentityMappingNotFound(ValueError):
    """Raised when a Portal user has no authorized employee identity for a cycle."""


async def resolve_trusted_performance_actor(
    db: AsyncSession,
    context: PerformanceAccessContext,
    *,
    cycle_ref: str | None = None,
    require_employee_identity: bool = False,
) -> TrustedPerformanceActor:
    """Derive a performance actor from the authenticated server-side context only."""
    if context.subject_type == SUBJECT_TYPE_SYSTEM_ACCOUNT:
        return TrustedPerformanceActor(
            actor_type=SUBJECT_TYPE_SYSTEM_ACCOUNT,
            actor_ref=str(context.subject_id),
        )
    statement = select(PerformanceAuthorizationSnapshotPerson.employee_no).where(
        PerformanceAuthorizationSnapshotPerson.portal_user_id == context.subject_id
    )
    if cycle_ref is not None:
        statement = statement.join(
            PerformanceAuthorizationSnapshot,
            PerformanceAuthorizationSnapshot.id == PerformanceAuthorizationSnapshotPerson.snapshot_id,
        ).where(PerformanceAuthorizationSnapshot.cycle_ref == cycle_ref)
    else:
        statement = select(PerformanceIdentityLink.employee_no).where(
            PerformanceIdentityLink.portal_user_id == context.subject_id,
            PerformanceIdentityLink.is_active.is_(True),
        )
    employee_no = (await db.execute(statement)).scalar_one_or_none()
    if employee_no is not None:
        return TrustedPerformanceActor(actor_type="EMPLOYEE", actor_ref=employee_no)
    if require_employee_identity:
        raise PerformanceIdentityMappingNotFound("当前 Portal 用户未映射到该周期的绩效员工快照")
    return TrustedPerformanceActor(actor_type=SUBJECT_TYPE_PORTAL_USER, actor_ref=str(context.subject_id))


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def load_active_authorization(
    db: AsyncSession,
    subject_type: str,
    subject_id: int,
) -> tuple[tuple[PerformanceRoleGrant, ...], tuple[str, ...]]:
    """Load active roles and permissions at request time instead of caching them in JWT."""
    now = datetime.now(UTC)
    assignment_filter = (
        PerformanceRoleAssignment.subject_type == subject_type,
        PerformanceRoleAssignment.subject_id == subject_id,
        PerformanceRoleAssignment.is_active.is_(True),
        PerformanceRole.is_active.is_(True),
        or_(
            PerformanceRoleAssignment.starts_at.is_(None),
            PerformanceRoleAssignment.starts_at <= now,
        ),
        or_(
            PerformanceRoleAssignment.ends_at.is_(None),
            PerformanceRoleAssignment.ends_at > now,
        ),
    )
    role_rows = (
        await db.execute(
            select(
                PerformanceRole.id,
                PerformanceRole.code,
                PerformanceRoleAssignment.scope_type,
                PerformanceRoleAssignment.scope_ref,
            )
            .join(
                PerformanceRole,
                PerformanceRole.id == PerformanceRoleAssignment.role_id,
            )
            .where(*assignment_filter)
            .order_by(
                PerformanceRole.code,
                PerformanceRoleAssignment.scope_type,
                PerformanceRoleAssignment.scope_ref,
            )
        )
    ).all()
    role_grants = tuple(
        PerformanceRoleGrant(
            code=row.code,
            scope_type=row.scope_type,
            scope_ref=row.scope_ref,
        )
        for row in role_rows
    )
    role_ids = sorted({row.id for row in role_rows})
    if not role_ids:
        return role_grants, ()

    permission_rows = (
        await db.execute(
            select(PerformancePermission.code)
            .join(
                PerformanceRolePermission,
                PerformanceRolePermission.permission_id == PerformancePermission.id,
            )
            .where(PerformanceRolePermission.role_id.in_(role_ids))
            .distinct()
            .order_by(PerformancePermission.code)
        )
    ).scalars().all()
    return role_grants, tuple(permission_rows)


async def get_performance_access_context(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_session),
) -> PerformanceAccessContext:
    """Resolve a performance caller from either portal or system-account JWTs."""
    if creds is None or not creds.credentials:
        raise _unauthorized("未登录")
    try:
        payload = decode_token_payload(creds.credentials)
        subject_id = int(payload["sub"])
    except (JWTError, KeyError, TypeError, ValueError) as exc:
        raise _unauthorized("登录态无效或已过期") from exc

    token_subject_type = payload.get("subject_type", TOKEN_SUBJECT_TYPE_PORTAL_USER)
    if token_subject_type == TOKEN_SUBJECT_TYPE_PERFORMANCE_SYSTEM_ACCOUNT:
        account = await db.get(PerformanceSystemAccount, subject_id)
        if account is None:
            raise _unauthorized("账号不存在")
        if not account.is_active:
            raise _unauthorized("账号已被禁用")
        role_grants, permission_codes = await load_active_authorization(
            db,
            SUBJECT_TYPE_SYSTEM_ACCOUNT,
            account.id,
        )
        context = PerformanceAccessContext(
            subject_type=SUBJECT_TYPE_SYSTEM_ACCOUNT,
            subject_id=account.id,
            display_name=account.display_name,
            account_type=account.account_type,
            portal_entry_permissions=(),
            role_grants=role_grants,
            permission_codes=permission_codes,
        )
    elif token_subject_type == TOKEN_SUBJECT_TYPE_PORTAL_USER:
        user = await db.get(User, subject_id)
        if user is None:
            raise _unauthorized("账号不存在")
        if not user.is_active:
            raise _unauthorized("账号已被禁用")

        portal_entry_permissions = []
        for code in ("performance.app", "performance.admin"):
            if await user_has_op(user, db, code, "V"):
                portal_entry_permissions.append(code)
        portal_entry_permissions = tuple(portal_entry_permissions)
        if not portal_entry_permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="无绩效应用入口权限",
            )
        role_grants, permission_codes = await load_active_authorization(
            db,
            SUBJECT_TYPE_PORTAL_USER,
            user.id,
        )
        context = PerformanceAccessContext(
            subject_type=SUBJECT_TYPE_PORTAL_USER,
            subject_id=user.id,
            display_name=user.display_name,
            account_type=None,
            portal_entry_permissions=portal_entry_permissions,
            role_grants=role_grants,
            permission_codes=permission_codes,
        )
    else:
        raise _unauthorized("登录态主体无效")

    request.state.performance_access_context = context
    return context


def require_performance_permission(permission_code: str):
    async def dependency(
        context: PerformanceAccessContext = Depends(get_performance_access_context),
    ) -> PerformanceAccessContext:
        if permission_code not in context.permission_codes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"缺少绩效权限：{permission_code}",
            )
        return context

    return dependency
