"""Transactional member mutations shared by HTTP management and cycle lifecycle."""
from copy import deepcopy

from fastapi import HTTPException, status
from sqlalchemy import delete, select

from app.data.employee_roster_contract import ORGANIZATION_FIELDS, organization_path
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.calibration_service import CalibrationConflict, calibration_phase_window, extend_calibration_member
from app.performance.project_service import PerformanceProjectService, ProjectValidationError, _parse_time, _resolve_node_handlers
from app.performance.models import (PerformanceProject, PerformanceProjectMemberSnapshot, PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson,
    PerformanceProjectMember, PerformanceProjectNodeSnapshot, PerformanceNodeTask,
    PerformanceCycleProjectManager, PerformanceResultReconsideration, PerformanceResultOpening,
    PROJECT_STATUS_STARTED)
from app.performance.assessment_roles import node_role_code, ROLE_PROJECT_MANAGER, ROLE_REVIEWER_360


async def add_member(db, project, cycle, people, employee_no, *, actor_type, actor_id,
                     maintain_rules=True, visible_add_okr_notice=False):
    person = next((item for item in people if item.employee_no == employee_no), None)
    if person is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="被评估人不在当前周期人员快照中")
    service = PerformanceProjectService(db)
    added_rules = service.adjust_evaluator_rules((project.settings or {}).get("evaluator_rules"), include=[employee_no]) if maintain_rules else (project.settings or {}).get("evaluator_rules")
    added_task_people, added_report_people = service._classify_people([person], {
        **(project.settings or {}), "evaluator_rules": {"groups": [{"conditions": [{"field": "employee", "operator": "include", "values": [employee_no]}]}]},
    }, cycle)
    if not added_task_people and not added_report_people:
        raise HTTPException(status_code=422, detail="被评估人不符合周期资格或项目限定范围")
    creates_tasks = bool(added_task_people)
    member_snapshot = await db.scalar(select(PerformanceProjectMemberSnapshot).where(
        PerformanceProjectMemberSnapshot.project_id == project.id,
    ).order_by(PerformanceProjectMemberSnapshot.id.desc()).limit(1).with_for_update())
    if member_snapshot is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="项目成员快照不存在")
    existing = await db.scalar(select(PerformanceProjectMember.id).where(
        PerformanceProjectMember.snapshot_id == member_snapshot.id,
        PerformanceProjectMember.employee_no == employee_no,
    ))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="被评估人已在项目中")
    owned_elsewhere = await service.occupied_employee_nos(project.cycle_ref, [employee_no], project_id=project.id)
    if owned_elsewhere:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"被评估人 {employee_no} 已参加本周期其他项目")
    project_manager_rows = (await db.execute(select(PerformanceCycleProjectManager).where(
        PerformanceCycleProjectManager.cycle_ref == project.cycle_ref,
    ))).scalars().all()
    project_managers = {row.target_employee_no: row.manager_employee_no for row in project_manager_rows}
    member = PerformanceProjectMember(
        snapshot_id=member_snapshot.id,
        employee_no=person.employee_no,
        portal_user_id=person.portal_user_id,
        display_name=person.display_name,
        bu=getattr(person, "bu", None),
        **{field: getattr(person, field) for field in ORGANIZATION_FIELDS},
        organization_ref=organization_path(person),
        direct_supervisor_employee_no=person.direct_supervisor_employee_no,
        project_manager_employee_no=project_managers.get(person.employee_no),
        hrbp_employee_no=person.hrbp_employee_no,
        employee_type=person.employee_type,
        employment_status=person.employment_status,
        job_family=person.job_family,
        job_category=person.job_category,
        standard_position=person.standard_position,
        position_level=person.position_level,
        hire_date=person.hire_date,
    )
    people_by_employee = {item.employee_no: item for item in people}
    nodes = list((await db.execute(select(PerformanceProjectNodeSnapshot).where(
        PerformanceProjectNodeSnapshot.project_id == project.id,
    ).order_by(PerformanceProjectNodeSnapshot.node_order, PerformanceProjectNodeSnapshot.id).with_for_update())).scalars().all())
    if creates_tasks and any(node_role_code((node.config or {}).get("template") or {}) == ROLE_PROJECT_MANAGER for node in nodes) and not project_managers.get(person.employee_no):
        raise HTTPException(status_code=422, detail="被评估人未导入直属项目上级")
    try:
        _current, current_task_people, _report = await service.project_audience(project)
    except ProjectValidationError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    generation_nos = {item.employee_no for item in current_task_people}
    flow_settings = (project.settings or {}).get("flow_settings") or {}
    node_times = flow_settings.get("node_times") or {}
    calibration_updates = {}
    try:
        if creates_tasks:
            for node in nodes:
                if node.node_type == "calibration":
                    calibration_updates[node.id] = extend_calibration_member(node, flow_settings, people_by_employee, sorted(generation_nos), person.employee_no)
                    for phase in calibration_updates[node.id][1]:
                        window = calibration_phase_window(flow_settings, node, phase["phase_id"]) or {}
                        if not window.get("start_at") or not window.get("end_at"):
                            raise CalibrationConflict("CALIBRATION_PHASE_TIME_REQUIRED", "校准阶段缺少起止时间")
    except (CalibrationConflict, ValueError) as exc:
        raise HTTPException(status_code=409, detail={"code": getattr(exc, "code", "CALIBRATION_RULE_INVALID"), "message": str(exc)}) from exc
    db.add(member)
    for node in nodes if creates_tasks else []:
        if node.node_type == "result_view" or node.node_type == "result_reconsideration":
            continue
        timing = node_times.get(node.node_id) or {}
        if node.node_type == "calibration":
            calibration, delta_phases = calibration_updates[node.id]
            node.config = {**(node.config or {}), "calibration": calibration}
            for phase in delta_phases:
                window = calibration_phase_window(flow_settings, node, phase["phase_id"]) or {}
                for assignment in phase["assignments"]:
                    db.add(PerformanceNodeTask(
                        project_id=project.id, cycle_ref=project.cycle_ref, member_snapshot_id=member_snapshot.id,
                        node_snapshot_id=node.id, target_employee_no=employee_no,
                        handler_ref=assignment["handler_ref"], task_kind="calibration",
                        phase_id=phase["phase_id"],
                        available_at=_parse_time(window.get("start_at")), due_at=_parse_time(window.get("end_at")),
                        status="pending",
                    ))
            continue
        raw_node = (node.config or {}).get("template") or {}
        handlers = _resolve_node_handlers(raw_node, person, people_by_employee)
        if node_role_code(raw_node) == ROLE_PROJECT_MANAGER and project_managers.get(person.employee_no):
            handlers.add(project_managers[person.employee_no])
        for handler in sorted(handlers):
            db.add(PerformanceNodeTask(
                project_id=project.id, cycle_ref=project.cycle_ref, member_snapshot_id=member_snapshot.id,
                node_snapshot_id=node.id, target_employee_no=employee_no,
                handler_ref=str(handler), task_kind=node.node_type,
                available_at=_parse_time(timing.get("start_at")),
                due_at=_parse_time(timing.get("end_at") or timing.get("appeal_deadline")),
                status="pending",
            ))
        # 360° 评估 invite_review：与 start_project 的 DIRECT_SUBORDINATES 默认邀请分支一致，
        # 新加入成员同样为其直属下属生成邀请任务
        if node.node_type == "evaluation" and node_role_code(raw_node) == ROLE_REVIEWER_360:
            invite = (((flow_settings.get("node_settings") or {}).get(node.node_id) or {}).get("invite") or {})
            if invite.get("default_invite", "DIRECT_SUBORDINATES") == "DIRECT_SUBORDINATES" and not (project.settings or {}).get("reviewer_360_default_on_submit"):
                available_at = _parse_time(timing.get("start_at"))
                due_at = _parse_time(timing.get("end_at") or timing.get("appeal_deadline"))
                for reviewer in people:
                    reviewer_status = getattr(reviewer, "live_employment_status", None) or reviewer.employment_status
                    if reviewer.direct_supervisor_employee_no != employee_no or reviewer_status == "离职":
                        continue
                    db.add(PerformanceNodeTask(
                        project_id=project.id, cycle_ref=project.cycle_ref, member_snapshot_id=member_snapshot.id,
                        node_snapshot_id=node.id, target_employee_no=employee_no,
                        handler_ref=reviewer.employee_no, task_kind="evaluation",
                        phase_id="",
                        available_at=available_at, due_at=due_at,
                        status="pending",
                        source_type="DEFAULT",
                    ))
                    PerformanceAuditService(db).append_event(AuditEventInput(
                        event_type="REVIEWER_360_INVITED",
                        cycle_ref=project.cycle_ref,
                        employee_no=employee_no,
                        actor_type="SYSTEM",
                        actor_ref="0",
                        subject_type="REVIEWER_360",
                        subject_ref=reviewer.employee_no,
                        after_state={
                            "project_id": project.id,
                            "node_id": node.node_id,
                            "source_type": "DEFAULT",
                            "assigned_by_type": None,
                            "assigned_by_ref": None,
                        },
                    ))
    if creates_tasks:
        generation_nos.add(person.employee_no)
    member_snapshot.source_filter = {**(member_snapshot.source_filter or {}), "task_generation_employee_nos": sorted(generation_nos)}
    project.settings = {**(project.settings or {}), "evaluator_rules": added_rules}
    project.evaluated_count = len(generation_nos)
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PROJECT_REVIEWEE_ADDED", cycle_ref=project.cycle_ref, employee_no=employee_no,
        actor_type=actor_type, actor_ref=str(actor_id),
        subject_type="PERFORMANCE_PROJECT", subject_ref=project.project_ref,
        after_state={"project_id": project.id, "member_snapshot_id": member_snapshot.id, "visible_add_okr_notice": visible_add_okr_notice},
    ))
    return person


