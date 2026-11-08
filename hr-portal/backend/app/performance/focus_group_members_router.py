"""Object-scoped manual focus group membership maintenance.

详情管理页成员列表 / 变更记录（REA 对齐飞书人员组管理详情页）：
- 成员列表列：姓名 / 直属上级 / 一级部门 / 末级部门 / 序列 / 添加人 / 添加时间 / 操作
- 变更记录列：操作人 / 操作类型 / 操作条件 / 变更人员数 / 操作时间
- 数据源：周期授权快照 person（画像字段）+ performance_audit_events 的
  PERFORMANCE_FOCUS_GROUP_MEMBERS_UPDATED 事件（操作人 / 操作时间 / 新增移除 diff）
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import PerformanceAccessContext, get_performance_access_context
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService, PerformanceObjectAuthorizationDenied
from app.performance.feature_authorization import PerformanceFeatureAuthorizationService
from app.performance.models import (
    PerformanceAuditEvent,
    PerformanceAuthorizationSnapshot,
    PerformanceAuthorizationSnapshotPerson,
    PerformanceCycle,
    PerformanceFocusGroup,
)

router = APIRouter(prefix="/performance/cycles", tags=["performance-focus-group-members"])

MEMBERS_UPDATED_EVENT = "PERFORMANCE_FOCUS_GROUP_MEMBERS_UPDATED"


async def _snapshot_people(db: AsyncSession, cycle_ref: str) -> list[PerformanceAuthorizationSnapshotPerson]:
    snapshot = await db.scalar(select(PerformanceAuthorizationSnapshot).where(
        PerformanceAuthorizationSnapshot.cycle_ref == cycle_ref,
    ))
    if snapshot is None:
        return []
    return list((await db.execute(select(PerformanceAuthorizationSnapshotPerson).where(
        PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.id,
    ))).scalars().all())


async def _actor_names(db: AsyncSession, cycle_ref: str, refs: list[str]) -> dict[str, str]:
    """操作人姓名解析：PORTAL_USER actor_ref 为 user id；EMPLOYEE 为 employee_no。"""
    from app.users.models import User

    names: dict[str, str] = {}
    user_ids = [int(value) for value in refs if str(value).isdigit()]
    if user_ids:
        users = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
        names.update({str(user.id): user.display_name for user in users})
    remaining = [value for value in refs if value not in names]
    if remaining:
        snapshot_people = await _snapshot_people(db, cycle_ref)
        names.update({person.employee_no: person.display_name for person in snapshot_people if person.employee_no in remaining})
    return names


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


def _members(group, people, name_source=None):
    """成员列表 payload：按组内 employee_nos 逐人返回。

    people 为快照全量人（name_source 同用于直属上级姓名解析）；快照有画像的成员给完整画像，
    组内但不在快照的成员兜底最小画像（保证详情人数与列表 employee_nos.length 一致）。
    """
    people_by_no = {person.employee_no: person for person in (name_source or people)}
    member_nos = []
    member_rows = []
    for value in group.employee_nos or []:
        member_nos.append(value)
        person = people_by_no.get(value)
        member_rows.append({
            "value": value,
            "label": person.display_name if person else value,
            "sub_label": " · ".join(item for item in (value, person.organization_ref or person.department) if item) if person else value,
            "department": person.organization_ref or person.department if person else None,
            "email": None,
            "display_name": person.display_name if person else value,
            "direct_supervisor_employee_no": person.direct_supervisor_employee_no if person else None,
            "direct_supervisor_name": (people_by_no[person.direct_supervisor_employee_no].display_name
                if person and person.direct_supervisor_employee_no in people_by_no else None),
            "department_2": person.department_2 if person else None,
            "department_5": person.department_5 if person else None,
            "job_family": person.job_family if person else None,
        })
    return {"group_id": group.id, "employee_nos": member_nos, "people": member_rows}


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


async def _group(db, cycle, group_id, *, lock=False, require_manual=True):
    statement = select(PerformanceFocusGroup).where(
        PerformanceFocusGroup.id == group_id, PerformanceFocusGroup.cycle_ref == cycle.cycle_ref,
    )
    if lock:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    group = await db.scalar(statement)
    if group is None:
        raise HTTPException(404, "人员组不存在")
    if require_manual and group.scope_setting_mode != 1:
        raise HTTPException(409, "该人员组不允许手动维护成员")
    return group


async def _member_added_by(db: AsyncSession, cycle: PerformanceCycle, group: PerformanceFocusGroup) -> dict[str, dict[str, Any]]:
    """成员最近一次「新增」的操作人/时间。老成员无事件 → 缺失（前端显示 --）。

    按事件倒序遍历，取每个成员最后一次出现在「新增集合」的事件；一次事件同批加入的成员共用一个
    操作人/时间。返回 {employee_no: {added_by: str, added_at: str(iso)}}。
    """
    events = list((await db.execute(select(PerformanceAuditEvent).where(
        PerformanceAuditEvent.cycle_ref == cycle.cycle_ref,
        PerformanceAuditEvent.event_type == MEMBERS_UPDATED_EVENT,
        PerformanceAuditEvent.subject_type == "PERFORMANCE_FOCUS_GROUP",
        PerformanceAuditEvent.subject_ref == str(group.id),
    ).order_by(PerformanceAuditEvent.event_at.desc()))).scalars().all())
    if not events:
        return {}
    actor_refs = list(dict.fromkeys(event.actor_ref for event in events))
    actor_names = await _actor_names(db, cycle.cycle_ref, actor_refs)
    result: dict[str, dict[str, Any]] = {}
    for event in events:
        before = set(event.before_state.get("employee_nos") or [])
        after = set(event.after_state.get("employee_nos") or [])
        added = after - before
        if not added:
            continue
        actor_name = actor_names.get(event.actor_ref) or str(event.actor_ref)
        for employee_no in added:
            if employee_no not in result:
                result[employee_no] = {
                    "added_by": actor_name,
                    "added_at": event.event_at.replace(tzinfo=UTC).isoformat() if event.event_at.tzinfo is None else event.event_at.isoformat(),
                }
    return result


async def _change_events(db: AsyncSession, cycle: PerformanceCycle, group: PerformanceFocusGroup, limit: int, offset: int):
    statement = select(PerformanceAuditEvent).where(
        PerformanceAuditEvent.cycle_ref == cycle.cycle_ref,
        PerformanceAuditEvent.event_type == MEMBERS_UPDATED_EVENT,
        PerformanceAuditEvent.subject_type == "PERFORMANCE_FOCUS_GROUP",
        PerformanceAuditEvent.subject_ref == str(group.id),
    ).order_by(PerformanceAuditEvent.event_at.desc(), PerformanceAuditEvent.id.desc())
    total = len((await db.execute(statement)) .scalars().all())
    events = list((await db.execute(statement.offset(offset).limit(limit))).scalars().all())
    return total, events


@router.get("/{cycle_id}/focus-groups/{group_id}/change-log")
async def get_focus_group_change_log(
    cycle_id: int,
    group_id: int,
    current: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 10,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    """变更记录（对齐飞书 change_log/show）：一次成员变更事件 diff 成「新增」「移除」两条记录。

    - 操作类型：新增 / 移除
    - 操作条件：仅移除显示被移除成员姓名（逗号分隔）；新增为空
    - 变更人员数：本记录涉及人数；前端点开用 people/change-people 快照接口
    - 操作人/操作时间：审计事件 actor + event_at
    """
    cycle = await _cycle(db, cycle_id)
    group = await _group(db, cycle, group_id, require_manual=False)
    total, events = await _change_events(db, cycle, group, size, (current - 1) * size)
    snapshot_people = await _snapshot_people(db, cycle.cycle_ref)
    names = {person.employee_no: person.display_name for person in snapshot_people}
    actor_names = await _actor_names(db, cycle.cycle_ref, [event.actor_ref for event in events])
    items = []
    for event in events:
        before = set(event.before_state.get("employee_nos") or [])
        after = set(event.after_state.get("employee_nos") or [])
        added = sorted(after - before)
        removed = sorted(before - after)
        operator = actor_names.get(event.actor_ref) or str(event.actor_ref)
        event_at = event.event_at.replace(tzinfo=UTC) if event.event_at.tzinfo is None else event.event_at
        changed_at = event_at.isoformat()
        if added:
            items.append({
                "id": f"{event.id}-add",
                "event_id": event.id,
                "operator": operator,
                "change_type": "新增",
                "condition": "",
                "user_ids": added,
                "count": len(added),
                "changed_at": changed_at,
            })
        if removed:
            items.append({
                "id": f"{event.id}-remove",
                "event_id": event.id,
                "operator": operator,
                "change_type": "移除",
                "condition": "、".join(names.get(value, value) for value in removed),
                "user_ids": removed,
                "count": len(removed),
                "changed_at": changed_at,
            })
    return {"total": total, "items": items}


@router.get("/{cycle_id}/focus-groups/{group_id}/change-log/{event_id}/people")
async def get_focus_group_change_people(
    cycle_id: int,
    group_id: int,
    event_id: int,
    user_ids: str = Query(...),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    """变更人员数展开弹窗的数据（对齐飞书 snapshot/simple 员工快照）。

    user_ids 为逗号分隔员工编号（前端点击记录时回传本记录的 user_ids），返回当前快照画像：
    姓名 / 直属上级 / 一级部门 / 末级部门 / 序列。
    """
    cycle = await _cycle(db, cycle_id)
    group = await _group(db, cycle, group_id, require_manual=False)
    employee_nos = [value for value in (user_ids.split(",") if user_ids else []) if value]
    snapshot_people = await _snapshot_people(db, cycle.cycle_ref)
    by_no = {person.employee_no: person for person in snapshot_people}
    names = {person.employee_no: person.display_name for person in snapshot_people}
    items = []
    for employee_no in employee_nos:
        person = by_no.get(employee_no)
        if person is None:
            continue
        items.append({
            "employee_no": person.employee_no,
            "display_name": person.display_name,
            "direct_supervisor_name": names.get(person.direct_supervisor_employee_no) if person.direct_supervisor_employee_no else None,
            "department_2": person.department_2,
            "department_5": person.department_5,
            "job_family": person.job_family,
        })
    return {"items": items}


@router.get("/{cycle_id}/focus-groups/{group_id}/members")
async def get_focus_group_members(
    cycle_id: int, group_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    cycle = await _cycle(db, cycle_id)
    group = await _group(db, cycle, group_id, require_manual=False)
    snapshot_people = await _snapshot_people(db, cycle.cycle_ref)
    added_by = await _member_added_by(db, cycle, group)
    result = _members(group, snapshot_people, name_source=snapshot_people)
    for person in result["people"]:
        info = added_by.get(person["value"])
        person["added_by"] = info["added_by"] if info else None
        person["added_at"] = info["added_at"] if info else None
    return result


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
    snapshot_people = await _snapshot_people(db, cycle.cycle_ref)
    added_by = await _member_added_by(db, cycle, group)
    result = _members(group, snapshot_people, name_source=snapshot_people)
    for person in result["people"]:
        info = added_by.get(person["value"])
        person["added_by"] = info["added_by"] if info else None
        person["added_at"] = info["added_at"] if info else None
    await db.commit()
    return result
