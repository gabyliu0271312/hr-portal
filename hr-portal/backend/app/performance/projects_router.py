"""Performance project configuration API."""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import PerformanceAccessContext, get_performance_access_context, performance_admin_preview_enabled, resolve_trusted_performance_actor
from app.performance.cycle_service import PerformanceCycleService
from app.performance.models import PerformanceCycle, PerformanceNodeTask, PerformanceProject, PerformanceProjectMember, PerformanceProjectMemberSnapshot, PerformanceProjectNodeSnapshot, PerformanceTemplate, PerformanceTemplateWorkflow, PROJECT_STATUS_STARTED
from app.performance.self_summary_service import build_self_summary_schema, hydrate_self_summary_template, iter_self_summary_field_instances, resolve_self_summary_content, sanitize_self_summary_answers, self_summary_field_requires_value, self_summary_value_empty
from app.performance.project_service import PerformanceProjectService, ProjectValidationError, _parse_time
from app.data.models import DATA_TABLES

router = APIRouter(prefix="/performance", tags=["performance-projects"])


def _is_admin_preview(context: PerformanceAccessContext) -> bool:
    return performance_admin_preview_enabled(context)


class SelfSummaryAnswersPayload(BaseModel):
    answers: dict = Field(default_factory=dict)
    version: int | None = Field(default=None, ge=1)


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


async def _template_task_detail(task: PerformanceNodeTask, node: PerformanceProjectNodeSnapshot, db: AsyncSession):
    project = await db.get(PerformanceProject, task.project_id)
    available_at, due_at = _task_window(task, node, project)
    editable, submit_allowed = _self_summary_state(task, available_at, due_at)
    template = await _self_summary_template(task, node, db)
    member = await db.scalar(select(PerformanceProjectMember).where(
        PerformanceProjectMember.snapshot_id == task.member_snapshot_id,
        PerformanceProjectMember.employee_no == task.target_employee_no,
    ))
    manager_name = None
    if member and member.direct_manager_employee_no:
        manager_name = await db.scalar(select(PerformanceProjectMember.display_name).where(
            PerformanceProjectMember.snapshot_id == task.member_snapshot_id,
            PerformanceProjectMember.employee_no == member.direct_manager_employee_no,
        ))
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
            "organization_ref": member.organization_ref if member else None,
            "manager_name": manager_name,
        },
        "form_schema": build_self_summary_schema(template),
        "answers": task.answers or {},
    }


@router.get("/tasks/{task_id}/self-summary")
async def get_self_summary(task_id: int, context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session), employee_no: str | None = Query(default=None)):
    task_args = (task_id, context, db)
    if employee_no:
        task_args = (*task_args, "work_summary", employee_no)
    task, node = await _self_summary_task(*task_args)
    return await _template_task_detail(task, node, db)


@router.get("/tasks/{task_id}/template-task")
async def get_template_task(task_id: int, context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session), employee_no: str | None = Query(default=None)):
    task_args = (task_id, context, db, "evaluation")
    if employee_no:
        task_args = (*task_args, employee_no)
    task, node = await _self_summary_task(*task_args)
    return await _template_task_detail(task, node, db)


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
    avatar_url: str | None = None
    rating: str | None = None
    rating_tone: str | None = None
    completion: str | None = None
    sequence: str | None = None
    level: str | None = None
    entry_date: str | None = None
    department: str | None = None
    employment_status: str | None = None


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


def _matrix_level(value: object) -> str:
    text = str(value or "").strip()
    return text or "--"


def _matrix_level_sort_key(level: str) -> tuple[int, int | str]:
    if level == "--":
        return (1, "")
    if level[:1] in {"J", "P", "M"} and level[1:].isdigit():
        return (0, -int(level[1:]))
    return (0, level)


