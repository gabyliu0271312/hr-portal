"""Performance role configuration API."""
from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import (
    PerformanceAccessContext,
    require_performance_permission,
    resolve_trusted_performance_actor,
)
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.models import PerformanceRole, PerformanceRoleAssignment


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


async def _context(
    context: PerformanceAccessContext = Depends(
        require_performance_permission(ROLE_CONFIGURATION_PERMISSION)
    ),
) -> PerformanceAccessContext:
    return context


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
    if role.is_system:
        if any(key in changes for key in ("name", "function_permission_keys")):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="系统角色名称和权限不可编辑")
        changes = {"description": changes["description"]} if "description" in changes else {}
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
