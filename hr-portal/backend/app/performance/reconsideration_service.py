"""Result reconsideration submission and notification delivery."""
from datetime import UTC, datetime, timedelta

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
    ).exists()


async def reconsideration_for_task(db, task, *, lock=False):
    statement = select(PerformanceResultReconsideration).where(
        PerformanceResultReconsideration.project_id == task.project_id,
        PerformanceResultReconsideration.member_snapshot_id == task.member_snapshot_id,
        PerformanceResultReconsideration.node_snapshot_id == task.node_snapshot_id,
        PerformanceResultReconsideration.employee_no == task.target_employee_no,
    )
    if lock:
        statement = statement.with_for_update()
    appeal = await db.scalar(statement)
    if appeal is None:
        raise HTTPException(404, "TASK_NOT_FOUND")
    return appeal


async def reconsideration_tasks(db, appeal):
    return list((await db.execute(select(PerformanceNodeTask).where(
        PerformanceNodeTask.project_id == appeal.project_id,
        PerformanceNodeTask.member_snapshot_id == appeal.member_snapshot_id,
        PerformanceNodeTask.node_snapshot_id == appeal.node_snapshot_id,
        PerformanceNodeTask.target_employee_no == appeal.employee_no,
        PerformanceNodeTask.task_kind == "result_reconsideration",
    ).order_by(PerformanceNodeTask.id).execution_options(populate_existing=True))).scalars().all())


def resolve_handlers(template, member, people):
    handlers = set()
    for role in normalize_executor_config(template.get("executor_config"))["roles"]:
        if role["type"] == "SPECIFIED_PERSON":
            handlers.update(person["employee_no"] for person in role["people"])
        elif role["type"] == "HRBP":
            if not member.hrbp_employee_no:
                raise HTTPException(409, "RECONSIDERATION_HRBP_NOT_CONFIGURED")
            handlers.add(member.hrbp_employee_no)
        elif role["type"] == "REAL_LINE_MANAGER":
            resolved = _manager_chain_handlers(member, people, set(role["levels"]))
            if not resolved:
                raise HTTPException(409, "RECONSIDERATION_MANAGER_NOT_CONFIGURED")
            handlers.update(resolved)
        else:
            raise HTTPException(409, "RECONSIDERATION_DEPARTMENT_SNAPSHOT_REQUIRED")
    if not handlers:
        raise HTTPException(409, "RECONSIDERATION_HANDLER_NOT_CONFIGURED")
    return sorted(handlers)


async def submission_context(db, project_id, employee_no, *, lock=False):
    statement = select(PerformanceProject).where(PerformanceProject.id == project_id)
    if lock:
        statement = statement.with_for_update()
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
    appeal = await db.scalar(select(PerformanceResultReconsideration).where(
        PerformanceResultReconsideration.project_id == project_id,
        PerformanceResultReconsideration.employee_no == employee_no,
    ))
    return project, snapshot, member, opening, node, appeal


def submission_window(project, node):
    timing = (((project.settings or {}).get("flow_settings") or {}).get("node_times") or {}).get(node.node_id)
    timing = timing if timing is not None else (node.config or {}).get("time") or {}
    return _parse_time(timing.get("start_at")), _parse_time(timing.get("appeal_deadline") or timing.get("end_at")), timing


async def read_status(db, project_id, employee_no):
    project, _, _, _, node, appeal = await submission_context(db, project_id, employee_no)
    start, end, _ = submission_window(project, node)
    now = datetime.now(UTC)
    template = (node.config or {}).get("template") or {}
    return {
        "node_id": node.node_id, "can_submit": appeal is None and end is not None and (start is None or now >= start) and now <= end,
        "deadline_at": end, "reason": appeal.reason if appeal else None,
        "submitted_at": appeal.submitted_at if appeal else None,
        "prompt": template.get("appeal_prompt_content") or "请详细说明复议原因并提供事实依据",
        "instruction": template.get("appeal_reason_instruction") or "请输入复议理由",
    }


async def submit_reconsideration(db, project_id, employee_no, reason, actor):
    project, snapshot, member, opening, node, appeal = await submission_context(db, project_id, employee_no, lock=True)
    if appeal is not None:
        raise HTTPException(409, "RECONSIDERATION_ALREADY_SUBMITTED")
    start, end, timing = submission_window(project, node)
    now = datetime.now(UTC)
    if end is None or (start is not None and now < start) or now > end:
        raise HTTPException(409, "RECONSIDERATION_WINDOW_CLOSED")
    people = list((await db.execute(select(PerformanceAuthorizationSnapshotPerson).where(
        PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.source_snapshot_id,
    ))).scalars().all())
    handlers = resolve_handlers((node.config or {}).get("template") or {}, member, {person.employee_no: person for person in people})
    appeal = PerformanceResultReconsideration(
        project_id=project_id, member_snapshot_id=snapshot.id, node_snapshot_id=node.id,
        employee_no=employee_no, reason=reason, result_version=opening.result_version or {}, submitted_at=now,
    )
    db.add(appeal)
    await db.flush()
    old_tasks = {task.handler_ref: task for task in await reconsideration_tasks(db, appeal)}
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
        from app.identity_switch.service import current_switch
        switched = current_switch.get() is not None
        db.add(PerformanceReconsiderationNotification(task_id=task.id, status="skipped" if switched else "pending", attempts=0, next_retry_at=now,
            last_error="IDENTITY_SWITCH_NOTIFICATION_INTERCEPTED" if switched else None))
    for handler, task in old_tasks.items():
        if handler not in handlers:
            raise HTTPException(409, "RECONSIDERATION_LEGACY_HANDLER_CONFLICT")
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PERFORMANCE_RECONSIDERATION_SUBMITTED", cycle_ref=project.cycle_ref,
        employee_no=employee_no, actor_type=actor.actor_type, actor_ref=actor.actor_ref,
        subject_type="PERFORMANCE_RECONSIDERATION", subject_ref=str(appeal.id),
        after_state={"project_id": project_id, "node_id": node.node_id, "handlers": handlers},
    ))
    await db.commit()
    return {"id": appeal.id, "task_count": len(handlers), "notification_status": "pending"}


async def dispatch_notifications(db):
    from app.core.config import settings
    from app.integrations.feishu.notification_service import send_notification
    from app.integrations.feishu.schemas import CardButtonConfig, FixedUsersRule, MessageConfig, NotificationConfig
    from app.users.models import User

    now = datetime.now(UTC)
    rows = list((await db.execute(select(PerformanceReconsiderationNotification).where(
        PerformanceReconsiderationNotification.status.in_(["pending", "retrying"]),
        PerformanceReconsiderationNotification.next_retry_at <= now,
    ).order_by(PerformanceReconsiderationNotification.id).limit(20).with_for_update(skip_locked=True))).scalars().all())
    notification_settings = await db.get(PerformanceNotificationSetting, 1) if rows else None
    for row in rows:
        row.attempts += 1
        try:
            async with db.begin_nested():
                task = await db.get(PerformanceNodeTask, row.task_id)
                project = await db.get(PerformanceProject, task.project_id)
                if notification_settings is not None and not notification_settings.feishu_push_enabled:
                    row.status = "skipped"
                    continue
                if task.status == "completed" or project.status != PROJECT_STATUS_STARTED:
                    row.status = "skipped"
                    continue
                await reconsideration_for_task(db, task)
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
            row.status = "retrying"
            row.last_error = str(exc)[:1000]
            row.next_retry_at = now + timedelta(minutes=min(2 ** min(row.attempts, 10), 1440))
    return len(rows), f"result reconsideration notifications processed: {len(rows)}"
