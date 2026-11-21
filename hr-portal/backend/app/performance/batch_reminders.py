from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from hashlib import sha256
import json
from types import SimpleNamespace
from typing import Annotated, Literal
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.integrations.feishu.models import FeishuNotificationLog
from app.performance.auth_context import (
    PERFORMANCE_PORTAL_ADMIN_PERMISSIONS, PerformanceAccessContext,
    load_active_authorization, resolve_performance_employee_no,
)
from app.scheduler.models import ScheduledJob
from app.users.models import User

KIND = "performance_reminder_batch"
CLAIM_KEY = "performance_reminder_batch_claim"
LOCK_KEY = 724106381


class ReminderSelection(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    is_select_all: bool
    selected_task_ids: list[Annotated[int, Field(strict=True, ge=1)]] = Field(max_length=100000)
    deselected_task_ids: list[Annotated[int, Field(strict=True, ge=1)]] = Field(max_length=100000)
    keyword: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_selection(self):
        if self.is_select_all and self.selected_task_ids:
            raise ValueError("select-all cannot include selected_task_ids")
        if not self.is_select_all and (self.deselected_task_ids or not self.selected_task_ids):
            raise ValueError("explicit selection requires selected_task_ids only")
        self.selected_task_ids = sorted(set(self.selected_task_ids))
        self.deselected_task_ids = sorted(set(self.deselected_task_ids))
        self.keyword = self.keyword or None
        return self


class ReminderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    cycle_id: int = Field(ge=1)
    node_key: str = Field(min_length=1, max_length=64)
    department: str | None = Field(default=None, max_length=256)
    result_kind: Literal["team"] | None = None
    skip_recently_reminded: bool
    request_id: UUID
    selection: ReminderSelection


async def reminder_projects(cycle_id, result_kind, context, db):
    from app.performance import projects_router as shared
    if result_kind == "team" and not context.management_role:
        from app.performance.result_view_scope import TEAM_RESULT_KIND, resolve_result_view_scope
        scope = await resolve_result_view_scope(db, context, cycle_id=cycle_id, kind=TEAM_RESULT_KIND)
        if not scope.employee_nos:
            raise HTTPException(403, "RESULT_VIEW_FORBIDDEN")
        return [(project, scope.scopes[project.id]) for project in scope.projects]
    return await shared._managed_completion_projects(cycle_id, context, db)


async def accept_request(payload, context, db):
    from app.identity_switch.service import current_switch
    from app.performance import projects_router as shared

    if payload.node_key not in {key for key, _ in shared._COMPLETION_NODE_DEFINITIONS} or payload.node_key == "view-result":
        raise HTTPException(422, "REMINDER_NODE_NOT_SUPPORTED")
    owner = {"subject_type": context.subject_type, "subject_id": context.subject_id,
        "management_role": context.management_role, "management_cycle_id": context.management_cycle_id,
        "management_project_id": context.management_project_id,
        "operator_user_id": context.operator_user_id, "switch_session_id": context.switch_session_id}
    request = payload.model_dump(mode="json")
    identity = {"subject_type": context.subject_type, "subject_id": context.subject_id,
        "operator_user_id": context.operator_user_id, "switch_session_id": context.switch_session_id}
    business_id = int.from_bytes(sha256(json.dumps([identity, str(payload.request_id)], sort_keys=True).encode()).digest()[:8], "big") & ((1 << 63) - 1)
    fingerprint = sha256(json.dumps([request, owner], sort_keys=True).encode()).hexdigest()
    existing = await db.scalar(select(ScheduledJob).where(ScheduledJob.kind == KIND, ScheduledJob.business_id == business_id))
    if existing is not None:
        if existing.payload.get("fingerprint") != fingerprint:
            raise HTTPException(409, "REMINDER_REQUEST_CONFLICT")
        return existing.id
    projects = await reminder_projects(payload.cycle_id, payload.result_kind, context, db)
    frozen = []
    for project, scope in projects:
        snapshot_id = await db.scalar(select(shared._latest_member_snapshot_statement(project.id)))
        if snapshot_id is not None:
            frozen.append({"project_id": project.id, "snapshot_id": snapshot_id,
                "employee_nos": sorted(scope) if scope is not None else None})
    switched = current_switch.get() is not None or bool(context.switch_session_id) or context.subject_type == "EMPLOYEE"
    state = {"owner": owner, "request": request, "fingerprint": fingerprint, "projects": frozen,
        "state": "skipped" if switched else "queued", "reason": "IDENTITY_SWITCH" if switched else None}
    statement = pg_insert(ScheduledJob).values(kind=KIND, business_id=business_id, cron="* * * * *",
        payload=state, enabled=not switched).on_conflict_do_nothing(index_elements=["kind", "business_id"]).returning(ScheduledJob.id)
    job_id = (await db.execute(statement)).scalar_one_or_none()
    if job_id is None:
        existing = await db.scalar(select(ScheduledJob).where(ScheduledJob.kind == KIND, ScheduledJob.business_id == business_id))
        if existing is None or existing.payload.get("fingerprint") != fingerprint:
            raise HTTPException(409, "REMINDER_REQUEST_CONFLICT")
        job_id = existing.id
    await db.commit()
    return job_id


async def load_owner(db, owner):
    from app.core.deps import user_has_op
    subject_type, subject_id = owner["subject_type"], owner["subject_id"]
    if owner.get("switch_session_id") or owner.get("operator_user_id") or subject_type != "PORTAL_USER":
        raise HTTPException(403, "REMINDER_OWNER_FORBIDDEN")
    user = await db.get(User, subject_id)
    if user is None or not user.is_active:
        raise HTTPException(403, "REMINDER_OWNER_INACTIVE")
    entries = []
    for code in ("performance.app", "performance.admin"):
        if await user_has_op(user, db, code, "V"):
            entries.append(code)
    entries = tuple(entries)
    if not entries:
        raise HTTPException(403, "REMINDER_OWNER_ENTRY_FORBIDDEN")
    grants, permissions = await load_active_authorization(db, subject_type, subject_id)
    if "performance.admin" in entries:
        permissions = tuple(dict.fromkeys((*permissions, *PERFORMANCE_PORTAL_ADMIN_PERMISSIONS)))
    context = PerformanceAccessContext(subject_type=subject_type, subject_id=subject_id, display_name=user.display_name,
        account_type=None, portal_entry_permissions=entries, role_grants=grants, permission_codes=permissions,
        management_role=owner.get("management_role"), management_cycle_id=owner.get("management_cycle_id"),
        management_project_id=owner.get("management_project_id"))
    await resolve_performance_employee_no(db, context)
    return context


async def eligible_rows(job, db, task_ids=None):
    from app.performance import projects_router as shared
    payload = job.payload
    request = payload["request"]
    context = await load_owner(db, payload["owner"])
    current = await reminder_projects(request["cycle_id"], request.get("result_kind"), context, db)
    frozen = {item["project_id"]: item for item in payload["projects"]}
    allowed = []
    for project, scope in current:
        fixed = frozen.get(project.id)
        if fixed is None or await db.scalar(select(shared._latest_member_snapshot_statement(project.id))) != fixed["snapshot_id"]:
            continue
        if fixed["employee_nos"] is not None:
            scope = set(fixed["employee_nos"]) if scope is None else set(scope) & set(fixed["employee_nos"])
        allowed.append((project, scope))
    selection = request["selection"]
    rows = await shared._completion_reminder_rows(request["cycle_id"], request["node_key"], context, db,
        selection.get("keyword"), request.get("department"), request.get("result_kind"),
        display_task_ids=set(), permitted_projects=allowed, candidate_task_ids=set(task_ids) if task_ids is not None else None,
        expected_snapshot_ids={key: value["snapshot_id"] for key, value in frozen.items()})
    explicit, excluded = set(selection["selected_task_ids"]), set(selection["deselected_task_ids"])
    return context, [row for row in rows if row["selectable"] and
        (row["task_id"] not in excluded if selection["is_select_all"] else row["task_id"] in explicit)]


async def prepare_next(job, db, run_id):
    from app.identity_switch.service import current_switch
    from app.performance import projects_router as shared
    from app.performance.models import PerformanceNodeTask, PerformanceProject, PerformanceProjectNodeSnapshot

    payload = deepcopy(job.payload)
    if current_switch.get() is not None:
        payload.update(state="skipped", reason="IDENTITY_SWITCH")
        job.payload, job.enabled = payload, False
        return False
    if payload.get("dispatch"):
        for item in payload["dispatch"]:
            payload.setdefault("outcomes", []).append({**item, "status": "unknown"})
        payload.pop("dispatch", None)
    done = {item["task_id"] for item in payload.get("outcomes", [])}
    pending = [value for value in payload.get("pending_task_ids", []) if value not in done]
    try:
        context, rows = await eligible_rows(job, db, pending[:100] if "pending_task_ids" in payload else None)
    except (HTTPException, ValueError) as exc:
        payload.update(state="skipped", reason=str(getattr(exc, "detail", exc)))
        job.payload, job.enabled = payload, False
        return False
    ids = [row["task_id"] for row in rows if row["task_id"] not in done]
    if "pending_task_ids" not in payload:
        pending = ids
        payload["pending_task_ids"] = ids
    valid = set(ids)
    for task_id in pending[:100]:
        if task_id not in valid:
            payload.setdefault("outcomes", []).append({"task_id": task_id, "status": "skipped"})
    if not ids and len(pending) > 100:
        payload["state"] = "queued"
        job.payload = payload
        return False
    if not ids:
        payload["state"] = "completed"
        job.payload, job.enabled = payload, False
        return False
    tasks = (await db.execute(select(PerformanceNodeTask, PerformanceProjectNodeSnapshot, PerformanceProject)
        .join(PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id)
        .join(PerformanceProject, PerformanceProject.id == PerformanceNodeTask.project_id)
        .where(PerformanceNodeTask.id.in_(ids), PerformanceNodeTask.revoked_at.is_(None))
        .order_by(PerformanceNodeTask.id))).all()
    recent = set()
    if payload["request"]["skip_recently_reminded"]:
        recent = set((await db.execute(select(FeishuNotificationLog.biz_id).where(
            FeishuNotificationLog.biz_type == "performance_task_reminder", FeishuNotificationLog.biz_id.in_([str(value) for value in ids]),
            FeishuNotificationLog.is_test.is_(False), FeishuNotificationLog.status == "success",
            FeishuNotificationLog.created_at >= datetime.now(UTC) - timedelta(hours=6),
        ))).scalars().all())
    handlers_by_id = {row["task_id"]: row["eligible_handlers"] for row in rows}
    groups = {}
    for task, node, project in tasks:
        if str(task.id) in recent:
            payload.setdefault("outcomes", []).append({"task_id": task.id, "status": "skipped", "reason": "RECENTLY_REMINDED"})
            continue
        handlers = handlers_by_id[task.id]
        key = (project.id, node.id, tuple(sorted(handlers)), getattr(task, "phase_id", ""))
        groups.setdefault(key, []).append(task.id)
    if not groups:
        payload["state"] = "queued"
        job.payload = payload
        return False
    task_ids = next(iter(groups.values()))[:100]
    payload["dispatch"] = [{"task_id": task_id} for task_id in task_ids]
    payload["dispatch_run_id"] = run_id
    payload["state"] = "dispatching"
    job.payload = payload
    db.info[CLAIM_KEY] = {"job_id": job.id, "run_id": run_id, "task_ids": task_ids, "context": context}
    return True


async def dispatch(job, db):
    from app.identity_switch.service import current_switch
    from app.performance import projects_router as shared
    from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
    from app.performance.models import PerformanceNodeTask, PerformanceProject, PerformanceProjectNodeSnapshot
    claim = db.info.get(CLAIM_KEY)
    if claim is None or claim["job_id"] != job.id or claim["run_id"] != job.payload.get("dispatch_run_id"):
        raise RuntimeError("Batch reminders require an engine-owned persisted dispatch")
    if current_switch.get() is not None:
        raise RuntimeError("Identity-switch delivery is forbidden")
    context, rows = await eligible_rows(job, db, claim["task_ids"])
    eligible = {row["task_id"] for row in rows}
    handlers_by_id = {row["task_id"]: row["eligible_handlers"] for row in rows}
    payload = deepcopy(job.payload)
    ids = [value for value in claim["task_ids"] if value in eligible]
    tasks = (await db.execute(select(PerformanceNodeTask, PerformanceProjectNodeSnapshot, PerformanceProject)
        .join(PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id)
        .join(PerformanceProject, PerformanceProject.id == PerformanceNodeTask.project_id)
        .where(PerformanceNodeTask.id.in_(ids), PerformanceNodeTask.revoked_at.is_(None)))).all() if ids else []
    recent = set()
    if payload["request"]["skip_recently_reminded"] and ids:
        recent = set((await db.execute(select(FeishuNotificationLog.biz_id).where(
            FeishuNotificationLog.biz_type == "performance_task_reminder", FeishuNotificationLog.biz_id.in_([str(value) for value in ids]),
            FeishuNotificationLog.is_test.is_(False), FeishuNotificationLog.status == "success",
            FeishuNotificationLog.created_at >= datetime.now(UTC) - timedelta(hours=6),
        ))).scalars().all())
    candidates = []
    expected_handlers = None
    for task, node, project in tasks:
        handlers = tuple(sorted(handlers_by_id[task.id]))
        if str(task.id) in recent or (expected_handlers is not None and handlers != expected_handlers):
            eligible.discard(task.id)
            continue
        if node.node_type == "result_reconsideration" and not await shared._completion_reconsideration_valid(db, task, lock=True):
            eligible.discard(task.id)
            continue
        expected_handlers = handlers
        candidates.append((task, node, project))
    outcomes = []
    if candidates:
        task, node, project = candidates[0]
        for handler in expected_handlers or ():
            notification_task = SimpleNamespace(**{key: getattr(task, key, None) for key in
                ("id", "member_snapshot_id", "target_employee_no", "task_kind", "phase_id", "available_at", "due_at")}, handler_ref=handler)
            sent, error = await shared._send_performance_task_reminder(notification_task, project, node, context, db)
            outcomes.append((sent, error))
            if sent and len(candidates) > 1:
                source = await db.scalar(select(FeishuNotificationLog).where(
                    FeishuNotificationLog.biz_type == "performance_task_reminder", FeishuNotificationLog.biz_id == str(task.id),
                    FeishuNotificationLog.status == "success", FeishuNotificationLog.is_test.is_(False),
                ).order_by(FeishuNotificationLog.id.desc()).limit(1))
                if source is not None:
                    for related, _, _ in candidates[1:]:
                        db.add(FeishuNotificationLog(**{column.name: deepcopy(getattr(source, column.name))
                            for column in FeishuNotificationLog.__table__.columns
                            if column.name not in {"id", "biz_id", "created_at"}}, biz_id=str(related.id)))
    status = "success" if outcomes and all(item[0] for item in outcomes) else "preview_only" if outcomes and all(item[0] or item[1] == "NOTIFICATION_PREVIEW_ONLY" for item in outcomes) else "failed"
    processed = {task.id for task, _, _ in candidates}
    if status == "success":
        actor = await shared.resolve_trusted_performance_actor(db, context)
        for task, node, project in candidates:
            PerformanceAuditService(db).append_event(AuditEventInput(
                event_type="PERFORMANCE_TASK_REMINDER_REQUESTED", cycle_ref=project.cycle_ref,
                employee_no=task.target_employee_no, actor_type=actor.actor_type, actor_ref=actor.actor_ref,
                subject_type="PERFORMANCE_NODE_TASK", subject_ref=str(task.id),
                after_state={"action": "remind", "node_id": node.node_id, "delivery_status": "sent", "job_id": job.id},
            ))
    for task_id in claim["task_ids"]:
        payload.setdefault("outcomes", []).append({"task_id": task_id,
            "status": status if task_id in processed else "skipped"})
    payload.pop("dispatch", None)
    payload["state"] = "queued"
    job.payload = payload
    await db.flush()
    return len(processed), f"batch reminders: processed={len(processed)}, status={status}"
