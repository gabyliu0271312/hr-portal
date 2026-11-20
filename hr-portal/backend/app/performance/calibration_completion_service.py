"""Explicit calibration completion over the actor's writable authorization scopes."""
import hashlib
import json
from datetime import UTC, datetime
from math import ceil, floor

from fastapi import HTTPException
from sqlalchemy import select

from app.performance.models import PerformanceNodeTask, PerformanceNodeTaskAuthorization, PerformanceProject, PerformanceProjectNodeSnapshot, PROJECT_STATUS_STARTED
from app.performance.task_authorization_service import task_handler_condition
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.calibration_service import distribution_summary


def member_key(task):
    return task.member_snapshot_id, task.target_employee_no


async def authorization_groups(db, project, node, tasks, actor_ref):
    from app.performance import projects_router as routes
    by_id = {task.id: task for task in tasks}
    records = list((await db.execute(select(PerformanceNodeTaskAuthorization).where(
        PerformanceNodeTaskAuthorization.project_id == project.id,
        PerformanceNodeTaskAuthorization.cycle_ref == project.cycle_ref,
        PerformanceNodeTaskAuthorization.task_id.in_(by_id),
        PerformanceNodeTaskAuthorization.status == "ACTIVE",
    ).execution_options(populate_existing=True))).scalars().all()) if tasks else []
    records = [record for record in records if record.task_id in by_id and record.project_id == project.id and record.cycle_ref == project.cycle_ref and record.status == "ACTIVE"]
    owned = [task for task in tasks if str(task.handler_ref) == actor_ref and not any(record.task_id == task.id and record.authorization_type == "TRANSFER" for record in records)]
    groups = [{"tasks": values, "authorizations": [], "source_rule_ids": [rule_id] if rule_id is not None else None, "mode": "INHERIT"}
              for (_phase, _handler, rule_id), values in routes._calibration_rule_task_groups(node, owned, None).items()]
    partitions = {}
    for record in records:
        task = by_id[record.task_id]
        partitions.setdefault((task.phase_id, task.handler_ref), []).append(record)
    for partition in partitions.values():
        _active, delegated = routes._calibration_delegation_groups(partition)
        for group in delegated:
            if group[0].recipient_employee_no != actor_ref or group[0].read_only:
                continue
            settings = group[0].authorization_settings or {}
            source = settings.get("source_rule_id")
            group_tasks = list({record.task_id: by_id[record.task_id] for record in group}.values())
            if source is None:
                phase = next((phase for phase in (node.config or {}).get("calibration", {}).get("phases", []) if phase.get("phase_id") == group_tasks[0].phase_id), {})
                sources = [rule["rule_id"] for rule in routes._calibration_source_rules(phase, group_tasks)] or None
            else:
                sources = [source]
            groups.append({"tasks": group_tasks, "authorizations": group, "source_rule_ids": sources, "mode": settings.get("distribution_mode", "INHERIT")})
    return groups, records


def distribution_tips(project, node, groups, ratings, metadata, assessment_names=None):
    names = assessment_names or {}
    flow = (project.settings or {}).get("flow_settings") or {}
    rules, lines = [], []
    members = {member_key(task) for group in groups for task in group["tasks"]}
    enabled = False
    operators = {"EQ": lambda a, b: a == b, "LT": lambda a, b: a < b, "LTE": lambda a, b: a <= b, "GT": lambda a, b: a > b, "GTE": lambda a, b: a >= b}
    rounding = {"ROUND": round, "CEIL": ceil, "FLOOR": floor, "NONE": round}
    for group in groups:
        if group["mode"] == "NONE":
            continue
        summary = distribution_summary(flow, node, group["tasks"][0].phase_id, names, source_rule_ids=group["source_rule_ids"])
        if not summary["force_distribution_enabled"]:
            continue
        enabled = True
        scoped = {member_key(task) for task in group["tasks"]}
        for rule in summary["rules"]:
            if not operators.get(rule.get("min_people_operator", "GTE"), operators["GTE"])(len(scoped), rule.get("min_people_count", 0)):
                continue
            item = next((item for item in metadata if item["answer_key"] == rule.get("assessment_item_id")), None)
            conditions = []
            for condition in rule.get("conditions") or []:
                grades = condition.get("grade_codes") or []
                current = sum(bool(item and (ratings.get(key, {}).get(item["key"]) or {}).get("label") in grades) for key in scoped)
                value = int(condition.get("value", 0) or 0)
                unit = condition.get("unit", "PERCENT")
                target = rounding.get(rule.get("rounding_method", "ROUND"), round)(value / 100 * len(scoped)) if unit == "PERCENT" else value
                satisfied = operators.get(condition.get("operator"), lambda a, b: False)(current, target)
                conditions.append({"control_mode": condition.get("control_mode"), "grades": grades,
                                   "operator": condition.get("operator"), "value": value, "unit": unit,
                                   "rounding": rule.get("rounding_method", "ROUND"), "target_people": target,
                                   "current_people": current, "diff": current - target, "violated": not satisfied or item is None})
            rules.append({"assessment_item_id": rule.get("assessment_item_id"),
                          "assessment_label": names.get(rule.get("assessment_item_id")) or (item["label"] if item else rule.get("assessment_item_id", "")),
                          "conditions": conditions})
        lines.extend(line for line in summary["lines"] if line not in lines)
    return {"enabled": enabled, "total_people": len(members),
            "rated_people": sum(any(value is not None for value in ratings.get(key, {}).values()) for key in members),
            "rules": rules, "lines": lines}


