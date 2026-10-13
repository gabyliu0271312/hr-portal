"""Performance project configuration API."""
from __future__ import annotations

from datetime import UTC, datetime, date
from types import SimpleNamespace

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import PerformanceAccessContext, get_performance_access_context, performance_admin_preview_enabled, resolve_trusted_performance_actor
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.cycle_service import PerformanceCycleService
from app.performance.models import PerformanceCycle, PerformanceHrbpPermission, PerformanceNodeTask, PerformanceOtherPermissionSetting, PerformanceProject, PerformanceProjectMember, PerformanceProjectMemberSnapshot, PerformanceProjectNodeSnapshot, PerformanceTemplate, PerformanceTemplateWorkflow, PROJECT_STATUS_STARTED
from app.performance.self_summary_service import build_self_summary_schema, hydrate_self_summary_template, iter_self_summary_field_instances, resolve_self_summary_content, sanitize_self_summary_answers, self_summary_field_requires_value, self_summary_value_empty
from app.performance.subject_visibility_service import load_subject_visibility_rules, mask_profile_values, resolve_subject_visibility_role, subject_profile_items
from app.data.employee_roster_contract import format_job_sequence, organization_leaf
from app.performance.project_service import PerformanceProjectService, ProjectValidationError, _parse_time

router = APIRouter(prefix="/performance", tags=["performance-projects"])


def _is_admin_preview(context: PerformanceAccessContext) -> bool:
    return performance_admin_preview_enabled(context)


class SelfSummaryAnswersPayload(BaseModel):
    answers: dict = Field(default_factory=dict)
    version: int | None = Field(default=None, ge=1)


class ReminderTasksPayload(BaseModel):
    node_id: str = Field(min_length=1, max_length=128)
    task_ids: list[int] = Field(min_length=1, max_length=500)


async def _self_summary_task(task_id: int, actor: PerformanceAccessContext, db: AsyncSession, task_kind: str = "work_summary", target_employee_no: str | None = None) -> tuple[PerformanceNodeTask, PerformanceProjectNodeSnapshot]:
    trusted = await resolve_trusted_performance_actor(db, actor)
    row = (await db.execute(select(PerformanceNodeTask, PerformanceProjectNodeSnapshot).join(PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id).where(PerformanceNodeTask.id == task_id))).first()
    is_admin_preview = _is_admin_preview(actor)
    if not row or (not is_admin_preview and str(row[0].handler_ref) not in {str(trusted.actor_ref), str(actor.subject_id)}):
        raise HTTPException(status_code=404, detail="TASK_NOT_FOUND")
    if row[0].task_kind != task_kind:
        raise HTTPException(status_code=422, detail="TASK_TYPE_NOT_SUPPORTED")
    if target_employee_no and target_employee_no != row[0].target_employee_no:
        target_query = select(PerformanceNodeTask, PerformanceProjectNodeSnapshot).join(PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id).where(
            PerformanceNodeTask.node_snapshot_id == row[0].node_snapshot_id,
            PerformanceNodeTask.handler_ref == row[0].handler_ref,
            PerformanceNodeTask.target_employee_no == target_employee_no,
            PerformanceNodeTask.task_kind == task_kind,
        )
        target_row = (await db.execute(target_query)).first()
        if not target_row:
            raise HTTPException(status_code=404, detail="TASK_NOT_FOUND")
        row = target_row
    return row[0], row[1]


def _node_timing(project: PerformanceProject | None, node: PerformanceProjectNodeSnapshot) -> dict | None:
    configured = (((project.settings or {}).get("flow_settings") or {}).get("node_times") or {}) if project else {}
    if node.node_id in configured:
        return configured[node.node_id] or {}
    return (node.config or {}).get("time")


def _task_window(task: PerformanceNodeTask, node: PerformanceProjectNodeSnapshot, project: PerformanceProject | None) -> tuple[datetime | None, datetime | None]:
    timing = _node_timing(project, node)
    if timing is None:
        return task.available_at, task.due_at
    return _parse_time(timing.get("start_at")), _parse_time(timing.get("end_at") or timing.get("appeal_deadline"))


