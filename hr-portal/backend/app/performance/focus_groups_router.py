"""Performance focus groups (人员组) API.

契约对齐 REA 实测飞书「人员组管理」页：
- 列表：按 cycle + tab（semester | project）拉取，一次拿全量（切换页签不发新请求）
- priority check：进入页面时校验该周期是否仍允许维护人员组（被评估项目占用时为 false）
- CRUD：新建 / 编辑 / 删除，鉴权对齐现有管理端惯例（performance.cycles.manage，
  与周期详情设置入口 canManageCycles 门控一致；people-groups.* 为功能权限配置树键，
  不用于 API 鉴权）
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import (
    PerformanceAccessContext,
    require_performance_permission,
)
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.models import (
    PerformanceAuthorizationSnapshotPerson,
    PerformanceCycle,
    PerformanceFocusGroup,
    PerformanceProject,
    PerformanceProjectNodeSnapshot,
    PerformanceTemplateWorkflow,
)
from app.performance.project_service import PerformanceProjectService, ProjectValidationError

router = APIRouter(prefix="/performance/cycles", tags=["performance-focus-groups"])

FOCUS_GROUP_TAB = Literal["semester", "project"]
# 鉴权对齐现有管理端惯例：周期管理权限（admin 必含，入口 canManageCycles 同键）。
# people-groups.cycle/project 留在功能权限配置树（角色编辑页勾选），不用于 API 鉴权。
FOCUS_GROUP_PERMISSION = "performance.cycles.manage"
RESOLVE_SCOPE_JOB_KIND = "performance_focus_scope"
RESOLVE_SCOPE_TTL = timedelta(minutes=10)
RESOLVE_SCOPE_FIELD_MAP = {
    "department": "department",
    "employee": "employee",
    "employeeType": "employee_type",
    "superior": "superior",
    "directLeader": "directLeader",
    "category": "job_family",
    "level": "position_level",
    "joinDate": "hire_date",
    "dimissionTime": "departure_date",
    "dimissionStatus": "employment_status",
}
RESOLVE_SCOPE_OPERATOR_MAP = {
    "eq": "include",
    "neq": "exclude",
    "lt": "before",
    "ge": "not_before",
    "gt": "after",
    "le": "not_after",
}


class FocusGroupPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=128)
    en_name: str = Field(default="", max_length=128)
    tab: FOCUS_GROUP_TAB = "semester"
    description: dict[str, str] = Field(default_factory=dict)
    followee_user_ids: list[str] = Field(default_factory=list)
    view_permission: int = Field(default=1, ge=0)
    scope_setting_mode: int = Field(default=0, ge=0, le=2)
    scope: list[list[dict[str, object]]] | None = None
    show_group_tag: bool = False
    tag_color: str = Field(default="purple-option", max_length=32)
    text_color: str = Field(default="#2f0080", max_length=32)
    bg_color: str = Field(default="rgba(141,85,237,0.2)", max_length=64)
    is_communicate_time: bool = False
    start_time: str | None = Field(default=None, max_length=32)
    end_time: str | None = Field(default=None, max_length=32)
    employee_nos: list[str] = Field(default_factory=list)
    scope_mode: str = Field(default="manual", max_length=32)
    project_ref: str | None = Field(default=None, max_length=64)
    activity_ids: list[str] = Field(default_factory=list)
    roles_of_managing_scope: list[str] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("人员组名称不能为空")
        return normalized

    @field_validator("employee_nos", "followee_user_ids", "activity_ids", "roles_of_managing_scope")
    @classmethod
    def normalize_string_list(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            item = value.strip()
            if item and item not in normalized:
                normalized.append(item)
        return normalized

    @model_validator(mode="after")
    def validate_communication_time(self) -> "FocusGroupPayload":
        if not self.is_communicate_time:
            return self
        if not self.start_time or not self.end_time:
            raise ValueError("启用独立结果沟通时间时必须填写开始时间和截止时间")
        try:
            start = datetime.fromisoformat(self.start_time.replace("Z", "+00:00"))
            end = datetime.fromisoformat(self.end_time.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("结果沟通时间格式不合法") from exc
        if start >= end:
            raise ValueError("结果沟通开始时间必须早于截止时间")
        return self

    @model_validator(mode="after")
    def validate_rule_scope(self) -> "FocusGroupPayload":
        if self.scope is not None and any(not group for group in self.scope):
            raise ValueError("人员范围条件组不能为空")
        return self


class FocusGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cycle_ref: str
    tab: str
    name: str
    en_name: str
    description: dict[str, str]
    followee_user_ids: list[str]
    view_permission: int
    scope_setting_mode: int
    scope: list[list[dict[str, object]]] | None
    show_group_tag: bool
    tag_color: str
    text_color: str
    bg_color: str
    is_communicate_time: bool
    start_time: str | None
    end_time: str | None
    employee_nos: list[str]
    scope_mode: str
    project_ref: str | None
    activity_ids: list[str]
    activity_names: list[str] = Field(default_factory=list)
    roles_of_managing_scope: list[str]
    created_by_type: str | None
    created_by_ref: str | None
    updated_by_type: str | None
    updated_by_ref: str | None
    created_at: datetime
    updated_at: datetime


class ResolveScopePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scopes: list[list[dict[str, object]]] = Field(default_factory=list)
    user_group_id: str = ""


class ResolveScopeItemOut(BaseModel):
    conflicted: None = None
    no_task_list: None = None
    scope_permission_tips: dict[str, int] = Field(default_factory=lambda: {"mode": 0})
    selected: list[str]


class ResolveScopeOut(BaseModel):
    task_id: str | None = None
    status: int | None = None
    scopes: list[ResolveScopeItemOut] | None = None
    error: str | None = None


class FocusGroupPersonQuery(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    keyword: str = Field(default="", max_length=128)
    exclude_dismissed: bool = Field(
        default=False,
        validation_alias=AliasChoices("exclude_dismissed", "excludeDismissed"),
    )


class FocusGroupPersonOption(BaseModel):
    value: str
    label: str
    sub_label: str
    department: str | None = None
    email: str | None = None


class FocusGroupOptionsOut(BaseModel):
    fields: list[dict[str, Any]]
    organization_tree: list[dict[str, Any]]
    people: list[FocusGroupPersonOption]
    employee_types: list[dict[str, str]]
    employment_statuses: list[dict[str, str]]
    job_families: list[dict[str, str]]
    position_levels: list[dict[str, str]]
    hire_date_range: dict[str, str | None]
    departure_date_range: dict[str, str | None]
    api_document_url: str | None = None
    communication_enabled: bool = False


class FocusGroupPage(BaseModel):
    total: int
    items: list[FocusGroupOut]


class FocusGroupPriorityCheck(BaseModel):
    data: bool


async def _require_cycle(db: AsyncSession, cycle_id: int) -> PerformanceCycle:
    cycle = await db.get(PerformanceCycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="周期不存在")
    return cycle


def _is_project_occupied(db: AsyncSession, cycle_ref: str, tab: str, project_ref: str | None) -> bool:
    # 预留：Tab2 关联评估项目级的人员组需在创建时校验项目是否已被其他人员组占用。
    # 当前租户无该场景数据，占用校验留待补采飞书交互后完善。
    return False


def _resolve_task_uuid(task_id: str) -> UUID:
    try:
        return UUID(task_id.removeprefix("v2_"))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="范围解析任务不存在") from exc


def _resolve_business_id(task_uuid: UUID) -> int:
    return task_uuid.int & ((1 << 63) - 1)


def _resolve_owner(context: PerformanceAccessContext) -> dict[str, str]:
    return {"subject_type": context.subject_type, "subject_id": str(context.subject_id)}


def _normalize_resolve_rules(scopes: list[list[dict[str, object]]]) -> list[dict[str, Any]]:
    if not scopes or any(not group for group in scopes):
        raise HTTPException(status_code=422, detail="人员范围规则不完整")
    groups: list[dict[str, Any]] = []
    for scope_group in scopes:
        conditions: list[dict[str, Any]] = []
        for item in scope_group:
            key = str(item.get("key") or "")
            if key == "sequenceLevel":
                raise HTTPException(status_code=422, detail="暂不支持人员范围维度：sequenceLevel（序列职级映射未确认）")
            field = RESOLVE_SCOPE_FIELD_MAP.get(key)
            if field is None:
                raise HTTPException(status_code=422, detail=f"暂不支持人员范围维度：{key or '未知'}")
            condition = str(item.get("condition") or "")
            operator = RESOLVE_SCOPE_OPERATOR_MAP.get(condition)
            if operator is None:
                raise HTTPException(status_code=422, detail=f"暂不支持人员范围操作符：{condition or '未知'}")
            raw_values = item.get("value")
            if not isinstance(raw_values, list):
                raise HTTPException(status_code=422, detail="人员范围条件值格式不正确")
            values = list(dict.fromkeys(str(value).strip() for value in raw_values if str(value).strip()))
            if not values:
                raise HTTPException(status_code=422, detail="人员范围条件值不能为空")
            conditions.append({"field": field, "operator": operator, "values": values})
        groups.append({"conditions": conditions})
    return groups


async def _find_resolve_job(db: AsyncSession, task_id: str):
    from app.scheduler.models import ScheduledJob

    task_uuid = _resolve_task_uuid(task_id)
    return await db.scalar(
        select(ScheduledJob).where(
            ScheduledJob.kind == RESOLVE_SCOPE_JOB_KIND,
            ScheduledJob.business_id == _resolve_business_id(task_uuid),
        )
    )


async def _find_resolve_run(db: AsyncSession, job_id: int):
    from app.scheduler.models import JobRun

    return await db.scalar(
        select(JobRun)
        .where(JobRun.job_id == job_id, JobRun.kind == RESOLVE_SCOPE_JOB_KIND)
        .order_by(JobRun.id.desc())
        .limit(1)
    )


@router.post("/{cycle_id}/focus-groups/resolve-scope", response_model=ResolveScopeOut)
async def create_or_poll_resolve_scope(
    cycle_id: int,
    payload: ResolveScopePayload,
    task_id: str = "-1",
    context: PerformanceAccessContext = Depends(require_performance_permission(FOCUS_GROUP_PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> ResolveScopeOut:
    cycle = await _require_cycle(db, cycle_id)
    rules = _normalize_resolve_rules(payload.scopes)
    owner = _resolve_owner(context)
    payload_snapshot = {
        "cycle_id": cycle.id,
        "cycle_ref": cycle.cycle_ref,
        "user_group_id": payload.user_group_id,
        "scopes": payload.scopes,
        "evaluator_rules": {"groups": rules},
        "owner": owner,
    }
    if task_id == "-1":
        from app.scheduler.engine import get_engine
        from app.scheduler.service import upsert_job

        engine = get_engine()
        if engine._scheduler is None:
            raise HTTPException(status_code=503, detail="范围解析调度器未启动")
        task_uuid = uuid4()
        job = await upsert_job(
            db,
            kind=RESOLVE_SCOPE_JOB_KIND,
            business_id=_resolve_business_id(task_uuid),
            cron="手动触发",
            payload={**payload_snapshot, "task_id": f"v2_{task_uuid}"},
            enabled=False,
        )
        await db.commit()
        engine._scheduler.add_job(
            engine.run_job_now,
            args=[job.id, f"{context.subject_type}:{context.subject_id}"],
        )
        return ResolveScopeOut(task_id=f"v2_{task_uuid}", status=1)

    job = await _find_resolve_job(db, task_id)
    if job is None or (job.payload or {}).get("task_id") != task_id:
        raise HTTPException(status_code=404, detail="范围解析任务不存在")
    task_payload = job.payload or {}
    if task_payload.get("cycle_id") != cycle.id or task_payload.get("cycle_ref") != cycle.cycle_ref:
        raise HTTPException(status_code=404, detail="范围解析任务不存在")
    if task_payload.get("owner") != owner:
        raise HTTPException(status_code=403, detail="无权读取该范围解析任务")
    if task_payload.get("scopes") != payload.scopes or task_payload.get("user_group_id", "") != payload.user_group_id:
        raise HTTPException(status_code=409, detail="轮询参数与范围解析任务不一致")
    run = await _find_resolve_run(db, job.id)
    task_created_at = getattr(job, "created_at", None) or getattr(run, "started_at", None)
    if task_created_at is not None:
        if task_created_at.tzinfo is None:
            task_created_at = task_created_at.replace(tzinfo=UTC)
        if datetime.now(UTC) - task_created_at.astimezone(UTC) > RESOLVE_SCOPE_TTL:
            return ResolveScopeOut(task_id=task_id, status=4, error="范围解析任务已过期")
    if run is None:
        return ResolveScopeOut(task_id=task_id, status=1)
    if run.status == "running":
        return ResolveScopeOut(task_id=task_id, status=1)
    if run.status == "failed":
        return ResolveScopeOut(task_id=task_id, status=3, error=run.message or "范围解析失败")
    selected = list((job.payload or {}).get("selected") or [])
    return ResolveScopeOut(
        task_id=task_id,
        status=2,
        scopes=[ResolveScopeItemOut(selected=selected)],
    )


async def _resolved_employee_nos(
    db: AsyncSession,
    cycle: PerformanceCycle,
    payload: FocusGroupPayload,
) -> list[str]:
    if payload.scope_setting_mode != 0:
        return payload.employee_nos
    if payload.scope is None:
        raise HTTPException(status_code=422, detail="按规则维护人员范围时必须配置人员范围规则")
    rules = _normalize_resolve_rules(payload.scope)
    try:
        matched, _, _ = await PerformanceProjectService(db).preview_people(
            cycle,
            {"evaluator_rules": {"groups": rules}, "scope_rules": {"groups": []}},
            exclude_occupied=False,
        )
    except ProjectValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return [person.employee_no for person in matched]


async def _cycle_people(db: AsyncSession, cycle: PerformanceCycle) -> list[PerformanceAuthorizationSnapshotPerson]:
    try:
        _, people = await PerformanceProjectService(db)._cycle_snapshot_people(cycle)
    except ProjectValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return people


def _person_option(person: PerformanceAuthorizationSnapshotPerson) -> FocusGroupPersonOption:
    department = person.organization_ref or person.department
    return FocusGroupPersonOption(
        value=person.employee_no,
        label=person.display_name,
        sub_label=" · ".join(value for value in (person.employee_no, department) if value),
        department=department,
        email=None,
    )


@router.get("/{cycle_id}/focus-groups/options", response_model=FocusGroupOptionsOut)
async def focus_group_options(
    cycle_id: int,
    _: PerformanceAccessContext = Depends(require_performance_permission(FOCUS_GROUP_PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> FocusGroupOptionsOut:
    cycle = await _require_cycle(db, cycle_id)
    options = await PerformanceProjectService(db).evaluator_options(cycle)
    people = await _cycle_people(db, cycle)
    template_ids = [value for value in (cycle.template_ids or []) if isinstance(value, int)]
    communication_enabled = False
    if template_ids:
        workflows = list((await db.execute(
            select(PerformanceTemplateWorkflow).where(PerformanceTemplateWorkflow.template_id.in_(template_ids))
        )).scalars().all())
        communication_enabled = any(
            node.get("node_type") == "result_communication"
            for workflow in workflows
            for node in (workflow.nodes or [])
            if isinstance(node, dict)
        )
    if not communication_enabled:
        communication_enabled = bool(await db.scalar(
            select(func.count())
            .select_from(PerformanceProjectNodeSnapshot)
            .where(
                PerformanceProjectNodeSnapshot.cycle_ref == cycle.cycle_ref,
                PerformanceProjectNodeSnapshot.node_type == "result_communication",
            )
        ))
    return FocusGroupOptionsOut(
        fields=[
            {"key": "department", "label": "部门", "operators": ["eq", "neq"], "option_source": "organization_tree"},
            {"key": "employee", "label": "员工", "operators": ["eq", "neq"], "option_source": "people"},
            {"key": "superior", "label": "上级", "operators": ["eq", "neq"], "option_source": "people"},
            {"key": "directLeader", "label": "直属上级", "operators": ["eq", "neq"], "option_source": "people"},
            {"key": "category", "label": "序列", "operators": ["eq", "neq"], "option_source": "job_families"},
            {"key": "level", "label": "职级", "operators": ["eq", "neq"], "option_source": "position_levels"},
            {"key": "joinDate", "label": "入职时间", "operators": ["lt", "ge", "gt", "le"], "option_source": "hire_date_range"},
            {"key": "employeeType", "label": "人员类型", "operators": ["eq", "neq"], "option_source": "employee_types"},
            {"key": "dimissionTime", "label": "离职时间", "operators": ["lt", "ge", "gt", "le"], "option_source": "departure_date_range"},
            {"key": "dimissionStatus", "label": "离职状态", "operators": ["eq", "neq"], "option_source": "employment_statuses"},
        ],
        organization_tree=options["organization_tree"],
        people=[_person_option(person) for person in sorted(people, key=lambda item: (item.display_name, item.employee_no))],
        employee_types=options["employee_types"],
        employment_statuses=options["employment_statuses"],
        job_families=options["job_families"],
        position_levels=options["position_levels"],
        hire_date_range=options["hire_date_range"],
        departure_date_range=options["departure_date_range"],
        api_document_url=None,
        communication_enabled=communication_enabled,
    )


@router.post("/{cycle_id}/focus-groups/people/query", response_model=list[FocusGroupPersonOption])
async def query_focus_group_people(
    cycle_id: int,
    payload: FocusGroupPersonQuery,
    _: PerformanceAccessContext = Depends(require_performance_permission(FOCUS_GROUP_PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> list[FocusGroupPersonOption]:
    cycle = await _require_cycle(db, cycle_id)
    people = await _cycle_people(db, cycle)
    keyword = payload.keyword.strip().casefold()
    result = []
    for person in people:
        if payload.exclude_dismissed and person.employment_status == "离职":
            continue
        searchable = " ".join(
            value for value in (person.display_name, person.employee_no, person.organization_ref, person.department) if value
        ).casefold()
        if keyword and keyword not in searchable:
            continue
        result.append(_person_option(person))
    return result[:50]


@router.get("/{cycle_id}/focus-groups/priority-check", response_model=FocusGroupPriorityCheck)
async def check_focus_group_priority(
    cycle_id: int,
    _: PerformanceAccessContext = Depends(require_performance_permission(FOCUS_GROUP_PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> FocusGroupPriorityCheck:
    await _require_cycle(db, cycle_id)
    # 飞书返回 { data: true }：当前周期允许维护人员组。占用场景（被评估项目锁定）时置 false。
    return FocusGroupPriorityCheck(data=True)


async def _project_names(db: AsyncSession, ids: list[str]) -> dict[str, str]:
    if not ids:
        return {}
    int_ids = [int(value) for value in ids if str(value).isdigit()]
    if not int_ids:
        return {}
    projects = (await db.execute(select(PerformanceProject).where(PerformanceProject.id.in_(int_ids)))).scalars().all()
    return {str(project.id): project.name for project in projects}


@router.get("/{cycle_id}/focus-groups", response_model=FocusGroupPage)
async def list_focus_groups(
    cycle_id: int,
    tab: FOCUS_GROUP_TAB = "semester",
    current: Annotated[int, Field(ge=1)] = 1,
    size: Annotated[int, Field(ge=1, le=100)] = 10,
    keyword: str | None = None,
    _: PerformanceAccessContext = Depends(require_performance_permission(FOCUS_GROUP_PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> FocusGroupPage:
    cycle = await _require_cycle(db, cycle_id)
    filters = [
        PerformanceFocusGroup.cycle_ref == cycle.cycle_ref,
        PerformanceFocusGroup.tab == tab,
    ]
    if keyword:
        filters.append(PerformanceFocusGroup.name.ilike(f"%{keyword}%"))
    total = await db.scalar(select(func.count()).select_from(PerformanceFocusGroup).where(*filters)) or 0
    statement = (
        select(PerformanceFocusGroup)
        .where(*filters)
        .order_by(PerformanceFocusGroup.id.desc())
        .offset((current - 1) * size)
        .limit(size)
    )
    items = (await db.execute(statement)).scalars().all()
    payloads = []
    if tab == "project":
        names_by_id = await _project_names(db, [value for group in items for value in (group.activity_ids or [])])
        for group in items:
            payload = FocusGroupOut.model_validate(group).model_dump()
            payload["activity_names"] = [names_by_id.get(value, value) for value in (group.activity_ids or [])]
            payloads.append(payload)
    else:
        for group in items:
            payload = FocusGroupOut.model_validate(group).model_dump()
            payload["activity_names"] = []
            payloads.append(payload)
    return FocusGroupPage(total=total, items=payloads)


@router.get("/{cycle_id}/focus-groups/{group_id}", response_model=FocusGroupOut)
async def get_focus_group(
    cycle_id: int,
    group_id: int,
    _: PerformanceAccessContext = Depends(require_performance_permission(FOCUS_GROUP_PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> FocusGroupOut:
    cycle = await _require_cycle(db, cycle_id)
    group = await db.get(PerformanceFocusGroup, group_id)
    if group is None or group.cycle_ref != cycle.cycle_ref:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="人员组不存在")
    payload = FocusGroupOut.model_validate(group).model_dump()
    if group.tab == "project":
        names_by_id = await _project_names(db, group.activity_ids or [])
        payload["activity_names"] = [names_by_id.get(value, value) for value in (group.activity_ids or [])]
    else:
        payload["activity_names"] = []
    return FocusGroupOut.model_validate(payload)


@router.post("/{cycle_id}/focus-groups", response_model=FocusGroupOut, status_code=status.HTTP_201_CREATED)
async def create_focus_group(
    cycle_id: int,
    payload: FocusGroupPayload,
    context: PerformanceAccessContext = Depends(require_performance_permission(FOCUS_GROUP_PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> FocusGroupOut:
    cycle = await _require_cycle(db, cycle_id)
    employee_nos = await _resolved_employee_nos(db, cycle, payload)
    if payload.tab == "project" and _is_project_occupied(db, cycle.cycle_ref, payload.tab, payload.project_ref):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该评估项目已关联其他人员组")
    duplicate = await db.scalar(
        select(PerformanceFocusGroup).where(
            PerformanceFocusGroup.cycle_ref == cycle.cycle_ref,
            PerformanceFocusGroup.tab == payload.tab,
            PerformanceFocusGroup.name == payload.name,
        )
    )
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前周期已存在同名人员组")
    group = PerformanceFocusGroup(
        cycle_ref=cycle.cycle_ref,
        tab=payload.tab,
        name=payload.name,
        en_name=payload.en_name,
        description=payload.description,
        followee_user_ids=payload.followee_user_ids,
        view_permission=payload.view_permission,
        scope_setting_mode=payload.scope_setting_mode,
        scope=payload.scope,
        show_group_tag=payload.show_group_tag,
        tag_color=payload.tag_color,
        text_color=payload.text_color,
        bg_color=payload.bg_color,
        is_communicate_time=payload.is_communicate_time,
        start_time=payload.start_time,
        end_time=payload.end_time,
        employee_nos=employee_nos,
        scope_mode=payload.scope_mode,
        project_ref=payload.project_ref,
        activity_ids=payload.activity_ids,
        roles_of_managing_scope=payload.roles_of_managing_scope,
        created_by_type=context.subject_type,
        created_by_ref=str(context.subject_id),
        updated_by_type=context.subject_type,
        updated_by_ref=str(context.subject_id),
    )
    db.add(group)
    await db.flush()
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PERFORMANCE_FOCUS_GROUP_CREATED",
        cycle_ref=cycle.cycle_ref,
        actor_type=context.subject_type,
        actor_ref=str(context.subject_id),
        subject_type="PERFORMANCE_FOCUS_GROUP",
        subject_ref=str(group.id),
        after_state={"tab": payload.tab, "name": payload.name, "activity_ids": payload.activity_ids, "employee_nos": employee_nos},
    ))
    await db.commit()
    await db.refresh(group)
    return FocusGroupOut.model_validate(group)


@router.patch("/{cycle_id}/focus-groups/{group_id}", response_model=FocusGroupOut)
async def update_focus_group(
    cycle_id: int,
    group_id: int,
    payload: FocusGroupPayload,
    context: PerformanceAccessContext = Depends(require_performance_permission(FOCUS_GROUP_PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> FocusGroupOut:
    cycle = await _require_cycle(db, cycle_id)
    group = await db.get(PerformanceFocusGroup, group_id)
    if group is None or group.cycle_ref != cycle.cycle_ref:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="人员组不存在")
    if "scope_setting_mode" not in payload.model_fields_set:
        payload.scope_setting_mode = group.scope_setting_mode
    if payload.scope_setting_mode != group.scope_setting_mode or (
        "scope_mode" in payload.model_fields_set and payload.scope_mode != group.scope_mode
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="人员组创建后不可修改人员范围设置方式")
    employee_nos = await _resolved_employee_nos(db, cycle, payload)
    duplicate = await db.scalar(
        select(PerformanceFocusGroup).where(
            PerformanceFocusGroup.cycle_ref == cycle.cycle_ref,
            PerformanceFocusGroup.tab == payload.tab,
            PerformanceFocusGroup.name == payload.name,
            PerformanceFocusGroup.id != group_id,
        )
    )
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前周期已存在同名人员组")
    before = {"tab": group.tab, "name": group.name, "activity_ids": list(group.activity_ids or []), "employee_nos": list(group.employee_nos or [])}
    group.tab = payload.tab
    group.name = payload.name
    group.en_name = payload.en_name
    group.description = payload.description
    group.followee_user_ids = payload.followee_user_ids
    group.view_permission = payload.view_permission
    group.scope_setting_mode = payload.scope_setting_mode
    group.scope = payload.scope
    group.show_group_tag = payload.show_group_tag
    for field in ("tag_color", "text_color", "bg_color"):
        if field in payload.model_fields_set:
            setattr(group, field, getattr(payload, field))
    group.is_communicate_time = payload.is_communicate_time
    group.start_time = payload.start_time
    group.end_time = payload.end_time
    group.employee_nos = employee_nos
    group.project_ref = payload.project_ref
    group.activity_ids = payload.activity_ids
    group.roles_of_managing_scope = payload.roles_of_managing_scope
    group.updated_by_type = context.subject_type
    group.updated_by_ref = str(context.subject_id)
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PERFORMANCE_FOCUS_GROUP_UPDATED",
        cycle_ref=cycle.cycle_ref,
        actor_type=context.subject_type,
        actor_ref=str(context.subject_id),
        subject_type="PERFORMANCE_FOCUS_GROUP",
        subject_ref=str(group.id),
        before_state=before,
        after_state={"tab": group.tab, "name": group.name, "activity_ids": group.activity_ids, "employee_nos": group.employee_nos},
    ))
    await db.commit()
    await db.refresh(group)
    return FocusGroupOut.model_validate(group)


@router.delete("/{cycle_id}/focus-groups/{group_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def delete_focus_group(
    cycle_id: int,
    group_id: int,
    context: PerformanceAccessContext = Depends(require_performance_permission(FOCUS_GROUP_PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> None:
    cycle = await _require_cycle(db, cycle_id)
    group = await db.get(PerformanceFocusGroup, group_id)
    if group is None or group.cycle_ref != cycle.cycle_ref:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="人员组不存在")
    await db.delete(group)
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PERFORMANCE_FOCUS_GROUP_DELETED",
        cycle_ref=cycle.cycle_ref,
        actor_type=context.subject_type,
        actor_ref=str(context.subject_id),
        subject_type="PERFORMANCE_FOCUS_GROUP",
        subject_ref=str(group.id),
    ))
    await db.commit()
