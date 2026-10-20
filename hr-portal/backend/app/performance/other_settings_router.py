"""Performance other settings API."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, StrictBool, model_validator
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import (
    PerformanceAccessContext,
    require_performance_permission,
    resolve_trusted_performance_actor,
)
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.models import PerformanceOtherSetting

router = APIRouter(prefix="/performance/system-settings/other", tags=["performance-other-settings"])


class OtherSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    calibration_authorization_outside_direct_reports_enabled: bool = True
    calibration_import_enabled: bool = True
    performance_coefficient_enabled: bool = False
    reviewer_360_tags_enabled: bool = True
    manual_result_opening_enabled: bool = True
    overdue_single_submission_enabled: bool = True
    overdue_voluntary_360_submission_enabled: bool = False
    cycle_overdue_submission_override_enabled: bool = False


class OtherSettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    calibration_authorization_outside_direct_reports_enabled: StrictBool | None = None
    calibration_import_enabled: StrictBool | None = None
    performance_coefficient_enabled: StrictBool | None = None
    reviewer_360_tags_enabled: StrictBool | None = None
    manual_result_opening_enabled: StrictBool | None = None
    overdue_single_submission_enabled: StrictBool | None = None
    overdue_voluntary_360_submission_enabled: StrictBool | None = None
    cycle_overdue_submission_override_enabled: StrictBool | None = None

    @model_validator(mode="after")
    def validate_patch(self) -> "OtherSettingsPatch":
        if not self.model_fields_set:
            raise ValueError("至少提供一个设置项")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("其他设置字段不能为 null")
        return self


async def _context(
    context: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
) -> PerformanceAccessContext:
    return context


@router.get("", response_model=OtherSettingsOut)
async def get_other_settings(
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> OtherSettingsOut:
    setting = await db.get(PerformanceOtherSetting, 1)
    return OtherSettingsOut() if setting is None else OtherSettingsOut.model_validate(setting)


@router.patch("", response_model=OtherSettingsOut)
async def update_other_settings(
    payload: OtherSettingsPatch,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> OtherSettingsOut:
    actor = await resolve_trusted_performance_actor(db, context)
    await db.execute(
        insert(PerformanceOtherSetting)
        .values(id=1, **OtherSettingsOut().model_dump(), updated_by_type=actor.actor_type, updated_by_ref=actor.actor_ref)
        .on_conflict_do_nothing(index_elements=["id"])
    )
    setting = (
        await db.execute(select(PerformanceOtherSetting).where(PerformanceOtherSetting.id == 1).with_for_update())
    ).scalar_one()
    before = OtherSettingsOut.model_validate(setting).model_dump()
    for field in payload.model_fields_set:
        setattr(setting, field, getattr(payload, field))
    after = OtherSettingsOut.model_validate(setting).model_dump()
    if before != after:
        setting.updated_by_type = actor.actor_type
        setting.updated_by_ref = actor.actor_ref
        PerformanceAuditService(db).append_event(
            AuditEventInput(
                event_type="PERFORMANCE_OTHER_SETTING_UPDATED",
                actor_type=actor.actor_type,
                actor_ref=actor.actor_ref,
                subject_type="OTHER_SETTINGS",
                subject_ref="1",
                before_state=before,
                after_state=after,
            )
        )
    await db.commit()
    await db.refresh(setting)
    return OtherSettingsOut.model_validate(setting)