def completion_digest(project, node, tasks, actor, versions, records=()):
    value = {"project": project.id, "settings": project.settings, "node": node.id,
             "config": node.config, "actor": [actor.actor_type, str(actor.actor_ref)],
             "tasks": [[task.id, task.phase_id, task.member_snapshot_id, task.target_employee_no,
                         task.status, str(task.calibration_completed_at or ""),
                         str(task.available_at or ""), str(task.due_at or "")]
                        for task in sorted(tasks, key=lambda item: item.id)], "results": versions,
             "authorizations": [[record.id, record.task_id, record.recipient_employee_no, record.status, record.read_only, record.authorization_settings]
                                for record in sorted(records, key=lambda item: item.id)]}
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str, ensure_ascii=False).encode()).hexdigest()


def is_completed(task, authorization):
    return bool((authorization.authorization_settings or {}).get("calibration_completed_at")) if authorization is not None else task.calibration_completed_at is not None


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
    groups, records = await authorization_groups(db, project, node, writable, str(actor.actor_ref))
    targets = {}
    for group in groups:
        if group["authorizations"]:
            by_id = {task.id: task for task in group["tasks"]}
            for record in group["authorizations"]:
                targets[(record.task_id, record.id)] = (by_id[record.task_id], record)
        else:
            for task in group["tasks"]:
                targets[(task.id, None)] = (task, None)
    if not targets:
        raise HTTPException(404, "TASK_NOT_FOUND")
    writable = list({task.id: task for task, _record in targets.values()}.values())
    now = datetime.now(UTC)
    in_window = all((start is None or start <= now) and (end is None or now <= end)
                    for start, end in [routes._task_window(task, node, project) for task in writable])
    missing = 0
    versions = []
    ratings = {}
    schema = routes.build_self_summary_schema(await routes._self_summary_template(writable[0], node, db))
    metadata = routes._task_rating_metadata(schema)
    for task in writable:
        key = member_key(task)
        if key in ratings:
            continue
        result = await routes._effective_member_result(project.id, project.cycle_ref, task.member_snapshot_id, task.target_employee_no, db)
        state = result.get("shared_state") or {}
        versions.append([task.member_snapshot_id, task.target_employee_no, state.get("revision", 0), result["answers"]])
        ratings[key] = routes._rating_values_from_answers(result["answers"], metadata)
        missing += not routes._result_ready([type("Result", (), {"status": "completed", "submitted_at": now, "answers": result["answers"]})()], schema)
    tips = distribution_tips(project, node, groups, ratings, metadata)
    blocked = any(condition["control_mode"] == "HARD" and condition["violated"] for rule in tips["rules"] for condition in rule["conditions"])
    completed = all(is_completed(task, record) for task, record in targets.values())
    response = {"scope_version": completion_digest(project, node, writable, actor, versions, records),
                "total_count": len(targets), "completed_count": sum(is_completed(task, record) for task, record in targets.values()),
                "missing_result_count": missing, "can_complete": in_window and not blocked, "completed": completed,
                "blocked_reason": "SUBMISSION_NOT_ALLOWED" if not in_window else "CALIBRATION_DISTRIBUTION_VIOLATED" if blocked else None,
                "has_original_tasks": any(record is None for _task, record in targets.values())}
    return project, node, actor, list(targets.values()), response


async def preview_completion(db, project_id, payload, context):
    *_, response = await completion_scope(db, project_id, payload.node_id, payload.phase_id, context)
    return response


async def confirm_completion(db, project_id, payload, context):
    from app.performance.projects_router import _sync_automatic_openings
    project, node, actor, targets, response = await completion_scope(db, project_id, payload.node_id, payload.phase_id, context, lock=True)
    if response["completed"]:
        return response
    if response["scope_version"] != payload.scope_version:
        raise HTTPException(409, "CALIBRATION_SCOPE_CHANGED")
    if not response["can_complete"]:
        raise HTTPException(409, response.get("blocked_reason") or "SUBMISSION_NOT_ALLOWED")
    now = datetime.now(UTC)
    for task, record in targets:
        if is_completed(task, record):
            continue
        if record is None:
            task.calibration_completed_at = now
            task.calibration_completed_by = str(actor.actor_ref)
        else:
            record.authorization_settings = {**record.authorization_settings, "calibration_completed_at": now.isoformat(), "calibration_completed_by": str(actor.actor_ref)}
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="CALIBRATION_COMPLETED", cycle_ref=project.cycle_ref, actor_type=actor.actor_type,
        actor_ref=actor.actor_ref, subject_type="PERFORMANCE_PROJECT", subject_ref=str(project.id),
        after_state={"node_id": node.node_id, "phase_id": payload.phase_id, "task_ids": sorted({task.id for task, _record in targets}),
                     "authorization_ids": [record.id for _task, record in targets if record is not None],
                     "scope_version": response["scope_version"], "missing_result_count": response["missing_result_count"]},
    ))
    if any(record is None for _task, record in targets):
        await _sync_automatic_openings(db, project)
    await db.commit()
    *_, response = await completion_scope(db, project_id, payload.node_id, payload.phase_id, context)
    return response
