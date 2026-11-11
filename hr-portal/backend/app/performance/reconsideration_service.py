"""Result reconsideration submission and notification delivery."""
from datetime import UTC, datetime, timedelta
from html.parser import HTMLParser

from app.performance.self_summary_service import sanitize_rich_text

from fastapi import HTTPException
from sqlalchemy import select

from app.performance.models import (
    PerformanceAuthorizationSnapshotPerson, PerformanceIdentityLink, PerformanceNodeTask,
    PerformanceNotificationSetting, PerformanceProject, PerformanceProjectMember,
    PerformanceProjectMemberSnapshot, PerformanceProjectNodeSnapshot,
    PerformanceReconsiderationNotification, PerformanceResultOpening,
    PerformanceResultReconsideration, PROJECT_STATUS_STARTED,
)
from app.performance.executor_config import normalize_executor_config
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.project_service import _manager_chain_handlers, _parse_time


def valid_reconsideration_task():
    return select(PerformanceResultReconsideration.id).where(
        PerformanceResultReconsideration.project_id == PerformanceNodeTask.project_id,
        PerformanceResultReconsideration.member_snapshot_id == PerformanceNodeTask.member_snapshot_id,
        PerformanceResultReconsideration.node_snapshot_id == PerformanceNodeTask.node_snapshot_id,
        PerformanceResultReconsideration.employee_no == PerformanceNodeTask.target_employee_no,
        PerformanceResultReconsideration.withdrawn_at.is_(None),
        PerformanceNodeTask.revoked_at.is_(None),
    ).exists()


async def reconsideration_for_task(db, task, *, lock=False):
    if task.task_kind != "result_reconsideration" or task.revoked_at is not None:
        raise HTTPException(404, "TASK_NOT_FOUND")
    statement = select(PerformanceResultReconsideration).where(
        PerformanceResultReconsideration.project_id == task.project_id,
        PerformanceResultReconsideration.member_snapshot_id == task.member_snapshot_id,
        PerformanceResultReconsideration.node_snapshot_id == task.node_snapshot_id,
        PerformanceResultReconsideration.employee_no == task.target_employee_no,
        PerformanceResultReconsideration.withdrawn_at.is_(None),
    ).execution_options(populate_existing=True)

    if lock:
        statement = statement.with_for_update()
    appeal = await db.scalar(statement)
    if appeal is None:
        raise HTTPException(404, "TASK_NOT_FOUND")
    return appeal


async def reconsideration_tasks(db, appeal, *, lock=False):
    if appeal.withdrawn_at is not None:
        return []
    statement = select(PerformanceNodeTask).where(
        PerformanceNodeTask.project_id == appeal.project_id,
        PerformanceNodeTask.member_snapshot_id == appeal.member_snapshot_id,
        PerformanceNodeTask.node_snapshot_id == appeal.node_snapshot_id,
        PerformanceNodeTask.target_employee_no == appeal.employee_no,
        PerformanceNodeTask.task_kind == "result_reconsideration",
        PerformanceNodeTask.revoked_at.is_(None),
    ).order_by(PerformanceNodeTask.id).execution_options(populate_existing=True)
    if lock:
        statement = statement.with_for_update()
    return list((await db.execute(statement)).scalars().all())


def _fallback_employee_nos(project, node) -> list[str]:
    flow_settings = (project.settings or {}).get("flow_settings") or {}
    node_settings = flow_settings.get("node_settings") or {}
    reconsideration = (node_settings.get(node.node_id) or {}).get("result_reconsideration") or {}
    values = reconsideration.get("handler_employee_nos")
    if values is None and isinstance(reconsideration.get("handler"), str):
        values = [reconsideration["handler"]]
    return list(dict.fromkeys(
        value.strip() for value in (values or [])
        if isinstance(value, str) and value.strip()
    ))