def _matrix_rating_value(value: object, options: list[dict]) -> dict | None:
    if isinstance(value, list):
        value = value[0] if value else None
    if isinstance(value, dict):
        value = value.get("id") or value.get("value") or value.get("option_id") or value.get("label")
    if value is None or not str(value).strip():
        return None
    text = str(value).strip()
    return next((option for option in options if text in {str(option.get("id")), str(option.get("label"))}), None)


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
    roster_fields = await _roster_member_fields(db, [member.employee_no for member in members])
    levels = {
        member.employee_no: _matrix_level(roster_fields.get(member.employee_no, {}).get("position_level"))
        for member in members
    }
    people = {member.employee_no: _matrix_person(member) for member in members}

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
    tasks = list((await db.execute(
        select(PerformanceNodeTask).where(
            PerformanceNodeTask.project_id == project_id,
            PerformanceNodeTask.node_snapshot_id.in_([node.id for node in final_nodes]) if final_nodes else False,
        ).order_by(PerformanceNodeTask.id)
    )).scalars().all())
    tasks_by_node: dict[int, list[PerformanceNodeTask]] = {}
    for task in tasks:
        tasks_by_node.setdefault(task.node_snapshot_id, []).append(task)

    ratings: list[dict] = []
    final_values: dict[str, tuple[int, int, str, dict]] = {}
    for node in final_nodes:
        schema = await _matrix_node_schema(node, project, db)
        rating_fields = [field for section in schema for field in section.get("fields", []) if field.get("type") == "rating"]
        if not rating_fields:
            continue
        field = rating_fields[0]
        options = [dict(option) for option in field.get("options", [])]
        for option in options:
            normalized = {"key": str(option.get("id")), "label": str(option.get("label") or option.get("id")), "color": option.get("color")}
            if not any(item["key"] == normalized["key"] for item in ratings):
                ratings.append(normalized)
        for task in tasks_by_node.get(node.id, []):
            if task.submitted_at is None or task.target_employee_no not in people:
                continue
            option = _matrix_rating_value((task.answers or {}).get(field.get("id")), options)
            if option is None:
                continue
            normalized = {"key": str(option.get("id")), "label": str(option.get("label") or option.get("id")), "color": option.get("color")}
            if not any(item["key"] == normalized["key"] for item in ratings):
                ratings.append(normalized)
            submitted_key = task.submitted_at.isoformat() if hasattr(task.submitted_at, "isoformat") else str(task.submitted_at)
            candidate = (node.node_order, task.id, submitted_key, normalized)
            previous = final_values.get(task.target_employee_no)
            if previous is None or candidate[:3] > previous[:3]:
                final_values[task.target_employee_no] = candidate

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


async def _roster_member_fields(db: AsyncSession, employee_nos: list[str]) -> dict[str, dict]:
    model = DATA_TABLES.get("emp_realtime_roster")
    if model is None or not employee_nos:
        return {}
    table = model.__table__
    employee_no = next((table.c[name] for name in ("employee_no", "工号") if name in table.c), None)
    hire_date = next((table.c[name] for name in ("hire_date", "入职日期") if name in table.c), None)
    position_level = next((table.c[name] for name in ("position_level", "岗位层级") if name in table.c), None)
    job_category = next((table.c[name] for name in ("job_category", "职位序列") if name in table.c), None)
    department_fields = [table.c[name] for name in ("company_org", "department", "department_2", "department_3", "department_4", "department_5") if name in table.c]
    if employee_no is None or (hire_date is None and position_level is None and job_category is None and not department_fields):
        return {}
    columns = [employee_no.label("employee_no")]
    if hire_date is not None:
        columns.append(hire_date.label("hire_date"))
    if position_level is not None:
        columns.append(position_level.label("position_level"))
    if job_category is not None:
        columns.append(job_category.label("job_category"))
    for field in department_fields:
        columns.append(field.label(field.name))
    rows = (await db.execute(select(*columns).where(cast(employee_no, String).in_(employee_nos)))).mappings().all()
    return {str(row["employee_no"]): dict(row) for row in rows}


