"""Performance field settings API."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, StrictBool, StrictStr, model_validator
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.data.employee_roster_contract import (
    EmployeeRosterContractError,
    employee_roster_table,
    normalize_roster_text,
    require_employee_roster_columns,
)
from app.performance.auth_context import (
    PerformanceAccessContext,
    get_performance_access_context,
    require_performance_permission,
    resolve_trusted_performance_actor,
)
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.models import (
    PerformanceDetailFieldSetting,
    PerformanceFilterConditionSetting,
    PerformanceManagerStandardSetting,
)

router = APIRouter(prefix="/performance/system-settings/fields", tags=["performance-field-settings"])


class ManagerStandardPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    manager_standard: Literal["inservice_direct_underling", "specific_employee_type_underling"]
    specific_employee_types: list[StrictStr]

    @model_validator(mode="after")
    def normalize_types(self) -> "ManagerStandardPayload":
        if self.manager_standard == "inservice_direct_underling":
            self.specific_employee_types = []
        else:
            self.specific_employee_types = list(dict.fromkeys(self.specific_employee_types))
            if not self.specific_employee_types:
                raise ValueError("标准二至少选择一种人员类型")
        return self


def _defaults() -> ManagerStandardPayload:
    return ManagerStandardPayload(manager_standard="inservice_direct_underling", specific_employee_types=[])


class EmployeeTypeOption(BaseModel):
    value: str
    label: str


FILTER_CONDITION_CATALOG: tuple[tuple[str, str, bool], ...] = (
    ("directLeader", "直属上级", False),
    ("dottedLeaders", "虚线上级", False),
    ("leaders", "上级", False),
    ("pdtManagerKey", "项目上级", False),
    ("hrbp", "HRBP", False),
    ("departments", "部门", False),
    ("directDepartment", "直属部门", False),
    ("pdtProjectKey", "参与的业务项目", False),
    ("pdtCoProjectKey", "合作的业务项目", False),
    ("level", "职级", False),
    ("allCategories", "序列（筛选结果含子序列）", False),
    ("directCategory", "序列（筛选结果不含子序列）", False),
    ("jobTitle", "职务", False),
    ("pdtRoleKey", "项目角色", False),
    ("isManager", "是否管理者", False),
    ("userId", "人员", False),
    ("followGroup", "人员组", False),
    ("followedUser", "我标记为关注的人", False),
    ("joinDate", "入职日期", False),
    ("realTimeDimissionStatus", "当前雇佣状态", False),
    ("employeeType", "人员类型", False),
    ("finalReviewScoreFilterKey", "当前周期绩效结果", True),
    ("currentSemesterAssessmentItemComparisonFilterKey", "当前周期评估项间对比", True),
    ("inviteReviewScoreFilterKey", "当前周期 360° 评估结果", True),
    ("inviteReviewRelation", "360° 评估关系", False),
    ("inviteReviewerTagUnderLimitGroup", "360° 标签标记人数低于建议人数", False),
    ("otherStageScoreFilterKey", "当前周期其他环节评估结果", True),
    ("historySemesterFinalScore", "历史周期绩效结果", True),
    ("stageReviewDataChangedGroup", "校准环节是否有结果变更", False),
    ("activity", "所属项目", False),
    ("stageStatusFilterKey", "环节状态", True),
    ("finalReviewModifiedAt", "绩效结果最近变更时间", False),
)
FILTER_CONDITION_BY_KEY = {key: (label, disabled) for key, label, disabled in FILTER_CONDITION_CATALOG}
DEFAULT_FILTER_KEYS = frozenset({
    "directLeader", "leaders", "departments", "directDepartment", "level", "allCategories", "userId",
})


class FilterConditionItem(BaseModel):
    filter_key: str
    label: str
    default: bool
    disable_set_default: bool


class FilterConditionsPayload(BaseModel):
    filter_conditions: list[FilterConditionItem]


DETAIL_FIELD_CATALOG: tuple[tuple[str, str, str, bool], ...] = (
    ("department", "部门", "部门", True),
    ("level", "职级", "职级", False),
    ("category", "序列", "序列", False),
    ("directLeader", "直属上级", "直属上级", False),
    ("dottedLeaders", "虚线上级", "虚线上级", False),
    ("joinDate", "入职日期", "2021-01-01入职日期", False),
    ("jobTitle", "职务", "职务", False),
    ("employeeType", "人员类型", "人员类型", False),
)
DETAIL_FIELD_BY_ID = {field_id: (name, preview_name, disabled) for field_id, name, preview_name, disabled in DETAIL_FIELD_CATALOG}
DEFAULT_DETAIL_FIELD_IDS = ("department", "level", "category", "directLeader", "joinDate")


class DetailFieldOption(BaseModel):
    id: str
    name: str
    preview_name: str
    disabled: bool


class DetailFieldOptionsPayload(BaseModel):
    options: list[DetailFieldOption]


class DetailFieldsPayload(BaseModel):
    field: list[str]


class DetailFieldsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: list[StrictStr]

    @model_validator(mode="after")
    def normalize_catalog(self) -> "DetailFieldsInput":
        selected = set(self.field)
        unknown = selected - set(DETAIL_FIELD_BY_ID)
        if unknown:
            raise ValueError("未知展示字段: " + ", ".join(sorted(unknown)))
        selected.add("department")
        self.field = [field_id for field_id, _, _, _ in DETAIL_FIELD_CATALOG if field_id in selected]
        return self


def _detail_options() -> DetailFieldOptionsPayload:
    return DetailFieldOptionsPayload(options=[
        DetailFieldOption(id=field_id, name=name, preview_name=preview_name, disabled=disabled)
        for field_id, name, preview_name, disabled in DETAIL_FIELD_CATALOG
    ])


def _detail_payload(ids: list) -> DetailFieldsPayload:
    selected = {value for value in ids or [] if isinstance(value, str) and value in DETAIL_FIELD_BY_ID}
    selected.add("department")
    return DetailFieldsPayload(field=[field_id for field_id, _, _, _ in DETAIL_FIELD_CATALOG if field_id in selected])


class FilterConditionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filter_key: StrictStr
    default: StrictBool


class FilterConditionsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filter_conditions: list[FilterConditionUpdate]

    @model_validator(mode="after")
    def validate_catalog(self) -> "FilterConditionsInput":
        keys = [item.filter_key for item in self.filter_conditions]
        if len(keys) != len(set(keys)):
            raise ValueError("筛选条件重复")
        if set(keys) != set(FILTER_CONDITION_BY_KEY):
            raise ValueError("筛选条件目录不完整或包含未知项")
        for item in self.filter_conditions:
            if item.default and FILTER_CONDITION_BY_KEY[item.filter_key][1]:
                raise ValueError(f"{item.filter_key} 不允许设为默认条件")
        return self


def _default_filter_state() -> list[dict]:
    return [{"filter_key": key, "default": key in DEFAULT_FILTER_KEYS} for key, _, _ in FILTER_CONDITION_CATALOG]


def _filter_payload(state: list) -> FilterConditionsPayload:
    seen: set[str] = set()
    items: list[FilterConditionItem] = []
    for entry in state or []:
        if not isinstance(entry, dict):
            continue
        key = entry.get("filter_key")
        if not isinstance(key, str) or key not in FILTER_CONDITION_BY_KEY or key in seen:
            continue
        seen.add(key)
        label, disabled = FILTER_CONDITION_BY_KEY[key]
        items.append(FilterConditionItem(
            filter_key=key, label=label,
            default=bool(entry.get("default")) and not disabled,
            disable_set_default=disabled,
        ))
    for key, label, disabled in FILTER_CONDITION_CATALOG:
        if key not in seen:
            items.append(FilterConditionItem(filter_key=key, label=label, default=False, disable_set_default=disabled))
    return FilterConditionsPayload(filter_conditions=items)


async def _context(
    context: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
) -> PerformanceAccessContext:
    return context


async def _employee_types(db: AsyncSession) -> list[str]:
    try:
        table = employee_roster_table()
        column = require_employee_roster_columns(table, ("employee_type",))["employee_type"]
    except EmployeeRosterContractError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    values = (await db.execute(select(column).distinct())).scalars().all()
    return sorted({value for raw in values if (value := normalize_roster_text(raw))})


@router.get("/employee-types", response_model=list[EmployeeTypeOption])
async def get_employee_types(
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> list[EmployeeTypeOption]:
    return [EmployeeTypeOption(value=value, label=value) for value in await _employee_types(db)]


@router.get("/manager-standard", response_model=ManagerStandardPayload)
async def get_manager_standard(
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> ManagerStandardPayload:
    setting = await db.get(PerformanceManagerStandardSetting, 1)
    return _defaults() if setting is None else ManagerStandardPayload.model_validate(setting)


@router.put("/manager-standard", response_model=ManagerStandardPayload)
async def update_manager_standard(
    payload: ManagerStandardPayload,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> ManagerStandardPayload:
    actor = await resolve_trusted_performance_actor(db, context)
    if payload.manager_standard == "specific_employee_type_underling":
        unknown = set(payload.specific_employee_types) - set(await _employee_types(db))
        if unknown:
            raise HTTPException(status_code=422, detail="未知人员类型: " + ", ".join(sorted(unknown)))
    await db.execute(
        insert(PerformanceManagerStandardSetting)
        .values(id=1, **_defaults().model_dump(), updated_by_type=actor.actor_type, updated_by_ref=actor.actor_ref)
        .on_conflict_do_nothing(index_elements=["id"])
    )
    setting = (await db.execute(
        select(PerformanceManagerStandardSetting)
        .where(PerformanceManagerStandardSetting.id == 1).with_for_update()
    )).scalar_one()
    before = ManagerStandardPayload.model_validate(setting).model_dump()
    after = payload.model_dump()
    if before != after:
        setting.manager_standard = payload.manager_standard
        setting.specific_employee_types = payload.specific_employee_types
        setting.updated_by_type = actor.actor_type
        setting.updated_by_ref = actor.actor_ref
        PerformanceAuditService(db).append_event(AuditEventInput(
            event_type="PERFORMANCE_MANAGER_STANDARD_UPDATED",
            actor_type=actor.actor_type, actor_ref=actor.actor_ref,
            subject_type="MANAGER_STANDARD_SETTINGS", subject_ref="1",
            before_state=before, after_state=after,
        ))
    await db.commit()
    await db.refresh(setting)
    return ManagerStandardPayload.model_validate(setting)


@router.get("/filter-conditions", response_model=FilterConditionsPayload)
async def get_filter_conditions(
    _: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
) -> FilterConditionsPayload:
    setting = await db.get(PerformanceFilterConditionSetting, 1)
    return _filter_payload(_default_filter_state() if setting is None else setting.filter_conditions)


@router.put("/filter-conditions", response_model=FilterConditionsPayload)
async def update_filter_conditions(
    payload: FilterConditionsInput,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> FilterConditionsPayload:
    actor = await resolve_trusted_performance_actor(db, context)
    state = [{"filter_key": item.filter_key, "default": item.default} for item in payload.filter_conditions]
    await db.execute(
        insert(PerformanceFilterConditionSetting)
        .values(id=1, filter_conditions=_default_filter_state(), updated_by_type=actor.actor_type, updated_by_ref=actor.actor_ref)
        .on_conflict_do_nothing(index_elements=["id"])
    )
    setting = (await db.execute(
        select(PerformanceFilterConditionSetting)
        .where(PerformanceFilterConditionSetting.id == 1).with_for_update()
    )).scalar_one()
    before = _filter_payload(setting.filter_conditions).model_dump()
    after = _filter_payload(state).model_dump()
    if before != after:
        setting.filter_conditions = state
        setting.updated_by_type = actor.actor_type
        setting.updated_by_ref = actor.actor_ref
        PerformanceAuditService(db).append_event(AuditEventInput(
            event_type="PERFORMANCE_FILTER_CONDITIONS_UPDATED",
            actor_type=actor.actor_type, actor_ref=actor.actor_ref,
            subject_type="FILTER_CONDITION_SETTINGS", subject_ref="1",
            before_state=before, after_state=after,
        ))
    await db.commit()
    await db.refresh(setting)
    return _filter_payload(setting.filter_conditions)


@router.get("/detail-field-options", response_model=DetailFieldOptionsPayload)
async def get_detail_field_options(
    _: PerformanceAccessContext = Depends(_context),
) -> DetailFieldOptionsPayload:
    return _detail_options()


@router.get("/detail-visible-fields", response_model=DetailFieldsPayload)
async def get_detail_visible_fields(
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> DetailFieldsPayload:
    setting = await db.get(PerformanceDetailFieldSetting, 1)
    return _detail_payload(list(DEFAULT_DETAIL_FIELD_IDS) if setting is None else setting.field)


@router.put("/detail-visible-fields", response_model=DetailFieldsPayload)
async def update_detail_visible_fields(
    payload: DetailFieldsInput,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> DetailFieldsPayload:
    actor = await resolve_trusted_performance_actor(db, context)
    await db.execute(
        insert(PerformanceDetailFieldSetting)
        .values(id=1, field=list(DEFAULT_DETAIL_FIELD_IDS), updated_by_type=actor.actor_type, updated_by_ref=actor.actor_ref)
        .on_conflict_do_nothing(index_elements=["id"])
    )
    setting = (await db.execute(
        select(PerformanceDetailFieldSetting)
        .where(PerformanceDetailFieldSetting.id == 1).with_for_update()
    )).scalar_one()
    before = _detail_payload(setting.field).model_dump()
    after = _detail_payload(payload.field).model_dump()
    if before != after:
        setting.field = payload.field
        setting.updated_by_type = actor.actor_type
        setting.updated_by_ref = actor.actor_ref
        PerformanceAuditService(db).append_event(AuditEventInput(
            event_type="PERFORMANCE_DETAIL_VISIBLE_FIELDS_UPDATED",
            actor_type=actor.actor_type, actor_ref=actor.actor_ref,
            subject_type="DETAIL_FIELD_SETTINGS", subject_ref="1",
            before_state=before, after_state=after,
        ))
    await db.commit()
    await db.refresh(setting)
    return _detail_payload(setting.field)