def resolve_handlers(template, member, people, fallback_employee_nos=None):
    handlers = set()
    for role in normalize_executor_config(template.get("executor_config"))["roles"]:
        if role["type"] == "SPECIFIED_PERSON":
            handlers.update(person["employee_no"] for person in role["people"])
        elif role["type"] == "HRBP":
            if getattr(member, "hrbp_employee_no", None):
                handlers.add(member.hrbp_employee_no)
        elif role["type"] == "REAL_LINE_MANAGER":
            handlers.update(_manager_chain_handlers(member, people, set(role["levels"])))
        else:
            # Department-head resolution requires a frozen organization source;
            # if it cannot resolve, the project fallback remains eligible.
            continue
    if handlers:
        return sorted(handlers)
    fallback = {
        employee_no for employee_no in (fallback_employee_nos or [])
        if employee_no in people
    }
    if fallback:
        return sorted(fallback)
    if fallback_employee_nos is not None:
        raise HTTPException(409, "RECONSIDERATION_FALLBACK_NOT_CONFIGURED")
    raise HTTPException(409, "RECONSIDERATION_HANDLER_NOT_CONFIGURED")


async def submission_context(db, project_id, employee_no, *, lock=False):
    statement = select(PerformanceProject).where(PerformanceProject.id == project_id)
    if lock:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    project = await db.scalar(statement)
    if project is None or project.status != PROJECT_STATUS_STARTED:
        raise HTTPException(404, "RESULT_NOT_FOUND")
    opening = await db.scalar(select(PerformanceResultOpening).where(
        PerformanceResultOpening.project_id == project_id,
        PerformanceResultOpening.employee_no == employee_no,
    ))
    snapshot = await db.scalar(select(PerformanceProjectMemberSnapshot).where(
        PerformanceProjectMemberSnapshot.project_id == project_id,
    ).order_by(PerformanceProjectMemberSnapshot.id.desc()).limit(1))
    member = await db.scalar(select(PerformanceProjectMember).where(
        PerformanceProjectMember.snapshot_id == snapshot.id,
        PerformanceProjectMember.employee_no == employee_no,
    )) if snapshot else None
    if opening is None or member is None:
        raise HTTPException(404, "RESULT_NOT_FOUND")
    nodes = list((await db.execute(select(PerformanceProjectNodeSnapshot).where(
        PerformanceProjectNodeSnapshot.project_id == project_id,
    ).order_by(PerformanceProjectNodeSnapshot.node_order))).scalars().all())
    node = next((item for index, item in enumerate(nodes) if item.node_type == "result_reconsideration"
                 and index > 0 and nodes[index - 1].node_type == "result_view"), None)
    if node is None:
        raise HTTPException(404, "RECONSIDERATION_NOT_CONFIGURED")
    node._result_view_node = nodes[nodes.index(node) - 1]
    statement = select(PerformanceResultReconsideration).where(
        PerformanceResultReconsideration.project_id == project_id,
        PerformanceResultReconsideration.employee_no == employee_no,
    ).execution_options(populate_existing=True)
    appeal = await db.scalar(statement.with_for_update() if lock else statement)
    return project, snapshot, member, opening, node, appeal


def submission_window(project, node):
    flow = (project.settings or {}).get("flow_settings") or {}
    times = flow.get("node_times") or {}
    timing = times.get(node.node_id)
    timing = timing if timing is not None else (node.config or {}).get("time") or {}
    view_node = getattr(node, "_result_view_node", None)
    if view_node is not None:
        view = times.get(view_node.node_id)
        view = view if view is not None else (view_node.config or {}).get("time") or {}
    else:
        view_id = next((key for key, setting in (flow.get("node_settings") or {}).items() if "result_view" in setting), None)
        view = times.get(view_id) or {}
    start = view.get("start_at") if "start_at" in view else timing.get("start_at")
    end = view.get("appeal_deadline") if "appeal_deadline" in view else timing.get("appeal_deadline") or timing.get("end_at")
    return _parse_time(start), _parse_time(end), timing


class _VisibleReason(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def validate_reason(reason):
    if not reason or len(reason) > 30000:
        raise HTTPException(422, "RECONSIDERATION_REASON_INVALID")
    sanitized = sanitize_rich_text(reason)
    parser = _VisibleReason()
    parser.feed(sanitized)
    parser.close()
    visible = "".join(parser.parts).replace("​", "").replace("﻿", "").strip()
    if not visible or len(visible) > 1500:
        raise HTTPException(422, "RECONSIDERATION_REASON_INVALID")
    return sanitized


def _window_open(project, node):
    start, end, _ = submission_window(project, node)
    now = datetime.now(UTC)
    return end is not None and (start is None or now >= start) and now <= end


def _appeal_state(appeal):
    if appeal is None:
        return None
    return {"reason": appeal.reason, "withdrawn": appeal.withdrawn_at is not None,
            "withdrawn_at": appeal.withdrawn_at.isoformat() if appeal.withdrawn_at else None,
            "version": appeal.version, "submitted_at": appeal.submitted_at.isoformat(),
            "result_version": appeal.result_version}


def _audit(db, project, node, appeal, actor, event_type, before, **extra):
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type=event_type, cycle_ref=project.cycle_ref,
        employee_no=appeal.employee_no, actor_type=actor.actor_type, actor_ref=actor.actor_ref,
        subject_type="PERFORMANCE_RECONSIDERATION", subject_ref=str(appeal.id),
        before_state=before,
        after_state={**_appeal_state(appeal), "project_id": project.id, "node_id": node.node_id, **extra},
    ))