def _last_non_empty_department(roster_row: dict, fallback: str | None) -> str | None:
    values = [roster_row.get(field) for field in ("company_org", "department", "department_2", "department_3", "department_4", "department_5")]
    non_empty = [str(value).strip() for value in values if value is not None and str(value).strip()]
    return non_empty[-1] if non_empty else (fallback.strip() if fallback and fallback.strip() else None)


@router.get("/projects/{project_id}/members", response_model=ProjectMemberPage)
async def list_project_members(
    project_id: int,
    keyword: str | None = Query(default=None, max_length=128),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    sort_by: str | None = Query(default=None, pattern="^(name|rating|completion|sequence|level|entry_date|department)$"),
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
    roster_fields = await _roster_member_fields(db, [member.employee_no for member in members])

    def serialize_member(member: PerformanceProjectMember) -> ProjectMemberResponse:
        roster = roster_fields.get(member.employee_no, {})
        hire_date = roster.get("hire_date")
        return ProjectMemberResponse(
            id=member.id,
            employee_no=member.employee_no,
            display_name=member.display_name,
            employment_status=member.employment_status,
            department=_last_non_empty_department(roster, member.organization_ref),
            sequence=str(roster.get("job_category") or "") or None,
            level=str(roster.get("position_level") or "") or None,
            entry_date=hire_date.isoformat() if hasattr(hire_date, "isoformat") else str(hire_date or "") or None,
        )

    items = [serialize_member(member) for member in members]
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


def _person_in_project_administrators(project: PerformanceProject, display_name: str | None) -> bool:
    """Match the actor against project administrators (stored by display name today)."""
    if not display_name:
        return False
    return display_name in (project.administrators or [])


async def _person_hrbp_project_refs(db: AsyncSession, actor_ref: str) -> set[str]:
    """HRBP scope for project management visibility.

    Contract reserved for the upcoming HRBP assignment feature; returns an
    empty scope until that data source exists so HRBP matching stays inert.
    """
    return set()


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

    return {
        "cycles": list(cycles.values()),
        "active_cycle": active_cycle,
        "projects": projects_by_cycle.get(active_cycle["cycle_id"], []) if active_cycle else [],
        "hrbp_scope": sorted(hrbp_refs),
        "category": dict(_PROJECT_MANAGEMENT_CATEGORY),
    }


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
            "status": _review_task_status(selected_task, start_at, end_at, now) if is_template_task else _review_node_status(start_at, end_at, now),
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
    handler = str(context.subject_id)
    is_admin_preview = _is_admin_preview(context)
    stmt = select(PerformanceProject, PerformanceCycle).join(PerformanceCycle, PerformanceCycle.cycle_ref == PerformanceProject.cycle_ref).join(PerformanceNodeTask, PerformanceNodeTask.project_id == PerformanceProject.id).distinct()
    if not is_admin_preview:
        stmt = stmt.where(PerformanceNodeTask.handler_ref == handler)
    if keyword:
        stmt = stmt.where(PerformanceProject.name.ilike(f"%{keyword.strip()}%"))
    rows = (await db.execute(stmt.order_by(PerformanceProject.updated_at.desc()).offset((page - 1) * page_size).limit(page_size))).all()
    return [{"project_id": project.id, "project_name": project.name, "cycle_name": cycle.name, "cycle_start_at": cycle.start_at, "cycle_end_at": cycle.end_at, "project_status": project.status, "result_published": bool((project.settings or {}).get("result_published", False)), "participation_roles": []} for project, cycle in rows]


@router.get("/workbench/projects/{project_id}/timeline")
async def workbench_timeline(project_id: int, context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session)):
    handler = str(context.subject_id)
    is_admin_preview = _is_admin_preview(context)
    allowed = await db.scalar(select(PerformanceNodeTask.id).where(PerformanceNodeTask.project_id == project_id).limit(1)) if is_admin_preview else await db.scalar(select(PerformanceNodeTask.id).where(PerformanceNodeTask.project_id == project_id, PerformanceNodeTask.handler_ref == handler).limit(1))
    if allowed is None:
        raise HTTPException(status_code=403, detail="无权查看当前项目工作台")
    project = await db.get(PerformanceProject, project_id)
    template_names = await _template_node_names(db, project) if project else {}
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
    handler = str(context.subject_id)
    is_admin_preview = _is_admin_preview(context)
    stmt = select(PerformanceProjectNodeSnapshot, func.count(PerformanceNodeTask.id)).join(PerformanceNodeTask, PerformanceNodeTask.node_snapshot_id == PerformanceProjectNodeSnapshot.id).where(PerformanceNodeTask.status == state, PerformanceProjectNodeSnapshot.node_type.not_in({"result_view", "result_reconsideration"}))
    if not is_admin_preview:
        stmt = stmt.where(PerformanceNodeTask.handler_ref == handler)
    if project_id is not None:
        stmt = stmt.where(PerformanceNodeTask.project_id == project_id)
    rows = (await db.execute(stmt.group_by(PerformanceProjectNodeSnapshot.id).order_by(PerformanceProjectNodeSnapshot.node_order))).all()
    project = await db.get(PerformanceProject, project_id) if project_id is not None else None
    template_names = await _template_node_names(db, project) if project else {}
    result = []
    for node, count in rows:
        first_task_query = select(PerformanceNodeTask).where(PerformanceNodeTask.node_snapshot_id == node.id, PerformanceNodeTask.status == state)
        if not is_admin_preview:
            first_task_query = first_task_query.where(PerformanceNodeTask.handler_ref == handler)
        first_task = await db.scalar(first_task_query.order_by(PerformanceNodeTask.id).limit(1))
        current_project = project if project and project.id == node.project_id else await db.get(PerformanceProject, node.project_id)
        available_at, due_at = _task_window(first_task, node, current_project)
        result.append({"node_id": node.node_id, "node_type": node.node_type, "node_name": template_names.get(node.node_id, node.name), "pending_count": int(count) if state == "pending" else 0, "completed_count": int(count) if state == "completed" else 0, "overdue_count": 0, "task_id": first_task.id, "available_at": available_at, "due_at": due_at, "action_url": f"/performance/review?node={node.node_id}"})
    return result


