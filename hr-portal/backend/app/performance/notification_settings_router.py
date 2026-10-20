"""Performance notification settings API."""
from __future__ import annotations

from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends
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
from app.performance.models import PerformanceNotificationSetting

router = APIRouter(
    prefix="/performance/system-settings/notifications",
    tags=["performance-notification-settings"],
)


class TodoTaskRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    frequency: Literal["specified", "daily", "weekly"] = "daily"
    interval: StrictInt = Field(default=1, ge=1, le=365)
    days_before: list[StrictInt] = Field(default_factory=list)
    day_kind: Literal["calendar_day"] = "calendar_day"
    weekdays: list[StrictInt] = Field(default_factory=list)
    time: StrictStr = "10:00"
    timezone: StrictStr = "person"
    suppress_non_working_days: StrictBool = False

    @field_validator("days_before", "weekdays")
    @classmethod
    def normalize_int_list(cls, value: list[StrictInt], info):
        upper = 365 if info.field_name == "days_before" else 7
        lower = 0 if info.field_name == "days_before" else 1
        if any(item < lower or item > upper for item in value):
            raise ValueError(f"{info.field_name} 超出有效范围")
        return sorted(set(value))

    @field_validator("time")
    @classmethod
    def validate_time(cls, value: str) -> str:
        import re
        if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
            raise ValueError("time 必须为 HH:mm")
        return value

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        if value == "person":
            return value
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("timezone 必须为 person 或有效 IANA 时区")
        return value

    @model_validator(mode="after")
    def validate_frequency_fields(self) -> "TodoTaskRule":
        if self.frequency == "specified" and not self.days_before:
            raise ValueError("specified 模式至少需要一个 days_before")
        if self.frequency == "weekly" and not self.weekdays:
            raise ValueError("weekly 模式至少需要一个 weekdays")
        if self.frequency == "specified":
            self.interval = 1
            self.weekdays = []
        elif self.frequency == "daily":
            self.days_before = []
            self.weekdays = []
        else:
            self.days_before = []
        return self


DEFAULT_TODO_TASK_RULE = TodoTaskRule()


class NotificationSettingsOut(BaseModel):
    feishu_push_enabled: bool
    email_enabled: bool
    calibration_delivery_mode: Literal["realtime", "after_calibration"]
    result_change_notification_scope: Literal["final_score_grade", "any_content"]
    todo_task_notification_enabled: bool
    progress_daily_notification_enabled: bool
    stage_start_notification_enabled: bool
    todo_task_rule: TodoTaskRule


class NotificationSettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email_enabled: bool | None = None
    calibration_delivery_mode: Literal["realtime", "after_calibration"] | None = None
    result_change_notification_scope: Literal["final_score_grade", "any_content"] | None = None
    todo_task_notification_enabled: bool | None = None
    progress_daily_notification_enabled: bool | None = None
    stage_start_notification_enabled: bool | None = None
    todo_task_rule: TodoTaskRule | None = None

    @model_validator(mode="after")
    def reject_explicit_null(self) -> "NotificationSettingsPatch":
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("通知设置字段不能为 null")
        return self


async def _context(
    context: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
) -> PerformanceAccessContext:
    return context


def _response(setting: PerformanceNotificationSetting) -> NotificationSettingsOut:
    return NotificationSettingsOut(
        feishu_push_enabled=setting.feishu_push_enabled,
        email_enabled=setting.email_enabled,
        calibration_delivery_mode=setting.calibration_delivery_mode,
        result_change_notification_scope=setting.result_change_notification_scope,
        todo_task_notification_enabled=setting.todo_task_notification_enabled,
        progress_daily_notification_enabled=setting.progress_daily_notification_enabled,
        stage_start_notification_enabled=setting.stage_start_notification_enabled,
        todo_task_rule=TodoTaskRule.model_validate(setting.todo_task_rule or DEFAULT_TODO_TASK_RULE.model_dump()),
    )


def _defaults() -> NotificationSettingsOut:
    return NotificationSettingsOut(
        feishu_push_enabled=True,
        email_enabled=False,
        calibration_delivery_mode="realtime",
        result_change_notification_scope="final_score_grade",
        todo_task_notification_enabled=True,
        progress_daily_notification_enabled=True,
        stage_start_notification_enabled=True,
        todo_task_rule=DEFAULT_TODO_TASK_RULE.model_copy(deep=True),
    )


@router.get("", response_model=NotificationSettingsOut)
async def get_notification_settings(
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> NotificationSettingsOut:
    setting = await db.get(PerformanceNotificationSetting, 1)
    if setting is None:
        return _defaults()
    return _response(setting)


@router.patch("", response_model=NotificationSettingsOut)
async def update_notification_settings(
    payload: NotificationSettingsPatch,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> NotificationSettingsOut:
    actor = await resolve_trusted_performance_actor(db, context)
    await db.execute(
        insert(PerformanceNotificationSetting)
        .values(
            id=1,
            **_defaults().model_dump(mode="json"),
            updated_by_type=actor.actor_type,
            updated_by_ref=actor.actor_ref,
        )
        .on_conflict_do_nothing(index_elements=["id"])
    )
    setting = (
        await db.execute(
            select(PerformanceNotificationSetting)
            .where(PerformanceNotificationSetting.id == 1)
            .with_for_update()
        )
    ).scalar_one()
    before = _response(setting).model_dump()
    for field in payload.model_fields_set:
        value = getattr(payload, field)
        setattr(setting, field, value.model_dump(mode="json") if isinstance(value, TodoTaskRule) else value)

    setting.updated_by_type = actor.actor_type
    setting.updated_by_ref = actor.actor_ref
    after = _response(setting).model_dump()
    if before != after:
        PerformanceAuditService(db).append_event(
            AuditEventInput(
                event_type="PERFORMANCE_NOTIFICATION_SETTING_UPDATED",
                actor_type=actor.actor_type,
                actor_ref=actor.actor_ref,
                subject_type="NOTIFICATION_SETTINGS",
                subject_ref="1",
                before_state=before,
                after_state=after,
            )
        )
    await db.commit()
    await db.refresh(setting)
    return _response(setting)
