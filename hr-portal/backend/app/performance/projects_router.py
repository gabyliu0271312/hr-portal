"""Performance project configuration API."""
from __future__ import annotations

from datetime import UTC, datetime, date
from typing import Literal
from types import SimpleNamespace

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import PerformanceAccessContext, PerformanceIdentityMappingNotFound, get_performance_access_context, performance_admin_preview_enabled, resolve_trusted_performance_actor
from app.performance.authorization_service import AuditEventInput, ObjectAuthorizationRequest, PerformanceAuditService, PerformanceObjectAuthorizationDenied, PerformanceObjectAuthorizationService
from app.performance.assessment_roles import MANAGER_ROLE_CODES, ROLE_METRIC_EVALUATOR, ROLE_REVIEWEE, ROLE_REVIEWER_360, node_role_code
from app.performance.calibration_service import calibration_task_scope
from app.performance.cycle_service import PerformanceCycleService
from app.performance.models import PerformanceAuditEvent, PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson, PerformanceCycle, PerformanceHrbpPermission, PerformanceIdentityLink, PerformanceNodeTask, PerformanceNodeTaskAuthorization, PerformanceOtherPermissionSetting, PerformanceOtherSetting, PerformanceProject, PerformanceProjectMember, PerformanceProjectMemberSnapshot, PerformanceProjectNodeSnapshot, PerformanceResultOpening, PerformanceRole, PerformanceRoleAssignment, PerformanceTemplate, PerformanceTemplateWorkflow, PROJECT_STATUS_STARTED
from app.integrations.feishu.notification_service import send_notification
from app.integrations.feishu.schemas import FixedUsersRule, MessageConfig, NotificationConfig
from app.users.models import User
from app.performance.self_summary_service import build_self_summary_schema, hydrate_self_summary_template, iter_self_summary_field_instances, project_reference_content, project_result_view_contents, project_self_summary_answers, resolve_self_summary_content, sanitize_self_summary_answers, self_summary_field_requires_value, self_summary_instance_unknown, self_summary_value_empty
from app.performance.subject_visibility_service import load_subject_visibility_rules, mask_profile_values, resolve_subject_visibility_role, subject_profile_items
from app.data.employee_roster_contract import format_job_sequence, organization_leaf
from app.performance.project_service import PerformanceProjectService, ProjectValidationError, _parse_time
from app.performance.navigation_service import cycle_payload, project_payload, resolve_frontend_access, review_node_category
from app.performance.task_authorization_service import effective_handlers, task_handler_condition

router = APIRouter(prefix="/performance", tags=["performance-projects"])


def _is_admin_preview(context: PerformanceAccessContext) -> bool:
    return performance_admin_preview_enabled(context)


class SelfSummaryAnswersPayload(BaseModel):
    answers: dict = Field(default_factory=dict)
    version: int | None = Field(default=None, ge=1)


class TaskDraftVersionPayload(BaseModel):
    version: int = Field(ge=1)


class ResultOpeningBatchPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    employee_nos: list[str] = Field(min_length=1, max_length=500)


class ResultOpeningPerson(BaseModel):
    employee_no: str
    display_name: str
    project_id: int
    project_name: str
    can_open: bool
    unavailable_reason: str | None = None


class ResultOpeningPeoplePage(BaseModel):
    items: list[ResultOpeningPerson]
    total: int
    page: int
    page_size: int


class ResultOpeningBatchResponse(BaseModel):
    accepted_employee_nos: list[str]
    skipped_employee_nos: list[str]
    skipped_reasons: dict[str, str]
    notification_status: Literal["pending_integration"] = "pending_integration"


class ReminderTasksPayload(BaseModel):
    node_id: str = Field(min_length=1, max_length=128)
    task_ids: list[int] = Field(min_length=1, max_length=500)


class CycleReminderTasksPayload(BaseModel):
    cycle_id: int = Field(ge=1)
    node_key: str = Field(min_length=1, max_length=64)
    task_ids: list[int] = Field(min_length=1, max_length=500)


class PerformanceTaskAuthorizationPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["AUTHORIZE", "TRANSFER"]
    recipient_employee_no: str = Field(min_length=1, max_length=64)
    reason: str = Field(default="", max_length=1000)
    scope_mode: Literal["PARTIAL", "ALL"] = "ALL"
    scope_kind: Literal["DIRECT_SUBORDINATES", "DEPARTMENT", "PEOPLE"] = "PEOPLE"
    selected_employee_nos: list[str] = Field(default_factory=list, max_length=1000)
    department_paths: list[str] = Field(default_factory=list, max_length=100)
    distribution_mode: Literal["INHERIT", "NONE"] = "INHERIT"
    allow_reauthorize: bool = False
    notify_original: bool = False


async def _task_delegations(db: AsyncSession, task_id: int) -> list[PerformanceNodeTaskAuthorization]:
    return list((await db.execute(select(PerformanceNodeTaskAuthorization).where(
        PerformanceNodeTaskAuthorization.task_id == task_id,
        PerformanceNodeTaskAuthorization.status == "ACTIVE",
    ).order_by(PerformanceNodeTaskAuthorization.created_at, PerformanceNodeTaskAuthorization.id))).scalars().all())


async def _task_handlers(db: AsyncSession, task: PerformanceNodeTask) -> set[str]:
    return effective_handlers(task.handler_ref, await _task_delegations(db, task.id))


async def _task_handler_allowed(db: AsyncSession, task: PerformanceNodeTask, actor_ref: str) -> bool:
    return str(actor_ref) in await _task_handlers(db, task)


async def _task_edit_allowed(db: AsyncSession, task: PerformanceNodeTask, actor_ref: str) -> bool:
    active = await _task_delegations(db, task.id)
    transfers = [item for item in active if item.authorization_type == "TRANSFER"]
    if not transfers and str(task.handler_ref) == str(actor_ref):
        return True
    return any(item.recipient_employee_no == str(actor_ref) and not item.read_only for item in active)


async def _self_summary_task(task_id: int, actor: PerformanceAccessContext, db: AsyncSession, task_kind: str = "work_summary", target_employee_no: str | None = None) -> tuple[PerformanceNodeTask, PerformanceProjectNodeSnapshot]:
    row = (await db.execute(select(PerformanceNodeTask, PerformanceProjectNodeSnapshot).join(PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id).where(PerformanceNodeTask.id == task_id))).first()
    if not row:
        raise HTTPException(status_code=404, detail="TASK_NOT_FOUND")
    try:
        trusted = await resolve_trusted_performance_actor(db, actor, cycle_ref=row[0].cycle_ref, require_employee_identity=True)
    except PerformanceIdentityMappingNotFound:
        raise HTTPException(status_code=404, detail="TASK_NOT_FOUND") from None
    if not await _task_handler_allowed(db, row[0], trusted.actor_ref):
        raise HTTPException(status_code=404, detail="TASK_NOT_FOUND")
    allowed_kinds = {"evaluation", "calibration", "result_communication"} if task_kind == "evaluation" else {task_kind}
    if row[0].task_kind not in allowed_kinds:
        raise HTTPException(status_code=422, detail="TASK_TYPE_NOT_SUPPORTED")
    if target_employee_no and target_employee_no != row[0].target_employee_no:
        target_query = select(PerformanceNodeTask, PerformanceProjectNodeSnapshot).join(PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id).where(
            PerformanceNodeTask.node_snapshot_id == row[0].node_snapshot_id,
            PerformanceNodeTask.target_employee_no == target_employee_no,
            PerformanceNodeTask.task_kind == row[0].task_kind,
            PerformanceNodeTask.project_id == row[0].project_id,
            PerformanceNodeTask.member_snapshot_id == row[0].member_snapshot_id,
            PerformanceNodeTask.phase_id == (getattr(row[0], "phase_id", "") or ""),
        )
        target_rows = (await db.execute(target_query)).all()
        row = None
        for candidate in target_rows:
            if await _task_handler_allowed(db, candidate[0], trusted.actor_ref):
                row = candidate
                break
        if not row:
            raise HTTPException(status_code=404, detail="TASK_NOT_FOUND")
    if row[0].task_kind == "calibration":
        if not calibration_task_scope(row[0], row[1]):
            raise HTTPException(status_code=404, detail="TASK_NOT_FOUND")
        try:
            await PerformanceObjectAuthorizationService(db).authorize(ObjectAuthorizationRequest(cycle_ref=row[0].cycle_ref, employee_no=row[0].target_employee_no, actor_type="EMPLOYEE", actor_ref=trusted.actor_ref, action="CALIBRATE", cycle_status="ACTIVE", node_status="OPEN", record_status="DRAFT", project_id=row[0].project_id, node_id=row[1].node_id, phase_id=row[0].phase_id))
        except PerformanceObjectAuthorizationDenied:
            raise HTTPException(status_code=404, detail="TASK_NOT_FOUND") from None
    return row[0], row[1]


def _node_timing(project: PerformanceProject | None, node: PerformanceProjectNodeSnapshot) -> dict | None:
    configured = (((project.settings or {}).get("flow_settings") or {}).get("node_times") or {}) if project else {}
    if node.node_id in configured:
        return configured[node.node_id] or {}
    return (node.config or {}).get("time")


def _task_window(task: PerformanceNodeTask, node: PerformanceProjectNodeSnapshot, project: PerformanceProject | None) -> tuple[datetime | None, datetime | None]:
    if getattr(task, "task_kind", None) == "calibration":
        timing = _node_timing(project, node) or {}
        phase = (timing.get("phase_times") or {}).get(task.phase_id)
        if phase is not None:
            return _parse_time(phase.get("start_at")), _parse_time(phase.get("end_at"))
        return task.available_at, task.due_at
    timing = _node_timing(project, node)
    if timing is None:
        return task.available_at, task.due_at
    return _parse_time(timing.get("start_at")), _parse_time(timing.get("end_at") or timing.get("appeal_deadline"))


def _task_is_available(task: PerformanceNodeTask, node: PerformanceProjectNodeSnapshot, project: PerformanceProject | None, now: datetime | None = None) -> bool:
    available_at, _ = _task_window(task, node, project)
    return available_at is None or (now or datetime.now(UTC)) >= available_at


def _self_summary_state(task: PerformanceNodeTask, available_at: datetime | None, due_at: datetime | None, overdue_allowed: bool = True) -> tuple[bool, bool]:
    now = datetime.now(UTC)
    if available_at is not None and now < available_at:
        return False, False
    overdue = due_at is not None and now > due_at
    submitted = task.submitted_at is not None
    if overdue and (submitted or not overdue_allowed):
        return False, False
    return True, True


async def _overdue_submission_allowed(task: PerformanceNodeTask, node: PerformanceProjectNodeSnapshot, db: AsyncSession) -> bool:
    cycle_ref = getattr(task, "cycle_ref", None)
    if not cycle_ref:
        return True
    cycle = await db.scalar(select(PerformanceCycle).where(PerformanceCycle.cycle_ref == cycle_ref))
    if cycle is None:
        return True
    global_setting = await db.get(PerformanceOtherSetting, 1)
    if global_setting is not None and not getattr(global_setting, "overdue_single_submission_enabled", True):
        return False
    if global_setting is not None and global_setting.cycle_overdue_submission_override_enabled and not getattr(cycle, "overdue_submission_enabled", True):
        scope = getattr(cycle, "overdue_submission_scope", "EVALUATION")
        scope_matches = scope == "ALL" or (scope == "EVALUATION" and getattr(node, "node_type", None) == "evaluation")
        if scope_matches:
            return False
    return True


async def _self_summary_template(task: PerformanceNodeTask, node: PerformanceProjectNodeSnapshot, db: AsyncSession) -> dict:
    template = (node.config or {}).get("template") or {}
    if not template.get("content") and getattr(node, "node_type", None) != "calibration":
        project = await db.get(PerformanceProject, task.project_id)
        template_id = (project.settings or {}).get("template_id") if project else None
        workflow = await db.get(PerformanceTemplateWorkflow, int(template_id)) if template_id else None
        current_node = next((item for item in (workflow.nodes if workflow else []) if item.get("node_id") == node.node_id), None)
        template = resolve_self_summary_content(current_node or template, list((workflow.content_library if workflow else []) or []))
    return await hydrate_self_summary_template(template, db)


async def _reference_template(task: PerformanceNodeTask | None, node: PerformanceProjectNodeSnapshot, project: PerformanceProject, db: AsyncSession) -> dict:
    if task is not None:
        return await _self_summary_template(task, node, db)
    template = (node.config or {}).get("template") or {}
    if not template.get("content"):
        template_id = (project.settings or {}).get("template_id")
        workflow = await db.get(PerformanceTemplateWorkflow, int(template_id)) if template_id else None
        current_node = next((item for item in (workflow.nodes if workflow else []) if item.get("node_id") == node.node_id), None)
        template = resolve_self_summary_content(current_node or template, list((workflow.content_library if workflow else []) or []))
    return await hydrate_self_summary_template(template, db)


_DEFAULT_REMINDER_NODE_TYPES = {"work_summary", "evaluation", "result_communication", "result_view"}


def _reference_status(task: PerformanceNodeTask | None, node: PerformanceProjectNodeSnapshot, project: PerformanceProject) -> str:
    if task is not None and _task_completed(task):
        return "completed"
    if task is not None:
        available_at, due_at = _task_window(task, node, project)
    else:
        timing = _node_timing(project, node) or {}
        available_at = _parse_time(timing.get("start_at"))
        due_at = _parse_time(timing.get("end_at") or timing.get("appeal_deadline"))
    now = datetime.now(UTC)
    if available_at is not None and now < available_at:
        return "not_started"
    if due_at is not None and now > due_at:
        return "overdue"
    return "pending"


def _task_content_page_name(node: PerformanceProjectNodeSnapshot) -> str:
    template = (node.config or {}).get("template") or {}
    return template.get("content_page_name") or node.name


async def _reference_tabs(
    task: PerformanceNodeTask,
    node: PerformanceProjectNodeSnapshot,
    project: PerformanceProject,
    actor_ref: str,
    db: AsyncSession,
) -> list[dict]:
    template = await _self_summary_template(task, node, db)
    references = []
    seen_node_ids: set[str] = set()
    for content in template.get("content") or []:
        if (content.get("content_slot") or "fill") != "reference":
            continue
        if content.get("reference_kind") != "node":
            continue
        reference_node_id = str(content.get("reference_value") or "").strip()
        if not reference_node_id or reference_node_id in seen_node_ids or reference_node_id == node.node_id:
            continue
        seen_node_ids.add(reference_node_id)
        references.append(reference_node_id)
    if not references:
        return []

    node_rows = (await db.execute(
        select(PerformanceProjectNodeSnapshot).where(
            PerformanceProjectNodeSnapshot.project_id == project.id,
            PerformanceProjectNodeSnapshot.node_id.in_(references),
        )
    )).scalars().all()
    nodes_by_id = {item.node_id: item for item in node_rows}
    setting = await db.get(PerformanceOtherPermissionSetting, 1)
    reminder_enabled = setting.manager_reminder_enabled if setting is not None else True
    reminder_node_types = set(setting.manager_reminder_node_types) if setting is not None else set(_DEFAULT_REMINDER_NODE_TYPES)
    current_template = (node.config or {}).get("template") or {}
    current_role_code = node_role_code(current_template)
    viewer_can_remind = (
        str(task.handler_ref) == actor_ref
        and str(task.target_employee_no) != actor_ref
        and (node.node_type == "calibration" or current_role_code in MANAGER_ROLE_CODES)
    )
    result: list[dict] = []
    for reference_node_id in references:
        reference_node = nodes_by_id.get(reference_node_id)
        if reference_node is None:
            continue
        source_task = (await db.execute(
            select(PerformanceNodeTask)
            .where(
                PerformanceNodeTask.project_id == project.id,
                PerformanceNodeTask.member_snapshot_id == task.member_snapshot_id,
                PerformanceNodeTask.node_snapshot_id == reference_node.id,
                PerformanceNodeTask.target_employee_no == task.target_employee_no,
            )
            .order_by(PerformanceNodeTask.id)
        )).scalars().all()
        source = next((item for item in source_task if _task_completed(item)), None) or (source_task[0] if source_task else None)
        status = _reference_status(source, reference_node, project)
        completed = status == "completed"
        relation = next((
            item for item in template.get("content") or []
            if (item.get("content_slot") or "fill") == "reference"
            and item.get("reference_kind") == "node"
            and str(item.get("reference_value") or "").strip() == reference_node_id
        ), {})
        if completed and source is not None:
            _, visible_answers = await _task_visible_content(source, reference_node, db)
            source_template = await _self_summary_template(source, reference_node, db)
            schema, visible_answers = project_reference_content(source_template, relation, visible_answers)
        else:
            schema, visible_answers = [], {}
        result.append({
            "key": f"reference-{reference_node.node_id}",
            "node_id": reference_node.node_id,
            "node_name": reference_node.name,
            "task_id": source.id if source is not None else None,
            "employee_no": task.target_employee_no,
            "status": status,
            "submitted_at": source.submitted_at if completed and source is not None else None,
            "form_schema": schema,
            "answers": visible_answers,
            "can_remind": bool(
                source is not None
                and not completed
                and reminder_enabled
                and reference_node.node_type in reminder_node_types
                and viewer_can_remind
            ),
        })
    return result


async def _task_visible_content(task: PerformanceNodeTask, node: PerformanceProjectNodeSnapshot, db: AsyncSession, *, filling: bool = False) -> tuple[list[dict], dict]:
    template = await _self_summary_template(task, node, db)
    schema = build_self_summary_schema(template, include_prompts=True, filling=filling)
    answers = project_self_summary_answers(schema, task.answers or {})
    readonly_sections = [section for section in schema if any(field.get("readonly") for field in section["fields"])]
    if not readonly_sections or node.node_type != "evaluation":
        return schema, answers
    sources = (await db.execute(select(PerformanceProjectNodeSnapshot).where(
        PerformanceProjectNodeSnapshot.project_id == task.project_id,
        PerformanceProjectNodeSnapshot.node_type == "work_summary",
    ))).scalars().all()
    if len(sources) != 1:
        return schema, answers
    source_node = sources[0]
    candidates = (await db.execute(select(PerformanceNodeTask).where(
        PerformanceNodeTask.project_id == task.project_id,
        PerformanceNodeTask.cycle_ref == task.cycle_ref,
        PerformanceNodeTask.member_snapshot_id == task.member_snapshot_id,
        PerformanceNodeTask.node_snapshot_id == source_node.id,
        PerformanceNodeTask.target_employee_no == task.target_employee_no,
        PerformanceNodeTask.task_kind == "work_summary",
    ))).scalars().all()
    if len(candidates) != 1 or candidates[0].status != "completed" or candidates[0].submitted_at is None:
        return schema, answers
    source_task = candidates[0]
    source_schema = build_self_summary_schema(await _self_summary_template(source_task, source_node, db))
    source_by_id = {section["id"]: section for section in source_schema}
    for section in readonly_sections:
        source_section = source_by_id.get(section["id"])
        if source_section is None:
            continue
        source_fields = {field["id"]: field for field in source_section["fields"] if not field.get("readonly")}
        for field in section["fields"]:
            source_field = source_fields.get(field["id"])
            if not field.get("readonly") or source_field is None or source_field["type"] != field["type"]:
                continue
            if bool(section.get("allow_multiple")) != bool(source_section.get("allow_multiple")):
                continue
            if {str(option["id"]) for option in field.get("options") or []} != {str(option["id"]) for option in source_field.get("options") or []}:
                continue
            source_answers = project_self_summary_answers([{**section, "fields": [field]}], source_task.answers or {}, include_readonly=True)
            answers.update(source_answers)
    return schema, answers


