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
from app.performance.models import PerformanceRole


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


class PerformanceRoleListItem(BaseModel):
    id: int
    code: str
    name: str
    description: str | None
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
        is_system=role.is_system,
        is_active=role.is_active,
        updated_at=role.updated_at,
        function_permission_keys=list(role.function_permission_keys or []),
    )


@router.get("", response_model=PerformanceRoleListOut)
async def list_performance_roles(
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 10,
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> PerformanceRoleListOut:
    if page < 1 or page_size < 1 or page_size > 100:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="分页参数无效")

    statement = select(PerformanceRole)
    count_statement = select(func.count()).select_from(PerformanceRole)
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
