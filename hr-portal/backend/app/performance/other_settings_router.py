"""Performance other settings API."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr, field_validator, model_validator
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
    authorization_prompt_zh: str = "请确保授权对象有所选环节的操作资格，避免错误授权泄露敏感数据。"
    authorization_prompt_en: str = "To prevent sensitive data exposure, please ensure that the authorized individuals has permission for the selected steps."
    transfer_prompt_zh: str = "请确保转交对象有所选环节的操作资格，避免错误授权泄露敏感数据。"
    transfer_prompt_en: str = "To prevent sensitive data exposure, please ensure that the transferee has permission for the selected steps."


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
    authorization_prompt_zh: str | None = Field(default=None, strict=True, max_length=1000)
    authorization_prompt_en: str | None = Field(default=None, strict=True, max_length=1000)

    transfer_prompt_zh: str | None = Field(default=None, strict=True, max_length=1000)
    transfer_prompt_en: str | None = Field(default=None, strict=True, max_length=1000)

    @field_validator("authorization_prompt_zh", "authorization_prompt_en", "transfer_prompt_zh", "transfer_prompt_en")
    @classmethod
    def default_empty_prompt(cls, value, info):
        if value is not None and not value.strip():
            return getattr(OtherSettingsOut(), info.field_name)
        return value

    @model_validator(mode="after")
    def validate_patch(self) -> "OtherSettingsPatch":
        if not self.model_fields_set:
            raise ValueError("至少提供一个设置项")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("其他设置字段不能为 null")
        return self


class Reviewer360Tag(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: StrictStr
    name_zh: StrictStr = Field(..., max_length=100)
    name_en: StrictStr = Field(default="", max_length=100)
    description_zh: StrictStr = Field(default="", max_length=500)
    description_en: StrictStr = Field(default="", max_length=500)

    @field_validator("id")
    @classmethod
    def normalize_id(cls, value: str) -> str:
        try:
            return str(UUID(value))
        except ValueError as exc:
            raise ValueError("id必须是有效UUID") from exc

    @field_validator("name_zh", "name_en", mode="before")
    @classmethod
    def normalize_name(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_names(self) -> "Reviewer360Tag":
        if not self.name_zh:
            raise ValueError("中文名称不能为空")
        return self


class Reviewer360TagsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tags: list[Reviewer360Tag] = Field(..., max_length=50)
    version: StrictInt = Field(..., ge=0)

    @model_validator(mode="after")
    def validate_unique(self) -> "Reviewer360TagsPayload":
        ids: set[str] = set()
        names_zh: set[str] = set()
        names_en: set[str] = set()
        for tag in self.tags:
            if tag.id in ids:
                raise ValueError("标签ID不能重复")
            ids.add(tag.id)
            zh = tag.name_zh.casefold()
            if zh in names_zh:
                raise ValueError("中文名称不能重复")
            names_zh.add(zh)
            if tag.name_en:
                en = tag.name_en.casefold()
                if en in names_en:
                    raise ValueError("英文名称不能重复")
                names_en.add(en)
        return self


class Reviewer360TagsOut(Reviewer360TagsPayload):
    pass


async def _context(
    context: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
) -> PerformanceAccessContext:
    return context


@router.get("/reviewer-360-tags", response_model=Reviewer360TagsOut)
async def get_reviewer_360_tags(
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> Reviewer360TagsOut:
    setting = await db.get(PerformanceOtherSetting, 1)
    if setting is None:
        return Reviewer360TagsOut(tags=[], version=0)
    return Reviewer360TagsOut(tags=setting.reviewer_360_tags or [], version=setting.reviewer_360_tags_version)


@router.put("/reviewer-360-tags", response_model=Reviewer360TagsOut)
async def update_reviewer_360_tags(
    payload: Reviewer360TagsPayload,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> Reviewer360TagsOut:
    actor = await resolve_trusted_performance_actor(db, context)
    await db.execute(
        insert(PerformanceOtherSetting)
        .values(id=1, **OtherSettingsOut().model_dump(), reviewer_360_tags=[], reviewer_360_tags_version=0,
                updated_by_type=actor.actor_type, updated_by_ref=actor.actor_ref)
        .on_conflict_do_nothing(index_elements=["id"])
    )
    setting = (await db.execute(
        select(PerformanceOtherSetting).where(PerformanceOtherSetting.id == 1).with_for_update()
    )).scalar_one()
    current_tags = setting.reviewer_360_tags or []
    current_version = setting.reviewer_360_tags_version
    if payload.version != current_version:
        raise HTTPException(status_code=409, detail="标签目录版本已变化，请关闭后重新打开")
    normalized = [tag.model_dump() for tag in payload.tags]
    before = {"tags": current_tags, "version": current_version}
    if normalized != current_tags:
        setting.reviewer_360_tags = normalized
        setting.reviewer_360_tags_version = current_version + 1
        after = {"tags": normalized, "version": setting.reviewer_360_tags_version}
        setting.updated_by_type = actor.actor_type
        setting.updated_by_ref = actor.actor_ref
        PerformanceAuditService(db).append_event(AuditEventInput(
            event_type="PERFORMANCE_REVIEWER_360_TAGS_UPDATED", actor_type=actor.actor_type,
            actor_ref=actor.actor_ref, subject_type="OTHER_SETTINGS", subject_ref="1",
            before_state=before, after_state=after,
        ))
    await db.commit()
    await db.refresh(setting)
    return Reviewer360TagsOut(tags=setting.reviewer_360_tags or [], version=setting.reviewer_360_tags_version)


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
