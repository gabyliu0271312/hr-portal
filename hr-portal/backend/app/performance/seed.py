"""Idempotent seed data for performance authorization foundations."""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.password import hash_password, is_strong_enough, verify_password
from app.core.config import settings
from app.performance.models import (
    PerformanceAuditEvent,
    PerformancePermission,
    PerformanceRole,
    PerformanceRoleAssignment,
    PerformanceRolePermission,
    PerformanceSystemAccount,
    SCOPE_TYPE_GLOBAL,
    SUBJECT_TYPE_SYSTEM_ACCOUNT,
    SYSTEM_ACCOUNT_TYPE_SUPER_ADMIN,
)

logger = logging.getLogger("hr-portal")

PERFORMANCE_SUPER_ADMIN_ROLE_CODE = "performance.super_admin"
PERFORMANCE_ADMIN_ROLE_CODE = "performance.admin"
PERMISSION_MANAGE_ADMIN_ACCOUNTS = "performance.admin_accounts.manage"
_LEGACY_PERFORMANCE_SUPER_ADMIN_PASSWORD = "Performance@2026"


class PerformanceBootstrapConfigurationError(RuntimeError):
    """Raised when the performance super-admin bootstrap secret is unsafe."""

ROLE_DEFAULTS = (
    {
        "code": PERFORMANCE_SUPER_ADMIN_ROLE_CODE,
        "name": "绩效超级管理员",
        "description": "仅管理独立绩效管理员账号",
        "permissions": (PERMISSION_MANAGE_ADMIN_ACCOUNTS,),
    },
    {
        "code": PERFORMANCE_ADMIN_ROLE_CODE,
        "name": "绩效管理员",
        "description": "管理绩效配置、授权和后续周期流程",
        "permissions": (
            "performance.authorization.manage",
            "performance.configuration.manage",
            "performance.cycles.manage",
            "performance.projects.manage",
            "performance.audit.view",
        ),
    },
)

PERMISSION_DEFAULTS = (
    (PERMISSION_MANAGE_ADMIN_ACCOUNTS, "管理绩效管理员账号", "account"),
    ("performance.authorization.manage", "管理绩效授权", "authorization"),
    ("performance.configuration.manage", "管理绩效配置", "configuration"),
    ("performance.cycles.manage", "管理绩效周期", "cycle"),
    ("performance.projects.manage", "管理绩效项目", "project"),
    ("performance.audit.view", "查看绩效审计", "audit"),
)


async def seed_performance_authorization_defaults(db: AsyncSession) -> None:
    roles = await _ensure_roles(db)
    permissions = await _ensure_permissions(db)
    await _ensure_role_permissions(db, roles, permissions)
    await _ensure_super_admin_account(db, roles[PERFORMANCE_SUPER_ADMIN_ROLE_CODE])
    await db.commit()


async def _ensure_roles(db: AsyncSession) -> dict[str, PerformanceRole]:
    existing = {
        role.code: role
        for role in (await db.execute(select(PerformanceRole))).scalars().all()
    }
    for definition in ROLE_DEFAULTS:
        role = existing.get(definition["code"])
        if role is None:
            role = PerformanceRole(
                code=definition["code"],
                name=definition["name"],
                description=definition["description"],
                is_system=True,
                is_active=True,
            )
            db.add(role)
            await db.flush()
            existing[role.code] = role
            logger.info("[seed] performance role created: %s", role.code)
    return existing


async def _ensure_permissions(db: AsyncSession) -> dict[str, PerformancePermission]:
    existing = {
        permission.code: permission
        for permission in (await db.execute(select(PerformancePermission))).scalars().all()
    }
    for code, name, category in PERMISSION_DEFAULTS:
        permission = existing.get(code)
        if permission is None:
            permission = PerformancePermission(code=code, name=name, category=category)
            db.add(permission)
            await db.flush()
            existing[code] = permission
            logger.info("[seed] performance permission created: %s", code)
    return existing


async def _ensure_role_permissions(
    db: AsyncSession,
    roles: dict[str, PerformanceRole],
    permissions: dict[str, PerformancePermission],
) -> None:
    existing = {
        (link.role_id, link.permission_id)
        for link in (await db.execute(select(PerformanceRolePermission))).scalars().all()
    }
    for definition in ROLE_DEFAULTS:
        role = roles[definition["code"]]
        for permission_code in definition["permissions"]:
            permission = permissions[permission_code]
            key = (role.id, permission.id)
            if key not in existing:
                db.add(PerformanceRolePermission(role_id=role.id, permission_id=permission.id))
                existing.add(key)