async def _template_task_detail(task: PerformanceNodeTask, node: PerformanceProjectNodeSnapshot, context: PerformanceAccessContext, db: AsyncSession):
    project = await db.get(PerformanceProject, task.project_id)
    available_at, due_at = _task_window(task, node, project)
    overdue_allowed = False if getattr(task, "task_kind", None) == "calibration" else await _overdue_submission_allowed(task, node, db)
    editable, submit_allowed = _self_summary_state(task, available_at, due_at, overdue_allowed)
    schema, answers = await _task_visible_content(task, node, db, filling=editable and submit_allowed)
    member = await db.scalar(select(PerformanceProjectMember).where(
        PerformanceProjectMember.snapshot_id == task.member_snapshot_id,
        PerformanceProjectMember.employee_no == task.target_employee_no,
    ))
    direct_supervisor_name = None
    if member and getattr(member, "direct_supervisor_employee_no", None):
        direct_supervisor_name = await db.scalar(select(PerformanceProjectMember.display_name).where(
            PerformanceProjectMember.snapshot_id == task.member_snapshot_id,
            PerformanceProjectMember.employee_no == member.direct_supervisor_employee_no,
        ))
    try:
        actor = await resolve_trusted_performance_actor(db, context)
        actor_ref = str(actor.actor_ref)
    except (AttributeError, AssertionError, IndexError):
        actor_ref = str(getattr(task, "handler_ref", context.subject_id))
    if isinstance(task, PerformanceNodeTask) and not await _task_edit_allowed(db, task, actor_ref):
        editable, submit_allowed = False, False
    visibility_role = await resolve_subject_visibility_role(db, context, actor_ref, member, node, project)
    visible_fields = (await load_subject_visibility_rules(db))[visibility_role]
    return {
        "task_id": task.id,
        "project_id": task.project_id,
        "node_id": node.node_id,
        "return_view": "page" if task.task_kind == "calibration" else ("node" if task.task_kind == "work_summary" or node_role_code({"node_type": getattr(node, "node_type", task.task_kind), **((node.config or {}).get("template") or {})}) == ROLE_REVIEWEE else "drawer"),
        "task_kind": task.task_kind,
        "executor_role_code": ((node.config or {}).get("template") or {}).get("executor_role_code"),
        "phase_id": getattr(task, "phase_id", "") or None,
        "entry_mode": _task_entry_mode(task),
        "node_name": node.name,
        "content_page_name": _task_content_page_name(node),
        "deadline_at": due_at,
        "submitted_at": task.submitted_at,
        "editable": editable,
        "submit_allowed": submit_allowed,
        "submission_count": 1 if task.submitted_at else 0,
        "version": task.answer_version,
        "person": {
            "employee_no": task.target_employee_no,
            "display_name": member.display_name if member else task.target_employee_no,
            "department": organization_leaf(member) if member and "department" in visible_fields else None,
            "direct_supervisor_name": direct_supervisor_name if "direct_supervisor" in visible_fields else None,
            "visibility_role": visibility_role,
            "profile_fields": subject_profile_items(
                member,
                visible_fields,
                direct_supervisor_name=direct_supervisor_name,
            ),
        },
        "form_schema": schema,
        "answers": answers,
        "has_draft": getattr(task, "draft_answers", None) is not None,
        "draft_answers": project_self_summary_answers(schema, getattr(task, "draft_answers", None) or {}),
        "prompts": [],
        "calibration_notice": "绩效校准人修改评估内容后会产生修改记录" if task.task_kind == "calibration" else None,
        "reference_tabs": await _reference_tabs(task, node, project, actor_ref, db),
    }


@router.get("/tasks/{task_id}/self-summary")
async def get_self_summary(task_id: int, context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session), employee_no: str | None = Query(default=None)):
    task_args = (task_id, context, db)
    if employee_no:
        task_args = (*task_args, "work_summary", employee_no)
    task, node = await _self_summary_task(*task_args)
    return await _template_task_detail(task, node, context, db)


@router.get("/tasks/{task_id}/template-task")
async def get_template_task(task_id: int, context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session), employee_no: str | None = Query(default=None)):
    task_args = (task_id, context, db, "evaluation")
    if employee_no:
        task_args = (*task_args, employee_no)
    task, node = await _self_summary_task(*task_args)
    return await _template_task_detail(task, node, context, db)


async def _save_self_summary(task_id: int, payload: SelfSummaryAnswersPayload, submit: bool, context: PerformanceAccessContext, db: AsyncSession, task_kind: str = "work_summary", target_employee_no: str | None = None):
    task, node = await _self_summary_task(task_id, context, db, task_kind, target_employee_no)
    actor = SimpleNamespace(actor_type="EMPLOYEE" if context.effective_employee_no else context.subject_type, actor_ref=context.effective_employee_no or str(context.subject_id))
    if isinstance(task, PerformanceNodeTask):
        trusted = await resolve_trusted_performance_actor(db, context, cycle_ref=task.cycle_ref, require_employee_identity=True)
        actor = trusted
        await db.refresh(task, with_for_update=True)
        if not await _task_edit_allowed(db, task, trusted.actor_ref):
            raise HTTPException(status_code=403, detail="TASK_AUTHORIZATION_READ_ONLY")
    project = await db.get(PerformanceProject, task.project_id)
    available_at, due_at = _task_window(task, node, project)
    overdue_allowed = False if getattr(task, "task_kind", None) == "calibration" else await _overdue_submission_allowed(task, node, db)
    editable, submit_allowed = _self_summary_state(task, available_at, due_at, overdue_allowed)
    if not editable or (submit and not submit_allowed):
        raise HTTPException(status_code=409, detail="SUBMISSION_NOT_ALLOWED")
    if payload.version is not None and payload.version != task.answer_version:
        raise HTTPException(status_code=409, detail="VERSION_CONFLICT")
    template = await _self_summary_template(task, node, db)
    schema = build_self_summary_schema(template)
    current_draft = getattr(task, "draft_answers", None)
    incoming_answers = payload.answers if submit else {**(current_draft if current_draft is not None else task.answers or {}), **payload.answers}
    answers = sanitize_self_summary_answers(schema, incoming_answers)
    if submit:
        for section, field, index, value in iter_self_summary_field_instances(schema, answers):
            if self_summary_instance_unknown(section, answers, index):
                continue
            if self_summary_field_requires_value(field, value) and self_summary_value_empty(field, value):
                raise HTTPException(status_code=400, detail={"code": "VALIDATION_FAILED", "field_id": field["id"]})
    writable_ids = {field["id"] for section in schema for field in section["fields"] if not field.get("readonly")}
    before_answers = dict((task.answers if submit else current_draft) or {})
    if submit:
        task.answers = {**{key: value for key, value in (task.answers or {}).items() if key not in writable_ids}, **answers}
        task.draft_answers = None
    else:
        task.draft_answers = answers if answers != project_self_summary_answers(schema, task.answers or {}) else None
    if getattr(task, "task_kind", None) == "calibration":
        PerformanceAuditService(db).append_event(AuditEventInput(event_type="CALIBRATION_ADJUSTED" if submit else "CALIBRATION_DRAFT_SAVED", cycle_ref=task.cycle_ref, employee_no=task.target_employee_no, actor_type=actor.actor_type, actor_ref=actor.actor_ref, subject_type="PERFORMANCE_NODE_TASK", subject_ref=str(task.id), before_state={"answers": before_answers}, after_state={"answers": task.answers if submit else task.draft_answers, "project_id": task.project_id, "node_id": node.node_id, "phase_id": task.phase_id}))
    if isinstance(task, PerformanceNodeTask) and task.task_kind != "calibration":
        PerformanceAuditService(db).append_event(AuditEventInput(
            event_type="PERFORMANCE_TASK_SUBMITTED" if submit else "PERFORMANCE_TASK_DRAFT_SAVED",
            cycle_ref=task.cycle_ref, employee_no=task.target_employee_no,
            actor_type=actor.actor_type, actor_ref=actor.actor_ref,
            subject_type="PERFORMANCE_NODE_TASK", subject_ref=str(task.id),
            before_state={"version": task.answer_version},
            after_state={"project_id": task.project_id, "node_id": node.node_id, "version": task.answer_version + 1},
        ))
    task.answer_version += 1
    if submit:
        task.submitted_at = datetime.now(UTC)
        task.status = "completed"
        task.completed_at = task.submitted_at
        if project is not None:
            await _sync_automatic_openings(db, project)
    await db.commit()
    editable, submit_allowed = _self_summary_state(task, available_at, due_at, overdue_allowed)
    return {"answers": project_self_summary_answers(schema, task.answers), "has_draft": task.draft_answers is not None, "version": task.answer_version, "submitted_at": task.submitted_at, "editable": editable, "submit_allowed": submit_allowed}


@router.patch("/tasks/{task_id}/self-summary/draft")
async def save_self_summary_draft(task_id: int, payload: SelfSummaryAnswersPayload, context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session), employee_no: str | None = Query(default=None)):
    return await _save_self_summary(task_id, payload, False, context, db, target_employee_no=employee_no)


@router.post("/tasks/{task_id}/self-summary/submit")
async def submit_self_summary(task_id: int, payload: SelfSummaryAnswersPayload, context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session), employee_no: str | None = Query(default=None)):
    return await _save_self_summary(task_id, payload, True, context, db, target_employee_no=employee_no)


@router.patch("/tasks/{task_id}/template-task/draft")
async def save_template_task_draft(task_id: int, payload: SelfSummaryAnswersPayload, context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session), employee_no: str | None = Query(default=None)):
    return await _save_self_summary(task_id, payload, False, context, db, "evaluation", employee_no)


@router.post("/tasks/{task_id}/template-task/submit")
async def submit_template_task(task_id: int, payload: SelfSummaryAnswersPayload, context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session), employee_no: str | None = Query(default=None)):
    return await _save_self_summary(task_id, payload, True, context, db, "evaluation", employee_no)


@router.delete("/tasks/{task_id}/self-summary/draft")
async def discard_self_summary_draft(task_id: int, payload: TaskDraftVersionPayload, context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session), employee_no: str | None = Query(default=None)):
    return await _discard_task_draft(task_id, payload, context, db, "work_summary", employee_no)


@router.delete("/tasks/{task_id}/template-task/draft")
async def discard_template_task_draft(task_id: int, payload: TaskDraftVersionPayload, context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session), employee_no: str | None = Query(default=None)):
    return await _discard_task_draft(task_id, payload, context, db, "evaluation", employee_no)


async def _discard_task_draft(task_id: int, payload: TaskDraftVersionPayload, context: PerformanceAccessContext, db: AsyncSession, task_kind: str, employee_no: str | None):
    task, node = await _self_summary_task(task_id, context, db, task_kind, employee_no)
    actor = SimpleNamespace(actor_type="EMPLOYEE" if context.effective_employee_no else context.subject_type, actor_ref=context.effective_employee_no or str(context.subject_id))
    if isinstance(task, PerformanceNodeTask):
        trusted = await resolve_trusted_performance_actor(db, context, cycle_ref=task.cycle_ref, require_employee_identity=True)
        actor = trusted
        await db.refresh(task, with_for_update=True)
        if not await _task_edit_allowed(db, task, trusted.actor_ref):
            raise HTTPException(status_code=403, detail="TASK_AUTHORIZATION_READ_ONLY")
    project = await db.get(PerformanceProject, task.project_id)
    available_at, due_at = _task_window(task, node, project)
    overdue_allowed = False if task.task_kind == "calibration" else await _overdue_submission_allowed(task, node, db)
    editable, submit_allowed = _self_summary_state(task, available_at, due_at, overdue_allowed)
    if not editable or not submit_allowed:
        raise HTTPException(status_code=409, detail="SUBMISSION_NOT_ALLOWED")
    if payload.version != task.answer_version:
        raise HTTPException(status_code=409, detail="VERSION_CONFLICT")
    if task.task_kind == "calibration" and getattr(task, "draft_answers", None) is not None:
        PerformanceAuditService(db).append_event(AuditEventInput(event_type="CALIBRATION_DRAFT_DISCARDED", cycle_ref=task.cycle_ref, employee_no=task.target_employee_no, actor_type=actor.actor_type, actor_ref=actor.actor_ref, subject_type="PERFORMANCE_NODE_TASK", subject_ref=str(task.id), before_state={"draft_answers": task.draft_answers}, after_state={"draft_answers": None, "project_id": task.project_id, "node_id": node.node_id, "phase_id": task.phase_id}))
    task.draft_answers = None
    task.answer_version += 1
    await db.commit()
    return {"version": task.answer_version, "has_draft": False}


class EvaluatorPreviewPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: int | None = Field(default=None, ge=1)
    evaluator_rules: dict = Field(default_factory=lambda: {"groups": []})
    scope_rules: dict = Field(default_factory=lambda: {"groups": []})
    group_index: int | None = Field(default=None, ge=0)
    list_kind: Literal["matched", "task", "report_only"] = "matched"


class EvaluatorPreviewPerson(BaseModel):
    employee_no: str
    display_name: str
    direct_supervisor: str | None = None
    company_org: str | None = None
    department: str | None = None
    department_2: str | None = None
    department_3: str | None = None
    job_family: str | None = None
    job_category: str | None = None
    standard_position: str | None = None
    employment_status: str | None = None
    live_employment_status: str | None = None
    status: str
    report_only: bool = False


class EvaluatorPreviewResponse(BaseModel):
    matched_count: int
    task_generation_count: int
    report_count: int
    report_only_count: int
    group_counts: list[int]


class EvaluatorPreviewPeoplePage(BaseModel):
    items: list[EvaluatorPreviewPerson]
    total: int
    page: int
    page_size: int


class ProjectPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=500)
    administrators: list[str] = Field(default_factory=list, max_length=50)
    data_managers: list[Literal["PROJECT_ADMIN", "HRBP"]] | None = Field(default=None, min_length=1)
    scope_limited: bool | None = None
    scope_employee_nos: list[str] | None = Field(default=None, max_length=5000)
    scope_rules: dict | None = None
    template_id: int | None = Field(default=None, ge=1)
    start_at: datetime | None = None
    end_at: datetime | None = None
    evaluator_rules: dict | None = None
    flow_settings: dict | None = None


class ProjectWorkflowNodesBackfillPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    node_times: dict[str, dict] = Field(default_factory=dict, max_length=100)


class ProjectResponse(BaseModel):
    id: int
    project_ref: str
    cycle_ref: str
    name: str
    description: str | None
    administrators: list[str]
    data_managers: list[Literal["PROJECT_ADMIN", "HRBP"]] = Field(default_factory=lambda: ["HRBP"])
    scope_limited: bool = False
    scope_employee_nos: list[str] = Field(default_factory=list)
    scope_rules: dict = Field(default_factory=lambda: {"groups": []})
    status: str
    evaluated_count: int
    template_id: int | None = None
    start_at: str | None = None
    end_at: str | None = None
    evaluator_rules: dict = Field(default_factory=lambda: {"groups": []})
    flow_settings: dict = Field(default_factory=lambda: {"node_settings": {}})


class ProjectPage(BaseModel):
    items: list[ProjectResponse]
    total: int
    page: int
    page_size: int


class ProjectMemberResponse(BaseModel):
    id: int
    employee_no: str
    display_name: str
    company_org: str | None = None
    department_2: str | None = None
    department_3: str | None = None
    department_4: str | None = None
    department_5: str | None = None
    avatar_url: str | None = None
    rating: str | None = None
    rating_tone: str | None = None
    completion: str | None = None
    direct_supervisor: str | None = None
    job_family: str | None = None
    job_category: str | None = None
    standard_position: str | None = None
    job_sequence: str | None = None
    position_level: str | None = None
    hire_date: str | None = None
    department: str | None = None
    employee_type: str | None = None
    employment_status: str | None = None
    visible_profile_fields: list[str] = Field(default_factory=list)


class ProjectMemberPage(BaseModel):
    items: list[ProjectMemberResponse]
    total: int
    page: int
    page_size: int


class MatrixPersonResponse(BaseModel):
    employee_no: str
    display_name: str
    employment_status: str | None = None


class MatrixRatingResponse(BaseModel):
    key: str
    label: str
    color: str | None = None


class MatrixCellResponse(BaseModel):
    count: int
    people: list[MatrixPersonResponse]


class MatrixRowResponse(BaseModel):
    level: str
    total: int
    cells: dict[str, MatrixCellResponse]


class ProjectMatrixResponse(BaseModel):
    source: str
    dimension: str
    display_modes: list[str]
    total: int
    completed_count: int
    pending_count: int
    ratings: list[MatrixRatingResponse]
    pending_rows: list[MatrixRowResponse]
    completed_rows: list[MatrixRowResponse]


class ProjectStatisticsRowResponse(BaseModel):
    id: str
    name: str
    counts: dict[str, int]


class ProjectStatisticsReportResponse(BaseModel):
    source: str
    dimension: str
    rowLabel: str
    showSummary: bool
    totalParticipants: int
    ratings: list[MatrixRatingResponse]
    distribution: dict[str, int]
    departments: list[ProjectStatisticsRowResponse]


def _matrix_level(value: object) -> str:
    text = str(value or "").strip()
    return text or "--"


def _matrix_level_sort_key(level: str) -> tuple[int, int, str]:
    if level == "--":
        return (2, 0, "")
    if level[:1] in {"J", "P", "M"} and level[1:].isdigit():
        return (0, -int(level[1:]), level)
    return (1, 0, level)


def _matrix_rating_value(value: object, options: list[dict]) -> dict | None:
    if isinstance(value, list):
        value = value[0] if value else None
    if isinstance(value, dict):
        value = value.get("id") or value.get("value") or value.get("option_id") or value.get("label")
    if value is None or not str(value).strip():
        return None
    text = str(value).strip()
    return next((option for option in options if text in {str(option.get("id")), str(option.get("label"))}), None)


def _tenure_bucket(value: object, today: date | None = None) -> str:
    if value is None or str(value).strip() == "":
        return "入职日期缺失"
    if isinstance(value, datetime):
        hire_date = value.date()
    elif isinstance(value, date):
        hire_date = value
    else:
        try:
            hire_date = date.fromisoformat(str(value)[:10])
        except (TypeError, ValueError):
            return "入职日期缺失"
    current = today or date.today()
    months = (current.year - hire_date.year) * 12 + current.month - hire_date.month
    if current.day < hire_date.day:
        months -= 1
    if months >= 36:
        return "3年以上"
    if months >= 12:
        return "1-3年内（不含3年）"
    if months >= 6:
        return "6个月-1年（不含1年）"
    if months >= 3:
        return "3-6个月（不含6个月）"
    return "入职未满3个月"


    if isinstance(value, datetime):
        hire_date = value.date()
    elif isinstance(value, date):
        hire_date = value
    else:
        try:
            hire_date = date.fromisoformat(str(value)[:10])
        except (TypeError, ValueError):
            return "入职日期缺失"
    current = today or date.today()
    months = (current.year - hire_date.year) * 12 + current.month - hire_date.month
    if current.day < hire_date.day:
        months -= 1
    if months >= 36:
        return "3年以上"
    if months >= 12:
        return "1-3年内（不含3年）"
    if months >= 6:
        return "6个月-1年（不含1年）"
    if months >= 3:
        return "3-6个月（不含6个月）"
    return "入职未满3个月"


_TENURE_BUCKET_ORDER = {
    "入职未满3个月": 0,
    "3-6个月（不含6个月）": 1,
    "6个月-1年（不含1年）": 2,
    "1-3年内（不含3年）": 3,
    "3年以上": 4,
    "入职日期缺失": 5,
}


