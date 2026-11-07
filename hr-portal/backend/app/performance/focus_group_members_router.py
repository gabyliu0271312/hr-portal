"""Object-scoped manual focus group membership maintenance."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import PerformanceAccessContext, get_performance_access_context
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService, PerformanceObjectAuthorizationDenied
from app.performance.feature_authorization import PerformanceFeatureAuthorizationService
from app.performance.models import PerformanceCycle, PerformanceFocusGroup

router = APIRouter(prefix="/performance/cycles", tags=["performance-focus-group-members"])


class FocusGroupMembersPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    employee_nos: list[str] = Field(max_length=10000)


async def _cycle(db, cycle_id):
    cycle = await db.get(PerformanceCycle, cycle_id)
    if cycle is None:
        raise HTTPException(404, "周期不存在")
    return cycle


async def _scope(db, context, cycle, group):
    try:
        return await PerformanceFeatureAuthorizationService(db).resolve_focus_group_member_scope(
            context, cycle_ref=cycle.cycle_ref, group=group,
        )
    except PerformanceObjectAuthorizationDenied as exc:
        raise HTTPException(403, str(exc)) from exc


def _members(group, people):
    allowed = {person.employee_no for person in people}
    return {
        "group_id": group.id,
        "employee_nos": [value for value in (group.employee_nos or []) if value in allowed],
        "people": [{
            "value": person.employee_no, "label": person.display_name,
            "sub_label": " · ".join(value for value in (person.employee_no, person.organization_ref or person.department) if value),
            "department": person.organization_ref or person.department, "email": None,
        } for person in sorted(people, key=lambda item: (item.display_name, item.employee_no))],
    }


@router.get("/{cycle_id}/manageable-focus-groups")
async def manageable_focus_groups(
    cycle_id: int, tab: str | None = None,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    if tab not in (None, "semester", "project"):
        raise HTTPException(422, "人员组类型无效")
    cycle = await _cycle(db, cycle_id)
    statement = select(PerformanceFocusGroup).where(
        PerformanceFocusGroup.cycle_ref == cycle.cycle_ref,
        PerformanceFocusGroup.scope_setting_mode == 1,
    )
    if tab:
        statement = statement.where(PerformanceFocusGroup.tab == tab)
    groups = (await db.execute(statement.order_by(PerformanceFocusGroup.id.desc()))).scalars().all()
    items = []
    for group in groups:
        try:
            await _scope(db, context, cycle, group)
        except HTTPException as exc:
            if exc.status_code != 403:
                raise
            continue
        items.append({"id": group.id, "name": group.name, "tab": group.tab, "scope_setting_mode": 1})
    return {"total": len(items), "items": items}


async def _group(db, cycle, group_id, *, lock=False):
    statement = select(PerformanceFocusGroup).where(
        PerformanceFocusGroup.id == group_id, PerformanceFocusGroup.cycle_ref == cycle.cycle_ref,
    )
    if lock:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    group = await db.scalar(statement)
    if group is None:
        raise HTTPException(404, "人员组不存在")
    if group.scope_setting_mode != 1:
        raise HTTPException(409, "该人员组不允许手动维护成员")
    return group


@router.get("/{cycle_id}/focus-groups/{group_id}/members")
async def get_focus_group_members(
    cycle_id: int, group_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    cycle = await _cycle(db, cycle_id)
    group = await _group(db, cycle, group_id)
    _, people = await _scope(db, context, cycle, group)
    return _members(group, people)


@router.patch("/{cycle_id}/focus-groups/{group_id}/members")
async def update_focus_group_members(
    cycle_id: int, group_id: int, payload: FocusGroupMembersPayload,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    cycle = await _cycle(db, cycle_id)
    group = await _group(db, cycle, group_id, lock=True)
    actor, people = await _scope(db, context, cycle, group)
    allowed = {person.employee_no for person in people}
    requested = list(dict.fromkeys(value.strip() for value in payload.employee_nos))
    if any(value not in allowed for value in requested):
        raise HTTPException(403, "包含无权维护的成员")
    before = list(group.employee_nos or [])
    group.employee_nos = list(dict.fromkeys([value for value in before if value not in allowed] + requested))
    group.updated_by_type = actor.actor_type
    group.updated_by_ref = actor.actor_ref
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PERFORMANCE_FOCUS_GROUP_MEMBERS_UPDATED", cycle_ref=cycle.cycle_ref,
        actor_type=actor.actor_type, actor_ref=actor.actor_ref,
        subject_type="PERFORMANCE_FOCUS_GROUP", subject_ref=str(group.id),
        before_state={"employee_nos": before}, after_state={"employee_nos": group.employee_nos},
    ))
    result = _members(group, people)
    await db.commit()
    return result