def _task_is_available(task: PerformanceNodeTask, node: PerformanceProjectNodeSnapshot, project: PerformanceProject | None, now: datetime | None = None) -> bool:
    available_at, _ = _task_window(task, node, project)
    return available_at is None or (now or datetime.now(UTC)) >= available_at


def _self_summary_state(task: PerformanceNodeTask, available_at: datetime | None, due_at: datetime | None) -> tuple[bool, bool]:
    now = datetime.now(UTC)
    if available_at is not None and now < available_at:
        return False, False
    overdue = due_at is not None and now > due_at
    submitted = task.submitted_at is not None
    return (not (overdue and submitted), not (overdue and submitted))


async def _self_summary_template(task: PerformanceNodeTask, node: PerformanceProjectNodeSnapshot, db: AsyncSession) -> dict:
    template = (node.config or {}).get("template") or {}
    if not template.get("content"):
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
    current_executor_types = set(current_template.get("executor_types") or [])
    viewer_can_remind = (
        str(task.handler_ref) == actor_ref
        and str(task.target_employee_no) != actor_ref
        and (node.node_type == "calibration" or bool(current_executor_types & _MANAGER_EXECUTOR_TYPES))
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
        result.append({
            "key": f"reference-{reference_node.node_id}",
            "node_id": reference_node.node_id,
            "node_name": reference_node.name,
            "task_id": source.id if source is not None else None,
            "employee_no": task.target_employee_no,
            "status": status,
            "submitted_at": source.submitted_at if completed and source is not None else None,
            "form_schema": build_self_summary_schema(await _reference_template(source, reference_node, project, db)) if completed else [],
            "answers": (source.answers or {}) if completed and source is not None else {},
            "can_remind": bool(
                source is not None
                and not completed
                and reminder_enabled
                and reference_node.node_type in reminder_node_types
                and viewer_can_remind
            ),
        })
    return result


async def _template_task_detail(task: PerformanceNodeTask, node: PerformanceProjectNodeSnapshot, context: PerformanceAccessContext, db: AsyncSession):
    project = await db.get(PerformanceProject, task.project_id)
    available_at, due_at = _task_window(task, node, project)
    editable, submit_allowed = _self_summary_state(task, available_at, due_at)
    template = await _self_summary_template(task, node, db)
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
    visibility_role = await resolve_subject_visibility_role(db, context, actor_ref, member, node, project)
    visible_fields = (await load_subject_visibility_rules(db))[visibility_role]
    return {
        "task_id": task.id,
        "task_kind": task.task_kind,
        "entry_mode": _task_entry_mode(task),
        "node_name": node.name,
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
        "form_schema": build_self_summary_schema(template),
        "answers": task.answers or {},
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
    project = await db.get(PerformanceProject, task.project_id)
    available_at, due_at = _task_window(task, node, project)
    editable, submit_allowed = _self_summary_state(task, available_at, due_at)
    if not editable or (submit and not submit_allowed):
        raise HTTPException(status_code=409, detail="SUBMISSION_NOT_ALLOWED")
    if payload.version is not None and payload.version != task.answer_version:
        raise HTTPException(status_code=409, detail="VERSION_CONFLICT")
    template = await _self_summary_template(task, node, db)
    schema = build_self_summary_schema(template)
    incoming_answers = payload.answers if submit else {**(task.answers or {}), **payload.answers}
    answers = sanitize_self_summary_answers(schema, incoming_answers)
    if submit:
        for _section, field, _index, value in iter_self_summary_field_instances(schema, answers):
            if self_summary_field_requires_value(field, value) and self_summary_value_empty(field, value):
                raise HTTPException(status_code=400, detail={"code": "VALIDATION_FAILED", "field_id": field["id"]})
    task.answers = answers
    task.answer_version += 1
    if submit:
        task.submitted_at = datetime.now(UTC)
        task.status = "completed"
        task.completed_at = task.submitted_at
    await db.commit()
    editable, submit_allowed = _self_summary_state(task, available_at, due_at)
    return {"answers": task.answers, "version": task.answer_version, "submitted_at": task.submitted_at, "editable": editable, "submit_allowed": submit_allowed}


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


class ProjectPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=500)
    administrators: list[str] = Field(default_factory=list, max_length=50)
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
    job_family: str | None = None
    job_category: str | None = None
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
    if not _can_manage_project(context, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看当前项目矩阵")

    snapshot_id = _latest_member_snapshot_statement(project_id)
    members = list((await db.execute(
        select(PerformanceProjectMember).where(PerformanceProjectMember.snapshot_id == snapshot_id)
    )).scalars().all())
    if not _is_admin_preview(context):
        actor = await resolve_trusted_performance_actor(db, context)
        hidden_people = await _person_hrbp_invisible_people(db, actor.actor_ref, project.cycle_ref)
        members = [member for member in members if member.employee_no not in hidden_people]
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
    if not _can_manage_project(context, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看当前项目成员")

    snapshot_id = _latest_member_snapshot_statement(project_id)
    statement = select(PerformanceProjectMember).where(PerformanceProjectMember.snapshot_id == snapshot_id)
    count_statement = select(func.count(PerformanceProjectMember.id)).where(PerformanceProjectMember.snapshot_id == snapshot_id)
    hidden_people = set()
    actor_ref = None
    if not _is_admin_preview(context):
        actor = await resolve_trusted_performance_actor(db, context)
        actor_ref = str(actor.actor_ref)
        hidden_people = await _person_hrbp_invisible_people(db, actor.actor_ref, project.cycle_ref)
    if hidden_people:
        statement = statement.where(PerformanceProjectMember.employee_no.not_in(hidden_people))
        count_statement = count_statement.where(PerformanceProjectMember.employee_no.not_in(hidden_people))
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

    visibility_rules = await load_subject_visibility_rules(db)
    visible_fields_by_member: dict[int, list[str]] = {}
    for member in members:
        role = await resolve_subject_visibility_role(
            db,
            context,
            actor_ref or str(member.employee_no),
            member,
            SimpleNamespace(node_type="", config={}),
            project,
        )
        visible_fields_by_member[member.id] = visibility_rules[role]

    items = []
    for member in members:
        item = _serialize_project_member(member).model_dump()
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


@router.get("/cycles/{cycle_id}/evaluator-options")
async def evaluator_options(
    cycle_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    cycle = await _get_cycle(db, cycle_id)
    await _assert_cycle_project_view(db, cycle, context)
    return await PerformanceProjectService(db).evaluator_options(cycle)

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
    data["evaluated_count"] = await PerformanceProjectService(db).evaluator_count(cycle, data.get("evaluator_rules"))
    try:
        project = await PerformanceProjectService(db).create_project(
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
    data = payload.model_dump()
    if data.get("evaluator_rules") is not None:
        data["evaluated_count"] = await PerformanceProjectService(db).evaluator_count(cycle, data.get("evaluator_rules"))
    try:
        project = await PerformanceProjectService(db).update_project(
            project, data, actor_type=context.subject_type, actor_id=context.subject_id
        )
    except ProjectValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return ProjectResponse(**PerformanceProjectService.serialize(project))


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
_MANAGER_EXECUTOR_TYPES = {
    "REAL_LINE_MANAGER",
    "VIRTUAL_LINE_MANAGER",
    "DIRECT_MANAGER",
    "LEVEL_1_MANAGER",
    "LEVEL_2_MANAGER",
    "LEVEL_3_MANAGER_PLUS",
}


def _completion_node_key(node: PerformanceProjectNodeSnapshot) -> str | None:
    template = (node.config or {}).get("template") or {}
    executor_types = set(template.get("executor_types") or [])
    if node.node_type == "work_summary":
        return "work-summary"
    if node.node_type in {"reviewer_360_invite", "reviewer_360_confirm"}:
        return "review-360"
    if node.node_type == "evaluation":
        if "SUBJECT" in executor_types:
            return "self-review"
        if "REVIEWER_360" in executor_types:
            return "review-360"
        if _MANAGER_EXECUTOR_TYPES.intersection(executor_types):
            return "manager-review"
    return {
        "calibration": "calibration",
        "result_communication": "communicate",
        "result_view": "view-result",
        "result_reconsideration": "result-reconsideration",
    }.get(node.node_type)


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


async def _project_completion_nodes(projects: list[PerformanceProject], db: AsyncSession, now: datetime | None = None) -> list[dict]:
    current = now or datetime.now(UTC)
    states = {
        key: {"configured": 0, "starts": [], "deadlines": [], "completed": 0, "total": 0}
        for key, _title in _COMPLETION_NODE_DEFINITIONS
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
        tasks_by_node: dict[int, list[PerformanceNodeTask]] = {}
        for task in tasks:
            tasks_by_node.setdefault(task.node_snapshot_id, []).append(task)
        for node in nodes:
            key = _completion_node_key(node)
            if key is None:
                continue
            state = states[key]
            state["configured"] += 1
            timing = _node_timing(project, node) or {}
            start_at = _safe_node_time(timing.get("start_at"))
            deadline_at = _safe_node_time(timing.get("end_at") or timing.get("appeal_deadline"))
            if start_at is not None:
                state["starts"].append(start_at)
            if deadline_at is not None:
                state["deadlines"].append(deadline_at)
            if node.node_type == "result_view":
                total = len(members)
                completed = total if bool((project.settings or {}).get("result_published")) else 0
            else:
                node_tasks = tasks_by_node.get(node.id, [])
                total = len(node_tasks) if node.node_type == "result_reconsideration" else (len(node_tasks) or len(members))
                completed = sum(1 for task in node_tasks if _task_completed(task))
            state["total"] += total
            state["completed"] += completed

    result = []
    for key, title in _COMPLETION_NODE_DEFINITIONS:
        state = states[key]
        if not state["configured"]:
            result.append({
                "key": key, "title": title, "status": "unavailable",
                "completed_count": 0, "total_count": 0, "completion_rate": None, "deadline_at": None,
            })
            continue
        completed = state["completed"]
        total = state["total"]
        result.append({
            "key": key,
            "title": title,
            "status": _completion_node_status(state["starts"], state["deadlines"], completed, total, current),
            "completed_count": completed,
            "total_count": total,
            "completion_rate": round(completed * 100 / total, 2) if total else 0,
            "deadline_at": min(state["deadlines"]) if state["deadlines"] else None,
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


@router.get("/project-management/overview")
async def project_management_overview(
    cycle_id: int | None = Query(default=None, ge=1),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    actor = await resolve_trusted_performance_actor(db, context)
    is_admin_preview = _is_admin_preview(context)
    display_name = context.display_name
    hrbp_refs = await _person_hrbp_project_refs(db, str(actor.actor_ref))

    def involved(project: PerformanceProject) -> bool:
        return _person_in_project_administrators(project, display_name) or project.project_ref in hrbp_refs

    project_statement = (
        select(PerformanceProject, PerformanceCycle)
        .join(PerformanceCycle, PerformanceCycle.cycle_ref == PerformanceProject.cycle_ref)
        .where(PerformanceProject.status == PROJECT_STATUS_STARTED)
    )
    project_rows = (await db.execute(project_statement.order_by(PerformanceCycle.start_at.desc(), PerformanceProject.id))).all()
    visible_rows = project_rows if is_admin_preview else [row for row in project_rows if involved(row[0])]

    cycles: dict[int, dict] = {}
    projects_by_cycle: dict[int, list[dict]] = {}
    for project, cycle in visible_rows:
        cycles[cycle.id] = {
            "cycle_id": cycle.id,
            "cycle_name": cycle.name,
            "cycle_start_at": cycle.start_at,
            "cycle_end_at": cycle.end_at,
        }
        projects_by_cycle.setdefault(cycle.id, []).append({
            "project_id": project.id,
            "project_name": project.name,
            "project_ref": project.project_ref,
            "status": project.status,
        })
    for projects in projects_by_cycle.values():
        projects.sort(key=lambda item: item["project_name"])

    active_cycle = None
    if cycle_id is not None:
        if cycle_id not in cycles:
            found = next((row[1] for row in visible_rows if row[1].id == cycle_id), None)
            if found is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CYCLE_NOT_FOUND")
            active_cycle = {"cycle_id": found.id, "cycle_name": found.name, "cycle_start_at": found.start_at, "cycle_end_at": found.end_at}
        else:
            active_cycle = cycles[cycle_id]
    elif cycles:
        active_cycle = next(iter(cycles.values()))

    active_projects = [
        project for project, cycle in visible_rows
        if active_cycle is not None and cycle.id == active_cycle["cycle_id"]
    ]
    completion_nodes = await _project_completion_nodes(active_projects, db) if active_projects else []
    return {
        "cycles": list(cycles.values()),
        "active_cycle": active_cycle,
        "projects": projects_by_cycle.get(active_cycle["cycle_id"], []) if active_cycle else [],
        "completion_nodes": completion_nodes,
        "hrbp_scope": sorted(hrbp_refs),
        "category": dict(_PROJECT_MANAGEMENT_CATEGORY),
    }


@router.get("/project-management/statistics", response_model=ProjectStatisticsReportResponse)
async def project_management_statistics(
    cycle_id: int = Query(..., ge=1),
    dimension: str = Query(default="level", pattern="^(level|tenure)$"),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    actor = await resolve_trusted_performance_actor(db, context)
    cycle = await db.scalar(select(PerformanceCycle).where(PerformanceCycle.id == cycle_id))
    if cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CYCLE_NOT_FOUND")
    projects = list((await db.execute(select(PerformanceProject).where(
        PerformanceProject.cycle_ref == cycle.cycle_ref,
        PerformanceProject.status == PROJECT_STATUS_STARTED,
    ).order_by(PerformanceProject.id))).scalars().all())
    empty_cycle_allowed = not projects and _is_cycle_manager(context)
    if not _is_admin_preview(context):
        hrbp_refs = await _person_hrbp_project_refs(db, str(actor.actor_ref))
        projects = [project for project in projects if _person_in_project_administrators(project, context.display_name) or project.project_ref in hrbp_refs]
    if not projects and not empty_cycle_allowed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CYCLE_NOT_FOUND")
    projects = [project for project in projects if _can_manage_project(context, project)]
    if not projects and not empty_cycle_allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看当前周期统计")

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
        if not _is_admin_preview(context):
            hidden_people = await _person_hrbp_invisible_people(db, str(actor.actor_ref), project.cycle_ref)
            members = [member for member in members if member.employee_no not in hidden_people]
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
}


def _task_entry_mode(task: PerformanceNodeTask | None) -> str:
    return _TASK_ENTRY_MODES.get(getattr(task, "task_kind", ""), "route") if task else "route"


def _review_node_category(node_type: str, executor_types: list[str], *, has_task: bool) -> str | None:
    if node_type in {"work_summary", "reviewer_360_invite", "result_view"}:
        return "mine"
    if node_type == "result_reconsideration":
        return "other"
    if node_type in {"reviewer_360_confirm", "calibration", "result_communication"}:
        return "team"
    if node_type == "evaluation":
        if "SUBJECT" in executor_types:
            return "mine"
        if "REVIEWER_360" in executor_types:
            return "others" if has_task else None
        if {"REAL_LINE_MANAGER", "VIRTUAL_LINE_MANAGER", "DIRECT_MANAGER", "LEVEL_1_MANAGER"}.intersection(executor_types):
            return "team"
    return None


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


def _task_completed(task: PerformanceNodeTask) -> bool:
    return getattr(task, "status", None) == "completed" or getattr(task, "submitted_at", None) is not None


def _review_tasks_status(tasks: list[PerformanceNodeTask], start_at: str | None, end_at: str | None, now: datetime | None = None) -> str:
    current = now or datetime.now(UTC)
    if _review_node_status(start_at, end_at, current) == "not_started":
        return "not_started"
    if tasks and all(_task_completed(task) for task in tasks):
        return "completed"
    return _review_node_status(start_at, end_at, current)


@router.get("/review/overview")
async def review_overview(
    project_id: int | None = Query(default=None, ge=1),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
    task_id: int | None = Query(default=None, ge=1),
):
    actor = await resolve_trusted_performance_actor(db, context)
    is_admin_preview = _is_admin_preview(context)
    member_exists = (
        select(PerformanceProjectMember.id)
        .join(PerformanceProjectMemberSnapshot, PerformanceProjectMemberSnapshot.id == PerformanceProjectMember.snapshot_id)
        .where(PerformanceProjectMemberSnapshot.project_id == PerformanceProject.id)
    )
    project_statement = (
        select(PerformanceProject, PerformanceCycle)
        .join(PerformanceCycle, PerformanceCycle.cycle_ref == PerformanceProject.cycle_ref)
        .where(PerformanceProject.status == PROJECT_STATUS_STARTED, member_exists.exists())
    )
    if not is_admin_preview:
        task_exists = select(PerformanceNodeTask.id).where(
            PerformanceNodeTask.project_id == PerformanceProject.id,
            PerformanceNodeTask.handler_ref == actor.actor_ref,
        ).exists()
        project_statement = project_statement.where(or_(
            member_exists.where(PerformanceProjectMember.portal_user_id == context.subject_id).exists(),
            task_exists,
        ))
    if project_id is not None:
        project_statement = project_statement.where(PerformanceProject.id == project_id)
    project_rows = (await db.execute(project_statement.order_by(PerformanceProject.updated_at.desc()))).all()
    projects = [
        {
            "project_id": project.id,
            "project_name": project.name,
            "cycle_name": cycle.name,
            "cycle_start_at": cycle.start_at,
            "cycle_end_at": cycle.end_at,
        }
        for project, cycle in project_rows
    ]
    if not project_rows:
        return {"projects": [], "active_project": None, "template_name": "", "categories": [{"key": key, "label": label, "nodes": []} for key, label in _REVIEW_CATEGORY_LABELS.items()]}

    project, cycle = project_rows[0]
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
    member_rows = (
        await db.execute(
            select(PerformanceProjectMember).join(
                PerformanceProjectMemberSnapshot,
                PerformanceProjectMemberSnapshot.id == PerformanceProjectMember.snapshot_id,
            ).where(
                PerformanceProjectMemberSnapshot.project_id == project.id,
                PerformanceProjectMember.portal_user_id == context.subject_id,
            )
        )
    ).scalars().all()
    handler_refs = {actor.actor_ref}
    handler_refs.update(member.employee_no for member in member_rows)
    task_query = select(PerformanceNodeTask).where(PerformanceNodeTask.project_id == project.id)
    if not is_admin_preview:
        task_query = task_query.where(PerformanceNodeTask.handler_ref.in_(handler_refs))
    tasks = (await db.execute(task_query.order_by(PerformanceNodeTask.id))).scalars().all()
    tasks_by_node = {}
    for task in tasks:
        tasks_by_node.setdefault(task.node_snapshot_id, []).append(task)

    categories = {key: {"key": key, "label": label, "nodes": []} for key, label in _REVIEW_CATEGORY_LABELS.items()}
    now = datetime.now(UTC)
    for node in snapshots:
        raw_node = (node.config or {}).get("template") or {}
        timing = _node_timing(project, node) or {}
        executor_types = list(raw_node.get("executor_types") or [])
        category = _review_node_category(node.node_type, executor_types, has_task=bool(tasks_by_node.get(node.id)))
        if category is None:
            continue
        start_at = timing.get("start_at")
        end_at = timing.get("end_at") or timing.get("appeal_deadline")
        selected_task = _select_review_task(tasks_by_node.get(node.id, []), task_id)
        selected_task_kind = getattr(selected_task, "task_kind", None) if selected_task else None
        is_template_task = selected_task_kind in _TASK_ENTRY_MODES
        node_payload = {
            "node_id": node.node_id,
            "node_name": template_names.get(node.node_id, node.name),
            "node_type": node.node_type,
            "task_kind": selected_task_kind,
            "entry_mode": _task_entry_mode(selected_task),
            "executor_label": raw_node.get("executor_label") or "",
            "status": _review_tasks_status(tasks_by_node.get(node.id, []), start_at, end_at, now) if is_template_task and node.node_type == "evaluation" else (_review_task_status(selected_task, start_at, end_at, now) if is_template_task else _review_node_status(start_at, end_at, now)),
            "start_at": start_at,
            "end_at": end_at,
            "action_url": f"/performance/review?node={node.node_id}&project_id={project.id}",
            "task_id": selected_task.id if selected_task else None,
        }
        if is_template_task and selected_task is not None:
            available_at, due_at = _task_window(selected_task, node, project)
            editable, _ = _self_summary_state(selected_task, available_at, due_at)
            node_payload["editable"] = editable
            node_payload["submitted_at"] = selected_task.submitted_at
            if selected_task.submitted_at is not None:
                node_payload["form_schema"] = build_self_summary_schema(await _self_summary_template(selected_task, node, db))
                node_payload["answers"] = selected_task.answers or {}
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
        "categories": list(categories.values()),
    }


@router.get("/workbench/projects")
async def workbench_projects(
    keyword: str | None = Query(default=None, max_length=128),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    actor = await resolve_trusted_performance_actor(db, context)
    is_admin_preview = _is_admin_preview(context)
    member_exists = (
        select(PerformanceProjectMember.id)
        .join(PerformanceProjectMemberSnapshot, PerformanceProjectMemberSnapshot.id == PerformanceProjectMember.snapshot_id)
        .where(PerformanceProjectMemberSnapshot.project_id == PerformanceProject.id)
    )
    stmt = (
        select(PerformanceProject, PerformanceCycle)
        .join(PerformanceCycle, PerformanceCycle.cycle_ref == PerformanceProject.cycle_ref)
        .where(PerformanceProject.status == PROJECT_STATUS_STARTED, member_exists.exists())
    )
    if not is_admin_preview:
        task_exists = select(PerformanceNodeTask.id).where(
            PerformanceNodeTask.project_id == PerformanceProject.id,
            PerformanceNodeTask.handler_ref == actor.actor_ref,
        ).exists()
        stmt = stmt.where(or_(
            member_exists.where(PerformanceProjectMember.portal_user_id == context.subject_id).exists(),
            task_exists,
        ))
    if keyword:
        stmt = stmt.where(PerformanceProject.name.ilike(f"%{keyword.strip()}%"))
    rows = (await db.execute(stmt.order_by(PerformanceProject.updated_at.desc()).offset((page - 1) * page_size).limit(page_size))).all()
    return [{"project_id": project.id, "project_name": project.name, "cycle_ref": project.cycle_ref, "cycle_name": cycle.name, "cycle_start_at": cycle.start_at, "cycle_end_at": cycle.end_at, "project_status": project.status, "result_published": bool((project.settings or {}).get("result_published", False)), "participation_roles": []} for project, cycle in rows]


@router.get("/workbench/projects/{project_id}/timeline")
async def workbench_timeline(project_id: int, context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session)):
    actor = await resolve_trusted_performance_actor(db, context)
    is_admin_preview = _is_admin_preview(context)
    member_allowed = select(PerformanceProjectMember.id).join(
        PerformanceProjectMemberSnapshot,
        PerformanceProjectMemberSnapshot.id == PerformanceProjectMember.snapshot_id,
    ).where(
        PerformanceProjectMemberSnapshot.project_id == project_id,
        PerformanceProjectMember.portal_user_id == context.subject_id,
    ).exists()
    task_allowed = select(PerformanceNodeTask.id).where(
        PerformanceNodeTask.project_id == project_id,
        PerformanceNodeTask.handler_ref == actor.actor_ref,
    ).exists()
    if is_admin_preview:
        allowed = await db.scalar(select(PerformanceProjectMemberSnapshot.id).where(PerformanceProjectMemberSnapshot.project_id == project_id).limit(1))
    else:
        allowed = await db.scalar(select(PerformanceProjectMemberSnapshot.id).where(
            PerformanceProjectMemberSnapshot.project_id == project_id,
            or_(member_allowed, task_allowed),
        ).limit(1))
    project = await db.get(PerformanceProject, project_id)
    if project is None or project.status != PROJECT_STATUS_STARTED or allowed is None:
        raise HTTPException(status_code=403, detail="无权查看当前项目工作台")
    template_names = await _template_node_names(db, project)
    nodes = (await db.execute(select(PerformanceProjectNodeSnapshot).where(PerformanceProjectNodeSnapshot.project_id == project_id, PerformanceProjectNodeSnapshot.node_type.not_in({"result_reconsideration"})).order_by(PerformanceProjectNodeSnapshot.node_order))).scalars().all()
    now = datetime.now(UTC)
    result = []
    for node in nodes:
        timing = _node_timing(project, node) or {}
        start_at = timing.get("start_at")
        end_at = timing.get("end_at")
        result.append({"node_id": node.node_id, "node_name": template_names.get(node.node_id, node.name), "node_type": node.node_type, "node_order": node.node_order, "executor_label": (node.config.get("template") or {}).get("executor_label"), "start_at": start_at, "end_at": end_at, "status": _review_node_status(start_at, end_at, now)})
    return result


@router.get("/workbench/tasks")
async def workbench_tasks(project_id: int | None = None, state: str = Query(default="pending", pattern="^(pending|completed)$"), context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session)):
    actor = await resolve_trusted_performance_actor(db, context)
    handler = str(actor.actor_ref)
    is_admin_preview = _is_admin_preview(context)
    stmt = select(PerformanceProjectNodeSnapshot, PerformanceNodeTask).join(PerformanceNodeTask, PerformanceNodeTask.node_snapshot_id == PerformanceProjectNodeSnapshot.id).join(PerformanceProject, PerformanceProject.id == PerformanceNodeTask.project_id).where(PerformanceProject.status == PROJECT_STATUS_STARTED, PerformanceProjectNodeSnapshot.node_type.not_in({"result_view", "result_reconsideration"}))
    if not is_admin_preview:
        stmt = stmt.where(PerformanceNodeTask.handler_ref == handler)
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
        result.append({"node_id": node.node_id, "node_type": node.node_type, "node_name": template_names.get(node.node_id, node.name), "pending_count": len(pending_tasks), "completed_count": len(tasks) - len(pending_tasks), "overdue_count": 0, "task_id": first_task.id, "available_at": available_at, "due_at": due_at, "action_url": f"/performance/review?node={node.node_id}"})
    return result


@router.get("/workbench/tasks/{node_id}/people")
async def workbench_task_people(node_id: str, project_id: int, state: str = Query(default="pending", pattern="^(pending|completed|all)$"), context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session), keyword: str | None = Query(default=None, max_length=100)):
    actor = await resolve_trusted_performance_actor(db, context)
    handler = str(actor.actor_ref)
    is_admin_preview = _is_admin_preview(context)
    scope = (
        PerformanceNodeTask.project_id == project_id,
        PerformanceProjectNodeSnapshot.project_id == project_id,
        PerformanceProjectNodeSnapshot.node_id == node_id,
    )
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
        statement = statement.where(PerformanceNodeTask.handler_ref == handler)
    if isinstance(keyword, str) and keyword.strip():
        value = f"%{keyword.strip()}%"
        statement = statement.where(or_(PerformanceProjectMember.display_name.ilike(value), PerformanceProjectMember.employee_no.ilike(value), PerformanceNodeTask.target_employee_no.ilike(value)))
    rows = (await db.execute(statement.order_by(PerformanceNodeTask.id))).all()
    project = await db.get(PerformanceProject, project_id)
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
            "status": task.status,
            "company_org": getattr(member, "company_org", None) if member else None,
            "department": organization_leaf(member) if member else None,
            "department_2": getattr(member, "department_2", None) if member else None,
            "department_3": getattr(member, "department_3", None) if member else None,
            "department_4": getattr(member, "department_4", None) if member else None,
            "department_5": getattr(member, "department_5", None) if member else None,
            "job_family": getattr(member, "job_family", None) if member else None,
            "job_category": getattr(member, "job_category", None) if member else None,
            "job_sequence": format_job_sequence(getattr(member, "job_family", None), getattr(member, "job_category", None)) if member else None,
            "position_level": getattr(member, "position_level", None) if member else None,
            "hire_date": getattr(member, "hire_date", None).isoformat() if member and getattr(member, "hire_date", None) else None,
            "employee_type": getattr(member, "employee_type", None) if member else None,
            "employment_status": getattr(member, "employment_status", None) if member else None,
            "due_at": _task_window(task, node, project)[1],
            "reminder_target": getattr(task, "handler_ref", handler),
            "direct_supervisor": getattr(member, "direct_supervisor_employee_no", None) if member else None,
            "hrbp": getattr(member, "hrbp_employee_no", None) if member else None,
            "completion": None,
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
