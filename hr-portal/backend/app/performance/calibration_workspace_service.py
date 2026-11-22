"""Authorized business scopes over frozen calibration tasks and delegation chains."""
import hashlib
import json
from copy import deepcopy
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select

from app.performance.calibration_service import calibration_task_scope
from app.performance.models import PerformanceNodeTask, PerformanceNodeTaskAuthorization, PerformanceProject, PerformanceProjectMemberSnapshot, PerformanceProjectNodeSnapshot, PerformanceAuthorizationSnapshotPerson, PROJECT_STATUS_STARTED
from app.performance.task_authorization_service import task_handler_condition


def rule_ids(task, node):
    phase = next((item for item in ((node.config or {}).get("calibration") or {}).get("phases", []) if item.get("phase_id") == task.phase_id), {})
    return next((list(item.get("source_rule_ids") or []) for item in phase.get("assignments") or [] if item.get("handler_ref") == task.handler_ref and item.get("employee_no") == task.target_employee_no), [])


def rule_completed(task, source_rule_id):
    state = getattr(task, "calibration_rule_completions", None)
    if source_rule_id is None:
        return bool(getattr(task, "calibration_completed_at", None)) if state is None else bool(state.get("rules")) and all(state["rules"].values())
    return bool(state and state.get("rules", {}).get(source_rule_id))


def responsibility_completed(task, node=None):
    state = getattr(task, "calibration_rule_completions", None)
    if state is None:
        return getattr(task, "calibration_completed_at", None) is not None
    sources = rule_ids(task, node) if node is not None else list(state.get("rules", {}))
    if not sources and "__legacy__" in state.get("rules", {}):
        sources = ["__legacy__"]
    return bool(sources) and all(rule_completed(task, identity) for identity in sources)


def complete_rule(task, node, source_rule_id, actor_ref, now):
    state = deepcopy(getattr(task, "calibration_rule_completions", None))
    if state is None:
        state = {"rules": {identity: None for identity in rule_ids(task, node)}, "history_ambiguous": getattr(task, "calibration_completed_at", None) is not None}
    selected = [source_rule_id] if source_rule_id is not None else list(state["rules"]) or ["__legacy__"]
    for identity in selected:
        if not state["rules"].get(identity):
            state["rules"][identity] = {"completed_at": now.isoformat(), "completed_by": str(actor_ref)}
    task.calibration_rule_completions = state
    if getattr(task, "calibration_completed_at", None) is None:
        task.calibration_completed_at = now
        task.calibration_completed_by = str(actor_ref)


def scope_key(project, node, phase_id, handler, rule_id, records=()):
    identity = [project.id, node.id, phase_id, handler, rule_id, min((record.id for record in records), default=None)]
    return "cal-" + hashlib.sha256(json.dumps(identity, ensure_ascii=False).encode()).hexdigest()


def scope_groups(project, node, tasks, records, actor_ref):
    from app.performance import projects_router as routes
    by_id = {task.id: task for task in tasks}
    records = [record for record in records if record.task_id in by_id and record.project_id == project.id and record.cycle_ref == project.cycle_ref and record.status == "ACTIVE"]
    owned = [task for task in tasks if str(task.handler_ref) == actor_ref and not any(record.task_id == task.id and record.authorization_type == "TRANSFER" for record in records)]
    result = []
    for (phase_id, handler, rule_id), values in routes._calibration_rule_task_groups(node, owned, None).items():
        result.append({"scope_key": scope_key(project, node, phase_id, handler, rule_id), "tasks": values, "authorizations": [], "source_rule_ids": [rule_id] if rule_id is not None else None, "source_rule_id": rule_id, "mode": "INHERIT", "read_only": False})
    partitions = {}
    for record in records:
        task = by_id[record.task_id]
        partitions.setdefault((task.phase_id, task.handler_ref), []).append(record)
    for (phase_id, handler), partition in partitions.items():
        active, delegated = routes._calibration_delegation_groups(partition)
        by_record = {record.id: record for record in active}
        for group in delegated:
            first = group[0]
            if first.recipient_employee_no != actor_ref:
                continue
            chain = [first]
            while (chain[-1].authorization_settings or {}).get("parent_authorization_id") is not None:
                chain.append(by_record[chain[-1].authorization_settings["parent_authorization_id"]])
            sources_in_chain = {record.authorization_settings.get("source_rule_id") for record in chain if (record.authorization_settings or {}).get("source_rule_id") is not None}
            if len(sources_in_chain) > 1:
                continue
            source = next(iter(sources_in_chain), None)
            values = list({record.task_id: by_id[record.task_id] for record in group}.values())
            if source is not None:
                values = [task for task in values if source in rule_ids(task, node)]
                group = [record for record in group if record.task_id in {task.id for task in values}]
            if not group:
                continue
            mode = (first.authorization_settings or {}).get("distribution_mode", "INHERIT")
            sources = [source] if source is not None else list(dict.fromkeys(identity for task in values for identity in rule_ids(task, node))) or None
            result.append({"scope_key": scope_key(project, node, phase_id, handler, source, group), "tasks": values, "authorizations": group, "source_rule_ids": sources, "source_rule_id": source, "mode": mode, "read_only": any(record.read_only for record in chain)})
    return result