async def remove_member(db, project, employee_no, *, actor_type, actor_id,
                        maintain_rules=True, root_review_id=None):
    member_snapshot = await db.scalar(select(PerformanceProjectMemberSnapshot).where(
        PerformanceProjectMemberSnapshot.project_id == project.id,
    ).order_by(PerformanceProjectMemberSnapshot.id.desc()).limit(1).with_for_update())
    if member_snapshot is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="项目成员快照不存在")
    member = await db.scalar(select(PerformanceProjectMember).where(
        PerformanceProjectMember.snapshot_id == member_snapshot.id,
        PerformanceProjectMember.employee_no == employee_no,
    ).with_for_update())
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="被评估人不在当前项目中")
    if root_review_id is not None and root_review_id != member.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ROOT_REVIEW_ID_MISMATCH")
    service = PerformanceProjectService(db)
    try:
        _members, task_members, _report_members = await service.project_audience(project)
        rules = service.adjust_evaluator_rules((project.settings or {}).get("evaluator_rules"), exclude=[employee_no]) if maintain_rules else (project.settings or {}).get("evaluator_rules")
    except ProjectValidationError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    generation_nos = sorted({person.employee_no for person in task_members} - {employee_no})
    before = {"evaluator_rules": deepcopy((project.settings or {}).get("evaluator_rules")), "evaluated_count": project.evaluated_count}
    task_ids = list((await db.execute(select(PerformanceNodeTask.id).where(
        PerformanceNodeTask.project_id == project.id,
        PerformanceNodeTask.member_snapshot_id == member_snapshot.id,
        PerformanceNodeTask.target_employee_no == employee_no,
    ))).scalars().all())
    if task_ids:
        await db.execute(delete(PerformanceNodeTask).where(PerformanceNodeTask.id.in_(task_ids)))
    await db.execute(delete(PerformanceResultReconsideration).where(
        PerformanceResultReconsideration.project_id == project.id,
        PerformanceResultReconsideration.member_snapshot_id == member_snapshot.id,
        PerformanceResultReconsideration.employee_no == employee_no,
    ))
    await db.execute(delete(PerformanceResultOpening).where(
        PerformanceResultOpening.project_id == project.id,
        PerformanceResultOpening.employee_no == employee_no,
    ))
    await db.delete(member)
    calibration_updates: dict[int, dict] = {}
    calibration_nodes = list((await db.execute(select(PerformanceProjectNodeSnapshot).where(
        PerformanceProjectNodeSnapshot.project_id == project.id,
    ).order_by(PerformanceProjectNodeSnapshot.id).with_for_update())).scalars().all())
    for node in calibration_nodes:
        if node.node_type != "calibration":
            continue
        frozen = deepcopy((node.config or {}).get("calibration") or {})
        phases = frozen.get("phases") or []
        if not phases:
            continue
        for phase in phases:
            for source in phase.get("rule_sources") or []:
                source["assignments"] = [item for item in source.get("assignments") or [] if item["employee_no"] != employee_no]
            phase["assignments"] = [item for item in phase.get("assignments") or [] if item["employee_no"] != employee_no]
        assigned = {item["employee_no"] for phase in phases for item in phase.get("assignments") or []}
        frozen.update({"phases": phases, "evaluated_count": len(generation_nos), "assigned_count": len(assigned), "unassigned_count": len(set(generation_nos) - assigned)})
        node.config = {**(node.config or {}), "calibration": frozen}
        calibration_updates[node.id] = frozen
    project.settings = {**(project.settings or {}), "evaluator_rules": rules}
    member_snapshot.source_filter = {**(member_snapshot.source_filter or {}), "task_generation_employee_nos": generation_nos}
    project.evaluated_count = len(generation_nos)
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PROJECT_REVIEWEE_REMOVED", cycle_ref=project.cycle_ref, employee_no=employee_no,
        actor_type=actor_type, actor_ref=str(actor_id),
        subject_type="PERFORMANCE_PROJECT", subject_ref=project.project_ref,
        before_state=before,
        after_state={"project_id": project.id, "member_snapshot_id": member_snapshot.id, "revoked_task_ids": task_ids, "calibration_updates": calibration_updates, "evaluator_rules": rules, "evaluated_count": project.evaluated_count},
    ))


