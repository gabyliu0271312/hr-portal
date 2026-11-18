"""Batch identity metadata for people already admitted by a list's access policy."""
from datetime import UTC, datetime

from sqlalchemy import and_, or_, select, tuple_

from app.performance.assessment_roles import ROLE_REVIEWER_360, node_role_code
from app.performance.models import (
    PerformanceAuditEvent,
    PerformanceAuthorizationSnapshot,
    PerformanceAuthorizationSnapshotPerson,
    PerformanceNodeTask,
    PerformanceNodeTaskAuthorization,
    PerformanceProject,
    PerformanceProjectMember,
    PerformanceProjectMemberSnapshot,
    PerformanceProjectNodeSnapshot,
)


def _value(row, field, default=None):
    return row.get(field, default) if isinstance(row, dict) else getattr(row, field, default)


def _set_identity(row, identity):
    if isinstance(row, dict):
        row["identity_status"] = identity
    else:
        row.identity_status = identity


def _time(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


async def hydrate_project_member_rows(db, items, *, context=None, verified_view=False):
    keys = {(_value(item, "project_id"), _value(item, "root_review_id", _value(item, "id"))) for item in items}
    keys = {(project_id, member_id) for project_id, member_id in keys if project_id is not None and member_id is not None}
    if not keys:
        return
    member = PerformanceProjectMember
    snapshot = PerformanceProjectMemberSnapshot
    rows = (await db.execute(
        select(snapshot.project_id, member.id, member.snapshot_id, member.employee_no)
        .join(snapshot, snapshot.id == member.snapshot_id)
        .where(tuple_(snapshot.project_id, member.id).in_(keys))
    )).all()
    snapshots = {(project_id, member_id, employee): snapshot_id for project_id, member_id, snapshot_id, employee in rows}
    bindings = [
        (item, _value(item, "project_id"), snapshots.get((
            _value(item, "project_id"), _value(item, "root_review_id", _value(item, "id")), _value(item, "employee_no"))))
        for item in items
    ]
    verified = {(project_id, snapshot_id, str(_value(item, "employee_no"))) for item, project_id, snapshot_id in bindings} if verified_view else None
    await hydrate_member_identities(db, bindings, context=context, verified_view_keys=verified)


async def hydrate_task_people_rows(db, items, *, context=None):
    keys = {(_value(item, "project_id"), _value(item, "task_id")) for item in items}
    if not keys:
        return
    task = PerformanceNodeTask
    rows = (await db.execute(
        select(task.project_id, task.id, task.member_snapshot_id, task.target_employee_no)
        .where(tuple_(task.project_id, task.id).in_(keys))
    )).all()
    snapshots = {(project_id, task_id, employee): snapshot_id for project_id, task_id, snapshot_id, employee in rows}
    await hydrate_member_identities(db, [
        (item, _value(item, "project_id"), snapshots.get((
            _value(item, "project_id"), _value(item, "task_id"), _value(item, "employee_no"))))
        for item in items
    ], context=context)


async def hydrate_member_identities(db, bindings, *, include_delegations=True, context=None, verified_view_keys=None):
    """Bindings are (output row, project id, member snapshot id), after filtering/paging.

    Reviewer/plain-person lists opt out of reviewee delegation history. Revoked tasks
    retain closed authorization history; stale ACTIVE records on them are not effective.
    """
    keys = set()
    by_key = {}
    for row, project_id, snapshot_id in bindings:
        identity = {"live_employment_status": _value(row, "employment_status"), "delegations": []}
        _set_identity(row, identity)
        if project_id is None or snapshot_id is None or not _value(row, "employee_no"):
            continue
        key = (project_id, snapshot_id, str(_value(row, "employee_no")))
        keys.add(key)
        by_key.setdefault(key, []).append(identity)
    if not keys:
        return

    snapshot = PerformanceProjectMemberSnapshot
    person = PerformanceAuthorizationSnapshotPerson
    project = PerformanceProject
    live_rows = (await db.execute(
        select(snapshot.project_id, snapshot.id, person.employee_no,
               person.live_employment_status, person.employment_status)
        .join(person, person.snapshot_id == snapshot.source_snapshot_id)
        .join(project, and_(project.id == snapshot.project_id, project.cycle_ref == snapshot.cycle_ref))
        .join(PerformanceAuthorizationSnapshot, and_(
            PerformanceAuthorizationSnapshot.id == snapshot.source_snapshot_id,
            PerformanceAuthorizationSnapshot.cycle_ref == snapshot.cycle_ref,
        ))
        .where(tuple_(snapshot.project_id, snapshot.id, person.employee_no).in_(keys))
    )).all()
    valid_keys = set()
    for project_id, snapshot_id, employee_no, live, frozen in live_rows:
        key = (project_id, snapshot_id, employee_no)
        if key not in by_key:
            continue
        valid_keys.add(key)
        for identity in by_key[key]:
            identity["live_employment_status"] = live or frozen or identity["live_employment_status"]
    if context is not None and valid_keys:
        from app.performance.focus_group_tag_service import hydrate_focus_group_tags
        await hydrate_focus_group_tags(db, {key: by_key[key] for key in valid_keys}, context, verified_view_keys)
    if not include_delegations or not valid_keys:
        return

    task = PerformanceNodeTask
    record = PerformanceNodeTaskAuthorization
    node = PerformanceProjectNodeSnapshot
    rows = (await db.execute(
        select(record, task, node, snapshot.source_snapshot_id)
        .join(task, and_(task.id == record.task_id, task.project_id == record.project_id,
                         task.cycle_ref == record.cycle_ref))
        .join(snapshot, and_(snapshot.id == task.member_snapshot_id,
                             snapshot.project_id == task.project_id, snapshot.cycle_ref == task.cycle_ref))
        .join(node, and_(node.id == task.node_snapshot_id, node.project_id == task.project_id))
        .where(tuple_(task.project_id, task.member_snapshot_id, task.target_employee_no).in_(valid_keys),
               record.status.in_(["ACTIVE", "REVOKED", "REPLACED"]),
               or_(task.revoked_at.is_(None), record.status != "ACTIVE"))
    )).all()
    rows = [row for row in rows if (
        node_role_code((row[2].config or {}).get("template") or {}) != ROLE_REVIEWER_360
        and ((row[2].config or {}).get("template") or {}).get("executor_label") != "360°评估人"
    )]
    if not rows:
        return

    task_keys = {(item.project_id, item.cycle_ref, str(item.id), item.target_employee_no) for _, item, _, _ in rows}
    audit = PerformanceAuditEvent
    events = (await db.execute(
        select(audit).where(
            audit.subject_type == "PERFORMANCE_NODE_TASK",
            tuple_(audit.cycle_ref, audit.subject_ref, audit.employee_no).in_(
                {(cycle, task_id, employee) for _, cycle, task_id, employee in task_keys}),
            audit.event_type.in_(["PERFORMANCE_TASK_AUTHORIZED", "PERFORMANCE_TASK_TRANSFERRED",
                                  "PERFORMANCE_TASK_AUTHORIZATION_REVOKED"]),
        ).order_by(audit.event_at, audit.id)
    )).scalars().all()
    by_task = {}
    for event in events:
        state = event.after_state or {}
        key = (state.get("project_id"), event.cycle_ref, str(event.subject_ref), event.employee_no)
        if key in task_keys:
            by_task.setdefault(key, []).append(event)

    name_keys = set()
    for authorization, item, _, source_id in rows:
        name_keys.update((source_id, no) for no in (
            authorization.grantor_employee_no, authorization.recipient_employee_no,
            authorization.revoked_by_employee_no, item.handler_ref,
        ) if no)
        for event in by_task.get((item.project_id, item.cycle_ref, str(item.id), item.target_employee_no), []):
            if event.actor_ref:
                name_keys.add((source_id, event.actor_ref))
    names = {(source_id, employee_no): name for source_id, employee_no, name in (await db.execute(
        select(person.snapshot_id, person.employee_no, person.display_name)
        .where(tuple_(person.snapshot_id, person.employee_no).in_(name_keys))
    )).all()} if name_keys else {}

    records_by_task = {}
    for authorization, item, _, _ in rows:
        records_by_task.setdefault(item.id, {})[str(authorization.id)] = authorization
    for authorization, item, stage, source_id in rows:
        key = (item.project_id, item.member_snapshot_id, item.target_employee_no)
        task_events = by_task.get((item.project_id, item.cycle_ref, str(item.id), item.target_employee_no), [])
        created_event = next((event for event in task_events
                              if str((event.after_state or {}).get("authorization_id")) == str(authorization.id)
                              and event.event_type != "PERFORMANCE_TASK_AUTHORIZATION_REVOKED"), None)
        operated_at = authorization.revoked_at or authorization.created_at
        revoked_by = authorization.revoked_by_employee_no
        if authorization.status != "ACTIVE":
            ancestors = {str(authorization.id)}
            parent = (authorization.authorization_settings or {}).get("parent_authorization_id")
            while parent is not None and str(parent) not in ancestors:
                ancestors.add(str(parent))
                parent_record = records_by_task[item.id].get(str(parent))
                parent = (parent_record.authorization_settings or {}).get("parent_authorization_id") if parent_record else None
            for event in task_events:
                if _time(event.event_at) < _time(authorization.created_at):
                    continue
                event_id = str((event.after_state or {}).get("authorization_id"))
                revoked = event.event_type == "PERFORMANCE_TASK_AUTHORIZATION_REVOKED" and event_id in ancestors
                replaced = (authorization.status == "REPLACED" and event.event_type == "PERFORMANCE_TASK_TRANSFERRED"
                            and event_id != str(authorization.id))
                if revoked or replaced:
                    operated_at = event.event_at
                    if revoked and authorization.status == "REVOKED":
                        revoked_by = revoked_by or event.actor_ref
                    break
        created_state = (created_event.after_state or {}) if created_event else {}
        name = lambda no: names.get((source_id, no)) or str(no or "")
        entry = {
            "id": authorization.id,
            "authorization_type": authorization.authorization_type,
            "status": authorization.status,
            "operator_name": created_state.get("initiator_name") or name(authorization.grantor_employee_no),
            "recipient_name": created_state.get("recipient_name") or name(authorization.recipient_employee_no),
            "original_handler_name": name(item.handler_ref),
            "stage_name": stage.name,
            "created_at": _time(authorization.created_at).isoformat(),
            "operated_at": _time(operated_at).isoformat(),
            "revoked_by_name": name(revoked_by) if revoked_by else None,
        }
        for identity in by_key[key]:
            identity["delegations"].append(entry)
    for identities in by_key.values():
        for identity in identities:
            identity["delegations"].sort(key=lambda entry: (datetime.fromisoformat(entry["operated_at"]), entry["id"]), reverse=True)
