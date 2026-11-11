"""Explicit calibration completion over the actor's entire writable phase scope."""
import hashlib
import json
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select

from app.performance.models import PerformanceNodeTask, PerformanceProject, PerformanceProjectNodeSnapshot, PROJECT_STATUS_STARTED
from app.performance.task_authorization_service import task_handler_condition
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService


def completion_digest(project, node, tasks, actor, versions):
    value = {"project": project.id, "settings": project.settings, "node": node.id,
             "config": node.config, "actor": [actor.actor_type, str(actor.actor_ref)],
             "tasks": [[task.id, task.phase_id, task.member_snapshot_id, task.target_employee_no,
                         task.status, str(task.calibration_completed_at or ""),
                         str(task.available_at or ""), str(task.due_at or "")]
                        for task in sorted(tasks, key=lambda item: item.id)], "results": versions}
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str, ensure_ascii=False).encode()).hexdigest()


async def completion_scope(db, project_id, node_id, phase_id, context, *, lock=False):
    from app.performance import projects_router as routes
    statement = select(PerformanceProject).where(PerformanceProject.id == project_id)
    if lock:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    project = await db.scalar(statement)
    if project is None or project.status != PROJECT_STATUS_STARTED:
        raise HTTPException(404, "PROJECT_NOT_FOUND")
    actor = await routes.resolve_trusted_performance_actor(db, context, cycle_ref=project.cycle_ref, require_employee_identity=True)
    node = await db.scalar(select(PerformanceProjectNodeSnapshot).where(
        PerformanceProjectNodeSnapshot.project_id == project.id,
        PerformanceProjectNodeSnapshot.node_id == node_id, PerformanceProjectNodeSnapshot.node_type == "calibration",
    ).execution_options(populate_existing=True))
    if node is None:
        raise HTTPException(404, "TASK_NOT_FOUND")
    tasks = list((await db.execute(select(PerformanceNodeTask).where(
        PerformanceNodeTask.project_id == project.id, PerformanceNodeTask.cycle_ref == project.cycle_ref,
        PerformanceNodeTask.node_snapshot_id == node.id, PerformanceNodeTask.task_kind == "calibration",
        PerformanceNodeTask.revoked_at.is_(None), task_handler_condition(str(actor.actor_ref)),
    ).order_by(PerformanceNodeTask.id).execution_options(populate_existing=True))).scalars().all())
    writable = []
    for task in tasks:
        if not routes.calibration_task_scope(task, node) or not await routes._task_edit_allowed(db, task, str(actor.actor_ref)):
            continue
        try:
            await routes._self_summary_task(task.id, context, db, "evaluation")
        except HTTPException as error:
            if error.status_code in {403, 404}:
                continue
            raise
        writable.append(task)
    phases = {task.phase_id for task in writable}
    if phase_id is None:
        if len(phases) != 1:
            raise HTTPException(409, "CALIBRATION_PHASE_REQUIRED")
        phase_id = next(iter(phases))
    writable = [task for task in writable if task.phase_id == phase_id]
    if not writable:
        raise HTTPException(404, "TASK_NOT_FOUND")
    now = datetime.now(UTC)
    in_window = all((start is None or start <= now) and (end is None or now <= end)
                    for start, end in [routes._task_window(task, node, project) for task in writable])
    missing = 0
    versions = []
    seen_members = set()
    schema = routes.build_self_summary_schema(await routes._self_summary_template(writable[0], node, db))
    for task in writable:
        key = (task.member_snapshot_id, task.target_employee_no)
        if key in seen_members:
            continue
        seen_members.add(key)
        result = await routes._effective_member_result(project.id, project.cycle_ref, task.member_snapshot_id, task.target_employee_no, db)
        state = result.get("shared_state") or {}
        versions.append([task.member_snapshot_id, task.target_employee_no, state.get("revision", 0), result["answers"]])
        missing += not routes._result_ready([type("Result", (), {"status": "completed", "submitted_at": now, "answers": result["answers"]})()], schema)
    completed = all(task.calibration_completed_at is not None for task in writable)
    response = {"scope_version": completion_digest(project, node, writable, actor, versions),
                "total_count": len(writable), "completed_count": sum(task.calibration_completed_at is not None for task in writable),
                "missing_result_count": missing, "can_complete": in_window, "completed": completed}
    return project, node, actor, writable, response


async def preview_completion(db, project_id, payload, context):
    *_, response = await completion_scope(db, project_id, payload.node_id, payload.phase_id, context)
    return response


async def confirm_completion(db, project_id, payload, context):
    from app.performance.projects_router import _sync_automatic_openings
    project, node, actor, tasks, response = await completion_scope(db, project_id, payload.node_id, payload.phase_id, context, lock=True)
    if response["completed"]:
        return response
    if response["scope_version"] != payload.scope_version:
        raise HTTPException(409, "CALIBRATION_SCOPE_CHANGED")
    if not response["can_complete"]:
        raise HTTPException(409, "SUBMISSION_NOT_ALLOWED")
    now = datetime.now(UTC)
    for task in tasks:
        if task.calibration_completed_at is not None:
            continue
        task.calibration_completed_at = now
        task.calibration_completed_by = str(actor.actor_ref)
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="CALIBRATION_COMPLETED", cycle_ref=project.cycle_ref, actor_type=actor.actor_type,
        actor_ref=actor.actor_ref, subject_type="PERFORMANCE_PROJECT", subject_ref=str(project.id),
        after_state={"node_id": node.node_id, "phase_id": payload.phase_id, "task_ids": [task.id for task in tasks],
                     "scope_version": response["scope_version"], "missing_result_count": response["missing_result_count"]},
    ))
    await _sync_automatic_openings(db, project)
    await db.commit()
    *_, response = await completion_scope(db, project_id, payload.node_id, payload.phase_id, context)
    return response
