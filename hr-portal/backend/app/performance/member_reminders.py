"""Employee-scoped adapter for the shared performance task reminder sender."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.integrations.feishu.models import FeishuNotificationLog
from app.performance.auth_context import PerformanceAccessContext, get_performance_access_context
from app.performance.models import (
    PROJECT_STATUS_STARTED,
    PerformanceAuthorizationSnapshot,
    PerformanceAuthorizationSnapshotPerson,
    PerformanceIdentityLink,
    PerformanceNodeTask,
    PerformanceNodeTaskAuthorization,
    PerformanceProjectMember,
    PerformanceProjectMemberSnapshot,
    PerformanceProjectNodeSnapshot,
)
from app.users.models import User

router = APIRouter()


def _request_cache(db: AsyncSession, name: str) -> dict:
    info = getattr(db, "info", None)
    if not isinstance(info, dict):
        return {}
    cache = info.setdefault(name, {})
    return cache if isinstance(cache, dict) else {}


class MemberReminderBatchPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_task_id: int | None = Field(default=None, ge=1)
    node_id: str | None = Field(default=None, min_length=1, max_length=128)
    task_ids: list[int] = Field(min_length=1, max_length=500)
    skip_recently_reminded: bool = True


async def preload_member_reminders(project, members, context, db):
    if not members or not isinstance(getattr(db, "info", None), dict):
        return
    from app.performance import projects_router as shared

    snapshot_ids = {member.snapshot_id for member in members}
    employee_nos = {member.employee_no for member in members}
    rows = list((await db.execute(select(PerformanceNodeTask, PerformanceProjectNodeSnapshot).join(
        PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id,
    ).where(
        PerformanceNodeTask.project_id == project.id,
        PerformanceNodeTask.cycle_ref == project.cycle_ref,
        PerformanceNodeTask.member_snapshot_id.in_(snapshot_ids),
        PerformanceNodeTask.target_employee_no.in_(employee_nos),
        PerformanceNodeTask.revoked_at.is_(None),
        PerformanceProjectNodeSnapshot.project_id == project.id,
    ).order_by(PerformanceProjectNodeSnapshot.node_order, PerformanceNodeTask.id))).all())
    task_ids = [task.id for task, _node in rows]
    grants = list((await db.execute(select(PerformanceNodeTaskAuthorization).where(
        PerformanceNodeTaskAuthorization.task_id.in_(task_ids),
        PerformanceNodeTaskAuthorization.project_id == project.id,
        PerformanceNodeTaskAuthorization.cycle_ref == project.cycle_ref,
        PerformanceNodeTaskAuthorization.status == "ACTIVE",
    ).order_by(PerformanceNodeTaskAuthorization.created_at, PerformanceNodeTaskAuthorization.id))).scalars().all()) if task_ids else []
    by_task = {}
    for grant in grants:
        by_task.setdefault(grant.task_id, []).append(grant)
    by_member = {(member.snapshot_id, member.employee_no): [] for member in members}
    for task, node in rows:
        by_member.setdefault((task.member_snapshot_id, task.target_employee_no), []).append((task, node))
    snapshots = {key: await db.get(PerformanceProjectMemberSnapshot, key) for key in snapshot_ids}
    authorizations = {
        snapshot.source_snapshot_id: await db.get(PerformanceAuthorizationSnapshot, snapshot.source_snapshot_id)
        for snapshot in snapshots.values() if snapshot is not None
    }
    key = (project.id, context.subject_type, context.subject_id, context.effective_employee_no, context.switch_session_id)
    _request_cache(db, "performance_member_reminder_preload")[key] = {
        "actor": await shared.resolve_trusted_performance_actor(db, context, cycle_ref=project.cycle_ref),
        "snapshots": snapshots, "authorizations": authorizations,
        "members": {(member.snapshot_id, member.employee_no): member for member in members},
        "rows": by_member, "tasks": {task.id: task for task, _node in rows},
        "nodes": {node.id: node for _task, node in rows}, "grants": by_task,
        "latest_snapshot_id": await db.scalar(select(shared._latest_member_snapshot_statement(project.id))),
    }


def _preloaded_edit_allowed(task, actor_ref, preloaded):
    if task.revoked_at is not None:
        return False
    active = preloaded["grants"].get(task.id, [])
    return (not any(item.authorization_type == "TRANSFER" for item in active) and str(task.handler_ref) == str(actor_ref)
            or any(item.recipient_employee_no == str(actor_ref) and not item.read_only for item in active))


async def _member_scope(project, employee_no, context, db, source_task_id=None, *, preloaded=None):
    from app.performance import projects_router as shared

    if getattr(project, "status", None) != PROJECT_STATUS_STARTED:
        raise HTTPException(404, "PROJECT_NOT_FOUND")
    actor = preloaded["actor"] if preloaded else await shared.resolve_trusted_performance_actor(db, context, cycle_ref=project.cycle_ref)
    source = None
    if source_task_id is not None:
        source = preloaded["tasks"].get(source_task_id) if preloaded else await db.get(PerformanceNodeTask, source_task_id)
        if (source is None or source.project_id != project.id or source.cycle_ref != project.cycle_ref
                or source.target_employee_no != employee_no or source.revoked_at is not None
                or source.task_kind != "evaluation" or actor.actor_type != "EMPLOYEE"):
            raise HTTPException(403, "PROJECT_MEMBER_REMIND_FORBIDDEN")
        source_node = preloaded["nodes"].get(source.node_snapshot_id) if preloaded else await db.get(PerformanceProjectNodeSnapshot, source.node_snapshot_id)
        source_editable = _preloaded_edit_allowed(source, actor.actor_ref, preloaded) if preloaded else await shared._task_edit_allowed(db, source, actor.actor_ref)
        if (source_node is None or source_node.project_id != project.id
                or shared.node_role_code({"node_type": source_node.node_type, **((source_node.config or {}).get("template") or {})}) not in shared.MANAGER_ROLE_CODES
                or not source_editable
                or not shared._task_is_available(source, source_node, project)):
            raise HTTPException(403, "PROJECT_MEMBER_REMIND_FORBIDDEN")
    snapshot_id = source.member_snapshot_id if source is not None else (preloaded["latest_snapshot_id"] if preloaded else await db.scalar(select(shared._latest_member_snapshot_statement(project.id))))
    snapshot = preloaded["snapshots"].get(snapshot_id) if preloaded else await db.get(PerformanceProjectMemberSnapshot, snapshot_id) if snapshot_id is not None else None
    if snapshot is None or snapshot.project_id != project.id or snapshot.cycle_ref != project.cycle_ref:
        raise HTTPException(404, "PROJECT_MEMBER_NOT_FOUND")
    authorization_snapshot = preloaded["authorizations"].get(snapshot.source_snapshot_id) if preloaded else await db.get(PerformanceAuthorizationSnapshot, snapshot.source_snapshot_id)
    if authorization_snapshot is None or authorization_snapshot.cycle_ref != project.cycle_ref:
        raise HTTPException(404, "PROJECT_MEMBER_NOT_FOUND")

    scope_cache = _request_cache(db, "performance_member_reminder_management")
    scope_key = (project.id, context.subject_type, context.subject_id, context.effective_employee_no, context.switch_session_id)
    management = scope_cache.get(scope_key)
    if management is None:
        managed = await shared._can_manage_project_like_overview(context, project, db)
        scope = None
        if managed:
            try:
                scope = await shared._project_data_scope(context, project, db, "performance.frontend.data-view")
            except HTTPException as exc:
                if exc.status_code != 403:
                    raise
                managed = False
        management = (managed, scope)
        scope_cache[scope_key] = management
    managed, scope = management
    managed = managed and (scope is None or employee_no in scope)
    manager_task = source
    if not managed:
        if actor.actor_type != "EMPLOYEE":
            raise HTTPException(403, "PROJECT_MEMBER_REMIND_FORBIDDEN")
        if preloaded:
            manager_task = next((task for task, node in preloaded["rows"].get((snapshot_id, employee_no), [])
                if task.task_kind == "evaluation" and shared.node_role_code({"node_type": node.node_type, **((node.config or {}).get("template") or {})}) in shared.MANAGER_ROLE_CODES
                and str(actor.actor_ref) in shared.effective_handlers(task.handler_ref, preloaded["grants"].get(task.id, []))), None)
        else:
            manager_task = await shared._member_manager_task_for_actor(db, project.id, employee_no, actor.actor_ref, snapshot_id)
        editable = manager_task is not None and (_preloaded_edit_allowed(manager_task, actor.actor_ref, preloaded) if preloaded else await shared._task_edit_allowed(db, manager_task, actor.actor_ref))
        if (manager_task is None or manager_task.project_id != project.id
                or manager_task.member_snapshot_id != snapshot_id or manager_task.cycle_ref != project.cycle_ref
                or manager_task.target_employee_no != employee_no or manager_task.revoked_at is not None
                or not editable):
            raise HTTPException(403, "PROJECT_MEMBER_REMIND_FORBIDDEN")
        manager_node = preloaded["nodes"].get(manager_task.node_snapshot_id) if preloaded else await db.get(PerformanceProjectNodeSnapshot, manager_task.node_snapshot_id)
        if (manager_node is None or manager_node.project_id != project.id
                or not shared._task_is_available(manager_task, manager_node, project)):
            raise HTTPException(403, "PROJECT_MEMBER_REMIND_FORBIDDEN")
    member = preloaded["members"].get((snapshot_id, employee_no)) if preloaded else await db.scalar(select(PerformanceProjectMember).where(
        PerformanceProjectMember.snapshot_id == snapshot_id,
        PerformanceProjectMember.employee_no == employee_no,
    ))
    if member is None:
        raise HTTPException(404, "PROJECT_MEMBER_NOT_FOUND")
    return actor, snapshot, member, manager_task


async def _member_tasks(project, employee_no, context, db, source_task_id=None, node_id=None, task_id=None, *, first_only=False):
    from app.performance import projects_router as shared
    from app.integrations.feishu.notification_service import _global_delivery_mode

    preload_cache = _request_cache(db, "performance_member_reminder_preload")
    preload_key = (project.id, context.subject_type, context.subject_id, context.effective_employee_no, context.switch_session_id)
    preloaded = preload_cache.get(preload_key) if first_only else None
    scope_cache = _request_cache(db, "performance_member_reminder_scope") if first_only else {}
    scope_key = (project.id, employee_no, source_task_id, context.subject_type, context.subject_id, context.effective_employee_no, context.switch_session_id)
    scoped = scope_cache.get(scope_key)
    if scoped is None:
        scoped = await _member_scope(project, employee_no, context, db, source_task_id, preloaded=preloaded)
        scope_cache[scope_key] = scoped
    actor, snapshot, member, manager_task = scoped
    statement = select(PerformanceNodeTask, PerformanceProjectNodeSnapshot).join(
        PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id,
    ).where(
        PerformanceNodeTask.project_id == project.id,
        PerformanceNodeTask.cycle_ref == project.cycle_ref,
        PerformanceNodeTask.member_snapshot_id == snapshot.id,
        PerformanceNodeTask.target_employee_no == employee_no,
        PerformanceNodeTask.revoked_at.is_(None),
        PerformanceProjectNodeSnapshot.project_id == project.id,
    ).order_by(PerformanceProjectNodeSnapshot.node_order, PerformanceNodeTask.id)
    if preloaded and node_id is None and task_id is None:
        rows = preloaded["rows"].get((snapshot.id, employee_no), [])
    else:
        if node_id is not None:
            statement = statement.where(PerformanceProjectNodeSnapshot.node_id == node_id)
        if task_id is not None:
            statement = statement.where(PerformanceNodeTask.id == task_id)
        rows = (await db.execute(statement)).all()
    rows = [(task, node) for task, node in rows if (
        task.project_id == project.id and task.cycle_ref == project.cycle_ref
        and task.member_snapshot_id == snapshot.id and task.target_employee_no == employee_no
        and node.project_id == project.id and task.node_snapshot_id == node.id
        and task.revoked_at is None and (node_id is None or node.node_id == node_id)
        and (task_id is None or task.id == task_id)
    )]
    if task_id is not None and not rows:
        raise HTTPException(404, "REMINDER_TARGET_NOT_FOUND")
    people_cache = _request_cache(db, "performance_member_reminder_people")
    people_key = snapshot.source_snapshot_id
    people_data = people_cache.get(people_key)
    if people_data is None:
        people = list((await db.execute(select(PerformanceAuthorizationSnapshotPerson).where(
            PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.source_snapshot_id,
        ))).scalars().all())
        people_by_no = {person.employee_no: person for person in people}
        active_people = {person.employee_no for person in people if person.employment_status not in {"离职", "已离职"}}
        delivery_mode = await _global_delivery_mode(db)
        deliverable = active_people
        if delivery_mode == "normal":
            deliverable = set((await db.execute(select(PerformanceIdentityLink.employee_no).join(
                User, User.id == PerformanceIdentityLink.portal_user_id,
            ).where(
                PerformanceIdentityLink.employee_no.in_(active_people), PerformanceIdentityLink.is_active.is_(True),
                User.is_active.is_(True), User.feishu_user_id.is_not(None), User.feishu_user_id != "",
            ))).scalars().all()) & active_people
        people_data = (people_by_no, deliverable)
        people_cache[people_key] = people_data
    people_by_no, deliverable = people_data
    if preloaded:
        by_task = preloaded["grants"]
    else:
        delegations = list((await db.execute(select(PerformanceNodeTaskAuthorization).where(
            PerformanceNodeTaskAuthorization.task_id.in_([task.id for task, _node in rows]),
            PerformanceNodeTaskAuthorization.project_id == project.id,
            PerformanceNodeTaskAuthorization.cycle_ref == project.cycle_ref,
            PerformanceNodeTaskAuthorization.status == "ACTIVE",
        ))).scalars().all()) if rows else []
        by_task = {}
        for delegation in delegations:
            by_task.setdefault(delegation.task_id, []).append(delegation)
    candidates = []
    for task, node in rows:
        if task.status != "pending" or shared._task_completed(task) or not shared._task_is_available(task, node, project):
            continue
        if node.node_type == "calibration" and not shared.calibration_task_scope(task, node):
            continue
        if node.node_type == "result_reconsideration" and not await shared._completion_reconsideration_valid(db, task):
            continue
        active = by_task.get(task.id, [])
        handlers = shared.effective_handlers(task.handler_ref, active)
        if actor.actor_type == "EMPLOYEE" and str(actor.actor_ref) in handlers:
            continue
        writable = {item.recipient_employee_no for item in active if not item.read_only}
        if not any(item.authorization_type == "TRANSFER" for item in active):
            writable.add(str(task.handler_ref))
        handlers = handlers & writable
        receivers = handlers & deliverable
        # Never partially deliver a task whose effective recipients are unavailable.
        selectable = bool(handlers) and receivers == handlers
        candidates.append((task, node, sorted(receivers) if selectable else [], handlers))
        if first_only and selectable:
            break
    return actor, snapshot, member, manager_task, people_by_no, candidates


async def can_remind_member(project, employee_no, context, db, source_task_id=None) -> bool:
    try:
        *_scope, candidates = await _member_tasks(project, employee_no, context, db, source_task_id, first_only=True)
    except HTTPException as exc:
        if exc.status_code in {403, 404}:
            return False
        raise
    return any(receivers for _task, _node, receivers, _handlers in candidates)


@router.get("/projects/{project_id}/members/{employee_no}/reminder-tasks")
async def project_member_reminder_tasks(
    project_id: int,
    employee_no: str,
    source_task_id: int | None = Query(default=None, ge=1),
    node_id: str | None = Query(default=None, min_length=1, max_length=128),
    task_id: int | None = Query(default=None, ge=1),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    from app.performance import projects_router as shared

    project = await shared._get_project(db, project_id)
    actor, snapshot, member, manager_task, people, candidates = await _member_tasks(project, employee_no, context, db, source_task_id, node_id, task_id)
    if not candidates:
        return {"items": [], "total": 0, "can_remind": False}
    visibility_node = await db.get(PerformanceProjectNodeSnapshot, manager_task.node_snapshot_id) if manager_task is not None else candidates[0][1]
    visibility_role = await shared.resolve_subject_visibility_role(db, context, actor.actor_ref, member, visibility_node, project)
    visible_fields = (await shared.load_subject_visibility_rules(db))[visibility_role]
    names = {no: person.display_name for no, person in people.items()}
    profile = shared.mask_profile_values({
        "department": shared.organization_leaf(member),
        "organization_path": member.organization_ref if "department" in visible_fields else None,
        "position_level": member.position_level,
        "job_sequence": shared.format_job_sequence(member.job_family, member.job_category),
        "direct_supervisor": names.get(member.direct_supervisor_employee_no),
        "hire_date": member.hire_date.isoformat() if member.hire_date else None,
        "employee_type": member.employee_type,
    }, visible_fields)
    items = [{
        **profile,
        "task_id": task.id, "project_id": project.id, "project_name": project.name,
        "employee_no": member.employee_no, "display_name": member.display_name,
        "member_snapshot_id": snapshot.id, "node_id": node.node_id, "node_name": node.name,
        "task_kind": task.task_kind, "status": shared._review_task_status(task, *[
            value.isoformat() if value else None for value in shared._task_window(task, node, project)
        ]),
        "due_at": shared._task_window(task, node, project)[1],
        "reminder_target": "、".join(names.get(handler, handler) for handler in sorted(handlers)),
        "selectable": bool(receivers), "can_authorize": False,
        "visible_profile_fields": visible_fields,
        "unavailable_reason": None if receivers else "TASK_HANDLER_UNAVAILABLE",
    } for task, node, receivers, handlers in candidates]
    return {"items": items, "total": len(items), "can_remind": any(item["selectable"] for item in items)}


@router.post("/projects/{project_id}/members/{employee_no}/remind-batch")
async def project_member_remind_batch(
    project_id: int,
    employee_no: str,
    payload: MemberReminderBatchPayload,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    from app.performance import projects_router as shared

    project = await shared._get_project(db, project_id)
    actor, _snapshot, _member, _manager_task, _people, candidates = await _member_tasks(
        project, employee_no, context, db, payload.source_task_id, payload.node_id,
    )
    allowed = {task.id: (task, node, receivers) for task, node, receivers, _handlers in candidates if receivers}
    task_ids = list(dict.fromkeys(payload.task_ids))
    recent = set()
    if payload.skip_recently_reminded and allowed:
        recent = set((await db.execute(select(FeishuNotificationLog.biz_id).where(
            FeishuNotificationLog.biz_type == "performance_task_reminder",
            FeishuNotificationLog.biz_id.in_([str(task_id) for task_id in task_ids if task_id in allowed]),
            FeishuNotificationLog.is_test.is_(False),
            FeishuNotificationLog.status == "success",
            FeishuNotificationLog.created_at >= datetime.now(UTC) - timedelta(hours=6),
        ))).scalars().all())
    accepted, skipped, failed, preview, errors = [], [], [], [], []
    for task_id in task_ids:
        if task_id not in allowed or str(task_id) in recent:
            skipped.append(task_id)
            continue
        task, node, receivers = allowed[task_id]
        if (task.status != "pending" or task.revoked_at is not None or shared._task_completed(task)
                or not shared._task_is_available(task, node, project)
                or not set(receivers).issubset(await shared._task_handlers(db, task))):
            skipped.append(task_id)
            continue
        if node.node_type == "result_reconsideration" and not await shared._completion_reconsideration_valid(db, task, lock=True):
            skipped.append(task_id)
            continue
        outcomes = []
        for handler in receivers:
            notification_task = SimpleNamespace(id=task.id, handler_ref=handler, member_snapshot_id=task.member_snapshot_id, target_employee_no=task.target_employee_no)
            outcomes.append(await shared._send_performance_task_reminder(notification_task, project, node, context, db))
        if all(ok for ok, _error in outcomes):
            accepted.append(task_id)
            delivery_status = "sent"
        elif all(ok or error == "NOTIFICATION_PREVIEW_ONLY" for ok, error in outcomes):
            preview.append(task_id)
            delivery_status = "preview_only"
        else:
            failed.append(task_id)
            error = next((error for ok, error in outcomes if not ok), None) or "NOTIFICATION_FAILED"
            errors.append({"task_id": task_id, "error": error})
            delivery_status = "failed"
        shared.PerformanceAuditService(db).append_event(shared.AuditEventInput(
            event_type="PERFORMANCE_TASK_REMINDER_REQUESTED", cycle_ref=project.cycle_ref,
            employee_no=task.target_employee_no, actor_type=actor.actor_type, actor_ref=actor.actor_ref,
            subject_type="PERFORMANCE_NODE_TASK", subject_ref=str(task.id),
            after_state={"action": "remind", "node_id": node.node_id, "delivery_status": delivery_status},
        ))
    await db.commit()
    delivery_status = "preview_only" if preview and not accepted and not failed else "success" if accepted and not failed and not skipped and not preview else "partial_success" if accepted or preview else "failed"
    return {"accepted_task_ids": accepted, "skipped_task_ids": skipped, "failed_task_ids": failed,
            "preview_task_ids": preview, "delivery_status": delivery_status, "errors": errors}
