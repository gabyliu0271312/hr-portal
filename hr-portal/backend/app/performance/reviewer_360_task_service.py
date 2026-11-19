from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from hashlib import sha256
import json

from fastapi import HTTPException
from sqlalchemy import select

from app.performance.models import (
    PerformanceAuditEvent, PerformanceAuthorizationSnapshotPerson, PerformanceNodeTask,
    PerformanceProject, PerformanceProjectMember, PerformanceProjectMemberSnapshot,
    PerformanceProjectNodeSnapshot, PROJECT_STATUS_STARTED,
)

TASK_KINDS = {"reviewer_360_invite", "reviewer_360_confirm"}
SNAPSHOT_KEY = "__reviewer_360"
REVOKE_REASON = "周期尚未启用360°评估人删除权限"


async def evaluation_node(db, project, source_node):
    from app.performance import review_360_invites_router as invites

    nodes = await invites._project_nodes(db, project.id)
    candidates = [node for node in nodes if invites._is_360_evaluation_node(node)]
    template = (source_node.config or {}).get("template") or {}
    binding = template.get("reviewer_360_node_id")
    if binding:
        return await invites._evaluation_node(db, project.id, str(binding), nodes=nodes)
    if len(candidates) != 1:
        raise HTTPException(409, "REVIEWER_360_NODE_AMBIGUOUS" if candidates else "REVIEWER_360_NODE_NOT_CONFIGURED")
    return candidates[0]


async def task_context(db, context, project_id, source_task_id=None, *, write=False):
    from app.performance import projects_router as shared

    if source_task_id is None:
        actor = await shared.resolve_trusted_performance_actor(db, context, require_employee_identity=True)
        rows = list((await db.execute(select(PerformanceNodeTask).where(
            PerformanceNodeTask.project_id == project_id,
            PerformanceNodeTask.handler_ref == str(actor.actor_ref),
            PerformanceNodeTask.target_employee_no == str(actor.actor_ref),
            PerformanceNodeTask.task_kind == "reviewer_360_invite",
            PerformanceNodeTask.revoked_at.is_(None),
        ))).scalars().all())
        if len(rows) != 1:
            raise HTTPException(403, "REVIEWER_360_SOURCE_TASK_REQUIRED")
        source_task_id = rows[0].id
    task, node = await shared._self_summary_task(source_task_id, context, db, "evaluation")
    if task.task_kind not in TASK_KINDS or task.project_id != project_id:
        raise HTTPException(404, "TASK_NOT_FOUND")
    project = await db.get(PerformanceProject, project_id)
    if project is None or project.status != PROJECT_STATUS_STARTED or project.cycle_ref != task.cycle_ref:
        raise HTTPException(404, "PROJECT_NOT_FOUND")
    actor = await shared.resolve_trusted_performance_actor(db, context, cycle_ref=task.cycle_ref, require_employee_identity=True)
    if write:
        await shared._lock_task_context(db, task, node)
    snapshot = await db.get(PerformanceProjectMemberSnapshot, task.member_snapshot_id)
    if snapshot is None or snapshot.project_id != project_id or snapshot.cycle_ref != task.cycle_ref:
        raise HTTPException(404, "PROJECT_MEMBER_NOT_FOUND")
    member = await db.scalar(select(PerformanceProjectMember).where(
        PerformanceProjectMember.snapshot_id == snapshot.id,
        PerformanceProjectMember.employee_no == task.target_employee_no,
    ))
    if member is None:
        raise HTTPException(404, "PROJECT_MEMBER_NOT_FOUND")
    start, end = shared._task_window(task, node, project)
    editable, _ = shared._self_summary_state(task, start, end, False)
    editable = editable and await shared._task_edit_allowed(db, task, actor.actor_ref)
    if write and not editable:
        raise HTTPException(409, "SUBMISSION_NOT_ALLOWED")
    target = await evaluation_node(db, project, node)
    return task, node, project, actor, snapshot, target, editable


def scoped_events(events, project_id, node_id, *, single_node=False):
    result = []
    for event in events:
        state = event.after_state or event.before_state or {}
        if str(state.get("project_id")) != str(project_id):
            continue
        event_node = state.get("node_id")
        if str(event_node) == str(node_id) or (single_node and not event_node):
            result.append(event)
    return result


def roster_version(tasks, events):
    data = {
        "tasks": sorted((task.id, str(task.handler_ref), getattr(task, "answer_version", None),
                         task.status, task.submitted_at.isoformat() if task.submitted_at else None,
                         task.revoked_at.isoformat() if getattr(task, "revoked_at", None) else None) for task in tasks),
        "events": [(event.id, event.event_type, event.subject_ref, event.after_state, event.before_state) for event in events],
    }
    return sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()