def _status(project, node, appeal):
    _, end, _ = submission_window(project, node)
    window_open = _window_open(project, node)
    active = appeal is not None and appeal.withdrawn_at is None
    template = (node.config or {}).get("template") or {}
    closed = getattr(appeal, "closed_at", None) is not None if appeal else False
    return {
        "closed_at": getattr(appeal, "closed_at", None) if appeal else None,
        "id": appeal.id if appeal else None, "version": appeal.version if appeal else None,
        "node_id": node.node_id, "can_submit": not active and window_open and not closed,
        "can_edit": active and window_open and not closed, "can_withdraw": active and not closed, "window_open": window_open,
        "withdrawn_at": appeal.withdrawn_at if appeal else None,
        "deadline_at": end, "reason": appeal.reason if active else None,
        "submitted_at": appeal.submitted_at if active else None,
        "handler_label": "复议处理人",
        "prompt": template.get("appeal_prompt_content") or "请详细说明复议原因并提供事实依据",
        "instruction": template.get("appeal_reason_instruction") or "请输入复议理由",
    }


async def read_status(db, project_id, employee_no):
    project, _, _, _, node, appeal = await submission_context(db, project_id, employee_no)
    return _status(project, node, appeal)


def _check_version(appeal, version):
    if version is None:
        raise HTTPException(409, "VERSION_REQUIRED")
    if version != appeal.version:
        raise HTTPException(409, "VERSION_CONFLICT")


async def freeze_published_result(db, project, employee_no, node, actor):
    from app.performance.projects_router import _published_employee_result
    from app.performance.reconsideration_result_service import freeze_result

    result, opening, snapshot_id, final_template = await _published_employee_result(project, employee_no, actor, db, lock=True)
    from fastapi.encoders import jsonable_encoder
    snapshot = freeze_result(jsonable_encoder(result), snapshot_id, opening.id, opening.result_version or {},
                             {"node": (node.config or {}).get("template") or {}, "final": final_template})
    return snapshot, snapshot_id