def _tenure_sort_key(value: str) -> tuple[int, str]:
    return (_TENURE_BUCKET_ORDER.get(value, 6), value)


async def _matrix_node_schema(node: PerformanceProjectNodeSnapshot, project: PerformanceProject, db: AsyncSession) -> list[dict]:
    template = (node.config or {}).get("template") or {}
    if not template.get("content"):
        template_id = (project.settings or {}).get("template_id")
        workflow = await db.get(PerformanceTemplateWorkflow, int(template_id)) if template_id else None
        current_node = next((item for item in (workflow.nodes if workflow else []) if str(item.get("node_id")) == str(node.node_id)), None)
        template = resolve_self_summary_content(current_node or template, list((workflow.content_library if workflow else []) or []))
    return build_self_summary_schema(await hydrate_self_summary_template(template, db))


def _matrix_person(member: PerformanceProjectMember) -> dict:
    return {"employee_no": member.employee_no, "display_name": member.display_name, "employment_status": member.employment_status}


def _matrix_rows(level_people: dict[str, dict[str, list[dict]]], ratings: list[dict]) -> list[dict]:
    rows = []
    for level in sorted(level_people, key=_matrix_level_sort_key):
        grouped = level_people[level]
        cells = {
            rating["key"]: {"count": len(grouped.get(rating["key"], [])), "people": grouped.get(rating["key"], [])}
            for rating in ratings
        }
        rows.append({"level": level, "total": sum(cell["count"] for cell in cells.values()), "cells": cells})
    return rows


async def _project_final_ratings(project, employee_nos, db, *, member_snapshot_id=None):
    project_id = project.id
    nodes = list((await db.execute(
        select(PerformanceProjectNodeSnapshot).where(
            PerformanceProjectNodeSnapshot.project_id == project_id,
            PerformanceProjectNodeSnapshot.node_type == "evaluation",
        ).order_by(PerformanceProjectNodeSnapshot.node_order)
    )).scalars().all())
    final_nodes = [
        node for node in nodes
        if bool(((node.config or {}).get("template") or {}).get("include_final_result"))
    ]
    task_statement = select(PerformanceNodeTask).where(
        PerformanceNodeTask.project_id == project_id,
        PerformanceNodeTask.node_snapshot_id.in_([node.id for node in final_nodes]) if final_nodes else False,
    )
    if member_snapshot_id is not None:
        task_statement = task_statement.where(PerformanceNodeTask.member_snapshot_id == member_snapshot_id)
    tasks = list((await db.execute(task_statement.order_by(PerformanceNodeTask.id))).scalars().all())
    tasks_by_node: dict[int, list[PerformanceNodeTask]] = {}
    for task in tasks:
        tasks_by_node.setdefault(task.node_snapshot_id, []).append(task)

    ratings: list[dict] = []
    rating_scales = []
    final_values: dict[str, tuple[int, int, str, dict]] = {}
    for node in final_nodes:
        schema = await _matrix_node_schema(node, project, db)
        rating_fields = [field for section in schema for field in section.get("fields", []) if field.get("type") == "rating"]
        if not rating_fields:
            continue
        field = rating_fields[0]
        options = [dict(option) for option in field.get("options", [])]
        if options:
            rating_scales.append([(option.get("id"), option.get("label"), option.get("color"), option.get("code")) for option in options])
        for option in options:
            normalized = {"key": str(option.get("id")), "label": str(option.get("code") or option.get("label") or option.get("id")), "color": option.get("color")}
            if not any(item["key"] == normalized["key"] for item in ratings):
                ratings.append(normalized)
        for task in tasks_by_node.get(node.id, []):
            if task.submitted_at is None or task.target_employee_no not in employee_nos:
                continue
            option = _matrix_rating_value((task.answers or {}).get(field.get("id")), options)
            if option is None:
                continue
            normalized = {"key": str(option.get("id")), "label": str(option.get("code") or option.get("label") or option.get("id")), "color": option.get("color")}
            if not any(item["key"] == normalized["key"] for item in ratings):
                ratings.append(normalized)
            submitted_key = task.submitted_at.isoformat() if hasattr(task.submitted_at, "isoformat") else str(task.submitted_at)
            candidate = (node.node_order, task.id, submitted_key, normalized)
            previous = final_values.get(task.target_employee_no)
            if previous is None or candidate[:3] > previous[:3]:
                final_values[task.target_employee_no] = candidate
    return ratings, final_values, rating_scales