async def _ensure_super_admin_account(db: AsyncSession, role: PerformanceRole) -> None:
    account = (
        await db.execute(
            select(PerformanceSystemAccount).where(
                PerformanceSystemAccount.account_type == SYSTEM_ACCOUNT_TYPE_SUPER_ADMIN
            )
        )
    ).scalar_one_or_none()
    if account is None:
        password = _require_bootstrap_password()
        username_conflict = (
            await db.execute(
                select(PerformanceSystemAccount).where(
                    PerformanceSystemAccount.username == settings.PERFORMANCE_SUPER_ADMIN_USERNAME
                )
            )
        ).scalar_one_or_none()
        if username_conflict is not None:
            raise RuntimeError(
                "PERFORMANCE_SUPER_ADMIN_USERNAME is already used by a non-super-admin account"
            )
        account = PerformanceSystemAccount(
            username=settings.PERFORMANCE_SUPER_ADMIN_USERNAME,
            display_name=settings.PERFORMANCE_SUPER_ADMIN_DISPLAY_NAME,
            password_hash=hash_password(password),
            account_type=SYSTEM_ACCOUNT_TYPE_SUPER_ADMIN,
            is_active=True,
        )
        db.add(account)
        await db.flush()
        _append_audit_event(
            db,
            event_type="PERFORMANCE_SUPER_ADMIN_CREATED",
            actor_type="SYSTEM_BOOTSTRAP",
            actor_ref="performance-seed",
            subject_type="SYSTEM_ACCOUNT",
            subject_ref=str(account.id),
            after_state={
                "username": account.username,
                "account_type": account.account_type,
                "is_active": account.is_active,
            },
        )
        logger.info("[seed] performance super admin created: %s", account.username)
    elif verify_password(_LEGACY_PERFORMANCE_SUPER_ADMIN_PASSWORD, account.password_hash):
        password = _require_bootstrap_password()
        account.password_hash = hash_password(password)
        _append_audit_event(
            db,
            event_type="PERFORMANCE_SUPER_ADMIN_PASSWORD_ROTATED",
            actor_type="SYSTEM_BOOTSTRAP",
            actor_ref="performance-seed",
            subject_type="SYSTEM_ACCOUNT",
            subject_ref=str(account.id),
            before_state={"password_source": "legacy_default"},
            after_state={"password_source": "configured_bootstrap_secret"},
        )
        logger.warning("[seed] rotated legacy performance super-admin bootstrap password")

    assignment = (
        await db.execute(
            select(PerformanceRoleAssignment).where(
                PerformanceRoleAssignment.subject_type == SUBJECT_TYPE_SYSTEM_ACCOUNT,
                PerformanceRoleAssignment.subject_id == account.id,
                PerformanceRoleAssignment.role_id == role.id,
                PerformanceRoleAssignment.scope_type == SCOPE_TYPE_GLOBAL,
                PerformanceRoleAssignment.scope_ref == SCOPE_TYPE_GLOBAL,
            )
        )
    ).scalar_one_or_none()
    if assignment is None:
        db.add(
            PerformanceRoleAssignment(
                subject_type=SUBJECT_TYPE_SYSTEM_ACCOUNT,
                subject_id=account.id,
                role_id=role.id,
                scope_type=SCOPE_TYPE_GLOBAL,
                scope_ref=SCOPE_TYPE_GLOBAL,
                is_active=True,
            )
        )
        _append_audit_event(
            db,
            event_type="PERFORMANCE_SUPER_ADMIN_ROLE_GRANTED",
            actor_type="SYSTEM_BOOTSTRAP",
            actor_ref="performance-seed",
            subject_type="SYSTEM_ACCOUNT",
            subject_ref=str(account.id),
            after_state={"role_code": role.code, "scope_type": SCOPE_TYPE_GLOBAL},
        )
        logger.info("[seed] performance super admin role assigned")


def _require_bootstrap_password() -> str:
    password = settings.PERFORMANCE_SUPER_ADMIN_INIT_PASSWORD.strip()
    if not password or password == _LEGACY_PERFORMANCE_SUPER_ADMIN_PASSWORD:
        raise PerformanceBootstrapConfigurationError(
            "PERFORMANCE_SUPER_ADMIN_INIT_PASSWORD must be configured with a non-default value"
        )
    is_strong, error = is_strong_enough(password)
    if not is_strong:
        raise PerformanceBootstrapConfigurationError(
            error or "performance super-admin bootstrap password is not strong enough"
        )
    return password


def _append_audit_event(
    db: AsyncSession,
    *,
    event_type: str,
    actor_type: str,
    actor_ref: str,
    subject_type: str | None = None,
    subject_ref: str | None = None,
    before_state: dict | None = None,
    after_state: dict | None = None,
) -> None:
    db.add(
        PerformanceAuditEvent(
            event_type=event_type,
            actor_type=actor_type,
            actor_ref=actor_ref,
            subject_type=subject_type,
            subject_ref=subject_ref,
            before_state=before_state or {},
            after_state=after_state or {},
        )
    )
