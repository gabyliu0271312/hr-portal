"""Performance other permission settings API."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import (
    PerformanceAccessContext,
    require_performance_permission,
    resolve_trusted_performance_actor,
)
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.cycles_router import HrbpOrganizationNode, _load_hrbp_options
from app.performance.models import PerformanceOtherPermissionSetting

router = APIRouter(prefix="/performance/permission-settings/other", tags=["performance-other-permission-settings"])

MANAGER_REMINDER_NODE_TYPES = (
    "work_summary",
    "evaluation",
    "result_communication",
    "result_view",
)
DEFAULT_MANAGER_REMINDER_NODE_TYPES = list(MANAGER_REMINDER_NODE_TYPES)


class OtherPermissionPersonOut(BaseModel):
    employee_no: str
    display_name: str


class OtherPermissionHrbpPermissionOut(BaseModel):
    hrbp: OtherPermissionPersonOut
    scope: list[str]
    invisible_people: list[OtherPermissionPersonOut]


class OtherPermissionHrbpPermissionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hrbp: str = Field(..., min_length=1, max_length=64)
    scope: list[str] = Field(default_factory=list, max_length=100)
    invisible_people: list[str] = Field(default_factory=list, max_length=500)

    @field_validator("hrbp")
    @classmethod
    def normalize_hrbp(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("HRBP 不能为空")
        return value

    @field_validator("scope", "invisible_people")
    @classmethod
    def normalize_refs(cls, values: list[str]) -> list[str]:
        return list(dict.fromkeys(value.strip() for value in values if value.strip()))


class OtherPermissionSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    hrbp_invisible_scope_enabled: bool
    hrbp_invisible_people: list[OtherPermissionPersonOut]
    hrbp_permissions: list[OtherPermissionHrbpPermissionOut]
    people_options: list[OtherPermissionPersonOut]
    organization_tree: list[HrbpOrganizationNode]
    manager_reminder_enabled: bool
    manager_reminder_node_types: list[str]


class OtherPermissionSettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hrbp_invisible_scope_enabled: bool | None = None
    hrbp_invisible_people: list[str] | None = Field(default=None, max_length=500)
    hrbp_permissions: list[OtherPermissionHrbpPermissionPayload] | None = Field(default=None, max_length=500)
    manager_reminder_enabled: bool | None = None
    manager_reminder_node_types: list[str] | None = Field(default=None, max_length=len(MANAGER_REMINDER_NODE_TYPES))

    @field_validator("hrbp_invisible_people")
    @classmethod
    def normalize_people(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None
        return list(dict.fromkeys(value.strip() for value in values if value.strip()))

    @field_validator("manager_reminder_node_types")
    @classmethod
    def normalize_node_types(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None
        result: list[str] = []
        for value in values:
            if value not in MANAGER_REMINDER_NODE_TYPES:
                raise ValueError("包含不支持的可催办环节类型")
            if value not in result:
                result.append(value)
        return result


async def _context(
    context: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
) -> PerformanceAccessContext:
    return context


async def _load_options(db: AsyncSession) -> tuple[list[OtherPermissionPersonOut], list[HrbpOrganizationNode]]:
    try:
        options = await _load_hrbp_options(db)
    except Exception:
        return [], []
    people = [OtherPermissionPersonOut(employee_no=item.value, display_name=item.label) for item in options.people]
    return people, options.organization_tree


async def _get_or_create_setting(
    db: AsyncSession,
    context: PerformanceAccessContext,
) -> PerformanceOtherPermissionSetting:
    setting = await db.get(PerformanceOtherPermissionSetting, 1)
    if setting is None:
        actor = await resolve_trusted_performance_actor(db, context)
        setting = PerformanceOtherPermissionSetting(
            id=1,
            hrbp_invisible_scope_enabled=False,
            hrbp_invisible_people=[],
            hrbp_permissions=[],
            manager_reminder_enabled=True,
            manager_reminder_node_types=list(DEFAULT_MANAGER_REMINDER_NODE_TYPES),
            updated_by_type=actor.actor_type,
            updated_by_ref=actor.actor_ref,
        )
        db.add(setting)
        await db.flush()
    return setting


def _person(ref: str, labels: dict[str, str]) -> OtherPermissionPersonOut:
    return OtherPermissionPersonOut(employee_no=ref, display_name=labels.get(ref, ref))


def _selected_people(
    refs: list[str],
    options: list[OtherPermissionPersonOut],
) -> list[OtherPermissionPersonOut]:
    labels = {option.employee_no: option.display_name for option in options}
    return [_person(ref, labels) for ref in refs]


def _serialize_hrbp_permissions(
    raw_permissions: list[Any],
    labels: dict[str, str],
) -> list[OtherPermissionHrbpPermissionOut]:
    result: list[OtherPermissionHrbpPermissionOut] = []
    for raw in raw_permissions:
        if not isinstance(raw, dict):
            continue
        hrbp_ref = str(raw.get("hrbp") or "").strip()
        if not hrbp_ref:
            continue
        scope = [str(value).strip() for value in raw.get("scope", []) if str(value).strip()]
        invisible_refs = [str(value).strip() for value in raw.get("invisible_people", []) if str(value).strip()]
        result.append(
            OtherPermissionHrbpPermissionOut(
                hrbp=_person(hrbp_ref, labels),
                scope=list(dict.fromkeys(scope)),
                invisible_people=[_person(ref, labels) for ref in dict.fromkeys(invisible_refs)],
            )
        )
    return result


async def _response(
    setting: PerformanceOtherPermissionSetting,
    db: AsyncSession,
) -> OtherPermissionSettingsOut:
    people_options, organization_tree = await _load_options(db)
    labels = {person.employee_no: person.display_name for person in people_options}
    permissions = _serialize_hrbp_permissions(list(setting.hrbp_permissions or []), labels)
    legacy_refs = [str(value).strip() for value in (setting.hrbp_invisible_people or []) if str(value).strip()]
    visible_people = permissions[0].invisible_people if permissions else [_person(ref, labels) for ref in legacy_refs]
    return OtherPermissionSettingsOut(
        hrbp_invisible_scope_enabled=setting.hrbp_invisible_scope_enabled,
        hrbp_invisible_people=visible_people,
        hrbp_permissions=permissions,
        people_options=people_options,
        organization_tree=organization_tree,
        manager_reminder_enabled=setting.manager_reminder_enabled,
        manager_reminder_node_types=list(setting.manager_reminder_node_types or DEFAULT_MANAGER_REMINDER_NODE_TYPES),
    )


@router.get("", response_model=OtherPermissionSettingsOut)
async def get_other_permission_settings(
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> OtherPermissionSettingsOut:
    setting = await db.get(PerformanceOtherPermissionSetting, 1)
    if setting is None:
        setting = PerformanceOtherPermissionSetting(
            id=1,
            hrbp_invisible_scope_enabled=False,
            hrbp_invisible_people=[],
            hrbp_permissions=[],
            manager_reminder_enabled=True,
            manager_reminder_node_types=list(DEFAULT_MANAGER_REMINDER_NODE_TYPES),
        )
    return await _response(setting, db)


@router.patch("", response_model=OtherPermissionSettingsOut)
async def update_other_permission_settings(
    payload: OtherPermissionSettingsPatch,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> OtherPermissionSettingsOut:
    setting = await _get_or_create_setting(db, context)
    before = {
        "hrbp_invisible_scope_enabled": setting.hrbp_invisible_scope_enabled,
        "hrbp_invisible_people": list(setting.hrbp_invisible_people or []),
        "hrbp_permissions": list(setting.hrbp_permissions or []),
        "manager_reminder_enabled": setting.manager_reminder_enabled,
        "manager_reminder_node_types": list(setting.manager_reminder_node_types or DEFAULT_MANAGER_REMINDER_NODE_TYPES),
    }
    if payload.hrbp_invisible_scope_enabled is not None:
        setting.hrbp_invisible_scope_enabled = payload.hrbp_invisible_scope_enabled
    if payload.hrbp_permissions is not None:
        serialized = [item.model_dump() for item in payload.hrbp_permissions]
        setting.hrbp_permissions = serialized
        setting.hrbp_invisible_people = list(serialized[0]["invisible_people"]) if serialized else []
    elif payload.hrbp_invisible_people is not None:
        setting.hrbp_invisible_people = list(payload.hrbp_invisible_people)
    if payload.manager_reminder_enabled is not None:
        setting.manager_reminder_enabled = payload.manager_reminder_enabled
    if payload.manager_reminder_node_types is not None:
        setting.manager_reminder_node_types = list(payload.manager_reminder_node_types)
    actor = await resolve_trusted_performance_actor(db, context)
    setting.updated_by_type = actor.actor_type
    setting.updated_by_ref = actor.actor_ref
    PerformanceAuditService(db).append_event(
        AuditEventInput(
            event_type="PERFORMANCE_OTHER_PERMISSION_SETTING_UPDATED",
            actor_type=actor.actor_type,
            actor_ref=actor.actor_ref,
            subject_type="OTHER_PERMISSION_SETTINGS",
            subject_ref="1",
            before_state=before,
            after_state={
                "hrbp_invisible_scope_enabled": setting.hrbp_invisible_scope_enabled,
                "hrbp_invisible_people": list(setting.hrbp_invisible_people),
                "hrbp_permissions": list(setting.hrbp_permissions),
                "manager_reminder_enabled": setting.manager_reminder_enabled,
                "manager_reminder_node_types": list(setting.manager_reminder_node_types),
            },
        )
    )
    await db.commit()
    await db.refresh(setting)
    return await _response(setting, db)
