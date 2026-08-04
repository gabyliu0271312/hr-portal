"""Backend-only authentication contract for the performance application."""
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.password import hash_password, is_strong_enough, verify_password
from app.core.config import settings
from app.core.db import get_session
from app.core.jwt import create_performance_system_access_token
from app.performance.auth_context import (
    PerformanceAccessContext,
    get_performance_access_context,
    require_performance_permission,
    resolve_trusted_performance_actor,
)
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.models import (
    PerformanceRole,
    PerformanceRoleAssignment,
    PerformanceSystemAccount,
    PerformanceIdentityLink,
    SCOPE_TYPE_GLOBAL,
    SUBJECT_TYPE_SYSTEM_ACCOUNT,
    SYSTEM_ACCOUNT_TYPE_ADMIN,
    SYSTEM_ACCOUNT_TYPE_SUPER_ADMIN,
)
from app.performance.seed import (
    PERFORMANCE_ADMIN_ROLE_CODE,
    PERMISSION_MANAGE_ADMIN_ACCOUNTS,
)
from app.users.models import User


router = APIRouter(prefix="/performance/auth", tags=["performance-auth"])


class PerformanceLoginIn(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1)


class PerformanceLoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime


class PerformanceRoleGrantOut(BaseModel):
    code: str
    scope_type: str
    scope_ref: str


class PerformanceAccessContextOut(BaseModel):
    subject_type: str
    subject_id: int
    display_name: str
    account_type: str | None
    portal_entry_permissions: list[str]
    role_grants: list[PerformanceRoleGrantOut]
    permission_codes: list[str]


class PerformanceAdminAccountCreateIn(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    display_name: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=8)


class PerformanceAdminAccountUpdateIn(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=64)
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8)


class PerformanceAdminAccountOut(BaseModel):
    id: int
    username: str
    display_name: str
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None


class PerformanceIdentityLinkIn(BaseModel):
    portal_user_id: int = Field(..., gt=0)
    employee_no: str = Field(..., min_length=1, max_length=64)

    @field_validator("employee_no")
    @classmethod
    def normalize_employee_no(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("员工编号不能为空白")
        return normalized


class PerformanceIdentityLinkOut(BaseModel):
    portal_user_id: int
    employee_no: str
    is_active: bool


@router.post("/login", response_model=PerformanceLoginOut)
async def login_performance_system_account(
    payload: PerformanceLoginIn,
    db: AsyncSession = Depends(get_session),
) -> PerformanceLoginOut:
    """Authenticate a standalone performance system account only."""
    account = (
        await db.execute(
            select(PerformanceSystemAccount).where(
                PerformanceSystemAccount.username == payload.username
            )
        )
    ).scalar_one_or_none()
    if account is None or not verify_password(payload.password, account.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="账号或密码错误",
        )
    if not account.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="账号已被禁用",
        )

    now = datetime.now(UTC)
    account.last_login_at = now
    await db.commit()
    return PerformanceLoginOut(
        access_token=create_performance_system_access_token(account.id),
        expires_at=now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
    )


@router.get("/context", response_model=PerformanceAccessContextOut)
async def get_context(
    context: PerformanceAccessContext = Depends(get_performance_access_context),
) -> PerformanceAccessContextOut:
    return PerformanceAccessContextOut(
        subject_type=context.subject_type,
        subject_id=context.subject_id,
        display_name=context.display_name,
        account_type=context.account_type,
        portal_entry_permissions=list(context.portal_entry_permissions),
        role_grants=[
            PerformanceRoleGrantOut(
                code=grant.code,
                scope_type=grant.scope_type,
                scope_ref=grant.scope_ref,
            )
            for grant in context.role_grants
        ],
        permission_codes=list(context.permission_codes),
    )


@router.get("/identity-links", response_model=list[PerformanceIdentityLinkOut])
async def list_identity_links(
    _: PerformanceAccessContext = Depends(require_performance_permission("performance.authorization.manage")),
    db: AsyncSession = Depends(get_session),
) -> list[PerformanceIdentityLinkOut]:
    links = (await db.execute(select(PerformanceIdentityLink).order_by(PerformanceIdentityLink.portal_user_id))).scalars().all()
    return [PerformanceIdentityLinkOut(portal_user_id=link.portal_user_id, employee_no=link.employee_no, is_active=link.is_active) for link in links]


@router.put("/identity-links", response_model=PerformanceIdentityLinkOut)
async def upsert_identity_link(
    payload: PerformanceIdentityLinkIn,
    context: PerformanceAccessContext = Depends(require_performance_permission("performance.authorization.manage")),
    db: AsyncSession = Depends(get_session),
) -> PerformanceIdentityLinkOut:
    employee_no = payload.employee_no
    portal_user = await db.get(User, payload.portal_user_id)
    if portal_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portal 用户不存在")
    existing = (await db.execute(select(PerformanceIdentityLink).where(PerformanceIdentityLink.portal_user_id == payload.portal_user_id))).scalar_one_or_none()
    occupied = (await db.execute(select(PerformanceIdentityLink).where(PerformanceIdentityLink.employee_no == employee_no, PerformanceIdentityLink.portal_user_id != payload.portal_user_id))).scalar_one_or_none()
    if occupied is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该员工编号已映射到其他 Portal 用户")
    link = existing or PerformanceIdentityLink(portal_user_id=payload.portal_user_id, employee_no=employee_no, is_active=True)
    if existing is None:
        db.add(link)
    else:
        link.employee_no = employee_no
        link.is_active = True
    actor = await resolve_trusted_performance_actor(db, context)
    PerformanceAuditService(db).append_event(AuditEventInput(event_type="PERFORMANCE_IDENTITY_LINK_UPSERTED", actor_type=actor.actor_type, actor_ref=actor.actor_ref, subject_type="PORTAL_USER", subject_ref=str(payload.portal_user_id), after_state={"employee_no": employee_no}))
    await db.commit()
    return PerformanceIdentityLinkOut(portal_user_id=link.portal_user_id, employee_no=link.employee_no, is_active=link.is_active)


async def _require_performance_super_admin(
    context: PerformanceAccessContext = Depends(
        require_performance_permission(PERMISSION_MANAGE_ADMIN_ACCOUNTS)
    ),
) -> PerformanceAccessContext:
    if (
        context.subject_type != SUBJECT_TYPE_SYSTEM_ACCOUNT
        or context.account_type != SYSTEM_ACCOUNT_TYPE_SUPER_ADMIN
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅绩效超级管理员可管理绩效管理员账号")
    return context


def _validate_admin_password(password: str) -> str:
    is_strong, error = is_strong_enough(password)
    if not is_strong:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=error)
    return password


def _admin_account_out(account: PerformanceSystemAccount) -> PerformanceAdminAccountOut:
    return PerformanceAdminAccountOut(
        id=account.id,
        username=account.username,
        display_name=account.display_name,
        is_active=account.is_active,
        created_at=account.created_at,
        last_login_at=account.last_login_at,
    )


@router.get("/admin-accounts", response_model=list[PerformanceAdminAccountOut])
async def list_performance_admin_accounts(
    _: PerformanceAccessContext = Depends(_require_performance_super_admin),
    db: AsyncSession = Depends(get_session),
) -> list[PerformanceAdminAccountOut]:
    accounts = (
        await db.execute(
            select(PerformanceSystemAccount)
            .where(PerformanceSystemAccount.account_type == SYSTEM_ACCOUNT_TYPE_ADMIN)
            .order_by(PerformanceSystemAccount.id)
        )
    ).scalars().all()
    return [_admin_account_out(account) for account in accounts]


@router.post("/admin-accounts", response_model=PerformanceAdminAccountOut, status_code=status.HTTP_201_CREATED)
async def create_performance_admin_account(
    payload: PerformanceAdminAccountCreateIn,
    context: PerformanceAccessContext = Depends(_require_performance_super_admin),
    db: AsyncSession = Depends(get_session),
) -> PerformanceAdminAccountOut:
    username = payload.username.strip()
    display_name = payload.display_name.strip()
    if not username or not display_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="用户名和显示名称不能为空")
    password = _validate_admin_password(payload.password)
    existing = (
        await db.execute(
            select(PerformanceSystemAccount).where(PerformanceSystemAccount.username == username)
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名已存在")
    role = (
        await db.execute(
            select(PerformanceRole).where(PerformanceRole.code == PERFORMANCE_ADMIN_ROLE_CODE)
        )
    ).scalar_one_or_none()
    if role is None or not role.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="绩效管理员角色尚未初始化")
    account = PerformanceSystemAccount(
        username=username,
        display_name=display_name,
        password_hash=hash_password(password),
        account_type=SYSTEM_ACCOUNT_TYPE_ADMIN,
        is_active=True,
    )
    db.add(account)
    await db.flush()
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
    PerformanceAuditService(db).append_event(
        AuditEventInput(
            event_type="PERFORMANCE_ADMIN_ACCOUNT_CREATED",
            actor_type=context.subject_type,
            actor_ref=str(context.subject_id),
            subject_type=SUBJECT_TYPE_SYSTEM_ACCOUNT,
            subject_ref=str(account.id),
            after_state={"username": username, "display_name": display_name, "is_active": True},
        )
    )
    await db.commit()
    await db.refresh(account)
    return _admin_account_out(account)


@router.patch("/admin-accounts/{account_id}", response_model=PerformanceAdminAccountOut)
async def update_performance_admin_account(
    account_id: int,
    payload: PerformanceAdminAccountUpdateIn,
    context: PerformanceAccessContext = Depends(_require_performance_super_admin),
    db: AsyncSession = Depends(get_session),
) -> PerformanceAdminAccountOut:
    account = await db.get(PerformanceSystemAccount, account_id)
    if account is None or account.account_type != SYSTEM_ACCOUNT_TYPE_ADMIN:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="绩效管理员账号不存在")
    if payload.display_name is None and payload.is_active is None and payload.password is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="至少提供一个更新字段")
    before_state = {"display_name": account.display_name, "is_active": account.is_active}
    event_type = "PERFORMANCE_ADMIN_ACCOUNT_UPDATED"
    if payload.display_name is not None:
        account.display_name = payload.display_name.strip()
    if payload.is_active is not None:
        account.is_active = payload.is_active
    if payload.password is not None:
        account.password_hash = hash_password(_validate_admin_password(payload.password))
        event_type = "PERFORMANCE_ADMIN_ACCOUNT_PASSWORD_RESET"
    PerformanceAuditService(db).append_event(
        AuditEventInput(
            event_type=event_type,
            actor_type=context.subject_type,
            actor_ref=str(context.subject_id),
            subject_type=SUBJECT_TYPE_SYSTEM_ACCOUNT,
            subject_ref=str(account.id),
            before_state=before_state,
            after_state={"display_name": account.display_name, "is_active": account.is_active},
        )
    )
    await db.commit()
    await db.refresh(account)
    return _admin_account_out(account)