async def project_scopes(db, project, node, actor_ref, context):
    from app.performance import projects_router as routes
    tasks = list((await db.execute(select(PerformanceNodeTask).where(
        PerformanceNodeTask.project_id == project.id, PerformanceNodeTask.cycle_ref == project.cycle_ref,
        PerformanceNodeTask.node_snapshot_id == node.id, PerformanceNodeTask.task_kind == "calibration",
        PerformanceNodeTask.revoked_at.is_(None), task_handler_condition(actor_ref),
    ).order_by(PerformanceNodeTask.id).execution_options(populate_existing=True))).scalars().all())
    visible = []
    for task in tasks:
        if not calibration_task_scope(task, node):
            continue
        try:
            await routes._self_summary_task(task.id, context, db, "evaluation")
        except HTTPException as error:
            if error.status_code in {403, 404}:
                continue
            raise
        visible.append(task)
    records = list((await db.execute(select(PerformanceNodeTaskAuthorization).where(
        PerformanceNodeTaskAuthorization.project_id == project.id,
        PerformanceNodeTaskAuthorization.cycle_ref == project.cycle_ref,
        PerformanceNodeTaskAuthorization.task_id.in_([task.id for task in visible]),
        PerformanceNodeTaskAuthorization.status == "ACTIVE",
    ).order_by(PerformanceNodeTaskAuthorization.id).execution_options(populate_existing=True))).scalars().all()) if visible else []
    return scope_groups(project, node, visible, records, actor_ref), records


async def resolve_scope(db, project_id, node_id, key, context, *, lock=False, phase_id=None):
    from app.performance import projects_router as routes
    if lock:
        cycle_ref = await db.scalar(select(PerformanceProject.cycle_ref).where(PerformanceProject.id == project_id))
        if cycle_ref is not None:
            await db.scalar(select(routes.PerformanceCycle).where(routes.PerformanceCycle.cycle_ref == cycle_ref).with_for_update().execution_options(populate_existing=True))
    statement = select(PerformanceProject).where(PerformanceProject.id == project_id)
    if lock:
        statement = statement.with_for_update()
    project = await db.scalar(statement.execution_options(populate_existing=True))
    if project is None or project.status != PROJECT_STATUS_STARTED:
        raise HTTPException(404, "PROJECT_NOT_FOUND")
    actor = await routes.resolve_trusted_performance_actor(db, context, cycle_ref=project.cycle_ref, require_employee_identity=True)
    node = await db.scalar(select(PerformanceProjectNodeSnapshot).where(
        PerformanceProjectNodeSnapshot.project_id == project.id, PerformanceProjectNodeSnapshot.node_id == node_id,
        PerformanceProjectNodeSnapshot.node_type == "calibration",
    ).execution_options(populate_existing=True))
    if node is None:
        raise HTTPException(404, "TASK_NOT_FOUND")
    groups, records = await project_scopes(db, project, node, str(actor.actor_ref), context)
    group = next((group for group in groups if group["scope_key"] == key and (phase_id is None or group["tasks"][0].phase_id == phase_id)), None)
    if group is None:
        raise HTTPException(404, "TASK_NOT_FOUND")
    return project, node, actor, group, records