@router.get("/projects/{project_id}/matrix", response_model=ProjectMatrixResponse)
async def project_matrix(
    project_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    project = await _get_project(db, project_id)
    scope = await _project_data_scope(context, project, db, "performance.frontend.data-view")

    snapshot_id = _latest_member_snapshot_statement(project_id)
    members = list((await db.execute(
        select(PerformanceProjectMember).where(PerformanceProjectMember.snapshot_id == snapshot_id)
    )).scalars().all())
    if scope is not None:
        members = [member for member in members if member.employee_no in scope]
    levels = {
        member.employee_no: _matrix_level(member.position_level)
        for member in members
    }
    people = {member.employee_no: _matrix_person(member) for member in members}
    ratings, final_values, _ = await _project_final_ratings(project, set(people), db)

    pending_groups: dict[str, list[dict]] = {}
    completed_groups: dict[str, dict[str, list[dict]]] = {level: {} for level in set(levels.values())}
    for employee_no, person in people.items():
        level = levels[employee_no]
        selected = final_values.get(employee_no)
        if selected is None:
            pending_groups.setdefault(level, []).append(person)
            continue
        rating_key = selected[3]["key"]
        completed_groups.setdefault(level, {}).setdefault(rating_key, []).append(person)

    pending_rows = [
        {"level": level, "total": len(items), "cells": {"pending": {"count": len(items), "people": sorted(items, key=lambda item: item["display_name"])}}}
        for level, items in sorted(pending_groups.items(), key=lambda item: _matrix_level_sort_key(item[0]))
    ]
    return ProjectMatrixResponse(
        source="template_final_result",
        dimension="rating",
        display_modes=["name", "count"],
        total=len(members),
        completed_count=len(final_values),
        pending_count=len(members) - len(final_values),
        ratings=[MatrixRatingResponse(**rating) for rating in ratings],
        pending_rows=[MatrixRowResponse(**row) for row in pending_rows],
        completed_rows=[MatrixRowResponse(**row) for row in _matrix_rows(completed_groups, ratings)],
    )


def _result_view_snapshot(nodes: list[PerformanceProjectNodeSnapshot]) -> PerformanceProjectNodeSnapshot | None:
    return next((node for node in nodes if node.node_type == "result_view"), None)


def _final_result_snapshot(nodes: list[PerformanceProjectNodeSnapshot]) -> PerformanceProjectNodeSnapshot | None:
    marked = [node for node in nodes if bool(((node.config or {}).get("template") or {}).get("include_final_result"))]
    return marked[0] if len(marked) == 1 else None


def _result_opening_config(project: PerformanceProject, view: PerformanceProjectNodeSnapshot) -> dict:
    return (((project.settings or {}).get("flow_settings") or {}).get("node_settings") or {}).get(view.node_id, {}).get("result_view") or {}


def _result_ready(tasks: list[PerformanceNodeTask], schema: list[dict]) -> bool:
    if not tasks or not all(task.status == "completed" and task.submitted_at is not None for task in tasks):
        return False
    fields = [field for section in schema for field in section.get("fields", []) if field.get("type") == "rating"]
    if not fields:
        return False
    for task in tasks:
        for field in fields:
            options = field.get("options") or []
            answer = (task.answers or {}).get(field["id"])
            if not options or _matrix_rating_value(answer, options) is None:
                return False
    return True


async def _opening_state(project: PerformanceProject, db: AsyncSession):
    nodes = list((await db.execute(select(PerformanceProjectNodeSnapshot).where(
        PerformanceProjectNodeSnapshot.project_id == project.id,
    ).order_by(PerformanceProjectNodeSnapshot.node_order))).scalars().all())
    view = _result_view_snapshot(nodes)
    final = _final_result_snapshot(nodes)
    if view is None or final is None:
        return None
    snapshot_id = await db.scalar(select(_latest_member_snapshot_statement(project.id)))
    if snapshot_id is None:
        return None
    members = list((await db.execute(select(PerformanceProjectMember).where(
        PerformanceProjectMember.snapshot_id == snapshot_id,
    ))).scalars().all())
    tasks = list((await db.execute(select(PerformanceNodeTask).where(
        PerformanceNodeTask.project_id == project.id,
        PerformanceNodeTask.member_snapshot_id == snapshot_id,
        PerformanceNodeTask.node_snapshot_id.in_([node.id for node in nodes]),
    ))).scalars().all())
    previous_index = nodes.index(view) - 1
    previous = nodes[previous_index] if previous_index >= 0 else None
    schema = await _matrix_node_schema(final, project, db)
    return view, final, previous, members, tasks, schema


def _member_result_ready(employee_no: str, final: PerformanceProjectNodeSnapshot, tasks: list[PerformanceNodeTask], schema: list[dict]) -> bool:
    return _result_ready([task for task in tasks if task.target_employee_no == employee_no and task.node_snapshot_id == final.id], schema)


def _previous_finished(employee_no: str, previous: PerformanceProjectNodeSnapshot | None, tasks: list[PerformanceNodeTask]) -> bool:
    if previous is None or previous.node_type in {"project_start", "project_end"}:
        return True
    related = [task for task in tasks if task.target_employee_no == employee_no and task.node_snapshot_id == previous.id]
    return not related or any(task.status == "completed" and task.submitted_at is not None for task in related)


async def _open_result(db: AsyncSession, project: PerformanceProject, employee_no: str, *, actor_type: str, actor_ref: str, tasks: list[PerformanceNodeTask], final: PerformanceProjectNodeSnapshot, member: PerformanceProjectMember):
    version = {str(task.id): task.answer_version for task in tasks if task.target_employee_no == employee_no and task.node_snapshot_id == final.id}
    statement = pg_insert(PerformanceResultOpening).values(
        project_id=project.id, cycle_ref=project.cycle_ref, employee_no=employee_no,
        opened_at=datetime.now(UTC), opened_by_type=actor_type, opened_by_ref=actor_ref, result_version=version,
        published_position_level=getattr(member, "position_level", None),
    ).on_conflict_do_nothing(index_elements=["project_id", "employee_no"]).returning(PerformanceResultOpening.id)
    opened_id = await db.scalar(statement)
    if opened_id is not None:
        PerformanceAuditService(db).append_event(AuditEventInput(
            event_type="PERFORMANCE_RESULT_OPENED", cycle_ref=project.cycle_ref, employee_no=employee_no,
            actor_type=actor_type, actor_ref=actor_ref, subject_type="PERFORMANCE_RESULT_OPENING",
            subject_ref=str(opened_id), after_state={"project_id": project.id, "result_version": version, "published_position_level": getattr(member, "position_level", None)},
        ))
    return opened_id is not None


async def _sync_automatic_openings(db: AsyncSession, project: PerformanceProject, *, now: datetime | None = None) -> int:
    if project.status != PROJECT_STATUS_STARTED:
        return 0
    state = await _opening_state(project, db)
    if state is None:
        return 0
    view, final, previous, members, tasks, schema = state
    config = _result_opening_config(project, view)
    if not config.get("automatic_enabled"):
        return 0
    if config.get("automatic_rule") != "PREVIOUS_IMMEDIATE":
        start_at = _parse_time((_node_timing(project, view) or {}).get("start_at"))
        if start_at is None or (now or datetime.now(UTC)) < start_at:
            return 0
    opened = 0
    for member in members:
        if not _previous_finished(member.employee_no, previous, tasks) or not _member_result_ready(member.employee_no, final, tasks, schema):
            continue
        opened += int(await _open_result(db, project, member.employee_no, actor_type="SYSTEM", actor_ref="automatic", tasks=tasks, final=final, member=member))
    return opened


def _result_opening_scope(context: PerformanceAccessContext, grants: list[tuple[PerformanceRole, PerformanceRoleAssignment]], project: PerformanceProject, member: PerformanceProjectMember) -> bool:
    for role, assignment in grants:
        if role.is_active and "performance.frontend.result-open" in (role.function_permission_keys or []):
            if assignment.scope_type == "GLOBAL":
                return True
            if assignment.scope_type == "PROJECT" and assignment.scope_ref == project.project_ref:
                return True
            if assignment.scope_type == "ORG" and _organization_in_scope(member.organization_ref, [assignment.scope_ref]):
                return True
    return False


async def _opening_role_grants(db: AsyncSession, context: PerformanceAccessContext) -> list[tuple[PerformanceRole, PerformanceRoleAssignment]]:
    now = datetime.now(UTC)
    return list((await db.execute(select(PerformanceRole, PerformanceRoleAssignment).join(
        PerformanceRoleAssignment, PerformanceRoleAssignment.role_id == PerformanceRole.id,
    ).where(
        PerformanceRoleAssignment.subject_type == context.subject_type,
        PerformanceRoleAssignment.subject_id == context.subject_id,
        PerformanceRoleAssignment.is_active.is_(True),
        PerformanceRole.is_active.is_(True),
        PerformanceRole.role_type == "MANAGEMENT",
        or_(PerformanceRoleAssignment.starts_at.is_(None), PerformanceRoleAssignment.starts_at <= now),
        or_(PerformanceRoleAssignment.ends_at.is_(None), PerformanceRoleAssignment.ends_at > now),
    ))).all())


async def _opening_project_members(db: AsyncSession, cycle_id: int) -> list[tuple[PerformanceProject, PerformanceProjectMember]]:
    cycle = await _get_cycle(db, cycle_id)
    projects = list((await db.execute(select(PerformanceProject).where(
        PerformanceProject.cycle_ref == cycle.cycle_ref,
        PerformanceProject.status == PROJECT_STATUS_STARTED,
    ))).scalars().all())
    rows: list[tuple[PerformanceProject, PerformanceProjectMember]] = []
    for project in projects:
        snapshot_id = await db.scalar(select(_latest_member_snapshot_statement(project.id)))
        if snapshot_id is None:
            continue
        members = (await db.execute(select(PerformanceProjectMember).where(
            PerformanceProjectMember.snapshot_id == snapshot_id,
        ))).scalars().all()
        rows.extend((project, member) for member in members)
    return rows


def _manual_openable(project: PerformanceProject, member: PerformanceProjectMember, state, now: datetime) -> str | None:
    if state is None:
        return "RESULT_NOT_READY"
    view, final, _previous, _members, tasks, schema = state
    if not _result_opening_config(project, view).get("manual_enabled"):
        return "MANUAL_OPENING_DISABLED"
    start_at = _parse_time((_node_timing(project, view) or {}).get("start_at"))
    if start_at is None or now < start_at:
        return "RESULT_VIEW_NOT_STARTED"
    if not _member_result_ready(member.employee_no, final, tasks, schema):
        return "RESULT_NOT_READY"
    return None


@router.get("/cycles/{cycle_id}/result-opening/people", response_model=ResultOpeningPeoplePage)
async def result_opening_people(
    cycle_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    keyword: str | None = Query(default=None, max_length=100),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    grants = await _opening_role_grants(db, context)
    if not any(role.is_active and "performance.frontend.result-open" in (role.function_permission_keys or []) for role, _ in grants):
        raise HTTPException(status_code=403, detail="RESULT_OPEN_FORBIDDEN")
    rows = await _opening_project_members(db, cycle_id)
    project_ids = [project.id for project, _ in rows]
    projects_by_id = {project.id: project for project, _ in rows}
    opened = set((await db.execute(select(PerformanceResultOpening.project_id, PerformanceResultOpening.employee_no).where(
        PerformanceResultOpening.project_id.in_(project_ids),
    ))).all()) if project_ids else set()
    states = {project.id: await _opening_state(project, db) for project in projects_by_id.values()}
    items = []
    for project, member in rows:
        if (project.id, member.employee_no) in opened or not _result_opening_scope(context, grants, project, member):
            continue
        if keyword and keyword.casefold() not in f"{member.display_name} {member.employee_no}".casefold():
            continue
        reason = _manual_openable(project, member, states.get(project.id), datetime.now(UTC))
        items.append(ResultOpeningPerson(
            employee_no=member.employee_no, display_name=member.display_name, project_id=project.id,
            project_name=project.name, can_open=reason is None, unavailable_reason=reason,
        ))
    items.sort(key=lambda item: (item.display_name, item.employee_no))
    return ResultOpeningPeoplePage(items=items[(page - 1) * page_size:page * page_size], total=len(items), page=page, page_size=page_size)


@router.post("/cycles/{cycle_id}/result-opening/open", response_model=ResultOpeningBatchResponse)
async def open_cycle_results(
    cycle_id: int,
    payload: ResultOpeningBatchPayload,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    grants = await _opening_role_grants(db, context)
    if not any(role.is_active and "performance.frontend.result-open" in (role.function_permission_keys or []) for role, _ in grants):
        raise HTTPException(status_code=403, detail="RESULT_OPEN_FORBIDDEN")
    rows = await _opening_project_members(db, cycle_id)
    selected = list(dict.fromkeys(payload.employee_nos))
    matched: dict[str, tuple[PerformanceProject, PerformanceProjectMember]] = {}
    duplicates: set[str] = set()
    for project, member in rows:
        if member.employee_no in matched:
            duplicates.add(member.employee_no)
        matched[member.employee_no] = project, member
    actor = await resolve_trusted_performance_actor(db, context)
    accepted: list[str] = []
    skipped: dict[str, str] = {}
    states = {}
    for employee_no in selected:
        if not employee_no or len(employee_no) > 64:
            skipped[employee_no] = "PERSON_NOT_FOUND"
            continue
        if employee_no in duplicates:
            skipped[employee_no] = "MULTIPLE_PROJECT_MEMBERSHIPS"
            continue
        item = matched.get(employee_no)
        if item is None:
            skipped[employee_no] = "PERSON_NOT_FOUND"
            continue
        project, member = item
        if not _result_opening_scope(context, grants, project, member):
            skipped[employee_no] = "RESULT_OPEN_FORBIDDEN"
            continue
        if project.id not in states:
            states[project.id] = await _opening_state(project, db)
        reason = _manual_openable(project, member, states[project.id], datetime.now(UTC))
        if reason:
            skipped[employee_no] = reason
            continue
        final = states[project.id][1]
        tasks = states[project.id][4]
        if await _open_result(db, project, employee_no, actor_type=actor.actor_type, actor_ref=actor.actor_ref, tasks=tasks, final=final, member=member):
            accepted.append(employee_no)
        else:
            skipped[employee_no] = "ALREADY_OPENED"
    await db.commit()
    return ResultOpeningBatchResponse(accepted_employee_nos=accepted, skipped_employee_nos=[employee_no for employee_no in selected if employee_no in skipped], skipped_reasons=skipped)


@router.get("/workbench/projects/{project_id}/results")
async def read_my_project_results(
    project_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    project = await _get_project(db, project_id)
    try:
        actor = await resolve_trusted_performance_actor(db, context, cycle_ref=project.cycle_ref, require_employee_identity=True)
    except PerformanceIdentityMappingNotFound:
        raise HTTPException(status_code=404, detail="RESULT_NOT_FOUND") from None
    if actor.actor_type != "EMPLOYEE":
        raise HTTPException(status_code=404, detail="RESULT_NOT_FOUND")
    opening = await db.scalar(select(PerformanceResultOpening).where(
        PerformanceResultOpening.project_id == project_id,
        PerformanceResultOpening.employee_no == actor.actor_ref,
    ))
    if opening is None:
        raise HTTPException(status_code=404, detail="RESULT_NOT_FOUND")
    state = await _opening_state(project, db)
    if state is None:
        raise HTTPException(status_code=404, detail="RESULT_NOT_FOUND")
    view, final, _previous, members, tasks, schema = state
    if not any(member.employee_no == actor.actor_ref for member in members):
        raise HTTPException(status_code=404, detail="RESULT_NOT_FOUND")
    fields = [field for section in schema for field in section.get("fields", []) if field.get("type") == "rating"]
    final_tasks = [
        task for task in tasks
        if task.target_employee_no == actor.actor_ref and task.node_snapshot_id == final.id
    ]
    results = []
    for task in final_tasks:
        for field in fields:
            option = _matrix_rating_value((task.answers or {}).get(field["id"]), field.get("options") or [])
            if option is not None:
                results.append({"task_id": task.id, "field_id": field["id"], "option_id": str(option["id"]), "label": str(option.get("label") or "")})
    contents = project_result_view_contents(
        (view.config or {}).get("template") or {},
        (final.config or {}).get("template") or {},
        final_tasks,
        employee_no=actor.actor_ref,
    )
    return {"project_id": project.id, "employee_no": actor.actor_ref, "results": results, "contents": contents}


def _latest_member_snapshot_statement(project_id: int):
    latest_snapshot = (
        select(func.max(PerformanceProjectMemberSnapshot.id))
        .where(PerformanceProjectMemberSnapshot.project_id == project_id)
        .scalar_subquery()
    )
    return latest_snapshot


def _serialize_project_member(member: PerformanceProjectMember) -> ProjectMemberResponse:
    return ProjectMemberResponse(
        id=member.id,
        employee_no=member.employee_no,
        display_name=member.display_name,
        company_org=member.company_org,
        department_2=member.department_2,
        department_3=member.department_3,
        department_4=member.department_4,
        department_5=member.department_5,
        employment_status=member.employment_status,
        employee_type=member.employee_type,
        department=organization_leaf(member),
        job_family=member.job_family,
        job_category=member.job_category,
        standard_position=member.standard_position,
        job_sequence=format_job_sequence(member.job_family, member.job_category),
        position_level=member.position_level,
        hire_date=member.hire_date.isoformat() if member.hire_date else None,
    )


@router.get("/projects/{project_id}/members", response_model=ProjectMemberPage)
async def list_project_members(
    project_id: int,
    keyword: str | None = Query(default=None, max_length=128),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    sort_by: str | None = Query(default=None, pattern="^(name|rating|completion|job_sequence|position_level|hire_date|department)$"),
    sort_order: str | None = Query(default=None, pattern="^(asc|desc)$"),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    project = await _get_project(db, project_id)
    scope = await _project_data_scope(context, project, db, "performance.frontend.data-view")

    snapshot_id = _latest_member_snapshot_statement(project_id)
    statement = select(PerformanceProjectMember).where(PerformanceProjectMember.snapshot_id == snapshot_id)
    count_statement = select(func.count(PerformanceProjectMember.id)).where(PerformanceProjectMember.snapshot_id == snapshot_id)
    actor_ref = None
    if scope is not None:
        statement = statement.where(PerformanceProjectMember.employee_no.in_(scope))
    actor = await resolve_trusted_performance_actor(db, context, cycle_ref=project.cycle_ref)
    actor_ref = str(actor.actor_ref)
    if isinstance(keyword, str) and keyword.strip():
        pattern = f"%{keyword.strip()}%"
        condition = or_(
            PerformanceProjectMember.display_name.ilike(pattern),
            PerformanceProjectMember.employee_no.ilike(pattern),
            PerformanceProjectMember.organization_ref.ilike(pattern),
        )
        statement = statement.where(condition)
        count_statement = count_statement.where(condition)

    members = list((await db.execute(statement.order_by(PerformanceProjectMember.display_name.asc(), PerformanceProjectMember.id.asc()))).scalars().all())

    supervisor_names = await _snapshot_supervisor_names(db, members)
    progress = await _communication_progress(db, project, {member.employee_no for member in members}) if members else {}
    visibility_rules = await load_subject_visibility_rules(db)
    visible_fields_by_member: dict[int, list[str]] = {}
    for member in members:
        role = "hrbp" if scope is not None else "activity_manager"
        if _is_cycle_manager(context):
            role = await resolve_subject_visibility_role(
                db, context, actor_ref, member,
                SimpleNamespace(node_type="", config={}), project,
            )
        visible_fields_by_member[member.id] = visibility_rules[role]

    items = []
    for member in members:
        item = _serialize_project_member(member).model_dump()
        item["completion"] = progress.get(member.employee_no, "0/0")
        item["direct_supervisor"] = supervisor_names.get((member.snapshot_id, getattr(member, "direct_supervisor_employee_no", None)))
        visible_fields = visible_fields_by_member[member.id]
        item["visible_profile_fields"] = visible_fields
        profile_values = {
            "company_org": item.get("company_org"),
            "department": item.get("department"),
            "department_2": item.get("department_2"),
            "department_3": item.get("department_3"),
            "department_4": item.get("department_4"),
            "department_5": item.get("department_5"),
            "position_level": item.get("position_level"),
            "job_sequence": item.get("job_sequence"),
            "direct_supervisor": item.get("direct_supervisor"),
            "hire_date": item.get("hire_date"),
            "employee_type": item.get("employee_type"),
        }
        item.update(mask_profile_values(profile_values, visible_fields))
        items.append(ProjectMemberResponse(**item))
    if sort_by and sort_order:
        items.sort(key=lambda item: (getattr(item, "display_name" if sort_by == "name" else sort_by) is None, str(getattr(item, "display_name" if sort_by == "name" else sort_by) or "")), reverse=sort_order == "desc")
    total = len(items)
    start = (page - 1) * page_size
    return ProjectMemberPage(
        items=items[start:start + page_size],
        total=total,
        page=page,
        page_size=page_size,
    )


def _project_scope_refs(context: PerformanceAccessContext) -> set[str]:
    return {
        grant.scope_ref
        for grant in context.role_grants
        if grant.scope_type == "PROJECT" and grant.scope_ref
    }


def _is_cycle_manager(context: PerformanceAccessContext) -> bool:
    return "performance.cycles.manage" in context.permission_codes


def _can_manage_project(context: PerformanceAccessContext, project: PerformanceProject) -> bool:
    return _is_cycle_manager(context) or (
        "performance.projects.manage" in context.permission_codes
        and project.project_ref in _project_scope_refs(context)
    )


async def _project_data_scope(context: PerformanceAccessContext, project: PerformanceProject, db: AsyncSession, function_key: str) -> set[str] | None:
    if _is_cycle_manager(context):
        return None
    selected = (project.settings or {}).get("data_managers", ["HRBP"])
    roles = list((await db.execute(select(PerformanceRole).where(
        PerformanceRole.code.in_(("performance.project_admin", "performance.hrbp")),
        PerformanceRole.role_type == "MANAGEMENT",
        PerformanceRole.is_active.is_(True),
    ))).scalars().all())
    enabled = {role.code for role in roles if function_key in (role.function_permission_keys or [])}
    if "PROJECT_ADMIN" in selected and "performance.project_admin" in enabled and _person_in_project_administrators(project, context.display_name):
        if getattr(context, "effective_employee_no", None):
            from app.performance.models import PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson
            matches = list((await db.execute(select(PerformanceAuthorizationSnapshotPerson.employee_no)
                .join(PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshot.id == PerformanceAuthorizationSnapshotPerson.snapshot_id)
                .where(PerformanceAuthorizationSnapshot.cycle_ref == project.cycle_ref,
                       PerformanceAuthorizationSnapshotPerson.display_name == context.display_name))).scalars())
            if matches != [context.effective_employee_no]:
                raise HTTPException(status_code=403, detail="PROJECT_ADMIN_IDENTITY_AMBIGUOUS")
        return None
    if "HRBP" in selected and "performance.hrbp" in enabled:
        actor = await resolve_trusted_performance_actor(db, context, cycle_ref=project.cycle_ref)
        if actor.actor_type == "EMPLOYEE":
            permissions = await _person_hrbp_permissions(db, actor.actor_ref, project.cycle_ref)
            if permissions:
                snapshot_id = _latest_member_snapshot_statement(project.id)
                members = (await db.execute(select(PerformanceProjectMember).where(
                    PerformanceProjectMember.snapshot_id == snapshot_id,
                ))).scalars().all()
                visible = {member.employee_no for member in members if any(
                    _organization_in_scope(member.organization_ref, permission.scope or [])
                    and member.employee_no not in (permission.invisible_people or [])
                    for permission in permissions
                )}
                if visible:
                    return visible
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="PROJECT_DATA_FORBIDDEN")


async def _template_node_names(db: AsyncSession, project: PerformanceProject) -> dict[str, str]:
    """Return the current template names keyed by node id.

    Project snapshots remain the source for task identity and timing, while the
    template is the source of truth for the editable display name.
    """
    template_id = (project.settings or {}).get("template_id")
    if not template_id:
        return {}
    workflow = await db.get(PerformanceTemplateWorkflow, int(template_id))
    return {
        str(node.get("node_id")): str(node.get("name"))
        for node in ((workflow.nodes if workflow else []) or [])
        if node.get("node_id") and node.get("name")
    }


async def _get_cycle(db: AsyncSession, cycle_id: int) -> PerformanceCycle:
    cycle = await PerformanceCycleService(db).get_cycle(cycle_id)
    return cycle


async def _get_project(db: AsyncSession, project_id: int) -> PerformanceProject:
    project = await db.get(PerformanceProject, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="绩效项目不存在")
    return project


async def _assert_cycle_project_view(
    db: AsyncSession,
    cycle: PerformanceCycle,
    context: PerformanceAccessContext,
) -> None:
    if _is_cycle_manager(context):
        return
    if "performance.projects.manage" not in context.permission_codes:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看项目列表")
    refs = _project_scope_refs(context)
    if not refs:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="当前项目管理范围不匹配")
    exists = await db.scalar(
        select(PerformanceProject.id).where(
            PerformanceProject.cycle_ref == cycle.cycle_ref,
            PerformanceProject.project_ref.in_(refs),
        ).limit(1)
    )
    if exists is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="当前项目管理范围不匹配")


@router.get("/cycles/{cycle_id}/projects", response_model=ProjectPage)
async def list_projects(
    cycle_id: int,
    keyword: str | None = Query(default=None, max_length=128),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    cycle = await _get_cycle(db, cycle_id)
    await _assert_cycle_project_view(db, cycle, context)
    refs = None if _is_cycle_manager(context) else _project_scope_refs(context)
    projects, total = await PerformanceProjectService(db).list_projects(
        cycle.cycle_ref, keyword, project_refs=refs, page=page, page_size=page_size
    )
    return ProjectPage(
        items=[ProjectResponse(**PerformanceProjectService.serialize(project)) for project in projects],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/cycles/{cycle_id}/project-templates")
async def project_templates(
    cycle_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    cycle = await _get_cycle(db, cycle_id)
    await _assert_cycle_project_view(db, cycle, context)
    ids = PerformanceCycleService.template_ids(cycle)
    if not ids:
        return []
    rows = (await db.execute(select(PerformanceTemplate).where(PerformanceTemplate.id.in_(ids), PerformanceTemplate.template_kind == "performance"))).scalars().all()
    by_id = {row.id: row for row in rows}
    return [{"template_id": template_id, "name": by_id[template_id].name, "description": by_id[template_id].description,
             "status": by_id[template_id].status} for template_id in ids if template_id in by_id]


@router.get("/cycles/{cycle_id}/project-templates/{template_id}/workflow")
async def project_template_workflow(
    cycle_id: int,
    template_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    from app.performance.project_service import distribution_assessment_options
    from app.performance.template_workflow_service import PerformanceTemplateWorkflowService

    cycle = await _get_cycle(db, cycle_id)
    await _assert_cycle_project_view(db, cycle, context)
    if template_id not in PerformanceCycleService.template_ids(cycle):
        raise HTTPException(status_code=422, detail="只能选择当前绩效周期已配置的模板")
    template = await db.get(PerformanceTemplate, template_id)
    if template is None or template.template_kind != "performance":
        raise HTTPException(status_code=404, detail="绩效模板不存在")
    nodes, _, _ = await PerformanceTemplateWorkflowService(db).get_nodes(template_id)
    workflow = await db.get(PerformanceTemplateWorkflow, template_id)
    return {
        "template_id": template_id,
        "nodes": nodes,
        "distribution_assessment_options": distribution_assessment_options(nodes, list((workflow.content_library if workflow else []) or [])),
    }


@router.get("/cycles/{cycle_id}/evaluator-options")
async def evaluator_options(
    cycle_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    cycle = await _get_cycle(db, cycle_id)
    await _assert_cycle_project_view(db, cycle, context)
    try:
        return await PerformanceProjectService(db).evaluator_options(cycle)
    except ProjectValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

@router.post("/cycles/{cycle_id}/evaluator-preview", response_model=EvaluatorPreviewResponse)
async def evaluator_preview(
    cycle_id: int,
    payload: EvaluatorPreviewPayload,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    cycle = await _get_cycle(db, cycle_id)
    await _assert_cycle_project_view(db, cycle, context)
    if payload.project_id is not None:
        project = await _get_project(db, payload.project_id)
        if project.cycle_ref != cycle.cycle_ref or not _can_manage_project(context, project):
            raise HTTPException(status_code=403, detail="无权预览当前项目被评估人")
    try:
        rules = PerformanceProjectService._validate_rules(payload.evaluator_rules)
        scope_rules = PerformanceProjectService._validate_scope_rules(payload.scope_rules)
        service = PerformanceProjectService(db)
        settings = {"evaluator_rules": rules, "scope_rules": scope_rules}
        matched, task_people, report_only = await service.preview_people(cycle, settings, project_id=payload.project_id)
        group_counts = []
        for index in range(len(rules.get("groups") or [])):
            group_matched, _group_tasks, _group_report_only = await service.preview_people(cycle, settings, group_index=index, project_id=payload.project_id)
            group_counts.append(len(group_matched))
    except ProjectValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return EvaluatorPreviewResponse(
        matched_count=len(matched),
        task_generation_count=len(task_people),
        report_count=len(matched),
        report_only_count=len(report_only),
        group_counts=group_counts,
    )


def _preview_person(person, report_only_numbers: set[str]) -> EvaluatorPreviewPerson:
    return EvaluatorPreviewPerson(
        employee_no=person.employee_no,
        display_name=person.display_name,
        direct_supervisor=person.direct_supervisor_source_value,
        company_org=person.company_org,
        department=person.department,
        department_2=person.department_2,
        department_3=person.department_3,
        job_family=person.job_family,
        job_category=person.job_category,
        standard_position=person.standard_position,
        employment_status=person.employment_status,
        live_employment_status=getattr(person, "live_employment_status", None) if getattr(person, "live_employment_status", None) is not None else person.employment_status,
        status="report_only" if person.employee_no in report_only_numbers else "task",
        report_only=person.employee_no in report_only_numbers,
    )


@router.post("/cycles/{cycle_id}/evaluator-preview/people", response_model=EvaluatorPreviewPeoplePage)
async def evaluator_preview_people(
    cycle_id: int,
    payload: EvaluatorPreviewPayload,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    keyword: str | None = Query(default=None, max_length=100),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    cycle = await _get_cycle(db, cycle_id)
    await _assert_cycle_project_view(db, cycle, context)
    if payload.project_id is not None:
        project = await _get_project(db, payload.project_id)
        if project.cycle_ref != cycle.cycle_ref or not _can_manage_project(context, project):
            raise HTTPException(status_code=403, detail="无权预览当前项目被评估人")
    try:
        rules = PerformanceProjectService._validate_rules(payload.evaluator_rules)
        scope_rules = PerformanceProjectService._validate_scope_rules(payload.scope_rules)
        matched, task_people, report_only = await PerformanceProjectService(db).preview_people(
            cycle,
            {"evaluator_rules": rules, "scope_rules": scope_rules},
            group_index=payload.group_index,
            project_id=payload.project_id,
        )
    except ProjectValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    selected = matched if payload.list_kind == "matched" else task_people if payload.list_kind == "task" else report_only
    if keyword and keyword.strip():
        needle = keyword.strip().casefold()
        selected = [person for person in selected if needle in f"{person.display_name} {person.employee_no}".casefold()]
    report_only_numbers = {person.employee_no for person in report_only}
    items = [_preview_person(person, report_only_numbers) for person in selected]
    start = (page - 1) * page_size
    return EvaluatorPreviewPeoplePage(items=items[start:start + page_size], total=len(items), page=page, page_size=page_size)


@router.post("/cycles/{cycle_id}/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    cycle_id: int,
    payload: ProjectPayload,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    if not _is_cycle_manager(context):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅周期管理员可创建项目")
    cycle = await _get_cycle(db, cycle_id)
    data = payload.model_dump()
    try:
        if data.get("evaluator_rules") is not None:
            data["evaluator_rules"] = PerformanceProjectService._validate_rules(data.get("evaluator_rules"))
        service = PerformanceProjectService(db)
        settings = {"evaluator_rules": data.get("evaluator_rules") or {"groups": []}, "scope_rules": data.get("scope_rules") or {"groups": []}}
        _matched, task_people, _report_only = await service.preview_people(cycle, settings)
        data["evaluated_count"] = len(task_people)
        project = await service.create_project(
            cycle.cycle_ref, data, actor_type=context.subject_type, actor_id=context.subject_id
        )
    except ProjectValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return ProjectResponse(**PerformanceProjectService.serialize(project))


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    project = await _get_project(db, project_id)
    if not _can_manage_project(context, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看当前项目")
    return ProjectResponse(**PerformanceProjectService.serialize(project))

@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    payload: ProjectPayload,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    project = await _get_project(db, project_id)
    if not _can_manage_project(context, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权管理当前项目")
    cycle = await db.scalar(select(PerformanceCycle).where(PerformanceCycle.cycle_ref == project.cycle_ref))
    data = payload.model_dump(exclude_unset=True)
    try:
        if data.get("evaluator_rules") is not None:
            data["evaluator_rules"] = PerformanceProjectService._validate_rules(data.get("evaluator_rules"))
        if data.get("evaluator_rules") is not None or data.get("scope_rules") is not None:
            preview_settings = {**(project.settings or {}), **data}
            _matched, task_people, _report_only = await PerformanceProjectService(db).preview_people(cycle, preview_settings, project_id=project.id)
            data["evaluated_count"] = len(task_people)
        project = await PerformanceProjectService(db).update_project(
            project, data, actor_type=context.subject_type, actor_id=context.subject_id
        )
    except ProjectValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return ProjectResponse(**PerformanceProjectService.serialize(project))


@router.post("/projects/{project_id}/calibration-preview")
async def calibration_preview(project_id: int, payload: ProjectPayload, context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session)):
    project = await _get_project(db, project_id)
    if not _can_manage_project(context, project):
        raise HTTPException(status_code=403, detail="无权查看当前项目校准范围")
    try:
        return await PerformanceProjectService(db).calibration_preview(project, payload.model_dump(exclude_unset=True))
    except ProjectValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/projects/{project_id}/workflow-nodes/backfill")
async def backfill_project_workflow_nodes(
    project_id: int,
    payload: ProjectWorkflowNodesBackfillPayload,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    project = await _get_project(db, project_id)
    if not _can_manage_project(context, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权管理当前项目")
    try:
        node_ids = await PerformanceProjectService(db).backfill_workflow_nodes(
            project, payload.node_times, actor_type=context.subject_type, actor_id=context.subject_id
        )
    except ProjectValidationError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return {"project_id": project_id, "created_node_ids": node_ids}


@router.post("/projects/{project_id}/start", response_model=ProjectResponse)
async def start_project(
    project_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    project = await _get_project(db, project_id)
    if not _can_manage_project(context, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权管理当前项目")
    try:
        project = await PerformanceProjectService(db).start_project(
            project, actor_type=context.subject_type, actor_id=context.subject_id
        )
    except ProjectValidationError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return ProjectResponse(**PerformanceProjectService.serialize(project))




_REVIEW_CATEGORY_LABELS = {
    "mine": "我的绩效",
    "others": "给他人的评估",
    "team": "我团队的绩效",
    "other": "其他事项",
}

_PROJECT_MANAGEMENT_CATEGORY = {"key": "admin", "label": "项目管理员"}

_COMPLETION_NODE_DEFINITIONS = (
    ("work-summary", "填写工作总结"),
    ("self-review", "自评"),
    ("review-360", "360°反馈（自愿评估）"),
    ("manager-review", "上级评估"),
    ("calibration", "绩效校准"),
    ("communicate", "绩效沟通并开通结果"),
    ("view-result", "查看绩效结果"),
    ("result-reconsideration", "结果复议处理"),
)


def _completion_node_key(node: PerformanceProjectNodeSnapshot, template: dict | None = None) -> str | None:
    template = template if template is not None else ((node.config or {}).get("template") or {})
    if node.node_type == "work_summary":
        return "work-summary"
    if node.node_type in {"reviewer_360_invite", "reviewer_360_confirm"}:
        return "review-360"
    if node.node_type == "evaluation":
        role_code = node_role_code(template)
        if role_code == ROLE_REVIEWEE:
            return "self-review"
        if role_code == ROLE_REVIEWER_360:
            return "review-360"
        if role_code in MANAGER_ROLE_CODES:
            return "manager-review"
    return {
        "calibration": "calibration",
        "result_communication": "communicate",
        "result_view": "view-result",
        "result_reconsideration": "result-reconsideration",
    }.get(node.node_type)


async def _completion_node_template(db: AsyncSession, project: PerformanceProject, node: PerformanceProjectNodeSnapshot) -> dict:
    return (node.config or {}).get("template") or {}


def _safe_node_time(value: object) -> datetime | None:
    if not value:
        return None
    try:
        parsed = _parse_time(value)
    except (TypeError, ValueError, ProjectValidationError):
        return None
    return parsed


def _completion_node_status(starts: list[datetime], deadlines: list[datetime], completed: int, total: int, now: datetime) -> str:
    if starts and all(start > now for start in starts):
        return "not_started"
    if total > 0 and completed >= total:
        return "completed"
    if deadlines and all(deadline < now for deadline in deadlines):
        return "overdue"
    return "active"


def _completion_task_counts(node, tasks):
    if node.node_type == "calibration":
        groups = {}
        for task in tasks:
            if calibration_task_scope(task, node):
                groups.setdefault((task.phase_id, task.handler_ref), []).append(task)
        return sum(all(_task_completed(task) for task in group) for group in groups.values()), len(groups)
    return sum(_task_completed(task) for task in tasks), len(tasks)


async def _project_completion_nodes(projects: list[PerformanceProject], db: AsyncSession, now: datetime | None = None, scopes: dict[int, set[str] | None] | None = None) -> list[dict]:
    current = now or datetime.now(UTC)
    states = {
        key: {
            "configured": 0, "starts": [], "deadlines": [], "completed": 0, "total": 0,
            "available_pending": 0, "title": title, "node_type": None,
        }
        for key, title in _COMPLETION_NODE_DEFINITIONS
    }
    for project in projects:
        snapshot_id = await db.scalar(select(_latest_member_snapshot_statement(project.id)))
        if snapshot_id is None:
            continue
        members = list((await db.execute(select(PerformanceProjectMember).where(
            PerformanceProjectMember.snapshot_id == snapshot_id,
        ))).scalars().all())
        nodes = list((await db.execute(select(PerformanceProjectNodeSnapshot).where(
            PerformanceProjectNodeSnapshot.project_id == project.id,
        ).order_by(PerformanceProjectNodeSnapshot.node_order))).scalars().all())
        tasks = list((await db.execute(select(PerformanceNodeTask).where(
            PerformanceNodeTask.project_id == project.id,
            PerformanceNodeTask.member_snapshot_id == snapshot_id,
        ))).scalars().all())
        opened_people = set((await db.execute(select(PerformanceResultOpening.employee_no).where(
            PerformanceResultOpening.project_id == project.id,
        ))).scalars().all())
        scope = scopes.get(project.id) if scopes is not None else None
        if scope is not None:
            members = [member for member in members if member.employee_no in scope]
            tasks = [task for task in tasks if task.target_employee_no in scope]
            opened_people.intersection_update(scope)
        tasks_by_node: dict[int, list[PerformanceNodeTask]] = {}
        for task in tasks:
            tasks_by_node.setdefault(task.node_snapshot_id, []).append(task)
        for node in nodes:
            template = await _completion_node_template(db, project, node)
            key = _completion_node_key(node, template)
            if key is None:
                continue
            state = states[key]
            state["configured"] += 1
            state["title"] = str(template.get("name") or getattr(node, "name", None) or state["title"])
            state["node_type"] = node.node_type
            timing = _node_timing(project, node) or {}
            start_at = _safe_node_time(timing.get("start_at"))
            deadline_at = _safe_node_time(timing.get("end_at") or timing.get("appeal_deadline"))
            if start_at is not None:
                state["starts"].append(start_at)
            if deadline_at is not None:
                state["deadlines"].append(deadline_at)
            node_tasks = tasks_by_node.get(node.id, [])
            if node.node_type == "result_view":
                total = len(members)
                completed = sum(member.employee_no in opened_people for member in members)
            else:
                completed, total = _completion_task_counts(node, node_tasks)
                state["available_pending"] += sum(
                    1 for task in node_tasks
                    if not _task_completed(task) and task.status == "pending" and _task_is_available(task, node, project, current)
                )
            state["total"] += total
            state["completed"] += completed

    result = []
    for key, fallback_title in _COMPLETION_NODE_DEFINITIONS:
        state = states[key]
        if not state["configured"]:
            result.append({
                "key": key, "title": fallback_title, "status": "unavailable",
                "completed_count": 0, "total_count": 0, "completion_rate": None, "deadline_at": None,
                "configured": False, "can_remind": False, "reminder_title": None, "reminder_description": None,
            })
            continue
        completed = state["completed"]
        total = state["total"]
        status_value = _completion_node_status(state["starts"], state["deadlines"], completed, total, current)
        reminder_title = state["title"]
        can_remind = bool(
            key not in {"view-result", "result-reconsideration"}
            and status_value in {"active", "overdue"}
            and state["available_pending"] > 0
        )
        result.append({
            "key": key,
            "title": state["title"],
            "status": status_value,
            "completed_count": completed,
            "total_count": total,
            "completion_rate": round(completed * 100 / total, 2) if total else 0,
            "deadline_at": min(state["deadlines"]) if state["deadlines"] else None,
            "can_remind": can_remind,
            "reminder_title": reminder_title,
            "configured": True,
        })
    return result


def _person_in_project_administrators(project: PerformanceProject, display_name: str | None) -> bool:
    """Match the actor against project administrators (stored by display name today)."""
    if not display_name:
        return False
    return display_name in (project.administrators or [])


def _organization_in_scope(organization: str | None, scopes: list[str]) -> bool:
    value = str(organization or '').strip()
    return bool(value and any(value == scope or value.startswith(f'{scope}/') for scope in scopes))


async def _person_hrbp_permissions(db: AsyncSession, actor_ref: str, cycle_ref: str | None = None) -> list[PerformanceHrbpPermission]:
    statement = select(PerformanceHrbpPermission).where(
        PerformanceHrbpPermission.hrbp_employee_no == actor_ref,
    )
    if cycle_ref is not None:
        statement = statement.where(PerformanceHrbpPermission.cycle_ref == cycle_ref)
    try:
        result = await db.execute(statement)
        scalars = getattr(result, "scalars", None)
        return list(scalars().all()) if scalars is not None else []
    except (AttributeError, AssertionError):
        return []


async def _person_hrbp_invisible_people(db: AsyncSession, actor_ref: str, cycle_ref: str) -> set[str]:
    permissions = await _person_hrbp_permissions(db, actor_ref, cycle_ref)
    return {
        employee_no
        for permission in permissions
        for employee_no in (permission.invisible_people or [])
        if employee_no
    }


async def _person_hrbp_project_refs(db: AsyncSession, actor_ref: str) -> set[str]:
    """Return started projects in the actor's configured HRBP scope."""
    permissions = await _person_hrbp_permissions(db, actor_ref)
    if not permissions:
        return set()
    project_rows = list((await db.execute(
        select(PerformanceProject).where(PerformanceProject.status == PROJECT_STATUS_STARTED)
    )).scalars().all())
    if not project_rows:
        return set()
    project_ids = [project.id for project in project_rows]
    member_rows = list((await db.execute(
        select(PerformanceProjectMember, PerformanceProjectMemberSnapshot)
        .join(PerformanceProjectMemberSnapshot, PerformanceProjectMemberSnapshot.id == PerformanceProjectMember.snapshot_id)
        .where(PerformanceProjectMemberSnapshot.project_id.in_(project_ids))
    )).all())
    permissions_by_cycle = {}
    for permission in permissions:
        permissions_by_cycle.setdefault(permission.cycle_ref, []).append(permission)
    refs = set()
    for project in project_rows:
        for permission in permissions_by_cycle.get(project.cycle_ref, []):
            if any(_organization_in_scope(member.organization_ref, permission.scope or []) for member, snapshot in member_rows if snapshot.project_id == project.id):
                refs.add(project.project_ref)
                break
    return refs


@router.get("/navigation")
async def frontend_navigation(
    cycle_id: int | None = Query(default=None, ge=1),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    access = await resolve_frontend_access(db, context)
    cycles = [cycle_payload(cycle) for cycle in access.cycles]
    active_cycle = None
    if cycle_id is not None:
        active_cycle = next((item for item in cycles if item["cycle_id"] == cycle_id), None)
        if active_cycle is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CYCLE_NOT_FOUND")
    elif cycles:
        active_cycle = cycles[0]
    active_cycle_id = active_cycle["cycle_id"] if active_cycle else None
    return {
        "cycles": cycles,
        "active_cycle": active_cycle,
        "can_review": bool(active_cycle_id and any(cycle.id == active_cycle_id for _project, cycle in access.review_projects)),
        "can_manage": bool(active_cycle and next((cycle.cycle_ref for cycle in access.cycles if cycle.id == active_cycle_id), None) in access.manageable_cycle_refs),
        "review_projects": [
            project_payload(project, cycle)
            for project, cycle in access.review_projects
            if cycle.id == active_cycle_id
        ],
    }


async def _managed_completion_projects(cycle_id: int, context: PerformanceAccessContext, db: AsyncSession) -> list[tuple[PerformanceProject, set[str] | None]]:
    access = await resolve_frontend_access(db, context)
    cycle = next((cycle for cycle in access.cycles if cycle.id == cycle_id), None)
    if cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CYCLE_NOT_FOUND")
    managed = [(project, cycle_item) for project, cycle_item in access.manage_projects if cycle_item.id == cycle_id]
    if not managed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CYCLE_NOT_FOUND")
    result: list[tuple[PerformanceProject, set[str] | None]] = []
    for project, _cycle in managed:
        try:
            scope = await _project_data_scope(context, project, db, "performance.frontend.progress")
        except HTTPException as exc:
            if exc.status_code == status.HTTP_403_FORBIDDEN:
                continue
            raise
        result.append((project, scope))
    if not result:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="PROJECT_DATA_FORBIDDEN")
    return result


async def _completion_reminder_rows(cycle_id: int, node_key: str, context: PerformanceAccessContext, db: AsyncSession, keyword: str | None = None) -> list[dict]:
    if node_key not in {key for key, _title in _COMPLETION_NODE_DEFINITIONS} or node_key in {"view-result", "result-reconsideration"}:
        raise HTTPException(status_code=422, detail="REMINDER_NODE_NOT_SUPPORTED")
    projects = await _managed_completion_projects(cycle_id, context, db)
    visibility_rules = await load_subject_visibility_rules(db)
    actor = await resolve_trusted_performance_actor(db, context)
    search = (keyword or '').strip().lower()
    rows: list[dict] = []
    for project, scope in projects:
        snapshot_id = await db.scalar(select(_latest_member_snapshot_statement(project.id)))
        if snapshot_id is None:
            continue
        members = list((await db.execute(select(PerformanceProjectMember).where(PerformanceProjectMember.snapshot_id == snapshot_id))).scalars().all())
        if scope is not None:
            members = [member for member in members if member.employee_no in scope]
        member_by_employee = {member.employee_no: member for member in members}
        snapshot = await db.get(PerformanceProjectMemberSnapshot, snapshot_id)
        people = list((await db.execute(select(PerformanceAuthorizationSnapshotPerson).where(
            PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.source_snapshot_id,
        ))).scalars().all())
        people_by_no = {person.employee_no: person for person in people}
        handler_names = {person.employee_no: person.display_name for person in people}
        progress = await _communication_progress(db, project, set(member_by_employee))
        previous_levels = await _previous_published_position_levels(db, project, set(member_by_employee))
        _ratings, final_values, _scales = await _project_final_ratings(project, set(member_by_employee), db, member_snapshot_id=snapshot_id)
        delivery_handlers = set((await db.execute(select(PerformanceIdentityLink.employee_no).join(
            User, User.id == PerformanceIdentityLink.portal_user_id,
        ).where(PerformanceIdentityLink.employee_no.in_(list(people_by_no)), PerformanceIdentityLink.is_active.is_(True), User.is_active.is_(True), User.feishu_user_id.is_not(None), User.feishu_user_id != ""))).scalars().all())
        nodes = list((await db.execute(select(PerformanceProjectNodeSnapshot).where(PerformanceProjectNodeSnapshot.project_id == project.id).order_by(PerformanceProjectNodeSnapshot.node_order))).scalars().all())
        for node in nodes:
            template = await _completion_node_template(db, project, node)
            if _completion_node_key(node, template) != node_key:
                continue
            tasks = list((await db.execute(select(PerformanceNodeTask).where(
                PerformanceNodeTask.project_id == project.id,
                PerformanceNodeTask.member_snapshot_id == snapshot_id,
                PerformanceNodeTask.node_snapshot_id == node.id,
                PerformanceNodeTask.status == "pending",
            ).order_by(PerformanceNodeTask.id))).scalars().all())
            for task in tasks:
                if (task.target_employee_no not in member_by_employee or _task_completed(task)
                    or not _task_is_available(task, node, project)
                    or (node.node_type == "calibration" and not calibration_task_scope(task, node))):
                    continue
                member = member_by_employee[task.target_employee_no]
                if search and search not in f"{member.display_name} {member.employee_no}".lower():
                    continue
                visibility_role = await resolve_subject_visibility_role(db, context, str(actor.actor_ref), member, node, project)
                visible_fields = visibility_rules[visibility_role]
                handlers = await _task_handlers(db, task)
                eligible_handlers = handlers & delivery_handlers
                values = {
                    "task_id": task.id,
                    "aggregate_task_id": task.id,
                    "employee_no": member.employee_no,
                    "display_name": member.display_name,
                    "status": _review_task_status(task, *[value.isoformat() if value else None for value in _task_window(task, node, project)]),
                    "project_id": project.id,
                    "project_name": project.name,
                    "rating": final_values[task.target_employee_no][3]["label"] if task.target_employee_no in final_values else None,
                    "organization_path": getattr(member, "organization_ref", None) if "department" in visible_fields else None,
                    "previous_position_level": previous_levels.get(task.target_employee_no) if "position_level" in visible_fields else None,
                    "job_category": member.job_category if "job_sequence" in visible_fields else None,
                    "reminder_target": "、".join(handler_names.get(handler, handler) for handler in sorted(handlers)),
                    "completion": progress.get(task.target_employee_no, "0/0"),
                    "direct_supervisor": handler_names.get(member.direct_supervisor_employee_no),
                    "hrbp": handler_names.get(str(member.hrbp_employee_no), str(member.hrbp_employee_no) if member.hrbp_employee_no else None),
                    "job_sequence": format_job_sequence(member.job_family, member.job_category),
                    "position_level": member.position_level,
                    "hire_date": member.hire_date.isoformat() if member.hire_date else None,
                    "department": organization_leaf(member),
                    "employee_type": member.employee_type,
                    "employment_status": member.employment_status,
                    "due_at": _task_window(task, node, project)[1],
                    "visible_profile_fields": visible_fields,
                    "can_authorize": await _authorize_task_delegation(task, node, project, context, str(actor.actor_ref), db),
                    "selectable": any(handler in people_by_no and getattr(people_by_no[handler], "employment_status", None) not in {"离职", "已离职"} for handler in eligible_handlers),
                    "unavailable_reason": None if eligible_handlers else "处理人未关联可用的飞书账号",
                }
                rows.append(mask_profile_values(values, visible_fields))
    return rows


async def _authorize_task_delegation(task: PerformanceNodeTask, node: PerformanceProjectNodeSnapshot, project: PerformanceProject, context: PerformanceAccessContext, actor_ref: str, db: AsyncSession) -> bool:
    if node.node_type == "calibration":
        if not calibration_task_scope(task, node):
            return False
    active = await _task_delegations(db, task.id)
    if node.node_type == "calibration" and any(item.recipient_employee_no == actor_ref and (item.authorization_settings or {}).get("allow_reauthorize") for item in active):
        return True
    if node.node_type == "calibration":
        calibration = (node.config or {}).get("calibration") or {}
        phase = next((item for item in calibration.get("phases", []) if item.get("phase_id") == task.phase_id), {})
        assignment = next((item for item in phase.get("assignments", []) if item.get("handler_ref") == task.handler_ref and item.get("employee_no") == task.target_employee_no), {})
        if not assignment.get("allow_authorize"):
            return False
    transfers = [item for item in active if item.authorization_type == "TRANSFER"]
    if (not transfers and str(task.handler_ref) == actor_ref) or any(item.recipient_employee_no == actor_ref for item in transfers):
        return True
    try:
        scope = await _project_data_scope(context, project, db, "performance.frontend.progress")
    except HTTPException as exc:
        if exc.status_code == 403:
            return False
        raise
    return scope is None or task.target_employee_no in scope


@router.get("/projects/{project_id}/tasks/{task_id}/delegation-candidates")
async def task_delegation_candidates(
    project_id: int,
    task_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    row = (await db.execute(select(PerformanceNodeTask, PerformanceProjectNodeSnapshot, PerformanceProject).join(
        PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id,
    ).join(PerformanceProject, PerformanceProject.id == PerformanceNodeTask.project_id).where(
        PerformanceNodeTask.id == task_id, PerformanceProject.id == project_id,
    ))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="TASK_NOT_FOUND")
    task, node, project = row
    actor = await resolve_trusted_performance_actor(db, context, cycle_ref=project.cycle_ref, require_employee_identity=True)
    if not await _authorize_task_delegation(task, node, project, context, actor.actor_ref, db):
        raise HTTPException(status_code=403, detail="TASK_AUTHORIZATION_FORBIDDEN")
    snapshot = await db.get(PerformanceProjectMemberSnapshot, task.member_snapshot_id)
    people = list((await db.execute(select(PerformanceAuthorizationSnapshotPerson).where(
        PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.source_snapshot_id,
    ))).scalars().all())
    setting = await db.get(PerformanceOtherSetting, 1)
    restrict_subordinates = node.node_type == "calibration" and setting and not setting.calibration_authorization_outside_direct_reports_enabled
    scope = await _project_data_scope(context, project, db, "performance.frontend.progress") if {"performance.projects.manage", "performance.cycles.manage"}.intersection(context.permission_codes) else None
    return [{"employee_no": person.employee_no, "display_name": person.display_name, "department_path": "/".join(str(getattr(person, key)) for key in ("company_org", "department", "department_2", "department_3", "department_4", "department_5") if getattr(person, key, None)), "direct_supervisor_employee_no": person.direct_supervisor_employee_no} for person in people
            if person.employee_no != task.handler_ref and person.employment_status not in {"离职", "已离职"}
            and (scope is None or person.employee_no in scope)
            and (not restrict_subordinates or person.direct_supervisor_employee_no == task.handler_ref)]


@router.post("/projects/{project_id}/tasks/{task_id}/delegations")
async def create_task_delegation(
    project_id: int,
    task_id: int,
    payload: PerformanceTaskAuthorizationPayload,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    row = (await db.execute(select(PerformanceNodeTask, PerformanceProjectNodeSnapshot, PerformanceProject).join(
        PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id,
    ).join(PerformanceProject, PerformanceProject.id == PerformanceNodeTask.project_id).where(
        PerformanceNodeTask.id == task_id, PerformanceProject.id == project_id,
        PerformanceProject.status == PROJECT_STATUS_STARTED,
    ))).first()
    if not row:
        raise HTTPException(status_code=404, detail="TASK_NOT_FOUND")
    task, node, project = row
    await db.refresh(task, with_for_update=True)
    current_snapshot_id = await db.scalar(select(_latest_member_snapshot_statement(project.id)))
    if task.member_snapshot_id != current_snapshot_id or node.project_id != project.id:
        raise HTTPException(status_code=409, detail="TASK_SNAPSHOT_NOT_CURRENT")
    actor = await resolve_trusted_performance_actor(db, context, cycle_ref=project.cycle_ref, require_employee_identity=True)
    if not await _authorize_task_delegation(task, node, project, context, actor.actor_ref, db):
        raise HTTPException(status_code=403, detail="TASK_AUTHORIZATION_FORBIDDEN")
    snapshot = await db.get(PerformanceProjectMemberSnapshot, task.member_snapshot_id)
    recipient = await db.scalar(select(PerformanceAuthorizationSnapshotPerson).where(
        PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.source_snapshot_id,
        PerformanceAuthorizationSnapshotPerson.employee_no == payload.recipient_employee_no,
    ))
    if recipient is None or recipient.employee_no == task.handler_ref or recipient.employment_status in {"离职", "已离职"}:
        raise HTTPException(status_code=422, detail="TASK_AUTHORIZATION_RECIPIENT_INVALID")
    if node.node_type == "calibration":
        setting = await db.get(PerformanceOtherSetting, 1)
        if setting and not setting.calibration_authorization_outside_direct_reports_enabled and recipient.direct_supervisor_employee_no != task.handler_ref:
            raise HTTPException(status_code=403, detail="CALIBRATION_RECIPIENT_OUTSIDE_SCOPE")
    if not _task_is_available(task, node, project):
        raise HTTPException(status_code=409, detail="TASK_NOT_STARTED")
    if node.node_type == "calibration" and payload.action == "TRANSFER":
        raise HTTPException(status_code=422, detail="CALIBRATION_TRANSFER_NOT_SUPPORTED")
    if node.node_type != "calibration" and not payload.reason.strip():
        raise HTTPException(status_code=422, detail="TASK_AUTHORIZATION_REASON_REQUIRED")
    if _task_completed(task) and node.node_type != "calibration":
        raise HTTPException(status_code=409, detail="TASK_ALREADY_COMPLETED")
    if node.node_type == "calibration" and payload.distribution_mode == "NONE":
        raise HTTPException(status_code=422, detail="CALIBRATION_DISTRIBUTION_OVERRIDE_UNSUPPORTED")
    if node.node_type == "calibration":
        calibration_settings = (((project.settings or {}).get("flow_settings") or {}).get("node_settings") or {}).get(node.node_id, {}).get("calibration") or {}
        if calibration_settings.get("force_distribution_enabled"):
            raise HTTPException(status_code=409, detail="CALIBRATION_DISTRIBUTION_AUTHORIZATION_UNSUPPORTED")
    if node.node_type == "calibration" and payload.scope_mode == "PARTIAL":
        target = await db.scalar(select(PerformanceProjectMember).where(PerformanceProjectMember.snapshot_id == task.member_snapshot_id, PerformanceProjectMember.employee_no == task.target_employee_no))
        in_scope = target is not None and (
            (payload.scope_kind == "DIRECT_SUBORDINATES" and target.direct_supervisor_employee_no == recipient.employee_no)
            or (payload.scope_kind == "PEOPLE" and task.target_employee_no in payload.selected_employee_nos)
            or (payload.scope_kind == "DEPARTMENT" and any(_organization_in_scope(target.organization_ref, [path]) for path in payload.department_paths))
        )
        if not in_scope:
            raise HTTPException(status_code=422, detail="CALIBRATION_AUTHORIZATION_SCOPE_MISMATCH")
    active = await _task_delegations(db, task.id)
    if payload.action == "TRANSFER":
        for item in active:
            item.status = "REPLACED"
    elif any(item.authorization_type == "AUTHORIZE" and item.recipient_employee_no == recipient.employee_no for item in active):
        raise HTTPException(status_code=409, detail="TASK_ALREADY_AUTHORIZED")
    parent = next((item for item in active if item.recipient_employee_no == actor.actor_ref and (item.authorization_settings or {}).get("allow_reauthorize")), None) if actor.actor_ref != str(task.handler_ref) else None
    authorization_settings = payload.model_dump(exclude={"action", "recipient_employee_no", "reason"})
    if parent:
        authorization_settings["parent_authorization_id"] = parent.id
    record = PerformanceNodeTaskAuthorization(
        task_id=task.id, project_id=project.id, cycle_ref=project.cycle_ref,
        authorization_type=payload.action, grantor_employee_no=actor.actor_ref,
        recipient_employee_no=recipient.employee_no, reason=payload.reason.strip(), status="ACTIVE",
        read_only=_task_completed(task) or bool(parent and parent.read_only), authorization_settings=authorization_settings,
    )
    db.add(record)
    await db.flush()
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PERFORMANCE_TASK_TRANSFERRED" if payload.action == "TRANSFER" else "PERFORMANCE_TASK_AUTHORIZED",
        cycle_ref=project.cycle_ref, employee_no=task.target_employee_no,
        actor_type=actor.actor_type, actor_ref=actor.actor_ref,
        subject_type="PERFORMANCE_NODE_TASK", subject_ref=str(task.id),
        after_state={"project_id": project.id, "authorization_id": str(record.id), "authorization_type": payload.action,
                     "recipient_employee_no": recipient.employee_no, "recipient_name": recipient.display_name,
                     "initiator_name": context.display_name or actor.actor_ref,
                     "stage_names": [node.name], "reviewee_names": [task.target_employee_no], "reason": record.reason},
    ))
    notification_status = "not_requested"
    if payload.notify_original:
        original_user = await db.scalar(select(User).join(PerformanceIdentityLink, PerformanceIdentityLink.portal_user_id == User.id).where(
            PerformanceIdentityLink.employee_no == task.handler_ref, PerformanceIdentityLink.is_active.is_(True), User.is_active.is_(True),
        ))
        if original_user and original_user.feishu_user_id:
            notice_result = await send_notification(NotificationConfig(
                receivers=[FixedUsersRule(type="fixed_users", user_ids=[original_user.id])],
                message=MessageConfig(title_template="绩效任务授权通知", content_template="项目“{{project_name}}”中的“{{node_name}}”已授权给{{recipient_name}}处理。"),
            ), {"project_name": project.name, "node_name": node.name, "recipient_name": recipient.display_name}, db,
                biz_type="performance_task_authorization", biz_id=str(record.id))
            notification_status = "preview_only" if "NOTIFICATION_PREVIEW_ONLY" in notice_result.errors else notice_result.status
        else:
            notification_status = "recipient_unmapped"
    record.authorization_settings = {**record.authorization_settings, "notification_status": notification_status}
    await db.commit()
    return {"id": record.id, "task_id": task.id, "authorization_type": record.authorization_type, "status": record.status, "read_only": record.read_only, "notification_status": notification_status}


@router.get("/projects/{project_id}/tasks/{task_id}/delegations")
async def list_task_delegations(
    project_id: int,
    task_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    row = (await db.execute(select(PerformanceNodeTask, PerformanceProjectNodeSnapshot, PerformanceProject).join(
        PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id,
    ).join(PerformanceProject, PerformanceProject.id == PerformanceNodeTask.project_id).where(PerformanceNodeTask.id == task_id, PerformanceProject.id == project_id))).first()
    if not row:
        raise HTTPException(status_code=404, detail="TASK_NOT_FOUND")
    task, node, project = row
    await db.refresh(task, with_for_update=True)
    actor = await resolve_trusted_performance_actor(db, context, cycle_ref=project.cycle_ref, require_employee_identity=True)
    if not await _authorize_task_delegation(task, node, project, context, actor.actor_ref, db):
        raise HTTPException(status_code=403, detail="TASK_AUTHORIZATION_FORBIDDEN")
    return [{"id": item.id, "authorization_type": item.authorization_type, "grantor_employee_no": item.grantor_employee_no,
             "recipient_employee_no": item.recipient_employee_no, "reason": item.reason, "status": item.status,
             "created_at": item.created_at, "can_revoke": item.status == "ACTIVE" and item.grantor_employee_no == actor.actor_ref}
            for item in await _task_delegations(db, task.id)]


@router.delete("/projects/{project_id}/tasks/{task_id}/delegations/{authorization_id}")
async def revoke_task_delegation(
    project_id: int,
    task_id: int,
    authorization_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    row = (await db.execute(select(PerformanceNodeTask, PerformanceProjectNodeSnapshot, PerformanceProject, PerformanceNodeTaskAuthorization).join(
        PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id,
    ).join(PerformanceProject, PerformanceProject.id == PerformanceNodeTask.project_id).join(
        PerformanceNodeTaskAuthorization, PerformanceNodeTaskAuthorization.task_id == PerformanceNodeTask.id,
    ).where(PerformanceNodeTask.id == task_id, PerformanceProject.id == project_id,
            PerformanceNodeTaskAuthorization.id == authorization_id))).first()
    if not row:
        raise HTTPException(status_code=404, detail="TASK_AUTHORIZATION_NOT_FOUND")
    task, node, project, record = row
    await db.refresh(task, with_for_update=True)
    await db.refresh(record, with_for_update=True)
    actor = await resolve_trusted_performance_actor(db, context, cycle_ref=project.cycle_ref, require_employee_identity=True)
    if record.status != "ACTIVE":
        raise HTTPException(status_code=409, detail="TASK_AUTHORIZATION_NOT_ACTIVE")
    if record.grantor_employee_no != actor.actor_ref:
        scope = await _project_data_scope(context, project, db, "performance.frontend.progress")
        if scope is not None and task.target_employee_no not in scope:
            raise HTTPException(status_code=403, detail="TASK_AUTHORIZATION_REVOKE_FORBIDDEN")
    record.status = "REVOKED"
    record.revoked_by_employee_no = actor.actor_ref
    record.revoked_at = datetime.now(UTC)
    revoked_ids = {record.id}
    changed = True
    active_records = await _task_delegations(db, task.id)
    while changed:
        changed = False
        for child in active_records:
            parent_id = (child.authorization_settings or {}).get("parent_authorization_id")
            if child.id not in revoked_ids and parent_id in revoked_ids:
                child.status = "REPLACED"
                revoked_ids.add(child.id)
                changed = True
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PERFORMANCE_TASK_AUTHORIZATION_REVOKED", cycle_ref=project.cycle_ref,
        employee_no=task.target_employee_no, actor_type=actor.actor_type, actor_ref=actor.actor_ref,
        subject_type="PERFORMANCE_NODE_TASK", subject_ref=str(task.id),
        after_state={"project_id": project.id, "authorization_id": str(record.id), "recipient_employee_no": record.recipient_employee_no},
    ))
    await db.commit()
    return {"id": record.id, "status": record.status, "answer_version": task.answer_version}


@router.get("/project-management/reminder-people")
async def project_management_reminder_people(
    cycle_id: int = Query(..., ge=1),
    node_key: str = Query(..., min_length=1, max_length=64),
    keyword: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    rows = await _completion_reminder_rows(cycle_id, node_key, context, db, keyword)
    start = (page - 1) * page_size
    return {"items": rows[start:start + page_size], "total": len(rows), "page": page, "page_size": page_size}


async def _send_performance_task_reminder(task: PerformanceNodeTask, project: PerformanceProject, node: PerformanceProjectNodeSnapshot, actor: PerformanceAccessContext, db: AsyncSession) -> tuple[bool, str | None]:
    user = await db.scalar(select(User).join(PerformanceIdentityLink, PerformanceIdentityLink.portal_user_id == User.id).join(PerformanceAuthorizationSnapshotPerson, PerformanceAuthorizationSnapshotPerson.employee_no == PerformanceIdentityLink.employee_no).join(PerformanceProjectMemberSnapshot, PerformanceProjectMemberSnapshot.source_snapshot_id == PerformanceAuthorizationSnapshotPerson.snapshot_id).where(PerformanceIdentityLink.employee_no == str(task.handler_ref), PerformanceIdentityLink.is_active.is_(True), PerformanceAuthorizationSnapshotPerson.snapshot_id == PerformanceProjectMemberSnapshot.source_snapshot_id, PerformanceProjectMemberSnapshot.project_id == project.id, PerformanceProjectMemberSnapshot.id == task.member_snapshot_id))
    if user is None or not user.is_active or not user.feishu_user_id:
        return False, "TASK_HANDLER_IDENTITY_NOT_FOUND"
    config = NotificationConfig(
        receivers=[FixedUsersRule(type="fixed_users", user_ids=[user.id])],
        message=MessageConfig(
            title_template="绩效任务催办",
            content_template="请及时完成项目“{{project_name}}”中的“{{node_name}}”任务。",
        ),
    )
    result = await send_notification(
        config,
        {"employee_no": task.target_employee_no, "project_id": project.id, "task_id": task.id, "project_name": project.name, "node_name": node.name},
        db,
        biz_type="performance_task_reminder",
        biz_id=str(task.id),
        triggered_by=int(actor.subject_id) if str(actor.subject_id).isdigit() else None,
    )
    if "NOTIFICATION_PREVIEW_ONLY" in getattr(result, "errors", []):
        return False, "NOTIFICATION_PREVIEW_ONLY"
    return result.status == "success" and result.success_count > 0, None if result.status == "success" and result.success_count > 0 else result.status


@router.post("/project-management/remind")
async def project_management_remind(
    payload: CycleReminderTasksPayload,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    projects = await _managed_completion_projects(payload.cycle_id, context, db)
    project_ids = {project.id for project, _scope in projects}
    scopes = {project.id: scope for project, scope in projects}
    snapshot_ids = {project.id: await db.scalar(select(_latest_member_snapshot_statement(project.id))) for project, _scope in projects}
    actor = await resolve_trusted_performance_actor(db, context)
    eligible_rows = await _completion_reminder_rows(payload.cycle_id, payload.node_key, context, db)
    eligible_ids = {row["task_id"] for row in eligible_rows if row["selectable"]}
    task_ids = list(dict.fromkeys(payload.task_ids))
    rows = (await db.execute(
        select(PerformanceNodeTask, PerformanceProjectNodeSnapshot, PerformanceProject)
        .join(PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id)
        .join(PerformanceProject, PerformanceProject.id == PerformanceNodeTask.project_id)
        .where(PerformanceNodeTask.id.in_(task_ids), PerformanceNodeTask.project_id.in_(project_ids))
    )).all()
    by_id = {task.id: (task, node, project) for task, node, project in rows}
    accepted: list[int] = []
    skipped: list[int] = []
    failed: list[int] = []
    preview: list[int] = []
    errors: list[dict] = []
    deliveries = {}
    for task_id in task_ids:
        item = by_id.get(task_id)
        if item is None:
            skipped.append(task_id)
            continue
        task, node, project = item
        scope = scopes[project.id]
        if (task_id not in eligible_ids or task.member_snapshot_id != snapshot_ids[project.id]
            or node.project_id != project.id or task.cycle_ref != project.cycle_ref
            or (scope is not None and task.target_employee_no not in scope)
            or (node.node_type == "calibration" and not calibration_task_scope(task, node))
            or _completion_node_key(node) != payload.node_key
            or _task_completed(task) or task.status != "pending" or not _task_is_available(task, node, project)):
            skipped.append(task_id)
            continue
        outcomes = []
        for handler_ref in sorted(await _task_handlers(db, task)):
            delivery_key = (project.id, node.id, handler_ref, getattr(task, "phase_id", ""))
            if delivery_key not in deliveries:
                notification_task = SimpleNamespace(id=task.id, handler_ref=handler_ref, member_snapshot_id=task.member_snapshot_id, target_employee_no=task.target_employee_no)
                deliveries[delivery_key] = await _send_performance_task_reminder(notification_task, project, node, context, db)
            outcomes.append(deliveries[delivery_key])
        ok = bool(outcomes) and all(item[0] for item in outcomes)
        error = next((item[1] for item in outcomes if not item[0]), None)
        if ok:
            accepted.append(task_id)
            PerformanceAuditService(db).append_event(AuditEventInput(
                event_type="PERFORMANCE_TASK_REMINDER_REQUESTED",
                cycle_ref=project.cycle_ref,
                employee_no=task.target_employee_no,
                actor_type=actor.actor_type,
                actor_ref=actor.actor_ref,
                subject_type="PERFORMANCE_NODE_TASK",
                subject_ref=str(task.id),
                after_state={"action": "remind", "node_id": node.node_id, "delivery_status": "sent"},
            ))
        elif outcomes and all(item[0] or item[1] == "NOTIFICATION_PREVIEW_ONLY" for item in outcomes):
            preview.append(task_id)
        else:
            failed.append(task_id)
            errors.append({"task_id": task_id, "error": error or "NOTIFICATION_FAILED"})
    await db.commit()
    status_value = "preview_only" if preview and not accepted and not failed else "success" if accepted and not failed and not skipped else "partial_success" if accepted or preview else "failed"
    return {"accepted_task_ids": accepted, "skipped_task_ids": skipped, "failed_task_ids": failed, "preview_task_ids": preview, "delivery_status": status_value, "errors": errors}


@router.get("/project-management/overview")
async def project_management_overview(
    cycle_id: int | None = Query(default=None, ge=1),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    access = await resolve_frontend_access(db, context)
    cycles = [cycle_payload(cycle) for cycle in access.cycles]
    active_cycle = next((item for item in cycles if item["cycle_id"] == cycle_id), None) if cycle_id is not None else (cycles[0] if cycles else None)
    if cycle_id is not None and active_cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CYCLE_NOT_FOUND")
    if active_cycle is None:
        return {"cycles": [], "active_cycle": None, "projects": [], "completion_nodes": [], "hrbp_scope": [], "category": dict(_PROJECT_MANAGEMENT_CATEGORY)}
    managed = [(project, cycle) for project, cycle in access.manage_projects if cycle.id == active_cycle["cycle_id"]]
    active_ref = next(cycle.cycle_ref for cycle in access.cycles if cycle.id == active_cycle["cycle_id"])
    if active_ref not in access.manageable_cycle_refs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CYCLE_NOT_FOUND")
    scopes = {project.id: access.management_scopes[project.id] for project, _cycle in managed if "performance.frontend.progress" in access.management_features.get(project.id, set())}
    projects = [{
        "project_id": project.id,
        "project_name": project.name,
        "project_ref": project.project_ref,
        "status": project.status,
    } for project, _cycle in managed]
    projects.sort(key=lambda item: item["project_name"])
    active_projects = [project for project, _cycle in managed if project.id in scopes]
    completion_nodes = await _project_completion_nodes(active_projects, db, scopes=scopes) if active_projects else []
    hrbp_scope = sorted(project.project_ref for project, _cycle in managed if access.management_scopes.get(project.id) is not None)
    return {
        "cycles": cycles,
        "active_cycle": active_cycle,
        "projects": projects,
        "completion_nodes": completion_nodes,
        "hrbp_scope": hrbp_scope,
        "category": dict(_PROJECT_MANAGEMENT_CATEGORY),
    }


@router.get("/project-management/department-completion")
async def project_management_department_completion(
    cycle_id: int = Query(..., ge=1),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    projects = await _managed_completion_projects(cycle_id, context, db)
    totals = {}
    titles = {}
    for project, scope in projects:
        snapshot_id = await db.scalar(select(_latest_member_snapshot_statement(project.id)))
        if snapshot_id is None:
            continue
        members = list((await db.execute(select(PerformanceProjectMember).where(PerformanceProjectMember.snapshot_id == snapshot_id))).scalars().all())
        if scope is not None:
            members = [member for member in members if member.employee_no in scope]
        departments = {}
        for member in members:
            parts = [str(value) for key in ("company_org", "department", "department_2", "department_3", "department_4", "department_5") if (value := getattr(member, key, None))] or ["未分配部门"]
            for depth in range(1, len(parts) + 1):
                departments.setdefault(tuple(parts[:depth]), set()).add(member.employee_no)
        nodes = list((await db.execute(select(PerformanceProjectNodeSnapshot).where(PerformanceProjectNodeSnapshot.project_id == project.id).order_by(PerformanceProjectNodeSnapshot.node_order))).scalars().all())
        tasks = list((await db.execute(select(PerformanceNodeTask).where(PerformanceNodeTask.project_id == project.id, PerformanceNodeTask.member_snapshot_id == snapshot_id))).scalars().all())
        opened = set((await db.execute(select(PerformanceResultOpening.employee_no).where(PerformanceResultOpening.project_id == project.id))).scalars().all())
        for node in nodes:
            key = _completion_node_key(node)
            if key is None:
                continue
            titles.setdefault(key, node.name)
            for path, employee_nos in departments.items():
                target = totals.setdefault(path, {}).setdefault(key, [0, 0])
                if node.node_type == "result_view":
                    completed, total = len(opened & employee_nos), len(employee_nos)
                else:
                    completed, total = _completion_task_counts(node, [task for task in tasks if task.node_snapshot_id == node.id and task.target_employee_no in employee_nos])
                target[0] += completed
                target[1] += total
    def make_row(path):
        metrics = {}
        for key in titles:
            completed, total = totals[path].get(key, [0, 0])
            metrics[key] = {"completed_count": completed, "total_count": total, "completion_rate": round(completed * 100 / total, 2) if total else 0}
        return {"id": "/".join(path), "department": path[-1], "metrics": metrics, "children": [make_row(child) for child in sorted(totals) if len(child) == len(path) + 1 and child[:-1] == path]}
    return {
        "columns": [{"key": key, "title": titles[key]} for key, _title in _COMPLETION_NODE_DEFINITIONS if key in titles],
        "rows": [make_row(path) for path in sorted(totals) if len(path) == 1],
    }


@router.get("/project-management/authorization-records")
async def project_management_authorization_records(
    cycle_id: int = Query(..., ge=1),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    if "performance.projects.manage" not in context.permission_codes and "performance.cycles.manage" not in context.permission_codes:
        raise HTTPException(status_code=403, detail="PROJECT_AUTHORIZATION_FORBIDDEN")
    projects = await _managed_completion_projects(cycle_id, context, db)
    result = {"cycle_id": cycle_id, "authorization_records": [], "transfer_records": []}
    for project, scope in projects:
        events = list((await db.execute(select(PerformanceAuditEvent).where(
            PerformanceAuditEvent.cycle_ref == project.cycle_ref,
            PerformanceAuditEvent.subject_type == "PERFORMANCE_NODE_TASK",
            PerformanceAuditEvent.event_type.in_(["PERFORMANCE_TASK_AUTHORIZED", "PERFORMANCE_TASK_TRANSFERRED", "PERFORMANCE_TASK_AUTHORIZATION_REVOKED"]),
        ).order_by(PerformanceAuditEvent.event_at.desc(), PerformanceAuditEvent.id.desc()))).scalars().all())
        revoked = set()
        for event in events:
            state = event.after_state or {}
            if state.get("project_id") != project.id or (scope is not None and event.employee_no not in scope):
                continue
            record_id = str(state.get("authorization_id") or event.id)
            persisted = await db.get(PerformanceNodeTaskAuthorization, int(record_id)) if state.get("authorization_id") and str(record_id).isdigit() else None
            if event.event_type == "PERFORMANCE_TASK_AUTHORIZATION_REVOKED":
                revoked.add(record_id)
                continue
            transfer = event.event_type == "PERFORMANCE_TASK_TRANSFERRED"
            result["transfer_records" if transfer else "authorization_records"].append({
                "id": str(event.id), "initiator": state.get("initiator_name") or event.actor_ref,
                "status": "已撤销" if record_id in revoked or (persisted and persisted.status != "ACTIVE") else "已转交" if transfer else "已授权",
                "authorized_person": state.get("recipient_name") or state.get("recipient_ref"),
                "stages": state.get("stage_names") or [],
                "reviewees": ([event.employee_no] if event.employee_no else []) if scope is not None else state.get("reviewee_names") or ([event.employee_no] if event.employee_no else []),
                "submitted_at": event.event_at, "can_revoke": bool(persisted and persisted.status == "ACTIVE"),
                "authorization_id": persisted.id if persisted else None, "task_id": int(event.subject_ref) if str(getattr(event, "subject_ref", "")).isdigit() else None, "project_id": project.id,
            })
    return result


@router.get("/project-management/calibration-authorization")
async def project_management_calibration_authorization(
    cycle_id: int = Query(..., ge=1),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    if "performance.projects.manage" not in context.permission_codes and "performance.cycles.manage" not in context.permission_codes:
        raise HTTPException(status_code=403, detail="PROJECT_AUTHORIZATION_FORBIDDEN")
    projects = await _managed_completion_projects(cycle_id, context, db)
    items = []
    for project, scope in projects:
        snapshot_id = await db.scalar(select(_latest_member_snapshot_statement(project.id)))
        if snapshot_id is None:
            continue
        snapshot = await db.get(PerformanceProjectMemberSnapshot, snapshot_id)
        people = list((await db.execute(select(PerformanceAuthorizationSnapshotPerson).where(
            PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.source_snapshot_id,
        ))).scalars().all())
        names = {person.employee_no: person.display_name for person in people}
        nodes = list((await db.execute(select(PerformanceProjectNodeSnapshot).where(
            PerformanceProjectNodeSnapshot.project_id == project.id,
            PerformanceProjectNodeSnapshot.node_type == "calibration",
        ))).scalars().all())
        for node in nodes:
            tasks = list((await db.execute(select(PerformanceNodeTask).where(
                PerformanceNodeTask.project_id == project.id,
                PerformanceNodeTask.member_snapshot_id == snapshot_id,
                PerformanceNodeTask.node_snapshot_id == node.id,
                PerformanceNodeTask.task_kind == "calibration",
            ))).scalars().all())
            grouped = {}
            for task in tasks:
                if (scope is not None and task.target_employee_no not in scope) or not calibration_task_scope(task, node):
                    continue
                grouped.setdefault((task.phase_id, task.handler_ref), []).append(task)
            for (phase_id, handler), group in grouped.items():
                phase = next((phase for phase in ((node.config or {}).get("calibration") or {}).get("phases", []) if phase["phase_id"] == phase_id), {})
                assignments = [assignment for assignment in phase.get("assignments", []) if assignment["handler_ref"] == handler]
                active_records = list((await db.execute(select(PerformanceNodeTaskAuthorization).where(PerformanceNodeTaskAuthorization.task_id.in_([task.id for task in group]), PerformanceNodeTaskAuthorization.status == "ACTIVE"))).scalars().all())
                authorized_task_ids = {record.task_id for record in active_records}
                items.append({
                    "id": f"{project.id}:{node.id}:{phase_id}:{handler}",
                    "project_id": project.id, "node_id": node.node_id, "phase_id": phase_id,
                    "calibrator": names.get(handler, handler),
                    "status": "已校准" if all(_task_completed(task) for task in group) else "待校准",
                    "scope": "已冻结的校准范围", "authorized_count": len(group),
                    "allow_authorize": any(assignment.get("allow_authorize") for assignment in assignments),
                    "unauthorized_count": sum(task.id not in authorized_task_ids for task in group), "distribution_rule": None,
                    "authorized_by": names.get(active_records[-1].grantor_employee_no, active_records[-1].grantor_employee_no) if active_records else None, "authorized_at": max((record.created_at for record in active_records), default=None),
                    "task_ids": [task.id for task in group],
                    "task_people": [{"task_id": task.id, "employee_no": task.target_employee_no, "display_name": names.get(task.target_employee_no, task.target_employee_no), "direct_supervisor_employee_no": next((person.direct_supervisor_employee_no for person in people if person.employee_no == task.target_employee_no), None), "department_path": next(("/".join(str(getattr(person, key)) for key in ("company_org", "department", "department_2", "department_3", "department_4", "department_5") if getattr(person, key, None)) for person in people if person.employee_no == task.target_employee_no), None)} for task in group],
                    "authorizations": [{"id": record.id, "task_id": record.task_id, "recipient": names.get(record.recipient_employee_no, record.recipient_employee_no)} for record in active_records],
                })
    return {"cycle_id": cycle_id, "items": items}


@router.get("/project-management/statistics", response_model=ProjectStatisticsReportResponse)
async def project_management_statistics(
    cycle_id: int = Query(..., ge=1),
    dimension: str = Query(default="level", pattern="^(level|tenure)$"),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    cycle = await db.scalar(select(PerformanceCycle).where(PerformanceCycle.id == cycle_id))
    if cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CYCLE_NOT_FOUND")
    projects = list((await db.execute(select(PerformanceProject).where(
        PerformanceProject.cycle_ref == cycle.cycle_ref,
        PerformanceProject.status == PROJECT_STATUS_STARTED,
    ).order_by(PerformanceProject.id))).scalars().all())
    empty_cycle_allowed = not projects and _is_cycle_manager(context)
    scopes = {}
    visible_projects = []
    for project in projects:
        try:
            scopes[project.id] = await _project_data_scope(context, project, db, "performance.frontend.data-view")
        except HTTPException as exc:
            if exc.status_code != status.HTTP_403_FORBIDDEN:
                raise
            continue
        visible_projects.append(project)
    projects = visible_projects
    if not projects and not empty_cycle_allowed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CYCLE_NOT_FOUND")

    rows: dict[str, dict[str, int]] = {}
    if dimension == "tenure":
        rows = {bucket: {} for bucket in _TENURE_BUCKET_ORDER}
    ratings: list[dict] = []
    rating_scale = None
    employee_nos = set()
    for project in projects:
        snapshot_id = await db.scalar(select(_latest_member_snapshot_statement(project.id)))
        if snapshot_id is None:
            continue
        members = list((await db.execute(select(PerformanceProjectMember).where(
            PerformanceProjectMember.snapshot_id == snapshot_id,
        ))).scalars().all())
        scope = scopes[project.id]
        if scope is not None:
            members = [member for member in members if member.employee_no in scope]
        project_employee_nos = {member.employee_no for member in members}
        if employee_nos.intersection(project_employee_nos):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="CYCLE_MEMBER_OVERLAP_UNRESOLVED")
        employee_nos.update(project_employee_nos)
        project_ratings, final_values, scales = await _project_final_ratings(
            project, project_employee_nos, db, member_snapshot_id=snapshot_id,
        )
        for scale in scales:
            if rating_scale is not None and scale != rating_scale:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="RATING_SCALE_CONFLICT")
            rating_scale = scale
        if project_ratings and not ratings:
            ratings = project_ratings
        members_by_employee = {member.employee_no: member for member in members}
        for employee_no in project_employee_nos:
            member = members_by_employee[employee_no]
            bucket = _tenure_bucket(member.hire_date) if dimension == "tenure" else _matrix_level(member.position_level)
            counts = rows.setdefault(bucket, {})
            selected = final_values.get(employee_no)
            if selected is not None:
                key = selected[3]["key"]
                counts[key] = counts.get(key, 0) + 1

    keys = [rating["key"] for rating in ratings]
    row_sort = _tenure_sort_key if dimension == "tenure" else _matrix_level_sort_key
    report_rows = [{
        "id": f"{dimension}:{bucket}",
        "name": bucket,
        "counts": {key: rows[bucket].get(key, 0) for key in keys},
    } for bucket in sorted(rows, key=row_sort)]
    distribution = {key: sum(row["counts"][key] for row in report_rows) for key in keys}
    return ProjectStatisticsReportResponse(
        source="api",
        dimension=dimension,
        rowLabel="司龄" if dimension == "tenure" else "岗位职级",
        showSummary=True,
        totalParticipants=len(employee_nos),
        ratings=[MatrixRatingResponse(**rating) for rating in ratings],
        distribution=distribution,
        departments=[ProjectStatisticsRowResponse(**row) for row in report_rows],
    )


_TASK_ENTRY_MODES = {
    "work_summary": "template_task",
    "evaluation": "template_task",
    "calibration": "template_task",
    "result_communication": "template_task",
}


def _task_entry_mode(task: PerformanceNodeTask | None) -> str:
    return _TASK_ENTRY_MODES.get(getattr(task, "task_kind", ""), "route") if task else "route"


def _review_node_category(node_type: str, role_code: str | None, *, has_task: bool) -> str | None:
    return review_node_category(node_type, role_code, has_task=has_task)


def _review_node_status(start_at: str | None, end_at: str | None, now: datetime | None = None) -> str:
    current = now or datetime.now(UTC)

    def parse(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return None
        return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed

    start = parse(start_at)
    end = parse(end_at)
    if start is not None and current < start:
        return "not_started"
    if end is not None and current > end:
        return "overdue"
    return "pending"


def _select_review_task(tasks: list[PerformanceNodeTask], preferred_task_id: int | None = None) -> PerformanceNodeTask | None:
    if preferred_task_id is not None:
        preferred = next((task for task in tasks if task.id == preferred_task_id), None)
        if preferred is not None:
            return preferred
    return min(tasks, key=lambda task: task.id) if tasks else None


def _review_task_status(task: PerformanceNodeTask | None, start_at: str | None, end_at: str | None, now: datetime | None = None) -> str:
    return "completed" if task is not None and getattr(task, "submitted_at", None) is not None else _review_node_status(start_at, end_at, now)


def _timeline_node_state(start_at: str | None, end_at: str | None, now: datetime | None = None) -> str:
    try:
        start = _parse_time(start_at)
        end = _parse_time(end_at)
    except ValueError:
        start, end = None, None
    if start is None and end is None:
        return "unscheduled"
    current = now or datetime.now(UTC)
    if start is not None and current < start:
        return "not_started"
    if end is not None and current > end:
        return "ended"
    return "in_progress"


def _task_completed(task: PerformanceNodeTask) -> bool:
    return getattr(task, "status", None) == "completed" or getattr(task, "submitted_at", None) is not None


def _review_tasks_status(tasks: list[PerformanceNodeTask], start_at: str | None, end_at: str | None, now: datetime | None = None) -> str:
    current = now or datetime.now(UTC)
    if tasks and all(_task_completed(task) for task in tasks):
        return "completed"
    if _review_node_status(start_at, end_at, current) == "not_started":
        return "not_started"
    return _review_node_status(start_at, end_at, current)


@router.get("/review/overview")
async def review_overview(
    project_id: int | None = Query(default=None, ge=1),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
    task_id: int | None = Query(default=None, ge=1),
    cycle_id: int | None = Query(default=None, ge=1),
):
    access = await resolve_frontend_access(db, context)
    cycle_id = cycle_id if isinstance(cycle_id, int) else None
    task_id = task_id if isinstance(task_id, int) else None
    if cycle_id is not None and cycle_id not in access.cycle_ids:
        raise HTTPException(status_code=404, detail="CYCLE_NOT_FOUND")
    project_rows = [(project, cycle) for project, cycle in access.review_projects if cycle_id is None or cycle.id == cycle_id]
    projects = [project_payload(project, cycle) for project, cycle in project_rows]
    selected = next((row for row in project_rows if row[0].id == project_id), None) if project_id is not None else (project_rows[0] if project_rows else None)
    if project_id is not None and cycle_id is not None:
        requested = await db.get(PerformanceProject, project_id)
        selected_cycle = next(cycle for cycle in access.cycles if cycle.id == cycle_id)
        if requested is None or requested.cycle_ref != selected_cycle.cycle_ref:
            raise HTTPException(status_code=404, detail="PROJECT_NOT_FOUND")
    if selected is None:
        if project_id is not None:
            raise HTTPException(status_code=404, detail="PROJECT_NOT_FOUND")
        return {"projects": projects, "active_project": None, "template_name": "", "categories": []}
    project, cycle = selected
    template_id = (project.settings or {}).get("template_id")
    template = await db.get(PerformanceTemplate, int(template_id)) if template_id else None
    workflow = await db.get(PerformanceTemplateWorkflow, int(template_id)) if template_id else None
    template_names = {str(item.get("node_id")): str(item.get("name")) for item in ((workflow.nodes if workflow else []) or []) if item.get("node_id") and item.get("name")}
    snapshots = (
        await db.execute(
            select(PerformanceProjectNodeSnapshot)
            .where(PerformanceProjectNodeSnapshot.project_id == project.id)
            .order_by(PerformanceProjectNodeSnapshot.node_order)
        )
    ).scalars().all()
    task_ids = access.task_ids_by_project.get(project.id, set())
    task_query = select(PerformanceNodeTask).where(PerformanceNodeTask.project_id == project.id, PerformanceNodeTask.id.in_(task_ids))
    tasks = (await db.execute(task_query.order_by(PerformanceNodeTask.id))).scalars().all()
    tasks = [task for task in tasks if task.id in task_ids]
    tasks_by_node = {}
    for task in tasks:
        tasks_by_node.setdefault(task.node_snapshot_id, []).append(task)

    categories = {key: {"key": key, "label": label, "nodes": []} for key, label in _REVIEW_CATEGORY_LABELS.items()}
    now = datetime.now(UTC)
    for node in snapshots:
        raw_node = (node.config or {}).get("template") or {}
        timing = _node_timing(project, node) or {}
        node_tasks = tasks_by_node.get(node.id, [])
        voluntary = node.id in access.voluntary_node_ids_by_project.get(project.id, set())
        category = _review_node_category(node.node_type, node_role_code(raw_node), has_task=bool(node_tasks) or voluntary)
        if category is None or node.id not in access.visible_node_ids_by_project.get(project.id, set()):
            continue
        start_at = timing.get("start_at")
        end_at = timing.get("end_at") or timing.get("appeal_deadline")
        if node.node_type == "calibration" and task_id is None:
            actionable = [task for task in node_tasks if not _task_completed(task) and _task_is_available(task, node, project, now)]
            node_tasks = actionable or [task for task in node_tasks if not _task_completed(task)] or node_tasks
        selected_task = _select_review_task(node_tasks, task_id)
        if selected_task is not None and getattr(selected_task, "task_kind", None) == "calibration":
            start, end = _task_window(selected_task, node, project)
            start_at, end_at = start.isoformat() if start else None, end.isoformat() if end else None
        status_tasks = tasks_by_node.get(node.id, [])
        if node.node_type == "calibration" and selected_task is not None:
            status_tasks = [task for task in status_tasks if task.phase_id == selected_task.phase_id]
        selected_task_kind = getattr(selected_task, "task_kind", None) if selected_task else None
        is_template_task = selected_task_kind in _TASK_ENTRY_MODES
        node_payload = {
            "node_id": node.node_id,
            "node_name": template_names.get(node.node_id, node.name),
            "node_type": node.node_type,
            "task_kind": selected_task_kind,
            "entry_mode": _task_entry_mode(selected_task),
            "executor_label": raw_node.get("executor_label") or "",
            "executor_role_code": node_role_code({"node_type": node.node_type, **raw_node}),
            "phase_id": getattr(selected_task, "phase_id", "") or None,
            "status": _review_tasks_status(status_tasks, start_at, end_at, now) if is_template_task and node.node_type in {"evaluation", "calibration", "result_communication"} else (_review_task_status(selected_task, start_at, end_at, now) if is_template_task else _review_node_status(start_at, end_at, now)),
            "start_at": start_at,
            "end_at": end_at,
            "action_url": f"/performance/review?node={node.node_id}&project_id={project.id}",
            "task_id": selected_task.id if selected_task else None,
        }
        if is_template_task and selected_task is not None:
            available_at, due_at = _task_window(selected_task, node, project)
            editable, _ = _self_summary_state(selected_task, available_at, due_at, getattr(selected_task, "task_kind", None) != "calibration")
            node_payload["editable"] = editable
            node_payload["submitted_at"] = selected_task.submitted_at
            if selected_task.submitted_at is not None:
                node_payload["form_schema"], node_payload["answers"] = await _task_visible_content(selected_task, node, db)
        categories[category]["nodes"].append(node_payload)

    return {
        "projects": projects,
        "active_project": {
            "project_id": project.id,
            "project_name": project.name,
            "cycle_name": cycle.name,
            "cycle_start_at": cycle.start_at,
            "cycle_end_at": cycle.end_at,
        },
        "template_name": template.name if template else "",
        "workflow_node_count": len((workflow.nodes if workflow else []) or []),
        "categories": [category for category in categories.values() if category["nodes"]],
    }


@router.get("/workbench/projects")
async def workbench_projects(
    keyword: str | None = Query(default=None, max_length=128),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
    cycle_id: int | None = Query(default=None, ge=1),
):
    access = await resolve_frontend_access(db, context)
    cycle_id = cycle_id if isinstance(cycle_id, int) else None
    if cycle_id is not None and cycle_id not in access.cycle_ids:
        raise HTTPException(status_code=404, detail="CYCLE_NOT_FOUND")
    rows = [(project, cycle) for project, cycle in access.workbench_projects if cycle_id is None or cycle.id == cycle_id]
    if keyword:
        rows = [row for row in rows if keyword.strip().casefold() in row[0].name.casefold()]
    rows = rows[(page - 1) * page_size:page * page_size]
    result = []
    for project, cycle in rows:
        actor_ref = access.actor_refs_by_cycle.get(project.cycle_ref, access.actor_ref)
        opened = False
        if actor_ref:
            opened = await db.scalar(select(PerformanceResultOpening.id).where(
                PerformanceResultOpening.project_id == project.id,
                PerformanceResultOpening.employee_no == actor_ref,
            ).limit(1)) is not None
        result.append({"project_id": project.id, "project_name": project.name, "cycle_ref": project.cycle_ref, "cycle_name": cycle.name, "cycle_start_at": cycle.start_at, "cycle_end_at": cycle.end_at, "project_status": project.status, "result_published": opened, "participation_roles": []})
    return result


@router.get("/workbench/projects/{project_id}/timeline")
async def workbench_timeline(project_id: int, context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session)):
    access = await resolve_frontend_access(db, context)
    project = next((project for project, _cycle in access.workbench_projects if project.id == project_id), None)
    if project is None:
        raise HTTPException(status_code=403, detail="无权查看当前项目工作台")
    template_names = await _template_node_names(db, project)
    nodes = (await db.execute(select(PerformanceProjectNodeSnapshot).where(PerformanceProjectNodeSnapshot.project_id == project_id, PerformanceProjectNodeSnapshot.node_type.not_in({"result_reconsideration"})).order_by(PerformanceProjectNodeSnapshot.node_order))).scalars().all()
    now = datetime.now(UTC)
    result = []
    for node in nodes:
        timing = _node_timing(project, node) or {}
        start_at = timing.get("start_at")
        end_at = timing.get("end_at")
        result.append({"node_id": node.node_id, "node_name": template_names.get(node.node_id, node.name), "node_type": node.node_type, "node_order": node.node_order, "executor_label": (node.config.get("template") or {}).get("executor_label"), "start_at": start_at, "end_at": end_at, "status": _timeline_node_state(start_at, end_at, now)})
    return result


@router.get("/workbench/tasks")
async def workbench_tasks(project_id: int | None = None, state: str = Query(default="pending", pattern="^(pending|completed)$"), context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session)):
    actor = await resolve_trusted_performance_actor(db, context)
    handler = str(actor.actor_ref)
    is_admin_preview = False
    stmt = select(PerformanceProjectNodeSnapshot, PerformanceNodeTask).join(PerformanceNodeTask, PerformanceNodeTask.node_snapshot_id == PerformanceProjectNodeSnapshot.id).join(PerformanceProject, PerformanceProject.id == PerformanceNodeTask.project_id).where(PerformanceProject.status == PROJECT_STATUS_STARTED, PerformanceProjectNodeSnapshot.node_type.not_in({"result_view", "result_reconsideration"}))
    if not is_admin_preview:
        stmt = stmt.where(task_handler_condition(handler))
    if project_id is not None:
        stmt = stmt.where(PerformanceNodeTask.project_id == project_id)
    rows = (await db.execute(stmt.order_by(PerformanceProjectNodeSnapshot.node_order, PerformanceNodeTask.id))).all()
    project = await db.get(PerformanceProject, project_id) if project_id is not None else None
    template_names = await _template_node_names(db, project) if project else {}
    now = datetime.now(UTC)
    grouped: dict[int, tuple[PerformanceProjectNodeSnapshot, list[PerformanceNodeTask]]] = {}
    for node, task in rows:
        current_project = project if project and project.id == node.project_id else await db.get(PerformanceProject, node.project_id)
        if state == "pending" and not _task_is_available(task, node, current_project, now):
            continue
        if node.id not in grouped:
            grouped[node.id] = (node, [])
        grouped[node.id][1].append(task)
    result = []
    for node, tasks in sorted(grouped.values(), key=lambda item: item[0].node_order):
        pending_tasks = [task for task in tasks if not _task_completed(task)]
        if state == "pending":
            visible_tasks = pending_tasks
        elif pending_tasks:
            continue
        else:
            visible_tasks = tasks
        if not visible_tasks:
            continue
        first_task = visible_tasks[0]
        current_project = project if project and project.id == node.project_id else await db.get(PerformanceProject, node.project_id)
        available_at, due_at = _task_window(first_task, node, current_project)
        result.append({"node_id": node.node_id, "node_type": node.node_type, "node_name": template_names.get(node.node_id, node.name), "executor_role_code": node_role_code((node.config or {}).get("template") or {}), "pending_count": len(pending_tasks), "completed_count": len(tasks) - len(pending_tasks), "overdue_count": 0, "task_id": first_task.id, "available_at": available_at, "due_at": due_at, "action_url": f"/performance/review?node={node.node_id}"})
    return result


async def _snapshot_supervisor_names(db, members):
    snapshot_ids = {member.snapshot_id for member in members if getattr(member, "direct_supervisor_employee_no", None)}
    supervisor_nos = {member.direct_supervisor_employee_no for member in members if getattr(member, "direct_supervisor_employee_no", None)}
    if not snapshot_ids:
        return {}
    rows = (await db.execute(
        select(PerformanceProjectMemberSnapshot.id, PerformanceAuthorizationSnapshotPerson.employee_no, PerformanceAuthorizationSnapshotPerson.display_name)
        .join(PerformanceAuthorizationSnapshotPerson, PerformanceAuthorizationSnapshotPerson.snapshot_id == PerformanceProjectMemberSnapshot.source_snapshot_id)
        .where(PerformanceProjectMemberSnapshot.id.in_(snapshot_ids), PerformanceAuthorizationSnapshotPerson.employee_no.in_(supervisor_nos))
    )).all()
    return {(snapshot_id, employee_no): name for snapshot_id, employee_no, name in rows}


async def _communication_progress(db, project, employee_nos):
    rows = (await db.execute(
        select(PerformanceNodeTask, PerformanceProjectNodeSnapshot)
        .join(PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id)
        .where(
            PerformanceNodeTask.project_id == project.id,
            PerformanceNodeTask.cycle_ref == project.cycle_ref,
            PerformanceProjectNodeSnapshot.project_id == project.id,
            PerformanceProjectNodeSnapshot.node_type == "evaluation",
            PerformanceNodeTask.task_kind == "evaluation",
            PerformanceNodeTask.status.in_(["pending", "completed"]),
            PerformanceNodeTask.target_employee_no.in_(employee_nos),
        )
    )).all()
    reviewers = {employee: {} for employee in employee_nos}
    for task, node in rows:
        if node_role_code((node.config or {}).get("template") or {}) != ROLE_REVIEWER_360:
            continue
        people = reviewers.get(task.target_employee_no)
        if people is not None:
            people[task.handler_ref] = people.get(task.handler_ref, False) or _task_completed(task)
    return {employee: f"{sum(people.values())}/{len(people)}" for employee, people in reviewers.items()}


async def _previous_published_position_levels(db, project, employee_nos):
    current = await db.scalar(select(PerformanceCycle).where(PerformanceCycle.cycle_ref == project.cycle_ref))
    if current is None:
        return {}
    rows = (await db.execute(
        select(PerformanceResultOpening, PerformanceCycle)
        .join(PerformanceCycle, PerformanceCycle.cycle_ref == PerformanceResultOpening.cycle_ref)
        .where(
            PerformanceCycle.start_at < current.start_at,
            PerformanceResultOpening.employee_no.in_(employee_nos),
        )
        .order_by(PerformanceCycle.start_at.desc(), PerformanceCycle.id.desc())
    )).all()
    latest_cycles = {}
    levels = {}
    for opening, cycle in rows:
        previous = latest_cycles.setdefault(opening.employee_no, cycle.id)
        if previous == cycle.id:
            levels.setdefault(opening.employee_no, set()).add(opening.published_position_level)
    return {employee: next(iter(values)) if len(values) == 1 else None for employee, values in levels.items()}


@router.get("/workbench/tasks/{node_id}/people")
async def workbench_task_people(node_id: str, project_id: int, state: str = Query(default="pending", pattern="^(pending|completed|all)$"), context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session), keyword: str | None = Query(default=None, max_length=100), phase_id: str | None = Query(default=None, max_length=96)):
    actor = await resolve_trusted_performance_actor(db, context)
    handler = str(actor.actor_ref)
    is_admin_preview = False
    scope = (
        PerformanceNodeTask.project_id == project_id,
        PerformanceProjectNodeSnapshot.project_id == project_id,
        PerformanceProjectNodeSnapshot.node_id == node_id,
    )
    if isinstance(phase_id, str) and phase_id:
        scope += (PerformanceNodeTask.phase_id == phase_id,)
    if state != "all":
        scope += (PerformanceNodeTask.status == state,)
    statement = (
        select(PerformanceNodeTask, PerformanceProjectNodeSnapshot, PerformanceProjectMember)
        .select_from(PerformanceNodeTask)
        .join(PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id)
        .join(PerformanceProjectMember, (
            (PerformanceProjectMember.snapshot_id == PerformanceNodeTask.member_snapshot_id)
            & (PerformanceProjectMember.employee_no == PerformanceNodeTask.target_employee_no)
        ), isouter=True)
        .where(*scope)
    )
    if not is_admin_preview:
        statement = statement.where(task_handler_condition(handler))
    if isinstance(keyword, str) and keyword.strip():
        value = f"%{keyword.strip()}%"
        statement = statement.where(or_(PerformanceProjectMember.display_name.ilike(value), PerformanceProjectMember.employee_no.ilike(value), PerformanceNodeTask.target_employee_no.ilike(value)))
    rows = (await db.execute(statement.order_by(PerformanceNodeTask.id))).all()
    project = await db.get(PerformanceProject, project_id)
    rows = [row for row in rows if row[1].node_type != "calibration" or calibration_task_scope(row[0], row[1])]
    communication_people = {task.target_employee_no for task, node, _member in rows if node.node_type == "result_communication"}
    progress = await _communication_progress(db, project, {task.target_employee_no for task, _node, _member in rows}) if project and rows else {}
    supervisor_names = await _snapshot_supervisor_names(db, [member for _task, _node, member in rows if member])
    previous_levels = await _previous_published_position_levels(db, project, communication_people) if project and communication_people else {}
    if state == "pending":
        rows = [row for row in rows if _task_is_available(row[0], row[1], project)]
    aggregate_task_id = rows[0][0].id if rows else None
    visibility_rules = await load_subject_visibility_rules(db)
    result = []
    for task, node, member in rows:
        visibility_role = await resolve_subject_visibility_role(db, context, handler, member, node, project)
        visible_fields = visibility_rules[visibility_role]
        values = {
            "task_id": task.id,
            "aggregate_task_id": aggregate_task_id,
            "employee_no": member.employee_no if member else task.target_employee_no,
            "display_name": member.display_name if member else task.target_employee_no,
            "status": "completed" if _task_completed(task) else _review_task_status(task, *[value.isoformat() if value else None for value in _task_window(task, node, project)]),
            "phase_id": getattr(task, "phase_id", "") or None,
            "company_org": getattr(member, "company_org", None) if member else None,
            "department": organization_leaf(member) if member else None,
            "department_2": getattr(member, "department_2", None) if member else None,
            "department_3": getattr(member, "department_3", None) if member else None,
            "department_4": getattr(member, "department_4", None) if member else None,
            "department_5": getattr(member, "department_5", None) if member else None,
            "job_family": getattr(member, "job_family", None) if member else None,
            "job_category": getattr(member, "job_category", None) if member else None,
            "standard_position": getattr(member, "standard_position", None) if member else None,
            "job_sequence": format_job_sequence(getattr(member, "job_family", None), getattr(member, "job_category", None)) if member else None,
            "position_level": getattr(member, "position_level", None) if member else None,
            "hire_date": getattr(member, "hire_date", None).isoformat() if member and getattr(member, "hire_date", None) else None,
            "employee_type": getattr(member, "employee_type", None) if member else None,
            "employment_status": getattr(member, "employment_status", None) if member else None,
            "due_at": _task_window(task, node, project)[1],
            "reminder_target": getattr(task, "handler_ref", handler),
            "direct_supervisor": supervisor_names.get((member.snapshot_id, getattr(member, "direct_supervisor_employee_no", None))) if member else None,
            "hrbp": getattr(member, "hrbp_employee_no", None) if member else None,
            "completion": progress.get(task.target_employee_no, "0/0"),
            "previous_position_level": previous_levels.get(task.target_employee_no) if "position_level" in visible_fields else None,
            "visibility_role": visibility_role,
            "visible_profile_fields": visible_fields,
        }
        result.append(mask_profile_values(values, visible_fields))
    return result


@router.post("/projects/{project_id}/reminder-tasks/remind")
async def remind_project_tasks(
    project_id: int,
    payload: ReminderTasksPayload,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    actor = await resolve_trusted_performance_actor(db, context)
    project = await db.get(PerformanceProject, project_id)
    if project is None or project.status != PROJECT_STATUS_STARTED:
        raise HTTPException(status_code=404, detail="PROJECT_NOT_FOUND")

    is_admin_preview = _is_admin_preview(context)
    if not is_admin_preview:
        allowed = await db.scalar(select(PerformanceNodeTask.id).where(
            PerformanceNodeTask.project_id == project_id,
            PerformanceNodeTask.handler_ref == actor.actor_ref,
        ).limit(1))
        if allowed is None:
            raise HTTPException(status_code=403, detail="PROJECT_REMINDER_FORBIDDEN")

    task_ids = list(dict.fromkeys(payload.task_ids))
    statement = (
        select(PerformanceNodeTask, PerformanceProjectNodeSnapshot)
        .join(PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id)
        .where(
            PerformanceNodeTask.project_id == project_id,
            PerformanceNodeTask.id.in_(task_ids),
            PerformanceProjectNodeSnapshot.node_id == payload.node_id,
        )
    )
    if not is_admin_preview:
        statement = statement.where(PerformanceNodeTask.handler_ref == actor.actor_ref)
    rows = (await db.execute(statement)).all()
    tasks_by_id = {task.id: (task, node) for task, node in rows}
    accepted_task_ids: list[int] = []
    skipped_task_ids: list[int] = []
    for task_id in task_ids:
        item = tasks_by_id.get(task_id)
        if item is None:
            skipped_task_ids.append(task_id)
            continue
        task, node = item
        if task.status != "pending" or not _task_is_available(task, node, project):
            skipped_task_ids.append(task_id)
            continue
        accepted_task_ids.append(task_id)
        PerformanceAuditService(db).append_event(AuditEventInput(
            event_type="PERFORMANCE_TASK_REMINDER_REQUESTED",
            cycle_ref=project.cycle_ref,
            employee_no=task.target_employee_no,
            actor_type=actor.actor_type,
            actor_ref=actor.actor_ref,
            subject_type="PERFORMANCE_NODE_TASK",
            subject_ref=str(task.id),
            after_state={"action": "remind", "node_id": payload.node_id, "delivery_status": "recorded"},
        ))
        if getattr(context, "switch_session_id", None):
            from app.identity_switch.notifications import record_notification
            await record_notification(db, [{"key": f"remind:{task.id}", "title": "绩效任务催办",
                "content": f"请及时完成项目“{project.name}”的绩效任务。", "receiver_count": 1,
                "errors": [], "missing_variables": []}], [f"employee:{task.handler_ref}"])
    await db.commit()
    return {"accepted_task_ids": accepted_task_ids, "skipped_task_ids": skipped_task_ids, "delivery_status": "recorded"}


async def copy_project(
    project_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    project = await _get_project(db, project_id)
    if not _can_manage_project(context, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权管理当前项目")
    copied = await PerformanceProjectService(db).copy_project(
        project, actor_type=context.subject_type, actor_id=context.subject_id
    )
    return ProjectResponse(**PerformanceProjectService.serialize(copied))


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    project = await _get_project(db, project_id)
    if not _can_manage_project(context, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权管理当前项目")
    await PerformanceProjectService(db).delete_project(
        project, actor_type=context.subject_type, actor_id=context.subject_id
    )
