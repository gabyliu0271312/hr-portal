"""Performance field settings API."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, StrictStr, model_validator
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
    require_performance_permission,
    resolve_trusted_performance_actor,
)
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.models import PerformanceManagerStandardSetting

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
