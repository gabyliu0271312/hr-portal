"""Performance focus groups (人员组) API.

契约对齐 REA 实测飞书「人员组管理」页：
- 列表：按 cycle + tab（semester | project）拉取，一次拿全量（切换页签不发新请求）
- priority check：进入页面时校验该周期是否仍允许维护人员组（被评估项目占用时为 false）
- CRUD：新建 / 编辑 / 删除，权限键复用已预留的 performance.backend.people-groups.cycle
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import (
    PerformanceAccessContext,
    require_performance_permission,
)
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.models import PerformanceCycle, PerformanceFocusGroup

router = APIRouter(prefix="/performance/cycles", tags=["performance-focus-groups"])

FOCUS_GROUP_TAB = Literal["semester", "project"]
FOCUS_GROUP_PERMISSION = "performance.backend.people-groups.cycle"


class FocusGroupPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=128)
    tab: FOCUS_GROUP_TAB = "semester"
    employee_nos: list[str] = Field(default_factory=list)
    scope_mode: str = Field(default="manual", max_length=32)
    project_ref: str | None = Field(default=None, max_length=64)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("人员组名称不能为空")
        return normalized

    @field_validator("employee_nos")
    @classmethod
    def normalize_employee_nos(cls, value: list[str]) -> list[str]:
        seen: list[str] = []
        for employee_no in value:
            normalized = employee_no.strip()
            if normalized and normalized not in seen:
                seen.append(normalized)
        return seen


class FocusGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cycle_ref: str
    tab: str
    name: str
    employee_nos: list[str]
    scope_mode: str
    project_ref: str | None
    created_by_type: str | None
    created_by_ref: str | None
    updated_by_type: str | None
    updated_by_ref: str | None
    created_at: datetime
    updated_at: datetime


class FocusGroupPage(BaseModel):
    total: int
    items: list[FocusGroupOut]


class FocusGroupPriorityCheck(BaseModel):
    data: bool


async def _require_cycle(db: AsyncSession, cycle_id: int) -> PerformanceCycle:
    cycle = await db.get(PerformanceCycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="周期不存在")
    return cycle


def _is_project_occupied(db: AsyncSession, cycle_ref: str, tab: str, project_ref: str | None) -> bool:
    # 预留：Tab2 关联评估项目级的人员组需在创建时校验项目是否已被其他人员组占用。
    # 当前租户无该场景数据，占用校验留待补采飞书交互后完善。
    return False


@router.get("/{cycle_id}/focus-groups/priority-check", response_model=FocusGroupPriorityCheck)
async def check_focus_group_priority(
    cycle_id: int,
    _: PerformanceAccessContext = Depends(require_performance_permission(FOCUS_GROUP_PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> FocusGroupPriorityCheck:
    await _require_cycle(db, cycle_id)
    # 飞书返回 { data: true }：当前周期允许维护人员组。占用场景（被评估项目锁定）时置 false。
    return FocusGroupPriorityCheck(data=True)


@router.get("/{cycle_id}/focus-groups", response_model=FocusGroupPage)
async def list_focus_groups(
    cycle_id: int,
    tab: FOCUS_GROUP_TAB = "semester",
    current: Annotated[int, Field(ge=1)] = 1,
    size: Annotated[int, Field(ge=1, le=100)] = 10,
    keyword: str | None = None,
    _: PerformanceAccessContext = Depends(require_performance_permission(FOCUS_GROUP_PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> FocusGroupPage:
    cycle = await _require_cycle(db, cycle_id)
    filters = [
        PerformanceFocusGroup.cycle_ref == cycle.cycle_ref,
        PerformanceFocusGroup.tab == tab,
    ]
    if keyword:
        filters.append(PerformanceFocusGroup.name.ilike(f"%{keyword}%"))
    total = await db.scalar(select(func.count()).select_from(PerformanceFocusGroup).where(*filters)) or 0
    statement = (
        select(PerformanceFocusGroup)
        .where(*filters)
        .order_by(PerformanceFocusGroup.id.desc())
        .offset((current - 1) * size)
        .limit(size)
    )
    items = (await db.execute(statement)).scalars().all()
    return FocusGroupPage(total=total, items=[FocusGroupOut.model_validate(item) for item in items])


@router.post("/{cycle_id}/focus-groups", response_model=FocusGroupOut, status_code=status.HTTP_201_CREATED)
async def create_focus_group(
    cycle_id: int,
    payload: FocusGroupPayload,
    context: PerformanceAccessContext = Depends(require_performance_permission(FOCUS_GROUP_PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> FocusGroupOut:
    cycle = await _require_cycle(db, cycle_id)
    if payload.tab == "project" and _is_project_occupied(db, cycle.cycle_ref, payload.tab, payload.project_ref):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该评估项目已关联其他人员组")
    duplicate = await db.scalar(
        select(PerformanceFocusGroup).where(
            PerformanceFocusGroup.cycle_ref == cycle.cycle_ref,
            PerformanceFocusGroup.tab == payload.tab,
            PerformanceFocusGroup.name == payload.name,
        )
    )
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前周期已存在同名人员组")
    group = PerformanceFocusGroup(
        cycle_ref=cycle.cycle_ref,
        tab=payload.tab,
        name=payload.name,
        employee_nos=payload.employee_nos,
        scope_mode=payload.scope_mode,
        project_ref=payload.project_ref,
        created_by_type=context.subject_type,
        created_by_ref=str(context.subject_id),
        updated_by_type=context.subject_type,
        updated_by_ref=str(context.subject_id),
    )
    db.add(group)
    await db.flush()
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PERFORMANCE_FOCUS_GROUP_CREATED",
        cycle_ref=cycle.cycle_ref,
        actor_type=context.subject_type,
        actor_ref=str(context.subject_id),
        subject_type="PERFORMANCE_FOCUS_GROUP",
        subject_ref=str(group.id),
        after_state={"tab": payload.tab, "name": payload.name, "employee_nos": payload.employee_nos},
    ))
    await db.commit()
    await db.refresh(group)
    return FocusGroupOut.model_validate(group)


@router.patch("/{cycle_id}/focus-groups/{group_id}", response_model=FocusGroupOut)
async def update_focus_group(
    cycle_id: int,
    group_id: int,
    payload: FocusGroupPayload,
    context: PerformanceAccessContext = Depends(require_performance_permission(FOCUS_GROUP_PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> FocusGroupOut:
    cycle = await _require_cycle(db, cycle_id)
    group = await db.get(PerformanceFocusGroup, group_id)
    if group is None or group.cycle_ref != cycle.cycle_ref:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="人员组不存在")
    duplicate = await db.scalar(
        select(PerformanceFocusGroup).where(
            PerformanceFocusGroup.cycle_ref == cycle.cycle_ref,
            PerformanceFocusGroup.tab == payload.tab,
            PerformanceFocusGroup.name == payload.name,
            PerformanceFocusGroup.id != group_id,
        )
    )
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前周期已存在同名人员组")
    before = {"tab": group.tab, "name": group.name, "employee_nos": list(group.employee_nos or [])}
    group.tab = payload.tab
    group.name = payload.name
    group.employee_nos = payload.employee_nos
    group.scope_mode = payload.scope_mode
    group.project_ref = payload.project_ref
    group.updated_by_type = context.subject_type
    group.updated_by_ref = str(context.subject_id)
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PERFORMANCE_FOCUS_GROUP_UPDATED",
        cycle_ref=cycle.cycle_ref,
        actor_type=context.subject_type,
        actor_ref=str(context.subject_id),
        subject_type="PERFORMANCE_FOCUS_GROUP",
        subject_ref=str(group.id),
        before_state=before,
        after_state={"tab": group.tab, "name": group.name, "employee_nos": group.employee_nos},
    ))
    await db.commit()
    await db.refresh(group)
    return FocusGroupOut.model_validate(group)


@router.delete("/{cycle_id}/focus-groups/{group_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def delete_focus_group(
    cycle_id: int,
    group_id: int,
    context: PerformanceAccessContext = Depends(require_performance_permission(FOCUS_GROUP_PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> None:
    cycle = await _require_cycle(db, cycle_id)
    group = await db.get(PerformanceFocusGroup, group_id)
    if group is None or group.cycle_ref != cycle.cycle_ref:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="人员组不存在")
    await db.delete(group)
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PERFORMANCE_FOCUS_GROUP_DELETED",
        cycle_ref=cycle.cycle_ref,
        actor_type=context.subject_type,
        actor_ref=str(context.subject_id),
        subject_type="PERFORMANCE_FOCUS_GROUP",
        subject_ref=str(group.id),
    ))
    await db.commit()