@router.get("/workbench/tasks/{node_id}/people")
async def workbench_task_people(node_id: str, project_id: int, state: str = Query(default="pending", pattern="^(pending|completed)$"), context: PerformanceAccessContext = Depends(get_performance_access_context), db: AsyncSession = Depends(get_session), keyword: str | None = Query(default=None, max_length=100)):
    actor = await resolve_trusted_performance_actor(db, context)
    handler = str(actor.actor_ref)
    is_admin_preview = _is_admin_preview(context)
    scope = (
        PerformanceNodeTask.project_id == project_id,
        PerformanceProjectNodeSnapshot.project_id == project_id,
        PerformanceProjectNodeSnapshot.node_id == node_id,
        PerformanceNodeTask.status == state,
    )
    aggregate_query = select(PerformanceNodeTask.id).join(PerformanceProjectNodeSnapshot, PerformanceProjectNodeSnapshot.id == PerformanceNodeTask.node_snapshot_id).where(*scope).order_by(PerformanceNodeTask.id).limit(1)
    if not is_admin_preview:
        aggregate_query = aggregate_query.where(PerformanceNodeTask.handler_ref == handler)
    aggregate_value = await db.scalar(aggregate_query)
    aggregate_task_id = getattr(aggregate_value, "id", aggregate_value)
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
    return [{"task_id": task.id, "aggregate_task_id": aggregate_task_id, "employee_no": member.employee_no if member else task.target_employee_no, "display_name": member.display_name if member else task.target_employee_no, "status": task.status, "due_at": _task_window(task, node, project)[1]} for task, node, member in rows]
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