async def submit_reconsideration(db, project_id, employee_no, reason, actor, version=None, *, context=None):
    project, snapshot, member, opening, node, appeal = await submission_context(db, project_id, employee_no, lock=True)
    if appeal is not None and getattr(appeal, "closed_at", None) is not None:
        raise HTTPException(409, "RECONSIDERATION_CLOSED")
    if appeal is not None and appeal.withdrawn_at is None:
        raise HTTPException(409, "RECONSIDERATION_ALREADY_SUBMITTED")
    if appeal is not None:
        _check_version(appeal, version)
    if not _window_open(project, node):
        raise HTTPException(409, "RECONSIDERATION_WINDOW_CLOSED")
    reason = validate_reason(reason)
    frozen_result, frozen_snapshot_id = await freeze_published_result(db, project, employee_no, node, context or actor)
    if frozen_snapshot_id != snapshot.id:
        snapshot = await db.get(PerformanceProjectMemberSnapshot, frozen_snapshot_id)
        member = await db.scalar(select(PerformanceProjectMember).where(
            PerformanceProjectMember.snapshot_id == frozen_snapshot_id,
            PerformanceProjectMember.employee_no == employee_no,
        ))
        if snapshot is None or member is None:
            raise HTTPException(409, "RECONSIDERATION_SOURCE_CONFLICT")
    _, _, timing = submission_window(project, node)
    now = datetime.now(UTC)
    people = list((await db.execute(select(PerformanceAuthorizationSnapshotPerson).where(
        PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.source_snapshot_id,
    ))).scalars().all())
    handlers = resolve_handlers(
        (node.config or {}).get("template") or {}, member,
        {person.employee_no: person for person in people}, _fallback_employee_nos(project, node),
    )
    before = _appeal_state(appeal)
    resubmitting = appeal is not None
    if appeal is None:
        appeal = PerformanceResultReconsideration(
            project_id=project_id, member_snapshot_id=snapshot.id, node_snapshot_id=node.id,
            employee_no=employee_no, reason=reason, result_version=opening.result_version or {},
            submitted_at=now, withdrawn_at=None, version=1,
        )
        db.add(appeal)
    else:
        appeal.reason, appeal.submitted_at, appeal.withdrawn_at = reason, now, None
        appeal.version += 1
    appeal.member_snapshot_id = snapshot.id
    appeal.node_snapshot_id = node.id
    appeal.result_snapshot = frozen_result
    appeal.result_version = frozen_result["task_versions"]
    await db.flush()
    old_tasks = {} if resubmitting else {task.handler_ref: task for task in await reconsideration_tasks(db, appeal)}
    from app.identity_switch.service import current_switch
    switched = current_switch.get() is not None
    for handler in handlers:
        task = old_tasks.get(handler)
        if task is None:
            task = PerformanceNodeTask(project_id=project_id, cycle_ref=project.cycle_ref,
                member_snapshot_id=snapshot.id, node_snapshot_id=node.id,
                target_employee_no=employee_no, handler_ref=handler, task_kind="result_reconsideration",
                phase_id="", status="pending", available_at=now, due_at=_parse_time(timing.get("end_at")),
                answers={}, answer_version=1)
            db.add(task)
            await db.flush()
        else:
            if task.submitted_at is not None:
                raise HTTPException(409, "RECONSIDERATION_LEGACY_TASK_CONFLICT")
            task.available_at, task.due_at = now, _parse_time(timing.get("end_at"))
        db.add(PerformanceReconsiderationNotification(task_id=task.id, status="skipped" if switched else "pending", attempts=0, next_retry_at=now,
            last_error="IDENTITY_SWITCH_NOTIFICATION_INTERCEPTED" if switched else None))
    for handler in old_tasks:
        if handler not in handlers:
            raise HTTPException(409, "RECONSIDERATION_LEGACY_HANDLER_CONFLICT")
    _audit(db, project, node, appeal, actor,
           "PERFORMANCE_RECONSIDERATION_RESUBMITTED" if resubmitting else "PERFORMANCE_RECONSIDERATION_SUBMITTED",
           before, handlers=handlers)
    response = {**_status(project, node, appeal), "task_count": len(handlers),
                "notification_status": "skipped" if switched else "pending"}
    await db.commit()
    return response


async def edit_reconsideration(db, project_id, employee_no, reason, version, actor):
    project, _, _, _, node, appeal = await submission_context(db, project_id, employee_no, lock=True)
    if appeal is None or appeal.withdrawn_at is not None:
        raise HTTPException(404, "RECONSIDERATION_NOT_FOUND")
    if getattr(appeal, "closed_at", None) is not None:
        raise HTTPException(409, "RECONSIDERATION_CLOSED")
    _check_version(appeal, version)
    if not _window_open(project, node):
        raise HTTPException(409, "RECONSIDERATION_WINDOW_CLOSED")
    reason = validate_reason(reason)
    before = _appeal_state(appeal)
    appeal.reason = reason
    appeal.version += 1
    _audit(db, project, node, appeal, actor, "PERFORMANCE_RECONSIDERATION_EDITED", before)
    response = _status(project, node, appeal)
    await db.commit()
    return response


async def withdraw_reconsideration(db, project_id, employee_no, version, actor):
    project, _, _, _, node, appeal = await submission_context(db, project_id, employee_no, lock=True)
    if appeal is None or appeal.withdrawn_at is not None:
        raise HTTPException(404, "RECONSIDERATION_NOT_FOUND")
    if getattr(appeal, "closed_at", None) is not None:
        raise HTTPException(409, "RECONSIDERATION_CLOSED")
    _check_version(appeal, version)
    before = _appeal_state(appeal)
    tasks = await reconsideration_tasks(db, appeal, lock=True)
    appeal.withdrawn_at = datetime.now(UTC)
    appeal.version += 1
    for task in tasks:
        task.revoked_at = appeal.withdrawn_at
    if tasks:
        notifications = list((await db.execute(select(PerformanceReconsiderationNotification).where(
            PerformanceReconsiderationNotification.task_id.in_([task.id for task in tasks]),
            PerformanceReconsiderationNotification.status.in_(["pending", "retrying"]),
        ).with_for_update().execution_options(populate_existing=True))).scalars().all())
        for notification in notifications:
            notification.status = "skipped"
            notification.last_error = "RECONSIDERATION_WITHDRAWN"
    _audit(db, project, node, appeal, actor, "PERFORMANCE_RECONSIDERATION_WITHDRAWN", before,
           revoked_task_ids=[task.id for task in tasks])
    response = _status(project, node, appeal)
    await db.commit()
    return response


