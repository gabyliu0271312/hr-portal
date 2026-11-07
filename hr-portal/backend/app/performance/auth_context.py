"""Authentication and authorization context for the performance application."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.employee_roster_contract import EmployeeRosterContractError, employee_roster_table, normalize_employee_no
from app.core.db import get_session
from app.core.config import settings
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
    subject_type: Literal["PORTAL_USER", "SYSTEM_ACCOUNT", "EMPLOYEE"]
    subject_id: int
    display_name: str
    account_type: str | None
    portal_entry_permissions: tuple[str, ...]
    role_grants: tuple[PerformanceRoleGrant, ...]
    permission_codes: tuple[str, ...]
    effective_employee_no: str | None = None
    operator_user_id: int | None = None
    switch_session_id: str | None = None


@dataclass(frozen=True)
class TrustedPerformanceActor:
    actor_type: Literal["EMPLOYEE", "PORTAL_USER", "SYSTEM_ACCOUNT"]
    actor_ref: str


class PerformanceIdentityMappingNotFound(ValueError):
    """Raised when a Portal user has no authorized employee identity for a cycle."""


class PerformanceIdentityMappingConflict(PerformanceIdentityMappingNotFound):
    """Raised when trusted identity sources disagree or are ambiguous."""


PERFORMANCE_PORTAL_ADMIN_PERMISSIONS = (
    "performance.authorization.manage",
    "performance.configuration.manage",
    "performance.cycles.manage",
    "performance.projects.manage",
    "performance.audit.view",
)


def performance_admin_preview_enabled(context: PerformanceAccessContext) -> bool:
    if getattr(context, "effective_employee_no", None):
        return False
    if settings.APP_ENV.lower() != "dev" or not settings.PERFORMANCE_DEV_ADMIN_DEBUG:
        return False
    return (
        context.subject_type == SUBJECT_TYPE_SYSTEM_ACCOUNT
        or "performance.admin" in context.portal_entry_permissions
        or "performance.cycles.manage" in context.permission_codes
        or "performance.projects.manage" in context.permission_codes
    )


async def resolve_performance_employee_no(db: AsyncSession, context: PerformanceAccessContext) -> str | None:
    if context.subject_type == SUBJECT_TYPE_SYSTEM_ACCOUNT:
        return None
    if context.effective_employee_no:
        return context.effective_employee_no
    if context.subject_type != SUBJECT_TYPE_PORTAL_USER:
        return None

    linked_employee_no = (await db.execute(select(PerformanceIdentityLink.employee_no).where(
        PerformanceIdentityLink.portal_user_id == context.subject_id,
        PerformanceIdentityLink.is_active.is_(True),
    ))).scalar_one_or_none()
    user = await db.get(User, context.subject_id)
    if user is None or not user.is_active:
        return None
    email = str(user.email or "").strip().lower()
    email_employee_no = None
    if email:
        try:
            roster = employee_roster_table()
        except EmployeeRosterContractError:
            roster = None
        if roster is not None and "corporate_email" in roster.c and "employee_no" in roster.c:
            matches = (await db.execute(select(roster.c.employee_no).where(
                func.lower(func.trim(cast(roster.c.corporate_email, String))) == email,
            ).limit(2))).scalars().all()
            if len(matches) > 1:
                raise PerformanceIdentityMappingConflict("邮箱匹配到多个花名册人员")
            if matches:
                email_employee_no = normalize_employee_no(matches[0])
        if email_employee_no:
            other_user = (await db.execute(select(User.id).where(
                User.is_active.is_(True),
                User.id != context.subject_id,
                func.lower(func.trim(User.email)) == email,
            ).limit(1))).scalar_one_or_none()
            if other_user is not None:
                raise PerformanceIdentityMappingConflict("Portal 用户邮箱存在冲突")
    if linked_employee_no and email_employee_no and linked_employee_no != email_employee_no:
        raise PerformanceIdentityMappingConflict("人工绑定与邮箱匹配的员工不一致")
    employee_no = linked_employee_no or email_employee_no
    if not employee_no:
        snapshot_matches = (await db.execute(select(PerformanceAuthorizationSnapshotPerson.employee_no).where(
            PerformanceAuthorizationSnapshotPerson.portal_user_id == context.subject_id,
        ).distinct())).scalars().all()
        if len(snapshot_matches) > 1:
            raise PerformanceIdentityMappingConflict("历史快照绑定到多个员工")
        employee_no = normalize_employee_no(snapshot_matches[0]) if snapshot_matches else None
    if not employee_no:
        return None
    other_link = (await db.execute(select(PerformanceIdentityLink.portal_user_id).where(
        PerformanceIdentityLink.employee_no == employee_no,
        PerformanceIdentityLink.portal_user_id != context.subject_id,
        PerformanceIdentityLink.is_active.is_(True),
    ))).scalar_one_or_none()
    if other_link is not None:
        raise PerformanceIdentityMappingConflict("员工已绑定其他 Portal 用户")
    return employee_no


def employee_no_in_cycle(context: PerformanceAccessContext, employee_no: str | None, people) -> str | None:
    """Confirm membership without changing frozen people or organization relationships."""
    if context.subject_type == SUBJECT_TYPE_SYSTEM_ACCOUNT:
        return None
    if context.effective_employee_no:
        return employee_no
    bound_refs = {person.employee_no for person in people if getattr(person, "portal_user_id", None) == context.subject_id}
    if employee_no is None:
        return next(iter(bound_refs)) if len(bound_refs) == 1 else None
    if bound_refs and bound_refs != {employee_no}:
        return None
    candidates = [person for person in people if person.employee_no == employee_no]
    if len(candidates) != 1 or getattr(candidates[0], "portal_user_id", None) not in (None, context.subject_id):
        return None
    return employee_no


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
    try:
        employee_no = await resolve_performance_employee_no(db, context)
    except PerformanceIdentityMappingConflict:
        if require_employee_identity:
            raise
        return TrustedPerformanceActor(actor_type=SUBJECT_TYPE_PORTAL_USER, actor_ref=str(context.subject_id))
    if cycle_ref is not None and not context.effective_employee_no:
        people = (await db.execute(select(PerformanceAuthorizationSnapshotPerson).join(
            PerformanceAuthorizationSnapshot,
            PerformanceAuthorizationSnapshot.id == PerformanceAuthorizationSnapshotPerson.snapshot_id,
        ).where(
            PerformanceAuthorizationSnapshot.cycle_ref == cycle_ref,
            or_(
                PerformanceAuthorizationSnapshotPerson.portal_user_id == context.subject_id,
                PerformanceAuthorizationSnapshotPerson.employee_no == employee_no if employee_no else False,
            ),
        ))).scalars().all()
        employee_no = employee_no_in_cycle(context, employee_no, people)
    if employee_no:
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
        PerformanceRole.role_type == "MANAGEMENT",
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

        secret = getattr(request, "headers", {}).get("X-App-Switch-Session")
        if secret:
            from app.identity_switch.context import switched_context
            context = await switched_context(db, user, secret, request)
            request.state.performance_access_context = context
            return context
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
        if "performance.admin" in portal_entry_permissions:
            permission_codes = tuple(dict.fromkeys((*permission_codes, *PERFORMANCE_PORTAL_ADMIN_PERMISSIONS)))
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

    secret = getattr(request, "headers", {}).get("X-App-Switch-Session")
    if secret:
        if context.subject_type != SUBJECT_TYPE_PORTAL_USER:
            raise _unauthorized("身份切换仅支持 Portal 操作者")
        from app.identity_switch.context import switched_context
        context = await switched_context(db, user, secret, request)
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
