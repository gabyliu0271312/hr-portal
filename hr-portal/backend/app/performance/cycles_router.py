"""Performance cycle configuration API."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import PerformanceAccessContext, get_performance_access_context, require_performance_permission
from app.performance.cycle_service import (
    CycleValidationError,
    PerformanceCycleService,
    normalize_cycle_datetime,
)
from app.performance.models import (
    CYCLE_LEAVER_MODE_CREATE_TASK,
    CYCLE_LEAVER_MODE_REPORT_ONLY,
    CYCLE_LOCK_RULE_IMMEDIATE,
    CYCLE_LOCK_RULE_SCHEDULED,
    CYCLE_PRE_LOCK_SYNC_AUTO_DAILY,
    CYCLE_PRE_LOCK_SYNC_MANUAL,
    PerformanceCycle,
    PerformanceProject,
)

router = APIRouter(prefix="/performance/cycles", tags=["performance-cycles"])


CyclePeriodType = Literal["YEAR", "HALF_YEAR", "QUARTER", "BIMONTH", "MONTH", "CUSTOM", "ANNUAL"]


class CyclePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=1, max_length=128)
    language: Literal["zh-CN"] = "zh-CN"
    period_year: int = Field(..., ge=1900, le=2200)
    period_type: CyclePeriodType = Field(...)
    period_subtype: str | None = Field(default=None, max_length=16)

    @model_validator(mode="before")
    @classmethod
    def normalize_period_type(cls, values):
        if isinstance(values, dict) and values.get("period_type") == "ANNUAL":
            values = dict(values)
            values["period_type"] = "YEAR"
        return values
    start_at: datetime
    end_at: datetime
    lock_rule: Literal["IMMEDIATE", "SCHEDULED"]
    lock_at: datetime | None = None
    pre_lock_sync_mode: Literal["MANUAL", "AUTO_DAILY"] = "MANUAL"
    leaver_enabled: bool = False
    leaver_start_date: date | None = None
    leaver_end_date: date | None = None
    leaver_participation_mode: Literal["CREATE_TASK", "REPORT_ONLY"] = "CREATE_TASK"

    @model_validator(mode="after")
    def validate_dates(self):
        start_at = normalize_cycle_datetime(self.start_at)
        end_at = normalize_cycle_datetime(self.end_at)
        if end_at <= start_at:
            raise ValueError("\u622a\u6b62\u65f6\u95f4\u5fc5\u987b\u665a\u4e8e\u5f00\u59cb\u65f6\u95f4")
        if self.lock_rule == CYCLE_LOCK_RULE_SCHEDULED and self.lock_at is None:
            raise ValueError("\u5b9a\u65f6\u9501\u5b9a\u5fc5\u987b\u8bbe\u7f6e\u9501\u5b9a\u65f6\u95f4")
        if self.leaver_enabled and (self.leaver_start_date is None or self.leaver_end_date is None):
            raise ValueError("\u5f00\u542f\u79bb\u804c\u4eba\u5458\u53c2\u8bc4\u540e\u5fc5\u987b\u8bbe\u7f6e\u65e5\u671f\u8303\u56f4")
        if self.leaver_start_date and self.leaver_end_date and self.leaver_end_date < self.leaver_start_date:
            raise ValueError("\u79bb\u804c\u4eba\u5458\u53c2\u8bc4\u65e5\u671f\u8303\u56f4\u4e0d\u5408\u6cd5")
        return self


class CyclePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=128)
    language: Literal["zh-CN"] | None = None
    period_year: int | None = Field(default=None, ge=1900, le=2200)
    period_type: CyclePeriodType | None = None
    period_subtype: str | None = Field(default=None, max_length=16)
    start_at: datetime | None = None
    end_at: datetime | None = None
    leaver_enabled: bool | None = None
    leaver_start_date: date | None = None
    leaver_end_date: date | None = None
    leaver_participation_mode: Literal["CREATE_TASK", "REPORT_ONLY"] | None = None


class CyclePerson(BaseModel):
    employee_no: str
    display_name: str
    organization_ref: str | None
    direct_manager_employee_no: str | None
    hrbp_employee_no: str | None
    employment_status: str | None
    departure_date: date | None
    is_manually_maintained: bool


class CycleSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    cycle_ref: str
    name: str
    language: str
    period_year: int
    period_type: str
    period_subtype: str | None
    start_at: datetime
    end_at: datetime
    lock_rule: str
    lock_at: datetime | None
    pre_lock_sync_mode: str
    leaver_enabled: bool
    leaver_start_date: date | None
    leaver_end_date: date | None
    leaver_participation_mode: str
    status: str
    people_count: int
    department_count: int
    project_count: int = 0
    projects: list[dict[str, Any]] = []


class CyclePage(BaseModel):
    items: list[CycleSummary]
    total: int
    page: int
    page_size: int


class PeopleRefreshIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(..., min_length=1, max_length=500)


class ManualPersonUpdate(BaseModel):
    employee_no: str = Field(..., min_length=1, max_length=64)
    display_name: str | None = Field(default=None, min_length=1, max_length=128)
    organization_ref: str | None = Field(default=None, max_length=128)
    direct_manager_employee_no: str | None = Field(default=None, max_length=64)
    hrbp_employee_no: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def validate_display_name(self):
        if "display_name" in self.model_fields_set:
            if self.display_name is None or not self.display_name.strip():
                raise ValueError("姓名不能为空")
            self.display_name = self.display_name.strip()
        return self


class ManualPeopleUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(..., min_length=1, max_length=500)
    people: list[ManualPersonUpdate] = Field(..., min_length=1, max_length=500)

def _project_scope_refs(context: PerformanceAccessContext) -> set[str]:
    return {
        grant.scope_ref
        for grant in context.role_grants
        if grant.scope_type == "PROJECT" and grant.scope_ref
    }


async def _assert_cycle_view_permission(context: PerformanceAccessContext, service: PerformanceCycleService, cycle: PerformanceCycle) -> None:
    if "performance.cycles.manage" in context.permission_codes:
        return
    if "performance.projects.manage" not in context.permission_codes:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="\u65e0\u6743\u67e5\u770b\u5f53\u524d\u5468\u671f")
    project_refs = _project_scope_refs(context)
    if not project_refs or not any(project["project_ref"] in project_refs for project in await service.projects_for_cycle(cycle)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="\u5f53\u524d\u9879\u76ee\u7ba1\u7406\u5458\u8303\u56f4\u4e0d\u5339\u914d")


async def _assert_people_permission(context: PerformanceAccessContext) -> None:
    if "performance.cycles.manage" not in context.permission_codes:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="\u65e0\u6743\u7ef4\u62a4\u5f53\u524d\u5468\u671f\u4eba\u5458\u548c\u90e8\u95e8\u4fe1\u606f")


def _summary(cycle: PerformanceCycle, people_count: int, department_count: int, projects: list[dict[str, Any]]) -> CycleSummary:
    return CycleSummary(
        **PerformanceCycleService.serialize(cycle),
        people_count=people_count,
        department_count=department_count,
        project_count=len(projects),
        projects=projects,
    )


def _summary_for_context(
    cycle: PerformanceCycle,
    people_count: int,
    department_count: int,
    projects: list[dict[str, Any]],
    context: PerformanceAccessContext,
) -> CycleSummary:
    if "performance.cycles.manage" not in context.permission_codes:
        people_count, department_count = 0, 0
    return _summary(cycle, people_count, department_count, projects)


@router.get("", response_model=CyclePage)
async def list_cycles(
    keyword: str | None = Query(default=None, max_length=128),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    service = PerformanceCycleService(db)
    if "performance.cycles.manage" in context.permission_codes:
        cycles, total = await service.list_cycles(keyword, page=page, page_size=page_size)
    elif "performance.projects.manage" in context.permission_codes:
        cycles, total = await service.list_cycles(keyword, project_refs=_project_scope_refs(context), page=page, page_size=page_size)
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="\u65e0\u6743\u67e5\u770b\u5468\u671f\u5217\u8868")
    visible_refs = (
        None
        if "performance.cycles.manage" in context.permission_codes
        else _project_scope_refs(context)
    )
    summaries = await service.list_summaries(cycles, project_refs=visible_refs)
    result = [
        _summary_for_context(cycle, *summaries[cycle.cycle_ref], context)
        for cycle in cycles
    ]
    return CyclePage(items=result, total=total, page=page, page_size=page_size)


@router.post("", response_model=CycleSummary, status_code=status.HTTP_201_CREATED)
async def create_cycle(
    payload: CyclePayload,
    context: PerformanceAccessContext = Depends(require_performance_permission("performance.cycles.manage")),
    db: AsyncSession = Depends(get_session),
):
    try:
        cycle = await PerformanceCycleService(db).create_cycle(payload.model_dump(), actor_type=context.subject_type, actor_id=context.subject_id)
    except CycleValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    service = PerformanceCycleService(db)
    people, departments = await service.snapshot_counts(cycle)
    visible_refs = None if "performance.cycles.manage" in context.permission_codes else _project_scope_refs(context)
    projects = await service.projects_for_cycle(cycle, project_refs=visible_refs)
    return _summary_for_context(cycle, people, departments, projects, context)


@router.get("/{cycle_id}", response_model=CycleSummary)
async def get_cycle(
    cycle_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    service = PerformanceCycleService(db)
    cycle = await service.get_cycle(cycle_id)
    await _assert_cycle_view_permission(context, service, cycle)
    is_cycle_manager = "performance.cycles.manage" in context.permission_codes
    people, departments = await service.snapshot_counts(cycle)
    visible_refs = None if is_cycle_manager else _project_scope_refs(context)
    projects = await service.projects_for_cycle(cycle, project_refs=visible_refs)
    if not is_cycle_manager:
        people, departments = 0, 0
    return _summary(cycle, people, departments, projects)


@router.get("/{cycle_id}/people", response_model=list[CyclePerson])
async def get_cycle_people(
    cycle_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    service = PerformanceCycleService(db)
    cycle = await service.get_cycle(cycle_id)
    await _assert_people_permission(context)
    return await service.people_for_cycle(cycle)


@router.patch("/{cycle_id}", response_model=CycleSummary)
async def update_cycle(
    cycle_id: int,
    payload: CyclePatch,
    context: PerformanceAccessContext = Depends(require_performance_permission("performance.cycles.manage")),
    db: AsyncSession = Depends(get_session),
):
    service = PerformanceCycleService(db)
    cycle = await service.get_cycle(cycle_id)
    try:
        cycle = await service.update_cycle(cycle, payload.model_dump(exclude_unset=True), actor_type=context.subject_type, actor_id=context.subject_id)
    except CycleValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    people, departments = await service.snapshot_counts(cycle)
    visible_refs = None if "performance.cycles.manage" in context.permission_codes else _project_scope_refs(context)
    projects = await service.projects_for_cycle(cycle, project_refs=visible_refs)
    return _summary_for_context(cycle, people, departments, projects, context)


@router.patch("/{cycle_id}/people", response_model=CycleSummary)
async def refresh_cycle_people(
    cycle_id: int,
    payload: PeopleRefreshIn,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    service = PerformanceCycleService(db)
    cycle = await service.get_cycle(cycle_id)
    await _assert_people_permission(context)
    try:
        cycle = await service.refresh_people(cycle, actor_type=context.subject_type, actor_id=context.subject_id, reason=payload.reason)
    except CycleValidationError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    people, departments = await service.snapshot_counts(cycle)
    visible_refs = None if "performance.cycles.manage" in context.permission_codes else _project_scope_refs(context)
    projects = await service.projects_for_cycle(cycle, project_refs=visible_refs)
    return _summary_for_context(cycle, people, departments, projects, context)


@router.patch("/{cycle_id}/people/manual", response_model=CycleSummary)
async def update_cycle_people_manually(
    cycle_id: int,
    payload: ManualPeopleUpdateIn,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
):
    service = PerformanceCycleService(db)
    cycle = await service.get_cycle(cycle_id)
    await _assert_people_permission(context)
    try:
        cycle = await service.update_people_manually(cycle, [item.model_dump(exclude_unset=True) for item in payload.people], actor_type=context.subject_type, actor_id=context.subject_id, reason=payload.reason)
    except CycleValidationError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    people, departments = await service.snapshot_counts(cycle)
    visible_refs = None if "performance.cycles.manage" in context.permission_codes else _project_scope_refs(context)
    projects = await service.projects_for_cycle(cycle, project_refs=visible_refs)
    return _summary_for_context(cycle, people, departments, projects, context)

@router.delete("/{cycle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cycle(
    cycle_id: int,
    context: PerformanceAccessContext = Depends(require_performance_permission("performance.cycles.manage")),
    db: AsyncSession = Depends(get_session),
):
    cycle = await PerformanceCycleService(db).get_cycle(cycle_id)
    try:
        await PerformanceCycleService(db).delete_cycle(cycle, actor_type=context.subject_type, actor_id=context.subject_id)
    except CycleValidationError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc




