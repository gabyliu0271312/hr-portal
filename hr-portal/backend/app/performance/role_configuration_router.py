"""Performance role configuration API."""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import (
    PerformanceAccessContext,
    require_performance_permission,
    resolve_trusted_performance_actor,
)
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.models import PerformanceRole, PerformanceRoleAssignment, PerformanceIdentityLink, PerformanceAuditEvent, SUBJECT_TYPE_PORTAL_USER, SCOPE_TYPE_GLOBAL
from app.users.models import User


ROLE_CONFIGURATION_PERMISSION = "performance.authorization.manage"

router = APIRouter(
    prefix="/performance/permission-settings/roles",
    tags=["performance-role-configuration"],
)


class PerformanceRoleCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=2000)
    function_permission_keys: list[str] = Field(default_factory=list, max_length=256)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("角色名称不能为空白")
        return value

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class PerformanceRoleUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=2000)
    function_permission_keys: list[str] | None = Field(default=None, max_length=256)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("角色名称不能为空白")
        return value

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class PerformanceRoleStatusIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_active: bool


class PerformanceRoleListItem(BaseModel):
    id: int
    code: str
    name: str
    description: str | None
    role_type: str
    member_source: str | None
    is_system: bool
    is_active: bool
    updated_at: datetime
    function_permission_keys: list[str]


class PerformanceRoleListOut(BaseModel):
    items: list[PerformanceRoleListItem]
    total: int
    page: int
    page_size: int


class PerformanceRoleOut(PerformanceRoleListItem):
    pass


class PerformanceUserAuthorizationRoleOut(BaseModel):
    id: int
    name: str
    function_permission_keys: list[str]
    is_active: bool = True


class PerformanceUserAuthorizationItem(BaseModel):
    user_id: int
    display_name: str
    login_name: str
    employee_no: str
    role_ids: list[int]
    roles: list[PerformanceUserAuthorizationRoleOut]
    updated_at: datetime
    updated_by: str | None = None


class PerformanceUserAuthorizationPage(BaseModel):
    items: list[PerformanceUserAuthorizationItem]
    total: int
    page: int
    page_size: int


class PerformanceUserAuthorizationOptions(BaseModel):
    users: list[dict]
    roles: list[PerformanceUserAuthorizationRoleOut]


class PerformanceUserAuthorizationPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: int = Field(..., gt=0)
    role_ids: list[int] = Field(..., min_length=1, max_length=64)

    @field_validator("role_ids")
    @classmethod
    def normalize_role_ids(cls, value: list[int]) -> list[int]:
        if any(item <= 0 for item in value):
            raise ValueError("角色ID必须为正整数")
        return list(dict.fromkeys(value))


async def _context(
    context: PerformanceAccessContext = Depends(
        require_performance_permission(ROLE_CONFIGURATION_PERMISSION)
    ),
) -> PerformanceAccessContext:
    return context


def _user_authorization_role_statement():
    return select(PerformanceRole).where(
        PerformanceRole.role_type == "MANAGEMENT",
        PerformanceRole.is_system.is_(False),
        PerformanceRole.is_active.is_(True),
    )


async def _trusted_user(db: AsyncSession, user_id: int) -> tuple[User, PerformanceIdentityLink]:
    row = (await db.execute(
        select(User, PerformanceIdentityLink).join(
            PerformanceIdentityLink,
            PerformanceIdentityLink.portal_user_id == User.id,
        ).where(
            User.id == user_id,
            User.is_active.is_(True),
            PerformanceIdentityLink.is_active.is_(True),
        ).with_for_update(of=User)
    )).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户未绑定有效绩效身份")
    return row


async def _managed_roles(db: AsyncSession, role_ids: list[int]) -> list[PerformanceRole]:
    roles = list((await db.execute(
        _user_authorization_role_statement().where(PerformanceRole.id.in_(role_ids)).order_by(PerformanceRole.id).with_for_update()
    )).scalars().all())
    if len(roles) != len(set(role_ids)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="存在不可授权的角色")
    return roles