def group_completed(group):
    if group["authorizations"]:
        return all((record.authorization_settings or {}).get("calibration_completed_at") for record in group["authorizations"])
    return all(rule_completed(task, group["source_rule_id"]) for task in group["tasks"])


async def list_scopes(db, cycle_id, context):
    from app.performance import projects_router as routes
    cycle = await routes._get_cycle(db, cycle_id)
    projects = list((await db.execute(select(PerformanceProject).where(PerformanceProject.cycle_ref == cycle.cycle_ref, PerformanceProject.status == PROJECT_STATUS_STARTED).order_by(PerformanceProject.id))).scalars().all())
    result, pending_members = [], set()
    now = datetime.now(UTC)
    for project in projects:
        actor = await routes.resolve_trusted_performance_actor(db, context, cycle_ref=project.cycle_ref, require_employee_identity=True)
        nodes = list((await db.execute(select(PerformanceProjectNodeSnapshot).where(PerformanceProjectNodeSnapshot.project_id == project.id, PerformanceProjectNodeSnapshot.node_type == "calibration").order_by(PerformanceProjectNodeSnapshot.node_order, PerformanceProjectNodeSnapshot.id))).scalars().all())
        for node in nodes:
            groups, _records = await project_scopes(db, project, node, str(actor.actor_ref), context)
            snapshot_ids = {task.member_snapshot_id for group in groups for task in group["tasks"]}
            people = list((await db.execute(select(PerformanceAuthorizationSnapshotPerson).join(PerformanceProjectMemberSnapshot, PerformanceProjectMemberSnapshot.source_snapshot_id == PerformanceAuthorizationSnapshotPerson.snapshot_id).where(PerformanceProjectMemberSnapshot.id.in_(snapshot_ids)))).scalars().all()) if snapshot_ids else []
            for group in groups:
                task = group["tasks"][0]
                phase = next((phase for phase in ((node.config or {}).get("calibration") or {}).get("phases", []) if phase.get("phase_id") == task.phase_id), {})
                rules = [rule for rule in routes._calibration_source_rules(phase, group["tasks"]) if group["source_rule_id"] is None or rule["rule_id"] == group["source_rule_id"]]
                referenced_people = {task.target_employee_no for task in group["tasks"]}
                for rule in rules:
                    referenced_people.update(value for key in ("subject_groups", "scope_groups") for block in rule.get(key) or [] for condition in block.get("conditions") or [] if condition.get("field") in {"employee", "person"} for value in condition.get("values") or [])
                names = list({person.employee_no: {"employee_no": person.employee_no, "display_name": person.display_name} for person in people if person.employee_no in referenced_people}.values())
                start, end = routes._task_window(task, node, project)
                completed = group_completed(group)
                status = "completed" if completed else "overdue" if end is not None and end < now else "pending"
                if not completed:
                    pending_members.update((project.id, item.member_snapshot_id, item.target_employee_no) for item in group["tasks"])
                ambiguous = any((getattr(item, "calibration_rule_completions", None) or {}).get("history_ambiguous") or getattr(item, "calibration_completed_at", None) is not None and getattr(item, "calibration_rule_completions", None) is None for item in group["tasks"]) and not group["authorizations"]
                result.append({"scope_key": group["scope_key"], "project_id": project.id, "project_name": project.name, "node_id": node.node_id, "node_name": node.name, "phase_id": task.phase_id, "source_rule_id": group["source_rule_id"], "task_number": len(result) + 1, "scope_label": routes._calibration_scope_label(rules), "rule": rules[0] if len(rules) == 1 else None, "people_options": names, "scope_note": "以冻结校准任务范围为准，后续组织和汇报关系更新不改变已有范围。", "status": status, "start_at": start, "end_at": end, "member_count": len({(item.member_snapshot_id, item.target_employee_no) for item in group["tasks"]}), "can_complete": not group["read_only"] and (start is None or start <= now) and (end is None or now <= end), "read_only": group["read_only"], "history_ambiguous": bool(ambiguous)})
    return {"tasks": result, "pending_member_count": len(pending_members)}