def require_version(expected, actual):
    if not expected or expected != actual:
        raise HTTPException(409, "REVIEWER_360_VERSION_CONFLICT")


def schema_section(payload):
    return {"id": "reviewer-360", "name": "", "description": "", "allow_multiple": False,
            "fields": [], "elements": [{"id": "reviewer-360", "kind": "reviewer_360", "data": payload}]}


def readonly_payload(payload):
    value = deepcopy(payload)
    value.update(editable=False, can_invite=False)
    for item in value.get("items", []):
        item.update(can_revoke=False, revoke_disabled_reason=REVOKE_REASON)
    return value


async def roster(db, task, node, project, *, editable=False, snapshot=False, actor_ref=None):
    from app.performance import projects_router as shared
    from app.performance import review_360_invites_router as invites

    if snapshot and (task.answers or {}).get(SNAPSHOT_KEY) is not None:
        return readonly_payload(task.answers[SNAPSHOT_KEY])
    target = await evaluation_node(db, project, node)
    member_snapshot = await db.get(PerformanceProjectMemberSnapshot, task.member_snapshot_id)
    if member_snapshot is None or member_snapshot.project_id != project.id or member_snapshot.cycle_ref != task.cycle_ref:
        raise HTTPException(404, "PROJECT_MEMBER_NOT_FOUND")
    tasks = [item for item in await invites._invite_tasks(db, project.id, target.id, task.target_employee_no)
             if item.member_snapshot_id == task.member_snapshot_id and item.cycle_ref == task.cycle_ref]
    nodes = await invites._project_nodes(db, project.id)
    events = scoped_events(await invites._invite_audit_events(db, project, task.target_employee_no), project.id,
                           target.node_id, single_node=sum(invites._is_360_evaluation_node(item) for item in nodes) == 1)
    active = invites._active_invites_from_audit(events, project.id)
    active_tasks = {str(item.handler_ref): item for item in tasks if getattr(item, "revoked_at", None) is None}
    people = {person.employee_no: person for person in await invites._snapshot_people(db, member_snapshot.source_snapshot_id)}
    items = []
    for employee_no in sorted(set(active) | set(active_tasks)):
        event = active.get(employee_no)
        evaluation = active_tasks.get(employee_no)
        if evaluation is None:
            continue
        person = people.get(employee_no)
        state = (event.after_state or {}) if event else {}
        source = state.get("source_type") or "UNKNOWN"
        inviter = state.get("assigned_by_ref") or (event.actor_ref if event else None)
        items.append({
            "employee_no": employee_no, "display_name": person.display_name if person else employee_no,
            "department": invites.organization_leaf(person) if person else None,
            "job_family": person.job_family if person else None, "job_category": person.job_category if person else None,
            "job_sequence": invites.format_job_sequence(person.job_family, person.job_category) if person else None,
            "position_level": person.position_level if person else None,
            "status": "completed" if evaluation.submitted_at else "pending",
            "source_type": source, "source_label": shared._reviewer_360_source(evaluation, event, task.target_employee_no, people) or "来源未知",
            "relationship": shared._reviewer_360_relationship(task.target_employee_no, employee_no, people),
            "invited_at": event.event_at.isoformat() if event and event.event_at else None,
            "due_at": evaluation.due_at.isoformat() if evaluation.due_at else None,
            "can_revoke": False, "revoke_disabled_reason": REVOKE_REASON,
            "is_manual_by_actor": source not in {"DEFAULT", "UNKNOWN", "VOLUNTARY"} and str(inviter) == str(actor_ref or task.handler_ref),
        })
    configured = (((project.settings or {}).get("flow_settings") or {}).get("node_settings") or {})
    settings = (configured.get(target.node_id) or {}).get("invite") or (configured.get(node.node_id) or {}).get("invite") or {}
    exclude_default = bool(settings.get("exclude_default_invite_from_limit", False))
    return {
        "project_id": project.id, "task_id": task.id, "employee_no": task.target_employee_no,
        "node_id": target.node_id, "version": roster_version(tasks, events),
        "items": items, "total": len(items), "count": sum(item["source_type"] != "DEFAULT" or not exclude_default for item in items),
        "manual_count": sum(item["is_manual_by_actor"] for item in items),
        "can_invite": editable, "editable": editable,
        "minimum_invited_count": int(settings.get("minimum_invited_count") or 0),
        "maximum_invited_count": settings.get("maximum_invited_count"),
        "maximum_invite_mode": settings.get("maximum_invite_mode") or "SUGGESTED",
        "second_prompt_enabled": bool(settings.get("second_prompt_enabled", False)),
        "second_prompt_count": settings.get("second_prompt_count"),
        "second_prompt_mode": settings.get("second_prompt_mode") or "SUGGESTED",
        "exclude_default_invite_from_limit": exclude_default,
    }


