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
    PerformanceProjectNodeSnapshot, PerformanceCycle, PROJECT_STATUS_STARTED,
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


def draft_delta(task):
    value = (task.draft_answers or {}).get(SNAPSHOT_KEY) or {}
    return {"add": deepcopy(value.get("add") or {}), "remove": list(value.get("remove") or [])}


def set_draft_delta(task, delta):
    task.draft_answers = {**(task.draft_answers or {}), SNAPSHOT_KEY: deepcopy(delta)}


async def previous_ready(db, task, node):
    from app.performance import review_360_invites_router as invites

    if not ((node.config or {}).get("template") or {}).get("require_previous_node_completion"):
        return True
    nodes = await invites._project_nodes(db, task.project_id)
    ordered = sorted(nodes, key=lambda item: (item.node_order, item.id))
    index = next((index for index, item in enumerate(ordered) if item.id == node.id), 0)
    if not index or ordered[index - 1].node_type in {"project_start", "project_end"}:
        return True
    previous = ordered[index - 1]
    tasks = list((await db.execute(select(PerformanceNodeTask).where(
        PerformanceNodeTask.project_id == task.project_id,
        PerformanceNodeTask.cycle_ref == task.cycle_ref,
        PerformanceNodeTask.member_snapshot_id == task.member_snapshot_id,
        PerformanceNodeTask.target_employee_no == task.target_employee_no,
        PerformanceNodeTask.node_snapshot_id == previous.id,
        PerformanceNodeTask.revoked_at.is_(None),
    ))).scalars().all())
    return bool(tasks) and all(item.calibration_completed_at is not None if previous.node_type == "calibration"
                               else item.submitted_at is not None and item.status == "completed" for item in tasks)


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
    if write:
        await shared._lock_task_context(db, task, node)
    project = await db.get(PerformanceProject, project_id)
    if project is None or project.status != PROJECT_STATUS_STARTED or project.cycle_ref != task.cycle_ref:
        raise HTTPException(404, "PROJECT_NOT_FOUND")
    actor = await shared.resolve_trusted_performance_actor(db, context, cycle_ref=task.cycle_ref, require_employee_identity=True)
    snapshot = await db.get(PerformanceProjectMemberSnapshot, task.member_snapshot_id)
    if snapshot is None or snapshot.project_id != project_id or snapshot.cycle_ref != task.cycle_ref:
        raise HTTPException(404, "PROJECT_MEMBER_NOT_FOUND")
    member = await db.scalar(select(PerformanceProjectMember).where(
        PerformanceProjectMember.snapshot_id == snapshot.id,
        PerformanceProjectMember.employee_no == task.target_employee_no,
    ))
    if member is None:
        raise HTTPException(404, "PROJECT_MEMBER_NOT_FOUND")
    overdue_allowed = await shared._task_overdue_submission_allowed(task, node, db)
    editable, _ = shared._self_summary_state(task, *shared._task_window(task, node, project), overdue_allowed)
    editable = editable and await shared._task_edit_allowed(db, task, actor.actor_ref)
    editable = editable and await previous_ready(db, task, node) and not await shared._final_result_locked(task, node, db)
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