async def dispatch_notifications(db):
    from app.core.config import settings
    from app.integrations.feishu.notification_service import send_notification
    from app.integrations.feishu.schemas import CardButtonConfig, FixedUsersRule, MessageConfig, NotificationConfig
    from app.users.models import User

    now = datetime.now(UTC)
    rows = list((await db.execute(select(PerformanceReconsiderationNotification).where(
        PerformanceReconsiderationNotification.status.in_(["pending", "retrying"]),
        PerformanceReconsiderationNotification.next_retry_at <= now,
    ).order_by(PerformanceReconsiderationNotification.id).limit(20))).scalars().all())
    notification_settings = await db.get(PerformanceNotificationSetting, 1) if rows else None
    processed = 0
    for candidate in rows:
        row = candidate
        attempts = row.attempts
        try:
            async with db.begin_nested():
                task = await db.get(PerformanceNodeTask, row.task_id)
                if task is None:
                    row.status, row.last_error = "skipped", "TASK_NOT_FOUND"
                    processed += 1
                    continue
                project = await db.scalar(select(PerformanceProject).where(
                    PerformanceProject.id == task.project_id,
                ).with_for_update(skip_locked=True).execution_options(populate_existing=True))
                if project is None:
                    continue
                locked_rows = list((await db.execute(select(PerformanceReconsiderationNotification).where(
                    PerformanceReconsiderationNotification.id == row.id,
                    PerformanceReconsiderationNotification.status.in_(["pending", "retrying"]),
                ).with_for_update(skip_locked=True).execution_options(populate_existing=True))).scalars().all())
                if not locked_rows:
                    continue
                row = locked_rows[0]
                await db.refresh(task)
                processed += 1
                if (task.revoked_at is not None or task.status == "completed"
                        or project.status != PROJECT_STATUS_STARTED
                        or notification_settings is not None and not notification_settings.feishu_push_enabled):
                    row.status = "skipped"
                    continue
                try:
                    await reconsideration_for_task(db, task)
                except HTTPException as exc:
                    if exc.status_code != 404:
                        raise
                    row.status, row.last_error = "skipped", "TASK_NOT_FOUND"
                    continue
                row.attempts += 1
                user = await db.scalar(select(User).join(PerformanceIdentityLink, PerformanceIdentityLink.portal_user_id == User.id).where(
                    PerformanceIdentityLink.employee_no == task.handler_ref,
                    PerformanceIdentityLink.is_active.is_(True), User.is_active.is_(True),
                ))
                if user is None or not user.feishu_user_id:
                    raise ValueError("TASK_HANDLER_IDENTITY_NOT_FOUND")
                url = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/performance/review/template-task?task_id={task.id}&project_id={task.project_id}"
                result = await send_notification(NotificationConfig(
                    receivers=[FixedUsersRule(type="fixed_users", user_ids=[user.id])],
                    message=MessageConfig(title_template="绩效结果复议待处理", content_template="项目“{{project_name}}”有新的结果复议，请进入绩效任务查看并处理。"),
                    card_button=CardButtonConfig(enabled=bool(settings.PUBLIC_BASE_URL), text="处理复议", url=url),
                ), {"project_name": project.name, "task_id": task.id}, db,
                    biz_type="performance_reconsideration", biz_id=str(task.id))
                if result.status != "success" or result.success_count < 1:
                    raise ValueError("; ".join(result.errors) or result.status)
            row.status, row.sent_at, row.last_error = "sent", now, None
        except Exception as exc:
            row.attempts = attempts + 1
            row.status = "retrying"
            row.last_error = str(exc)[:1000]
            row.next_retry_at = now + timedelta(minutes=min(2 ** min(row.attempts, 10), 1440))
    return processed, f"result reconsideration notifications processed: {processed}"