async def save_task(db, task, node, project, actor, payload, submit):
    from app.performance import projects_router as shared
    from app.performance.authorization_service import AuditEventInput, PerformanceAuditService

    if project is None or project.status != PROJECT_STATUS_STARTED or project.cycle_ref != task.cycle_ref:
        raise HTTPException(404, "PROJECT_NOT_FOUND")
    if payload.version is None:
        raise HTTPException(409, "VERSION_REQUIRED")
    start, end = shared._task_window(task, node, project)
    editable, _ = shared._self_summary_state(task, start, end, False)
    if not editable:
        raise HTTPException(409, "SUBMISSION_NOT_ALLOWED")
    current = await roster(db, task, node, project, editable=True, actor_ref=actor.actor_ref)
    require_version(payload.reviewer_360_version, current["version"])
    template = await shared._self_summary_template(task, node, db)
    schema = shared.build_self_summary_schema(template)
    incoming = {key: value for key, value in payload.answers.items() if key != SNAPSHOT_KEY}
    answers = shared.sanitize_self_summary_answers(schema, incoming)
    if submit:
        for section, field, index, value in shared.iter_self_summary_field_instances(schema, answers):
            if shared.self_summary_field_requires_value(field, value) and shared.self_summary_value_empty(field, value):
                raise HTTPException(400, {"code": "VALIDATION_FAILED", "field_id": field["id"]})
    answers[SNAPSHOT_KEY] = readonly_payload(current)
    before_version = task.answer_version
    if submit:
        task.answers = answers
        task.draft_answers = None
        task.submitted_at = datetime.now(UTC)
        task.completed_at = task.submitted_at
        task.status = "completed"
    else:
        task.draft_answers = answers
    task.answer_version += 1
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PERFORMANCE_TASK_SUBMITTED" if submit else "PERFORMANCE_TASK_DRAFT_SAVED",
        cycle_ref=task.cycle_ref, employee_no=task.target_employee_no,
        actor_type=actor.actor_type, actor_ref=actor.actor_ref,
        subject_type="PERFORMANCE_NODE_TASK", subject_ref=str(task.id),
        before_state={"version": before_version},
        after_state={"project_id": project.id, "node_id": node.node_id, "version": task.answer_version,
                     "reviewer_360_version": current["version"]},
    ))
    await db.commit()
    editable, submit_allowed = shared._self_summary_state(task, start, end, False)
    return {"answers": shared.project_self_summary_answers(schema, task.answers or {}),
            "draft_answers": shared.project_self_summary_answers(schema, task.draft_answers or {}),
            "has_draft": task.draft_answers is not None, "version": task.answer_version,
            "submitted_at": task.submitted_at, "editable": editable, "submit_allowed": submit_allowed,
            "reviewer_360": readonly_payload(current) if submit else current,
            "answer_submissions": await submissions(db, task, node) if submit else []}


async def submissions(db, task, node):
    if task.submitted_at is None:
        return []
    events = list((await db.execute(select(PerformanceAuditEvent).where(
        PerformanceAuditEvent.cycle_ref == task.cycle_ref,
        PerformanceAuditEvent.employee_no == task.target_employee_no,
        PerformanceAuditEvent.subject_type == "PERFORMANCE_NODE_TASK",
        PerformanceAuditEvent.subject_ref == str(task.id),
        PerformanceAuditEvent.event_type == "PERFORMANCE_TASK_SUBMITTED",
    ).order_by(PerformanceAuditEvent.event_at.desc(), PerformanceAuditEvent.id.desc()))).scalars().all())
    for event in events:
        state = event.after_state or {}
        if state.get("project_id") != task.project_id or state.get("node_id") != node.node_id:
            continue
        switch = state.get("identity_switch") or {}
        actor_ref = event.actor_ref if event.actor_type == "EMPLOYEE" else switch.get("business_actor_ref") if switch.get("business_actor_type") == "EMPLOYEE" else None
        if not actor_ref:
            return []
        person = await db.scalar(select(PerformanceAuthorizationSnapshotPerson).join(
            PerformanceProjectMemberSnapshot, PerformanceProjectMemberSnapshot.source_snapshot_id == PerformanceAuthorizationSnapshotPerson.snapshot_id,
        ).where(PerformanceProjectMemberSnapshot.id == task.member_snapshot_id,
                PerformanceProjectMemberSnapshot.project_id == task.project_id,
                PerformanceAuthorizationSnapshotPerson.employee_no == str(actor_ref)))
        return [{"display_name": person.display_name, "submitted_at": task.submitted_at}] if person else []
    return []
