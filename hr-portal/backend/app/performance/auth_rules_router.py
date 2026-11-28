"""Rule-based performance authorization API (按规则授权)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import false as sa_false, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.data.employee_roster_contract import ORGANIZATION_FIELDS
from app.performance.auth_rule_service import (
    AUTH_RULE_FIELDS as _AUTH_RULE_FIELDS, AuthRuleGroup,
    load_rule_roster_people, resolve_people as _resolve_people,
)
from app.performance.auth_context import PerformanceAccessContext, require_performance_permission, resolve_trusted_performance_actor
from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.models import PerformanceAuthRule, PerformanceAuditEvent, PerformanceRole
from app.performance.scope_options import build_organization_tree

AUTH_RULE_PERMISSION = "performance.authorization.manage"

router = APIRouter(
    prefix="/performance/permission-settings/auth-rules",
    tags=["performance-auth-rules"],
)


async def _context(
    context: PerformanceAccessContext = Depends(
        require_performance_permission(AUTH_RULE_PERMISSION)
    ),
) -> PerformanceAccessContext:
    return context


def _authorizable_role_statement():
    return select(PerformanceRole).where(
        PerformanceRole.role_type == "MANAGEMENT",
        PerformanceRole.is_system.is_(False),
        PerformanceRole.is_active.is_(True),
    )


async def _managed_roles(db: AsyncSession, role_ids: list[int]) -> list[PerformanceRole]:
    roles = list((await db.execute(
        _authorizable_role_statement().where(PerformanceRole.id.in_(role_ids)).order_by(PerformanceRole.id).with_for_update()
    )).scalars().all())
    if len(roles) != len(set(role_ids)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="存在不可授权的角色")
    return roles


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

class AuthRulePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    or_scope: list[AuthRuleGroup] = Field(min_length=1, max_length=100)
    role_id: int = Field(..., gt=0)


class AuthRuleItem(BaseModel):
    id: int
    role_id: int
    role_name: str
    or_scope: list[dict[str, Any]]
    updated_at: datetime
    updated_by: str | None = None


class AuthRulePage(BaseModel):
    items: list[AuthRuleItem]
    total: int
    page: int
    page_size: int


class AuthRuleOptionField(BaseModel):
    key: str
    label: str
    operators: list[str]
    option_source: str


class AuthRuleOptions(BaseModel):
    fields: list[AuthRuleOptionField]
    organization_tree: list[dict[str, Any]]
    people: list[dict[str, str | None]]
    roles: list[dict[str, Any]]
    job_families: list[dict[str, str]]
    position_levels: list[dict[str, str]]
    hire_date_range: dict[str, str | None]
    employee_types: list[dict[str, str]]


class AuthRuleResolveIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    or_scope: list[AuthRuleGroup] = Field(min_length=1, max_length=100)


class AuthRuleResolveOut(BaseModel):
    count: int
    user_ids: list[str]


# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------

async def _load_rule_options(db: AsyncSession) -> dict[str, Any]:
    people = await load_rule_roster_people(db)
    org_rows = [
        {
            "employee_no": person.employee_no,
            "display_name": person.display_name,
            **{field: getattr(person, field, None) for field in ORGANIZATION_FIELDS},
        }
        for person in people
    ]
    job_families: dict[str, dict[str, str]] = {}
    position_levels: dict[str, dict[str, str]] = {}
    employee_types: dict[str, dict[str, str]] = {}
    hire_dates: list[date] = []
    for person in people:
        family = (person.job_family or "").strip()
        if family:
            job_families.setdefault(family, {"value": family, "label": family})
        level = (person.position_level or "").strip()
        if level:
            position_levels.setdefault(level, {"value": level, "label": level})
        emp_type = (person.employee_type or "").strip()
        if emp_type:
            employee_types.setdefault(emp_type, {"value": emp_type, "label": emp_type})
        if person.hire_date is not None:
            hire_dates.append(person.hire_date)
    hire_date_range = {"min": min(hire_dates).isoformat() if hire_dates else None, "max": max(hire_dates).isoformat() if hire_dates else None}
    return {
        "organization_tree": build_organization_tree(org_rows),
        "people": [
            {"value": person.employee_no, "label": f"{person.display_name}（{person.employee_no}）", "department": person.organization_ref}
            for person in people
        ],
        "job_families": list(job_families.values()),
        "position_levels": list(position_levels.values()),
        "employee_types": list(employee_types.values()),
        "hire_date_range": hire_date_range,
    }


@router.get("/options", response_model=AuthRuleOptions)
async def auth_rule_options(
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> AuthRuleOptions:
    options = await _load_rule_options(db)
    roles = list((await db.execute(_authorizable_role_statement().order_by(PerformanceRole.id))).scalars().all())
    return AuthRuleOptions(
        fields=[AuthRuleOptionField(key=key, label=label, operators=operators, option_source=source) for key, label, operators, source in _AUTH_RULE_FIELDS],
        organization_tree=options["organization_tree"],
        people=options["people"],
        roles=[{"id": role.id, "name": role.name, "function_permission_keys": list(role.function_permission_keys or [])} for role in roles],
        job_families=options["job_families"],
        position_levels=options["position_levels"],
        hire_date_range=options["hire_date_range"],
        employee_types=options["employee_types"],
    )


# ---------------------------------------------------------------------------
# Resolve scope (count matched people)
# ---------------------------------------------------------------------------

@router.post("/resolve-scope", response_model=AuthRuleResolveOut)
async def auth_rule_resolve_scope(
    payload: AuthRuleResolveIn,
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> AuthRuleResolveOut:
    people = await load_rule_roster_people(db)
    user_ids = _resolve_people(payload.or_scope, people)
    return AuthRuleResolveOut(count=len(user_ids), user_ids=user_ids)


# ---------------------------------------------------------------------------
# List / Create / Update / Delete
# ---------------------------------------------------------------------------

def _rule_item(rule: PerformanceAuthRule, role_name: str, updated_by: str | None = None) -> AuthRuleItem:
    return AuthRuleItem(
        id=rule.id,
        role_id=rule.role_id,
        role_name=role_name,
        or_scope=rule.or_scope or [],
        updated_at=rule.updated_at,
        updated_by=updated_by,
    )


async def _load_rule_role_map(db: AsyncSession) -> dict[int, str]:
    rows = list((await db.execute(select(PerformanceRole.id, PerformanceRole.name))).all())
    return {role_id: name for role_id, name in rows}


@router.get("/export")
async def export_auth_rules(
    keyword: str | None = None,
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
):
    statement = select(PerformanceAuthRule, PerformanceRole.name).join(
        PerformanceRole, PerformanceRole.id == PerformanceAuthRule.role_id,
    ).where(PerformanceAuthRule.is_active.is_(True))
    if keyword and keyword.strip():
        statement = statement.where(PerformanceRole.name.ilike(f"%{keyword.strip()}%"))
    rows = (await db.execute(statement.order_by(PerformanceAuthRule.id.desc()))).all()
    audit_map = await _latest_rule_updated_by(db, [rule.id for rule, _ in rows])
    items = [_rule_item(rule, role_name, audit_map.get(rule.id)) for rule, role_name in rows]
    return {"items": items, "total": len(items)}


@router.get("", response_model=AuthRulePage)
async def list_auth_rules(
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 10,
    _: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> AuthRulePage:
    if page < 1 or page_size < 1 or page_size > 100:
        raise HTTPException(status_code=422, detail="分页参数无效")
    role_map = await _load_rule_role_map(db)
    statement = select(PerformanceAuthRule).where(PerformanceAuthRule.is_active.is_(True))
    if keyword and keyword.strip():
        needle = keyword.strip().lower()
        matching_role_ids = [
            role_id for role_id, name in role_map.items() if needle in name.lower()
        ]
        if matching_role_ids:
            statement = statement.where(PerformanceAuthRule.role_id.in_(matching_role_ids))
        else:
            statement = statement.where(sa_false())
    total = await db.scalar(select(func.count()).select_from(statement.subquery()))
    rules = list((await db.execute(
        statement.order_by(PerformanceAuthRule.id.desc()).offset((page - 1) * page_size).limit(page_size)
    )).scalars().all())
    audit_map = await _latest_rule_updated_by(db, [rule.id for rule in rules])
    items = [_rule_item(rule, role_map.get(rule.role_id, f"角色#{rule.role_id}"), audit_map.get(rule.id)) for rule in rules]
    return AuthRulePage(items=items, total=total, page=page, page_size=page_size)


async def _latest_rule_updated_by(db: AsyncSession, rule_ids: list[int]) -> dict[int, str]:
    if not rule_ids:
        return {}
    rows = list((await db.execute(
        select(PerformanceAuditEvent.subject_ref, PerformanceAuditEvent.after_state)
        .where(
            PerformanceAuditEvent.subject_type == "PERFORMANCE_AUTH_RULE",
            PerformanceAuditEvent.subject_ref.in_([str(value) for value in rule_ids]),
        )
        .order_by(PerformanceAuditEvent.event_at.desc(), PerformanceAuditEvent.id.desc())
    )).all())
    result: dict[int, str] = {}
    for subject_ref, after_state in rows:
        ref = int(subject_ref)
        if ref not in result:
            result[ref] = (after_state or {}).get("updated_by") if after_state else None
    return result


@router.post("", response_model=AuthRuleItem, status_code=status.HTTP_201_CREATED)
async def create_auth_rule(
    payload: AuthRulePayload,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> AuthRuleItem:
    roles = await _managed_roles(db, [payload.role_id])
    actor = await resolve_trusted_performance_actor(db, context)
    rule = PerformanceAuthRule(
        or_scope=[group.model_dump() for group in payload.or_scope],
        role_id=payload.role_id,
        created_by_type=actor.actor_type,
        created_by_ref=actor.actor_ref,
        updated_by_type=actor.actor_type,
        updated_by_ref=actor.actor_ref,
    )
    db.add(rule)
    await db.flush()
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PERFORMANCE_AUTH_RULE_CREATED",
        actor_type=actor.actor_type,
        actor_ref=actor.actor_ref,
        subject_type="PERFORMANCE_AUTH_RULE",
        subject_ref=str(rule.id),
        after_state={"updated_by": context.display_name, "role_id": payload.role_id, "or_scope": [group.model_dump() for group in payload.or_scope]},
    ))
    await db.commit()
    return _rule_item(rule, roles[0].name, context.display_name)


@router.put("/{rule_id}", response_model=AuthRuleItem)
async def update_auth_rule(
    rule_id: int,
    payload: AuthRulePayload,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> AuthRuleItem:
    rule = await db.scalar(select(PerformanceAuthRule).where(
        PerformanceAuthRule.id == rule_id, PerformanceAuthRule.is_active.is_(True),
    ).with_for_update())
    if rule is None:
        raise HTTPException(status_code=404, detail="规则不存在")
    roles = await _managed_roles(db, [payload.role_id])
    actor = await resolve_trusted_performance_actor(db, context)
    before_state = {"role_id": rule.role_id, "or_scope": rule.or_scope or []}
    rule.or_scope = [group.model_dump() for group in payload.or_scope]
    rule.role_id = payload.role_id
    rule.updated_by_type = actor.actor_type
    rule.updated_by_ref = actor.actor_ref
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PERFORMANCE_AUTH_RULE_UPDATED",
        actor_type=actor.actor_type,
        actor_ref=actor.actor_ref,
        subject_type="PERFORMANCE_AUTH_RULE",
        subject_ref=str(rule.id),
        before_state=before_state,
        after_state={"updated_by": context.display_name, "role_id": payload.role_id, "or_scope": [group.model_dump() for group in payload.or_scope]},
    ))
    await db.commit()
    return _rule_item(rule, roles[0].name, context.display_name)


@router.delete("/{rule_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def delete_auth_rule(
    rule_id: int,
    context: PerformanceAccessContext = Depends(_context),
    db: AsyncSession = Depends(get_session),
) -> None:
    rule = await db.scalar(select(PerformanceAuthRule).where(
        PerformanceAuthRule.id == rule_id, PerformanceAuthRule.is_active.is_(True),
    ).with_for_update())
    if rule is None:
        raise HTTPException(status_code=404, detail="规则不存在")
    actor = await resolve_trusted_performance_actor(db, context)
    PerformanceAuditService(db).append_event(AuditEventInput(
        event_type="PERFORMANCE_AUTH_RULE_DELETED",
        actor_type=actor.actor_type,
        actor_ref=actor.actor_ref,
        subject_type="PERFORMANCE_AUTH_RULE",
        subject_ref=str(rule.id),
        before_state={"role_id": rule.role_id, "or_scope": rule.or_scope or []},
    ))
    rule.is_active = False
    await db.commit()