async def _authorization_item(db: AsyncSession, user_id: int) -> PerformanceUserAuthorizationItem | None:
    user = await db.get(User, user_id)
    link = await db.scalar(select(PerformanceIdentityLink).where(
        PerformanceIdentityLink.portal_user_id == user_id,
    ))
    if user is None:
        return None
    rows = list((await db.execute(
        select(PerformanceRole, PerformanceRoleAssignment).join(
            PerformanceRoleAssignment,
            PerformanceRoleAssignment.role_id == PerformanceRole.id,
        ).where(
            PerformanceRoleAssignment.subject_type == SUBJECT_TYPE_PORTAL_USER,
            PerformanceRoleAssignment.subject_id == user_id,
            PerformanceRoleAssignment.scope_type == SCOPE_TYPE_GLOBAL,
            PerformanceRoleAssignment.scope_ref == SCOPE_TYPE_GLOBAL,
            PerformanceRoleAssignment.is_active.is_(True),
            PerformanceRole.role_type == "MANAGEMENT",
            PerformanceRole.is_system.is_(False),
        ).order_by(PerformanceRole.id)
    )).all())
    if not rows:
        return None
    event = await db.scalar(select(PerformanceAuditEvent).where(
        PerformanceAuditEvent.subject_type == "PERFORMANCE_ROLE_ASSIGNMENT",
        PerformanceAuditEvent.after_state["user_id"].as_integer() == user_id,
    ).order_by(PerformanceAuditEvent.event_at.desc(), PerformanceAuditEvent.id.desc()).limit(1))
    roles = [role for role, _ in rows]
    updated_at = max((assignment.updated_at for _, assignment in rows), default=user.updated_at)
    return PerformanceUserAuthorizationItem(
        user_id=user.id,
        display_name=user.display_name,
        login_name=user.login_name,
        employee_no=link.employee_no if link else "",
        role_ids=[role.id for role in roles],
        roles=[PerformanceUserAuthorizationRoleOut(id=role.id, name=role.name, function_permission_keys=list(role.function_permission_keys or []), is_active=role.is_active) for role in roles],
        updated_at=event.event_at if event is not None else updated_at,
        updated_by=(event.after_state or {}).get("updated_by") if event is not None else None,
    )