def roster_version(tasks, events, delta=None):
    data = {
        "tasks": sorted((task.id, str(task.handler_ref), getattr(task, "answer_version", None),
                         task.status, task.submitted_at.isoformat() if task.submitted_at else None,
                         task.revoked_at.isoformat() if getattr(task, "revoked_at", None) else None) for task in tasks),
        "events": [(event.id, event.event_type, event.subject_ref, event.after_state, event.before_state) for event in events],
        "draft": delta or {"add": {}, "remove": []},
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
        item.update(can_revoke=False, revoke_disabled_reason="当前名单为只读")
    return value


def invite_settings(project, node, target):
    configured = (((project.settings or {}).get("flow_settings") or {}).get("node_settings") or {})
    return (configured.get(target.node_id) or {}).get("invite") or (configured.get(node.node_id) or {}).get("invite") or {}


def effective_limit(settings, task):
    if task.task_kind == "reviewer_360_confirm":
        return None
    limits = []
    if settings.get("maximum_invite_mode") == "LIMIT" and settings.get("maximum_invited_count") is not None:
        limits.append(int(settings["maximum_invited_count"]))
    if settings.get("second_prompt_enabled") and settings.get("second_prompt_mode") == "LIMIT" and settings.get("second_prompt_count") is not None:
        limits.append(int(settings["second_prompt_count"]))
    return min(limits) if limits else None


async def candidate_people(db, task, target, snapshot):
    from app.performance import review_360_invites_router as invites
    from app.performance.assessment_roles import ROLE_BY_CODE, ROLE_BY_LABEL, node_role_code

    nodes = await invites._project_nodes(db, task.project_id)
    others = {node.id: node for node in nodes if node.node_type == "evaluation" and node.id != target.id}
    roles_by_person = {}
    if others:
        rows = list((await db.execute(select(PerformanceNodeTask).where(
            PerformanceNodeTask.project_id == task.project_id,
            PerformanceNodeTask.cycle_ref == task.cycle_ref,
            PerformanceNodeTask.member_snapshot_id == task.member_snapshot_id,
            PerformanceNodeTask.target_employee_no == task.target_employee_no,
            PerformanceNodeTask.node_snapshot_id.in_(others),
            PerformanceNodeTask.task_kind == "evaluation",
            PerformanceNodeTask.revoked_at.is_(None),
        ))).scalars().all())
        for row in rows:
            if row.node_snapshot_id not in others or row.revoked_at is not None:
                continue
            code = node_role_code((others[row.node_snapshot_id].config or {}).get("template") or {})
            roles_by_person.setdefault(str(row.handler_ref), set()).add(code)
    template = (target.config or {}).get("template") or {}
    selected = {value if value in ROLE_BY_CODE else ROLE_BY_LABEL[value][0]
                for value in template.get("invite_executor_types") or [] if value in ROLE_BY_CODE or value in ROLE_BY_LABEL}
    allow = template.get("allow_invite_other_executors", False)
    partial = template.get("invite_executor_scope") == "PARTIAL"
    return [person for person in await invites._snapshot_people(db, snapshot.source_snapshot_id)
            if person.employee_no != task.target_employee_no and invites._employment_status(person) != "离职"
            and (not roles_by_person.get(person.employee_no)
                 or allow and (not partial or roles_by_person[person.employee_no] <= selected))]


def default_people(settings, people, target_ref):
    from app.performance import review_360_invites_router as invites

    if settings.get("default_invite", "DIRECT_SUBORDINATES") != "DIRECT_SUBORDINATES":
        return []
    return [person.employee_no for person in people.values()
            if person.employee_no != target_ref and person.direct_supervisor_employee_no == target_ref
            and invites._employment_status(person) != "离职"]


def source_code(source, inviter, target_ref, people):
    if source == "DEFAULT":
        return "DEFAULT"
    if str(inviter or "") == str(target_ref):
        return "SELF"
    seen = {str(target_ref)}
    person = people.get(str(target_ref))
    while person is not None:
        manager = str(person.direct_supervisor_employee_no or "")
        if not manager or manager in seen:
            break
        if manager == str(inviter or ""):
            return "MANAGER"
        seen.add(manager)
        person = people.get(manager)
    return "OTHER"


def can_revoke_own_invite(task, node, actor_ref, event):
    if event is None or task.task_kind != "reviewer_360_invite" or node.node_type != "reviewer_360_invite":
        return False
    state = event.after_state or {}
    inviter = state.get("assigned_by_ref") or event.actor_ref
    return (str(task.target_employee_no) == str(actor_ref) == str(inviter)
            and state.get("source_type") not in {"DEFAULT", "VOLUNTARY"})


async def can_revoke_effective(db, task, node, actor_ref, editable):
    from app.performance.assessment_roles import MANAGER_ROLE_CODES, node_role_code

    if not editable or task.task_kind != "reviewer_360_confirm" or node.node_type != "reviewer_360_confirm" or str(task.handler_ref) != str(actor_ref):
        return False
    from app.performance import projects_router as shared
    project = await db.get(PerformanceProject, task.project_id)
    start, end = shared._task_window(task, node, project)
    now = datetime.now(UTC)
    if start is not None and now < start or end is not None and now > end:
        return False
    if node_role_code((node.config or {}).get("template") or {}) not in MANAGER_ROLE_CODES:
        return False
    snapshot = await db.get(PerformanceProjectMemberSnapshot, task.member_snapshot_id)
    if snapshot is None:
        return False
    from app.performance import review_360_invites_router as invites
    people = {person.employee_no: person for person in await invites._snapshot_people(db, snapshot.source_snapshot_id)}
    if source_code("MANUAL", actor_ref, task.target_employee_no, people) != "MANAGER":
        return False
    cycle = await db.scalar(select(PerformanceCycle).where(PerformanceCycle.cycle_ref == task.cycle_ref))
    return bool(getattr(cycle, "allow_delete_360", False))


async def roster(db, task, node, project, *, editable=False, snapshot=False, actor_ref=None):
    from app.performance import projects_router as shared
    from app.performance import review_360_invites_router as invites

    if snapshot and (task.answers or {}).get(SNAPSHOT_KEY) is not None:
        payload = {**readonly_payload(task.answers[SNAPSHOT_KEY]), "task_kind": task.task_kind}
        if task.task_kind == "reviewer_360_confirm":
            payload["effective_limit"] = None
        return payload
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
    active_tasks = {str(item.handler_ref): item for item in tasks if item.revoked_at is None
                    and (item.source_type != "VOLUNTARY" or str(item.handler_ref) in active)}
    people = {person.employee_no: person for person in await invites._snapshot_people(db, member_snapshot.source_snapshot_id)}
    settings = invite_settings(project, node, target)
    delta = draft_delta(task)
    overdue_allowed = await shared._task_overdue_submission_allowed(task, node, db)
    editable = editable and shared._self_summary_state(task, *shared._task_window(task, node, project), overdue_allowed)[0]
    editable = editable and await shared._task_edit_allowed(db, task, actor_ref or task.handler_ref)
    editable = editable and await previous_ready(db, task, node) and not await shared._final_result_locked(task, node, db)
    revoke_effective = await can_revoke_effective(db, task, node, actor_ref or task.handler_ref, editable)
    entries = {}
    for employee_no, evaluation in active_tasks.items():
        event = active.get(employee_no)
        state = (event.after_state or {}) if event else {}
        if state.get("source_type") == "VOLUNTARY":
            continue
        entries[employee_no] = (evaluation, event, state, False)
    seen = {str(event.subject_ref) for event in events}
    defaults = default_people(settings, people, task.target_employee_no) if (project.settings or {}).get("reviewer_360_default_on_submit") else []
    for employee_no in defaults:
        if employee_no not in seen and employee_no not in entries:
            entries[employee_no] = (None, None, {"source_type": "DEFAULT"}, True)
    for employee_no, state in delta["add"].items():
        if employee_no not in entries:
            entries[employee_no] = (None, None, state, True)
    for employee_no in delta["remove"]:
        entries.pop(employee_no, None)
    items = []
    for employee_no, (evaluation, event, state, is_draft) in sorted(entries.items()):
        person = people.get(employee_no)
        source = state.get("source_type") or (evaluation.source_type if evaluation else None) or "UNKNOWN"
        inviter = state.get("assigned_by_ref") or (event.actor_ref if event else None)
        source = source_code(source, inviter, task.target_employee_no, people)
        own_draft = is_draft and str(inviter) == str(actor_ref or task.handler_ref) and source not in {"DEFAULT", "UNKNOWN", "VOLUNTARY"}
        submitted = evaluation is not None and evaluation.submitted_at is not None
        effective_allowed = (not is_draft and evaluation.source_type not in {"DEFAULT", "VOLUNTARY"}
                             and (revoke_effective or can_revoke_own_invite(task, node, actor_ref or task.handler_ref, event)))
        can_revoke = editable and source != "DEFAULT" and not submitted and (own_draft or effective_allowed)
        reason = None if can_revoke else ("系统默认邀请不可删除" if source == "DEFAULT" else "评价已提交，不可撤销" if submitted else REVOKE_REASON)
        items.append({
            "employee_no": employee_no, "display_name": person.display_name if person else employee_no,
            "department": invites.organization_leaf(person) if person else None,
            "job_family": person.job_family if person else None, "job_category": person.job_category if person else None,
            "job_sequence": invites.format_job_sequence(person.job_family, person.job_category) if person else None,
            "position_level": person.position_level if person else None,
            "status": "completed" if submitted else "pending", "is_draft": is_draft, "inviter_ref": str(inviter) if inviter else None,
            "source_type": source,
            "source_label": {"DEFAULT": "系统默认邀请", "SELF": "自己邀请", "MANAGER": "上级邀请", "OTHER": "HRBP或其他人邀请"}[source],
            "relationship": shared._reviewer_360_relationship(task.target_employee_no, employee_no, people),
            "invited_at": event.event_at.isoformat() if event and event.event_at else state.get("invited_at"),
            "due_at": evaluation.due_at.isoformat() if evaluation and evaluation.due_at else None,
            "can_revoke": can_revoke, "revoke_disabled_reason": reason,
            "is_manual_by_actor": source not in {"DEFAULT", "UNKNOWN", "VOLUNTARY"} and str(inviter) == str(actor_ref or task.handler_ref),
        })
    exclude_default = bool(settings.get("exclude_default_invite_from_limit", False))
    count = sum(item["source_type"] != "DEFAULT" or not exclude_default for item in items)
    limit = effective_limit(settings, task)
    disabled = "当前环节不可编辑" if not editable else "已达到邀请人数上限" if limit is not None and count >= limit else None
    return {
        "project_id": project.id, "task_id": task.id, "task_kind": task.task_kind, "employee_no": task.target_employee_no,
        "node_id": target.node_id, "version": roster_version(tasks, events, delta),
        "items": items, "total": len(items), "count": count,
        "manual_count": sum(item["is_manual_by_actor"] for item in items),
        "can_invite": editable and disabled is None, "editable": editable,
        "effective_limit": limit, "invite_disabled_reason": disabled,
        "minimum_invited_count": int(settings.get("minimum_invited_count") or 0),
        "maximum_invited_count": settings.get("maximum_invited_count"),
        "maximum_invite_mode": settings.get("maximum_invite_mode") or "SUGGESTED",
        "second_prompt_enabled": bool(settings.get("second_prompt_enabled", False)),
        "second_prompt_count": settings.get("second_prompt_count"),
        "second_prompt_mode": settings.get("second_prompt_mode") or "SUGGESTED",
        "exclude_default_invite_from_limit": exclude_default,
    }


async def apply_delta(db, task, node, project, actor, current):
    from app.performance import projects_router as shared, review_360_invites_router as invites
    from app.performance.authorization_service import AuditEventInput, PerformanceAuditService

    target = await evaluation_node(db, project, node)
    snapshot = await db.get(PerformanceProjectMemberSnapshot, task.member_snapshot_id)
    allowed = {person.employee_no for person in await candidate_people(db, task, target, snapshot)}
    delta = draft_delta(task)
    if set(delta["add"]) - allowed:
        raise HTTPException(422, "REVIEWER_360_CANDIDATE_NOT_ALLOWED")
    limit = effective_limit(invite_settings(project, node, target), task)
    if limit is not None and current["count"] > limit and delta["add"]:
        raise HTTPException(422, "INVITE_LIMIT_REACHED")
    tasks = [item for item in await invites._invite_tasks(db, project.id, target.id, task.target_employee_no)
             if item.member_snapshot_id == task.member_snapshot_id and item.cycle_ref == task.cycle_ref and item.revoked_at is None]
    existing = {str(item.handler_ref): item for item in tasks}
    revocations = []
    can_revoke = await can_revoke_effective(db, task, node, actor.actor_ref, True)
    events = scoped_events(await invites._invite_audit_events(db, project, task.target_employee_no), project.id, target.node_id,
                           single_node=sum(invites._is_360_evaluation_node(item) for item in await invites._project_nodes(db, project.id)) == 1)
    active = invites._active_invites_from_audit(events, project.id)
    for employee_no in delta["remove"]:
        evaluation = existing.get(employee_no)
        if evaluation is None:
            continue
        event = active.get(employee_no)
        state = (event.after_state or {}) if event else {}
        own_invite = can_revoke_own_invite(task, node, actor.actor_ref, event)
        if not (can_revoke or own_invite) or state.get("source_type") == "DEFAULT" or evaluation.source_type in {"DEFAULT", "VOLUNTARY"}:
            raise HTTPException(403, "REVIEWER_360_REVOKE_NOT_ENABLED")
        if evaluation.submitted_at is not None:
            raise HTTPException(409, "INVITE_ALREADY_COMPLETED")
        revocations.append((employee_no, evaluation))
    available_at, due_at = shared._task_window(PerformanceNodeTask(task_kind="evaluation"), target, project)
    now = datetime.now(UTC)
    effective_start = max(available_at, now) if available_at else now
    if due_at is not None and effective_start > due_at and any(item["is_draft"] and item["employee_no"] not in existing for item in current["items"]):
        raise HTTPException(409, "REVIEWER_360_EVALUATION_WINDOW_CLOSED")
    for employee_no, evaluation in revocations:
        if ((active.get(employee_no).after_state or {}) if active.get(employee_no) else {}).get("was_voluntary"):
            evaluation.source_type = "VOLUNTARY"
        else:
            evaluation.revoked_at = now
        PerformanceAuditService(db).append_event(AuditEventInput(
            event_type="REVIEWER_360_REVOKED", cycle_ref=task.cycle_ref, employee_no=task.target_employee_no,
            actor_type=actor.actor_type, actor_ref=actor.actor_ref, subject_type="REVIEWER_360", subject_ref=employee_no,
            after_state={"project_id": project.id, "node_id": target.node_id, "source_task_id": task.id, "task_id": evaluation.id},
        ))
    for item in current["items"]:
        employee_no = item["employee_no"]
        if not item["is_draft"]:
            continue
        source = item["source_type"]
        was_voluntary = employee_no in existing and existing[employee_no].source_type == "VOLUNTARY"
        if employee_no in existing:
            if existing[employee_no].source_type != "VOLUNTARY":
                continue
            existing[employee_no].source_type = "DEFAULT" if source == "DEFAULT" else "INVITE"
        else:
            db.add(PerformanceNodeTask(project_id=project.id, cycle_ref=task.cycle_ref, member_snapshot_id=task.member_snapshot_id,
                node_snapshot_id=target.id, target_employee_no=task.target_employee_no, handler_ref=employee_no,
                task_kind="evaluation", phase_id="", available_at=effective_start,
                due_at=due_at, status="pending", source_type="DEFAULT" if source == "DEFAULT" else "INVITE"))
        PerformanceAuditService(db).append_event(AuditEventInput(
            event_type="REVIEWER_360_INVITED", cycle_ref=task.cycle_ref, employee_no=task.target_employee_no,
            actor_type="SYSTEM" if source == "DEFAULT" else actor.actor_type,
            actor_ref="0" if source == "DEFAULT" else actor.actor_ref, subject_type="REVIEWER_360", subject_ref=employee_no,
            after_state={"project_id": project.id, "node_id": target.node_id, "source_type": source,
                         "assigned_by_type": None if source == "DEFAULT" else actor.actor_type,
                         "assigned_by_ref": item["inviter_ref"], "source_task_id": task.id,
                         "was_voluntary": was_voluntary},
        ))
    task.draft_answers = {key: value for key, value in (task.draft_answers or {}).items() if key != SNAPSHOT_KEY} or None
    await db.flush()


async def save_task(db, task, node, project, actor, payload, submit):
    from app.performance import projects_router as shared
    from app.performance.authorization_service import AuditEventInput, PerformanceAuditService

    if project is None or project.status != PROJECT_STATUS_STARTED or project.cycle_ref != task.cycle_ref:
        raise HTTPException(404, "PROJECT_NOT_FOUND")
    if payload.version is None:
        raise HTTPException(409, "VERSION_REQUIRED")
    start, end = shared._task_window(task, node, project)
    overdue_allowed = await shared._task_overdue_submission_allowed(task, node, db)
    editable, _ = shared._self_summary_state(task, start, end, overdue_allowed)
    if (not editable or not await shared._task_edit_allowed(db, task, actor.actor_ref)
            or not await previous_ready(db, task, node) or await shared._final_result_locked(task, node, db)):
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
        await apply_delta(db, task, node, project, actor, current)
        current = await roster(db, task, node, project, editable=True, actor_ref=actor.actor_ref)
        answers[SNAPSHOT_KEY] = readonly_payload(current)
    before_version = task.answer_version
    if submit:
        task.answers = answers
        task.draft_answers = None
        task.submitted_at = datetime.now(UTC)
        task.completed_at = task.submitted_at
        task.status = "completed"
    else:
        saved_delta = draft_delta(task)
        task.draft_answers = {**answers, SNAPSHOT_KEY: saved_delta}
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
    editable, submit_allowed = shared._self_summary_state(task, start, end, await shared._task_overdue_submission_allowed(task, node, db))
    editable = (editable and await shared._task_edit_allowed(db, task, actor.actor_ref)
                and await previous_ready(db, task, node) and not await shared._final_result_locked(task, node, db))
    submit_allowed = submit_allowed and editable
    current = await roster(db, task, node, project, editable=editable, actor_ref=actor.actor_ref)
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