async def _cycle_projects(db, cycle):
    return list((await db.execute(select(PerformanceProject).where(
        PerformanceProject.cycle_ref == cycle.cycle_ref,
        PerformanceProject.status == PROJECT_STATUS_STARTED,
    ).order_by(PerformanceProject.id).with_for_update().execution_options(populate_existing=True))).scalars().all())


async def adjust_cycle_members(db, cycle):
    service = PerformanceProjectService(db)
    _snapshot, people = await service._cycle_snapshot_people(cycle)
    projects = await _cycle_projects(db, cycle)
    plans = []
    owners = {}
    for project in projects:
        task_people, report_people = service._classify_people(people, project.settings or {}, cycle)
        selected = {person.employee_no for person in [*task_people, *report_people]}
        for employee_no in sorted(selected):
            if employee_no in owners:
                raise HTTPException(409, f"被评估人 {employee_no} 同时命中本周期多个项目")
            owners[employee_no] = project.id
        current, _tasks, _reports = await service.project_audience(project)
        current_nos = {person.employee_no for person in current}
        plans.append((project, sorted(current_nos - selected), sorted(selected - current_nos)))
    for project, removed, _added in plans:
        for employee_no in removed:
            await remove_member(db, project, employee_no, actor_type="SYSTEM", actor_id=0, maintain_rules=False)
            await db.flush()
    for project, _removed, added in plans:
        for employee_no in added:
            await add_member(db, project, cycle, people, employee_no, actor_type="SYSTEM", actor_id=0, maintain_rules=False)
            await db.flush()
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PERFORMANCE_CYCLE_MEMBERS_ADJUSTED", cycle_ref=cycle.cycle_ref,
        actor_type="SYSTEM", actor_ref="0",
        after_state={"projects": [{"project_id": project.id, "removed": removed, "added": added} for project, removed, added in plans]},
    ))