@router.get("/user-authorizations", response_model=PerformanceUserAuthorizationPage)
async def list_user_authorizations(
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 10,
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> PerformanceUserAuthorizationPage:
    if page < 1 or page_size < 1 or page_size > 100:
        raise HTTPException(status_code=422, detail="分页参数无效")
    statement = select(User.id).join(PerformanceRoleAssignment, PerformanceRoleAssignment.subject_id == User.id).join(
        PerformanceRole, PerformanceRole.id == PerformanceRoleAssignment.role_id,
    ).outerjoin(PerformanceIdentityLink, PerformanceIdentityLink.portal_user_id == User.id).where(
        PerformanceRoleAssignment.subject_type == SUBJECT_TYPE_PORTAL_USER,
        PerformanceRoleAssignment.scope_type == SCOPE_TYPE_GLOBAL,
        PerformanceRoleAssignment.scope_ref == SCOPE_TYPE_GLOBAL,
        PerformanceRoleAssignment.is_active.is_(True),
        PerformanceRole.role_type == "MANAGEMENT",
        PerformanceRole.is_system.is_(False),
    ).distinct()
    if keyword and keyword.strip():
        pattern = f"%{keyword.strip()}%"
        statement = statement.where((User.display_name.ilike(pattern)) | (User.login_name.ilike(pattern)) | (PerformanceIdentityLink.employee_no.ilike(pattern)) | (PerformanceRole.name.ilike(pattern)))
    user_ids = list((await db.execute(statement.order_by(User.id).offset((page - 1) * page_size).limit(page_size))).scalars().all())
    count = await db.scalar(select(func.count()).select_from(statement.subquery()))
    items = [item for user_id in user_ids if (item := await _authorization_item(db, user_id)) is not None]
    return PerformanceUserAuthorizationPage(items=items, total=count, page=page, page_size=page_size)


@router.get("/user-authorizations/options", response_model=PerformanceUserAuthorizationOptions)
async def user_authorization_options(
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> PerformanceUserAuthorizationOptions:
    users = list((await db.execute(select(User, PerformanceIdentityLink).join(
        PerformanceIdentityLink, PerformanceIdentityLink.portal_user_id == User.id,
    ).where(User.is_active.is_(True), PerformanceIdentityLink.is_active.is_(True)).order_by(User.display_name, User.id))).all())
    roles = list((await db.execute(_user_authorization_role_statement().order_by(PerformanceRole.id))).scalars().all())
    return PerformanceUserAuthorizationOptions(
        users=[{"value": str(user.id), "label": f"{user.display_name}（{link.employee_no}）", "employee_no": link.employee_no} for user, link in users],
        roles=[PerformanceUserAuthorizationRoleOut(id=role.id, name=role.name, function_permission_keys=list(role.function_permission_keys or [])) for role in roles],
    )


@router.post("/user-authorizations", response_model=PerformanceUserAuthorizationItem, status_code=status.HTTP_201_CREATED)
async def create_user_authorization(
    payload: PerformanceUserAuthorizationPayload,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> PerformanceUserAuthorizationItem:
    user, link = await _trusted_user(db, payload.user_id)
    roles = await _managed_roles(db, payload.role_ids)
    existing = list((await db.execute(select(PerformanceRoleAssignment).where(
        PerformanceRoleAssignment.subject_type == SUBJECT_TYPE_PORTAL_USER,
        PerformanceRoleAssignment.subject_id == user.id,
        PerformanceRoleAssignment.role_id.in_(payload.role_ids),
        PerformanceRoleAssignment.scope_type == SCOPE_TYPE_GLOBAL,
        PerformanceRoleAssignment.scope_ref == SCOPE_TYPE_GLOBAL,
    ).with_for_update())).scalars().all())
    if any(item.is_active for item in existing):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户已拥有所选角色")
    existing_by_role = {item.role_id: item for item in existing}
    actor = await resolve_trusted_performance_actor(db, context)
    for role in roles:
        assignment = existing_by_role.get(role.id)
        if assignment is None:
            db.add(PerformanceRoleAssignment(
                subject_type=SUBJECT_TYPE_PORTAL_USER,
                subject_id=user.id,
                role_id=role.id,
                scope_type=SCOPE_TYPE_GLOBAL,
                scope_ref=SCOPE_TYPE_GLOBAL,
                is_active=True,
            ))
        else:
            assignment.is_active = True
            assignment.starts_at = None
            assignment.ends_at = None
        PerformanceAuditService(db).append_event(AuditEventInput(
            event_type="PERFORMANCE_ROLE_ASSIGNED",
            actor_type=actor.actor_type,
            actor_ref=actor.actor_ref,
            subject_type="PERFORMANCE_ROLE_ASSIGNMENT",
            subject_ref=f"{user.id}:{role.id}",
            after_state={"updated_by": context.display_name, "user_id": user.id, "employee_no": link.employee_no, "role_id": role.id, "role_code": role.code, "scope_type": SCOPE_TYPE_GLOBAL},
        ))
    await db.commit()
    item = await _authorization_item(db, user.id)
    if item is None:
        raise HTTPException(status_code=500, detail="授权保存后读取失败")
    return item


@router.put("/user-authorizations/{user_id}", response_model=PerformanceUserAuthorizationItem)
async def replace_user_authorization(
    user_id: int,
    payload: PerformanceUserAuthorizationPayload,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> PerformanceUserAuthorizationItem:
    if payload.user_id != user_id:
        raise HTTPException(status_code=422, detail="用户参数不一致")
    user, link = await _trusted_user(db, user_id)
    roles = await _managed_roles(db, payload.role_ids)
    assignments = list((await db.execute(select(PerformanceRoleAssignment).where(
        PerformanceRoleAssignment.subject_type == SUBJECT_TYPE_PORTAL_USER,
        PerformanceRoleAssignment.subject_id == user_id,
        PerformanceRoleAssignment.scope_type == SCOPE_TYPE_GLOBAL,
        PerformanceRoleAssignment.scope_ref == SCOPE_TYPE_GLOBAL,
        PerformanceRoleAssignment.role_id.in_(select(PerformanceRole.id).where(PerformanceRole.is_system.is_(False), PerformanceRole.role_type == "MANAGEMENT")),
    ).with_for_update())).scalars().all())
    desired = set(payload.role_ids)
    actor = await resolve_trusted_performance_actor(db, context)
    by_role = {assignment.role_id: assignment for assignment in assignments}
    for assignment in assignments:
        should_be_active = assignment.role_id in desired
        if assignment.is_active != should_be_active or (should_be_active and (assignment.starts_at is not None or assignment.ends_at is not None)):
            assignment.is_active = should_be_active
            if should_be_active:
                assignment.starts_at = None
                assignment.ends_at = None
            PerformanceAuditService(db).append_event(AuditEventInput(
                event_type="PERFORMANCE_ROLE_ASSIGNED" if should_be_active else "PERFORMANCE_ROLE_REVOKED",
                actor_type=actor.actor_type,
                actor_ref=actor.actor_ref,
                subject_type="PERFORMANCE_ROLE_ASSIGNMENT",
                subject_ref=str(assignment.id),
                before_state={"is_active": not should_be_active},
                after_state={"updated_by": context.display_name, "is_active": should_be_active, "user_id": user_id, "role_id": assignment.role_id},
            ))
    for role in roles:
        if role.id not in by_role:
            db.add(PerformanceRoleAssignment(
                subject_type=SUBJECT_TYPE_PORTAL_USER,
                subject_id=user_id,
                role_id=role.id,
                scope_type=SCOPE_TYPE_GLOBAL,
                scope_ref=SCOPE_TYPE_GLOBAL,
                is_active=True,
            ))
            PerformanceAuditService(db).append_event(AuditEventInput(
                event_type="PERFORMANCE_ROLE_ASSIGNED",
                actor_type=actor.actor_type,
                actor_ref=actor.actor_ref,
                subject_type="PERFORMANCE_ROLE_ASSIGNMENT",
                subject_ref=f"{user_id}:{role.id}",
                after_state={"updated_by": context.display_name, "user_id": user_id, "employee_no": link.employee_no, "role_id": role.id, "role_code": role.code, "scope_type": SCOPE_TYPE_GLOBAL},
            ))
    await db.commit()
    item = await _authorization_item(db, user_id)
    if item is None:
        raise HTTPException(status_code=500, detail="授权保存后读取失败")
    return item


@router.delete("/user-authorizations/{user_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def revoke_user_authorization(
    user_id: int,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> None:
    user = await db.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    assignments = list((await db.execute(select(PerformanceRoleAssignment).join(
        PerformanceRole, PerformanceRole.id == PerformanceRoleAssignment.role_id,
    ).where(
        PerformanceRoleAssignment.subject_type == SUBJECT_TYPE_PORTAL_USER,
        PerformanceRoleAssignment.subject_id == user_id,
        PerformanceRoleAssignment.scope_type == SCOPE_TYPE_GLOBAL,
        PerformanceRoleAssignment.scope_ref == SCOPE_TYPE_GLOBAL,
        PerformanceRoleAssignment.is_active.is_(True),
        PerformanceRole.role_type == "MANAGEMENT",
        PerformanceRole.is_system.is_(False),
    ).with_for_update())).scalars().all())
    actor = await resolve_trusted_performance_actor(db, context)
    for assignment in assignments:
        assignment.is_active = False
        PerformanceAuditService(db).append_event(AuditEventInput(
            event_type="PERFORMANCE_ROLE_REVOKED",
            actor_type=actor.actor_type,
            actor_ref=actor.actor_ref,
            subject_type="PERFORMANCE_ROLE_ASSIGNMENT",
            subject_ref=str(assignment.id),
            before_state={"is_active": True},
            after_state={"updated_by": context.display_name, "is_active": False, "user_id": user_id, "role_id": assignment.role_id},
        ))
    await db.commit()


def _role_out(role: PerformanceRole) -> PerformanceRoleOut:
    return PerformanceRoleOut(
        id=role.id,
        code=role.code,
        name=role.name,
        description=role.description,
        role_type=role.role_type,
        member_source=role.member_source,
        is_system=role.is_system,
        is_active=role.is_active,
        updated_at=role.updated_at,
        function_permission_keys=list(role.function_permission_keys or []),
    )


@router.get("", response_model=PerformanceRoleListOut)
async def list_performance_roles(
    keyword: str | None = None,
    role_type: str = "MANAGEMENT",
    page: int = 1,
    page_size: int = 10,
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> PerformanceRoleListOut:
    if page < 1 or page_size < 1 or page_size > 100:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="分页参数无效")
    if role_type not in {"MANAGEMENT", "ASSESSMENT"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="角色类型无效")

    statement = select(PerformanceRole).where(PerformanceRole.role_type == role_type)
    count_statement = select(func.count()).select_from(PerformanceRole).where(PerformanceRole.role_type == role_type)
    if role_type == "ASSESSMENT":
        statement = statement.where(PerformanceRole.is_system.is_(True))
        count_statement = count_statement.where(PerformanceRole.is_system.is_(True))
    normalized_keyword = keyword.strip() if keyword else ""
    if normalized_keyword:
        pattern = f"%{normalized_keyword}%"
        statement = statement.where(
            PerformanceRole.name.ilike(pattern),
        )
        count_statement = count_statement.where(PerformanceRole.name.ilike(pattern))

    total = (await db.execute(count_statement)).scalar_one()
    roles = (
        await db.execute(
            statement.order_by(PerformanceRole.is_system.desc(), PerformanceRole.id).offset((page - 1) * page_size).limit(page_size)
        )
    ).scalars().all()
    return PerformanceRoleListOut(
        items=[_role_out(role) for role in roles],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{role_id:int}", response_model=PerformanceRoleOut)
async def get_performance_role(
    role_id: int,
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> PerformanceRoleOut:
    role = await db.get(PerformanceRole, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")
    return _role_out(role)


@router.post("", response_model=PerformanceRoleOut, status_code=status.HTTP_201_CREATED)
async def create_performance_role(
    payload: PerformanceRoleCreateIn,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> PerformanceRoleOut:
    duplicate = (
        await db.execute(select(PerformanceRole).where(PerformanceRole.name == payload.name))
    ).scalar_one_or_none()
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="角色名称已存在")

    role = PerformanceRole(
        code=f"custom.{uuid4().hex}",
        name=payload.name,
        description=payload.description,
        function_permission_keys=list(dict.fromkeys(payload.function_permission_keys)),
        role_type="MANAGEMENT",
        member_source=None,
        is_system=False,
        is_active=True,
    )
    db.add(role)
    await db.flush()
    actor = await resolve_trusted_performance_actor(db, context)
    PerformanceAuditService(db).append_event(
        AuditEventInput(
            event_type="PERFORMANCE_ROLE_CREATED",
            actor_type=actor.actor_type,
            actor_ref=actor.actor_ref,
            subject_type="PERFORMANCE_ROLE",
            subject_ref=str(role.id),
            after_state={
                "code": role.code,
                "name": role.name,
                "description": role.description,
                "function_permission_keys": role.function_permission_keys,
                "is_system": role.is_system,
                "is_active": role.is_active,
            },
        )
    )
    await db.commit()
    await db.refresh(role)
    return _role_out(role)


@router.patch("/{role_id:int}", response_model=PerformanceRoleOut)
async def update_performance_role(
    role_id: int,
    payload: PerformanceRoleUpdateIn,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> PerformanceRoleOut:
    role = await db.get(PerformanceRole, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")
    if role.role_type != "MANAGEMENT":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="评估角色不可编辑")
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return _role_out(role)
    if "name" in changes:
        duplicate = (
            await db.execute(
                select(PerformanceRole).where(
                    PerformanceRole.name == changes["name"],
                    PerformanceRole.id != role_id,
                )
            )
        ).scalar_one_or_none()
        if duplicate is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="角色名称已存在")
    if "function_permission_keys" in changes:
        changes["function_permission_keys"] = list(dict.fromkeys(changes["function_permission_keys"] or []))
    before_state = {
        "name": role.name,
        "description": role.description,
        "function_permission_keys": role.function_permission_keys,
    }
    for key, value in changes.items():
        setattr(role, key, value)
    actor = await resolve_trusted_performance_actor(db, context)
    PerformanceAuditService(db).append_event(
        AuditEventInput(
            event_type="PERFORMANCE_ROLE_UPDATED",
            actor_type=actor.actor_type,
            actor_ref=actor.actor_ref,
            subject_type="PERFORMANCE_ROLE",
            subject_ref=str(role.id),
            before_state=before_state,
            after_state={key: getattr(role, key) for key in before_state},
        )
    )
    await db.commit()
    await db.refresh(role)
    return _role_out(role)


@router.patch("/{role_id}/status", response_model=PerformanceRoleOut)
async def update_performance_role_status(
    role_id: int,
    payload: PerformanceRoleStatusIn,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> PerformanceRoleOut:
    role = await db.get(PerformanceRole, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")
    if role.role_type != "MANAGEMENT":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="评估角色不可操作")
    if role.is_system and not payload.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="系统角色不可停用")
    if role.is_active == payload.is_active:
        return _role_out(role)

    actor = await resolve_trusted_performance_actor(db, context)
    before_state = {"is_active": role.is_active}
    role.is_active = payload.is_active
    await db.flush()
    PerformanceAuditService(db).append_event(
        AuditEventInput(
            event_type="PERFORMANCE_ROLE_ACTIVATED" if payload.is_active else "PERFORMANCE_ROLE_DEACTIVATED",
            actor_type=actor.actor_type,
            actor_ref=actor.actor_ref,
            subject_type="PERFORMANCE_ROLE",
            subject_ref=str(role.id),
            before_state=before_state,
            after_state={"is_active": role.is_active},
        )
    )
    await db.commit()
    await db.refresh(role)
    return _role_out(role)


@router.delete("/{role_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def delete_performance_role(
    role_id: int,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> None:
    role = await db.get(PerformanceRole, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")
    if role.role_type != "MANAGEMENT":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="评估角色不可删除")
    if role.is_system:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="系统角色不可删除")
    if role.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="需要先停用角色，再进行删除")
    assigned = (
        await db.execute(select(PerformanceRoleAssignment.id).where(PerformanceRoleAssignment.role_id == role_id).limit(1))
    ).scalar_one_or_none()
    if assigned is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该角色仍有授权记录，请先撤销授权")

    actor = await resolve_trusted_performance_actor(db, context)
    before_state = {
        "code": role.code,
        "name": role.name,
        "description": role.description,
        "function_permission_keys": role.function_permission_keys,
        "is_system": role.is_system,
        "is_active": role.is_active,
    }
    PerformanceAuditService(db).append_event(
        AuditEventInput(
            event_type="PERFORMANCE_ROLE_DELETED",
            actor_type=actor.actor_type,
            actor_ref=actor.actor_ref,
            subject_type="PERFORMANCE_ROLE",
            subject_ref=str(role.id),
            before_state=before_state,
        )
    )
    await db.delete(role)
    await db.commit()
