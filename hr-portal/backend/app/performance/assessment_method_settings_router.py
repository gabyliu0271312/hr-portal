"""Performance assessment method settings API."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
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
from app.performance.models import PerformanceAssessmentMethodSetting

router = APIRouter(
    prefix="/performance/system-settings/assessment-method",
    tags=["performance-assessment-method-settings"],
)


class AssessmentMethodSettingsOut(BaseModel):
    metric_assessment_enabled: bool


class AssessmentMethodSettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    metric_assessment_enabled: bool


async def _context(
    context: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
) -> PerformanceAccessContext:
    return context


def _defaults() -> AssessmentMethodSettingsOut:
    return AssessmentMethodSettingsOut(metric_assessment_enabled=False)


def _response(setting: PerformanceAssessmentMethodSetting) -> AssessmentMethodSettingsOut:
    return AssessmentMethodSettingsOut(
        metric_assessment_enabled=setting.metric_assessment_enabled,
    )


@router.get("", response_model=AssessmentMethodSettingsOut)
async def get_assessment_method_settings(
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> AssessmentMethodSettingsOut:
    setting = await db.get(PerformanceAssessmentMethodSetting, 1)
    if setting is None:
        return _defaults()
    return _response(setting)


@router.patch("", response_model=AssessmentMethodSettingsOut)
async def update_assessment_method_settings(
    payload: AssessmentMethodSettingsPatch,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> AssessmentMethodSettingsOut:
    actor = await resolve_trusted_performance_actor(db, context)
    await db.execute(
        insert(PerformanceAssessmentMethodSetting)
        .values(
            id=1,
            **_defaults().model_dump(),
            updated_by_type=actor.actor_type,
            updated_by_ref=actor.actor_ref,
        )
        .on_conflict_do_nothing(index_elements=["id"])
    )
    setting = (
        await db.execute(
            select(PerformanceAssessmentMethodSetting)
            .where(PerformanceAssessmentMethodSetting.id == 1)
            .with_for_update()
        )
    ).scalar_one()
    before = _response(setting).model_dump()
    setting.metric_assessment_enabled = payload.metric_assessment_enabled
    setting.updated_by_type = actor.actor_type
    setting.updated_by_ref = actor.actor_ref
    after = _response(setting).model_dump()
    if before != after:
        PerformanceAuditService(db).append_event(
            AuditEventInput(
                event_type="PERFORMANCE_ASSESSMENT_METHOD_SETTING_UPDATED",
                actor_type=actor.actor_type,
                actor_ref=actor.actor_ref,
                subject_type="ASSESSMENT_METHOD_SETTINGS",
                subject_ref="1",
                before_state=before,
                after_state=after,
            )
        )
    await db.commit()
    await db.refresh(setting)
    return _response(setting)
