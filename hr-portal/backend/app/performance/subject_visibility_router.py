"""Performance evaluated-person information visibility settings API."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import (
    PerformanceAccessContext,
    require_performance_permission,
    resolve_trusted_performance_actor,
)
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.models import PerformanceSubjectVisibilitySetting
from app.performance.subject_visibility_service import (
    SUBJECT_VISIBILITY_FIELDS,
    SUBJECT_VISIBILITY_ROLE_LABELS,
    SUBJECT_VISIBILITY_ROLES,
    default_subject_visibility_rules,
    normalize_subject_visibility_rules,
)

router = APIRouter(
    prefix="/performance/permission-settings/subject-visibility",
    tags=["performance-subject-visibility-settings"],
)


class SubjectVisibilityFieldOption(BaseModel):
    key: str
    label: str


class SubjectVisibilityRoleOut(BaseModel):
    role_key: str
    role_name: str
    visible_labels: list[str] = Field(default_factory=list)
    visible_fields: list[str]


class SubjectVisibilityPage(BaseModel):
    items: list[SubjectVisibilityRoleOut]
    total: int
    page: int
    page_size: int
    field_options: list[SubjectVisibilityFieldOption]


class SubjectVisibilityPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    visible_fields: list[str] = Field(default_factory=list, max_length=len(SUBJECT_VISIBILITY_FIELDS))

    @field_validator("visible_fields")
    @classmethod
    def validate_fields(cls, values: list[str]) -> list[str]:
        allowed = {key for key, _ in SUBJECT_VISIBILITY_FIELDS}
        result: list[str] = []
        for value in values:
            if value not in allowed:
                raise ValueError("包含不支持的被评估人信息字段")
            if value not in result:
                result.append(value)
        return result


async def _context(
    context: PerformanceAccessContext = Depends(
        require_performance_permission("performance.configuration.manage")
    ),
) -> PerformanceAccessContext:
    return context


def _role(role_key: str, fields: list[str]) -> SubjectVisibilityRoleOut:
    return SubjectVisibilityRoleOut(
        role_key=role_key,
        role_name=SUBJECT_VISIBILITY_ROLE_LABELS[role_key],
        visible_labels=[],
        visible_fields=fields,
    )


def _page(rules: dict[str, list[str]], page: int, page_size: int) -> SubjectVisibilityPage:
    rows = [_role(role_key, rules[role_key]) for role_key, _ in SUBJECT_VISIBILITY_ROLES]
    start = (page - 1) * page_size
    return SubjectVisibilityPage(
        items=rows[start:start + page_size],
        total=len(rows),
        page=page,
        page_size=page_size,
        field_options=[SubjectVisibilityFieldOption(key=key, label=label) for key, label in SUBJECT_VISIBILITY_FIELDS],
    )


@router.get("", response_model=SubjectVisibilityPage)
async def get_subject_visibility_settings(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> SubjectVisibilityPage:
    setting = await db.get(PerformanceSubjectVisibilitySetting, 1)
    rules = normalize_subject_visibility_rules(getattr(setting, "rules", None))
    return _page(rules, page, page_size)


@router.patch("/{role_key}", response_model=SubjectVisibilityRoleOut)
async def update_subject_visibility_setting(
    role_key: str,
    payload: SubjectVisibilityPatch,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> SubjectVisibilityRoleOut:
    if role_key not in SUBJECT_VISIBILITY_ROLE_LABELS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VISIBILITY_ROLE_NOT_FOUND")
    setting = await db.get(PerformanceSubjectVisibilitySetting, 1)
    actor = await resolve_trusted_performance_actor(db, context)
    if setting is None:
        setting = PerformanceSubjectVisibilitySetting(
            id=1,
            rules=default_subject_visibility_rules(),
            updated_by_type=actor.actor_type,
            updated_by_ref=actor.actor_ref,
        )
        db.add(setting)
        await db.flush()
    rules = normalize_subject_visibility_rules(setting.rules)
    before = list(rules[role_key])
    rules[role_key] = list(payload.visible_fields)
    setting.rules = rules
    setting.updated_by_type = actor.actor_type
    setting.updated_by_ref = actor.actor_ref
    if before != rules[role_key]:
        PerformanceAuditService(db).append_event(
            AuditEventInput(
                event_type="PERFORMANCE_SUBJECT_VISIBILITY_UPDATED",
                actor_type=actor.actor_type,
                actor_ref=actor.actor_ref,
                subject_type="SUBJECT_VISIBILITY_ROLE",
                subject_ref=role_key,
                before_state={"visible_fields": before},
                after_state={"visible_fields": rules[role_key]},
            )
        )
    await db.commit()
    await db.refresh(setting)
    return _role(role_key, normalize_subject_visibility_rules(setting.rules)[role_key])