async def freeze_cycle_members(db, cycle):
    projects = await _cycle_projects(db, cycle)
    people = list((await db.execute(select(PerformanceAuthorizationSnapshotPerson).join(
        PerformanceAuthorizationSnapshot,
        PerformanceAuthorizationSnapshot.id == PerformanceAuthorizationSnapshotPerson.snapshot_id,
    ).where(PerformanceAuthorizationSnapshot.cycle_ref == cycle.cycle_ref))).scalars().all())
    by_employee = {person.employee_no: person for person in people}
    managers = {row.target_employee_no: row.manager_employee_no for row in (await db.execute(
        select(PerformanceCycleProjectManager).where(PerformanceCycleProjectManager.cycle_ref == cycle.cycle_ref)
    )).scalars().all()}
    fields = ("display_name", "bu", *ORGANIZATION_FIELDS, "organization_ref", "direct_supervisor_employee_no", "hrbp_employee_no", "employee_type", "employment_status", "job_family", "job_category", "standard_position", "position_level", "hire_date")
    for project in projects:
        snapshot = await db.scalar(select(PerformanceProjectMemberSnapshot).where(
            PerformanceProjectMemberSnapshot.project_id == project.id,
        ).order_by(PerformanceProjectMemberSnapshot.id.desc()).limit(1).with_for_update())
        if snapshot is None:
            raise HTTPException(409, "项目成员快照不存在")
        members = list((await db.execute(select(PerformanceProjectMember).where(
            PerformanceProjectMember.snapshot_id == snapshot.id,
        ).order_by(PerformanceProjectMember.id).with_for_update())).scalars().all())
        for member in members:
            person = by_employee.get(member.employee_no)
            if person is not None:
                for field in fields:
                    setattr(member, field, getattr(person, field))
                member.project_manager_employee_no = managers.get(member.employee_no)
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PERFORMANCE_CYCLE_MEMBER_INFO_FROZEN", cycle_ref=cycle.cycle_ref,
        actor_type="SYSTEM", actor_ref="0", after_state={"project_ids": [project.id for project in projects]},
    ))
